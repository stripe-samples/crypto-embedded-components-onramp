export const MERCHANT_DISPLAY_NAME = 'My Crypto App';

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
};

export const CURRENCIES_BY_NETWORK: Record<string, string[]> = {
  ethereum: ['eth', 'usdc'],
  bitcoin: ['btc'],
  solana: ['sol'],
  base: ['eth'],
};
