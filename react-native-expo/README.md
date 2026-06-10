# Crypto Embedded Components Onramp Example App

A React Native (Expo) example app demonstrating the [Stripe Embedded Components Onramp](https://docs.stripe.com/crypto/onramp/embedded-components) integration. The app guides users through a complete crypto purchase flow — from authentication and KYC to wallet registration, payment, and checkout — using the `@stripe/stripe-react-native` SDK.

⚠️ **Note that this app is intended for example purposes only.** It is designed to run in sandbox and does not support live mode with real money transactions.

## Features

### Authentication
- **Link Authentication** — Sign up / log in, register a [Link](https://link.com/) account, and authorize via OAuth with OTP consent
- **OAuth Token Refresh** — Automatic detection and refresh of expired OAuth access tokens

### Identity
- **KYC Collection** — Multi-step identity verification: personal info and home address. Returning users with verified KYC bypass the identity screens automatically

### Payment
- **Wallet Management** — Register a new crypto wallet or select from previously registered wallets
- **Payment Method** — Collect payment via Stripe's wallet UI
- **Checkout with Live Quotes** — Review order with real-time price quotes, auto-refreshing countdown, and fee breakdown

## Getting Started

### Prerequisites

- Node.js v18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- A physical device, iOS Simulator, or Android Emulator (with Google APIs, e.g. `google_apis_playstore`)
- Stripe account with Embedded Components onramp access ([request access](https://docs.stripe.com/crypto/onramp#submit-your-application))

### 1. Install dependencies

```bash
npm install
cd server && npm install && cd ..
```

### 2. Configure environment variables

**Frontend** (required):

```bash
cp .env.example .env
```

Edit `.env` and set your Stripe publishable key:

```
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
```

**Backend** (required):

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your credentials:

```
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY

OAUTH_CLIENT_ID=YOUR_OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET=YOUR_OAUTH_CLIENT_SECRET

PORT=3001
```

Your OAuth client ID and secret are provisioned by Stripe during onboarding.

### 3. Customize for your app

In `app.json`, update the bundle identifier and package name to match your app:

- `expo.ios.bundleIdentifier` — your iOS App ID.
- `expo.android.package` — your Android app’s application ID.
- `expo.ios.entitlements["com.apple.developer.devicecheck.appattest-environment"]` — must be `production` for live/TestFlight testing. Change to `development` only for simulator-only work.

In `src/constants.ts`, update `MERCHANT_DISPLAY_NAME` to your app's display name.

### 4. Generate native projects

```bash
npx expo prebuild
```

### 5. Start the backend

```bash
npm run server
```

### 6. Run the app

**Simulator / Emulator:**

```bash
npm run ios       
npm run android   
```

**Physical device:**

```bash
npx expo run:ios --device       
npx expo run:android --device   
```

When running on a physical device, update `API_URL` in `src/api/client.ts` to use your computer's local IP address instead of `localhost`.

## Project Structure

```
example-crypto-embedded-components-onramp/
├── App.tsx                        # Root component with StripeProvider
├── index.ts                       # Expo entry point
├── app.json                       # Expo configuration
├── eslint.config.js               # ESLint config (Expo preset)
├── package.json
├── tsconfig.json
├── .env.example                   # Frontend env template
├── plugins/
│   └── withMaterialTheme.js       # Expo plugin: Android Material Components theme
├── src/
│   ├── api/
│   │   └── client.ts              # Typed API client
│   ├── constants.ts               # Shared constants
│   ├── hooks/
│   │   └── useOnramp.ts           # Re-export of Stripe onramp hook
│   ├── navigation/
│   │   └── AppNavigator.tsx       # Stack navigator with all screens
│   ├── screens/
│   │   ├── HomeScreen.tsx         # Landing screen
│   │   ├── AuthScreen.tsx         # Sign up / log in
│   │   ├── RegisterScreen.tsx     # Link account registration
│   │   ├── KYCPrimerScreen.tsx    # KYC intro with privacy disclosure
│   │   ├── KYCScreen.tsx          # Personal info
│   │   ├── AddressScreen.tsx      # Home address
│   │   ├── WalletScreen.tsx       # Register or select crypto wallet
│   │   ├── PaymentMethodScreen.tsx# Payment method and amount selection
│   │   ├── CheckoutScreen.tsx     # Review order with live quote and fee breakdown
│   │   └── SuccessScreen.tsx      # Purchase confirmation
│   └── types.ts                   # Navigation params and shared types
└── server/
    ├── server.ts                  # Express entry point
    ├── package.json
    ├── tsconfig.json
    ├── .env.example               # Backend env template
    ├── db/
    │   └── store.ts               # In-memory user store
    ├── routes/
    │   ├── auth.ts                # Auth routes
    │   └── onramp.ts              # Crypto Onramp routes
    ├── constants.ts               # Server-side shared constants
    └── utils/
        └── stripeApiHelper.ts     # Stripe/Link API helper with token refresh
```

## Backend API

The backend is a TypeScript/Express server that proxies Stripe and Link API calls with OAuth token management.

### Auth Routes (`/v1/auth`)

| Method | Path | Description | Stripe API |
|--------|------|-------------|------------|
| POST | `/signup` | Register a new user | — |
| POST | `/login` | Authenticate existing user | — |
| POST | `/create` | Create a LinkAuthIntent | `POST https://login.link.com/v1/link_auth_intent` |
| POST | `/save_user` | Save customer ID and exchange tokens | `POST https://login.link.com/v1/link_auth_intent/{id}/tokens` |

### Onramp Routes (`/v1`)

| Method | Path | Description | Stripe API |
|--------|------|-------------|------------|
| GET | `/crypto_customer/:id` | Get customer KYC/verification status | [`GET /v1/crypto/customers/{id}`](https://docs.stripe.com/api/crypto/customers/retrieve) |
| GET | `/crypto_customer/:id/wallets` | List registered wallets | [`GET /v1/crypto/customers/{id}/crypto_consumer_wallets`](https://docs.stripe.com/api/crypto/consumer_wallets/list) |
| GET | `/crypto_customer/:id/payment_tokens` | List saved payment methods | [`GET /v1/crypto/customers/{id}/payment_tokens`](https://docs.stripe.com/api/crypto/payment_tokens/list) |
| POST | `/create_onramp_session` | Create a crypto onramp session | [`POST /v1/crypto/onramp_sessions`](https://docs.stripe.com/api/crypto/onramp_sessions/create) |
| POST | `/refresh_quote` | Refresh quote for latest price | [`POST /v1/crypto/onramp_sessions/{id}/quote`](https://docs.stripe.com/api/crypto/onramp_sessions/quote) |
| POST | `/checkout` | Refresh quote and complete checkout | [`POST /v1/crypto/onramp_sessions/{id}/quote`](https://docs.stripe.com/api/crypto/onramp_sessions/quote) + [`/checkout`](https://docs.stripe.com/api/crypto/onramp_sessions/checkout) |

### Data Storage

The backend uses an in-memory store (`Map` objects). Local data (passwords, tokens) persists only while the server is running and resets on restart.

However, once a user signs up and registers with **[Link](https://link.com/)**, their account is stored on Stripe's side and won't be reset when the server restarts. This means if you restart the server and sign in with the same email, the SDK's `hasLinkAccount` check will detect the existing Link account and skip the registration step — even though the local in-memory store was wiped. Similarly, KYC verification status, registered wallets, and saved payment methods are stored by Stripe and survive server restarts.

For production use, replace `server/db/store.ts` with a real database.

## Architecture

### Tech Stack

- **Framework**: Expo (React Native)
- **SDK**: `@stripe/stripe-react-native` with onramp module
- **Navigation**: React Navigation (native stack)
- **Language**: TypeScript
- **Backend**: Express, node-fetch
- **Auth**: Bearer token (in-memory), OAuth access/refresh tokens (Stripe Link)

### Key SDK Methods Used

| SDK Method | Presents Stripe UI? | Used In |
|------------|-------------|---------|
| `configure` | No | AuthScreen — SDK initialization |
| `hasLinkAccount` | No | AuthScreen — check for existing Link account |
| `registerLinkUser` | No | RegisterScreen — create Link account |
| `authorize` | Yes | AuthScreen, RegisterScreen — OTP/consent |
| `attachKycInfo` | No | AddressScreen — submit KYC data |
| `verifyIdentity` | Yes | AuthScreen, RegisterScreen, AddressScreen — document + selfie verification (sandbox presents a test UI to select outcome) |
| `registerWalletAddress` | No | WalletScreen — register crypto wallet |
| `collectPaymentMethod` | Yes | PaymentMethodScreen — Stripe wallet UI |
| `createCryptoPaymentToken` | No | PaymentMethodScreen — create payment token |
| `performCheckout` | Maybe | CheckoutScreen — 3DS if needed |

## Testing

For sandbox test values (OTP codes, SSN, addresses, card numbers) and identity verification details, see the [Testing section](https://docs.stripe.com/crypto/onramp/embedded-components-integration-guide#testing) of the integration guide.

## License

This example app is for demonstration purposes. Licensed under the [MIT License](LICENSE).

## Related Documentation

- [Embedded Components Onramp Integration Guide](https://docs.stripe.com/crypto/onramp/embedded-components-integration-guide)
- [Stripe React Native SDK](https://github.com/stripe/stripe-react-native)
- [iOS Sample App](https://github.com/stripe/stripe-ios/tree/master/Example/CryptoOnramp%20Example)
- [Android Sample App](https://github.com/stripe/stripe-android/tree/master/crypto-onramp-example)
- [Expo Documentation](https://docs.expo.dev/)
