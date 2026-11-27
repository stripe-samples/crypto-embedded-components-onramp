import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { Dayjs } from "dayjs";
import type {
  OnrampCoordinator,
  IdentifierRequirements,
  UpdateKycResult,
  Identifier,
} from "@stripe/crypto";
import { getTheme } from "./theme";
import { EU_COUNTRIES } from "./shared";
import {
  CARF_COUNTRY_TO_TYPE,
  EU_COUNTRY_NAMES,
  getIdentifierLabel,
} from "./euIdentifiers";
import type { KycLevel } from "./types";

type EuKycSubStep = "basicInfo" | "identifiers" | "attestation" | "verifyDocs";

export type EuKycStepProps = {
  darkMode: boolean;
  onramp: OnrampCoordinator;
  kycLevel: KycLevel;
  providedFields: string[];
  polling: boolean;
  loading: boolean;
  country?: string;
  onComplete: () => void;
  onRefreshKycLevel: () => void;
  setError: (error: string | null) => void;
  log: (event: string, detail?: string) => void;
};

function isEuKycComplete(providedFields: string[]): boolean {
  return (
    providedFields.includes("identifiers") &&
    providedFields.includes("attestation")
  );
}

function determineInitialSubStep(
  kycLevel: KycLevel,
  providedFields: string[],
): EuKycSubStep {
  const hasIdentifiers = providedFields.includes("identifiers");
  const hasAttestation = providedFields.includes("attestation");

  if (hasIdentifiers && hasAttestation) {
    return "verifyDocs";
  }

  if (hasIdentifiers) {
    return "attestation";
  }

  if (kycLevel === "PENDING" || kycLevel === "L1" || kycLevel === "L2" || kycLevel === "REJECTED") {
    return "identifiers";
  }

  return "basicInfo";
}

