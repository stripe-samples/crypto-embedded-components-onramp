import crypto from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { Request } from 'express';
import { type LinkedAccount, type User } from '@privy-io/node';
import { database } from './client';
import {
  remittances,
  remittanceWallets,
  users,
  type RemittanceRow,
  type RemittanceWalletRow,
  type UserRow,
} from './schema';
import { getPrivyClient } from '../utils/privy';

export interface UserRecord {
  privyUserId: string;
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
  ownerPrivyUserId: string;
  remittanceWalletId: string;
  onrampSessionId: string;
  walletAddress: string;
  network: string;
  privyWalletId: string;
  offrampDestinationAddress: string;
  status: 'onramp_session_created' | 'onramp_fulfilled' | 'transfer_in_progress' | 'transfer_submitted' | 'transfer_failed';
  transferAttemptCount: number;
  transferHash?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RemittanceWalletRecord {
  id: string;
  ownerPrivyUserId: string;
  walletAddress: string;
  network: string;
  privyWalletId: string;
  offrampDestinationAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

function isEmailAccount(account: LinkedAccount): account is Extract<LinkedAccount, { type: 'email' }> {
  return account.type === 'email';
}

function getPrimaryEmail(user: User): string | null {
  const email = user.linked_accounts.find(isEmailAccount)?.address;
  return email ? email.toLowerCase() : null;
}

function toUserRecord(row: UserRow): UserWithMeta {
  return {
    email: row.email,
    privyUserId: row.privyUserId,
    cryptoCustomerId: row.cryptoCustomerId,
    linkAuthIntentId: row.linkAuthIntentId,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
  };
}

function toRemittanceWalletRecord(row: RemittanceWalletRow): RemittanceWalletRecord {
  return row;
}

function toRemittanceRecord(row: RemittanceRow): RemittanceRecord {
  return {
    ...row,
    transferHash: row.transferHash ?? undefined,
    error: row.error ?? undefined,
  };
}

export async function createOrUpdatePrivyUser(email: string, privyUserId: string): Promise<UserWithMeta> {
  const [row] = await database
    .insert(users)
    .values({ privyUserId, email })
    .onConflictDoUpdate({
      target: users.privyUserId,
      set: { email, updatedAt: new Date() },
    })
    .returning();

  return toUserRecord(row);
}

export async function getUserFromRequest(req: Request): Promise<UserWithMeta | null> {
  const auth = req.headers.authorization;
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

export async function getRecord(privyUserId: string): Promise<UserWithMeta | undefined> {
  const [row] = await database.select().from(users).where(eq(users.privyUserId, privyUserId)).limit(1);
  return row ? toUserRecord(row) : undefined;
}

export async function setLinkAuthIntent(privyUserId: string, linkAuthIntentId: string): Promise<void> {
  await database
    .update(users)
    .set({ linkAuthIntentId, updatedAt: new Date() })
    .where(eq(users.privyUserId, privyUserId));
}

export async function saveOnrampUser(
  privyUserId: string,
  input: {
    cryptoCustomerId: string;
    accessToken: string;
    refreshToken: string | null;
  },
): Promise<void> {
  await database
    .update(users)
    .set({
      cryptoCustomerId: input.cryptoCustomerId,
      linkAuthIntentId: null,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      updatedAt: new Date(),
    })
    .where(eq(users.privyUserId, privyUserId));
}

export async function updateOAuthTokens(
  privyUserId: string,
  accessToken: string,
  refreshToken?: string,
): Promise<void> {
  await database
    .update(users)
    .set({
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.privyUserId, privyUserId));
}

export async function upsertRemittanceWallet(
  input: Omit<RemittanceWalletRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<RemittanceWalletRecord> {
  const now = new Date();
  const id = input.id ?? `rw_${crypto.randomBytes(8).toString('hex')}`;
  const walletAddress = input.walletAddress.toLowerCase();
  const [row] = await database
    .insert(remittanceWallets)
    .values({ ...input, id, walletAddress, updatedAt: now })
    .onConflictDoUpdate({
      target: remittanceWallets.ownerPrivyUserId,
      set: {
        walletAddress,
        network: input.network,
        privyWalletId: input.privyWalletId,
        offrampDestinationAddress: input.offrampDestinationAddress,
        updatedAt: now,
      },
    })
    .returning();

  return toRemittanceWalletRecord(row);
}

export async function getRemittanceWallet(id: string): Promise<RemittanceWalletRecord | undefined> {
  const [row] = await database.select().from(remittanceWallets).where(eq(remittanceWallets.id, id)).limit(1);
  return row ? toRemittanceWalletRecord(row) : undefined;
}

export async function getRemittanceWalletForDestination(
  ownerPrivyUserId: string,
  walletAddress: string,
  network: string,
): Promise<RemittanceWalletRecord | undefined> {
  const [row] = await database
    .select()
    .from(remittanceWallets)
    .where(and(
      eq(remittanceWallets.ownerPrivyUserId, ownerPrivyUserId),
      eq(remittanceWallets.walletAddress, walletAddress.toLowerCase()),
      eq(remittanceWallets.network, network),
    ))
    .limit(1);
  return row ? toRemittanceWalletRecord(row) : undefined;
}

export async function createRemittance(
  input: Omit<RemittanceRecord, 'id' | 'status' | 'transferAttemptCount' | 'createdAt' | 'updatedAt'>,
): Promise<RemittanceRecord> {
  const [row] = await database
    .insert(remittances)
    .values({
      ...input,
      id: `remit_${crypto.randomBytes(8).toString('hex')}`,
    })
    .returning();
  return toRemittanceRecord(row);
}

export async function getRemittance(id: string): Promise<RemittanceRecord | undefined> {
  const [row] = await database.select().from(remittances).where(eq(remittances.id, id)).limit(1);
  return row ? toRemittanceRecord(row) : undefined;
}

export async function getRemittanceByOnrampSession(
  onrampSessionId: string,
): Promise<RemittanceRecord | undefined> {
  const [row] = await database
    .select()
    .from(remittances)
    .where(eq(remittances.onrampSessionId, onrampSessionId))
    .limit(1);
  return row ? toRemittanceRecord(row) : undefined;
}

export async function updateRemittance(
  id: string,
  patch: Partial<Omit<RemittanceRecord, 'id' | 'onrampSessionId' | 'createdAt' | 'error' | 'transferHash'>> & {
    error?: string | null;
    transferHash?: string | null;
  },
): Promise<RemittanceRecord | undefined> {
  const [row] = await database
    .update(remittances)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(remittances.id, id))
    .returning();
  return row ? toRemittanceRecord(row) : undefined;
}

export async function markRemittanceFulfilled(id: string): Promise<RemittanceRecord | undefined> {
  const [updated] = await database
    .update(remittances)
    .set({ status: 'onramp_fulfilled', error: null, updatedAt: new Date() })
    .where(and(
      eq(remittances.id, id),
      eq(remittances.status, 'onramp_session_created'),
    ))
    .returning();

  if (updated) return toRemittanceRecord(updated);
  return getRemittance(id);
}

export async function claimRemittanceTransfer(id: string): Promise<RemittanceRecord | undefined> {
  const [row] = await database
    .update(remittances)
    .set({
      status: 'transfer_in_progress',
      transferAttemptCount: sql`${remittances.transferAttemptCount} + 1`,
      transferHash: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(remittances.id, id),
      inArray(remittances.status, ['onramp_fulfilled', 'transfer_failed']),
    ))
    .returning();
  return row ? toRemittanceRecord(row) : undefined;
}
