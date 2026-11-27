import type { Onramp } from '@stripe/stripe-react-native';

export type NonEuKycCountry = 'US' | 'CA' | 'CO' | 'PH';

export type NationalIdConfiguration = {
  type: Onramp.IdType;
  label: string;
  shortLabel: string;
  placeholder: string;
  validLengths: readonly number[];
};

export type NonEuKycCountryConfiguration = {
  name: string;
  callingCode: string;
  stateLabel: string;
  postalCodeLabel: string;
  nationalId: NationalIdConfiguration;
};

export const NON_EU_KYC_COUNTRIES: Record<NonEuKycCountry, NonEuKycCountryConfiguration> = {
  US: {
    name: 'United States',
    callingCode: '+1',
    stateLabel: 'State',
    postalCodeLabel: 'ZIP code',
    nationalId: {
      type: 'social_security_number',
      label: 'Social Security Number',
      shortLabel: 'SSN',
      placeholder: '000000000',
      validLengths: [9],
    },
  },
  CA: {
    name: 'Canada',
    callingCode: '+1',
    stateLabel: 'Province',
    postalCodeLabel: 'Postal code',
    nationalId: {
      type: 'ca_sin',
      label: 'Social Insurance Number (SIN)',
      shortLabel: 'SIN',
      placeholder: '000000000',
      validLengths: [9],
    },
  },
  CO: {
    name: 'Colombia',
    callingCode: '+57',
    stateLabel: 'Department',
    postalCodeLabel: 'Postal code',
    nationalId: {
      type: 'co_nit',
      label: 'Número de Identificación Tributaria (NIT)',
      shortLabel: 'NIT',
      placeholder: '0000000000',
      validLengths: [10, 11],
    },
  },
  PH: {
    name: 'Philippines',
    callingCode: '+63',
    stateLabel: 'Province / Region',
    postalCodeLabel: 'Postal code',
    nationalId: {
      type: 'ph_tin',
      label: 'Taxpayer Identification Number (TIN)',
      shortLabel: 'TIN',
      placeholder: '000000000000',
      validLengths: [12],
    },
  },
};

export function isNonEuKycCountry(country: string): country is NonEuKycCountry {
  return country in NON_EU_KYC_COUNTRIES;
}

export function getNonEuKycCountry(country: NonEuKycCountry) {
  return NON_EU_KYC_COUNTRIES[country];
}
