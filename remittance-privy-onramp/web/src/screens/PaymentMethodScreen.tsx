import { useCallback } from 'react';
import { BadgeCheck, CreditCard } from 'lucide-react';
import { PrimaryButton, SecondaryButton, Spinner, TextField } from '../components/ui';

export function PaymentMethodScreen({
  busy,
  currentTier,
  exceedsLimit,
  isKycPending,
  isKycRejected,
  needsNewLinkAccount,
  onCollectPayment,
  onPhoneChange,
  onPreparePayment,
  onProceed,
  onrampReady,
  paymentElement,
  paymentToken,
  phone,
  returnToReview,
  walletRegistered,
}: {
  busy: boolean;
  currentTier: 'l0' | 'l1' | 'l2';
  exceedsLimit: boolean;
  isKycPending: boolean;
  isKycRejected: boolean;
  needsNewLinkAccount: boolean;
  onCollectPayment: () => void;
  onPhoneChange: (value: string) => void;
  onPreparePayment: () => void;
  onProceed: () => void;
  onrampReady: boolean;
  paymentElement: HTMLElement | null;
  paymentToken: string | null;
  phone: string;
  returnToReview: boolean;
  walletRegistered: boolean;
}) {
  const paymentElementRef = useCallback((node: HTMLDivElement | null) => {
    if (node && paymentElement && !node.contains(paymentElement)) {
      node.innerHTML = '';
      node.appendChild(paymentElement);
    }
  }, [paymentElement]);

  return (
    <section className="screen">
      <div className="kicker">Payment</div>
      <h2>Payment method</h2>
      <p>Select how you want to pay. You will review the transfer details before confirming.</p>
      {!walletRegistered ? (
        <div className="form">
          {needsNewLinkAccount ? (
            <>
              <TextField label="Phone number" value={phone} onChange={onPhoneChange} placeholder="+12125551234" type="tel" />
              <p className="terms-copy">By continuing, you agree to the Link crypto onramp terms and privacy policy.</p>
            </>
          ) : null}
          <SecondaryButton disabled={!onrampReady || busy} onClick={onPreparePayment}>
            {busy ? <Spinner /> : needsNewLinkAccount ? 'Create Link account' : 'Continue with Link'}
          </SecondaryButton>
        </div>
      ) : (
        <>
          {isKycPending || isKycRejected || exceedsLimit ? (
            <div className={`status-card ${isKycRejected || exceedsLimit ? 'warning' : ''}`}>
              <strong>
                {isKycPending
                  ? 'Verifying identity'
                  : isKycRejected
                    ? 'Identity needs attention'
                    : 'More verification required'}
              </strong>
              <span>
                {isKycPending
                  ? 'Stripe is reviewing the latest identity submission.'
                  : isKycRejected
                    ? 'Re-enter identity details before continuing.'
                    : 'This amount is above the current transfer limit. A quick identity step-up unlocks higher limits.'}
              </span>
            </div>
          ) : null}
          <SecondaryButton disabled={busy} onClick={onCollectPayment}>
            <CreditCard size={18} /> Select or add payment method
          </SecondaryButton>
          <div ref={paymentElementRef} className={`embedded-box ${paymentElement ? 'visible' : ''}`} />
          {paymentToken ? (
            <div className="ready-card">
              <BadgeCheck size={20} />
              <span>Payment method ready</span>
            </div>
          ) : null}
          <PrimaryButton disabled={!paymentToken || isKycPending} loading={busy} onClick={onProceed}>
            {isKycRejected
              ? 'Re-enter identity details'
              : exceedsLimit && currentTier !== 'l2'
                ? 'Verify more information'
                : returnToReview
                  ? 'Return to review'
                  : 'Review transfer'}
          </PrimaryButton>
        </>
      )}
    </section>
  );
}
