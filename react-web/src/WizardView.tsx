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
  LinearProgress,
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
import { LOCAL_LIMITS } from "./kycLimits";
import { EXPLORER_URLS, getNetworks, isEuCountry, EU_COUNTRIES } from "./shared";
import { EU_COUNTRY_NAMES } from "./euIdentifiers";
import type { AccountStatus, KycLevel, KycRegion, Wallet, OnrampSession } from "./types";
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
  currentKycTier: "L0" | "L1" | "L2" | null;
  kycTiers: Array<{ tier: string; verification_status: string }>;
  limitSource: "api" | "local";
  log: (event: string, detail?: string) => void;
};

// ─── Constants ─────────────────────────────────────────────

/**
 * Onramp wizard — screen flow
 *
 * Normal path (first-time user):
 *
 *   ┌─────────┐    ┌─────────┐    ┌──────────┐    ┌─────────────┐    ┌─────────┐
 *   │ 0 Login │───▶│  1 KYC  │───▶│ 2 Wallet │───▶│ 3 Payment   │───▶│  4 Buy  │
 *   └─────────┘    └─────────┘    └──────────┘    └─────────────┘    └─────────┘
 *
 * KYC step-up path (amount exceeds current tier limit):
 *
 *   ┌─────────┐    amount > limit (L0 or L1)           tier verified
 *   │  4 Buy  │──────────────────────────────▶ ┌─────────────────────┐
 *   │         │◀──────────────────────────────  │  1 KYC (step-up)    │
 *   └─────────┘    goTo(4) auto on tier advance └─────────────────────┘
 *                                                  L0 → SSN + DOB form
 *                                                  L1 → Verify Documents
 *
 * KYC screen content (step 1) by kycLevel:
 *   REQUIRES_KYC            → full L0 form (name, address, optional SSN/DOB)
 *   REJECTED + L1 verified  → document verification button (retry L2 docs)
 *   REJECTED + L1 failed    → full L0 form (name, address, optional SSN/DOB)
 *   L0                      → L1 step-up form (SSN + DOB required)
 *   L1                      → L2 document verification button
 *   L2                      → already fully verified, Next enabled
 *
 * Transaction limits (step 4):
 *   Settings "Fetch Limit API" ON  → live limits from GET /v1/crypto/onramp_transaction_limits
 *   Settings "Fetch Limit API" OFF → local config (kycLimits.ts): L0 $300 / L1 $800 / L2 $1500
 *
 * To wire up a new step-up trigger from any screen:
 *   1. Detect the condition (e.g. limit breach, required_verifications error).
 *   2. Set stepUpFromTier to the user's current tier ("L0" or "L1").
 *   3. Call goTo(1) — the KYC screen renders the correct form automatically.
 *   4. The step-up completion useEffect watches kycLevel + polling and calls
 *      goTo(4) once the new tier is verified, returning the user to Buy.
 */
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

  // Destructure the props used inside hooks so the exhaustive-deps rule is
  // satisfied without adding the whole `props` object to dependency arrays.
  const {
    linkAuthIntentId,
    livemode,
    setError,
    log,
    cryptoCustomerId,
    selectedWallet,
    selectedWalletNetwork,
    kycLevel,
    currentKycTier,
    kycTiers,
    polling,
    limitSource,
  } = props;

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
  const [hasMoreWallets, setHasMoreWallets] = useState(false);
  const [loadingMoreWallets, setLoadingMoreWallets] = useState(false);
  const [newAddr, setNewAddr] = useState("");
  const [newNet, setNewNet] = useState<CryptoNetwork>("solana");
  const [adding, setAdding] = useState(false);
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);

  // Step 3: Payment
  const paymentRef = useRef<HTMLDivElement>(null);
  const [payMounted, setPayMounted] = useState(false);

  // Step 3: track which payment method types the user selected
  const [collectedPaymentTypes, setCollectedPaymentTypes] = useState<string[]>([]);

  // Tracks which tier the user was at when they triggered the step-up from the Buy
  // screen. Non-null while the user is in the step-up sub-flow (step 1 in boost mode).
  // Cleared automatically once the target tier is verified and goTo(4) fires.
  //
  // State machine:
  //   null           — normal flow, no step-up in progress
  //   "L0"           — user came from Buy at L0; waiting for L1 (or L2) verification
  //   "L1"           — user came from Buy at L1; waiting for L2 verification
  const [stepUpFromTier, setStepUpFromTier] = useState<"L0" | "L1" | null>(null);

  // Set to true when the user actively submits KYC data, so we can auto-advance
  // to the next step once polling resolves (distinct from post-auth polling).
  const kycJustSubmitted = useRef(false);

  // Step 4: Buy — transaction limits (fetched in parallel when the step loads)
  const [transactionLimits, setTransactionLimits] = useState<{
    object: string;
    crypto_customer_id?: string;
    livemode: boolean;
    limits: {
      'usd.fiat'?: {
        card?: Array<{ limit: number; settlement_speed: string }>;
        us_bank_account?: Array<{ limit: number; settlement_speed: string }>;
      };
    };
  } | null>(null);
  const [loadingLimits, setLoadingLimits] = useState(false);

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
    if (!session || !linkAuthIntentId) return;
    setRefreshingQuote(true);
    try {
      const res = await fetch(
        `/api/crypto/onramp_sessions/${session.id}/quote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lai: linkAuthIntentId,
            livemode,
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
      setError(`Quote refresh failed: ${e?.message || e}`);
    }
    setRefreshingQuote(false);
  }, [session, linkAuthIntentId, livemode, setError]);

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

  // Step-up completion detector.
  //
  // While a step-up is in progress (stepUpFromTier !== null), ExampleApp is
  // polling kycLevel every second (see refreshKycLevel). This effect watches
  // for the tier to advance past the starting point:
  //
  //   L0 step-up → done when kycLevel reaches L1 or L2
  //   L1 step-up → done when kycLevel reaches L2
  //
  // We check !polling so we only act once the poll loop has settled on a final
  // value — not while an in-flight request is still running.
  //
  // On completion: clear stepUpFromTier and jump straight back to Buy (step 4)
  // so the user can immediately retry their purchase at the higher limit.
  useEffect(() => {
    if (!stepUpFromTier || polling) return;
    if (stepUpFromTier === "L0" && (kycLevel === "L1" || kycLevel === "L2")) {
      setStepUpFromTier(null);
      goTo(4);
    } else if (stepUpFromTier === "L1" && kycLevel === "L2") {
      setStepUpFromTier(null);
      goTo(4);
    }
  }, [stepUpFromTier, polling, kycLevel, goTo]);

  // After the user submits KYC data and polling resolves to a verified tier,
  // auto-advance to the Wallet step (normal flow only — step-up uses goTo(4) above).
  useEffect(() => {
    if (!kycJustSubmitted.current || polling || step !== 1) return;
    if (kycLevel === "L0" || kycLevel === "L1" || kycLevel === "L2") {
      kycJustSubmitted.current = false;
      if (!stepUpFromTier) goTo(2);
    }
  }, [polling, kycLevel, step, stepUpFromTier, goTo]);

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

  const fetchWallets = useCallback(async (startingAfter?: string) => {
    if (!cryptoCustomerId || !linkAuthIntentId) return;
    if (startingAfter) {
      setLoadingMoreWallets(true);
    } else {
      setLoadingWallets(true);
    }
    try {
      const qs = new URLSearchParams({
        lai: encodeURIComponent(linkAuthIntentId),
        livemode: String(livemode),
        limit: "20",
      });
      if (startingAfter) qs.append("starting_after", startingAfter);

      const r = await fetch(
        `/api/crypto/customers/${cryptoCustomerId}/wallets?${qs.toString()}`,
      );
      if (r.ok) {
        const d = await r.json();
        const newWallets: Wallet[] = d.data ?? [];
        setWallets((prev) => startingAfter ? [...prev, ...newWallets] : newWallets);
        setHasMoreWallets(d.has_more ?? false);
      } else {
        const d = await r.json().catch(() => null);
        setError(`Failed to load wallets: ${d?.error ?? `HTTP ${r.status}`}`);
      }
    } catch (e: any) {
      setError(`Failed to load wallets: ${e?.message || e}`);
    }
    setLoadingWallets(false);
    setLoadingMoreWallets(false);
  }, [cryptoCustomerId, linkAuthIntentId, livemode, setError]);

  useEffect(() => {
    if (step === 2) fetchWallets();
  }, [step, fetchWallets]);

  // Fetch transaction limits when entering the Buy step, in parallel with any
  // other loading the step does.
  useEffect(() => {
    if (step !== 4 || !linkAuthIntentId || limitSource === "local") return;
    setTransactionLimits(null);
    setLoadingLimits(true);
    const qs = new URLSearchParams({ lai: linkAuthIntentId, livemode: String(livemode) });
    if (selectedWallet) qs.append("wallet_address", selectedWallet);
    if (selectedWalletNetwork) qs.append("destination_network", selectedWalletNetwork);
    fetch(`/api/crypto/onramp_transaction_limits?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.limits) setTransactionLimits(data);
        else log("Transaction limits fetch returned unexpected shape", JSON.stringify(data));
      })
      .catch((e) => log("Transaction limits fetch failed", e?.message || String(e)))
      .finally(() => setLoadingLimits(false));
  }, [step, linkAuthIntentId, livemode, selectedWallet, selectedWalletNetwork, limitSource, log]);

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

  // Derive per-transaction limit in dollars based on selected payment method (API returns cents).
  const isBankOnly =
    collectedPaymentTypes.length === 1 && collectedPaymentTypes[0] === "us_bank_account";
  const usdFiat = transactionLimits?.limits?.["usd.fiat"];
  const rawLimits = isBankOnly
    ? (usdFiat?.us_bank_account ?? [])
    : (usdFiat?.card ?? []);
  const apiLimitDollars = rawLimits[0] ? rawLimits[0].limit / 100 : null;
  const localLimitDollars =
    currentKycTier ? LOCAL_LIMITS[currentKycTier].limit : null;
  const limitDollars =
    limitSource === "local" ? localLimitDollars : apiLimitDollars;
  const limitLabel = limitSource === "local"
    ? "Limit (local config)"
    : isBankOnly ? "Bank limit" : "Card limit";
  const exceedsLimit = limitDollars !== null && parseFloat(amount) > limitDollars;
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

        const chip = KYC_CHIP[props.polling ? "PENDING" : props.kycLevel] ?? KYC_CHIP.REQUIRES_KYC;

        // Inspect the L1 tier status to decide which sub-form to show when REJECTED.
        // l1Verified: L1 passed; only L2 (doc check) failed → retry docs, not re-enter data.
        const l1Verified = kycTiers.some(
          (t) => t.tier === "l1" && t.verification_status === "verified",
        );
        // l1NotAvailable: EU region users skip L0 and L1 entirely — both tiers are
        // not_available. When REJECTED, there is no L1 data to re-enter, so go straight
        // to the document verification button to retry L2.
        const l1NotAvailable = kycTiers.some(
          (t) => t.tier === "l1" && t.verification_status === "not_available",
        );

        // Full L0 form (name, address, optional SSN/DOB): new users, or REJECTED where L1
        // itself failed (l1 was rejected/not_started, not verified or not_available).
        const showFull =
          props.kycLevel === "REQUIRES_KYC" ||
          (props.kycLevel === "REJECTED" && !l1Verified && !l1NotAvailable);
        // L1 step-up form (SSN + DOB required to advance from L0 → L1).
        const showStepUp = props.kycLevel === "L0";
        // Document verification button: user is at L1, or REJECTED but L1 was already
        // verified or not_available (EU region) — only the L2 doc step needs to be retried.
        const showVerify =
          props.kycLevel === "L1" ||
          (props.kycLevel === "REJECTED" && l1Verified) ||
          (props.kycLevel === "REJECTED" && l1NotAvailable);

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
            {stepUpFromTier && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Button
                  size="small"
                  onClick={() => { setStepUpFromTier(null); goTo(4); }}
                  sx={{ color: colors.accent, textTransform: "none", fontSize: "0.8rem", p: 0, minWidth: 0 }}
                >
                  ← Back to Buy
                </Button>
              </Stack>
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
                {stepUpFromTier ? "Verify Your Identity (unlock higher limits)" : "Verify Your Identity"}
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
                    kycJustSubmitted.current = true;
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
                onClick={() => {
                  kycJustSubmitted.current = true;
                  props.onVerifyDocuments();
                }}
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
                {hasMoreWallets && (
                  <Button
                    size="small"
                    onClick={() => fetchWallets(wallets[wallets.length - 1]?.id)}
                    disabled={loadingMoreWallets}
                    sx={{
                      color: colors.accent,
                      fontSize: "0.8rem",
                      textTransform: "none",
                      mt: 0.5,
                    }}
                  >
                    {loadingMoreWallets ? (
                      <CircularProgress size={16} sx={{ color: colors.accent, mr: 1 }} />
                    ) : null}
                    {loadingMoreWallets ? "Loading..." : "Load More"}
                  </Button>
                )}
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
                    setCollectedPaymentTypes(types);
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

            {/* Transaction limits card */}
            <Box
              sx={{
                borderRadius: 1.5,
                border: "1px solid",
                borderColor: exceedsLimit ? colors.error + "55" : colors.borderSubtle,
                bgcolor: exceedsLimit ? colors.error + "0a" : colors.cardBgAlt,
                overflow: "hidden",
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 1.5, pt: 1.25, pb: loadingLimits ? 0 : 1.25 }}
              >
                <Typography
                  sx={{
                    color: colors.textMuted,
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  {limitLabel}
                </Typography>
                {loadingLimits ? (
                  <CircularProgress size={12} sx={{ color: colors.accent }} />
                ) : limitDollars !== null ? (
                  <Typography
                    sx={{
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      color: exceedsLimit ? colors.error : colors.textPrimary,
                    }}
                  >
                    ${limitDollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: "0.8rem", color: colors.textMuted }}>
                    —
                  </Typography>
                )}
              </Stack>
              {loadingLimits && (
                <LinearProgress
                  sx={{
                    mt: 1,
                    height: 2,
                    bgcolor: colors.borderSubtle,
                    "& .MuiLinearProgress-bar": { bgcolor: colors.accent },
                  }}
                />
              )}
              {exceedsLimit && !loadingLimits && (
                <Typography
                  sx={{
                    px: 1.5,
                    pb: 1.25,
                    fontSize: "0.75rem",
                    color: colors.error,
                    lineHeight: 1.4,
                  }}
                >
                  Amount exceeds your current limit. Complete additional identity
                  verification to unlock higher limits.
                </Typography>
              )}
            </Box>

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
              disabled={props.loading || !isAmountValid || exceedsLimit}
              fullWidth
              sx={{ ...accentButtonSx, fontSize: "1rem" }}
            >
              {props.loading ? (
                <CircularProgress size={22} sx={{ color: "#fff" }} />
              ) : (
                "Review"
              )}
            </Button>

            {/* KYC step-up CTA — shown instead of (the now-disabled) Review button
                when the amount exceeds the current tier's limit and the user has
                room to verify further (L0 or L1). L2 users are at the max tier
                so no step-up is offered.

                On click:
                  1. Record the current tier in stepUpFromTier so the completion
                     effect knows when to return.
                  2. Navigate to the KYC screen (step 1) in step-up mode.
                  3. The KYC screen renders the appropriate form:
                       L0 → SSN + DOB form (submitKycInfo → polls to L1)
                       L1 → Verify Documents button (verifyDocuments → polls to L2)
                  4. Once verified, the useEffect above fires goTo(4) automatically. */}
            {exceedsLimit && !loadingLimits && (currentKycTier === "L0" || currentKycTier === "L1") && (
              <Button
                variant="outlined"
                onClick={() => {
                  setStepUpFromTier(currentKycTier);
                  goTo(1);
                }}
                fullWidth
                sx={{
                  borderColor: colors.accent,
                  color: colors.accent,
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  "&:hover": { borderColor: colors.accentLight, color: colors.accentLight },
                }}
              >
                {currentKycTier === "L0" ? "Provide SSN & Date of Birth to unlock higher limits" : "Verify ID documents to unlock higher limits"}
              </Button>
            )}
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
