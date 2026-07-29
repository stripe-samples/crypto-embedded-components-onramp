# Integration Guide

This guide explains how to combine Stripe Embedded Components Onramp and Privy wallets to build a stablecoin remittance app.

Use the official Stripe and Privy docs for the baseline product integrations. This guide focuses on the remittance-specific parts: using a sender-owned Privy wallet as the Onramp destination, collecting consent for wallet-backed movement, and handling what happens after Stripe delivers USDC to the wallet.

For the product model and flow of funds, see the [recipe overview](stablecoin-remittance-recipe.md).

## Before You Start

Start with the official docs for the underlying products:

- [Stripe Embedded Components Onramp integration guide](https://docs.stripe.com/crypto/onramp/embedded-components-integration-guide)
- [Privy server-side user wallets](https://docs.privy.io/recipes/wallets/server-side-user-wallets)
- [Privy delegated permissions](https://docs.privy.io/controls/common-use-cases/delegation)
- [Privy wallet policies](https://docs.privy.io/controls/policies/overview)
- [Privy gas sponsorship](https://docs.privy.io/wallets/gas-and-asset-management/gas/overview)

The Stripe docs cover the normal Onramp flow: Link auth, wallet registration, quotes, checkout, and fulfillment. The Privy docs cover wallet creation, delegated authority, policies, and gas sponsorship.

This guide assumes you are building a flow like:

1. Alice wants to send value to Bob.
2. Alice signs in to the developer app and authorizes with Link for Stripe Onramp.
3. The developer app creates or reuses Alice's Privy wallet.
4. Stripe Onramp delivers USDC to Alice's wallet.
5. The developer app either holds USDC in Alice's wallet or moves it onward through a payout/offramp route.

## Step 1: Authenticate The Sender

Use your own app authentication for the sender. Use Link for the Stripe Onramp transaction.

Keep those concepts separate:

- App auth identifies Alice inside the developer app.
- Link auth identifies Alice for Stripe Onramp.
- The backend stores the mapping needed to create Onramp sessions for the Link-authenticated Onramp user.

In this sample, the backend creates a Link auth intent and later stores the Link-authenticated Onramp user. A production app should follow the Stripe Embedded Components Onramp guide for the exact Link auth flow.

## Step 2: Create Or Reuse The Sender Wallet

Use Privy's server-side wallet APIs to create or retrieve a wallet for the authenticated app user.

The remittance-specific decision is that this wallet becomes the Stripe Onramp destination. Stripe delivers USDC into the sender's wallet; the developer app controls the post-delivery wallet experience.

Privy's server-side user wallet recipe shows custom authentication with app-issued JWTs. That is a good fit when a developer already has an auth system and wants Privy to verify the app's user identity directly. It is not strictly required for this recipe. Developers can also use Privy auth, such as a linked email account, then create the wallet and configure delegated signer/policy controls server-side.

This sample keeps the setup minimal and uses Privy auth with a linked email account. A production app can choose either model:

- Use Privy auth when you want Privy to authenticate users through linked accounts such as email or social login.
- Use custom auth when you want Privy to authenticate users with JWTs issued by your existing auth system.

The app should collect clear user consent before creating or configuring wallet authority. In this recipe, Alice should understand that:

- A non-custodial wallet is created or reused for her.
- Stripe Onramp will deliver USDC to that wallet.
- The developer app may use delegated authority to move USDC from that wallet for the disclosed remittance flow.

The backend should keep Privy internals server-side. The mobile app only needs the wallet address and network:

```json
{
  "walletAddress": "0x...",
  "network": "tempo",
  "status": "ready"
}
```

Keep Privy user IDs, wallet IDs, signer IDs, policy IDs, and authorization keys on the backend.

## Step 3: Register The Wallet With Stripe Onramp

Before creating the Onramp session, register the sender's wallet address with Stripe Onramp through the Stripe SDK.

This is standard Onramp behavior covered by the Stripe Embedded Components Onramp guide. The only recipe-specific part is where the address comes from: the registered address is Alice's Privy wallet address from Step 2.

## Step 4: Create The Onramp Session

Create a normal Stripe Onramp session.

The remittance-specific part is the session destination:

- `destination_currency=usdc`
- `destination_network=<configured Onramp network>`
- `wallet_address=<sender Privy wallet address>`
- `crypto_customer_id=<Link-authenticated crypto customer>`

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

- `EXPO_PUBLIC_ONRAMP_NETWORK` is used by the mobile app when registering the wallet with Stripe Onramp.
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
- `Auto send to payout`: after fulfillment, the backend submits a delegated USDC transfer to the configured payout/offramp destination.

If your product moves funds automatically, use Privy delegated authority and policies to keep that action narrowly scoped. For example, scope by asset, chain, destination, amount, and action type where possible.

This sample uses a preconfigured policy for simplicity. In production, prefer consent-aligned policies. For a one-off remittance, that often means creating or selecting a narrow policy for the specific remittance intent once the destination, amount, asset, chain, and expiry are known. For a wallet or balance product with repeated transfers, a per-wallet policy with explicit limits and approved destinations may fit better.

The downstream destination depends on the product. It could be Bob's wallet, an offramp provider address, or another approved route supported by the developer app.

## Configuration Summary

The Expo app reads client configuration from `expo/.env`:

```bash
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_ONRAMP_NETWORK=tempo
```

The backend reads server configuration from `backend/.env`. It needs Stripe credentials:

```bash
STRIPE_SECRET_KEY=sk_test_...
OAUTH_CLIENT_ID=...
OAUTH_CLIENT_SECRET=...
```

It also needs Privy credentials:

```bash
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
PRIVY_APP_AUTHORIZATION_PRIVATE_KEY=...
PRIVY_WALLET_SIGNER_ID=...
PRIVY_WALLET_POLICY_IDS=...
PRIVY_SPONSOR_GAS=true
```

And the downstream transfer configuration:

```bash
REMITTANCE_ONRAMP_NETWORK=tempo
REMITTANCE_OFFRAMP_DESTINATION_ADDRESS=0x...
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
| Backend entrypoint | `backend/server.ts` |
| Link auth and sample app auth | `backend/routes/auth.ts` |
| Onramp customer and limits helpers | `backend/routes/onramp.ts` |
| Wallet, remittance, fulfillment, payout handoff | `backend/routes/remittances.ts` |
| In-memory sample storage | `backend/db/store.ts` |

The sample backend exposes these routes:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/auth/signup` | Create a sample app user |
| POST | `/v1/auth/login` | Authenticate a sample app user |
| POST | `/v1/auth/create` | Create a LinkAuthIntent |
| POST | `/v1/auth/save_user` | Store crypto customer ID and Link OAuth tokens |
| GET | `/v1/onramp/customer/:id` | Read Onramp customer/KYC status |
| GET | `/v1/onramp/limits` | Read Onramp transaction limits |
| POST | `/v1/remittance_wallet` | Create or reuse the sender's Privy wallet |
| POST | `/v1/remittances` | Create a Stripe Onramp session and local remittance |
| POST | `/v1/remittances/:remittanceId/quote` | Refresh the Onramp quote |
| POST | `/v1/remittances/:remittanceId/checkout` | Complete checkout and return SDK client secret |
| GET | `/v1/remittances/:remittanceId` | Read local remittance status, optionally syncing from Stripe |
| POST | `/v1/remittances/:remittanceId/transfer` | Submit delegated payout/offramp transfer |
| POST | `/v1/webhooks/stripe` | Receive Onramp fulfillment webhooks |

## Production Checklist

- Replace the in-memory store with durable storage.
- Verify Stripe webhook signatures.
- Make backend state transitions idempotent.
- Store user consent records for wallet creation and delegated wallet actions.
- Keep Privy identifiers, signer IDs, policy IDs, and authorization keys server-side.
- Scope Privy delegated signer and policy controls as narrowly as possible.
- Do not depend on the foreground mobile app to advance funds after Onramp fulfillment.
- Track downstream payout/offramp status separately from Stripe Onramp status.
- Define support and return handling for failed or delayed downstream payout.
