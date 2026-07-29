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

export interface RemittanceRecord {
  id: string;
  ownerEmail: string;
  remittanceWalletId: string;
  onrampSessionId: string;
  walletAddress: string;
  network: string;
  privyWalletId: string;
  privyUserId?: string;
  offrampDestinationAddress: string;
  status: 'onramp_session_created' | 'onramp_fulfilled' | 'transfer_submitted' | 'transfer_failed';
  transferAttemptCount: number;
  transferHash?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RemittanceWalletRecord {
  id: string;
  ownerEmail: string;
  walletAddress: string;
  network: string;
  privyUserId: string;
  privyWalletId: string;
  offrampDestinationAddress: string;
  createdAt: number;
  updatedAt: number;
}

const users = new Map<string, UserRecord>();
const tokens = new Map<string, string>();
const remittances = new Map<string, RemittanceRecord>();
const remittancesByOnrampSession = new Map<string, string>();
const remittanceWallets = new Map<string, RemittanceWalletRecord>();
const remittanceWalletsByOwner = new Map<string, string>();

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

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

export function upsertRemittanceWallet(
  input: Omit<RemittanceWalletRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): RemittanceWalletRecord {
  const now = Date.now();
  const existingId = input.id ?? remittanceWalletsByOwner.get(input.ownerEmail);
  const existing = existingId ? remittanceWallets.get(existingId) : undefined;
  const id = existing?.id ?? `rw_${crypto.randomBytes(8).toString('hex')}`;
  const record: RemittanceWalletRecord = {
    ...input,
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  remittanceWallets.set(id, record);
  remittanceWalletsByOwner.set(input.ownerEmail, id);
  return record;
}

export function getRemittanceWallet(id: string): RemittanceWalletRecord | undefined {
  return remittanceWallets.get(id);
}

export function getRemittanceWalletForOwner(ownerEmail: string): RemittanceWalletRecord | undefined {
  const id = remittanceWalletsByOwner.get(ownerEmail);
  return id ? remittanceWallets.get(id) : undefined;
}

export function getRemittanceWalletForDestination(
  ownerEmail: string,
  walletAddress: string,
  network: string,
): RemittanceWalletRecord | undefined {
  const normalizedAddress = normalizeAddress(walletAddress);
  return Array.from(remittanceWallets.values()).find(record =>
    record.ownerEmail === ownerEmail &&
    normalizeAddress(record.walletAddress) === normalizedAddress &&
    record.network === network
  );
}

export function createRemittance(
  input: Omit<RemittanceRecord, 'id' | 'status' | 'transferAttemptCount' | 'createdAt' | 'updatedAt'>,
): RemittanceRecord {
  const now = Date.now();
  const record: RemittanceRecord = {
    ...input,
    id: `remit_${crypto.randomBytes(8).toString('hex')}`,
    status: 'onramp_session_created',
    transferAttemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  remittances.set(record.id, record);
  remittancesByOnrampSession.set(input.onrampSessionId, record.id);
  return record;
}

export function getRemittance(id: string): RemittanceRecord | undefined {
  return remittances.get(id);
}

export function getRemittanceByOnrampSession(onrampSessionId: string): RemittanceRecord | undefined {
  const id = remittancesByOnrampSession.get(onrampSessionId);
  return id ? remittances.get(id) : undefined;
}

export function updateRemittance(
  id: string,
  patch: Partial<Omit<RemittanceRecord, 'id' | 'onrampSessionId' | 'createdAt'>>,
): RemittanceRecord | undefined {
  const record = remittances.get(id);
  if (!record) return undefined;
  const updated = { ...record, ...patch, updatedAt: Date.now() };
  remittances.set(id, updated);
  return updated;
}
