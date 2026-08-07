import type { FormEvent } from 'react';
import { PrimaryButton, TextField, TierBadge } from '../components/ui';
import type { AddressForm, KycTier } from '../types';
import { digitsOnly } from '../utils';

export function AddressScreen({
  form,
  kycLoading,
  kycTier,
  onChange,
  onSubmit,
}: {
  form: AddressForm;
  kycLoading: boolean;
  kycTier: KycTier;
  onChange: (updates: Partial<AddressForm>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="screen">
      <TierBadge tier={kycTier} />
      <h2>Add your home address</h2>
      <p>Currently only US addresses are supported in this demo.</p>
      <form className="form" onSubmit={onSubmit}>
        <TextField label="Address line 1" value={form.line1} onChange={(line1) => onChange({ line1 })} />
        <TextField label="Address line 2 (optional)" value={form.line2} onChange={(line2) => onChange({ line2 })} />
        <TextField label="City" value={form.city} onChange={(city) => onChange({ city })} />
        <div className="date-grid">
          <TextField label="State" value={form.state} onChange={(state) => onChange({ state: state.toUpperCase().slice(0, 2) })} placeholder="CA" />
          <TextField label="ZIP" value={form.postalCode} onChange={(postalCode) => onChange({ postalCode: digitsOnly(postalCode, 10) })} placeholder="94103" />
        </div>
        <div className="details-card">
          <strong>SDK calls on submit</strong>
          <code>
            submitKycInfo(&#123; given_name, surname, address
            {kycTier !== 'L0' ? ', id_number, date_of_birth' : ''} &#125;)
          </code>
          {kycTier === 'L2' ? <code>verifyDocuments()</code> : null}
        </div>
        <PrimaryButton loading={kycLoading} type="submit">Submit KYC</PrimaryButton>
      </form>
    </section>
  );
}
