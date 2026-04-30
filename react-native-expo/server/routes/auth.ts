import express, { Request, Response } from 'express';
import fetch from 'node-fetch';
import * as db from '../db/store';
import { LINK_API, STRIPE_SECRET_KEY, linkPost } from '../utils/stripeApiHelper';

const router = express.Router();

// Sign up a new user with email and password
router.post('/signup', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const token = db.createUser(email, password);
  if (!token) return res.status(400).json({ error: 'Email already registered' });

  console.log(`[auth] signup: ${email}`);
  res.json({ token });
});

// Log in an existing user
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  const record = db.getRecord(email);
  if (!record) {
    return res.status(404).json({ error: 'Account not found. Please sign up first.' });
  }
  const token = db.authenticateUser(email, password);
  if (!token) return res.status(401).json({ error: 'Incorrect password' });

  console.log(`[auth] login: ${email}`);
  res.json({ token });
});

// Create a LinkAuthIntent for OAuth authorization
// Stripe API: POST https://login.link.com/v1/link_auth_intent
router.post('/create', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { oauth_scopes } = req.body;
    const record = db.getRecord(user.email);
    const data = await linkPost('/link_auth_intent', {
      email: user.email,
      oauth_client_id: process.env.OAUTH_CLIENT_ID,
      oauth_scopes: oauth_scopes ?? 'kyc.status:read,crypto:ramp',
    });

    if (data.error) {
      console.error('[link] create auth intent failed:', JSON.stringify(data.error));
      return res.status(400).json({ error: data.error.message });
    }

    if (record) record.linkAuthIntentId = data.id;

    console.log(`[auth] created auth intent for ${user.email}: ${data.id}`);
    res.json({ authIntentId: data.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Save crypto customer ID and exchange auth intent for OAuth access tokens
// Stripe API: POST https://login.link.com/v1/link_auth_intent/{authIntentId}/tokens
router.post('/save_user', async (req: Request, res: Response) => {
  try {
    const user = db.getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { crypto_customer_id } = req.body;
    const record = db.getRecord(user.email);
    if (!record) return res.status(404).json({ error: 'User not found' });

    record.cryptoCustomerId = crypto_customer_id;

    if (record.linkAuthIntentId && !record.accessToken) {
      const secretKey = STRIPE_SECRET_KEY!;
      const tokenRes = await fetch(`${LINK_API}/link_auth_intent/${record.linkAuthIntentId}/tokens`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      const tokenData: any = await tokenRes.json();
      if (tokenData.access_token) {
        record.accessToken = tokenData.access_token;
        record.refreshToken = tokenData.refresh?.refresh_token ?? null;
        console.log(`[auth] stored OAuth tokens for ${user.email}`);
      } else {
        console.warn('[auth] token exchange failed:', JSON.stringify(tokenData));
      }
    }

    console.log(`[auth] saved customer ${crypto_customer_id} for ${user.email}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
