# Crypto Onramp

This directory contains a shared backend and Expo and web examples for Stripe Crypto Onramp.

## Projects

- [`backend/`](backend/README.md) — Shared Node.js API used by both clients.
- [`expo/`](expo/README.md) — Expo React Native app.
- [`web/`](web/README.md) — Vite React web app.

## Run locally

Install all three projects from this directory:

```sh
npm run install:all
```

Follow each project's README to configure its environment. Start the backend first:

```sh
npm run backend
```

Run Expo on iOS or Android:

```sh
npm run expo:ios
# or
npm run expo:android
```

Or start the web app:

```sh
npm run web
```
