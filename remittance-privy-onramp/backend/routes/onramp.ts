import express, { Request, Response } from 'express';
import * as db from '../db/store';
import { stripeCallWithRetry, toUserError } from '../utils/stripeApiHelper';
import { errorMessage } from '../utils/errors';

const router = express.Router();

type CustomerVerification = {
  name?: string;
  status?: string;
};

// Retrieve an Onramp customer and their KYC/identity verification status.
// Stripe API: GET https://api.stripe.com/v1/crypto/customers/{customerId}
router.get('/onramp/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const user = await db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const record = db.getRecord(user.email);
    if (!record) return res.status(404).json({ error: 'User not found' });

    const { response, data } = await stripeCallWithRetry(
      `/crypto/customers/${req.params.customerId}`,
      new URLSearchParams(),
      record,
      'GET',
    );

    if (!response.ok) {
      console.error('[stripe] get crypto customer failed:', JSON.stringify(data.error ?? data));
      return res.status(response.status).json({ error: toUserError(data) });
    }

    const verifications = (Array.isArray(data.verifications) ? data.verifications : []) as CustomerVerification[];
    const kycStatus = verifications.find(v => v.name === 'kyc_verified')?.status ?? 'not_started';
    const idDocStatus = verifications.find(v => v.name === 'id_document_verified')?.status ?? 'not_started';

    // kyc_tiers is the authoritative source for determining the customer's
    // current verification tier.
    // Reference: https://docs.stripe.com/crypto/onramp/kyc-integration-guide
    const kycTiers = data.kyc_tiers ?? [];

    res.json({
      customerId: data.id,
      providedFields: data.provided_fields ?? [],
      kycStatus,
      idDocStatus,
      kycTiers,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
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
router.get('/onramp/limits', async (req: Request, res: Response) => {
  try {
    const user = await db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const record = db.getRecord(user.email);
    if (!record) return res.status(404).json({ error: 'User not found' });

    const qs = new URLSearchParams();
    const { wallet_address, destination_network, customer_ip_address } = req.query as Record<string, string>;
    if (wallet_address) qs.append('wallet_address', wallet_address);
    if (destination_network) qs.append('destination_network', destination_network);
    // Fall back to a default IP if none provided — required for limit resolution.
    qs.append('customer_ip_address', customer_ip_address ?? '127.0.0.1');

    const { response, data } = await stripeCallWithRetry('/crypto/onramp_transaction_limits', qs, record, 'GET');

    if (!response.ok) {
      console.error('[stripe] get onramp_transaction_limits failed:', JSON.stringify(data.error ?? data));
      return res.status(response.status).json({ error: toUserError(data) });
    }

    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

export default router;
