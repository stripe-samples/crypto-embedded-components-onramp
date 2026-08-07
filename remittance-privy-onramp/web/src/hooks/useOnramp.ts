import { useEffect, useState } from 'react';
import { loadCryptoOnrampAndInitialize, type OnrampCoordinator } from '@stripe/crypto';
import { STRIPE_PUBLISHABLE_KEY } from '../constants';

export function useOnramp() {
  const [onramp, setOnramp] = useState<OnrampCoordinator | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    if (!STRIPE_PUBLISHABLE_KEY) {
      setSdkError('Set VITE_STRIPE_PUBLISHABLE_KEY in web/.env before running the web app.');
      return;
    }

    let cancelled = false;
    loadCryptoOnrampAndInitialize(STRIPE_PUBLISHABLE_KEY, { theme: 'night' })
      .then((coordinator) => {
        if (!cancelled) setOnramp(coordinator);
      })
      .catch((error: unknown) => {
        if (!cancelled) setSdkError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { onramp, sdkError };
}
