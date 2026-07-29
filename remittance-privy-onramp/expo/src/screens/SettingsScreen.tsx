/**
 * SettingsScreen — configure the KYC step-up demo.
 *
 * Two settings are exposed:
 *
 * 1. KYC Tier — which identity-verification steps to collect before the
 *    onramp flow. Choosing L0 means no KYC is collected initially; when the
 *    user tries a transfer that exceeds the L0 limit the app will prompt them
 *    to complete a KYC step-up in real time.
 *
 * 2. Transaction Limit Source — whether limits come from the live Stripe API
 *    (GET /v1/onramp/limits) or a local hardcoded config in
 *    src/kycLimits.ts. The "local" option works offline and lets you simulate
 *    specific limit scenarios.
 *
 * Merchant note: in a real integration you would not expose these knobs to
 * end users. They exist here only so developers can explore each flow without
 * creating separate test accounts for every tier.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useSettings, KycTier } from '../context/SettingsContext';
import { LOCAL_LIMITS } from '../kycLimits';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

// ---------------------------------------------------------------------------
// Tier metadata
// ---------------------------------------------------------------------------

const KYC_TIERS: {
  value: KycTier;
  title: string;
  collects: string[];
  description: string;
  stepUpFrom: string;
}[] = [
  {
    value: 'L0',
    title: 'L0 — Basic KYC',
    collects: ['Full name', 'Home address'],
    description:
      'Collects only name and address. No SSN or date of birth. ' +
      'When the user attempts a transfer above the L0 limit, they are ' +
      'prompted to complete an incremental step-up (SSN + DOB for L1, ' +
      'or SSN + DOB + ID doc for L2).',
    stepUpFrom: 'Triggers incremental step-up at limit',
  },
  {
    value: 'L1',
    title: 'L1 — Standard KYC',
    collects: ['Full name', 'SSN', 'Date of birth', 'Home address'],
    description:
      'Collects name, Social Security Number, date of birth, and home ' +
      'address via attachKycInfo(). Medium limits. Exceeding the L1 ' +
      'limit triggers a verifyIdentity() step-up to L2.',
    stepUpFrom: 'Triggers verifyIdentity() step-up at limit',
  },
  {
    value: 'L2',
    title: 'L2 — Enhanced KYC',
    collects: ['Full name', 'SSN', 'Date of birth', 'Home address', 'Gov. ID + selfie'],
    description:
      'Everything in L1 plus a government-issued photo ID and selfie via ' +
      'verifyIdentity(). Highest limits. No further step-up available.',
    stepUpFrom: 'Maximum tier — no further step-up',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsScreen({ navigation: _navigation }: Props) {
  const { settings, updateSettings } = useSettings();

  const setKycTier = (tier: KycTier) => updateSettings({ kycTier: tier });

  const toggleLimitSource = () =>
    updateSettings({
      limitSource: settings.limitSource === 'api' ? 'local' : 'api',
    });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ------------------------------------------------------------------ */}
      {/* KYC Tier section */}
      {/* ------------------------------------------------------------------ */}
      <Text style={styles.sectionTitle}>KYC Tier</Text>
      <Text style={styles.sectionSubtitle}>
        Select which identity-verification steps are collected when the user
        first signs in. Choose L0 to experience the step-up flow when a
        transaction exceeds the L0 limit.
      </Text>

      {KYC_TIERS.map(tier => {
        const selected = settings.kycTier === tier.value;
        const limits = LOCAL_LIMITS[tier.value];
        return (
          <TouchableOpacity
            key={tier.value}
            style={[styles.tierCard, selected && styles.tierCardSelected]}
            onPress={() => setKycTier(tier.value)}
            activeOpacity={0.7}
          >
            {/* Header row */}
            <View style={styles.tierHeader}>
              <View style={[styles.radio, selected && styles.radioSelected]} />
              <Text style={[styles.tierTitle, selected && styles.tierTitleActive]}>
                {tier.title}
              </Text>
            </View>

            {/* Fields collected */}
            <View style={styles.collectsRow}>
              {tier.collects.map(f => (
                <View key={f} style={styles.collectsBadge}>
                  <Text style={styles.collectsText}>{f}</Text>
                </View>
              ))}
            </View>

            {/* Description */}
            <Text style={styles.tierDesc}>{tier.description}</Text>

            {/* Step-up hint */}
            <Text style={styles.tierStepUp}>{tier.stepUpFrom}</Text>

            {/* Demo limit preview */}
            <View style={styles.limitPreview}>
              <Text style={styles.limitPreviewLabel}>Demo limits</Text>
              <Text style={[styles.limitPreviewValue, selected && styles.limitPreviewValueActive]}>
                Max ${limits.limit.toFixed(0)} per transaction
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* ------------------------------------------------------------------ */}
      {/* Limit source section */}
      {/* ------------------------------------------------------------------ */}
      <Text style={[styles.sectionTitle, { marginTop: 36 }]}>
        Transaction Limit Source
      </Text>
      <Text style={styles.sectionSubtitle}>
        Choose whether the app fetches real-time limits from the Stripe API or
        reads the hardcoded values in{' '}
        <Text style={styles.mono}>src/kycLimits.ts</Text>. The selected source
        is checked just before the checkout screen so the user can see their
        remaining capacity.
      </Text>

      {/* Toggle card */}
      <View style={styles.toggleCard}>
        <View style={styles.toggleLeft}>
          <Text style={styles.toggleTitle}>
            {settings.limitSource === 'api' ? 'API  (Live)' : 'Local Config'}
          </Text>
          <Text style={styles.toggleDesc}>
            {settings.limitSource === 'api'
              ? 'Calls GET /v1/onramp/limits before checkout'
              : 'Reads hardcoded limits from src/kycLimits.ts'}
          </Text>
        </View>
        <Switch
          value={settings.limitSource === 'api'}
          onValueChange={toggleLimitSource}
          trackColor={{ false: '#333', true: '#635BFF' }}
          thumbColor="#fff"
        />
      </View>

      {/* Info box — local config */}
      {settings.limitSource === 'local' && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Local config (src/kycLimits.ts)</Text>
          {(['L0', 'L1', 'L2'] as KycTier[]).map(tier => (
            <View key={tier} style={styles.infoRow}>
              <Text
                style={[
                  styles.infoTier,
                  tier === settings.kycTier && styles.infoTierActive,
                ]}
              >
                {tier}
              </Text>
              <Text style={styles.infoLimit}>
                Max ${LOCAL_LIMITS[tier].limit} per transaction
              </Text>
            </View>
          ))}
          <Text style={styles.infoHint}>
            Edit LOCAL_LIMITS in src/kycLimits.ts to change these values.
          </Text>
        </View>
      )}

      {/* Info box — API */}
      {settings.limitSource === 'api' && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>API endpoint</Text>
          <Text style={styles.infoCode}>GET /v1/onramp/limits</Text>
          <Text style={styles.infoDesc}>
            The backend calls this endpoint with the customer&apos;s OAuth token and
            returns{' '}
            <Text style={styles.mono}>minimum_amounts</Text>,{' '}
            <Text style={styles.mono}>maximum_amounts</Text>, and{' '}
            <Text style={styles.mono}>remaining_amounts</Text> per currency.
            The app reads the{' '}
            <Text style={styles.mono}>usd</Text> field and compares it to the
            entered transfer amount.
          </Text>
        </View>
      )}

    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 56 },

  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  sectionSubtitle: { color: '#666', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  mono: { fontFamily: 'monospace', color: '#888' },

  // Tier card
  tierCard: {
    backgroundColor: '#131313',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#252525',
  },
  tierCardSelected: { borderColor: '#635BFF' },
  tierHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#444',
    marginRight: 10,
  },
  radioSelected: { borderColor: '#635BFF', backgroundColor: '#635BFF' },
  tierTitle: { color: '#888', fontSize: 15, fontWeight: '600' },
  tierTitleActive: { color: '#fff' },
  collectsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 28, marginBottom: 10 },
  collectsBadge: {
    backgroundColor: '#1e1e30',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  collectsText: { color: '#7070cc', fontSize: 11 },
  tierDesc: { color: '#555', fontSize: 13, lineHeight: 18, marginLeft: 28, marginBottom: 6 },
  tierStepUp: {
    color: '#444',
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 28,
    marginBottom: 10,
  },
  limitPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: 28,
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingTop: 10,
  },
  limitPreviewLabel: { color: '#444', fontSize: 12 },
  limitPreviewValue: { color: '#555', fontSize: 12, fontWeight: '500' },
  limitPreviewValueActive: { color: '#635BFF' },

  // Toggle card
  toggleCard: {
    flexDirection: 'row',
    backgroundColor: '#131313',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252525',
    marginBottom: 16,
  },
  toggleLeft: { flex: 1, paddingRight: 12 },
  toggleTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  toggleDesc: { color: '#555', fontSize: 13, lineHeight: 18 },

  // Info box
  infoBox: {
    backgroundColor: '#0d0d0d',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  infoTitle: {
    color: '#555',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e1e1e',
  },
  infoTier: { color: '#444', fontSize: 13, fontWeight: '700', width: 32 },
  infoTierActive: { color: '#635BFF' },
  infoLimit: { color: '#666', fontSize: 13 },
  infoHint: { color: '#444', fontSize: 12, marginTop: 10, fontStyle: 'italic' },
  infoCode: {
    color: '#635BFF',
    fontSize: 13,
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  infoDesc: { color: '#555', fontSize: 13, lineHeight: 18 },
});
