# Integration Guide

This guide walks through the implementation in this sample. It assumes you already understand the product model from the [recipe overview](stablecoin-remittance-recipe.md).

At a high level, the app does four things:

1. Authenticates the sender with the developer app and Link.
2. Creates or reuses a user-owned, non-custodial Privy wallet for the sender.
3. Creates a normal Stripe Onramp session to that wallet address.
4. Holds the delivered USDC in the wallet or sends it to a payout/offramp destination.

## Source Map

| Area | Files |
|------|-------|
| App navigation and screens | `src/navigation/AppNavigator.tsx`, `src/screens/*` |
| Mobile API client | `src/api/client.ts` |
| Stripe React Native SDK wrapper | `src/hooks/useOnramp.ts` |
| Backend entrypoint | `server/server.ts` |
| Link auth and sample app auth | `server/routes/auth.ts` |
| Onramp customer and limits helpers | `server/routes/onramp.ts` |
| Wallet, remittance, fulfillment, payout handoff | `server/routes/remittances.ts` |
| In-memory sample storage | `server/db/store.ts` |

## 1. Configure Stripe Onramp And Link

The backend needs:

```bash
STRIPE_SECRET_KEY=sk_test_...
OAUTH_CLIENT_ID=...
OAUTH_CLIENT_SECRET=...
```

The mobile app needs:

```bash
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_ONRAMP_NETWORK=tempo
```

The sample backend creates Link auth intents in `server/routes/auth.ts`:

```http
POST /v1/auth/create
Authorization: Bearer <app auth token>
```

After the user completes Link auth in the app, the backend stores the resulting crypto customer ID and exchanges the Link auth intent for OAuth tokens:

```http
POST /v1/auth/save_user
Authorization: Bearer <app auth token>
```

Those OAuth tokens are used by the backend when it calls Stripe Onramp APIs on behalf of the Link-authenticated sender.

## 2. Configure Privy

The backend needs:

```bash
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
PRIVY_APP_AUTHORIZATION_PRIVATE_KEY=...
PRIVY_WALLET_SIGNER_ID=...
PRIVY_WALLET_POLICY_IDS=...
PRIVY_SPONSOR_GAS=true
```

The sample uses Privy's server-side APIs to create or reuse a user-owned, non-custodial wallet:

- The app never receives Privy user IDs, wallet IDs, signer IDs, policy IDs, or authorization keys.
- The backend creates or reuses a Privy user linked to the sample app user's email.
- The backend creates or reuses an embedded EVM wallet for that Privy user.
- If configured, the backend attaches the delegated signer and policy during wallet creation.

The backend is orchestrating wallet setup; it is not the intended owner of the wallet. Once Stripe Onramp delivers USDC to the sender's wallet, funds are held in that user-owned wallet through the selected Privy wallet model, and the developer's post-delivery actions should be based on user consent and narrowly scoped delegated authority.

Production apps should choose the Privy authentication and wallet ownership model that matches their product requirements. This sample keeps the auth model simple so the Onramp + wallet + payout sequence is easy to inspect.

Stripe Onramp handles sender checks for the Onramp transaction. Developers should separately evaluate requirements for their wallet experience, receiver experience, delegated wallet actions, offramps, and local payout routes.

## 3. Align Chain Configuration

The app, Stripe Onramp, Privy, and the USDC contract must all point at the same chain.

```bash
EXPO_PUBLIC_ONRAMP_NETWORK=tempo
REMITTANCE_ONRAMP_NETWORK=tempo
PRIVY_CAIP2=eip155:4217
USDC_CONTRACT_ADDRESS=0x...
```

`EXPO_PUBLIC_ONRAMP_NETWORK` is used by the mobile app when it registers the wallet with Stripe Onramp. `REMITTANCE_ONRAMP_NETWORK` is used by the backend when it creates the Onramp session. `PRIVY_CAIP2` is used for Privy balance lookup and delegated transfer.

## 4. Collect Consent And Prepare The Sender Wallet

The app asks the sender to consent before preparing the wallet. In this sample, the consent covers creating or reusing a non-custodial wallet for the sender, receiving USDC from Stripe Onramp into that wallet, and using delegated authority to send those funds to the configured payout/offramp destination.

After consent, the app calls:

```http
POST /v1/remittance_wallet
Authorization: Bearer <app auth token>
```

Implemented in `server/routes/remittances.ts`, the backend:

