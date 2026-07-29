import express, { Request, Response } from 'express';
import {
  PrivyClient,
  isEmbeddedWalletLinkedAccount,
  type LinkedAccount,
  type LinkedAccountEmbeddedWallet,
  type PrivyWalletsService,
  type User,
} from '@privy-io/node';
import * as db from '../db/store';
import { stripeCallWithRetry, toUserError } from '../utils/stripeApiHelper';
import { errorMessage } from '../utils/errors';

const router = express.Router();

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PRIVY_APP_AUTHORIZATION_PRIVATE_KEY = process.env.PRIVY_APP_AUTHORIZATION_PRIVATE_KEY;
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS;
const PRIVY_CAIP2 = process.env.PRIVY_CAIP2 ?? 'eip155:84532';
const PRIVY_WALLET_SIGNER_ID = process.env.PRIVY_WALLET_SIGNER_ID;
const PRIVY_WALLET_POLICY_IDS = process.env.PRIVY_WALLET_POLICY_IDS;
const PRIVY_SPONSOR_GAS = process.env.PRIVY_SPONSOR_GAS !== 'false';
const REMITTANCE_OFFRAMP_DESTINATION_ADDRESS = process.env.REMITTANCE_OFFRAMP_DESTINATION_ADDRESS;
const REMITTANCE_ONRAMP_NETWORK = process.env.REMITTANCE_ONRAMP_NETWORK ?? 'tempo';
const activeTransfers = new Set<string>();

type EthereumWalletCreationInput = {
  chain_type: 'ethereum';
  policy_ids?: string[];
  additional_signers?: Array<{
    signer_id: string;
    override_policy_ids?: string[];
  }>;
};

type EthereumEmbeddedWalletWithId = Extract<LinkedAccountEmbeddedWallet, { chain_type: 'ethereum' }> & {
  id: string;
};

type StripeWebhookPayload = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      onramp_session?: string;
      crypto_onramp_session?: string;
    };
  };
};

function getPrivyClient(): PrivyClient {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET must be set in server/.env');
  }
  return new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });
}

function assertEvmAddress(address: string, label: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`${label} must be a valid EVM address`);
  }
}

function toUnits(amount: string, decimals = 6): bigint {
  if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error('amount must be a positive decimal string');
  const [whole, fraction = ''] = amount.split('.');
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(padded || '0');
}

