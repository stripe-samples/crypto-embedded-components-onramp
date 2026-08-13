import { useState } from 'react';
import type { OnrampCoordinator } from '@stripe/crypto';
import { CircleDollarSign, Settings2, X } from 'lucide-react';
import { ModeSelector, PrimaryButton } from '../components/ui';
import { DEFAULT_DEMO_NETWORK, MERCHANT_DISPLAY_NAME } from '../constants';
import type { PayoutMode } from '../types';
import { isEvmAddress, networkName } from '../utils';

export function HomeScreen({
  onContinue,
  onPayoutDestinationAddressChange,
  onPayoutModeChange,
  onramp,
  payoutDestinationAddress,
  payoutMode,
  privyReady,
  sdkError,
}: {
  onContinue: () => void;
  onPayoutDestinationAddressChange: (address: string) => void;
  onPayoutModeChange: (mode: PayoutMode) => void;
  onramp: OnrampCoordinator | null;
  payoutDestinationAddress: string;
  payoutMode: PayoutMode;
  privyReady: boolean;
  sdkError: string | null;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftAddress, setDraftAddress] = useState(payoutDestinationAddress);
  const [showAddressError, setShowAddressError] = useState(false);
  const addressIsValid = isEvmAddress(draftAddress);

  const openSettings = () => {
    setDraftAddress(payoutDestinationAddress);
    setShowAddressError(false);
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    if (!addressIsValid) {
      setShowAddressError(true);
      return;
    }
    onPayoutDestinationAddressChange(draftAddress.trim());
    setSettingsOpen(false);
  };

  const continueOrConfigure = () => {
    if (!isEvmAddress(payoutDestinationAddress)) {
      openSettings();
      setShowAddressError(true);
      return;
    }
    onContinue();
  };

  return (
    <>
      <section className="screen landing-screen">
        <div className="landing-toolbar">
          <div className="brand-row landing-brand">
            <CircleDollarSign size={24} />
            <span>{MERCHANT_DISPLAY_NAME}</span>
          </div>
          <button className="landing-settings-button" onClick={openSettings} type="button">
            <Settings2 size={17} />
            Demo settings
          </button>
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
        <PrimaryButton disabled={!onramp || !privyReady || !!sdkError} onClick={continueOrConfigure}>
          Start demo transfer
        </PrimaryButton>
      </section>

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <form
            aria-labelledby="demo-settings-title"
            aria-modal="true"
            className="settings-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveSettings();
            }}
            role="dialog"
          >
            <div className="settings-modal-header">
              <div>
                <div className="kicker">Demo configuration</div>
                <h2 id="demo-settings-title">Payout destination</h2>
              </div>
              <button
                aria-label="Close demo settings"
                className="icon-button"
                onClick={() => setSettingsOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            <p>
              After Stripe delivers USDC to the sender wallet, the demo sends it to this address.
            </p>
            <p className="settings-network">
              Network <strong>{networkName(DEFAULT_DEMO_NETWORK)}</strong>
            </p>
            <label className="field">
              <span>Payout wallet address</span>
              <input
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                data-1p-ignore="true"
                name="payout-wallet-address"
                onChange={(event) => {
                  setDraftAddress(event.target.value);
                  setShowAddressError(false);
                }}
                placeholder="0x..."
                spellCheck={false}
                value={draftAddress}
              />
            </label>
            {showAddressError && !addressIsValid ? (
              <p className="field-error">Enter a valid EVM wallet address.</p>
            ) : (
              <p className="field-help">The address must be allowed by the configured Privy policy.</p>
            )}
            <PrimaryButton type="submit">Save settings</PrimaryButton>
          </form>
        </div>
      ) : null}
    </>
  );
}
