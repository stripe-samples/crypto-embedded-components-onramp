# Stablecoin Remittance with Privy and Stripe Onramp

This sample shows how to build a remittance app where Stripe Onramp delivers USDC into a sender-owned, non-custodial Privy wallet, then the developer app either holds the funds in that wallet or sends them to a payout/offramp destination.

The sample includes:

- An Expo React Native app using `@stripe/stripe-react-native` Embedded Components Onramp.
- A Vite React app using the web `@stripe/crypto` Embedded Components Onramp SDK.
- A Node.js backend for Privy session verification, Link auth, Onramp session creation, wallet attachment, fulfillment tracking, and delegated payout handoff.
- Public docs for the recipe and the implementation sequence.

Stripe powers the Onramp leg: Link authentication, sender checks for the Onramp transaction, payment, risk checks, checkout, fiat-to-USDC conversion, and USDC delivery to the sender's wallet address. After USDC reaches that user-owned wallet, the developer controls the wallet experience, payout/offramp routing, downstream status, returns, and support.

Because funds land in a user-owned wallet, the same pattern can support immediate remittance, hold-in-wallet behavior, and broader wallet or balance products when the developer's product setup supports them.

## Docs

- [Recipe overview](docs/stablecoin-remittance-recipe.md): product model, ownership boundaries, flow of funds, and UX considerations.
- [Integration guide](docs/integration-guide.md): concrete implementation steps, backend routes, and source-file pointers.

## Project Layout

```text
remittance-privy-onramp/
  backend/  Shared Node.js API used by client apps
  expo/     Expo React Native app
  web/      Vite React web app
  docs/     Recipe and integration guide
```

Both clients organize flow screens under `src/screens` and use the same backend API. The web client uses React, TypeScript, plain CSS, and local UI components; `web/src/RemittanceFlow.tsx` coordinates its shared SDK and flow state.

## Prerequisites

- Node.js v18+
- Docker, or access to an existing PostgreSQL database
- Expo CLI
- A physical device, iOS Simulator, or Android Emulator
- Stripe account with Embedded Components Onramp access
- OAuth client ID and secret provisioned by Stripe during onboarding
- Privy app configured for email auth, embedded wallets, delegated signers/policies, gas sponsorship, and the target chain

## Wallet Ownership And Consent

This sample is structured around a sender-owned, non-custodial Privy wallet. The sender signs in with Privy, the client app uses Privy's client SDK to create or reuse the embedded wallet, and the sender explicitly authorizes the app's backend signer for the disclosed remittance flow.

The backend verifies the Privy access token, checks that the wallet belongs to the authenticated Privy user, stores the wallet mapping, and later uses its delegated signer only for the post-delivery payout handoff.

This sample uses Privy auth with a linked email account. Privy custom auth with app-issued JWTs is also supported by Privy and can be a good fit for production apps that want Privy to verify their existing app identity directly, but it is not required for this recipe or to run the sample.

Before wallet setup, the app asks the sender to consent to the wallet-backed remittance flow: create or reuse their wallet, receive USDC from Stripe Onramp into that wallet, and grant delegated authority to send those funds to the selected payout/offramp destination. Production apps should store that consent record and scope delegated authority as narrowly as possible.

For the public demo, the landing page asks for a payout wallet address and stores it locally on the device. The client sends that address when it creates a remittance, and the backend validates and stores it on that remittance before creating the Onramp session. The same recipe can route post-Onramp USDC to a receiver wallet, an offramp provider, or another approved destination supported by the developer's remittance product.

## Install

```bash
npm run install:all
```

## Configure The Mobile App

```bash
cp expo/.env.example expo/.env
```

Set:

```bash
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_ONRAMP_NETWORK=tempo
EXPO_PUBLIC_PRIVY_APP_ID=YOUR_PRIVY_APP_ID
EXPO_PUBLIC_PRIVY_CLIENT_ID=YOUR_PRIVY_APP_CLIENT_ID
EXPO_PUBLIC_PRIVY_WALLET_SIGNER_ID=YOUR_PRIVY_KEY_QUORUM_ID
EXPO_PUBLIC_PRIVY_WALLET_POLICY_IDS=YOUR_OPTIONAL_POLICY_ID
```