1. Resolves the authenticated app user.
2. Creates or retrieves a Privy user for the app user's email.
3. Creates or retrieves the user's embedded EVM wallet.
4. Attaches the configured delegated signer/policy when creating the wallet.
5. Stores the app user, Privy IDs, wallet address, network, and payout/offramp destination.
6. Returns only:

```json
{
  "walletAddress": "0x...",
  "network": "tempo",
  "status": "ready"
}
```

The mobile app uses the returned `walletAddress` as the Stripe Onramp destination. It does not need to know anything about the Privy wallet internals.

This sample keeps consent in the foreground app flow only. Production apps should persist a consent record before creating wallet authority or submitting delegated transfers.

## 5. Register The Wallet With Stripe Onramp

Before creating the Onramp session, the app registers the wallet address with the Link-authenticated Onramp user through the Stripe React Native SDK.

The relevant flow is in:

- `src/screens/WalletScreen.tsx`
- `src/hooks/useOnramp.ts`

This keeps the rest of the flow close to a normal Embedded Components Onramp integration: the registered wallet address becomes the crypto destination for the Onramp session.

## 6. Create The Onramp Session

After wallet registration and payment method selection, the app asks the backend to create a remittance:

```http
POST /v1/remittances
Authorization: Bearer <app auth token>
```

Implemented in `server/routes/remittances.ts`, the backend:

1. Confirms the requested wallet address belongs to the authenticated app user.
2. Creates a Stripe Onramp session with:
   - `destination_currency=usdc`
   - `destination_network=REMITTANCE_ONRAMP_NETWORK`
   - `wallet_address=<sender Privy wallet address>`
   - `crypto_customer_id=<Link-authenticated crypto customer>`
3. Creates a local remittance record keyed by the Onramp session ID.
4. Returns the Onramp session and local remittance ID to the app.

The app then uses the Stripe React Native Onramp SDK for quote refresh, payment method collection, and checkout:

```http
POST /v1/remittances/:remittanceId/quote
POST /v1/remittances/:remittanceId/checkout
```

## 7. Track Fulfillment

In production, use Stripe webhooks:

```http
POST /v1/webhooks/stripe
```

The sample also supports local polling so the flow works without a public webhook tunnel:

```http
GET /v1/remittances/:remittanceId?sync=stripe
Authorization: Bearer <app auth token>
```

The app status tracker treats Onramp fulfillment as the point where Stripe has delivered USDC to the sender's wallet. From that point on, the developer app tracks downstream state.

## 8. Hold Funds Or Send To Payout

The sample has two modes:

- `Hold in wallet`: no transfer is submitted after Onramp fulfillment. USDC remains in the sender's Privy wallet.
- `Auto send to payout`: after fulfillment, the backend submits a delegated USDC transfer to the configured payout/offramp destination.

The sample uses a fixed payout/offramp destination. In a production remittance product, the post-delivery destination could be a receiver wallet, an offramp provider address, or another approved route supported by the developer.

Manual payout handoff uses:

```http
POST /v1/remittances/:remittanceId/transfer
Authorization: Bearer <app auth token>
```

Implemented in `server/routes/remittances.ts`, the backend:

1. Confirms the remittance belongs to the authenticated app user.
2. Confirms Stripe Onramp delivery is fulfilled.
3. Reads the available USDC balance from Privy.
4. Encodes an ERC-20 `transfer` to `REMITTANCE_OFFRAMP_DESTINATION_ADDRESS`.
5. Calls Privy `eth_sendTransaction` with the configured authorization key and gas sponsorship setting.
6. Stores the submitted transaction hash.

The sample clamps the requested transfer amount to the available wallet balance to make test-mode Onramp deliveries easier to exercise locally. A production app should use explicit amounts, idempotency keys, and backend-owned transfer state.

## Backend Routes

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
- Make all backend state transitions idempotent.
- Store user consent records for wallet creation and delegated wallet actions.
- Keep Privy identifiers, signer IDs, policy IDs, and authorization keys server-side.
- Scope Privy delegated signer/policy controls as narrowly as possible.
- Do not depend on the foreground mobile app to advance funds after Onramp fulfillment.
- Track downstream payout/offramp status separately from Stripe Onramp status.
- Define support and return handling for failed or delayed downstream payout.
- Review any requirements for wallet, receiver, offramp, or local payout experiences.
