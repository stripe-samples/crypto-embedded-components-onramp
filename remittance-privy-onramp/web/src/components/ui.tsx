import type { HTMLAttributes, ReactNode } from 'react';
import { Check, Loader2, Send, Wallet } from 'lucide-react';
import type { KycTier, PayoutMode } from '../types';

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap">
      <Loader2 className="spinner" size={18} />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export function PrimaryButton({
  children,
  disabled,
  loading,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button className="button button-primary" disabled={disabled || loading} onClick={onClick} type={type}>
      {loading ? <Spinner /> : children}
    </button>
  );
}

export function SecondaryButton({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button className="button button-secondary" disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
      />
    </label>
  );
}

export function ModeSelector({
  value,
  onChange,
}: {
  value: PayoutMode;
  onChange: (value: PayoutMode) => void;
}) {
  return (
    <div className="mode-grid" role="radiogroup" aria-label="Payout mode">
      <button
        className={`mode-card ${value === 'hold_in_wallet' ? 'selected' : ''}`}
        onClick={() => onChange('hold_in_wallet')}
        type="button"
      >
        <Wallet size={18} />
        <span>Hold in wallet</span>
        <small>USDC stays in the Privy wallet until the sender sends it to payout.</small>
      </button>
      <button
        className={`mode-card ${value === 'auto_send_to_payout' ? 'selected' : ''}`}
        onClick={() => onChange('auto_send_to_payout')}
        type="button"
      >
        <Send size={18} />
        <span>Auto send to payout</span>
        <small>After Stripe delivery, the developer backend automatically sends funds to its payout partner.</small>
      </button>
    </div>
  );
}

export function TierBadge({ tier }: { tier: KycTier | string }) {
  return <div className="tier-badge">{tier}</div>;
}

export function BulletList({ items }: { items: string[] }) {
  return (
    <div className="bullet-list">
      {items.map((item) => (
        <div key={item}>
          <Check size={16} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

export function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
