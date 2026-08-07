# Remittance Web App

This is the React web version of the stablecoin remittance sample. It uses the same shared backend as the Expo app and demonstrates the same Privy wallet + Stripe Embedded Components Onramp flow.

The web app is intentionally small:

- Vite, React, and TypeScript.
- Plain CSS with local UI components.
- `@privy-io/react-auth` for app login, sender-owned wallet creation, and delegated signer consent.
- `@stripe/crypto` for the web Onramp Embedded Components flow.
- `lucide-react` for icons.

The source layout mirrors the Expo app: `src/screens` contains one component per
flow screen, `src/components` contains shared UI, and `src/RemittanceFlow.tsx`
coordinates shared SDK state. Styles are grouped into base, layout, and reusable
component files under `src/styles`.

## Configure

```bash
cp .env.example .env
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

`VITE_ONRAMP_NETWORK` should match the backend chain configuration in `../backend/.env`.
`VITE_PRIVY_CLIENT_ID` is optional for React web. Set it only when using a dedicated Privy web app client; do not reuse a mobile app client ID.

## Run Locally

From `remittance-privy-onramp`, start the backend:

```bash
npm run backend
```

Then start the web app:

```bash
npm run web
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Flow

The web app shows the same remittance recipe as the Expo app:

1. Alice selects the demo flow: hold USDC in wallet or auto send to payout.
2. Alice signs in to the sample app with Privy email OTP.
3. Alice enters transfer details for Bob.
4. Alice consents to creating or reusing her sender-owned Privy wallet and granting the backend signer delegated payout authority.
5. The web app attaches the client-created wallet to the shared backend.
6. Alice continues with Link from the payment screen.
7. Alice completes KYC only if Stripe Onramp requires it.
8. The web app registers Alice's wallet address with Stripe Onramp.
9. Stripe Onramp collects Alice's payment method and completes checkout.
10. The app tracks USDC delivery to Alice's wallet, then either holds it or sends it to the configured payout destination.

The payment screen also mirrors the mobile app's step-up behavior: it checks the current KYC tier and transaction limit before creating the Onramp session, then routes Alice through incremental KYC if the amount is above the current tier.

## Deploying

The app is a standard Vite static build and can be deployed to Vercel or another static hosting environment.

Set the same environment variables in the deployment environment and point `VITE_API_URL` at the deployed backend.
