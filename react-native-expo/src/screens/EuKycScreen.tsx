/**
 * EuKycScreen — EU identity verification via 4 sub-steps:
 *   1. Basic Info   — name, DOB, address, birth details, nationalities
 *   2. Identifiers  — MiCA national identifiers and/or CARF TINs
 *   3. Attestation  — Terms of Service via presentUserAttestation()
 *   4. Verify Docs  — document + selfie via verifyIdentity()
 *
 * Mirrors the logic in react-web/src/EuKycStep.tsx using React Native UI
 * and the RN SDK method names (requires @stripe/stripe-react-native >=0.70.0).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useOnramp } from '../hooks/useOnramp';
import {
  CARF_COUNTRY_TO_TYPE,
  EU_COUNTRY_NAMES,
  getIdentifierLabel,
} from '../euIdentifiers';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EuKyc'>;
  route: RouteProp<RootStackParamList, 'EuKyc'>;
};

type EuKycSubStep = 'basicInfo' | 'identifiers' | 'attestation' | 'verifyDocs';

type MissingIdentifier = { type: string; regulation: string };
type IdentifierAlternative = {
  originalMissingIdentifiers: string[];
  alternativeMissingIdentifiers: string[];
};
type IdentifierRequirements = {
  carfTinRequired: boolean;
  identifiers: MissingIdentifier[];
  alternatives: IdentifierAlternative[];
};

const SUB_STEP_LABELS: Record<EuKycSubStep, string> = {
  basicInfo: 'Basic Info',
  identifiers: 'Identifiers',
  attestation: 'Terms of Service',
  verifyDocs: 'Verify Documents',
};

const SUB_STEP_ORDER: EuKycSubStep[] = ['basicInfo', 'identifiers', 'attestation', 'verifyDocs'];

const EU_COUNTRY_OPTIONS = Object.entries(EU_COUNTRY_NAMES).sort((a, b) =>
  a[1].localeCompare(b[1])
);

export default function EuKycScreen({ navigation, route }: Props) {
  const { customerId, authToken, country: initialCountry } = route.params;
  const {
    attachKycInfo,
    retrieveMissingIdentifiers,
    submitIdentifiers,
    presentUserAttestation,
    verifyIdentity,
  } = useOnramp();

  const [subStep, setSubStep] = useState<EuKycSubStep>('basicInfo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic info fields
  const [givenName, setGivenName] = useState('');
  const [surname, setSurname] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [addressState, setAddressState] = useState('');
  const [country, setCountry] = useState(initialCountry ?? '');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [birthCity, setBirthCity] = useState('');
  const [birthCountry, setBirthCountry] = useState('');
  const [showBirthCountryPicker, setShowBirthCountryPicker] = useState(false);
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [natInput, setNatInput] = useState('');

  // Identifier fields
  const [requirements, setRequirements] = useState<IdentifierRequirements | null>(null);
  const [taxCountries, setTaxCountries] = useState<string[]>([]);
  const [showTaxCountryPicker, setShowTaxCountryPicker] = useState(false);
  const [identifierValues, setIdentifierValues] = useState<Record<string, string>>({});
  const [invalidIdentifiers, setInvalidIdentifiers] = useState<string[]>([]);
  const [alternativeChoices, setAlternativeChoices] = useState<Record<string, string>>({});

  // ─── Basic Info ────────────────────────────────────────

  const handleSubmitBasicInfo = useCallback(async () => {
    if (!givenName || !surname || !dobDay || !dobMonth || !dobYear ||
        !line1 || !city || !postalCode || !country ||
        !birthCity || !birthCountry || nationalities.length === 0) {
      setError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await attachKycInfo({
        firstName: givenName,
        lastName: surname,
        dateOfBirth: {
          day: parseInt(dobDay, 10),
          month: parseInt(dobMonth, 10),
          year: parseInt(dobYear, 10),
        },
        address: {
          line1,
          city,
          postalCode,
          country,
          ...(addressState ? { state: addressState } : {}),
        },
        birthCity,
        birthCountry,
        nationalities,
      });
      if (result.error) {
        setError(`Failed to submit basic info: ${result.error.message}`);
        return;
      }
      setSubStep('identifiers');
    } catch (e: any) {
      setError(`Failed to submit basic info: ${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }, [
    attachKycInfo, givenName, surname, dobDay, dobMonth, dobYear,
    line1, city, postalCode, addressState, country,
    birthCity, birthCountry, nationalities,
  ]);

  // ─── Identifiers ────────────────────────────────────────

  const handleGetMissingIdentifiers = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await retrieveMissingIdentifiers();
      if (result.error) {
        setError(`Failed to get identifiers: ${result.error.message}`);
        return;
      }
      setRequirements({
        carfTinRequired: result.carfTinRequired ?? false,
        identifiers: result.identifiers ?? [],
        alternatives: result.alternatives ?? [],
      });
    } catch (e: any) {
      setError(`Failed to get identifiers: ${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }, [retrieveMissingIdentifiers]);

  useEffect(() => {
    if (subStep === 'identifiers' && !requirements) {
      handleGetMissingIdentifiers();
    }
  }, [subStep, requirements, handleGetMissingIdentifiers]);

  const handleSubmitIdentifiers = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    setInvalidIdentifiers([]);

    const ids: { type: string; value: string }[] = [];

    if (requirements) {
      for (const id of requirements.identifiers) {
        const chosenType = alternativeChoices[id.type] ?? id.type;
        const val = identifierValues[chosenType];
        if (val) ids.push({ type: chosenType, value: val });
      }
    }

    for (const tc of taxCountries) {
      const type = CARF_COUNTRY_TO_TYPE[tc];
      const val = identifierValues[type];
      if (type && val && !ids.some(i => i.type === type)) {
        ids.push({ type, value: val });
      }
    }

    try {
      const result = await submitIdentifiers(ids);
      if (result.error) {
        setError(`Identifier submission error: ${result.error.message}`);
        return;
      }
      if (result.invalidIdentifiers && result.invalidIdentifiers.length > 0) {
        setInvalidIdentifiers(result.invalidIdentifiers);
        setRequirements({
          carfTinRequired: result.carfTinRequired ?? false,
          identifiers: result.identifiers ?? [],
          alternatives: result.alternatives ?? [],
        });
        setError(`Invalid identifiers: ${result.invalidIdentifiers.map(getIdentifierLabel).join(', ')}`);
      } else if (result.completed) {
        setSubStep('attestation');
      } else {
        setRequirements({
          carfTinRequired: result.carfTinRequired ?? false,
          identifiers: result.identifiers ?? [],
          alternatives: result.alternatives ?? [],
        });
        setError('Additional identifiers required. Please provide the remaining information.');
      }
    } catch (e: any) {
      setError(`Identifier submission error: ${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }, [requirements, identifierValues, taxCountries, alternativeChoices, submitIdentifiers]);

  // ─── Attestation ────────────────────────────────────────

  const handleAttestation = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await presentUserAttestation();
      if (result.error) {
        setError(`Attestation failed: ${result.error.message}`);
      } else if (result.status === 'Confirmed') {
        setSubStep('verifyDocs');
      } else {
        setError('Attestation was not confirmed. Please try again.');
      }
    } catch (e: any) {
      setError(`Attestation error: ${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }, [presentUserAttestation]);

  // ─── Verify Documents ────────────────────────────────────

  const handleVerifyDocuments = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyIdentity();
      if (result.error) {
        setError(`Verification error: ${result.error.message}`);
        return;
      }
      navigation.navigate('Wallet', { customerId, authToken });
    } catch (e: any) {
      setError(`Verification error: ${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }, [verifyIdentity, navigation, customerId, authToken]);

  // ─── Helpers ────────────────────────────────────────────

  const addNationality = () => {
    const code = natInput.toUpperCase().trim();
    if (code.length === 2 && !nationalities.includes(code)) {
      setNationalities([...nationalities, code]);
      setNatInput('');
    }
  };

  const currentIdx = SUB_STEP_ORDER.indexOf(subStep);

  // ─── Render ─────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <Text style={styles.euBadge}>EU</Text>
      <Text style={styles.title}>EU Identity Verification</Text>

      {/* Sub-step progress chips */}
      <View style={styles.chipRow}>
        {SUB_STEP_ORDER.map((s, i) => (
          <View
            key={s}
            style={[
              styles.chip,
              i < currentIdx && styles.chipDone,
              i === currentIdx && styles.chipActive,
            ]}
          >
            <Text style={[
              styles.chipText,
              i < currentIdx && styles.chipTextDone,
              i === currentIdx && styles.chipTextActive,
            ]}>
              {SUB_STEP_LABELS[s]}
            </Text>
          </View>
        ))}
      </View>

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ═══ Basic Info ═══ */}
      {subStep === 'basicInfo' && (
        <View>
          <SectionLabel>Personal Info</SectionLabel>
          <Row label="First name" value={givenName} onChange={setGivenName} autoCapitalize="words" />
          <Row label="Last name" value={surname} onChange={setSurname} autoCapitalize="words" />

          <SectionLabel>Date of Birth</SectionLabel>
          <View style={styles.row3}>
            <SmallField label="MM" value={dobMonth} onChange={setDobMonth} />
            <SmallField label="DD" value={dobDay} onChange={setDobDay} />
            <SmallField label="YYYY" value={dobYear} onChange={setDobYear} maxLength={4} />
          </View>

          <SectionLabel>Address</SectionLabel>
          <Row label="Address line 1" value={line1} onChange={setLine1} />
          <Row label="City" value={city} onChange={setCity} autoCapitalize="words" />
          <Row label="Postal code" value={postalCode} onChange={setPostalCode} />
          {country === 'IE' && (
            <Row label="State / County" value={addressState} onChange={setAddressState} autoCapitalize="words" />
          )}

          {/* Country picker */}
          <Text style={s.label}>Country</Text>
          <TouchableOpacity
            style={s.input}
            onPress={() => setShowCountryPicker(!showCountryPicker)}
          >
            <Text style={{ color: country ? '#fff' : '#555', fontSize: 15 }}>
              {country ? `${EU_COUNTRY_NAMES[country] ?? country} (${country})` : 'Select country'}
            </Text>
          </TouchableOpacity>
          {showCountryPicker && (
            <ScrollView style={styles.pickerList} nestedScrollEnabled>
              {EU_COUNTRY_OPTIONS.map(([code, name]) => (
                <TouchableOpacity
                  key={code}
                  style={styles.pickerItem}
                  onPress={() => { setCountry(code); setShowCountryPicker(false); }}
                >
                  <Text style={styles.pickerItemText}>{name} ({code})</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <SectionLabel>Birth Details</SectionLabel>
          <Row label="Birth city" value={birthCity} onChange={setBirthCity} autoCapitalize="words" />

          {/* Birth country picker */}
          <Text style={s.label}>Birth country</Text>
          <TouchableOpacity
            style={s.input}
            onPress={() => setShowBirthCountryPicker(!showBirthCountryPicker)}
          >
            <Text style={{ color: birthCountry ? '#fff' : '#555', fontSize: 15 }}>
              {birthCountry ? `${EU_COUNTRY_NAMES[birthCountry] ?? birthCountry} (${birthCountry})` : 'Select birth country'}
            </Text>
          </TouchableOpacity>
          {showBirthCountryPicker && (
            <ScrollView style={styles.pickerList} nestedScrollEnabled>
              {EU_COUNTRY_OPTIONS.map(([code, name]) => (
                <TouchableOpacity
                  key={code}
                  style={styles.pickerItem}
                  onPress={() => { setBirthCountry(code); setShowBirthCountryPicker(false); }}
                >
                  <Text style={styles.pickerItemText}>{name} ({code})</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <SectionLabel>Nationalities</SectionLabel>
          <View style={styles.tagRow}>
            {nationalities.map(n => (
              <TouchableOpacity
                key={n}
                style={styles.tag}
                onPress={() => setNationalities(nationalities.filter(x => x !== n))}
              >
                <Text style={styles.tagText}>{EU_COUNTRY_NAMES[n] ?? n} ×</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.addRow}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              value={natInput}
              onChangeText={v => setNatInput(v.toUpperCase().slice(0, 2))}
              placeholder="2-letter code (e.g. DE)"
              placeholderTextColor="#555"
              autoCapitalize="characters"
              maxLength={2}
            />
            <TouchableOpacity
              style={[styles.addBtn, natInput.length !== 2 && styles.addBtnDisabled]}
              onPress={addNationality}
              disabled={natInput.length !== 2}
            >
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmitBasicInfo}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Continue</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* ═══ Identifiers ═══ */}
      {subStep === 'identifiers' && (
        <View>
          {!requirements ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#635BFF" />
              <Text style={styles.loadingText}>Checking identifier requirements...</Text>
            </View>
          ) : (
            <>
              {/* CARF TINs */}
              {requirements.carfTinRequired && (
                <>
                  <SectionLabel>Tax Identification Numbers (CARF)</SectionLabel>
                  <Text style={styles.hint}>
                    Provide a TIN for each EU country where you are tax resident.
                  </Text>

                  {taxCountries.map(tc => {
                    const type = CARF_COUNTRY_TO_TYPE[tc];
                    return (
                      <View key={tc}>
                        <View style={styles.tagRow}>
                          <TouchableOpacity
                            style={styles.tag}
                            onPress={() => {
                              setTaxCountries(taxCountries.filter(x => x !== tc));
                              const newVals = { ...identifierValues };
                              delete newVals[type];
                              setIdentifierValues(newVals);
                            }}
                          >
                            <Text style={styles.tagText}>{EU_COUNTRY_NAMES[tc] ?? tc} ×</Text>
                          </TouchableOpacity>
                        </View>
                        <IdentifierInput
                          label={getIdentifierLabel(type)}
                          value={identifierValues[type] ?? ''}
                          onChange={v => setIdentifierValues({ ...identifierValues, [type]: v })}
                          invalid={invalidIdentifiers.includes(type)}
                        />
                      </View>
                    );
                  })}

                  {/* Tax country picker */}
                  <TouchableOpacity
                    style={s.input}
                    onPress={() => setShowTaxCountryPicker(!showTaxCountryPicker)}
                  >
                    <Text style={{ color: '#aaa', fontSize: 15 }}>
                      + Add tax residence country
                    </Text>
                  </TouchableOpacity>
                  {showTaxCountryPicker && (
                    <ScrollView style={styles.pickerList} nestedScrollEnabled>
                      {EU_COUNTRY_OPTIONS
                        .filter(([code]) => !taxCountries.includes(code) && code !== 'IS')
                        .map(([code, name]) => (
                          <TouchableOpacity
                            key={code}
                            style={styles.pickerItem}
                            onPress={() => {
                              setTaxCountries([...taxCountries, code]);
                              setShowTaxCountryPicker(false);
                            }}
                          >
                            <Text style={styles.pickerItemText}>{name} ({code})</Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  )}
                </>
              )}

              {/* MiCA identifiers — only those not covered by CARF TINs */}
              {(() => {
                const carfTypes = new Set(
                  taxCountries.map(tc => CARF_COUNTRY_TO_TYPE[tc]).filter(Boolean)
                );
                const unsatisfied = requirements.identifiers.filter(
                  id => !carfTypes.has(id.type)
                );
                if (unsatisfied.length === 0) return null;
                return (
                  <>
                    <SectionLabel>Required National Identifiers (MiCA)</SectionLabel>
                    {unsatisfied.map(id => {
                      const alt = requirements.alternatives.find(a =>
                        a.originalMissingIdentifiers.includes(id.type)
                      );
                      const chosenType = alternativeChoices[id.type] ?? id.type;

                      if (alt) {
                        const options = [id.type, ...alt.alternativeMissingIdentifiers];
                        return (
                          <View key={id.type} style={{ marginBottom: 16 }}>
                            <Text style={styles.hint}>Choose identifier type:</Text>
                            {options.map(opt => (
                              <TouchableOpacity
                                key={opt}
                                style={styles.radioRow}
                                onPress={() =>
                                  setAlternativeChoices({ ...alternativeChoices, [id.type]: opt })
                                }
                              >
                                <View style={[styles.radioCircle, chosenType === opt && styles.radioSelected]} />
                                <Text style={styles.radioLabel}>{getIdentifierLabel(opt)}</Text>
                              </TouchableOpacity>
                            ))}
                            <IdentifierInput
                              label={getIdentifierLabel(chosenType)}
                              value={identifierValues[chosenType] ?? ''}
                              onChange={v => setIdentifierValues({ ...identifierValues, [chosenType]: v })}
                              invalid={invalidIdentifiers.includes(chosenType)}
                            />
                          </View>
                        );
                      }

                      return (
                        <IdentifierInput
                          key={id.type}
                          label={getIdentifierLabel(id.type)}
                          value={identifierValues[id.type] ?? ''}
                          onChange={v => setIdentifierValues({ ...identifierValues, [id.type]: v })}
                          invalid={invalidIdentifiers.includes(id.type)}
                        />
                      );
                    })}
                  </>
                );
              })()}

              {/* All satisfied */}
              {!requirements.carfTinRequired && requirements.identifiers.length === 0 && (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>All identifier requirements satisfied!</Text>
                  <TouchableOpacity
                    style={[styles.button, { marginTop: 16 }]}
                    onPress={() => setSubStep('attestation')}
                  >
                    <Text style={styles.buttonText}>Continue to Terms of Service</Text>
                  </TouchableOpacity>
                </View>
              )}

              {(requirements.identifiers.length > 0 || requirements.carfTinRequired) && (
                <TouchableOpacity
                  style={[styles.button, submitting && styles.buttonDisabled]}
                  onPress={handleSubmitIdentifiers}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.buttonText}>Submit Identifiers</Text>
                  }
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

      {/* ═══ Attestation ═══ */}
      {subStep === 'attestation' && (
        <View>
          <Text style={styles.hint}>
            Review and accept the Terms of Service to continue.
          </Text>
          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleAttestation}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Present Terms of Service</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* ═══ Verify Documents ═══ */}
      {subStep === 'verifyDocs' && (
        <View>
          <Text style={styles.hint}>
            Final step: verify your identity with a document and selfie.
          </Text>
          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleVerifyDocuments}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Verify Documents</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Small helper components ─────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Row({ label, value, onChange, keyboardType, autoCapitalize }: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#555"
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'none'}
      />
    </View>
  );
}

function SmallField({ label, value, onChange, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; maxLength?: number;
}) {
  return (
    <View style={{ flex: 1, marginHorizontal: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#555"
        keyboardType="numeric"
        maxLength={maxLength ?? 2}
      />
    </View>
  );
}

function IdentifierInput({ label, value, onChange, invalid }: {
  label: string; value: string; onChange: (v: string) => void; invalid: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, invalid && styles.inputInvalid]}
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#555"
        autoCapitalize="none"
      />
      {invalid && <Text style={styles.validationText}>Invalid format</Text>}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────

const s = StyleSheet.create({
  label: { color: '#aaa', fontSize: 13, marginBottom: 6 },
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
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
  euBadge: {
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
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  chipDone: { borderColor: '#22c55e', backgroundColor: '#0f2a0f' },
  chipActive: { borderColor: '#635BFF', backgroundColor: '#1a1a2e' },
  chipText: { color: '#555', fontSize: 12, fontWeight: '600' },
  chipTextDone: { color: '#22c55e' },
  chipTextActive: { color: '#635BFF' },
  errorBanner: {
    backgroundColor: '#2a1a1a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#4a2a2a',
  },
  errorText: { color: '#ef4444', fontSize: 13, lineHeight: 18 },
  sectionLabel: {
    color: '#635BFF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 10,
  },
  row3: { flexDirection: 'row', marginBottom: 12, marginHorizontal: -4 },
  pickerList: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
    maxHeight: 220,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  pickerItemText: { color: '#fff', fontSize: 14 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tag: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#635BFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { color: '#635BFF', fontSize: 13, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  addBtn: {
    backgroundColor: '#635BFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  hint: { color: '#888', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 4,
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#555',
    marginRight: 10,
  },
  radioSelected: { borderColor: '#635BFF', backgroundColor: '#635BFF' },
  radioLabel: { color: '#ccc', fontSize: 14 },
  inputInvalid: { borderColor: '#ef4444' },
  validationText: { color: '#ef4444', fontSize: 12, marginTop: -8, marginBottom: 8 },
  loadingBox: { alignItems: 'center', paddingVertical: 24 },
  loadingText: { color: '#888', fontSize: 14, marginTop: 10 },
  successBox: { alignItems: 'center', paddingVertical: 16 },
  successText: { color: '#22c55e', fontSize: 15, fontWeight: '600' },
  button: {
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
