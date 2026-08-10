import { NETWORK_NAMES } from './constants';

export function networkName(network: string): string {
  return NETWORK_NAMES[network] ?? network;
}

export function formatCurrency(amount: string | number, currency: string): string {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return `-- ${currency.toUpperCase()}`;
  if (currency.toLowerCase() === 'usd') return `$${value.toFixed(2)}`;
  return `${value} ${currency.toUpperCase()}`;
}

export function shorten(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

export function digitsOnly(value: string, maxLength: number): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

export function formatSsn(value: string): string {
  const raw = digitsOnly(value, 9);
  if (raw.length <= 3) return raw;
  if (raw.length <= 5) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  return `${raw.slice(0, 3)}-${raw.slice(3, 5)}-${raw.slice(5)}`;
}
