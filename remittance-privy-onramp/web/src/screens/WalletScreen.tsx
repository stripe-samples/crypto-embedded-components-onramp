import { LockKeyhole } from 'lucide-react';
import { PrimaryButton, SummaryRow } from '../components/ui';
import type { TransferIntent } from '../types';
import { shorten } from '../utils';

type SetupStage = 'idle' | 'creating_wallet' | 'authorizing_wallet' | 'attaching_wallet' | 'ready';

export function WalletScreen({
  busy,
  isHoldMode,
  onContinue,
  onPrepare,
  payoutDestinationAddress,
  routeNetworkName,
  stage,
  transfer,
  walletIsReady,
}: {
  busy: boolean;
  isHoldMode: boolean;
  onContinue: () => void;
  onPrepare: () => void;
  payoutDestinationAddress: string;
  routeNetworkName: string;
  stage: SetupStage;
  transfer: TransferIntent;
  walletIsReady: boolean;
}) {
  return (
    <section className="screen">
      <div className="kicker">Wallet consent</div>
      <h2>{walletIsReady ? 'Wallet authorized' : 'Authorize this transfer'}</h2>
      <p>
        {walletIsReady
          ? 'Your Privy wallet is ready to receive USDC from Stripe Onramp.'
          : 'The developer app needs your consent to use its wallet-backed remittance flow for this transfer.'}
      </p>
      <div className="summary-card">
        <SummaryRow label="Transfer" value={`$${transfer.amountUsd || '0'} USD`} />
        <SummaryRow label="Recipient" value={transfer.recipientName} />
        <SummaryRow label="Route" value={`USDC on ${routeNetworkName}`} />
        <SummaryRow label="Payout wallet" value={shorten(payoutDestinationAddress)} />
        <SummaryRow label="Payout mode" value={isHoldMode ? 'Hold in wallet' : 'Auto send to payout'} />
      </div>
      <div className="consent-card">
        <LockKeyhole size={20} />
        <div>
          <strong>What you authorize</strong>
          <p>
            The developer app may create or reuse your Privy wallet, receive USDC
            from Stripe Onramp on {routeNetworkName}, and move those funds to
            complete this remittance.
          </p>
          <p>
            The wallet is yours. The developer app handles the remittance flow and
            uses delegated authority only for the payout handoff described here.
          </p>
        </div>
      </div>
      <PrimaryButton loading={busy} onClick={walletIsReady ? onContinue : onPrepare}>
        {walletIsReady ? 'Continue' : 'Authorize and continue'}
      </PrimaryButton>
      {busy ? (
        <p className="muted centered">
          {stage === 'authorizing_wallet'
            ? 'Adding delegated payout authority...'
            : stage === 'attaching_wallet'
              ? 'Saving wallet for this transfer...'
              : 'Preparing your wallet...'}
        </p>
      ) : null}
    </section>
  );
}
