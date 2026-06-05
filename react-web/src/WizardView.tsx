import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  Link,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { Dayjs } from "dayjs";
import type { KycInfo, CryptoNetwork, OnrampCoordinator } from "@stripe/crypto";
import { getTheme } from "./theme";
import { EXPLORER_URLS, getNetworks, isEuCountry, EU_COUNTRIES } from "./shared";
import { EU_COUNTRY_NAMES } from "./euIdentifiers";
import type { AccountStatus, KycLevel, KycRegion, Verification, Wallet, OnrampSession } from "./types";
import { EuKycStep } from "./EuKycStep";

export type WizardViewProps = {
  darkMode: boolean;
  email: string;
  setEmail: (email: string) => void;
  error: string | null;
  setError: (error: string | null) => void;
  accountStatus: AccountStatus;
  cryptoCustomerId: string | null | undefined;
  linkAuthIntentId: string | null | undefined;
  kycLevel: KycLevel;
  kycRegion: KycRegion;
  verifications: Verification[];
  providedFields: string[];
  onramp: OnrampCoordinator;
  cryptoPaymentToken: string | null | undefined;
  selectedWallet: string | null;
  selectedWalletNetwork: string | null;
  loading: boolean;
  polling: boolean;
  livemode: boolean;
  settingsLai: string | null;
  onCheckAccount: (email: string) => Promise<void>;
  onRegister: (email: string, phone: string, country: string) => Promise<void>;
  onSubmitKycInfo: (info: KycInfo) => Promise<void>;
  onRegisterWallet: (address: string, network: CryptoNetwork) => Promise<void>;
  onDeleteWallet: (token: string) => Promise<void>;
  onCollectPaymentMethod: (
    types: string[],
    wallets: { applePay: "auto" | "never"; googlePay: "auto" | "never" },
  ) => Promise<HTMLElement>;
  onVerifyDocuments: () => Promise<void>;
  onAddFunds: (
    amount: string,
    currency: string,
  ) => Promise<OnrampSession | null>;
  onCheckout: (sessionId: string) => Promise<void>;
  onSelectWallet: (
    wallet: { wallet_address: string; network: string } | null,
  ) => void;
  onRefreshKycLevel: () => void;
  authenticating: boolean;
  log: (event: string, detail?: string) => void;
};

// ─── Constants ─────────────────────────────────────────────

const STEPS = ["Login", "KYC", "Wallet", "Payment", "Buy"];
const PRESET_AMOUNTS = ["1", "5", "25", "100"];

// ─── Helpers ───────────────────────────────────────────────

const formatSSN = (raw: string): string => {
  const d = raw.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
};

// ─── Component ─────────────────────────────────────────────

