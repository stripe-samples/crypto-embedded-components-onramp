export const MERCHANT_DISPLAY_NAME = 'Remittance Demo';
export const DEMO_PAYOUT_PARTNER = 'payout partner';

export const NETWORK_NAMES: Record<string, string> = {
  ethereum: 'Ethereum',
  bitcoin: 'Bitcoin',
  solana: 'Solana',
  base: 'Base',
  base_sepolia: 'Base Sepolia',
  tempo: 'Tempo',
  tempo_testnet: 'Tempo Testnet',
};

export const CURRENCIES_BY_NETWORK: Record<string, string[]> = {
  ethereum: ['eth', 'usdc'],
  bitcoin: ['btc'],
  solana: ['sol'],
  base: ['usdc', 'eth'],
  tempo: ['usdc'],
  tempo_testnet: ['usdc'],
};

export const DEFAULT_DEMO_NETWORK =
  import.meta.env.VITE_ONRAMP_NETWORK ?? 'tempo';

export const DEFAULT_KYC_TIER = 'L1' as const;

export const LOCAL_LIMITS = {
  L0: { limit: 300 },
  L1: { limit: 800 },
  L2: { limit: 1500 },
};

export const DEFAULT_TRANSFER = {
  amountUsd: '1',
  recipientName: 'Bob Garcia',
  recipientDestination: 'BBVA Mexico ending 4832',
  payoutCountry: 'Mexico',
  payoutMode: 'auto_send_to_payout' as const,
};

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
export const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;
export const PRIVY_CLIENT_ID = import.meta.env.VITE_PRIVY_CLIENT_ID;
export const PRIVY_WALLET_SIGNER_ID = import.meta.env.VITE_PRIVY_WALLET_SIGNER_ID;
export const PRIVY_WALLET_POLICY_IDS = (import.meta.env.VITE_PRIVY_WALLET_POLICY_IDS ?? '')
  .split(',')
  .map((value: string) => value.trim())
  .filter(Boolean);
