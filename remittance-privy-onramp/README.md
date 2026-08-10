# Stablecoin Remittance with Privy and Stripe Onramp

This sample shows how to build a remittance app where Stripe Onramp delivers USDC into a sender-owned, non-custodial Privy wallet, then the developer app either holds the funds in that wallet or sends them to a payout/offramp destination.

The sample includes:

- An Expo React Native app using `@stripe/stripe-react-native` Embedded Components Onramp.
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
  docs/     Recipe and integration guide
```

## Prerequisites

- Node.js v18+
- Expo CLI
- A physical device, iOS Simulator, or Android Emulator
- Stripe account with Embedded Components Onramp access
- OAuth client ID and secret provisioned by Stripe during onboarding
- Privy app configured for email auth, embedded wallets, delegated signers/policies, gas sponsorship, and the target chain

## Wallet Ownership And Consent

This sample is structured around a sender-owned, non-custodial Privy wallet. The sender signs in with Privy, the mobile app uses Privy's client SDK to create or reuse the embedded wallet, and the sender explicitly authorizes the app's backend signer for the disclosed remittance flow.

The backend verifies the Privy access token, checks that the wallet belongs to the authenticated Privy user, stores the wallet mapping, and later uses its delegated signer only for the post-delivery payout handoff.

This sample uses Privy auth with a linked email account. Privy custom auth with app-issued JWTs is also supported by Privy and can be a good fit for production apps that want Privy to verify their existing app identity directly, but it is not required for this recipe or to run the sample.

Before wallet setup, the app asks the sender to consent to the wallet-backed remittance flow: create or reuse their wallet, receive USDC from Stripe Onramp into that wallet, and grant delegated authority to send those funds to the configured payout/offramp destination. Production apps should store that consent record and scope delegated authority as narrowly as possible.

This sample uses one configured payout/offramp destination to keep the integration concrete. The same recipe can route post-Onramp USDC to a receiver wallet, an offramp provider, or another approved destination supported by the developer's remittance product.

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

PRIVY_APP_ID=YOUR_PRIVY_APP_ID
PRIVY_APP_SECRET=YOUR_PRIVY_APP_SECRET
PRIVY_APP_AUTHORIZATION_PRIVATE_KEY=YOUR_BASE64_PKCS8_AUTHORIZATION_PRIVATE_KEY
PRIVY_SPONSOR_GAS=true

REMITTANCE_ONRAMP_NETWORK=tempo
REMITTANCE_OFFRAMP_DESTINATION_ADDRESS=0xYOUR_FIXED_OFFRAMP_DESTINATION
PRIVY_CAIP2=eip155:4217
USDC_CONTRACT_ADDRESS=0xYOUR_USDC_CONTRACT_ADDRESS
```

`EXPO_PUBLIC_ONRAMP_NETWORK`, `REMITTANCE_ONRAMP_NETWORK`, `PRIVY_CAIP2`, and `USDC_CONTRACT_ADDRESS` must all refer to the same chain and USDC contract.

The backend verifies Privy access tokens with Privy's JWKS-backed SDK verifier, so you do not need to copy a Privy public verification key into `.env`. The Privy signer ID and policy IDs are configured in the Expo app because the sender grants delegated authority from the client.

## Run

Start the backend:

```bash
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

## App Flow

The sample supports two post-delivery modes:

- `Hold in wallet`: Stripe delivers USDC to the sender's Privy wallet and funds stay there until the sender taps `Send to payout partner`.
- `Auto send to payout`: after Onramp fulfillment, the app/backend submits the delegated USDC transfer to the configured payout/offramp destination.

The user-facing flow is:

1. Select payout mode.
2. Sign in with Privy.
3. Enter transfer amount and recipient.
4. Consent to wallet creation/reuse and delegated payout authority.
5. Continue with Link from the payment method screen.
6. Complete identity collection only if Stripe Onramp requires it.
7. Select a payment method.
8. Review and complete Onramp checkout.
9. Track payment, USDC delivery, wallet hold, and payout handoff.

## Production Notes

This sample uses an in-memory backend store and a preconfigured Privy policy to keep the integration easy to inspect. Production implementations should add durable storage, Privy access token verification on privileged backend requests, webhook signature verification, idempotent backend state transitions, persisted consent records, consent-aligned Privy signer/policy lifecycle management, downstream payout status, support workflows for returns or failed payout handoff, and review of any requirements for wallet, receiver, offramp, or local payout experiences.
