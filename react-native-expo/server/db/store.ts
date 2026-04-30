import crypto from 'crypto';
import { Request } from 'express';

export interface UserRecord {
  password: string;
  cryptoCustomerId: string | null;
  linkAuthIntentId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}

export interface UserWithMeta extends UserRecord {
  email: string;
  token: string;
}

const users = new Map<string, UserRecord>();
const tokens = new Map<string, string>();

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function createUser(email: string, password: string): string | null {
  if (users.has(email)) return null;
  users.set(email, {
    password,
    cryptoCustomerId: null,
    linkAuthIntentId: null,
    accessToken: null,
    refreshToken: null,
  });
  const token = generateToken();
  tokens.set(token, email);
  return token;
}

export function authenticateUser(email: string, password: string): string | null {
  const user = users.get(email);
  if (!user || user.password !== password) return null;
  const token = generateToken();
  tokens.set(token, email);
  return token;
}

function getUserByToken(token: string): UserWithMeta | null {
  const email = tokens.get(token);
  if (!email) return null;
  const record = users.get(email);
  if (!record) return null;
  return { email, token, ...record };
}

export function getUserFromRequest(req: Request): UserWithMeta | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  return getUserByToken(auth.slice(7));
}

export function getRecord(email: string): UserRecord | undefined {
  return users.get(email);
}