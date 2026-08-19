import express, { Request, Response } from 'express';
import * as db from '../db/store';
import { stripe, requestOptions, callWithRetry, toUserError } from '../utils/stripeApiHelper';

const router = express.Router();

function statusCodeOf(error: any): number {
  return error?.statusCode ?? 500;
}

// Retrieve a CryptoCustomer and their KYC/identity verification status
// Stripe API: GET https://api.stripe.com/v1/crypto/customers/{customerId}
router.get('/crypto_customer/:customerId', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const record = db.getRecord(user.email);
    if (!record) return res.status(404).json({ error: 'User not found' });

    const customerId = req.params.customerId as string;
    const data = await callWithRetry(
      oauthToken => stripe.crypto.customers.retrieve(customerId, {}, requestOptions(oauthToken)),
      record,
    );

    const kycTiers = data.kyc_tiers ?? [];
    const kycRegion = data.kyc_region ?? null;
    const verifications = data.verifications ?? [];
    const provided_fields = data.provided_fields ?? [];

    // Derive kyc_level from kyc_tiers.
    // Mirrors the logic in react-web/server/index.ts GET /api/crypto/customers/:customerId.
    const INACTIVE = new Set(['not_available', 'not_started']);
    const ATTEMPTED = new Set(['pending', 'rejected', 'verified']);
    const statusOf = (tier: string) =>
      kycTiers.find(t => t.tier === tier)?.verification_status ?? 'not_started';

    let kyc_level: string;
    if (kycTiers.some(t => t.verification_status === 'pending')) {
      kyc_level = 'PENDING';
    } else if (kycTiers.every(t => INACTIVE.has(t.verification_status))) {
      kyc_level = 'REQUIRES_KYC';
    } else {
      const currentTier =
        ATTEMPTED.has(statusOf('l2')) ? 'l2' :
        ATTEMPTED.has(statusOf('l1')) ? 'l1' : 'l0';
      const currentStatus = statusOf(currentTier);
      if (currentStatus === 'verified') {
        kyc_level = currentTier === 'l2' ? 'L2' : currentTier === 'l1' ? 'L1' : 'L0';
      } else if (currentStatus === 'rejected') {
        kyc_level = 'REJECTED';
      } else {
        kyc_level = 'REQUIRES_KYC';
      }
    }

    res.json({
      customerId: data.id,
      // livemode isn't in this alpha SDK's typed Customer response yet, but the API returns it.
      livemode: (data as any).livemode,
      kyc_level,
      kyc_region: kycRegion,
      kycTiers,
      verifications,
      provided_fields,
    });
  } catch (err: any) {
    console.error('[stripe] get crypto customer failed:', err?.raw ?? err.message);
    res.status(statusCodeOf(err)).json({ error: toUserError(err) });
  }
});

// List a customer's registered crypto wallets
// Stripe API: GET https://api.stripe.com/v1/crypto/customers/{customerId}/crypto_consumer_wallets
router.get('/crypto_customer/:customerId/wallets', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const record = db.getRecord(user.email);
    if (!record) return res.status(404).json({ error: 'User not found' });

    const customerId = req.params.customerId as string;
    const data = await callWithRetry(
      oauthToken => stripe.crypto.customers.listConsumerWallets(customerId, {}, requestOptions(oauthToken)),
      record,
    );

    res.json(data);
  } catch (err: any) {
    console.error('[stripe] list wallets failed:', err?.raw ?? err.message);
    res.status(statusCodeOf(err)).json({ error: toUserError(err) });
  }
});

// List a customer's saved payment methods
// Stripe API: GET https://api.stripe.com/v1/crypto/customers/{customerId}/payment_tokens
router.get('/crypto_customer/:customerId/payment_tokens', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const record = db.getRecord(user.email);
    if (!record) return res.status(404).json({ error: 'User not found' });

    const customerId = req.params.customerId as string;
    const data = await callWithRetry(
      oauthToken => stripe.crypto.customers.listPaymentTokens(customerId, {}, requestOptions(oauthToken)),
      record,
    );

    res.json(data);
  } catch (err: any) {
    console.error('[stripe] list payment tokens failed:', err?.raw ?? err.message);
    res.status(statusCodeOf(err)).json({ error: toUserError(err) });
  }
});

// Fetch the customer's current transaction limits.
//
// Stripe API: GET https://api.stripe.com/v1/crypto/onramp_transaction_limits
//
// Optional query params forwarded to Stripe:
//   wallet_address, destination_network, customer_ip_address
//
// Response shape (actual Stripe API):
//   {
//     object: "crypto.onramp_transaction_limits",
//     crypto_customer_id: "crc_...",
//     limits: {
//       "usd.fiat": {
//         card: [{ limit: 3000, settlement_speed: "instant" }],
//         us_bank_account: [{ limit: 5000, settlement_speed: "standard" }, ...]
//       }
//     }
//   }
//
// The `limit` fields are per-transaction maximums based on the customer's KYC
// tier. Higher tiers (more verification) yield higher limits.
router.get('/crypto/onramp_transaction_limits', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const record = db.getRecord(user.email);
    if (!record) return res.status(404).json({ error: 'User not found' });

    const { wallet_address, destination_network, customer_ip_address } = req.query as Record<string, string>;

    const data = await callWithRetry(
      oauthToken => stripe.crypto.onrampTransactionLimits.retrieve(
        {
          wallet_address,
          destination_network,
          // Fall back to a default IP if none provided — required for limit resolution.
          customer_ip_address: customer_ip_address ?? '127.0.0.1',
        },
        requestOptions(oauthToken),
      ),
      record,
    );

    res.json(data);
  } catch (err: any) {
    console.error('[stripe] get onramp_transaction_limits failed:', err?.raw ?? err.message);
    res.status(statusCodeOf(err)).json({ error: toUserError(err) });
  }
});