function formatUnits(amountUnits: bigint, decimals = 6): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amountUnits / divisor;
  const fraction = (amountUnits % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function errorDetails(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const record = err as Record<string, unknown>;
  const details: Record<string, unknown> = {};
  for (const key of ['name', 'message', 'status', 'statusCode', 'code', 'type', 'cause']) {
    if (record[key] !== undefined) details[key] = record[key];
  }
  if (record.body !== undefined) details.body = record.body;
  if (record.response !== undefined) details.response = record.response;
  return JSON.stringify(details);
}

function parseNestedPrivyError(message: string): { message: string; code?: string } {
  const jsonStart = message.indexOf('{');
  if (jsonStart === -1) return { message };

  try {
    const parsed = JSON.parse(message.slice(jsonStart)) as { error?: unknown; code?: unknown };
    return {
      message: typeof parsed.error === 'string' ? parsed.error : message,
      code: typeof parsed.code === 'string' ? parsed.code : undefined,
    };
  } catch {
    return { message };
  }
}

function encodeUsdcTransfer(to: string, amountUnits: bigint): string {
  assertEvmAddress(to, 'offramp destination address');
  const method = 'a9059cbb';
  const encodedTo = to.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const encodedAmount = amountUnits.toString(16).padStart(64, '0');
  return `0x${method}${encodedTo}${encodedAmount}`;
}

function privyBalanceChain(): string {
  switch (PRIVY_CAIP2) {
    case 'eip155:8453':
      return 'base';
    case 'eip155:84532':
      return 'base_sepolia';
    case 'eip155:4217':
      return 'tempo';
    case 'eip155:42431':
      return 'tempo_testnet';
    default:
      throw new Error(`Unsupported PRIVY_CAIP2 for balance lookup: ${PRIVY_CAIP2}`);
  }
}

async function getAvailableUsdcUnits(privy: PrivyClient, walletId: string): Promise<bigint> {
  if (!USDC_CONTRACT_ADDRESS) {
    throw new Error('USDC_CONTRACT_ADDRESS must be set in server/.env');
  }
  const chain = privyBalanceChain();
  const balance = await privy.wallets().balance.get(walletId, {
    token: `${chain}:${USDC_CONTRACT_ADDRESS}`,
  });
  const tokenBalance = balance.balances[0];
  if (!tokenBalance) return 0n;
  if (tokenBalance.raw_value_decimals !== 6) {
    throw new Error(`Expected USDC balance decimals to be 6, got ${tokenBalance.raw_value_decimals}`);
  }
  return BigInt(tokenBalance.raw_value);
}

function configuredPolicyIds(): string[] | undefined {
  const policyIds = PRIVY_WALLET_POLICY_IDS?.split(',').map((id: string) => id.trim()).filter(Boolean);
  return policyIds?.length ? policyIds : undefined;
}

function walletCreationInput(): EthereumWalletCreationInput {
  const input: EthereumWalletCreationInput = {
    chain_type: 'ethereum',
  };
  const policyIds = configuredPolicyIds();
  if (policyIds) input.policy_ids = policyIds;
  if (PRIVY_WALLET_SIGNER_ID) {
    input.additional_signers = [
      {
        signer_id: PRIVY_WALLET_SIGNER_ID,
        ...(policyIds ? { override_policy_ids: policyIds } : {}),
      },
    ];
  }
  return input;
}

function isEthereumEmbeddedWalletWithId(account: LinkedAccount): account is EthereumEmbeddedWalletWithId {
  return (
    isEmbeddedWalletLinkedAccount(account) &&
    account.chain_type === 'ethereum' &&
    Boolean(account.address) &&
    Boolean(account.id)
  );
}

function findEthereumEmbeddedWallet(user: User): EthereumEmbeddedWalletWithId | undefined {
  return user.linked_accounts?.find(isEthereumEmbeddedWalletWithId);
}

async function createOrReusePrivyWallet(ownerEmail: string) {
  if (!REMITTANCE_OFFRAMP_DESTINATION_ADDRESS) {
    throw new Error('REMITTANCE_OFFRAMP_DESTINATION_ADDRESS must be set in server/.env');
  }
  assertEvmAddress(REMITTANCE_OFFRAMP_DESTINATION_ADDRESS, 'offramp destination address');

  const existing = db.getRemittanceWalletForOwner(ownerEmail);
  if (existing) return existing;

  const privy = getPrivyClient();
  let privyUser: User | null;
  try {
    privyUser = await privy.users().getByEmailAddress({ address: ownerEmail });
  } catch {
    privyUser = null;
  }

  if (!privyUser) {
    privyUser = await privy.users().create({
      linked_accounts: [{ type: 'email', address: ownerEmail }],
      wallets: [walletCreationInput()],
    });
  }

  let wallet = findEthereumEmbeddedWallet(privyUser);
  if (!wallet) {
    privyUser = await privy.users().pregenerateWallets(privyUser.id, {
      wallets: [walletCreationInput()],
    });
    wallet = findEthereumEmbeddedWallet(privyUser);
  }

  if (!wallet?.address || !wallet?.id) {
    throw new Error('Privy did not return an embedded Ethereum wallet for the user');
  }

  return db.upsertRemittanceWallet({
    ownerEmail,
    walletAddress: wallet.address,
    network: REMITTANCE_ONRAMP_NETWORK,
    privyUserId: privyUser.id,
    privyWalletId: wallet.id,
    offrampDestinationAddress: REMITTANCE_OFFRAMP_DESTINATION_ADDRESS,
  });
}

function remittanceWalletToApi(record: db.RemittanceWalletRecord) {
  return {
    walletAddress: record.walletAddress,
    network: record.network,
    status: 'ready',
  };
}

function toApi(record: db.RemittanceRecord) {
  return {
    id: record.id,
    onrampSessionId: record.onrampSessionId,
    status: record.status,
    walletAddress: record.walletAddress,
    network: record.network,
    transferHash: record.transferHash,
    error: record.error,
  };
}

function requireOwnedRemittance(req: Request, res: Response) {
  const user = db.getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const remittanceId = String(req.params.remittanceId);
  const record = db.getRemittance(remittanceId);
  if (!record) {
    res.status(404).json({ error: 'Remittance not found' });
    return null;
  }

  if (record.ownerEmail !== user.email) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return { user, record };
}

router.post('/remittance_wallet', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    console.log(`[remittance_wallet] preparing wallet for ${user.email}`);
    const wallet = await createOrReusePrivyWallet(user.email);
    console.log(`[remittance_wallet] ready for ${user.email}: ${wallet.walletAddress}`);
    res.json(remittanceWalletToApi(wallet));
  } catch (err: unknown) {
    const message = errorMessage(err);
    console.error('[remittance_wallet] failed:', err);
    res.status(500).json({ error: message });
  }
});

