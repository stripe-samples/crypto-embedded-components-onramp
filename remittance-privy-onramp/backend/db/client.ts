import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. See backend/.env.example for the local PostgreSQL URL.');
}

export const pool = new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_SIZE ?? (process.env.VERCEL ? 2 : 10)),
});

export const database = drizzle(pool, { schema });
