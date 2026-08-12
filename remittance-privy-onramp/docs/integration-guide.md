# Integration Guide

This guide explains how to combine Stripe Embedded Components Onramp and Privy wallets to build a stablecoin remittance app.

Use the official Stripe and Privy docs for the baseline product integrations. This guide focuses on the remittance-specific parts: using a sender-owned Privy wallet as the Onramp destination, collecting consent for wallet-backed movement, and handling what happens after Stripe delivers USDC to the wallet.

For the product model and flow of funds, see the [recipe overview](stablecoin-remittance-recipe.md).

## Before You Start

Start with the official docs for the underlying products:

- [Stripe Embedded Components Onramp integration guide](https://docs.stripe.com/crypto/onramp/embedded-components-integration-guide)
- [Privy React Native setup](https://docs.privy.io/basics/react-native/setup)
- [Privy React Native quickstart](https://docs.privy.io/basics/react-native/quickstart)
- [Privy React setup](https://docs.privy.io/basics/react/setup)
- [Privy React quickstart](https://docs.privy.io/basics/react/quickstart)
- [Privy user and server signers](https://docs.privy.io/recipes/wallets/user-and-server-signers)
- [Privy wallet policies](https://docs.privy.io/controls/policies/overview)
- [Privy gas sponsorship](https://docs.privy.io/wallets/gas-and-asset-management/gas/overview)

The Stripe docs cover the normal Onramp flow: Link auth, wallet registration, quotes, checkout, and fulfillment. The Privy docs cover app auth, embedded wallet creation, delegated signers, policies, and gas sponsorship.

This guide assumes you are building a flow like:

1. Alice wants to send value to Bob.
2. Alice signs in to the developer app with Privy.
3. Alice enters transfer details.
4. Alice consents to creating or reusing her Privy wallet and adding the app backend signer under a remittance policy.
5. Alice continues with Link when she is ready to pay.
6. Stripe Onramp delivers USDC to Alice's wallet.
7. The developer app either holds USDC in Alice's wallet or moves it onward through a payout/offramp route.

## Step 1: Authenticate The Sender

Use Privy auth for the sender in this sample. Use Link for the Stripe Onramp transaction.

Keep those concepts separate:

- Privy app auth identifies Alice inside the developer app and controls her embedded wallet session.
- Link auth identifies Alice for Stripe Onramp.
- The backend stores the mapping needed to create Onramp sessions for the Link-authenticated Onramp user.

The client app signs Alice in with Privy email OTP and sends the Privy access token as the bearer token on backend requests. The backend verifies that Privy token on each authenticated request and uses the verified Privy user as the app user identity.

Do not make Link feel like a second app sign-in step. In this sample, Link is presented from the payment method screen, when Alice is ready to pay. The backend creates a Link auth intent and later stores the Link-authenticated Onramp user after Alice consents in Link. A production app should follow the Stripe Embedded Components Onramp guide for the exact Link auth flow.

## Step 2: Create Or Reuse The Sender Wallet

Use Privy's client SDK to create or retrieve a wallet for the authenticated app user.

The remittance-specific decision is that this wallet becomes the Stripe Onramp destination. Stripe delivers USDC into the sender's wallet; the developer app controls the post-delivery wallet experience.

This sample uses Privy auth with a linked email account so it can run without custom auth/JWT setup. Privy custom auth is a production variant when a developer already has an auth system and wants Privy to verify the app's user identity directly.

The client app should collect clear user consent before creating or configuring wallet authority. In this recipe, Alice should understand that:

- A non-custodial wallet is created or reused for her.
- Stripe Onramp will deliver USDC to that wallet.
- The developer app may use delegated authority to move USDC from that wallet for the disclosed remittance flow.

On consent, the app uses Privy's client SDK to:

- Create or reuse Alice's embedded Ethereum wallet.
- Call `addSigners` with the backend signer ID and remittance policy ID.
- Send the wallet address, Privy user ID, and Privy wallet ID to the backend.

The web SDK can include the signer and policy when it creates a new wallet. For an existing web wallet, it calls `addSigners`. The Expo SDK creates the wallet first and then calls `addSigners`. In both clients, this happens as one user-facing consent action.

The backend verifies that the wallet belongs to Alice's Privy user and stores the mapping:

```json
{
  "walletAddress": "0x...",
  "network": "tempo",
  "status": "ready"
}
```

Persistent user and wallet records are keyed by the verified Privy user ID. The backend reads the linked email from Privy when starting Link authentication, but does not persist it because email can change and is not the ownership key.

The backend authorization private key stays server-side. The signer ID and policy ID are public identifiers used by the client to grant delegated authority; they are not secrets.

## Step 3: Register The Wallet With Stripe Onramp

Before creating the Onramp session, register the sender's wallet address with Stripe Onramp through the Stripe SDK. In this sample, wallet registration happens from the payment method screen after Link has authorized the Onramp user.

This is standard Onramp behavior covered by the Stripe Embedded Components Onramp guide. The only recipe-specific part is where the address comes from: the registered address is Alice's Privy wallet address from Step 2.

If Stripe Onramp requires more identity information, keep that as a focused KYC flow. This sample routes Alice from the payment method screen into the KYC screens only when needed, then returns to payment method selection.

## Step 4: Create The Onramp Session

Create a normal Stripe Onramp session.

The remittance-specific part is the session destination:

- `destination_currency=usdc`
- `destination_network=<configured Onramp network>`
- `wallet_address=<sender Privy wallet address>`
- `crypto_customer_id=<Link-authenticated crypto customer>`

The sample's `POST /v1/remittances` request also includes `payout_destination_address`. This is not a Stripe Onramp parameter. The backend validates it and stores it on the local remittance so a later delegated transfer cannot substitute a different destination.

From Stripe Onramp's perspective, this is still a normal Onramp session. The destination happens to be a Privy wallet that the developer app created or reused for the sender.

The app can then use the normal Embedded Components Onramp flow for quote refresh, payment method selection, and checkout.

## Step 5: Keep Chain Configuration Aligned

Stripe Onramp, Privy, the app, and the USDC contract must all point at the same chain.

For example:

```bash
EXPO_PUBLIC_ONRAMP_NETWORK=tempo
REMITTANCE_ONRAMP_NETWORK=tempo
PRIVY_CAIP2=eip155:4217
USDC_CONTRACT_ADDRESS=0x...
```

In this sample:

- `EXPO_PUBLIC_ONRAMP_NETWORK` or `VITE_ONRAMP_NETWORK` is used by the client app when registering the wallet with Stripe Onramp.
- `REMITTANCE_ONRAMP_NETWORK` is used by the backend when creating the Onramp session.
- `PRIVY_CAIP2` is used by the backend for Privy balance lookup and delegated transfer.
- `USDC_CONTRACT_ADDRESS` is used by the backend when reading USDC balance and encoding ERC-20 transfers.

## Step 6: Track Onramp Fulfillment

Use Stripe webhooks in production to track Onramp status. For local development, this sample also supports polling so it can run without a public webhook tunnel.

For this recipe, the key status boundary is fulfillment:

- Before fulfillment, Stripe Onramp is still processing the payment and USDC delivery.
- At fulfillment, Stripe has delivered USDC to the sender's wallet.
- After fulfillment, the developer app owns downstream status: wallet hold, delegated transfer, payout/offramp routing, local delivery, retries, returns, and support.

The app UI should make this clear. "Payment complete" is not the same as "recipient paid out" unless the downstream route has also completed.

## Step 7: Hold Funds Or Move Them Onward

After Stripe delivers USDC to the sender wallet, the developer app decides what happens next.

This sample supports two modes:

- `Hold in wallet`: USDC remains in Alice's Privy wallet after Onramp fulfillment.
- `Auto send to payout`: after fulfillment, the backend submits a delegated USDC transfer to the payout destination stored on the remittance.

If your product moves funds automatically, use Privy delegated authority and policies to keep that action narrowly scoped. For example, scope by asset, chain, destination, amount, and action type where possible.

This sample uses a preconfigured policy for simplicity. In production, prefer consent-aligned policies. For a one-off remittance, that often means creating or selecting a narrow policy for the specific remittance intent once the destination, amount, asset, chain, and expiry are known. For a wallet or balance product with repeated transfers, a per-wallet policy with explicit limits and approved destinations may fit better.

The downstream destination depends on the product. It could be Bob's wallet, an offramp provider address, or another approved route supported by the developer app. This demo asks for an EVM address on the landing page and persists it locally before sending it with remittance creation. A production app should normally derive or validate that address from its selected payout route.

## Configuration Summary

The Expo app reads client configuration from `expo/.env`:

```bash
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_ONRAMP_NETWORK=tempo
EXPO_PUBLIC_PRIVY_APP_ID=...
EXPO_PUBLIC_PRIVY_CLIENT_ID=...
EXPO_PUBLIC_PRIVY_WALLET_SIGNER_ID=...
EXPO_PUBLIC_PRIVY_WALLET_POLICY_IDS=...
```

The web app reads the equivalent configuration from `web/.env`:

```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:3001
VITE_ONRAMP_NETWORK=tempo
VITE_PRIVY_APP_ID=...
VITE_PRIVY_WALLET_SIGNER_ID=...
VITE_PRIVY_WALLET_POLICY_IDS=...
```

Privy app clients are optional for React web. Only set `VITE_PRIVY_CLIENT_ID` when using a dedicated web app client; do not reuse the mobile app client ID.

The backend reads server configuration from `backend/.env`. It needs Stripe credentials:

```bash
STRIPE_SECRET_KEY=sk_test_...
OAUTH_CLIENT_ID=...
OAUTH_CLIENT_SECRET=...
DATABASE_URL=postgresql://remittance:remittance@localhost:5432/remittance
```

It also needs Privy credentials:

```bash
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
PRIVY_APP_AUTHORIZATION_PRIVATE_KEY=...
PRIVY_SPONSOR_GAS=true
```

The sample backend verifies Privy access tokens with Privy's JWKS-backed SDK verifier. You do not need to provide a separate Privy public verification key. The Privy signer ID and policy IDs are configured in the client apps because the sender grants delegated authority from the client.

And the downstream transfer configuration:

```bash
REMITTANCE_ONRAMP_NETWORK=tempo
PRIVY_CAIP2=eip155:4217
USDC_CONTRACT_ADDRESS=0x...
```

When running on a physical device, set `EXPO_PUBLIC_API_URL` to your computer's local network IP address instead of `localhost`.

## Sample Reference

This sample is one implementation of the recipe. The main integration points are:

| Area | Files |
|------|-------|
| App navigation and screens | `expo/src/navigation/AppNavigator.tsx`, `expo/src/screens/*` |
| Mobile API client | `expo/src/api/client.ts` |
| Stripe React Native SDK wrapper | `expo/src/hooks/useOnramp.ts` |
| Web flow orchestration | `web/src/RemittanceFlow.tsx` |
| Web navigation and screens | `web/src/components/AppShell.tsx`, `web/src/screens/*` |
| Web API client | `web/src/api.ts` |
| Backend entrypoint | `backend/server.ts` |
| Link auth and saved Onramp user state | `backend/routes/auth.ts` |
| Onramp customer and limits helpers | `backend/routes/onramp.ts` |
| Wallet, remittance, fulfillment, payout handoff | `backend/routes/remittances.ts` |
| Durable workflow storage | `backend/db/schema.ts`, `backend/db/store.ts` |

The sample backend exposes these routes:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/auth/create` | Create a LinkAuthIntent |
| POST | `/v1/auth/save_user` | Store crypto customer ID and Link OAuth tokens |
| GET | `/v1/onramp/customer/:id` | Read Onramp customer/KYC status |
| GET | `/v1/onramp/limits` | Read Onramp transaction limits |
| POST | `/v1/remittance_wallet` | Attach and verify the sender's client-created Privy wallet |
| POST | `/v1/remittances` | Validate the payout destination and create a Stripe Onramp session plus local remittance |
| POST | `/v1/remittances/:remittanceId/quote` | Refresh the Onramp quote |
| POST | `/v1/remittances/:remittanceId/checkout` | Complete checkout and return SDK client secret |
| GET | `/v1/remittances/:remittanceId` | Read local remittance status, optionally syncing from Stripe |
| POST | `/v1/remittances/:remittanceId/transfer` | Submit delegated payout/offramp transfer |
| POST | `/v1/webhooks/stripe` | Receive Onramp fulfillment webhooks |

## Production Checklist

- Verify Stripe webhook signatures.
- Make backend state transitions idempotent.
- Store user consent records for wallet creation and delegated wallet actions.
- Treat stored Link OAuth tokens as secrets and restrict database access.
- Keep Privy authorization keys server-side.
- Scope Privy delegated signer and policy controls as narrowly as possible.
- Derive or allowlist payout destinations instead of trusting arbitrary client input.
- Do not depend on a foreground client app to advance funds after Onramp fulfillment.
- Track downstream payout/offramp status separately from Stripe Onramp status.
- Define support and return handling for failed or delayed downstream payout.
