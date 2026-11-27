## Description

Demo app for the Stripe Embedded Components Onramp Web SDK.

The app uses the consolidated backend in `../crypto-onramp/backend`.

## Development

Set up the backend first:

```sh
cd ../crypto-onramp/backend
cp .env.example .env
npm ci
```

Then install and run the web app from this directory:

```sh
npm ci
npm run dev
```

`npm run dev` starts the backend on `http://localhost:3001` and the React app on
`http://localhost:5173`. To use a deployed backend instead, set
`VITE_BACKEND_URL` in `.env` and run `npm start`.
