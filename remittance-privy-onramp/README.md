# Stablecoin Remittance with Privy and Stripe Onramp

This sample shows how to build a remittance app where Stripe Onramp delivers USDC into a sender-owned, non-custodial Privy wallet, then the developer app either holds the funds in that wallet or sends them to a payout/offramp destination.

The sample includes:

- An Expo React Native app using `@stripe/stripe-react-native` Embedded Components Onramp.
- A Node.js backend for Link auth, Onramp session creation, Privy wallet setup, fulfillment tracking, and delegated payout handoff.
- Public docs for the recipe and the implementation sequence.

Stripe powers the Onramp leg: Link authentication, sender checks for the Onramp transaction, payment, risk checks, checkout, fiat-to-USDC conversion, and USDC delivery to the sender's wallet address. After USDC reaches that user-owned wallet, the developer controls the wallet experience, payout/offramp routing, downstream status, returns, and support.

Because funds land in a user-owned wallet, the same pattern can support immediate remittance, hold-in-wallet behavior, and broader wallet or balance products when the developer's product setup supports them.

## Docs

- [Recipe overview](docs/stablecoin-remittance-recipe.md): product model, ownership boundaries, flow of funds, and UX considerations.
- [Integration guide](docs/integration-guide.md): concrete implementation steps, backend routes, and source-file pointers.

## Prerequisites

- Node.js v18+
- Expo CLI
- A physical device, iOS Simulator, or Android Emulator
- Stripe account with Embedded Components Onramp access
- OAuth client ID and secret provisioned by Stripe during onboarding
- Privy app configured for user-owned wallets created through server-side APIs, delegated actions, gas sponsorship, and the target chain

## Wallet Ownership And Consent

This sample is structured around a sender-owned, non-custodial Privy wallet. The backend creates or reuses the wallet through Privy's server-side APIs, but the wallet is for the sender, not the backend. The backend keeps Privy identifiers and authorization keys server-side so the mobile app only handles the wallet address needed by Stripe Onramp.

This sample uses Privy auth with a linked email account. Privy custom auth with app-issued JWTs is also supported by Privy and can be a good fit for production apps that want Privy to verify their existing app identity directly, but it is not required for this recipe.

Before wallet setup, the app asks the sender to consent to the wallet-backed remittance flow: create or reuse a wallet, receive USDC from Stripe Onramp into that wallet, and use delegated authority to send those funds to the configured payout/offramp destination. Production apps should store that consent record and scope delegated authority as narrowly as possible.

This sample uses one configured payout/offramp destination to keep the integration concrete. The same recipe can route post-Onramp USDC to a receiver wallet, an offramp provider, or another approved destination supported by the developer's remittance product.

## Install

```bash
npm install
cd server && npm install && cd ..
```

## Configure The Mobile App

```bash
cp .env.example .env
```

Set:

```bash
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_ONRAMP_NETWORK=tempo
```

When running on a physical device, set `EXPO_PUBLIC_API_URL` to your computer's local network IP address instead of `localhost`.

## Configure The Backend

```bash
cp server/.env.example server/.env
```

Set:

```bash
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
OAUTH_CLIENT_ID=YOUR_OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET=YOUR_OAUTH_CLIENT_SECRET

PRIVY_APP_ID=YOUR_PRIVY_APP_ID
PRIVY_APP_SECRET=YOUR_PRIVY_APP_SECRET
PRIVY_APP_AUTHORIZATION_PRIVATE_KEY=YOUR_BASE64_PKCS8_AUTHORIZATION_PRIVATE_KEY
PRIVY_WALLET_SIGNER_ID=YOUR_PRIVY_KEY_QUORUM_ID
PRIVY_WALLET_POLICY_IDS=YOUR_OPTIONAL_POLICY_ID
PRIVY_SPONSOR_GAS=true

REMITTANCE_ONRAMP_NETWORK=tempo
REMITTANCE_OFFRAMP_DESTINATION_ADDRESS=0xYOUR_FIXED_OFFRAMP_DESTINATION
PRIVY_CAIP2=eip155:4217
USDC_CONTRACT_ADDRESS=0xYOUR_USDC_CONTRACT_ADDRESS
```

`EXPO_PUBLIC_ONRAMP_NETWORK`, `REMITTANCE_ONRAMP_NETWORK`, `PRIVY_CAIP2`, and `USDC_CONTRACT_ADDRESS` must all refer to the same chain and USDC contract.

## Run

Start the backend:

```bash
npm run server
```

Start Metro:

```bash
npx expo start
```

Run the native app:

```bash
npm run ios
# or
npm run android
```

## App Flow

The sample supports two post-delivery modes:

- `Hold in wallet`: Stripe delivers USDC to the sender's Privy wallet and funds stay there until the sender taps `Send to payout partner`.
- `Auto send to payout`: after Onramp fulfillment, the app/backend submits the delegated USDC transfer to the configured payout/offramp destination.

The user-facing flow is:

1. Select payout mode.
2. Sign in and authorize with Link.
3. Enter transfer amount and recipient.
4. Consent to wallet creation and delegated payout authority.
5. Select a payment method.
6. Review and complete Onramp checkout.
7. Track payment, USDC delivery, wallet hold, and payout handoff.

## Production Notes

This sample uses an in-memory backend store and a preconfigured Privy policy to keep the integration easy to inspect. Production implementations should add durable storage, webhook signature verification, idempotent backend state transitions, persisted consent records, consent-aligned Privy signer/policy lifecycle management, downstream payout status, support workflows for returns or failed payout handoff, and review of any requirements for wallet, receiver, offramp, or local payout experiences.
