import 'dotenv/config';

import type { Express } from 'express';

import { createApp } from './create-app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app: Express = createApp(config);

app.listen(config.port, config.host, () => {
  console.log(
    `Crypto Onramp backend is running on http://${config.host}:${config.port}.`,
  );
});
