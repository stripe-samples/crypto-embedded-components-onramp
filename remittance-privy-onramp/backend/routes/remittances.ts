import express, { Request, Response } from 'express';
import {
  isEmbeddedWalletLinkedAccount,
  type LinkedAccount,
  type LinkedAccountEmbeddedWallet,
  type PrivyClient,
  type PrivyWalletsService,
  type User,
} from '@privy-io/node';
import * as db from '../db/store.js';
import { stripeCallWithRetry, toUserError } from '../utils/stripeApiHelper.js';
import { errorMessage } from '../utils/errors.js';
import { getPrivyClient } from '../utils/privy.js';

const router = express.Router();

const PRIVY_APP_AUTHORIZATION_PRIVATE_KEY = process.env.PRIVY_APP_AUTHORIZATION_PRIVATE_KEY;
const USDC_CONTRACT_ADDRESS = process.env.USDC_CONTRACT_ADDRESS;
const PRIVY_CAIP2 = process.env.PRIVY_CAIP2 ?? 'eip155:84532';
const PRIVY_SPONSOR_GAS = process.env.PRIVY_SPONSOR_GAS !== 'false';
const REMITTANCE_ONRAMP_NETWORK = process.env.REMITTANCE_ONRAMP_NETWORK ?? 'tempo';

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
      transaction_details?: {
        transaction_id?: string;
      };
    };
  };
};

function deliveryTransferHash(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const transactionDetails = (value as Record<string, unknown>).transaction_details;
  if (!transactionDetails || typeof transactionDetails !== 'object') return undefined;
  const transactionId = (transactionDetails as Record<string, unknown>).transaction_id;
  return typeof transactionId === 'string' && transactionId ? transactionId : undefined;
}

function assertEvmAddress(address: string, label: string) {
  if (!isEvmAddress(address)) {
    throw new Error(`${label} must be a valid EVM address`);
  }
}

function isEvmAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
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

function isEthereumEmbeddedWalletWithId(account: LinkedAccount): account is EthereumEmbeddedWalletWithId {
  return (
    isEmbeddedWalletLinkedAccount(account) &&
    account.chain_type === 'ethereum' &&
    Boolean(account.address) &&
    Boolean(account.id)
  );
}

function findEthereumEmbeddedWalletByAddress(user: User, address: string): EthereumEmbeddedWalletWithId | undefined {
  const normalizedAddress = address.toLowerCase();
  return user.linked_accounts
    ?.filter(isEthereumEmbeddedWalletWithId)
    .find(account => account.address.toLowerCase() === normalizedAddress);
}

function remittanceWalletToApi(record: db.RemittanceWalletRecord) {
  return {
    walletAddress: record.walletAddress,
    network: record.network,
    status: 'ready',
  };
}

function toApi(record: db.RemittanceRecord, deliveryHash?: string) {
  return {
    id: record.id,
    onrampSessionId: record.onrampSessionId,
    status: record.status,
    walletAddress: record.walletAddress,
    network: record.network,
    payoutDestinationAddress: record.offrampDestinationAddress,
    deliveryTransferHash: deliveryHash,
    transferHash: record.transferHash,
    error: record.error,
  };
}

async function requireOwnedRemittance(req: Request, res: Response) {
  const user = await db.getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const remittanceId = String(req.params.remittanceId);
  const record = await db.getRemittance(remittanceId);
  if (!record) {
    res.status(404).json({ error: 'Remittance not found' });
    return null;
  }

  if (record.ownerPrivyUserId !== user.privyUserId) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return { user, record };
}

router.post('/remittance_wallet', async (req: Request, res: Response) => {
  try {
    const user = await db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      wallet_address,
      privy_user_id,
      privy_wallet_id,
      network,
    } = req.body as {
      wallet_address?: string;
      privy_user_id?: string;
      privy_wallet_id?: string;
      network?: string;
    };

    if (!wallet_address || !privy_user_id || !privy_wallet_id) {
      return res.status(400).json({
        error: 'wallet_address, privy_user_id, and privy_wallet_id are required',
      });
    }
    assertEvmAddress(wallet_address, 'wallet address');
    if (network && network !== REMITTANCE_ONRAMP_NETWORK) {
      return res.status(400).json({
        error: `Wallet network must match configured remittance network ${REMITTANCE_ONRAMP_NETWORK}`,
      });
    }
    if (user.privyUserId && user.privyUserId !== privy_user_id) {
      return res.status(403).json({ error: 'Privy wallet does not belong to the authenticated user' });
    }

    const privy = getPrivyClient();
    const privyUser = await privy.users()._get(privy_user_id);
    const linkedWallet = findEthereumEmbeddedWalletByAddress(privyUser, wallet_address);
    if (!linkedWallet || linkedWallet.id !== privy_wallet_id) {
      return res.status(400).json({ error: 'Privy wallet is not linked to the authenticated user' });
    }

    const wallet = await db.registerRemittanceWallet({
      ownerPrivyUserId: user.privyUserId,
      walletAddress: linkedWallet.address,
      network: REMITTANCE_ONRAMP_NETWORK,
      privyWalletId: privy_wallet_id,
    });

    console.log(`[remittance_wallet] attached: ${wallet.walletAddress}`);
    res.json(remittanceWalletToApi(wallet));
  } catch (err: unknown) {
    const message = errorMessage(err);
    console.error('[remittance_wallet] failed:', err);
    res.status(500).json({ error: message });
  }
});

