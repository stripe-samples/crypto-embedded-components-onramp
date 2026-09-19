import type { Onramp } from '@stripe/stripe-react-native';
import { EU_COUNTRIES, EU_COUNTRY_NAMES } from './euIdentifiers';

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

export const COUNTRY_NAMES: Record<string, string> = {
  ...EU_COUNTRY_NAMES,
  ...Object.fromEntries(
    Object.entries(NON_EU_KYC_COUNTRIES).map(([code, country]) => [code, country.name]),
  ),
};

export const countryFlag = (code: string) =>
  [...code.toUpperCase()]
    .map(character => String.fromCodePoint(0x1F1E6 - 65 + character.charCodeAt(0)))
    .join('');

export const COUNTRY_OPTIONS = [
  ...(Object.keys(NON_EU_KYC_COUNTRIES) as NonEuKycCountry[]).map(code => ({
    code,
    label: NON_EU_KYC_COUNTRIES[code].name,
    flag: countryFlag(code),
  })),
  ...Object.entries(EU_COUNTRY_NAMES)
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([code, label]) => ({ code, label, flag: countryFlag(code) })),
];

export function isEuKycCountry(country: string): boolean {
  return EU_COUNTRIES.has(country);
}

export function isNonEuKycCountry(country: string): country is NonEuKycCountry {
  return country in NON_EU_KYC_COUNTRIES;
}

export function getNonEuKycCountry(country: NonEuKycCountry) {
  return NON_EU_KYC_COUNTRIES[country];
}
