# Crypto Onramp

This directory consolidates the web and Expo Crypto Onramp examples around one stateless, Link-only backend. The existing examples remain unchanged while they migrate to the shared contract.

## Backend setup

```sh
cd crypto-onramp/backend
cp .env.example .env
npm ci
npm run dev
```

The backend listens on `http://localhost:3001` by default. `GET /health` returns a synthetic readiness response and does not call Stripe or Link.

Vercel deployments automatically trust one proxy hop so transaction-limit requests send Stripe the client IP rather than the proxy IP. Other environments trust no forwarded client IP headers by default; set `TRUSTED_PROXY_HOPS` to the exact trusted hop count when deploying behind another hosting provider.

Available commands:

```sh
npm run dev
npm run build
npm run typecheck
npm test
npm start
```

## Authentication model

The backend issues two signed credentials with separate purposes:

- A 15-minute flow token will bind a backend-created Link auth intent to its completion request.
- A 24-hour session token will authorize returning-user and protected API requests after Link consent and customer ownership have been verified.

The session lifetime is intentionally bounded to one day. It preserves useful returning-user SSO while limiting exposure for a stateless credential that cannot be centrally invalidated. Native clients store only the session token in platform-protected storage and remove it on logout or “not me”; every protected request still re-checks current Link authority. OAuth access and refresh tokens remain backend-only and request-local.

When OAuth access has expired, the backend makes one best-effort refresh attempt. It does not retry or coordinate refreshes across instances, so clients must recover from `link_reauthorization_required` by starting a new Link authorization flow.

The public API contract uses these routes:

```text
GET  /config
POST /link/auth_intent
POST /link/auth_intent/complete
POST /link/auth_token
GET  /customers/:customer_id
GET  /customers/:customer_id/wallets
GET  /customers/:customer_id/payment_tokens
GET  /onramp/limits
```

No real credentials, network calls, or transactions are used by the automated tests.

## Link authorization

Create a backend-bound Link authorization flow with an email lookup and an optional boolean `livemode` value:

```http
POST /link/auth_intent
Content-Type: application/json

{"email":"person@example.com","livemode":false}
```

The response contains `auth_intent_id` and `flow_token`. Pass the raw `auth_intent_id` to the Stripe SDK. After the SDK returns a CryptoCustomer ID, complete the flow with the signed credential:

```http
POST /link/auth_intent/complete
Authorization: Bearer <flow_token>
Content-Type: application/json

{"crypto_customer_id":"crc_example"}
```

The backend retrieves current Link OAuth credentials, verifies CryptoCustomer ownership, and returns only `session_token`. OAuth credentials never enter client responses or backend JWTs. Errors use this envelope:

```json
{"error":{"code":"invalid_flow_token","message":"The flow token is invalid or expired."}}
```

For explicit returning-user SSO, exchange the session credential for the short-lived SDK token:

```http
POST /link/auth_token
Authorization: Bearer <session_token>
Content-Type: application/json

{}
```

The response contains only `link_auth_token_client_secret` and Stripe's `expires_in` value. Pass the client secret to the SDK token-authentication API, not its Link authorization API.

Stripe enables seamless sign-in only for approved integrations. Add `auth.persist_login:read` to `OAUTH_SCOPES` only after Stripe enables it for your account. `/config` reports `link_sso_enabled`; clients should hide explicit SSO actions when it is false. `/link/auth_token` returns `link_sso_unavailable` when the scope is absent or Stripe refuses token creation, and clients should use the regular Link authorization flow.

## Protected customer data

Pass the session token as a bearer credential when reading customer resources:

```http
GET /customers/crc_example
Authorization: Bearer <session_token>
```

The signed customer must match the URL. The response preserves Stripe's authoritative `kyc_region`, `kyc_tiers`, per-tier verification errors, `provided_fields`, and `verifications`. Wallet and payment-token lists support `limit` and `starting_after` pagination:

```http
GET /customers/crc_example/wallets?limit=25&starting_after=ccw_previous
GET /customers/crc_example/payment_tokens?limit=25&starting_after=cpt_previous
Authorization: Bearer <session_token>
```

Current transaction limits can be filtered by destination. The backend derives customer, mode, and client network context rather than accepting them from query parameters:

```http
GET /onramp/limits?wallet_address=0x1234&destination_network=ethereum
Authorization: Bearer <session_token>
```

Use the returned Stripe limits as authoritative. Numeric limit values are passed through without unit conversion; the backend does not infer limits from KYC tier or add transaction ceilings.
