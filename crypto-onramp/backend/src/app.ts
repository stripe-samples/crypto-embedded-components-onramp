import cors from 'cors';
import express, { type Express } from 'express';

import { createCustomersRouter } from './routes/customers.js';
import { createLinkRouter, getPublicConfig } from './routes/link.js';
import { createOnrampRouter } from './routes/onramp.js';
import type { AppConfig } from './config.js';
import { ApiError, errorHandler } from './errors.js';
import { createStripeClient, type StripeFactory } from './stripe.js';
import { parseLivemodeQuery } from './validation.js';

export interface AppOverrides {
  fetch?: typeof globalThis.fetch;
  stripeFactory?: StripeFactory;
}

export function createApp(
  config: AppConfig,
  overrides: AppOverrides = {},
): Express {
  const app = express();
  const allowedOrigins = [...config.corsAllowedOrigins];
  const fetchImplementation = overrides.fetch ?? globalThis.fetch;
  const stripeFactory = overrides.stripeFactory ?? createStripeClient;

  app.disable('x-powered-by');
  if (config.trustedProxyHops > 0) {
    app.set('trust proxy', config.trustedProxyHops);
  }
  app.use(
    cors({
      allowedHeaders: ['Authorization', 'Content-Type'],
      methods: ['GET', 'POST'],
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.get('/config', (request, response) => {
    const livemode = parseLivemodeQuery(request.query.livemode);
    response.status(200).json(getPublicConfig(config, livemode));
  });

  app.use(
    '/link',
    createLinkRouter(config, fetchImplementation, stripeFactory),
  );
  app.use(
    '/customers',
    createCustomersRouter(config, fetchImplementation, stripeFactory),
  );
  app.use(
    '/onramp',
    createOnrampRouter(config, fetchImplementation, stripeFactory),
  );

  app.use((_request, _response, next) => {
    next(new ApiError(404, 'not_found', 'Route not found.'));
  });
  app.use(errorHandler);

  return app;
}
