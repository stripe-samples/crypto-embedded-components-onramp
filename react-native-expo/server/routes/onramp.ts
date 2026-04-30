import express, { Request, Response } from 'express';
import * as db from '../db/store';
import { stripeCallWithRetry, toUserError } from '../utils/stripeApiHelper';

const router = express.Router();

// Retrieve a CryptoCustomer and their KYC/identity verification status
// Stripe API: GET https://api.stripe.com/v1/crypto/customers/{customerId}
router.get('/crypto_customer/:customerId', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
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

    const verifications = data.verifications ?? [];
    const kycStatus = verifications.find((v: any) => v.name === 'kyc_verified')?.status ?? 'not_started';
    const idDocStatus = verifications.find((v: any) => v.name === 'id_document_verified')?.status ?? 'not_started';

    res.json({
      customerId: data.id,
      providedFields: data.provided_fields ?? [],
      kycStatus,
      idDocStatus,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

    const { response, data } = await stripeCallWithRetry(
      `/crypto/customers/${req.params.customerId}/crypto_consumer_wallets`,
      new URLSearchParams(),
      record,
      'GET',
    );

    if (!response.ok) {
      console.error('[stripe] list wallets failed:', JSON.stringify(data.error ?? data));
      return res.status(response.status).json({ error: toUserError(data) });
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

    const { response, data } = await stripeCallWithRetry(
      `/crypto/customers/${req.params.customerId}/payment_tokens`,
      new URLSearchParams(),
      record,
      'GET',
    );

    if (!response.ok) {
      console.error('[stripe] list payment tokens failed:', JSON.stringify(data.error ?? data));
      return res.status(response.status).json({ error: toUserError(data) });
    }

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
      console.error('[stripe] create_onramp_session failed:', JSON.stringify(data.error ?? data));
      return res.status(response.status).json({ error: toUserError(data) });
    }

    console.log(`[onramp] created session ${data.id}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

    const { response, data } = await stripeCallWithRetry(
      `/crypto/onramp_sessions/${cos_id}/quote`,
      new URLSearchParams(),
      record,
    );

    if (!response.ok) {
      console.error('[stripe] refresh_quote failed:', JSON.stringify(data.error ?? data));
      return res.status(response.status).json({ error: toUserError(data) });
    }

    console.log(`[onramp] refreshed quote for session ${cos_id}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

    const quoteResult = await stripeCallWithRetry(`/crypto/onramp_sessions/${cos_id}/quote`, new URLSearchParams(), record);
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
      const qr = await stripeCallWithRetry(`/crypto/onramp_sessions/${cos_id}/quote`, new URLSearchParams(), record);
      if (!qr.response.ok && qr.data?.error?.code !== 'crypto_onramp_locked_state_change') {
        console.warn('[stripe] pre-retry quote refresh failed:', JSON.stringify(qr.data.error ?? qr.data));
      }
    };

    const { response, data } = await stripeCallWithRetry(`/crypto/onramp_sessions/${cos_id}/checkout`, body, record, 'POST', refreshQuote);

    if (!response.ok) {
      console.error('[stripe] checkout failed:', JSON.stringify(data.error ?? data));
      return res.status(response.status).json({ error: toUserError(data) });
    }

    console.log(`[onramp] checked out session ${cos_id}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