export const EuKycStep: React.FC<EuKycStepProps> = (props) => {
  const t = getTheme(props.darkMode);
  const colors = t.colors;
  const { inputSx, accentButtonSx } = t;

  const [subStep, setSubStep] = useState<EuKycSubStep>(() =>
    determineInitialSubStep(props.kycLevel, props.providedFields),
  );
  const [submitting, setSubmitting] = useState(false);

  // Basic info fields
  const [givenName, setGivenName] = useState("");
  const [surname, setSurname] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressState, setAddressState] = useState("");
  const [country, setCountry] = useState(props.country ?? "");
  const [dob, setDOB] = useState<Dayjs | null>(null);
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [natInput, setNatInput] = useState("");
  const [birthCity, setBirthCity] = useState("");
  const [birthCountry, setBirthCountry] = useState("");

  // Identifiers
  const [requirements, setRequirements] = useState<IdentifierRequirements | null>(null);
  const [taxCountries, setTaxCountries] = useState<string[]>([]);
  const [taxCountryInput, setTaxCountryInput] = useState("");
  const [identifierValues, setIdentifierValues] = useState<Record<string, string>>({});
  const [invalidIdentifiers, setInvalidIdentifiers] = useState<string[]>([]);
  const [alternativeChoices, setAlternativeChoices] = useState<Record<string, string>>({});

  // Attestation
  const attestationRef = useRef<HTMLDivElement>(null);
  const [attestationMounted, setAttestationMounted] = useState(false);


  const { kycLevel, providedFields, onComplete } = props;

  // Auto-advance only when ALL conditions are met:
  // 1. kyc_tiers L2 is verified (kycLevel === "L2")
  // 2. "identifiers" in provided_fields
  // 3. "attestation" in provided_fields
  useEffect(() => {
    if (kycLevel === "L2" && isEuKycComplete(providedFields)) {
      onComplete();
    }
  }, [kycLevel, providedFields, onComplete]);

  const handleSubmitBasicInfo = useCallback(async () => {
    setSubmitting(true);
    props.setError(null);
    const parsedDob = dob
      ? { year: dob.year(), month: dob.month() + 1, day: dob.date() }
      : undefined;

    try {
      props.log("EU KYC: Submitting basic info", `country=${country}, nationalities=${nationalities.join(",")}`);
      await props.onramp.submitKycInfo({
        given_name: givenName,
        surname,
        date_of_birth: parsedDob,
        address: {
          line1,
          city,
          postal_code: postalCode,
          ...(addressState ? { state: addressState } : {}),
          country,
        },
        nationalities,
        birth_city: birthCity,
        birth_country: birthCountry,
      });
      props.log("EU KYC: Basic info submitted");
      setSubStep("identifiers");
    } catch (e: any) {
      props.setError(`EU KYC submission error: ${e?.message || e}`);
    } finally {
      setSubmitting(false);
    }
  }, [props, givenName, surname, dob, line1, city, postalCode, addressState, country, nationalities, birthCity, birthCountry]);

  const handleGetMissingIdentifiers = useCallback(async () => {
    setSubmitting(true);
    props.setError(null);
    try {
      props.log("EU KYC: Getting missing identifiers...");
      const result = await props.onramp.getMissingIdentifiers();
      props.log("EU KYC: Missing identifiers received", `carf_required=${result.carf_tin_required}, mica_count=${result.identifiers.length}`);
      setRequirements(result);
    } catch (e: any) {
      props.setError(`Failed to get identifiers: ${e?.message || e}`);
    } finally {
      setSubmitting(false);
    }
  }, [props]);

  useEffect(() => {
    if (subStep === "identifiers" && !requirements) {
      handleGetMissingIdentifiers();
    }
  }, [subStep, requirements, handleGetMissingIdentifiers]);

  const handleSubmitIdentifiers = useCallback(async () => {
    setSubmitting(true);
    props.setError(null);
    setInvalidIdentifiers([]);

    const identifiers: Identifier[] = [];

    // MiCA identifiers (use chosen alternative type if user selected one)
    if (requirements) {
      for (const id of requirements.identifiers) {
        const chosenType = alternativeChoices[id.type] ?? id.type;
        const val = identifierValues[chosenType];
        if (val) identifiers.push({ type: chosenType, value: val } as Identifier);
      }
    }

    // CARF TINs
    for (const tc of taxCountries) {
      const type = CARF_COUNTRY_TO_TYPE[tc];
      const val = identifierValues[type];
      if (type && val) {
        if (!identifiers.some((i) => i.type === type)) {
          identifiers.push({ type, value: val } as Identifier);
        }
      }
    }

    try {
      props.log("EU KYC: Submitting identifiers", `count=${identifiers.length}`);
      const result: UpdateKycResult = await props.onramp.updateKycInfo(identifiers);
      props.log("EU KYC: Identifiers result", `completed=${result.completed}`);

      if (result.invalid_identifiers.length > 0) {
        setInvalidIdentifiers(result.invalid_identifiers);
        setRequirements({
          carf_tin_required: result.carf_tin_required,
          identifiers: result.identifiers,
          alternatives: result.alternatives ?? [],
        });
        props.setError(`Invalid identifiers: ${result.invalid_identifiers.map(getIdentifierLabel).join(", ")}`);
      } else if (result.completed) {
        setSubStep("attestation");
      } else {
        setRequirements({
          carf_tin_required: result.carf_tin_required,
          identifiers: result.identifiers,
          alternatives: result.alternatives,
        });
        props.setError("Additional identifiers required. Please provide the remaining information.");
      }
    } catch (e: any) {
      props.setError(`Identifier submission error: ${e?.message || e}`);
    } finally {
      setSubmitting(false);
    }
  }, [props, requirements, identifierValues, taxCountries, alternativeChoices]);

  const handleAttestation = useCallback(async () => {
    setSubmitting(true);
    props.setError(null);
    try {
      props.log("EU KYC: Presenting attestation...");
      const element = await props.onramp.promptUserAttestation(
        "eu_carf",
        ({ result }) => {
          props.log("EU KYC: Attestation result", result);
          if (result === "confirmed") {
            setSubStep("verifyDocs");
          } else {
            props.setError("Attestation was not confirmed. Please try again.");
          }
          setSubmitting(false);
        },
      );
      if (attestationRef.current) {
        attestationRef.current.replaceChildren(element);
        setAttestationMounted(true);
        setSubmitting(false);
      }
    } catch (e: any) {
      props.setError(`Attestation error: ${e?.message || e}`);
      setSubmitting(false);
    }
  }, [props]);

  const handleVerifyDocuments = useCallback(async () => {
    setSubmitting(true);
    props.setError(null);
    try {
      props.log("EU KYC: Starting document verification...");
      await props.onramp.verifyDocuments();
      props.log("EU KYC: Document verification complete");
      props.onRefreshKycLevel();
      props.onComplete();
    } catch (e: any) {
      props.setError(`Verification error: ${e?.message || e}`);
    } finally {
      setSubmitting(false);
    }
  }, [props]);

  const addNationality = () => {
    const code = natInput.toUpperCase().trim();
    if (code.length === 2 && !nationalities.includes(code)) {
      setNationalities([...nationalities, code]);
      setNatInput("");
    }
  };

  const addTaxCountry = () => {
    const code = taxCountryInput.toUpperCase().trim();
    if (code.length === 2 && EU_COUNTRIES.has(code) && !taxCountries.includes(code)) {
      setTaxCountries([...taxCountries, code]);
      setTaxCountryInput("");
    }
  };

  const SUB_STEP_LABELS: Record<EuKycSubStep, string> = {
    basicInfo: "Basic Info",
    identifiers: "Identifiers",
    attestation: "Terms of Service",
    verifyDocs: "Verify Documents",
  };

  const subStepOrder: EuKycSubStep[] = ["basicInfo", "identifiers", "attestation", "verifyDocs"];
  const currentIdx = subStepOrder.indexOf(subStep);

  // ─── Render ────────────────────────────────────────────

  return (
    <Stack spacing={3}>
      {/* Sub-step indicator */}
      <Box>
        <Typography
          sx={{ color: colors.textPrimary, fontSize: "1.5rem", fontWeight: 700, mb: 0.5 }}
        >
          EU Identity Verification
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          {subStepOrder.map((s, i) => (
            <Chip
              key={s}
              label={SUB_STEP_LABELS[s]}
              size="small"
              sx={{
                bgcolor: i < currentIdx ? `${colors.success}22` : i === currentIdx ? `${colors.accent}22` : "transparent",
                color: i < currentIdx ? colors.success : i === currentIdx ? colors.accent : colors.textMuted,
                fontWeight: 600,
                fontSize: "0.65rem",
                border: `1px solid ${i <= currentIdx ? (i < currentIdx ? colors.success : colors.accent) : colors.borderSubtle}44`,
              }}
            />
          ))}
        </Stack>
      </Box>

      {/* ═══ Basic Info ═══ */}
      {subStep === "basicInfo" && (
        <>
          <Typography sx={{ color: colors.textMuted, fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
            Personal Info
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <TextField label="First name" value={givenName} onChange={(e) => setGivenName(e.target.value)} size="small" fullWidth sx={inputSx} />
            <TextField label="Last name" value={surname} onChange={(e) => setSurname(e.target.value)} size="small" fullWidth sx={inputSx} />
          </Stack>

          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              label="Date of birth"
              value={dob}
              onChange={(v) => setDOB(v)}
              slotProps={{ textField: { size: "small", fullWidth: true, sx: inputSx } }}
            />
          </LocalizationProvider>

          <Typography sx={{ color: colors.textMuted, fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, pt: 1 }}>
            Address
          </Typography>
          <TextField label="Address line 1" value={line1} onChange={(e) => setLine1(e.target.value)} size="small" fullWidth sx={inputSx} />
          <Stack direction="row" spacing={1.5}>
            <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} size="small" fullWidth sx={inputSx} />
            <TextField label="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} size="small" sx={{ ...inputSx, maxWidth: 140 }} />
          </Stack>
          {country === "IE" && (
            <TextField label="State" value={addressState} onChange={(e) => setAddressState(e.target.value)} size="small" fullWidth sx={inputSx} />
          )}
          {!props.country && (
            <TextField
              select
              label="Country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              size="small"
              fullWidth
              sx={inputSx}
            >
              {Array.from(EU_COUNTRIES).sort().map((code) => (
                <MenuItem key={code} value={code}>{EU_COUNTRY_NAMES[code] ?? code} ({code})</MenuItem>
              ))}
            </TextField>
          )}

          <Typography sx={{ color: colors.textMuted, fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, pt: 1 }}>
            Birth Details
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <TextField label="Birth city" value={birthCity} onChange={(e) => setBirthCity(e.target.value)} size="small" fullWidth sx={inputSx} />
            <TextField
              select
              label="Birth country"
              value={birthCountry}
              onChange={(e) => setBirthCountry(e.target.value)}
              size="small"
              sx={{ ...inputSx, minWidth: 140 }}
            >
              {Array.from(EU_COUNTRIES).sort().map((code) => (
                <MenuItem key={code} value={code}>{code}</MenuItem>
              ))}
            </TextField>
          </Stack>

          <Typography sx={{ color: colors.textMuted, fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, pt: 1 }}>
            Nationalities
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {nationalities.map((n) => (
              <Chip
                key={n}
                label={EU_COUNTRY_NAMES[n] ?? n}
                size="small"
                onDelete={() => setNationalities(nationalities.filter((x) => x !== n))}
                sx={{ bgcolor: `${colors.accent}22`, color: colors.accent, fontWeight: 600, fontSize: "0.7rem" }}
              />
            ))}
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Add nationality (2-letter code)"
              value={natInput}
              onChange={(e) => setNatInput(e.target.value.toUpperCase().slice(0, 2))}
              size="small"
              fullWidth
              sx={inputSx}
              onKeyDown={(e) => { if (e.key === "Enter") addNationality(); }}
            />
            <Button onClick={addNationality} disabled={natInput.length !== 2} sx={{ ...accentButtonSx, minWidth: 60 }} variant="contained">
              Add
            </Button>
          </Stack>

          <Button
            variant="contained"
            onClick={handleSubmitBasicInfo}
            disabled={submitting || !givenName || !surname || !line1 || !city || !postalCode || !country || !dob || nationalities.length === 0 || !birthCity || !birthCountry}
            fullWidth
            sx={accentButtonSx}
          >
            {submitting ? <CircularProgress size={20} sx={{ color: "#fff" }} /> : "Continue"}
          </Button>
        </>
      )}

      {/* ═══ Identifiers ═══ */}
      {subStep === "identifiers" && (
        <>
          {!requirements ? (
            <Stack alignItems="center" py={2}>
              <CircularProgress size={28} sx={{ color: colors.accent }} />
              <Typography sx={{ color: colors.textSecondary, fontSize: "0.85rem", mt: 1 }}>
                Checking identifier requirements...
              </Typography>
            </Stack>
          ) : (
            <>
              {/* CARF TINs — shown first since they can satisfy MiCA requirements */}
              {requirements.carf_tin_required && (
                <>
                  <Typography sx={{ color: colors.textMuted, fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                    Tax Identification Numbers (CARF)
                  </Typography>
                  <Typography sx={{ color: colors.textSecondary, fontSize: "0.8rem" }}>
                    Provide a TIN for each EU country where you are tax resident.
                  </Typography>

                  {taxCountries.map((tc) => {
                    const type = CARF_COUNTRY_TO_TYPE[tc];
                    return (
                      <Stack key={tc} direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={EU_COUNTRY_NAMES[tc] ?? tc}
                          size="small"
                          onDelete={() => {
                            setTaxCountries(taxCountries.filter((x) => x !== tc));
                            const newVals = { ...identifierValues };
                            delete newVals[type];
                            setIdentifierValues(newVals);
                          }}
                          sx={{ bgcolor: `${colors.cyan}22`, color: colors.cyan, fontWeight: 600, fontSize: "0.7rem" }}
                        />
                        <TextField
                          label={getIdentifierLabel(type)}
                          value={identifierValues[type] ?? ""}
                          onChange={(e) => setIdentifierValues({ ...identifierValues, [type]: e.target.value })}
                          size="small"
                          fullWidth
                          error={invalidIdentifiers.includes(type)}
                          helperText={invalidIdentifiers.includes(type) ? "Invalid format" : undefined}
                          sx={inputSx}
                        />
                      </Stack>
                    );
                  })}

                  <Stack direction="row" spacing={1}>
                    <TextField
                      select
                      label="Add tax residence country"
                      value={taxCountryInput}
                      onChange={(e) => setTaxCountryInput(e.target.value)}
                      size="small"
                      fullWidth
                      sx={inputSx}
                    >
                      {Array.from(EU_COUNTRIES)
                        .filter((c) => !taxCountries.includes(c) && c !== "IS")
                        .sort()
                        .map((code) => (
                          <MenuItem key={code} value={code}>{EU_COUNTRY_NAMES[code] ?? code}</MenuItem>
                        ))}
                    </TextField>
                    <Button onClick={addTaxCountry} disabled={!taxCountryInput} sx={{ ...accentButtonSx, minWidth: 60 }} variant="contained">
                      Add
                    </Button>
                  </Stack>
                </>
              )}

              {/* MiCA identifiers — only show those NOT already covered by a CARF TIN */}
              {(() => {
                const carfTypes = new Set(taxCountries.map((tc) => CARF_COUNTRY_TO_TYPE[tc]).filter(Boolean));
                const unsatisfiedMica = requirements.identifiers.filter((id) => !carfTypes.has(id.type));
                if (unsatisfiedMica.length === 0) return null;
                return (
                  <>
                    {requirements.carf_tin_required && <Divider sx={{ borderColor: colors.borderSubtle }} />}
                    <Typography sx={{ color: colors.textMuted, fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                      Required National Identifiers (MiCA)
                    </Typography>
                    {unsatisfiedMica.map((id) => {
                      const alt = requirements.alternatives.find((a) =>
                        a.original_missing_identifiers.includes(id.type)
                      );
                      const chosenType = alternativeChoices[id.type] ?? id.type;

                      if (alt) {
                        const options = [id.type, ...alt.alternative_missing_identifiers];
                        return (
                          <Stack key={id.type} spacing={1}>
                            <Typography sx={{ color: colors.textSecondary, fontSize: "0.8rem" }}>
                              Choose identifier type:
                            </Typography>
                            <RadioGroup
                              value={chosenType}
                              onChange={(e) => setAlternativeChoices({ ...alternativeChoices, [id.type]: e.target.value })}
                            >
                              {options.map((opt) => (
                                <FormControlLabel
                                  key={opt}
                                  value={opt}
                                  control={<Radio size="small" sx={{ color: colors.accent, "&.Mui-checked": { color: colors.accent } }} />}
                                  label={getIdentifierLabel(opt)}
                                  sx={{ "& .MuiFormControlLabel-label": { fontSize: "0.85rem", color: colors.textPrimary } }}
                                />
                              ))}
                            </RadioGroup>
                            <TextField
                              label={getIdentifierLabel(chosenType)}
                              value={identifierValues[chosenType] ?? ""}
                              onChange={(e) => setIdentifierValues({ ...identifierValues, [chosenType]: e.target.value })}
                              size="small"
                              fullWidth
                              error={invalidIdentifiers.includes(chosenType)}
                              helperText={invalidIdentifiers.includes(chosenType) ? "Invalid format" : undefined}
                              sx={inputSx}
                            />
                          </Stack>
                        );
                      }

                      return (
                        <TextField
                          key={id.type}
                          label={getIdentifierLabel(id.type)}
                          value={identifierValues[id.type] ?? ""}
                          onChange={(e) => setIdentifierValues({ ...identifierValues, [id.type]: e.target.value })}
                          size="small"
                          fullWidth
                          error={invalidIdentifiers.includes(id.type)}
                          helperText={invalidIdentifiers.includes(id.type) ? "Invalid format" : undefined}
                          sx={inputSx}
                        />
                      );
                    })}
                  </>
                );
              })()}

              {/* All satisfied */}
              {!requirements.carf_tin_required && requirements.identifiers.length === 0 && (
                <Stack alignItems="center" py={2}>
                  <Typography sx={{ color: colors.success, fontSize: "0.9rem", fontWeight: 600 }}>
                    All identifier requirements satisfied!
                  </Typography>
                  <Button variant="contained" onClick={() => setSubStep("attestation")} sx={{ ...accentButtonSx, mt: 2 }}>
                    Continue to Terms of Service
                  </Button>
                </Stack>
              )}

              {(requirements.identifiers.length > 0 || requirements.carf_tin_required) && (
                <Button
                  variant="contained"
                  onClick={handleSubmitIdentifiers}
                  disabled={submitting}
                  fullWidth
                  sx={accentButtonSx}
                >
                  {submitting ? <CircularProgress size={20} sx={{ color: "#fff" }} /> : "Submit Identifiers"}
                </Button>
              )}
            </>
          )}
        </>
      )}

      {/* ═══ Attestation ═══ */}
      {subStep === "attestation" && (
        <Stack spacing={2}>
          <Typography sx={{ color: colors.textSecondary, fontSize: "0.85rem" }}>
            Review and accept the Terms of Service to continue.
          </Typography>
          <Box
            ref={attestationRef}
            sx={{
              minHeight: attestationMounted ? undefined : 200,
              width: "100%",
              "& iframe": { border: "none", width: "100%", minHeight: 300 },
            }}
          />
          {!attestationMounted && (
            <Button
              variant="contained"
              onClick={handleAttestation}
              disabled={submitting}
              fullWidth
              sx={accentButtonSx}
            >
              {submitting ? <CircularProgress size={20} sx={{ color: "#fff" }} /> : "Present Terms of Service"}
            </Button>
          )}
        </Stack>
      )}

      {/* ═══ Verify Documents ═══ */}
      {subStep === "verifyDocs" && (
        <Stack spacing={2} alignItems="center">
          <Typography sx={{ color: colors.textSecondary, fontSize: "0.85rem" }}>
            Final step: verify your identity with a document and selfie.
          </Typography>
          <Button
            variant="contained"
            onClick={handleVerifyDocuments}
            disabled={submitting}
            fullWidth
            sx={accentButtonSx}
          >
            {submitting ? <CircularProgress size={20} sx={{ color: "#fff" }} /> : "Verify Documents"}
          </Button>
        </Stack>
      )}
    </Stack>
  );
};
