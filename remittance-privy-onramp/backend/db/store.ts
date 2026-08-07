import crypto from 'crypto';
import { Request } from 'express';
import { type LinkedAccount, type User } from '@privy-io/node';
import { getPrivyClient } from '../utils/privy';

export interface UserRecord {
  privyUserId?: string;
  cryptoCustomerId: string | null;
  linkAuthIntentId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}

export interface UserWithMeta extends UserRecord {
  email: string;
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
const remittances = new Map<string, RemittanceRecord>();
const remittancesByOnrampSession = new Map<string, string>();
const remittanceWallets = new Map<string, RemittanceWalletRecord>();
const remittanceWalletsByOwner = new Map<string, string>();

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function isEmailAccount(account: LinkedAccount): account is Extract<LinkedAccount, { type: 'email' }> {
  return account.type === 'email';
}

function getPrimaryEmail(user: User): string | null {
  const email = user.linked_accounts.find(isEmailAccount)?.address;
  return email ? email.toLowerCase() : null;
}

export function createOrUpdatePrivyUser(email: string, privyUserId: string): UserWithMeta {
  const existing = users.get(email);
  if (existing) {
    existing.privyUserId = privyUserId;
  } else {
    users.set(email, {
      privyUserId,
      cryptoCustomerId: null,
      linkAuthIntentId: null,
      accessToken: null,
      refreshToken: null,
    });
  }
  const record = users.get(email);
  if (!record) throw new Error('Unable to create user record');
  return { email, ...record };
}

export async function getUserFromRequest(req: Request): Promise<UserWithMeta | null> {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;

  const privy = getPrivyClient();
  const verified = await privy.utils().auth().verifyAccessToken(auth.slice(7));
  const privyUser = await privy.users()._get(verified.user_id);
  const email = getPrimaryEmail(privyUser);
  if (!email) {
    throw new Error('Privy user must have a linked email account');
  }
  return createOrUpdatePrivyUser(email, verified.user_id);
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
