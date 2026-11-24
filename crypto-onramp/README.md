# Crypto Onramp

This directory will consolidate the web and Expo Crypto Onramp examples around one stateless, Link-only backend. The first implementation phase contains the backend skeleton and its automated test harness; the existing examples remain unchanged.

## Backend setup

```sh
cd crypto-onramp/backend
cp .env.example .env
npm ci
npm run dev
```

The backend listens on `http://localhost:3001` by default. `GET /health` returns a synthetic readiness response and does not call Stripe or Link.

Available commands:

```sh
npm run dev
npm run build
npm run typecheck
npm test
npm start
```

## Authentication model

The completed backend will issue two signed credentials with separate purposes:

- A 15-minute flow token will bind a backend-created Link auth intent to its completion request.
- A 24-hour session token will authorize returning-user and protected API requests after Link consent and customer ownership have been verified.

The session lifetime is intentionally bounded to one day. It preserves useful returning-user SSO while limiting exposure for a stateless credential that cannot be centrally invalidated. Native clients will store only the session token in platform-protected storage and remove it on logout or “not me”; every protected request will still re-check current Link authority. OAuth access and refresh tokens remain backend-only and request-local.

The public API contract will use the route names below as implementation phases land:

```text
GET  /config
POST /link/auth_intent
POST /link/auth_intent/complete
POST /link/auth_token
GET  /customers/:customer_id
GET  /customers/:customer_id/wallets
GET  /customers/:customer_id/payment_tokens
GET  /transaction_limits
POST /onramp_sessions
GET  /onramp_sessions/:session_id
POST /onramp_sessions/:session_id/quote
POST /onramp_sessions/:session_id/checkout
```

No real credentials, network calls, or transactions are used by the automated tests.