router.post('/remittances', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const record = db.getRecord(user.email);
    if (!record) return res.status(404).json({ error: 'User not found' });

    const {
      payment_token, source_amount, source_currency,
      destination_currency, destination_network, destination_networks,
      wallet_address, crypto_customer_id, customer_ip_address, settlement_speed,
    } = req.body;

    const remittanceWallet = db.getRemittanceWalletForDestination(
      user.email,
      String(wallet_address),
      String(destination_network),
    );
    if (!remittanceWallet) {
      return res.status(400).json({ error: 'Prepare a remittance wallet before creating the Onramp session' });
    }

    const body = new URLSearchParams();
    body.append('ui_mode', 'headless');
    body.append('payment_token', payment_token);
    body.append('source_amount', source_amount);
    body.append('source_currency', source_currency);
    body.append('destination_currency', destination_currency);
    body.append('destination_network', destination_network);
    body.append('wallet_address', wallet_address);
    body.append('crypto_customer_id', crypto_customer_id);
    body.append('customer_ip_address', customer_ip_address);
    if (settlement_speed) body.append('settlement_speed', settlement_speed);
    const nets: string[] = destination_networks ?? [destination_network];
    nets.forEach(n => { if (n) body.append('destination_networks[]', n); });

    const { response, data } = await stripeCallWithRetry('/crypto/onramp_sessions', body, record);

    if (!response.ok) {
      console.error('[stripe] create onramp session failed:', JSON.stringify(data.error ?? data));
      return res.status(response.status).json({
        error: toUserError(data),
        code: data?.error?.code ?? 'ERROR_CODE_UNKNOWN',
      });
    }
    if (!data.id) {
      return res.status(502).json({ error: 'Stripe did not return an Onramp session ID' });
    }

    const remittance = db.createRemittance({
      ownerEmail: user.email,
      remittanceWalletId: remittanceWallet.id,
      onrampSessionId: data.id,
      walletAddress: remittanceWallet.walletAddress,
      network: remittanceWallet.network,
      privyWalletId: remittanceWallet.privyWalletId,
      privyUserId: remittanceWallet.privyUserId,
      offrampDestinationAddress: remittanceWallet.offrampDestinationAddress,
    });
    console.log(`[remittance] created ${remittance.id} for onramp session ${data.id}`);

    res.json({
      ...toApi(remittance),
      onrampSession: data,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/remittances/:remittanceId/quote', async (req: Request, res: Response) => {
  try {
    const result = requireOwnedRemittance(req, res);
    if (!result) return;

    const { response, data } = await stripeCallWithRetry(
      `/crypto/onramp_sessions/${result.record.onrampSessionId}/quote`,
      new URLSearchParams(),
      result.user,
    );

    if (!response.ok) {
      console.error('[stripe] refresh quote failed:', JSON.stringify(data.error ?? data));
      return res.status(response.status).json({ error: toUserError(data) });
    }

    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/remittances/:remittanceId/checkout', async (req: Request, res: Response) => {
  try {
    const result = requireOwnedRemittance(req, res);
    if (!result) return;
    const { user, record } = result;

    const quoteResult = await stripeCallWithRetry(
      `/crypto/onramp_sessions/${record.onrampSessionId}/quote`,
      new URLSearchParams(),
      user,
    );
    if (!quoteResult.response.ok && quoteResult.data?.error?.code !== 'crypto_onramp_locked_state_change') {
      console.error('[stripe] pre-checkout quote refresh failed:', JSON.stringify(quoteResult.data.error ?? quoteResult.data));
      return res.status(quoteResult.response.status).json({ error: toUserError(quoteResult.data) });
    }

    const body = new URLSearchParams();
    body.append('mandate_data[customer_acceptance][type]', 'online');
    body.append('mandate_data[customer_acceptance][accepted_at]', String(Math.trunc(Date.now() / 1000)));
    body.append('mandate_data[customer_acceptance][online][ip_address]', '127.0.0.1');
    body.append('mandate_data[customer_acceptance][online][user_agent]', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6.2 Mobile/15E148 Safari/604.1');

    const refreshQuote = async () => {
      const qr = await stripeCallWithRetry(
        `/crypto/onramp_sessions/${record.onrampSessionId}/quote`,
        new URLSearchParams(),
        user,
      );
      if (!qr.response.ok && qr.data?.error?.code !== 'crypto_onramp_locked_state_change') {
        console.warn('[stripe] pre-retry quote refresh failed:', JSON.stringify(qr.data.error ?? qr.data));
      }
    };

    const { response, data } = await stripeCallWithRetry(
      `/crypto/onramp_sessions/${record.onrampSessionId}/checkout`,
      body,
      user,
      'POST',
      refreshQuote,
    );

    if (!response.ok) {
      console.error('[stripe] checkout failed:', JSON.stringify(data.error ?? data));
      return res.status(response.status).json({ error: toUserError(data) });
    }

    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.get('/remittances/:remittanceId', async (req: Request, res: Response) => {
  const result = requireOwnedRemittance(req, res);
  if (!result) return;
  let { record } = result;

  if (req.query.sync === 'stripe') {
    const userRecord = db.getRecord(result.user.email);
    if (userRecord) {
      const stripeResult = await stripeCallWithRetry(
        `/crypto/onramp_sessions/${record.onrampSessionId}`,
        new URLSearchParams(),
        userRecord,
        'GET',
      );
      const status = stripeResult.data?.status;
      const fulfilledStatuses = ['fulfilled', 'fulfillment_completed', 'fulfillment_complete', 'succeeded', 'complete'];
      if (stripeResult.response.ok && status && fulfilledStatuses.includes(status)) {
        record = db.updateRemittance(record.id, {
          status: 'onramp_fulfilled',
          error: undefined,
        })!;
      }
      return res.json({ ...toApi(record), stripeStatus: status });
    }
  }

  res.json(toApi(record));
});

router.post('/webhooks/stripe', (req: Request, res: Response) => {
  const event = req.body as StripeWebhookPayload;
  const sessionId =
    event?.data?.object?.id ??
    event?.data?.object?.onramp_session ??
    event?.data?.object?.crypto_onramp_session;

  if (event?.type !== 'crypto.onramp_session.fulfillment_completed' && event?.type !== 'fulfillment_completed') {
    return res.json({ received: true, ignored: true });
  }

  if (!sessionId) {
    return res.status(400).json({ error: 'Could not determine Onramp session ID from webhook payload' });
  }

  const record = db.getRemittanceByOnrampSession(sessionId);
  if (!record) return res.json({ received: true, ignored: true, reason: 'no local remittance record' });

  const updated = db.updateRemittance(record.id, { status: 'onramp_fulfilled', error: undefined });
  res.json({ received: true, remittance: toApi(updated!) });
});

router.post('/remittances/:remittanceId/transfer', async (req: Request, res: Response) => {
  const remittanceId = String(req.params.remittanceId);
  if (activeTransfers.has(remittanceId)) {
    return res.status(409).json({ error: 'Payout handoff is already in progress' });
  }
  activeTransfers.add(remittanceId);
  try {
    const result = requireOwnedRemittance(req, res);
    if (!result) return;
    const { record } = result;

    const { amount, currency } = req.body;
    if ((currency ?? '').toLowerCase() !== 'usdc') {
      return res.status(400).json({ error: 'Only USDC transfers are supported in this sample' });
    }
    if (record.status !== 'onramp_fulfilled' && record.status !== 'transfer_failed') {
      return res.status(400).json({
        error: 'Onramp delivery has not been marked fulfilled yet. Poll status or configure the Stripe webhook before moving funds.',
      });
    }
    if (!PRIVY_APP_AUTHORIZATION_PRIVATE_KEY) {
      return res.status(400).json({ error: 'PRIVY_APP_AUTHORIZATION_PRIVATE_KEY must be set in server/.env' });
    }
    if (!USDC_CONTRACT_ADDRESS) {
      return res.status(400).json({ error: 'USDC_CONTRACT_ADDRESS must be set in server/.env' });
    }

    assertEvmAddress(record.offrampDestinationAddress, 'offramp destination address');
    assertEvmAddress(USDC_CONTRACT_ADDRESS, 'USDC contract address');

    const remittanceWallet = db.getRemittanceWallet(record.remittanceWalletId);
    if (!remittanceWallet) return res.status(400).json({ error: 'Remittance wallet record not found' });
    assertEvmAddress(remittanceWallet.walletAddress, 'source wallet address');

    const requestedAmountUnits = toUnits(amount);
    const privy = getPrivyClient();
    const availableAmountUnits = await getAvailableUsdcUnits(privy, remittanceWallet.privyWalletId);
    const amountUnits = requestedAmountUnits > availableAmountUnits ? availableAmountUnits : requestedAmountUnits;
    if (amountUnits <= 0n) {
      return res.status(400).json({ error: 'No USDC balance available to transfer' });
    }
    if (amountUnits < requestedAmountUnits) {
      console.warn(
        `[remittance] requested ${formatUnits(requestedAmountUnits)} USDC, ` +
        `but only ${formatUnits(availableAmountUnits)} USDC is available; transferring available balance`,
      );
    }

    const data = encodeUsdcTransfer(record.offrampDestinationAddress, amountUnits);

    const transferAttemptCount = record.transferAttemptCount + 1;
    db.updateRemittance(record.id, { transferAttemptCount });

    const transferInput = {
      caip2: PRIVY_CAIP2,
      method: 'eth_sendTransaction',
      chain_type: 'ethereum',
      sponsor: PRIVY_SPONSOR_GAS,
      params: {
        transaction: {
          from: remittanceWallet.walletAddress,
          to: USDC_CONTRACT_ADDRESS,
          data,
        },
      },
      authorization_context: {
        authorization_private_keys: [PRIVY_APP_AUTHORIZATION_PRIVATE_KEY],
      },
      idempotency_key: `remittance-${record.id}-offramp-transfer-${transferAttemptCount}`,
    } satisfies PrivyWalletsService.RpcInput;

    const response = await privy.wallets().rpc(remittanceWallet.privyWalletId, transferInput);
    const hash = response.data.hash;
    const updated = db.updateRemittance(record.id, {
      status: 'transfer_submitted',
      transferHash: hash,
      error: undefined,
    });

    res.json(toApi(updated!));
  } catch (err: unknown) {
    const parsedError = parseNestedPrivyError(errorMessage(err));
    const message = parsedError.message;
    console.error('[remittance] payout transfer failed:', errorDetails(err));
    const record = db.getRemittance(remittanceId);
    if (record) {
      db.updateRemittance(record.id, {
        status: 'transfer_failed',
        error: message,
      });
    }
    res.status(500).json({ error: message, code: parsedError.code });
  } finally {
    activeTransfers.delete(remittanceId);
  }
});

export default router;
