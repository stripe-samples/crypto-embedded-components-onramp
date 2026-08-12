/**
 * SettingsContext — app-wide demo configuration persisted to AsyncStorage.
 *
 * Demo settings include:
 *
 *   kycTier      Controls which identity-verification steps the user completes
 *                before the onramp flow begins. See `KycTier` for details.
 *
 *   limitSource  Where the app reads transaction limits from before checkout.
 *                'api'   → real-time GET /v1/onramp/limits
 *                'local' → hardcoded table in src/kycLimits.ts
 *
 *   payoutDestinationAddress
 *                EVM address used for the post-Onramp payout handoff.
 *
 * Wrap the navigation root with <SettingsProvider> and read settings in any
 * screen with the useSettings() hook.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * KYC tier the user wants to experience in the demo.
 *
 *   L0 — No identity verification collected. Lowest transaction limits.
 *        The user goes straight to the wallet flow. When they try to buy
 *        an amount that exceeds their L0 limit the app will trigger a
 *        KYC step-up (collecting name, SSN, DOB, address → L1).
 *
 *   L1 — Standard KYC: name + Social Security Number + date of birth +
 *        home address. Medium transaction limits.
 *
 *   L2 — Enhanced KYC: everything in L1 plus a government-issued ID
 *        document and a selfie via Stripe's verifyIdentity SDK call.
 *        Highest transaction limits.
 */
export type KycTier = 'L0' | 'L1' | 'L2';

/**
 * Where to read transaction limits from before displaying them in the
 * PaymentMethod screen.
 *
 *   'api'   — Calls GET /v1/onramp/limits with the customer's
 *             OAuth token. Returns live remaining amounts from Stripe.
 *
 *   'local' — Reads hardcoded values from src/kycLimits.ts. Useful for
 *             offline development or simulating a specific limit scenario.
 */
export type LimitSource = 'api' | 'local';

export interface AppSettings {
  kycTier: KycTier;
  limitSource: LimitSource;
  payoutDestinationAddress: string;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: AppSettings = {
  kycTier: 'L1',
  limitSource: 'local',
  payoutDestinationAddress: '',
};

const STORAGE_KEY = '@crypto_onramp_settings_v1';

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Restore persisted settings from AsyncStorage on mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        } catch {
          // Ignore corrupt data — fall back to defaults.
        }
      }
      setLoaded(true);
    });
  }, []);

  const updateSettings = async (updates: Partial<AppSettings>) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  // Render a blank dark screen while settings are loading from storage
  // (typically <50ms) to avoid a flash of stale default values.
  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: '#0a0a0a' }} />;
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