// Create a crypto onramp session
// Stripe API: POST https://api.stripe.com/v1/crypto/onramp_sessions
router.post('/create_onramp_session', async (req: Request, res: Response) => {
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

    const nets: string[] = destination_networks ?? [destination_network];

    const data = await callWithRetry(
      oauthToken => stripe.crypto.onrampSessions.create(
        {
          // crypto_customer_id, payment_token, wallet_address, and ui_mode aren't
          // in this alpha SDK's typed params yet, so this cast mirrors the extra-param
          // pattern the other server SDKs use for the same beta fields.
          ui_mode: 'headless',
          crypto_customer_id,
          payment_token,
          source_amount,
          source_currency,
          destination_currency,
          destination_currencies: [destination_currency],
          destination_network,
          destination_networks: nets.filter(Boolean),
          wallet_address,
          customer_ip_address,
          ...(settlement_speed ? { settlement_speed } : {}),
        } as any,
        requestOptions(oauthToken),
      ),
      record,
    );

    console.log(`[onramp] created session ${data.id}`);
    res.json(data);
  } catch (err: any) {
    console.error('[stripe] create_onramp_session failed:', err?.raw ?? err.message);
    res.status(statusCodeOf(err)).json({
      error: toUserError(err),
      code: err?.code ?? 'ERROR_CODE_UNKNOWN',
    });
  }
});

// Refresh quote for an onramp session
// Stripe API: POST https://api.stripe.com/v1/crypto/onramp_sessions/{sessionId}/quote
router.post('/refresh_quote', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const record = db.getRecord(user.email);
    if (!record) return res.status(404).json({ error: 'User not found' });

    const { cos_id } = req.body;

    const data = await callWithRetry(
      oauthToken => stripe.crypto.onrampSessions.quote(cos_id, {}, requestOptions(oauthToken)),
      record,
    );

    console.log(`[onramp] refreshed quote for session ${cos_id}`);
    res.json(data);
  } catch (err: any) {
    console.error('[stripe] refresh_quote failed:', err?.raw ?? err.message);
    res.status(statusCodeOf(err)).json({ error: toUserError(err) });
  }
});

// Refresh quote and perform checkout for an onramp session
// Stripe API: POST https://api.stripe.com/v1/crypto/onramp_sessions/{sessionId}/quote
// Stripe API: POST https://api.stripe.com/v1/crypto/onramp_sessions/{sessionId}/checkout
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const record = db.getRecord(user.email);
    if (!record) return res.status(404).json({ error: 'User not found' });

    const { cos_id } = req.body;

    try {
      await callWithRetry(
        oauthToken => stripe.crypto.onrampSessions.quote(cos_id, {}, requestOptions(oauthToken)),
        record,
      );
    } catch (quoteError: any) {
      if (quoteError?.code !== 'crypto_onramp_locked_state_change') {
        console.error('[stripe] pre-checkout quote refresh failed:', quoteError?.raw ?? quoteError.message);
        return res.status(statusCodeOf(quoteError)).json({ error: toUserError(quoteError) });
      }
    }

    const refreshQuote = async () => {
      try {
        await callWithRetry(
          oauthToken => stripe.crypto.onrampSessions.quote(cos_id, {}, requestOptions(oauthToken)),
          record,
        );
      } catch (quoteError: any) {
        if (quoteError?.code !== 'crypto_onramp_locked_state_change') {
          console.warn('[stripe] pre-retry quote refresh failed:', quoteError?.raw ?? quoteError.message);
        }
      }
    };

    const data = await callWithRetry(
      oauthToken => stripe.crypto.onrampSessions.checkout(
        cos_id,
        {
          mandate_data: {
            customer_acceptance: {
              type: 'online',
              accepted_at: Math.trunc(Date.now() / 1000),
              online: {
                ip_address: '127.0.0.1',
                user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6.2 Mobile/15E148 Safari/604.1',
              },
            },
          },
        },
        requestOptions(oauthToken),
      ),
      record,
      refreshQuote,
    );

    console.log(`[onramp] checked out session ${cos_id}`);
    res.json(data);
  } catch (err: any) {
    console.error('[stripe] checkout failed:', err?.raw ?? err.message);
    res.status(statusCodeOf(err)).json({ error: toUserError(err) });
  }
});

export default router;