export const WizardView: React.FC<WizardViewProps> = (props) => {
  const t = getTheme(props.darkMode);
  const colors = t.colors;
  const { glowCardSx, inputSx, accentButtonSx } = t;

  const KYC_CHIP: Record<string, { color: string; label: string }> = {
    L2: { color: colors.success, label: "L2" },
    L1: { color: colors.cyan, label: "L1" },
    L0: { color: colors.warning, label: "L0" },
    REQUIRES_KYC: { color: colors.textMuted, label: "Not Verified" },
    REJECTED: { color: colors.error, label: "Rejected" },
    PENDING: { color: colors.warning, label: "Pending..." },
  };

  const Row: React.FC<{
    label: string;
    value: string;
    valueColor?: string;
  }> = ({ label, value, valueColor }) => (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Typography sx={{ color: colors.textSecondary, fontSize: "0.85rem" }}>
        {label}
      </Typography>
      <Typography
        sx={{
          color: valueColor || colors.textPrimary,
          fontSize: "0.85rem",
          fontWeight: 600,
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </Typography>
    </Box>
  );
  const [step, setStep] = useState(0);
  const [fade, setFade] = useState(true);

  // Step 0: Login / Register
  const [phoneNumber, setPhoneNumber] = useState("");
  const [regCountry, setRegCountry] = useState("US");

  // Step 1: KYC
  const [givenName, setGivenName] = useState("");
  const [surname, setSurname] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [kycCountry, setKycCountry] = useState("");
  const [ssn, setSSN] = useState("");
  const [dob, setDOB] = useState<Dayjs | null>(null);

  // Step 2: Wallets
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [newAddr, setNewAddr] = useState("");
  const [newNet, setNewNet] = useState<CryptoNetwork>("solana");
  const [adding, setAdding] = useState(false);
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);

  // Step 3: Payment
  const paymentRef = useRef<HTMLDivElement>(null);
  const [payMounted, setPayMounted] = useState(false);

  // Step 4: Buy
  const [buySubStep, setBuySubStep] = useState<
    "amount" | "confirm" | "polling" | "result"
  >("amount");
  const [selectedAmt, setSelectedAmt] = useState<string | null>("1");
  const [customAmt, setCustomAmt] = useState("");
  const [destCurrency, setDestCurrency] = useState("usdc");
  const [session, setSession] = useState<OnrampSession | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<{
    status: string;
    transaction_id: string | null;
  } | null>(null);
  const [quoteSecondsLeft, setQuoteSecondsLeft] = useState<number | null>(null);
  const [refreshingQuote, setRefreshingQuote] = useState(false);

  // ─── Quote expiration countdown + auto-refresh ────────

  const refreshQuote = useCallback(async () => {
    if (!session || !props.linkAuthIntentId) return;
    setRefreshingQuote(true);
    try {
      const res = await fetch(
        `/api/crypto/onramp_sessions/${session.id}/quote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lai: props.linkAuthIntentId,
            livemode: props.livemode,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const td = data.transaction_details;
        if (td?.quote_expiration) {
          const exp = new Date(td.quote_expiration).getTime();
          const now = Date.now();
          setQuoteSecondsLeft(Math.max(1, Math.floor((exp - now) / 1000)));
        }
        // Update session with refreshed data from the quote response
        setSession((prev) =>
          prev
            ? {
                ...prev,
                source_total_amount:
                  data.source_total_amount ?? prev.source_total_amount,
                transaction_details: {
                  ...prev.transaction_details,
                  destination_amount:
                    td?.destination_amount ??
                    prev.transaction_details.destination_amount,
                  quote_expiration:
                    td?.quote_expiration ??
                    prev.transaction_details.quote_expiration,
                  fees: td?.fees ?? prev.transaction_details.fees,
                },
              }
            : prev,
        );
      }
    } catch (e: any) {
      props.setError(`Quote refresh failed: ${e?.message || e}`);
    }
    setRefreshingQuote(false);
  }, [session, props.linkAuthIntentId, props.livemode, props.setError]);

  // Start countdown when entering confirm with a session
  useEffect(() => {
    if (buySubStep !== "confirm" || !session) {
      setQuoteSecondsLeft(null);
      return;
    }
    const exp = session.transaction_details.quote_expiration;
    if (!exp) return;
    const expMs = new Date(exp).getTime();
    const now = Date.now();
    setQuoteSecondsLeft(Math.max(0, Math.floor((expMs - now) / 1000)));
  }, [buySubStep, session]);

  // Tick countdown every second
  useEffect(() => {
    if (quoteSecondsLeft === null || buySubStep !== "confirm") return;
    if (quoteSecondsLeft <= 0) {
      refreshQuote();
      return;
    }
    const t = setTimeout(
      () => setQuoteSecondsLeft((s) => (s !== null ? s - 1 : null)),
      1000,
    );
    return () => clearTimeout(t);
  }, [quoteSecondsLeft, buySubStep, refreshQuote]);

  // ─── Navigation ───────────────────────────────────────

  const goTo = useCallback((s: number) => {
    setFade(false);
    setTimeout(() => {
      setStep(s);
      setFade(true);
    }, 150);
  }, []);

  // Auto-advance past login once authenticated and modal is dismissed
  const prevCustomerId = useRef(props.cryptoCustomerId);
  useEffect(() => {
    if (
      prevCustomerId.current !== props.cryptoCustomerId &&
      props.cryptoCustomerId &&
      step === 0 &&
      !props.authenticating
    ) {
      prevCustomerId.current = props.cryptoCustomerId;
      goTo(1);
    }
  }, [props.cryptoCustomerId, props.authenticating, step, goTo]);

  // ─── Wallet fetch ─────────────────────────────────────

  const fetchWallets = useCallback(async () => {
    if (!props.cryptoCustomerId || !props.linkAuthIntentId) return;
    setLoadingWallets(true);
    try {
      const r = await fetch(
        `/api/crypto/customers/${props.cryptoCustomerId}/wallets?lai=${encodeURIComponent(props.linkAuthIntentId)}&livemode=${props.livemode}`,
      );
      if (r.ok) {
        const d = await r.json();
        setWallets(d.data ?? []);
      } else {
        const d = await r.json().catch(() => null);
        props.setError(`Failed to load wallets: ${d?.error ?? `HTTP ${r.status}`}`);
      }
    } catch (e: any) {
      props.setError(`Failed to load wallets: ${e?.message || e}`);
    }
    setLoadingWallets(false);
  }, [props.cryptoCustomerId, props.linkAuthIntentId, props.livemode, props.setError]);

  useEffect(() => {
    if (step === 2) fetchWallets();
  }, [step, fetchWallets]);

  // ─── Poll checkout ────────────────────────────────────

  const pollSession = useCallback(
    async (sessionId: string) => {
      const terminals = new Set([
        "fulfillment_complete",
        "fulfillment_error",
        "expired",
        "canceled",
      ]);
      while (true) {
        try {
          const r = await fetch(
            `/api/crypto/onramp_sessions/${sessionId}?livemode=${props.livemode}`,
          );
          const d = await r.json();
          if (terminals.has(d.status)) {
            setCheckoutResult(d);
            setBuySubStep("result");
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
    [props.livemode],
  );

  // ─── Derived ──────────────────────────────────────────

  const ssnDigits = ssn.replace(/\D/g, "");
  const parsedDob = dob
    ? { year: dob.year(), month: dob.month() + 1, day: dob.date() }
    : undefined;
  const amount = selectedAmt ?? customAmt;
  const isAmountValid = amount && parseFloat(amount) > 0;
  const canNext = (s: number) => {
    switch (s) {
      case 0:
        return !!props.cryptoCustomerId;
      case 1:
        return ["L0", "L1", "L2"].includes(props.kycLevel);
      case 2:
        return !!props.selectedWallet;
      case 3:
        return !!props.cryptoPaymentToken;
      default:
        return false;
    }
  };

  // ─── Render step content ──────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ═══════════════════════════════════════════════════
      // STEP 0: LOGIN
      // ═══════════════════════════════════════════════════
      case 0:
        return (
          <Stack spacing={3}>
            <Box>
              <Typography
                sx={{
                  color: colors.textPrimary,
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  mb: 0.5,
                }}
              >
                Get Started
              </Typography>
              <Typography
                sx={{ color: colors.textSecondary, fontSize: "0.9rem" }}
              >
                Enter your email to log in or create an account
              </Typography>
            </Box>

            <TextField
              label="Email address"
              value={props.email}
              onChange={(e) => props.setEmail(e.target.value)}
              placeholder="user@example.com"
              size="small"
              fullWidth
              sx={inputSx}
              onKeyDown={(e) => {
                if (e.key === "Enter" && props.email)
                  props.onCheckAccount(props.email);
              }}
            />

            {props.accountStatus !== "not_found" && (
              <Button
                variant="contained"
                onClick={() => props.onCheckAccount(props.email)}
                disabled={props.loading || !props.email}
                fullWidth
                sx={accentButtonSx}
              >
                {props.loading ? (
                  <CircularProgress size={20} sx={{ color: "#fff" }} />
                ) : (
                  "Login"
                )}
              </Button>
            )}

            {/* Registration form */}
            {props.accountStatus === "not_found" && (
              <Stack spacing={2} sx={{ pt: 1 }}>
                <Divider sx={{ borderColor: colors.borderSubtle }} />
                <Typography
                  sx={{ color: colors.textSecondary, fontSize: "0.85rem" }}
                >
                  No account found. Create one below.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <TextField
                    label="Phone"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+14155551234"
                    size="small"
                    fullWidth
                    sx={inputSx}
                  />
                  <TextField
                    label="Country"
                    value={regCountry}
                    onChange={(e) => setRegCountry(e.target.value)}
                    size="small"
                    sx={{ ...inputSx, maxWidth: 90 }}
                  />
                </Stack>
                <Button
                  variant="contained"
                  onClick={() =>
                    props.onRegister(props.email, phoneNumber, regCountry)
                  }
                  disabled={props.loading || !props.email || !phoneNumber}
                  fullWidth
                  sx={accentButtonSx}
                >
                  {props.loading ? (
                    <CircularProgress size={20} sx={{ color: "#fff" }} />
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </Stack>
            )}
          </Stack>
        );

      // ═══════════════════════════════════════════════════
      // STEP 1: KYC
      // ═══════════════════════════════════════════════════
      case 1: {
        // For returning users with a known region, skip the picker
        if (props.kycRegion === "eu") {
          return (
            <EuKycStep
              darkMode={props.darkMode}
              onramp={props.onramp}
              kycLevel={props.kycLevel}
              verifications={props.verifications}
              providedFields={props.providedFields}
              polling={props.polling}
              loading={props.loading}
              onComplete={() => goTo(2)}
              onRefreshKycLevel={props.onRefreshKycLevel}
              setError={props.setError}
              log={props.log}
            />
          );
        }

        // Country selector + form routing for new users (region unknown)
        if (!props.kycRegion) {
          const countrySelector = (
            <TextField
              select
              label="Country of residence"
              value={kycCountry}
              onChange={(e) => setKycCountry(e.target.value)}
              size="small"
              fullWidth
              sx={inputSx}
            >
              <MenuItem value="US">United States (US)</MenuItem>
              <MenuItem disabled sx={{ fontSize: "0.75rem", opacity: 0.5 }}>── EU / EEA ──</MenuItem>
              {Array.from(EU_COUNTRIES).sort().map((code) => (
                <MenuItem key={code} value={code}>
                  {EU_COUNTRY_NAMES[code] ?? code} ({code})
                </MenuItem>
              ))}
            </TextField>
          );

          if (isEuCountry(kycCountry)) {
            return (
              <Stack spacing={3}>
                {countrySelector}
                <Divider sx={{ borderColor: colors.borderSubtle }} />
                <EuKycStep
                  darkMode={props.darkMode}
                  onramp={props.onramp}
                  kycLevel={props.kycLevel}
                  verifications={props.verifications}
                  providedFields={props.providedFields}
                  polling={props.polling}
                  loading={props.loading}
                  country={kycCountry}
                  onComplete={() => goTo(2)}
                  onRefreshKycLevel={props.onRefreshKycLevel}
                  setError={props.setError}
                  log={props.log}
                />
              </Stack>
            );
          }

          if (!kycCountry) {
            return (
              <Stack spacing={3}>
                <Box>
                  <Typography
                    sx={{ color: colors.textPrimary, fontSize: "1.5rem", fontWeight: 700, mb: 0.5 }}
                  >
                    Verify Your Identity
                  </Typography>
                  <Typography sx={{ color: colors.textSecondary, fontSize: "0.9rem" }}>
                    Select your country of residence to continue
                  </Typography>
                </Box>
                {countrySelector}
              </Stack>
            );
          }

          // US selected — fall through to US form below, but show country selector
        }

        const chip = KYC_CHIP[props.kycLevel];
        const showFull =
          props.kycLevel === "REQUIRES_KYC" || props.kycLevel === "REJECTED";
        const showStepUp = props.kycLevel === "L0";
        const showVerify = props.kycLevel === "L1";

        return (
          <Stack spacing={3}>
            {!props.kycRegion && (
              <TextField
                select
                label="Country of residence"
                value={kycCountry}
                onChange={(e) => setKycCountry(e.target.value)}
                size="small"
                fullWidth
                sx={inputSx}
              >
                <MenuItem value="US">United States (US)</MenuItem>
                <MenuItem disabled sx={{ fontSize: "0.75rem", opacity: 0.5 }}>── EU / EEA ──</MenuItem>
                {Array.from(EU_COUNTRIES).sort().map((code) => (
                  <MenuItem key={code} value={code}>
                    {EU_COUNTRY_NAMES[code] ?? code} ({code})
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Box>
              <Typography
                sx={{
                  color: colors.textPrimary,
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  mb: 0.5,
                }}
              >
                Verify Your Identity
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Chip
                  label={chip.label}
                  size="small"
                  sx={{
                    bgcolor: `${chip.color}22`,
                    color: chip.color,
                    fontWeight: 600,
                    fontSize: "0.7rem",
                    border: `1px solid ${chip.color}44`,
                  }}
                />
                {props.polling && (
                  <CircularProgress size={14} sx={{ color: colors.accent }} />
                )}
              </Stack>
            </Box>

            {props.polling && (
              <Stack alignItems="center" spacing={1} sx={{ py: 2 }}>
                <CircularProgress size={28} sx={{ color: colors.accent }} />
                <Typography
                  sx={{ color: colors.textSecondary, fontSize: "0.85rem" }}
                >
                  Verifying your information...
                </Typography>
              </Stack>
            )}

            {showFull && !props.polling && (
              <>
                <Typography
                  sx={{
                    color: colors.textMuted,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Personal Info
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="First name"
                    value={givenName}
                    onChange={(e) => setGivenName(e.target.value)}
                    placeholder="Jane"
                    size="small"
                    fullWidth
                    sx={inputSx}
                  />
                  <TextField
                    label="Last name"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    placeholder="Doe"
                    size="small"
                    fullWidth
                    sx={inputSx}
                  />
                </Stack>
                <Typography
                  sx={{
                    color: colors.textMuted,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    pt: 1,
                  }}
                >
                  Address
                </Typography>
                <TextField
                  label="Address line 1"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  placeholder="address_full_match"
                  size="small"
                  fullWidth
                  sx={inputSx}
                />
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Seattle"
                    size="small"
                    fullWidth
                    sx={inputSx}
                  />
                  <TextField
                    label="State"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="WA"
                    size="small"
                    sx={{ ...inputSx, maxWidth: 100 }}
                  />
                </Stack>
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="Postal code"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="12345"
                    size="small"
                    fullWidth
                    sx={inputSx}
                  />
                  <TextField
                    label="Country"
                    value={kycCountry}
                    onChange={(e) => setKycCountry(e.target.value)}
                    placeholder="US"
                    size="small"
                    sx={{ ...inputSx, maxWidth: 100 }}
                  />
                </Stack>
              </>
            )}

            {!props.polling && (showStepUp || showFull) && (
              <>
                <Typography
                  sx={{
                    color: colors.textMuted,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    pt: 1,
                  }}
                >
                  Identity
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <DatePicker
                      label="Date of birth"
                      value={dob}
                      onChange={(v) => setDOB(v)}
                      slotProps={{
                        textField: {
                          size: "small",
                          fullWidth: true,
                          sx: inputSx,
                        },
                      }}
                    />
                  </LocalizationProvider>
                  <TextField
                    label="SSN"
                    value={formatSSN(ssn)}
                    onChange={(e) =>
                      setSSN(e.target.value.replace(/\D/g, "").slice(0, 9))
                    }
                    placeholder="000-00-0000"
                    size="small"
                    fullWidth
                    sx={inputSx}
                  />
                </Stack>
                <Button
                  variant="contained"
                  onClick={() => {
                    if (showStepUp) {
                      props.onSubmitKycInfo({
                        ...(parsedDob && { date_of_birth: parsedDob }),
                        ...(ssnDigits && {
                          id_number: {
                            type: "us_ssn" as const,
                            value: ssnDigits,
                          },
                        }),
                      });
                    } else {
                      props.onSubmitKycInfo({
                        given_name: givenName,
                        surname,
                        address: {
                          line1,
                          city,
                          state,
                          postal_code: postalCode,
                          country: kycCountry,
                        },
                        ...(parsedDob && { date_of_birth: parsedDob }),
                        ...(ssnDigits && {
                          id_number: {
                            type: "us_ssn" as const,
                            value: ssnDigits,
                          },
                        }),
                      });
                    }
                  }}
                  disabled={
                    props.loading ||
                    (showStepUp
                      ? !parsedDob || ssnDigits.length !== 9
                      : !givenName ||
                        !surname ||
                        !line1 ||
                        !city ||
                        !state ||
                        !postalCode ||
                        !kycCountry)
                  }
                  fullWidth
                  sx={accentButtonSx}
                >
                  {props.loading ? (
                    <CircularProgress size={20} sx={{ color: "#fff" }} />
                  ) : (
                    "Submit"
                  )}
                </Button>
              </>
            )}

            {showVerify && !props.polling && (
              <Button
                variant="contained"
                onClick={props.onVerifyDocuments}
                disabled={props.loading}
                fullWidth
                sx={{
                  ...accentButtonSx,
                  bgcolor: colors.cyan,
                  "&:hover": { bgcolor: "#00b8d4" },
                }}
              >
                Verify Documents
              </Button>
            )}
          </Stack>
        );
      }

      // ═══════════════════════════════════════════════════
      // STEP 2: WALLETS
      // ═══════════════════════════════════════════════════
      case 2:
        return (
          <Stack spacing={3}>
            <Box>
              <Typography
                sx={{
                  color: colors.textPrimary,
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  mb: 0.5,
                }}
              >
                Select Wallet
              </Typography>
              <Typography
                sx={{ color: colors.textSecondary, fontSize: "0.9rem" }}
              >
                Choose where to receive your crypto
              </Typography>
            </Box>

            {loadingWallets && wallets.length === 0 ? (
              <Stack alignItems="center" py={2}>
                <CircularProgress size={24} sx={{ color: colors.accent }} />
              </Stack>
            ) : wallets.length === 0 ? (
              <Typography sx={{ color: colors.textMuted, fontSize: "0.85rem" }}>
                No wallets yet. Add one below.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {wallets.map((w) => {
                  const sel = props.selectedWallet === w.wallet_address;
                  const supported = getNetworks(props.livemode).includes(w.network as CryptoNetwork);
                  return (
                    <Box
                      key={w.id}
                      onClick={() => supported && props.onSelectWallet(sel ? null : w)}
                      sx={{
                        p: 1.5,
                        borderRadius: 1.5,
                        cursor: supported ? "pointer" : "not-allowed",
                        opacity: supported ? 1 : 0.45,
                        border: "1px solid",
                        borderColor: sel
                          ? colors.borderGlow
                          : colors.borderSubtle,
                        bgcolor: sel ? `${colors.accent}11` : "transparent",
                        boxShadow: sel ? colors.glowShadow : "none",
                        transition: "all 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        "&:hover": supported ? {
                          bgcolor: sel
                            ? `${colors.accent}11`
                            : colors.cardBgAlt,
                        } : {},
                      }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography
                            sx={{
                              color: colors.textPrimary,
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              textTransform: "capitalize",
                            }}
                          >
                            {w.network}
                          </Typography>
                          {!supported && (
                            <Typography
                              sx={{
                                color: colors.textMuted,
                                fontSize: "0.65rem",
                              }}
                            >
                              (not supported in {props.livemode ? "live" : "test"} mode)
                            </Typography>
                          )}
                        </Stack>
                        <Typography
                          sx={{
                            color: colors.textSecondary,
                            fontSize: "0.75rem",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {w.wallet_address}
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        onClick={async (e) => {
                          e.stopPropagation();
                          setDeletingWalletId(w.id);
                          try {
                            await props.onDeleteWallet(w.id);
                            if (props.selectedWallet === w.wallet_address) {
                              props.onSelectWallet(null);
                            }
                            await fetchWallets();
                          } catch {}
                          setDeletingWalletId(null);
                        }}
                        disabled={deletingWalletId === w.id}
                        sx={{
                          minWidth: 32,
                          ml: 1,
                          color: colors.textMuted,
                          fontSize: "0.7rem",
                          "&:hover": { color: colors.error },
                        }}
                      >
                        {deletingWalletId === w.id ? (
                          <CircularProgress
                            size={14}
                            sx={{ color: colors.textMuted }}
                          />
                        ) : (
                          "Delete"
                        )}
                      </Button>
                    </Box>
                  );
                })}
              </Stack>
            )}

            <Divider sx={{ borderColor: colors.borderSubtle }} />

            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField
                label="Wallet address"
                value={newAddr}
                onChange={(e) => setNewAddr(e.target.value)}
                size="small"
                sx={{ ...inputSx, flex: 1 }}
              />
              <TextField
                select
                label="Network"
                value={newNet}
                onChange={(e) => setNewNet(e.target.value as CryptoNetwork)}
                size="small"
                sx={{ ...inputSx, minWidth: 120 }}
              >
                {getNetworks(props.livemode).map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                onClick={async () => {
                  setAdding(true);
                  try {
                    await props.onRegisterWallet(newAddr, newNet);
                    setNewAddr("");
                    await fetchWallets();
                  } catch {}
                  setAdding(false);
                }}
                disabled={adding || !newAddr}
                sx={{ ...accentButtonSx, minWidth: 60, whiteSpace: "nowrap" }}
              >
                Add
              </Button>
            </Stack>
          </Stack>
        );

      // ═══════════════════════════════════════════════════
      // STEP 3: PAYMENT
      // ═══════════════════════════════════════════════════
      case 3:
        return (
          <Stack spacing={3}>
            <Box>
              <Typography
                sx={{
                  color: colors.textPrimary,
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  mb: 0.5,
                }}
              >
                Payment Method
              </Typography>
              <Typography
                sx={{ color: colors.textSecondary, fontSize: "0.9rem" }}
              >
                How would you like to pay?
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              {[
                { label: "Card", types: ["card"] },
                { label: "Bank", types: ["us_bank_account"] },
                { label: "All", types: ["card", "us_bank_account"] },
              ].map(({ label, types }) => (
                <Button
                  key={label}
                  variant="contained"
                  onClick={async () => {
                    if (!paymentRef.current) return;
                    paymentRef.current.innerHTML = "";
                    const el = await props.onCollectPaymentMethod(types, {
                      applePay: "auto",
                      googlePay: "auto",
                    });
                    paymentRef.current.appendChild(el);
                    setPayMounted(true);
                  }}
                  disabled={props.loading}
                  fullWidth
                  sx={accentButtonSx}
                >
                  {label}
                </Button>
              ))}
            </Stack>
            <div
              ref={paymentRef}
              style={{
                width: "100%",
                borderRadius: 6,
                border: payMounted
                  ? "none"
                  : `1px dashed ${colors.borderSubtle}`,
              }}
            />
            {!payMounted && (
              <Typography sx={{ color: colors.textMuted, fontSize: "0.8rem" }}>
                Select a payment type above
              </Typography>
            )}
          </Stack>
        );

      // ═══════════════════════════════════════════════════
      // STEP 4: BUY
      // ═══════════════════════════════════════════════════
      case 4: {
        // ── Result ──
        if (buySubStep === "result" && checkoutResult) {
          const network = session?.transaction_details.destination_network;
          const env = session?.livemode ? "live" : "test";
          const txId = checkoutResult.transaction_id;
          const explorerUrl =
            txId && network && EXPLORER_URLS[env]?.[network]
              ? EXPLORER_URLS[env][network](txId)
              : null;
          const ok = checkoutResult.status === "fulfillment_complete";

          return (
            <Stack spacing={3} alignItems="center" sx={{ py: 2 }}>
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  bgcolor: ok ? `${colors.success}22` : `${colors.error}22`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "2rem",
                }}
              >
                {ok ? "✓" : "✗"}
              </Box>
              <Typography
                sx={{
                  color: ok ? colors.success : colors.error,
                  fontSize: "1.3rem",
                  fontWeight: 700,
                }}
              >
                {ok ? "Transaction Complete" : "Transaction Failed"}
              </Typography>
              <Typography
                sx={{ color: colors.textSecondary, fontSize: "0.85rem" }}
              >
                {checkoutResult.status}
              </Typography>
              {txId && (
                <Typography
                  sx={{
                    color: colors.textPrimary,
                    fontSize: "0.8rem",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {txId}
                </Typography>
              )}
              {explorerUrl && (
                <Link
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: colors.cyan, fontSize: "0.85rem" }}
                >
                  View on explorer
                </Link>
              )}
              <Button
                variant="contained"
                onClick={() => {
                  setSession(null);
                  setCheckoutResult(null);
                  setBuySubStep("amount");
                }}
                fullWidth
                sx={accentButtonSx}
              >
                Buy More
              </Button>
            </Stack>
          );
        }

        // ── Polling ──
        if (buySubStep === "polling") {
          return (
            <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
              <CircularProgress size={40} sx={{ color: colors.accent }} />
              <Typography
                sx={{
                  color: colors.textPrimary,
                  fontSize: "1.1rem",
                  fontWeight: 600,
                }}
              >
                Processing...
              </Typography>
              <Typography
                sx={{ color: colors.textSecondary, fontSize: "0.85rem" }}
              >
                Waiting for transaction confirmation
              </Typography>
            </Stack>
          );
        }

        // ── Confirm ──
        if (buySubStep === "confirm" && session) {
          const td = session.transaction_details;
          const quoteExpired =
            quoteSecondsLeft !== null && quoteSecondsLeft <= 0;
          const formatCountdown = (s: number) =>
            `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
          return (
            <Stack spacing={3}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography
                  sx={{
                    color: colors.textPrimary,
                    fontSize: "1.5rem",
                    fontWeight: 700,
                  }}
                >
                  Confirm Transaction
                </Typography>
                {quoteSecondsLeft !== null && (
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    {refreshingQuote && (
                      <CircularProgress
                        size={12}
                        sx={{ color: colors.accent }}
                      />
                    )}
                    <Typography
                      sx={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: quoteExpired
                          ? colors.error
                          : quoteSecondsLeft < 30
                            ? colors.warning
                            : colors.textMuted,
                      }}
                    >
                      {refreshingQuote
                        ? "Refreshing..."
                        : quoteExpired
                          ? "Refreshing..."
                          : `Quote expires ${formatCountdown(quoteSecondsLeft)}`}
                    </Typography>
                  </Stack>
                )}
              </Stack>
              <Typography sx={{ color: colors.textMuted, fontSize: "0.7rem" }}>
                {session.id}
              </Typography>
              <Stack spacing={1.5}>
                <Row
                  label="You pay"
                  value={`$${session.source_total_amount}`}
                />
                <Row
                  label="You receive"
                  value={`${td.destination_amount} ${td.destination_currency.toUpperCase()}`}
                  valueColor={colors.success}
                />
                <Row label="Network" value={td.destination_network} />
                <Row label="Wallet" value={td.wallet_address} />
                <Divider sx={{ borderColor: colors.borderSubtle }} />
                <Row
                  label="Network fee"
                  value={`$${td.fees.network_fee_amount}`}
                />
                <Row
                  label="Transaction fee"
                  value={`$${td.fees.transaction_fee_amount}`}
                />
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <Button
                  variant="outlined"
                  onClick={() => setBuySubStep("amount")}
                  fullWidth
                  sx={{
                    py: 1.2,
                    color: colors.textSecondary,
                    borderColor: colors.borderSubtle,
                    "&:hover": {
                      borderColor: colors.textSecondary,
                      bgcolor: "transparent",
                    },
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="contained"
                  onClick={async () => {
                    setBuySubStep("polling");
                    try {
                      await props.onCheckout(session.id);
                      await pollSession(session.id);
                    } catch {
                      setBuySubStep("confirm");
                    }
                  }}
                  disabled={props.loading}
                  fullWidth
                  sx={{ ...accentButtonSx, fontSize: "1rem" }}
                >
                  Checkout
                </Button>
              </Stack>
            </Stack>
          );
        }

        // ── Amount selection (default) ──
        return (
          <Stack spacing={3}>
            <Box>
              <Typography
                sx={{
                  color: colors.textPrimary,
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  mb: 0.5,
                }}
              >
                Add Funds
              </Typography>
              <Typography
                sx={{ color: colors.textSecondary, fontSize: "0.9rem" }}
              >
                Choose an amount to purchase
              </Typography>
            </Box>

            <TextField
              select
              label="Currency"
              value={destCurrency}
              onChange={(e) => setDestCurrency(e.target.value)}
              size="small"
              fullWidth
              sx={inputSx}
            >
              <MenuItem value="usdc">USDC</MenuItem>
            </TextField>

            <ToggleButtonGroup
              value={selectedAmt}
              exclusive
              onChange={(_, v) => {
                setSelectedAmt(v);
                if (v) setCustomAmt("");
              }}
              fullWidth
              sx={{
                "& .MuiToggleButton-root": {
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "1rem",
                  py: 1.5,
                  color: colors.textSecondary,
                  borderColor: colors.borderSubtle,
                  "&.Mui-selected": {
                    bgcolor: colors.accent,
                    color: "#fff",
                    borderColor: colors.accent,
                    "&:hover": { bgcolor: colors.accentLight },
                  },
                  "&:hover": { bgcolor: colors.cardBgAlt },
                },
              }}
            >
              {PRESET_AMOUNTS.map((a) => (
                <ToggleButton key={a} value={a}>
                  ${a}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <TextField
              placeholder="Custom amount"
              value={customAmt}
              onChange={(e) => {
                setCustomAmt(e.target.value.replace(/[^0-9.]/g, ""));
                setSelectedAmt(null);
              }}
              size="small"
              fullWidth
              sx={inputSx}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Typography sx={{ color: colors.textMuted }}>$</Typography>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              variant="contained"
              onClick={async () => {
                if (!isAmountValid) return;
                const s = await props.onAddFunds(amount, destCurrency);
                if (s) {
                  setSession(s);
                  setBuySubStep("confirm");
                }
              }}
              disabled={props.loading || !isAmountValid}
              fullWidth
              sx={{ ...accentButtonSx, fontSize: "1rem" }}
            >
              {props.loading ? (
                <CircularProgress size={22} sx={{ color: "#fff" }} />
              ) : (
                "Review"
              )}
            </Button>
          </Stack>
        );
      }

      default:
        return null;
    }
  };

  // ─── Main render ──────────────────────────────────────

  return (
    <Stack spacing={3} alignItems="center">
      {/* Progress bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          width: "100%",
          maxWidth: 480,
        }}
      >
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.75}
              sx={{
                cursor: i < step ? "pointer" : "default",
                opacity: i <= step ? 1 : 0.35,
              }}
              onClick={() => {
                if (i < step) goTo(i);
              }}
            >
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  bgcolor:
                    i < step
                      ? colors.success
                      : i === step
                        ? colors.accent
                        : "transparent",
                  color: i <= step ? "#fff" : colors.textMuted,
                  border: i > step ? `1px solid ${colors.textMuted}` : "none",
                  transition: "all 0.2s ease",
                }}
              >
                {i < step ? "✓" : i + 1}
              </Box>
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  fontWeight: i === step ? 600 : 400,
                  color: i === step ? colors.textPrimary : colors.textSecondary,
                  whiteSpace: "nowrap",
                  display: { xs: "none", sm: "block" },
                }}
              >
                {label}
              </Typography>
            </Stack>
            {i < STEPS.length - 1 && (
              <Box
                sx={{
                  flex: 1,
                  height: 1,
                  mx: 1,
                  bgcolor: i < step ? colors.success : colors.borderSubtle,
                  transition: "background-color 0.2s ease",
                }}
              />
            )}
          </React.Fragment>
        ))}
      </Box>

      {/* Step card */}
      <Box
        sx={{
          ...glowCardSx,
          width: "100%",
          maxWidth: 480,
          opacity: fade ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        {renderStep()}
      </Box>

      {/* Navigation (only for manual steps, not Buy's internal nav) */}
      {step < 4 && (
        <Stack
          direction="row"
          spacing={2}
          sx={{ width: "100%", maxWidth: 480 }}
        >
          <Button
            variant="outlined"
            onClick={() => goTo(step - 1)}
            disabled={step === 0}
            sx={{
              flex: 1,
              color: colors.textSecondary,
              borderColor: colors.borderSubtle,
              "&:hover": {
                borderColor: colors.textSecondary,
                bgcolor: "transparent",
              },
              "&.Mui-disabled": {
                color: colors.textMuted,
                borderColor: colors.borderSubtle,
              },
            }}
          >
            Back
          </Button>
          <Button
            variant="contained"
            onClick={() => goTo(step + 1)}
            disabled={!canNext(step)}
            sx={{ flex: 1, ...accentButtonSx }}
          >
            Next
          </Button>
        </Stack>
      )}

      <Snackbar
        open={!!props.error}
        autoHideDuration={30000}
        onClose={() => props.setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="error"
          onClose={() => props.setError(null)}
          sx={{ width: "100%", maxWidth: 480 }}
        >
          {props.error}
        </Alert>
      </Snackbar>
    </Stack>
  );
};
