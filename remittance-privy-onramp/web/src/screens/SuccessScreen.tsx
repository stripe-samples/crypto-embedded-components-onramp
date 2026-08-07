import { RefreshCcw } from 'lucide-react';
import { PrimaryButton, SecondaryButton, Spinner } from '../components/ui';
import { Tracker, type TrackerStep } from '../components/Tracker';
import type { CreateRemittanceResponse, RemittanceResponse, TransferIntent } from '../types';

export function SuccessScreen({
  amountText,
  canManuallySend,
  destinationCurrency,
  detailsOpen,
  isHoldMode,
  isOnrampFulfilled,
  onPoll,
  onSend,
  onToggleDetails,
  remittance,
  routeNetworkName,
  statusLoading,
  trackerSteps,
  transfer,
  transferFailed,
  transferLoading,
  transferSubmitted,
  walletAddress,
}: {
  amountText: string;
  canManuallySend: boolean;
  destinationCurrency: string;
  detailsOpen: boolean;
  isHoldMode: boolean;
  isOnrampFulfilled: boolean;
  onPoll: () => void;
  onSend: () => void;
  onToggleDetails: () => void;
  remittance: CreateRemittanceResponse | RemittanceResponse | null;
  routeNetworkName: string;
  statusLoading: boolean;
  trackerSteps: TrackerStep[];
  transfer: TransferIntent;
  transferFailed: boolean;
  transferLoading: boolean;
  transferSubmitted: boolean;
  walletAddress: string | null;
}) {
  return (
    <section className="screen">
      <div className="kicker">Transfer tracker</div>
      <h2>
        {transferSubmitted
          ? 'Payout handoff submitted'
          : transferFailed
            ? 'Payout handoff needs attention'
            : isOnrampFulfilled
              ? isHoldMode
                ? `${destinationCurrency.toUpperCase()} held in wallet`
                : `${destinationCurrency.toUpperCase()} delivered`
              : 'Transfer in progress'}
      </h2>
      <p>
        {isHoldMode && isOnrampFulfilled && !transferSubmitted
          ? `${amountText} for ${transfer.recipientName} is in your Privy wallet.`
          : `${amountText} for ${transfer.recipientName} moves through USDC on ${routeNetworkName}.`}
      </p>
      <Tracker steps={trackerSteps} />
      {canManuallySend ? (
        <div className="manual-card">
          <h3>Ready when you are</h3>
          <p>Funds are in the Privy wallet. Send them to the payout partner to continue this transfer.</p>
          <PrimaryButton loading={transferLoading} onClick={onSend}>Send to payout partner</PrimaryButton>
        </div>
      ) : null}
      <div className="button-row">
        <SecondaryButton disabled={statusLoading} onClick={onPoll}>
          {statusLoading ? <Spinner /> : <RefreshCcw size={18} />} Refresh status
        </SecondaryButton>
        <SecondaryButton onClick={onToggleDetails}>{detailsOpen ? 'Hide details' : 'Show details'}</SecondaryButton>
      </div>
      {detailsOpen ? (
        <div className="details-card">
          {walletAddress ? <code>Wallet: {walletAddress}</code> : null}
          {remittance ? <code>Remittance: {remittance.id}</code> : null}
          {remittance?.onrampSessionId ? <code>Onramp session: {remittance.onrampSessionId}</code> : null}
          {remittance?.stripeStatus ? <code>Stripe status: {remittance.stripeStatus}</code> : null}
          {remittance?.transferHash ? <code>Transfer hash: {remittance.transferHash}</code> : null}
          {remittance?.error ? <code>Error: {remittance.error}</code> : null}
        </div>
      ) : null}
    </section>
  );
}
