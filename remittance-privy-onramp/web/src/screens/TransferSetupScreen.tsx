import { PrimaryButton, TextField } from '../components/ui';
import type { TransferIntent } from '../types';

export function TransferSetupScreen({
  onChange,
  onContinue,
  transfer,
}: {
  onChange: (updates: Partial<TransferIntent>) => void;
  onContinue: () => void;
  transfer: TransferIntent;
}) {
  return (
    <section className="screen">
      <div className="kicker">Transfer details</div>
      <h2>Who are you sending to?</h2>
      <p>
        Enter the transfer amount and recipient details. The developer app will
        handle the payment and payout flow after this.
      </p>
      <div className="amount-card">
        <span>You send</span>
        <div className="amount-row">
          <span>$</span>
          <input
            value={transfer.amountUsd}
            onChange={(event) => onChange({ amountUsd: event.target.value })}
            inputMode="decimal"
            aria-label="Amount in USD"
          />
          <strong>USD</strong>
        </div>
      </div>
      <div className="form">
        <TextField label="Recipient" value={transfer.recipientName} onChange={(recipientName) => onChange({ recipientName })} />
        <TextField label="Destination" value={transfer.recipientDestination} onChange={(recipientDestination) => onChange({ recipientDestination })} />
      </div>
      <PrimaryButton onClick={onContinue}>Continue</PrimaryButton>
    </section>
  );
}
