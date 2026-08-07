import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppStep } from '../types';

const APP_STEPS: AppStep[] = [
  'landing',
  'auth',
  'kycPrimer',
  'kyc',
  'address',
  'transfer',
  'wallet',
  'payment',
  'kycStepUp',
  'review',
  'tracker',
];

export function useFlowNavigation(onNavigate: () => void) {
  const [step, setStepState] = useState<AppStep>('landing');
  const stepRef = useRef<AppStep>('landing');
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const setStep = useCallback((nextStep: AppStep) => {
    if (stepRef.current === nextStep) return;
    stepRef.current = nextStep;
    onNavigateRef.current();
    setStepState(nextStep);
    window.history.pushState({ remittanceStep: nextStep }, '', `#${nextStep}`);
  }, []);

  useEffect(() => {
    window.history.replaceState({ remittanceStep: stepRef.current }, '', `#${stepRef.current}`);

    const handlePopState = (event: PopStateEvent) => {
      if (stepRef.current === 'tracker') {
        window.history.forward();
        return;
      }

      const nextStep: unknown = event.state?.remittanceStep;
      if (typeof nextStep !== 'string' || !APP_STEPS.includes(nextStep as AppStep)) return;
      stepRef.current = nextStep as AppStep;
      onNavigateRef.current();
      setStepState(nextStep as AppStep);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return {
    step,
    setStep,
    goBack: () => window.history.back(),
  };
}
