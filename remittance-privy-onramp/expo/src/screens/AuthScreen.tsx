import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLoginWithEmail, usePrivy, type User as PrivyUser } from '@privy-io/expo';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { errorMessage } from '../errors';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Auth'>;
};

export default function AuthScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const { user: privyUser, isReady: privyReady, getAccessToken, logout } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();

  const getPrivyEmail = (user: PrivyUser | null | undefined) => {
    const account = user?.linked_accounts.find(linkedAccount => linkedAccount.type === 'email');
    return account?.type === 'email' ? account.address : undefined;
  };

  const continueWithPrivy = async () => {
    if (!getPrivyEmail(privyUser) && !email.trim()) {
      throw new Error('Privy user must have a linked email account');
    }
    const privyAccessToken = await getAccessToken();
    if (!privyAccessToken) {
      throw new Error('Privy did not return an access token');
    }
    navigation.navigate('TransferSetup');
  };

  const sendLoginCode = async () => {
    if (!privyReady) return;
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email.');
      return;
    }
    setLoading(true);
    try {
      await sendCode({ email: email.trim() });
      setCodeSent(true);
    } catch (err: unknown) {
      Alert.alert('Error', errorMessage(err) || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    if (!privyReady) return;
    if (!privyUser && (!email.trim() || !code.trim())) {
      Alert.alert('Error', 'Please enter the code sent to your email.');
      return;
    }
    setLoading(true);
    try {
      if (!privyUser) {
        await loginWithCode({ email: email.trim(), code: code.trim() });
      }
      await continueWithPrivy();
    } catch (err: unknown) {
      Alert.alert('Error', errorMessage(err) || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const signedInEmail = getPrivyEmail(privyUser);
  const canContinue = Boolean(privyUser) || codeSent;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>Use Privy to sign in to the remittance app.</Text>

      {signedInEmail ? (
        <View style={styles.signedInCard}>
          <Text style={styles.signedInLabel}>Signed in with Privy</Text>
          <Text style={styles.signedInEmail}>{signedInEmail}</Text>
          <TouchableOpacity style={styles.signOutButton} onPress={logout} disabled={loading}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#555"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!codeSent && !loading}
          />
          {codeSent ? (
            <>
              <Text style={styles.label}>Code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor="#555"
                keyboardType="number-pad"
                autoCapitalize="none"
              />
            </>
          ) : null}
        </>
      )}

      <View style={styles.buttonRow}>
        {!canContinue ? (
          <TouchableOpacity
            style={[styles.button, (!privyReady || loading) && styles.buttonDisabled]}
            onPress={sendLoginCode}
            disabled={!privyReady || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send code</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, (!privyReady || loading) && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={!privyReady || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingHorizontal: 24, paddingTop: 48 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 32 },
  label: { color: '#aaa', fontSize: 14, marginBottom: 8 },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
  },
  signedInCard: {
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
  },
  signedInLabel: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  signedInEmail: { color: '#fff', fontSize: 16, fontWeight: '700' },
  signOutButton: { alignSelf: 'flex-start', paddingTop: 12 },
  signOutText: { color: '#8b85ff', fontSize: 14, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    backgroundColor: '#635BFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#635BFF',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: '#635BFF', fontSize: 16, fontWeight: '600' },
});
