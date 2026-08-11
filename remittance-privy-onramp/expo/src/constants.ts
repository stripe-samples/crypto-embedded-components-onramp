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

const TRANSACTION_EXPLORERS: Record<string, string> = {
  base: 'https://base.blockscout.com/tx/',
  base_sepolia: 'https://sepolia.basescan.org/tx/',
  tempo: 'https://explore.tempo.xyz/tx/',
  tempo_testnet: 'https://explore.tempo.xyz/tx/',
};

export function transactionExplorerUrl(network: string, hash: string): string | null {
  const baseUrl = TRANSACTION_EXPLORERS[network];
  return baseUrl ? `${baseUrl}${encodeURIComponent(hash)}` : null;
}

export const DEFAULT_DEMO_NETWORK = process.env.EXPO_PUBLIC_ONRAMP_NETWORK ?? 'tempo';
export const DEFAULT_DEMO_NETWORK_NAME = NETWORK_NAMES[DEFAULT_DEMO_NETWORK] ?? DEFAULT_DEMO_NETWORK;
export const PRIVY_WALLET_SIGNER_ID = process.env.EXPO_PUBLIC_PRIVY_WALLET_SIGNER_ID;
export const PRIVY_WALLET_POLICY_IDS = (process.env.EXPO_PUBLIC_PRIVY_WALLET_POLICY_IDS ?? '')
  .split(',')
  .map((policyId: string) => policyId.trim())
  .filter(Boolean);

export const CURRENCIES_BY_NETWORK: Record<string, string[]> = {
  ethereum: ['eth', 'usdc'],
  bitcoin: ['btc'],
  solana: ['sol'],
  base: ['usdc', 'eth'],
  tempo: ['usdc'],
  tempo_testnet: ['usdc'],
};
