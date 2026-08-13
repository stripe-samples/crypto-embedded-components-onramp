import { PrimaryButton, SummaryRow } from '../components/ui';
import type { QuoteResponse, TransferIntent } from '../types';
import { formatCurrency, shorten } from '../utils';

export function CheckoutScreen({
  checkoutLoading,
  destinationCurrency,
  onCheckout,
  paymentLabel,
  payoutDestinationAddress,
  quote,
  quoteLoading,
  routeNetworkName,
  transfer,
  walletAddress,
}: {
  checkoutLoading: boolean;
  destinationCurrency: string;
  onCheckout: () => void;
  paymentLabel: string;
  payoutDestinationAddress: string;
  quote: QuoteResponse['transaction_details'] | null;
  quoteLoading: boolean;
  routeNetworkName: string;
  transfer: TransferIntent;
  walletAddress: string | null;
}) {
  return (
    <section className="screen">
      <h2>Review transfer</h2>
      <p>
        Confirm the payment for {transfer.recipientName}. Stripe will deliver{' '}
        {destinationCurrency.toUpperCase()} to the sender wallet on {routeNetworkName}.
      </p>
      <div className="summary-card">
        <SummaryRow label="Recipient" value={transfer.recipientName} />
        <SummaryRow label="Destination" value={transfer.recipientDestination} />
        <SummaryRow label="Pay with" value={paymentLabel} />
        <SummaryRow label="Wallet" value={walletAddress ? shorten(walletAddress) : '--'} />
        <SummaryRow label="Payout wallet" value={shorten(payoutDestinationAddress)} />
      </div>
      <div className="quote-card">
        <SummaryRow
          label={`${destinationCurrency.toUpperCase()} delivered`}
          value={quoteLoading ? 'Updating...' : `${quote?.destination_amount ?? '--'} ${destinationCurrency.toUpperCase()}`}
        />
        <SummaryRow label="Network fee" value={formatCurrency(quote?.fees?.network_fee_amount ?? '0', quote?.source_currency ?? 'usd')} />
        <SummaryRow label="Transaction fee" value={formatCurrency(quote?.fees?.transaction_fee_amount ?? '0', quote?.source_currency ?? 'usd')} />
        <SummaryRow label="Total" value={formatCurrency(quote?.source_amount ?? transfer.amountUsd, quote?.source_currency ?? 'usd')} />
      </div>
      <PrimaryButton loading={checkoutLoading} onClick={onCheckout}>Confirm and pay</PrimaryButton>
    </section>
  );
}
