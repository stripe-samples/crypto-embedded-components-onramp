import { PrimaryButton, TextField, TierBadge } from '../components/ui';
import { IS_STRIPE_TEST_MODE } from '../constants';
import type { KycForm, KycTier } from '../types';
import { digitsOnly, formatSsn } from '../utils';

export function KYCScreen({
  form,
  kycTier,
  onChange,
  onContinue,
}: {
  form: KycForm;
  kycTier: KycTier;
  onChange: (updates: Partial<KycForm>) => void;
  onContinue: () => void;
}) {
  return (
    <section className="screen">
      <TierBadge tier={kycTier} />
      <h2>Identity details</h2>
      <p>{kycTier === 'L0' ? 'Enter your full name.' : 'Enter your name, SSN, and date of birth.'}</p>
      <div className="form">
        <TextField label="First name" value={form.firstName} onChange={(firstName) => onChange({ firstName })} placeholder="Alice" />
        <TextField label="Last name" value={form.lastName} onChange={(lastName) => onChange({ lastName })} placeholder="Garcia" />
        {IS_STRIPE_TEST_MODE ? (
          <div className="test-card">
            <strong>Test mode</strong>
            <span>Use <code>Verified</code> as the last name to pass L0 KYC in test mode.</span>
          </div>
        ) : null}
        {kycTier !== 'L0' ? (
          <>
            <TextField
              label="Social Security Number"
              value={formatSsn(form.ssn)}
              onChange={(ssn) => onChange({ ssn: digitsOnly(ssn, 9) })}
              placeholder="XXX-XX-XXXX"
            />
            <div className="date-grid">
              <TextField label="MM" value={form.dobMonth} onChange={(dobMonth) => onChange({ dobMonth: digitsOnly(dobMonth, 2) })} placeholder="01" />
              <TextField label="DD" value={form.dobDay} onChange={(dobDay) => onChange({ dobDay: digitsOnly(dobDay, 2) })} placeholder="31" />
              <TextField label="YYYY" value={form.dobYear} onChange={(dobYear) => onChange({ dobYear: digitsOnly(dobYear, 4) })} placeholder="1990" />
            </div>
          </>
        ) : null}
      </div>
      <PrimaryButton onClick={onContinue}>Next</PrimaryButton>
    </section>
  );
}
