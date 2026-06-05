import type { CryptoNetwork } from "@stripe/crypto";

export const NETWORKS_LIVE: CryptoNetwork[] = ["solana", "base", "sui", "tempo"];
export const NETWORKS_TEST: CryptoNetwork[] = ["solana", "base"];

export const getNetworks = (livemode: boolean): CryptoNetwork[] =>
  livemode ? NETWORKS_LIVE : NETWORKS_TEST;

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
    sui: (txId) => `https://suiscan.xyz/mainnet/tx/${txId}`,
    tempo: (txId) => `https://explore.tempo.xyz/tx/${txId}`,
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
