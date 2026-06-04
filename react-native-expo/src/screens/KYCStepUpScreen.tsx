/**
 * KYCStepUpScreen — collect only the incremental identity information needed
 * to upgrade to the next KYC tier.
 *
 * This screen is reached from PaymentMethodScreen when the user's requested
 * amount exceeds their current tier's transaction limit. It collects only the
 * fields not yet on file — attachKycInfo() merges with existing data, so only
 * the NEW fields for the target tier need to be sent.
 *
 * Four paths, driven by errorCode and currentTier:
 *
 *   missing_minimum_identity_verification (any tier)
 *     → Collect: first name, last name, home address
 *     → SDK call: attachKycInfo({ firstName, lastName, address })
 *     → Navigate to: PaymentMethodScreen (polls until L0 verified)
 *
 *   missing_identity_verification + currentTier=L0
 *     → L0 already has: name + address
 *     → Collect: SSN + date of birth only (incremental L0→L1 step-up)
 *     → SDK call: attachKycInfo({ idNumber, dateOfBirth })
 *     → Navigate to: PaymentMethodScreen (polls until L1 verified)
 *
 *   missing_identity_verification + currentTier=L1
 *     → L1 verification was rejected — re-collect all L1 fields
 *     → Collect: first name, last name, home address, SSN, date of birth
 *     → SDK call: attachKycInfo({ firstName, lastName, address, idNumber, dateOfBirth })
 *     → Navigate to: PaymentMethodScreen (polls until L1 verified)
 *
 *   missing_document_verification + currentTier=L0
 *     → L0 already has: name + address
 *     → Collect: SSN + date of birth, then capture document + selfie
 *     → SDK calls: attachKycInfo({ idNumber, dateOfBirth }) → verifyIdentity()
 *     → Navigate to: PaymentMethodScreen (polls until L2 verified)
 *
 *   missing_document_verification + currentTier=L1 or L2
 *     → L1/L2 already has: name + address + SSN + DOB
 *     → Capture document + selfie only (incremental L1→L2 step-up)
 *     → SDK call: verifyIdentity()
 *     → Navigate to: PaymentMethodScreen (polls until L2 verified)
 *
 * After navigation, PaymentMethodScreen fetches fresh kycTiers, detects the
 * pending status, and polls getCryptoCustomer() until the review resolves.
 * Once verified, it re-checks limits for the new tier and either prompts for
 * another step-up (if amount still exceeds the new limit) or proceeds to
 * createOnrampSession(). Stripe's identity review is asynchronous — always
 * return to PaymentMethodScreen and let it poll rather than proceeding directly.
 *
 * See: https://docs.stripe.com/crypto/onramp/kyc-integration-guide
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'KYCStepUp'>;
  route: RouteProp<RootStackParamList, 'KYCStepUp'>;
};

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

type StepUpPath =
  | 'collect_l0_kyc'           // missing_minimum: name + address
  | 'collect_ssn_dob'          // missing_identity + L0: SSN + DOB only (incremental)
  | 'collect_full_l1'          // missing_identity + L1: name + address + SSN + DOB
  | 'collect_ssn_dob_then_doc' // missing_document + L0: SSN + DOB → verifyIdentity
  | 'verify_identity';         // missing_document + L1/L2: verifyIdentity only

function getStepUpPath(errorCode: string, currentTier: 'l0' | 'l1' | 'l2'): StepUpPath {
  if (errorCode === 'crypto_onramp_missing_minimum_identity_verification') {
    return 'collect_l0_kyc';
  }
  if (errorCode === 'crypto_onramp_missing_identity_verification') {
    // L1 tier: verification was rejected — must re-submit full L1 fields.
    // L0 tier: name + address already on file, only SSN + DOB are missing.
    return currentTier === 'l1' ? 'collect_full_l1' : 'collect_ssn_dob';
  }
  // crypto_onramp_missing_document_verification
  if (currentTier === 'l0') return 'collect_ssn_dob_then_doc';
  return 'verify_identity'; // L1 or L2
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatSSN(raw: string): string {
  if (raw.length <= 3) return raw;
  if (raw.length <= 5) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  return `${raw.slice(0, 3)}-${raw.slice(3, 5)}-${raw.slice(5)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KYCStepUpScreen({ navigation, route }: Props) {
  const {
    customerId, authToken, errorCode, currentTier,
    walletAddress, network, sourceAmount, sourceCurrency,
    destinationCurrency, paymentToken, paymentLabel,
  } = route.params;

  const { attachKycInfo, verifyIdentity } = useOnramp();
  const [submitting, setSubmitting] = useState(false);

  const path = getStepUpPath(errorCode, currentTier);

  // Name + address fields — used by collect_l0_kyc and collect_full_l1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [postalCode, setPostalCode] = useState('');

  // SSN + DOB fields — used by collect_ssn_dob, collect_full_l1, collect_ssn_dob_then_doc
  const [ssnRaw, setSsnRaw] = useState('');
  const [ssnFocused, setSsnFocused] = useState(false);
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');

  const ssnDisplay = ssnFocused
    ? formatSSN(ssnRaw)
    : ssnRaw.length === 9 ? `•••-••-${ssnRaw.slice(5)}` : formatSSN(ssnRaw);

  const needsNameAddress = path === 'collect_l0_kyc' || path === 'collect_full_l1';
  const needsSsnDob = path === 'collect_ssn_dob' || path === 'collect_full_l1' || path === 'collect_ssn_dob_then_doc';
  const needsVerifyIdentity = path === 'collect_ssn_dob_then_doc' || path === 'verify_identity';

  // After SDK calls succeed, return to PaymentMethod with the original payment
  // params pre-filled. PaymentMethod will fetch fresh kycTiers on focus, detect
  // the pending verification, and poll until Stripe's review resolves.
  //
  // navigate() (not replace) pops KYCStepUpScreen and returns to the existing
  // PaymentMethod instance, avoiding a duplicate PaymentMethod on the stack.
  // Without this, back-navigation from Checkout would land on the pre-step-up
  // PaymentMethod (showing the old, lower KYC tier) instead of the updated one.
  const goToPaymentMethod = () => {
    navigation.navigate('PaymentMethod', {
      customerId, authToken, walletAddress, network,
      sourceAmount, destinationCurrency, paymentToken, paymentLabel,
    });
  };

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    // Validate required fields before making any SDK calls.
    if (needsNameAddress) {
      if (!firstName.trim() || !lastName.trim()) {
        Alert.alert('Missing Information', 'Please enter your first and last name.');
        return;
      }
      if (!addressLine1.trim() || !city.trim() || stateCode.trim().length !== 2 || !postalCode.trim()) {
        Alert.alert('Missing Information', 'Please complete your home address.');
        return;
      }
    }
    if (needsSsnDob) {
      if (ssnRaw.length !== 9 || !dobDay || !dobMonth || !dobYear) {
        Alert.alert('Missing Information', 'Please fill in your SSN and full date of birth.');
        return;
      }
    }

    setSubmitting(true);
    try {
      // Step 1: attachKycInfo — send only the fields required for this path.
      // attachKycInfo merges with existing data, so we only send new fields.
      if (needsNameAddress || needsSsnDob) {
        const kycResult = await attachKycInfo({
          ...(needsNameAddress ? {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            address: {
              line1: addressLine1.trim(),
              city: city.trim(),
              state: stateCode.trim().toUpperCase(),
              postalCode: postalCode.trim(),
              country: 'US',
            },
          } : {}),
          ...(needsSsnDob ? {
            idNumber: ssnRaw,
            dateOfBirth: {
              day: parseInt(dobDay, 10),
              month: parseInt(dobMonth, 10),
              year: parseInt(dobYear, 10),
            },
          } : {}),
        });
        if (kycResult?.error) {
          Alert.alert('Verification Error', kycResult.error.message);
          return;
        }
      }

      // Step 2: verifyIdentity — launches Stripe's document-capture UI for L2.
      // Reference: https://docs.stripe.com/crypto/onramp/kyc-integration-guide#use-verifyidentity-for-l2-kyc
      if (needsVerifyIdentity) {
        const idResult = await verifyIdentity();
        if (idResult?.error) {
          console.log('[KYCStepUp] verifyIdentity note:', idResult.error.message);
        }
      }

      goToPaymentMethod();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render — verifyIdentity only (L1 or L2 → L2)
  // ---------------------------------------------------------------------------

  if (path === 'verify_identity') {
    return (
      <View style={styles.container}>
        <View style={styles.simpleContent}>
          <Text style={styles.tierBadge}>{currentTier.toUpperCase()} → L2</Text>
          <Text style={styles.title}>Identity Document Required</Text>
          <Text style={styles.subtitle}>
            This transaction requires L2 verification. Photograph your
            government-issued ID and take a selfie to continue.
          </Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>What you will need</Text>
            {[
              "Government-issued photo ID (passport or driver's license)",
              'A selfie to match your ID photo',
            ].map(item => (
              <View key={item} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>SDK call</Text>
            <Text style={styles.infoCardBody}>
              <Text style={styles.infoCode}>verifyIdentity()</Text>
              {' '}— opens Stripe's guided capture flow. Verification is
              asynchronous; you'll see a status screen while Stripe reviews
              your documents.
            </Text>
          </View>
        </View>

        <View style={styles.simpleFooter}>
          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Start Identity Verification</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — form paths (collect_l0_kyc, collect_ssn_dob, collect_full_l1,
  //                       collect_ssn_dob_then_doc)
  // ---------------------------------------------------------------------------

  const tierLabel = needsVerifyIdentity ? 'L2' : 'L1';
  const fromLabel =
    path === 'collect_l0_kyc'
      ? 'L0'
      : path === 'collect_full_l1'
        ? 'L1'
        : currentTier.toUpperCase();

  const titleText = {
    collect_l0_kyc:           'Basic Identity Verification',
    collect_ssn_dob:          'Upgrade to L1 Verification',
    collect_full_l1:          'Re-submit L1 Verification',
    collect_ssn_dob_then_doc: 'Upgrade to L2 Verification',
    verify_identity:          '',
  }[path];

  const subtitleText = {
    collect_l0_kyc:
      'This transaction requires identity verification. Please provide your name and home address.',
    collect_ssn_dob:
      'You already provided your name and address. We only need your SSN and date of birth to continue.',
    collect_full_l1:
      'Your previous L1 verification needs to be re-submitted. Please provide all required fields.',
    collect_ssn_dob_then_doc:
      'You already provided your name and address. Provide your SSN and date of birth, then complete document verification.',
    verify_identity: '',
  }[path];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.tierBadge}>{fromLabel} → {tierLabel}</Text>
      <Text style={styles.title}>{titleText}</Text>
      <Text style={styles.subtitle}>{subtitleText}</Text>

      {/* ------------------------------------------------------------------ */}
      {/* Name fields — collect_l0_kyc and collect_full_l1                   */}
      {/* ------------------------------------------------------------------ */}
      {needsNameAddress && (
        <>
          <SectionLabel>Full Name</SectionLabel>
          <View style={styles.row2}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <FieldLabel>First name</FieldLabel>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Jane"
                placeholderTextColor="#555"
                autoCapitalize="words"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>Last name</FieldLabel>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Smith"
                placeholderTextColor="#555"
                autoCapitalize="words"
              />
            </View>
          </View>

          <SectionLabel>Home Address</SectionLabel>
          <FieldLabel>Street address</FieldLabel>
          <TextInput
            style={styles.input}
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="123 Main St"
            placeholderTextColor="#555"
            autoCapitalize="words"
          />
          <View style={styles.row2}>
            <View style={{ flex: 2, marginRight: 8 }}>
              <FieldLabel>City</FieldLabel>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="San Francisco"
                placeholderTextColor="#555"
                autoCapitalize="words"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>State</FieldLabel>
              <TextInput
                style={styles.input}
                value={stateCode}
                onChangeText={t => setStateCode(t.replace(/[^a-zA-Z]/g, '').slice(0, 2))}
                placeholder="CA"
                placeholderTextColor="#555"
                autoCapitalize="characters"
                maxLength={2}
              />
            </View>
          </View>
          <FieldLabel>ZIP code</FieldLabel>
          <TextInput
            style={[styles.input, { marginBottom: 24 }]}
            value={postalCode}
            onChangeText={t => setPostalCode(t.replace(/\D/g, '').slice(0, 5))}
            placeholder="94103"
            placeholderTextColor="#555"
            keyboardType="numeric"
            maxLength={5}
          />
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SSN + DOB fields — collect_ssn_dob, collect_full_l1,               */}
      {/*                     collect_ssn_dob_then_doc                        */}
      {/* ------------------------------------------------------------------ */}
      {needsSsnDob && (
        <>
          <SectionLabel>Social Security Number</SectionLabel>
          <TextInput
            style={[styles.input, { marginBottom: 24 }]}
            value={ssnDisplay}
            onChangeText={t => setSsnRaw(t.replace(/\D/g, '').slice(0, 9))}
            onFocus={() => setSsnFocused(true)}
            onBlur={() => setSsnFocused(false)}
            placeholder="XXX-XX-XXXX"
            placeholderTextColor="#555"
            keyboardType="numeric"
            maxLength={11}
          />

          <SectionLabel>Date of Birth</SectionLabel>
          <View style={[styles.row3, { marginBottom: 24 }]}>
            <DobField label="MM" value={dobMonth} onChange={setDobMonth} maxLength={2} />
            <DobField label="DD" value={dobDay} onChange={setDobDay} maxLength={2} />
            <DobField label="YYYY" value={dobYear} onChange={setDobYear} maxLength={4} />
          </View>
        </>
      )}

      {/* Note shown when verifyIdentity follows the form */}
      {path === 'collect_ssn_dob_then_doc' && (
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Next step after submitting</Text>
          <Text style={styles.infoCardBody}>
            After confirming your SSN and date of birth, Stripe's
            document-capture flow will launch so you can photograph your
            government ID and take a selfie.
          </Text>
        </View>
      )}

      {/* SDK call reference */}
      <View style={styles.infoCard}>
        <Text style={styles.infoCardTitle}>SDK calls</Text>
        <Text style={styles.infoCardBody}>
          {(needsNameAddress || needsSsnDob) && (
            <Text>
              <Text style={styles.infoCode}>attachKycInfo(…)</Text>
              {needsVerifyIdentity ? '\n' : ''}
            </Text>
          )}
          {needsVerifyIdentity && (
            <Text style={styles.infoCode}>verifyIdentity()</Text>
          )}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>
              {path === 'collect_ssn_dob_then_doc'
                ? 'Continue to Document Verification'
                : 'Verify & Continue'}
            </Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function DobField({
  label, value, onChange, maxLength,
}: { label: string; value: string; onChange: (v: string) => void; maxLength?: number }) {
  return (
    <View style={{ flex: 1, marginHorizontal: 4 }}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#555"
        keyboardType="numeric"
        maxLength={maxLength}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  simpleContent: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  simpleFooter: { paddingHorizontal: 24, paddingBottom: 40 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 48 },

  tierBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#635BFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    color: '#635BFF',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', lineHeight: 20, marginBottom: 24 },

  sectionLabel: {
    color: '#635BFF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  fieldLabel: { color: '#aaa', fontSize: 13, marginBottom: 6 },

  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 15,
    marginBottom: 12,
  },

  row2: { flexDirection: 'row', marginBottom: 0 },
  row3: { flexDirection: 'row', marginHorizontal: -4 },

  infoCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  infoCardTitle: {
    color: '#635BFF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  infoCardBody: { color: '#777', fontSize: 13, lineHeight: 18 },
  infoCode: { fontFamily: 'monospace', color: '#aaa', fontSize: 12 },

  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  bullet: { color: '#888', fontSize: 14, marginRight: 8, lineHeight: 20 },
  bulletText: { color: '#ccc', fontSize: 14, lineHeight: 20, flex: 1 },

  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
