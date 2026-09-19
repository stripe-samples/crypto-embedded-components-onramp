import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useOnramp } from '../hooks/useOnramp';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { getIdentifierLabel } from '../euIdentifiers';

type MissingIdentifier = { type: string; regulation: string };
type Alternative = {
  originalMissingIdentifiers: string[];
  alternativeMissingIdentifiers: string[];
};
type MissingIdentifiersResponse = {
  identifiers: MissingIdentifier[];
  alternatives: Alternative[];
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EuIdentifiers'>;
  route: RouteProp<RootStackParamList, 'EuIdentifiers'>;
};

export default function EuIdentifiersScreen({ navigation, route }: Props) {
  const { customerId, authToken } = route.params;
  const { retrieveMissingIdentifiers, submitIdentifiers } = useOnramp() as any;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requirements, setRequirements] = useState<MissingIdentifiersResponse | null>(null);

  const [values, setValues] = useState<Record<string, string>>({});
  const [alternativeChoices, setAlternativeChoices] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadRequirements = async () => {
      try {
        const result = await retrieveMissingIdentifiers();
        if (result.identifiers.length === 0) {
          navigation.replace('EuAttestation', { customerId, authToken });
          return;
        }
        setRequirements(result);
      } catch (err: any) {
        Alert.alert('Error', err.message);
      } finally {
        setLoading(false);
      }
    };
    loadRequirements();
  }, [authToken, customerId, navigation, retrieveMissingIdentifiers]);

  const getEffectiveIdentifierType = (originalType: string): string => {
    return alternativeChoices[originalType] || originalType;
  };

  const getAlternativesForType = (type: string): string[] => {
    if (!requirements) return [];
    for (const alt of requirements.alternatives) {
      if (alt.originalMissingIdentifiers.includes(type)) {
        return alt.alternativeMissingIdentifiers;
      }
    }
    return [];
  };

  const handleSubmit = async () => {
    const identifiers: { type: string; value: string }[] = [];

    for (const id of requirements?.identifiers ?? []) {
      const effectiveType = getEffectiveIdentifierType(id.type);
      const value = values[effectiveType]?.trim();
      if (!value) {
        Alert.alert('Error', `Please enter ${getIdentifierLabel(effectiveType)}.`);
        return;
      }
      identifiers.push({ type: effectiveType, value });
    }

    setSubmitting(true);
    try {
      const result = await submitIdentifiers(identifiers);
      if (result.completed) {
        navigation.navigate('EuAttestation', { customerId, authToken });
      } else {
        Alert.alert(
          'Invalid Identifiers',
          'Some identifiers were invalid. Please review and correct them.'
        );
        if (result.requirements) {
          setRequirements(result.requirements);
          setAlternativeChoices({});
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#635BFF" />
        <Text style={styles.loadingText}>Loading requirements...</Text>
      </View>
    );
  }

  const identifiers = requirements?.identifiers ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.tierBadge}>EU</Text>
      <Text style={styles.title}>National Identifiers</Text>
      <Text style={styles.subtitle}>Provide your national identifier as required by regulation</Text>

      {identifiers.map(id => {
        const alternatives = getAlternativesForType(id.type);
        const effectiveType = getEffectiveIdentifierType(id.type);

        return (
          <View key={id.type} style={{ marginBottom: 16 }}>
            {alternatives.length > 0 && (
              <View style={styles.altRow}>
                <TouchableOpacity
                  style={[
                    styles.altChip,
                    effectiveType === id.type && styles.altChipActive,
                  ]}
                  onPress={() => setAlternativeChoices(prev => {
                    const next = { ...prev };
                    delete next[id.type];
                    return next;
                  })}
                >
                  <Text style={[styles.altChipText, effectiveType === id.type && styles.altChipTextActive]}>
                    {getIdentifierLabel(id.type)}
                  </Text>
                </TouchableOpacity>
                {alternatives.map(alt => (
                  <TouchableOpacity
                    key={alt}
                    style={[
                      styles.altChip,
                      effectiveType === alt && styles.altChipActive,
                    ]}
                    onPress={() => setAlternativeChoices(prev => ({ ...prev, [id.type]: alt }))}
                  >
                    <Text style={[styles.altChipText, effectiveType === alt && styles.altChipTextActive]}>
                      {getIdentifierLabel(alt)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={styles.label}>{getIdentifierLabel(effectiveType)}</Text>
            <TextInput
              style={styles.input}
              value={values[effectiveType] || ''}
              onChangeText={val => setValues(prev => ({ ...prev, [effectiveType]: val }))}
              placeholder="Enter identifier"
              placeholderTextColor="#555"
            />
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit Identifiers</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
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
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24 },
  loadingText: { color: '#888', fontSize: 14, marginTop: 12 },
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
  },
  altRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  altChip: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 4,
  },
  altChipActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#635BFF',
  },
  altChipText: { color: '#666', fontSize: 12 },
  altChipTextActive: { color: '#635BFF' },
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
