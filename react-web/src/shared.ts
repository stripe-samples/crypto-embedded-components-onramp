import type { CryptoNetwork } from "@stripe/crypto";

/**
 * A supported (network, destination currency) pair. This table is the single
 * source of truth for both which networks a wallet can be registered on and
 * which destination currencies can be bought onto that network, so the two can
 * never drift apart.
 */
export type DestinationPair = [CryptoNetwork, string];

export const DESTINATION_PAIRS_LIVE: DestinationPair[] = [
  ["solana", "usdc"],
  ["solana", "ripusd"],
  ["solana", "ousd"],
  ["base", "usdc"],
  ["base", "ousd"],
  ["ethereum", "ousd"],
  ["sui", "usdc"],
  ["tempo", "usdc"],
  ["tempo", "ousd"],
  ["celo" as CryptoNetwork, "usdc"],
];

// SUI and Tempo are not supported in Testnet since we use ZeroHash as an LP.
export const DESTINATION_PAIRS_TEST: DestinationPair[] = [
  ["solana", "usdc"],
  ["base", "usdc"],
];

export const getDestinationPairs = (livemode: boolean): DestinationPair[] =>
  livemode ? DESTINATION_PAIRS_LIVE : DESTINATION_PAIRS_TEST;

export const getNetworks = (livemode: boolean): CryptoNetwork[] =>
  Array.from(new Set(getDestinationPairs(livemode).map(([network]) => network)));

export const getCurrenciesForNetwork = (
  network: string | null | undefined,
  livemode: boolean,
): string[] =>
  getDestinationPairs(livemode)
    .filter(([n]) => n === network)
    .map(([, currency]) => currency);

export const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS",
]);

export const isEuCountry = (code: string): boolean =>
  EU_COUNTRIES.has(code.toUpperCase());

export const EXPLORER_URLS: Record<
  string,
  Record<string, (txId: string) => string>
> = {
  live: {
    solana: (txId) => `https://solscan.io/tx/${txId}`,
    base: (txId) => `https://basescan.org/tx/${txId}`,
    ethereum: (txId) => `https://etherscan.io/tx/${txId}`,
    sui: (txId) => `https://suiscan.xyz/mainnet/tx/${txId}`,
    tempo: (txId) => `https://explore.tempo.xyz/tx/${txId}`,
    celo: (txId) => `https://celoscan.io/tx/${txId}`,
  },
  test: {
    solana: (txId) => `https://solscan.io/tx/${txId}?cluster=devnet`,
    base: (txId) => `https://sepolia.basescan.org/tx/${txId}`,
    // SUI and Tempo are not supported in Testnet since we use ZeroHash as an LP
  },
};

export const getExplorerUrl = (
  txId: string,
  network: string,
  livemode: boolean,
): string | null => {
  const env = livemode ? "live" : "test";
  return EXPLORER_URLS[env]?.[network]?.(txId) ?? null;
};
