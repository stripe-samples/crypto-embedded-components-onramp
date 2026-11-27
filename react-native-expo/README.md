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
npm --prefix ../crypto-onramp/backend install
```

### 2. Configure environment variables

The app reads its Stripe publishable key from the backend's `/config` endpoint. No frontend Stripe key is required.

For local development, no Expo environment file is needed:

- iOS Simulator uses `http://localhost:3001`.
- Android Emulator uses `http://10.0.2.2:3001`.

For a physical device or deployed backend, copy the example environment file:

```bash
cp .env.example .env
```

Set `EXPO_PUBLIC_BACKEND_URL` to a URL the device can reach:

```
EXPO_PUBLIC_BACKEND_URL=https://crypto-onramp-backend.vercelapp.stripe.dev
```

The app uses the consolidated backend in `../crypto-onramp/backend`. Follow its [setup instructions](../crypto-onramp/README.md#backend-setup), including copying and filling in its `.env` file.

### 3. Customize for your app

In `app.json`, update the bundle identifier and package name to match your app:

- `expo.ios.bundleIdentifier` — your iOS App ID.
- `expo.android.package` — your Android app’s application ID.

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

When running the backend on your development machine for a physical device, set `EXPO_PUBLIC_BACKEND_URL` to your machine's LAN URL, such as `http://192.168.1.100:3001`.

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

## Authentication and Backend API

The app does not implement a separate username/password account system. The native SDK checks for or registers a Link account, and the consolidated backend creates and completes the Link auth intent.

After consent, the backend returns a 24-hour session token that authorizes customer and Onramp requests. This example keeps the session token in memory. Apps that persist it between launches should use platform-protected storage and clear it when the user signs out.

The backend keeps Link OAuth credentials server-side and makes one best-effort refresh attempt when access expires. If authorization can no longer be refreshed, the app returns to Link sign-in.

See the [backend README](../crypto-onramp/README.md) for the routes, request contract, and security model.

## Architecture

### Tech Stack

- **Framework**: Expo (React Native)
- **SDK**: `@stripe/stripe-react-native` with onramp module
- **Navigation**: React Navigation (native stack)
- **Language**: TypeScript
- **Backend**: Shared TypeScript/Express backend in `../crypto-onramp/backend`
- **Auth**: Backend-issued session token; Link OAuth credentials remain server-side

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
