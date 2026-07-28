import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { SettingsProvider } from '../context/SettingsContext';

import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AuthScreen from '../screens/AuthScreen';
import RegisterScreen from '../screens/RegisterScreen';
import KYCPrimerScreen from '../screens/KYCPrimerScreen';
import KYCScreen from '../screens/KYCScreen';
import AddressScreen from '../screens/AddressScreen';
import WalletScreen from '../screens/WalletScreen';
import PaymentMethodScreen from '../screens/PaymentMethodScreen';
import KYCStepUpScreen from '../screens/KYCStepUpScreen';
import EuKycScreen from '../screens/EuKycScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import SuccessScreen from '../screens/SuccessScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    // SettingsProvider persists the demo configuration (KYC tier, limit source)
    // to AsyncStorage and makes it available to all screens via useSettings().
    <SettingsProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#0a0a0a' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: '#0a0a0a' },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Demo Settings' }} />
          <Stack.Screen name="Auth" component={AuthScreen} options={{ title: 'Sign In' }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create Account' }} />
          <Stack.Screen name="KYCPrimer" component={KYCPrimerScreen} options={{ title: 'Verify Identity' }} />
          <Stack.Screen name="KYC" component={KYCScreen} options={{ title: 'Personal Info' }} />
          <Stack.Screen name="EuKyc" component={EuKycScreen} options={{ title: 'EU Identity Verification' }} />
          <Stack.Screen name="Address" component={AddressScreen} options={{ title: 'Home Address' }} />
          <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: 'Add Wallet' }} />
          <Stack.Screen name="PaymentMethod" component={PaymentMethodScreen} options={{ title: 'Payment' }} />
          <Stack.Screen
            name="KYCStepUp"
            component={KYCStepUpScreen}
            options={{ title: 'Verify Identity' }}
          />
          <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Review Order', headerBackVisible: false }} />
          <Stack.Screen name="Success" component={SuccessScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SettingsProvider>
  );
}
