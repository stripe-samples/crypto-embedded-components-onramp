export type IdentifierMeta = {
  type: string;
  country: string;
  countryCode: string;
  name: string;
};

export const MICA_IDENTIFIERS: IdentifierMeta[] = [
  { type: "ee_ik", country: "Estonia", countryCode: "EE", name: "Isikukood (PIC)" },
  { type: "es_nif", country: "Spain", countryCode: "ES", name: "Tax Identification Number (NIF)" },
  { type: "is_kt", country: "Iceland", countryCode: "IS", name: "Kennitala (PIC)" },
  { type: "it_cf", country: "Italy", countryCode: "IT", name: "Codice fiscale" },
  { type: "mt_nic", country: "Malta", countryCode: "MT", name: "National Identity Card Number" },
  { type: "mt_pp", country: "Malta", countryCode: "MT", name: "Passport Number" },
  { type: "pl_pesel", country: "Poland", countryCode: "PL", name: "PESEL number" },
  { type: "pl_nip", country: "Poland", countryCode: "PL", name: "NIP" },
];

export const CARF_IDENTIFIERS: IdentifierMeta[] = [
  { type: "at_stn", country: "Austria", countryCode: "AT", name: "Steuernummer" },
  { type: "be_nrn", country: "Belgium", countryCode: "BE", name: "National Registration Number (NRN)" },
  { type: "bg_ucn", country: "Bulgaria", countryCode: "BG", name: "Unified Civil Number" },
  { type: "hr_oib", country: "Croatia", countryCode: "HR", name: "OIB" },
  { type: "cy_tic", country: "Cyprus", countryCode: "CY", name: "Tax Identification Code (TIC)" },
  { type: "cz_rc", country: "Czech Republic", countryCode: "CZ", name: "Rodne cislo" },
  { type: "dk_cpr", country: "Denmark", countryCode: "DK", name: "Personnummer (CPR)" },
  { type: "ee_ik", country: "Estonia", countryCode: "EE", name: "Isikukood (PIC)" },
  { type: "es_nif", country: "Spain", countryCode: "ES", name: "Tax Identification Number (NIF)" },
  { type: "fi_hetu", country: "Finland", countryCode: "FI", name: "Henkilotunnus (HETU)" },
  { type: "fr_spi", country: "France", countryCode: "FR", name: "Numero fiscal de reference (SPI)" },
  { type: "fr_nir", country: "France", countryCode: "FR", name: "NIR (Social Security Number)" },
  { type: "de_stn", country: "Germany", countryCode: "DE", name: "Steuer-ID" },
  { type: "gr_afm", country: "Greece", countryCode: "GR", name: "Tax Identification Number (AFM)" },
  { type: "hu_ad", country: "Hungary", countryCode: "HU", name: "Adoazonasito" },
  { type: "ie_ppsn", country: "Ireland", countryCode: "IE", name: "Personal Public Service Number (PPSN)" },
  { type: "it_cf", country: "Italy", countryCode: "IT", name: "Codice fiscale" },
  { type: "lv_pk", country: "Latvia", countryCode: "LV", name: "Personas kods" },
  { type: "lt_ak", country: "Lithuania", countryCode: "LT", name: "Asmens kodas" },
  { type: "lu_nif", country: "Luxembourg", countryCode: "LU", name: "NIF" },
  { type: "mt_nic", country: "Malta", countryCode: "MT", name: "National Identity Card Number" },
  { type: "nl_bsn", country: "Netherlands", countryCode: "NL", name: "Citizen Service Number (BSN)" },
  { type: "pl_pesel", country: "Poland", countryCode: "PL", name: "PESEL number" },
  { type: "pt_nif", country: "Portugal", countryCode: "PT", name: "NIF" },
  { type: "ro_cnp", country: "Romania", countryCode: "RO", name: "Codul Numeric Personal (CNP)" },
  { type: "sk_rc", country: "Slovakia", countryCode: "SK", name: "Rodne cislo" },
  { type: "si_pin", country: "Slovenia", countryCode: "SI", name: "Personal Identification Number (EMSO)" },
  { type: "se_pin", country: "Sweden", countryCode: "SE", name: "Personnummer (PIN)" },
];

export const CARF_COUNTRY_TO_TYPE: Record<string, string> = {
  AT: "at_stn", BE: "be_nrn", BG: "bg_ucn", HR: "hr_oib", CY: "cy_tic",
  CZ: "cz_rc", DK: "dk_cpr", EE: "ee_ik", ES: "es_nif", FI: "fi_hetu",
  FR: "fr_spi", DE: "de_stn", GR: "gr_afm", HU: "hu_ad", IE: "ie_ppsn",
  IT: "it_cf", LV: "lv_pk", LT: "lt_ak", LU: "lu_nif", MT: "mt_nic",
  NL: "nl_bsn", PL: "pl_pesel", PT: "pt_nif", RO: "ro_cnp", SK: "sk_rc",
  SI: "si_pin", SE: "se_pin",
};

const ALL_IDENTIFIERS = [...MICA_IDENTIFIERS, ...CARF_IDENTIFIERS];

export const getIdentifierLabel = (type: string): string => {
  const meta = ALL_IDENTIFIERS.find((i) => i.type === type);
  return meta ? `${meta.name} (${meta.country})` : type;
};

export const EU_COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus",
  CZ: "Czech Republic", DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France",
  DE: "Germany", GR: "Greece", HU: "Hungary", IE: "Ireland", IS: "Iceland",
  IT: "Italy", LV: "Latvia", LT: "Lithuania", LU: "Luxembourg", MT: "Malta",
  NL: "Netherlands", PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia",
  SI: "Slovenia", ES: "Spain", SE: "Sweden",
};

export const EU_COUNTRIES = new Set(Object.keys(EU_COUNTRY_NAMES));
