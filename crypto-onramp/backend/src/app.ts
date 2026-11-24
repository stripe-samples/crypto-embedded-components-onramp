import cors from 'cors';
import express, { type Express } from 'express';

export interface AppOptions {
  corsAllowedOrigins?: readonly string[];
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const allowedOrigins = [...(options.corsAllowedOrigins ?? [])];

  app.disable('x-powered-by');
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

  return app;
}

export const app = createApp();
