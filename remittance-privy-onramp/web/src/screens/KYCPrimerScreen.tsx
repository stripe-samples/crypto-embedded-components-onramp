import { ShieldCheck } from 'lucide-react';
import { BulletList, PrimaryButton, TierBadge } from '../components/ui';
import { MERCHANT_DISPLAY_NAME } from '../constants';
import type { KycTier } from '../types';

export function KYCPrimerScreen({ kycTier, onContinue }: { kycTier: KycTier; onContinue: () => void }) {
  const requirements = kycTier === 'L0'
    ? ['Full name', 'Home address']
    : kycTier === 'L1'
      ? ['Full name', 'Social Security Number', 'Date of birth', 'Home address']
      : [
          'Full name',
          'Social Security Number',
          'Date of birth',
          'Home address',
          'Government-issued photo ID',
          'Selfie',
        ];

  return (
    <section className="screen">
      <TierBadge tier={kycTier} />
      <h2>Verify your identity</h2>
      <p>
        Next, Link needs to collect a few personal details to verify your identity
        before this transfer can be processed. This information is not shared with {MERCHANT_DISPLAY_NAME}.
      </p>
      <div className="summary-card">
        <strong>What's required</strong>
        <BulletList items={requirements} />
      </div>
      <div className="consent-card">
        <ShieldCheck size={20} />
        <div>
          <strong>Handled by Link and Stripe</strong>
          <p>Link encrypts this data and Stripe uses it for the Onramp transaction checks.</p>
        </div>
      </div>
      <PrimaryButton onClick={onContinue}>Continue</PrimaryButton>
    </section>
  );
}
