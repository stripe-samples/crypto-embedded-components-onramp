import { CircleDollarSign } from 'lucide-react';
import type { OnrampCoordinator } from '@stripe/crypto';
import { ModeSelector, PrimaryButton } from '../components/ui';
import { DEFAULT_DEMO_NETWORK, MERCHANT_DISPLAY_NAME } from '../constants';
import type { PayoutMode } from '../types';
import { networkName } from '../utils';

export function HomeScreen({
  onContinue,
  onPayoutModeChange,
  onramp,
  payoutMode,
  privyReady,
  sdkError,
}: {
  onContinue: () => void;
  onPayoutModeChange: (mode: PayoutMode) => void;
  onramp: OnrampCoordinator | null;
  payoutMode: PayoutMode;
  privyReady: boolean;
  sdkError: string | null;
}) {
  return (
    <section className="screen landing-screen">
      <div className="brand-row landing-brand">
        <CircleDollarSign size={24} />
        <span>{MERCHANT_DISPLAY_NAME}</span>
      </div>
      <h2>Send money across borders</h2>
      <p>
        A simplified remittance demo powered by Stripe Onramp, Privy wallets,
        USDC, and {networkName(DEFAULT_DEMO_NETWORK)}.
      </p>
      <div className="value-card">
        <strong>What this shows</strong>
        <span>A sender pays in USD.</span>
        <span>Stripe delivers USDC on {networkName(DEFAULT_DEMO_NETWORK)}.</span>
        <span>The developer app either holds funds in wallet or sends them to payout.</span>
      </div>
      <div className="mode-section">
        <h3>Demo flow</h3>
        <ModeSelector value={payoutMode} onChange={onPayoutModeChange} />
      </div>
      <PrimaryButton disabled={!onramp || !privyReady || !!sdkError} onClick={onContinue}>
        Start demo transfer
      </PrimaryButton>
    </section>
  );
}
