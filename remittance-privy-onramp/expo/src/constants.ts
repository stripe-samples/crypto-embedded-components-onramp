export const MERCHANT_DISPLAY_NAME = 'Remittance Demo';
export const DEMO_PAYOUT_PARTNER = 'payout partner';

export const SERVICE_TIMEOUT_ERROR = 'The service timed out processing your request. Please try again.';

export const CURRENCY_NAMES: Record<string, string> = {
  eth: 'Ethereum',
  btc: 'Bitcoin',
  usdc: 'USD Coin',
  sol: 'Solana',
};

export const NETWORK_NAMES: Record<string, string> = {
  ethereum: 'Ethereum',
  bitcoin: 'Bitcoin',
  solana: 'Solana',
  base: 'Base',
  base_sepolia: 'Base Sepolia',
  tempo: 'Tempo',
  tempo_testnet: 'Tempo Testnet',
};

export const DEFAULT_DEMO_NETWORK = process.env.EXPO_PUBLIC_ONRAMP_NETWORK ?? 'tempo';
export const DEFAULT_DEMO_NETWORK_NAME = NETWORK_NAMES[DEFAULT_DEMO_NETWORK] ?? DEFAULT_DEMO_NETWORK;

export const CURRENCIES_BY_NETWORK: Record<string, string[]> = {
  ethereum: ['eth', 'usdc'],
  bitcoin: ['btc'],
  solana: ['sol'],
  base: ['usdc', 'eth'],
  tempo: ['usdc'],
};
