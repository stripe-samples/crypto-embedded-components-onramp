import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const remittanceStatus = pgEnum('remittance_status', [
  'onramp_session_created',
  'onramp_fulfilled',
  'transfer_in_progress',
  'transfer_submitted',
  'transfer_failed',
]);

export const users = pgTable('users', {
  privyUserId: text('privy_user_id').primaryKey(),
  cryptoCustomerId: text('crypto_customer_id'),
  linkAuthIntentId: text('link_auth_intent_id'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const remittanceWallets = pgTable('remittance_wallets', {
  id: text('id').primaryKey(),
  ownerPrivyUserId: text('owner_privy_user_id')
    .notNull()
    .references(() => users.privyUserId, { onDelete: 'cascade' }),
  walletAddress: text('wallet_address').notNull(),
  network: text('network').notNull(),
  privyWalletId: text('privy_wallet_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('remittance_wallets_owner_idx').on(table.ownerPrivyUserId),
  uniqueIndex('remittance_wallets_privy_wallet_idx').on(table.privyWalletId),
]);

export const remittances = pgTable('remittances', {
  id: text('id').primaryKey(),
  ownerPrivyUserId: text('owner_privy_user_id')
    .notNull()
    .references(() => users.privyUserId, { onDelete: 'cascade' }),
  remittanceWalletId: text('remittance_wallet_id')
    .notNull()
    .references(() => remittanceWallets.id),
  onrampSessionId: text('onramp_session_id').notNull(),
  walletAddress: text('wallet_address').notNull(),
  network: text('network').notNull(),
  privyWalletId: text('privy_wallet_id').notNull(),
  offrampDestinationAddress: text('offramp_destination_address').notNull(),
  status: remittanceStatus('status').default('onramp_session_created').notNull(),
  transferAttemptCount: integer('transfer_attempt_count').default(0).notNull(),
  transferHash: text('transfer_hash'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('remittances_onramp_session_idx').on(table.onrampSessionId),
]);

export type UserRow = typeof users.$inferSelect;
export type RemittanceWalletRow = typeof remittanceWallets.$inferSelect;
export type RemittanceRow = typeof remittances.$inferSelect;
