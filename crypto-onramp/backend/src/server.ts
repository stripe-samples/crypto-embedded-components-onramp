import 'dotenv/config';

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { Server } from 'node:http';

import { createApp } from './app.js';
import { loadConfig, type AppConfig } from './config.js';

export function startServer(config: AppConfig = loadConfig()): Server {
  const app = createApp(config);

  return app.listen(config.port, config.host, () => {
    console.log(
      `Crypto Onramp backend is running on http://${config.host}:${config.port}.`,
    );
  });
}

const entrypoint = process.argv[1];
if (entrypoint && pathToFileURL(resolve(entrypoint)).href === import.meta.url) {
  startServer();
}