When running on a physical device, set `EXPO_PUBLIC_API_URL` to your computer's local network IP address instead of `localhost`.

## Configure The Backend

```bash
cp backend/.env.example backend/.env
```

Set:

```bash
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
OAUTH_CLIENT_ID=YOUR_OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET=YOUR_OAUTH_CLIENT_SECRET
DATABASE_URL=postgresql://remittance:remittance@localhost:5432/remittance

PRIVY_APP_ID=YOUR_PRIVY_APP_ID
PRIVY_APP_SECRET=YOUR_PRIVY_APP_SECRET
PRIVY_APP_AUTHORIZATION_PRIVATE_KEY=YOUR_BASE64_PKCS8_AUTHORIZATION_PRIVATE_KEY
PRIVY_SPONSOR_GAS=true

REMITTANCE_ONRAMP_NETWORK=tempo
PRIVY_CAIP2=eip155:4217
USDC_CONTRACT_ADDRESS=0xYOUR_USDC_CONTRACT_ADDRESS
```

The client Onramp network (`EXPO_PUBLIC_ONRAMP_NETWORK` or `VITE_ONRAMP_NETWORK`), `REMITTANCE_ONRAMP_NETWORK`, `PRIVY_CAIP2`, and `USDC_CONTRACT_ADDRESS` must all refer to the same chain and USDC contract.

The backend verifies Privy access tokens with Privy's JWKS-backed SDK verifier, so you do not need to copy a Privy public verification key into `.env`. The Privy signer ID and policy IDs are configured in each client app because the sender grants delegated authority from the client.

## Configure The Web App

```bash
cp web/.env.example web/.env
```

Set:

```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
VITE_API_URL=http://localhost:3001
VITE_ONRAMP_NETWORK=tempo
VITE_PRIVY_APP_ID=YOUR_PRIVY_APP_ID
VITE_PRIVY_WALLET_SIGNER_ID=YOUR_PRIVY_KEY_QUORUM_ID
VITE_PRIVY_WALLET_POLICY_IDS=YOUR_OPTIONAL_POLICY_ID
```

`VITE_ONRAMP_NETWORK` must match the backend chain configuration.
`VITE_PRIVY_CLIENT_ID` is optional for React web. Set it only if you create a dedicated Privy web app client; do not reuse the Expo mobile client ID.

## Run

Start the backend:

```bash
npm run backend:db:start
npm run backend:db:migrate
npm run backend
```

Start Metro:

```bash
npm run expo
```

Run the native app:

```bash
npm run expo:ios
# or
npm run expo:android
```

Or start the web app:

```bash
npm run web
```

## Deploy The Web App

The web app produces a standard Vite static build and can be deployed to Vercel or another static host:

```bash
npm run web:build
```

Set the web environment variables in the deployment environment and point `VITE_API_URL` at the deployed backend.

The backend can be deployed separately using a hosted PostgreSQL database such as Neon. Set `DATABASE_URL` to its pooled PostgreSQL connection URL and run the committed Drizzle migrations before starting the backend.

## App Flow

The sample supports two post-delivery modes:

- `Hold in wallet`: Stripe delivers USDC to the sender's Privy wallet and funds stay there until the sender taps `Send to payout partner`.
- `Auto send to payout`: after Onramp fulfillment, the app/backend submits the delegated USDC transfer to the payout destination stored on the remittance.

The user-facing flow is:

1. Configure the demo payout wallet and select payout mode.
2. Sign in with Privy.
3. Enter transfer amount and recipient.
4. Consent to wallet creation/reuse and delegated payout authority.
5. Continue with Link from the payment method screen.
6. Complete identity collection only if Stripe Onramp requires it.
7. Select a payment method.
8. Review and complete Onramp checkout.
9. Track payment, USDC delivery, wallet hold, and payout handoff.

## Production Notes

This sample uses PostgreSQL for durable workflow state and a preconfigured Privy policy to keep the integration easy to inspect. The demo accepts an EVM payout address from the client; production implementations should derive or validate destinations against their payout route and ensure the Privy policy permits only intended transfers. They should also add webhook signature verification, persisted consent records, consent-aligned Privy signer/policy lifecycle management, downstream payout status, support workflows for returns or failed payout handoff, and review of any requirements for wallet, receiver, offramp, or local payout experiences.