router.post('/remittances', async (req: Request, res: Response) => {
  try {
    const user = await db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const record = await db.getRecord(user.privyUserId);
    if (!record) return res.status(404).json({ error: 'User not found' });
    const {
      payment_token, source_amount, source_currency,
      destination_currency, destination_network, destination_networks,
      wallet_address, crypto_customer_id, customer_ip_address, settlement_speed,
      payout_destination_address,
    } = req.body;

    if (typeof payout_destination_address !== 'string' || !payout_destination_address.trim()) {
      return res.status(400).json({ error: 'payout_destination_address is required' });
    }
    const payoutDestinationAddress = payout_destination_address.trim();
    if (!isEvmAddress(payoutDestinationAddress)) {
      return res.status(400).json({ error: 'payout_destination_address must be a valid EVM address' });
    }

    const remittanceWallet = await db.getRemittanceWalletForDestination(
      user.privyUserId,
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

    const remittance = await db.createRemittance({
      ownerPrivyUserId: user.privyUserId,
      remittanceWalletId: remittanceWallet.id,
      onrampSessionId: data.id,
      walletAddress: remittanceWallet.walletAddress,
      network: remittanceWallet.network,
      privyWalletId: remittanceWallet.privyWalletId,
      offrampDestinationAddress: payoutDestinationAddress,
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
    const result = await requireOwnedRemittance(req, res);
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
    const result = await requireOwnedRemittance(req, res);
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
  try {
    const result = await requireOwnedRemittance(req, res);
    if (!result) return;
    let { record } = result;

    if (req.query.sync === 'stripe') {
      const userRecord = await db.getRecord(result.user.privyUserId);
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
          record = (await db.markRemittanceFulfilled(record.id))!;
        }
        return res.json({
          ...toApi(record, deliveryTransferHash(stripeResult.data)),
          stripeStatus: status,
        });
      }
    }

    res.json(toApi(record));
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/webhooks/stripe', async (req: Request, res: Response) => {
  try {
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

    const record = await db.getRemittanceByOnrampSession(sessionId);
    if (!record) return res.json({ received: true, ignored: true, reason: 'no local remittance record' });

    const updated = await db.markRemittanceFulfilled(record.id);
    res.json({
      received: true,
      remittance: toApi(updated!, deliveryTransferHash(event.data?.object)),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.post('/remittances/:remittanceId/transfer', async (req: Request, res: Response) => {
  const remittanceId = String(req.params.remittanceId);
  let transferClaimed = false;
  try {
    const result = await requireOwnedRemittance(req, res);
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

    const remittanceWallet = await db.getRemittanceWallet(record.remittanceWalletId);
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

    const claimedRecord = await db.claimRemittanceTransfer(record.id);
    if (!claimedRecord) {
      return res.status(409).json({ error: 'Payout handoff is already in progress or complete' });
    }
    transferClaimed = true;

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
      idempotency_key: `remittance-${record.id}-offramp-transfer-${claimedRecord.transferAttemptCount}`,
    } satisfies PrivyWalletsService.RpcInput;

    const response = await privy.wallets().rpc(remittanceWallet.privyWalletId, transferInput);
    const hash = response.data.hash;
    const updated = await db.updateRemittance(record.id, {
      status: 'transfer_submitted',
      transferHash: hash,
      error: null,
    });

    res.json(toApi(updated!));
  } catch (err: unknown) {
    const parsedError = parseNestedPrivyError(errorMessage(err));
    const message = parsedError.message;
    console.error('[remittance] payout transfer failed:', errorDetails(err));
    const record = transferClaimed ? await db.getRemittance(remittanceId) : undefined;
    if (record) {
      await db.updateRemittance(record.id, {
        status: 'transfer_failed',
        error: message,
      });
    }
    res.status(500).json({ error: message, code: parsedError.code });
  }
});

export default router;
