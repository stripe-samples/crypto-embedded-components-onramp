import type { FormEvent } from 'react';
import { BulletList, PrimaryButton, TextField, TierBadge } from '../components/ui';
import type { KycForm } from '../types';
import { digitsOnly, formatSsn } from '../utils';

export function KYCStepUpScreen({
  form,
  fromTier,
  loading,
  onChange,
  onSubmit,
}: {
  form: KycForm;
  fromTier: 'l0' | 'l1' | 'l2';
  loading: boolean;
  onChange: (updates: Partial<KycForm>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="screen">
      <TierBadge tier={`${fromTier.toUpperCase()} → ${fromTier === 'l0' ? 'L1' : 'L2'}`} />
      <h2>{fromTier === 'l0' ? 'Upgrade to L1 verification' : 'Identity document required'}</h2>
      <p>
        {fromTier === 'l0'
          ? 'You already provided your name and address. Add SSN and date of birth to continue.'
          : 'This transfer requires document verification. Stripe will open a secure document capture flow.'}
      </p>
      <form className="form" onSubmit={onSubmit}>
        {fromTier === 'l0' ? (
          <>
            <TextField label="Social Security Number" value={formatSsn(form.ssn)} onChange={(ssn) => onChange({ ssn: digitsOnly(ssn, 9) })} placeholder="000-00-0000" />
            <div className="date-grid">
              <TextField label="MM" value={form.dobMonth} onChange={(dobMonth) => onChange({ dobMonth: digitsOnly(dobMonth, 2) })} />
              <TextField label="DD" value={form.dobDay} onChange={(dobDay) => onChange({ dobDay: digitsOnly(dobDay, 2) })} />
              <TextField label="YYYY" value={form.dobYear} onChange={(dobYear) => onChange({ dobYear: digitsOnly(dobYear, 4) })} />
            </div>
          </>
        ) : (
          <div className="summary-card">
            <strong>What you will need</strong>
            <BulletList items={['Government-issued photo ID', 'A selfie to match the ID photo']} />
          </div>
        )}
        <PrimaryButton loading={loading} type="submit">
          {fromTier === 'l0' ? 'Submit verification' : 'Start identity verification'}
        </PrimaryButton>
      </form>
    </section>
  );
}
