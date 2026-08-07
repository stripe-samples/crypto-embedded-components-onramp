import type { ReactNode } from 'react';
import { ArrowLeft, Check, CircleDollarSign } from 'lucide-react';
import { MERCHANT_DISPLAY_NAME } from '../constants';
import type { AppStep } from '../types';

export type JourneyStage = 'transfer' | 'wallet' | 'payment' | 'review';

const JOURNEY_STAGES: Array<{ id: JourneyStage; label: string }> = [
  { id: 'transfer', label: 'Transfer' },
  { id: 'wallet', label: 'Authorize' },
  { id: 'payment', label: 'Payment' },
  { id: 'review', label: 'Review' },
];

export function journeyStageForStep(step: AppStep): JourneyStage | null {
  if (step === 'transfer') return 'transfer';
  if (step === 'wallet') return 'wallet';
  if (step === 'payment' || step === 'kycPrimer' || step === 'kyc' || step === 'address' || step === 'kycStepUp') {
    return 'payment';
  }
  if (step === 'review') return 'review';
  return null;
}

function JourneyProgress({
  current,
  onSelect,
}: {
  current: JourneyStage;
  onSelect: (stage: JourneyStage) => void;
}) {
  const currentIndex = JOURNEY_STAGES.findIndex((stage) => stage.id === current);

  return (
    <nav className="journey-progress" aria-label="Transfer progress">
      {JOURNEY_STAGES.map((stage, index) => {
        const complete = index < currentIndex;
        const active = stage.id === current;
        return (
          <button
            className={complete ? 'complete' : active ? 'active' : ''}
            disabled={!complete}
            key={stage.id}
            onClick={() => onSelect(stage.id)}
            type="button"
            aria-current={active ? 'step' : undefined}
          >
            <span className="journey-marker">{complete ? <Check size={14} /> : index + 1}</span>
            <span>{stage.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  error,
  onBack,
  onJourneySelect,
  sdkError,
  step,
}: {
  children: ReactNode;
  error: string | null;
  onBack: () => void;
  onJourneySelect: (stage: JourneyStage) => void;
  sdkError: string | null;
  step: AppStep;
}) {
  const journeyStage = journeyStageForStep(step);

  return (
    <main className="app-shell">
      {step !== 'landing' ? (
        <div className="page-header">
          <header className="app-header">
            {step === 'tracker' ? (
              <div className="header-spacer" aria-hidden="true" />
            ) : (
              <button className="back-button" onClick={onBack} type="button" aria-label="Go back">
                <ArrowLeft size={19} />
                <span>Back</span>
              </button>
            )}
            <div className="brand-row">
              <CircleDollarSign size={21} />
              <span>{MERCHANT_DISPLAY_NAME}</span>
            </div>
            <div className="header-spacer" aria-hidden="true" />
          </header>
        </div>
      ) : null}

      <section className={`demo-frame ${step === 'landing' ? 'landing-frame' : ''}`}>
        {journeyStage ? (
          <JourneyProgress current={journeyStage} onSelect={onJourneySelect} />
        ) : null}
        <section className="journey-panel" aria-live="polite">
          {error || sdkError ? (
            <div className="error-banner">
              <strong>Something needs attention</strong>
              <span>{error ?? sdkError}</span>
            </div>
          ) : null}
          {children}
        </section>
      </section>
    </main>
  );
}
