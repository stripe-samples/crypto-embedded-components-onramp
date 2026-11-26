import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  FormControlLabel,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { CliView } from "./CliView";
import { WizardView } from "./WizardView";
import { getTheme } from "./theme";
import type {
  KycInfo,
  CryptoNetwork,
  CollectPaymentMethodOptions,
  OnrampCoordinator,
} from "@stripe/crypto";
import { loadCryptoOnrampAndInitialize } from "@stripe/crypto";
import { LinkAuthenticationModal } from "./LinkAuthenticationModal";
import {
  ApiError,
  getPublicConfig,
  isAuthorizationRequiredError,
  OnrampApi,
} from "./api";
import { customerKycData } from "./customer";
import type {
  AccountStatus,
  KycLevel,
  KycRegion,
  KycTier,
  CheckoutError,
  FeeResponsibility,
} from "./types";

function timestamp(): string {
  return new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export const ExampleApp: React.FC = () => {
  const [onramp, setOnramp] = useState<OnrampCoordinator | null>(null);
  const [initializationError, setInitializationError] = useState<Error>();
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const [darkMode, setDarkMode] = useState<boolean>(
    () =>
      new URLSearchParams(window.location.search).get("darkmode") === "true",
  );
  const [livemode, setLivemode] = useState<boolean>(
    () =>
      new URLSearchParams(window.location.search).get("livemode") === "true",
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (darkMode) {
      params.set("darkmode", "true");
    } else {
      params.delete("darkmode");
    }
    if (livemode) {
      params.set("livemode", "true");
    } else {
      params.delete("livemode");
    }
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [darkMode, livemode]);

  useEffect(() => {
    let cancelled = false;
    setOnramp(null);
    setInitializationError(undefined);
    getPublicConfig(livemode)
      .then(({ publishable_key: publishableKey }) => {
        if (darkMode) {
          return loadCryptoOnrampAndInitialize(publishableKey, {
            theme: "night",
          });
        } else {
          return loadCryptoOnrampAndInitialize(publishableKey);
        }
      })
      .then((coordinator) => {
        if (!cancelled) setOnramp(coordinator);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setInitializationError(
            error instanceof Error
              ? error
              : new Error("Unable to initialize Crypto Onramp."),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [darkMode, initializationAttempt, livemode]);

  if (initializationError) {
    const liveModeUnavailable =
      livemode &&
      initializationError instanceof ApiError &&
      initializationError.code === "mode_not_available";

    return (
      <Stack spacing={2} sx={{ p: 4, alignItems: "flex-start" }}>
        <Typography variant="h6">Unable to initialize Crypto Onramp</Typography>
        <Typography>
          {liveModeUnavailable
            ? "Live mode isn't configured for this backend."
            : initializationError.message}
        </Typography>
        <Button
          variant="contained"
          onClick={() => {
            if (liveModeUnavailable) {
              setLivemode(false);
            } else {
              setInitializationAttempt((attempt) => attempt + 1);
            }
          }}
        >
          {liveModeUnavailable ? "Use test mode" : "Retry"}
        </Button>
      </Stack>
    );
  }

  if (!onramp) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <ExampleAppInner
      onramp={onramp}
      darkMode={darkMode}
      setDarkMode={setDarkMode}
      livemode={livemode}
      setLivemode={setLivemode}
    />
  );
};

const ExampleAppInner: React.FC<{
  onramp: OnrampCoordinator;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  livemode: boolean;
  setLivemode: (val: boolean) => void;
}> = ({ onramp, darkMode, setDarkMode, livemode, setLivemode }) => {
  const [viewMode, setViewMode] = useState<"form" | "cli">("form");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(
    () => new URLSearchParams(window.location.search).get("email") ?? "",
  );
  const [authenticationElement, setAuthenticationElement] =
    useState<HTMLElement | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("idle");
  const [authenticated, setAuthenticated] = useState(false);
  const [authorizationRequired, setAuthorizationRequired] = useState(false);
  const [cryptoPaymentToken, setCryptoPaymentToken] = useState<string | null>();
  const api = useMemo(
    () => new OnrampApi(() => setAuthorizationRequired(true)),
    [],
  );
  const [kycLevel, setKYCLevel] = useState<KycLevel>("REQUIRES_KYC");
  const [currentKycTier, setCurrentKycTier] = useState<"L0" | "L1" | "L2" | null>(null);
  const [kycTiers, setKycTiers] = useState<KycTier[]>([]);
  const [limitSource, setLimitSource] = useState<"api" | "local">("api");
  // Who bears the transaction fees for sessions this app creates. "merchant" subsidizes
  // the consumer's fees — see fees.subsidy in the quote/session responses.
  const [feeResponsibility, setFeeResponsibility] = useState<FeeResponsibility>("consumer");
  const [kycRegion, setKycRegion] = useState<KycRegion>(null);
  const [providedFields, setProvidedFields] = useState<string[]>([]);
  const [cryptoCustomerId, setCryptoCustomerId] = useState<
    string | null | undefined
  >(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [selectedWalletNetwork, setSelectedWalletNetwork] = useState<
    string | null
  >(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (email) {
      params.set("email", email);
    } else {
      params.delete("email");
    }
    params.delete("lai");
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [email]);

  useEffect(() => {
    api.clearSession();
    setAuthenticated(false);
    setCryptoCustomerId(null);
  }, [api, livemode]);

  const log = useCallback((event: string, detail?: string) => {
    const time = timestamp();
    console.log(`[Onramp] [${time}] ${event}${detail ? ` ${detail}` : ""}`);
  }, []);

  const surfaceError = useCallback(
    (context: string, e?: unknown) => {
      if (isAuthorizationRequiredError(e)) return;
      const msg =
        e === undefined
          ? ""
          : e instanceof Error
            ? e.message
            : typeof e === "object" && e !== null
              ? JSON.stringify(e)
              : String(e);
      const full = msg ? `${context}: ${msg}` : context;
      log(context, msg || undefined);
      setError(full);
    },
    [log],
  );

  const refreshKycLevel = useCallback(
    async (customerId: string, previousLevel?: string) => {
      const terminalStates = new Set([
        "REQUIRES_KYC",
        "L0",
        "L1",
        "L2",
        "REJECTED",
      ]);
      const POLL_TIMEOUT_MS = 2 * 60 * 1000;
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      // After submitting KYC data, Stripe may take a moment to transition tiers
      // to "pending". Allow up to 3 grace polls at the same level before treating
      // a terminal state as stable (avoids stopping early due to the race window).
      let gracePolls = previousLevel ? 3 : 0;
      setPolling(true);
      setError(null);
      log("Polling KYC level...");
      try {
        while (true) {
          const json = customerKycData(await api.retrieveCustomer(customerId));
          const level = json.kyc_level;
          if (json.kyc_region !== undefined) {
            setKycRegion(json.kyc_region);
          }
          if (json.provided_fields) {
            setProvidedFields(json.provided_fields);
          }
          if (json.kyc_tiers) {
            setKycTiers(json.kyc_tiers);
          }
          log(`KYC Level: ${level}${json.kyc_region ? `, Region: ${json.kyc_region}` : ""}`);
          setKYCLevel(level);
          if (level === "L0" || level === "L1" || level === "L2") {
            setCurrentKycTier(level);
          }
          // Level changed from previous: no need for grace polls anymore
          if (previousLevel && level !== previousLevel) gracePolls = 0;
          if (terminalStates.has(level)) {
            if (gracePolls <= 0) break;
            gracePolls--;
          }
          if (level === "PENDING" && json.kyc_region === "eu") break;
          if (Date.now() >= deadline) {
            log("KYC polling timed out after 2 minutes");
            surfaceError("Verification is taking longer than expected. Please refresh the page to check your status.");
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (e) {
        surfaceError("KYC check error", e);
      } finally {
        setPolling(false);
      }
    },
    [api, log, surfaceError],
  );

  const handleAuthenticate = useCallback(
    async (authIntentId: string, flowToken: string) => {
      log("Authenticating User...");
      setCryptoPaymentToken(null);
      setSelectedWallet(null);
      setSelectedWalletNetwork(null);
      setCryptoCustomerId(null);
      try {
        const authenticateResult = await onramp.authenticate(
          authIntentId,
          async (result) => {
            log(
              `Authentication result: ${result.result}. CryptoCustomerId: ${result.crypto_customer_id}`,
            );
            if (result.crypto_customer_id) {
              await api.completeAuthIntent(flowToken, result.crypto_customer_id);
              setCryptoCustomerId(result.crypto_customer_id);
              setAuthenticated(true);
              await refreshKycLevel(result.crypto_customer_id);
            }
            setAuthenticationElement(null);
          },
        );
        if (authenticateResult) {
          setAuthenticationElement(authenticateResult);
        }
      } catch (e) {
        surfaceError("Authentication error", e);
      }
    },
    [api, log, onramp, refreshKycLevel, surfaceError],
  );

  const handleCheckAccount = useCallback(
    async (_email: string, preserveError = false) => {
      setLoading(true);
      if (!preserveError) setError(null);
      setAccountStatus("idle");
      setAuthenticated(false);
      api.clearSession();
      setCryptoCustomerId(null);
      setCryptoPaymentToken(null);
      setSelectedWallet(null);
      setSelectedWalletNetwork(null);
      log("hasLinkAccount", `email=${_email}`);
      try {
        log("Creating LinkAuthIntent", `email=${_email}`);
        try {
          const authIntent = await api.createAuthIntent(_email, livemode);
          log(`Link account found for ${_email}`);
          setAccountStatus("exists");
          log("LinkAuthIntent created", `id=${authIntent.auth_intent_id}`);
          await handleAuthenticate(
            authIntent.auth_intent_id,
            authIntent.flow_token,
          );
        } catch (error) {
          if (error instanceof ApiError && error.code === "link_account_not_found") {
            log(`Link account not found for ${_email}`);
            setAccountStatus("not_found");
          } else {
            setAccountStatus("not_found");
            throw error;
          }
        }
      } catch (e) {
        surfaceError("Login error", e);
      } finally {
        setLoading(false);
      }
    },
    [api, handleAuthenticate, livemode, log, surfaceError],
  );

  const handleRegister = useCallback(
    async (_email: string, phoneNumber: string, country: string) => {
      setLoading(true);
      setError(null);
      log("Register sent", `email=${_email}`);
      try {
        const response = await onramp.registerLinkUser(
          _email,
          phoneNumber,
          country,
        );
        log(
          "Register result",
          response.created
            ? `Link account created for ${_email}`
            : "Registration failed",
        );

        if (response.created) {
          log("Creating LinkAuthIntent", `email=${_email}`);
          const authIntent = await api.createAuthIntent(_email, livemode);
          log("LinkAuthIntent created", `id=${authIntent.auth_intent_id}`);
          setAccountStatus("exists");
          await handleAuthenticate(
            authIntent.auth_intent_id,
            authIntent.flow_token,
          );
        }
      } catch (e) {
        surfaceError("Registration error", e);
      } finally {
        setLoading(false);
      }
    },
    [api, handleAuthenticate, log, onramp, livemode, surfaceError],
  );

  useEffect(() => {
    if (!authorizationRequired) return;
    setAuthorizationRequired(false);
    setError("Your Link authorization expired. Sign in again to continue.");
    void handleCheckAccount(email, true);
  }, [authorizationRequired, email, handleCheckAccount]);

  const handleSubmitKycInfo = useCallback(
    async (info: KycInfo) => {
      setLoading(true);
      setError(null);
      log("KYC submit sent", `name=${info.given_name} ${info.surname}`);
      try {
        await onramp.submitKycInfo(info);
        log("KYC submit result", "success");
        if (cryptoCustomerId && authenticated) {
          await refreshKycLevel(cryptoCustomerId, kycLevel);
        }
      } catch (e) {
        surfaceError("KYC submission error", e);
      } finally {
        setLoading(false);
      }
    },
    [
      log,
      onramp,
      cryptoCustomerId,
      authenticated,
      kycLevel,
      refreshKycLevel,
      surfaceError,
    ],
  );

  const handleRegisterWalletAddress = useCallback(
    async (walletAddress: string, network: CryptoNetwork) => {
      log(
        "Register wallet sent",
        `address=${walletAddress}, network=${network}`,
      );
      try {
        const response = await onramp.registerWalletAddress(
          walletAddress,
          network,
        );
        log(
          "Register wallet result",
          `wallet_token=${response.id}, network=${response.network}, verified_ownership=${(response as any).verified_ownership}`,
        );
        return response;
      } catch (e) {
        surfaceError("Register wallet error", e);
        throw e;
      }
    },
    [log, onramp, surfaceError],
  );

  const handleDeleteWalletAddress = useCallback(
    async (walletToken: string) => {
      log("Delete wallet sent", `token=${walletToken}`);
      try {
        await onramp.deleteWalletAddress(walletToken);
        log("Delete wallet result", "success");
      } catch (e) {
        surfaceError("Delete wallet error", e);
        throw e;
      }
    },
    [log, onramp, surfaceError],
  );

  const handleCollectPaymentMethod = useCallback(
    async (
      paymentMethodTypes: string[],
      wallets: { applePay: "auto" | "always" | "never"; googlePay: "auto" | "always" | "never" },
    ): Promise<HTMLElement> => {
      const options: CollectPaymentMethodOptions = {
        payment_method_types: paymentMethodTypes,
        wallets,
      };
      log(
        "Collecting payment method...",
        `types=${paymentMethodTypes.join(",")}, applePay=${wallets.applePay}, googlePay=${wallets.googlePay}`,
      );
      const element = await onramp.collectPaymentMethod(options, (request) => {
        log(
          "Payment method collected",
          `cryptoPaymentToken=${request.cryptoPaymentToken}`,
        );
        setCryptoPaymentToken(request.cryptoPaymentToken);
      });
      log("Payment Element mounted");
      return element;
    },
    [onramp, log],
  );

  const handleVerifyDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    log("Starting identity verification...");
    try {
      const result = await onramp.verifyDocuments();
      log("Verify documents result", result.result);
      if (cryptoCustomerId && authenticated) {
        await refreshKycLevel(cryptoCustomerId, kycLevel);
      }
    } catch (e) {
      surfaceError("Identity verification error", e);
    } finally {
      setLoading(false);
    }
  }, [
    cryptoCustomerId,
    authenticated,
    kycLevel,
    log,
    onramp,
    refreshKycLevel,
    surfaceError,
  ]);

  const handleCheckout = useCallback(
    async (sessionId: string): Promise<void | CheckoutError> => {
      setLoading(true);
      setError(null);
      log("Checking out onramp session", `sessionId=${sessionId}`);
      try {
        const result = await onramp.performCheckout(
          sessionId,
          async (onrampSessionId: string) => {
            const data = await api.checkoutSession(onrampSessionId);
            if (data.transaction_details?.last_error === 'wallet_ownership_verification_required') {
              throw new Error('wallet_ownership_verification_required');
            }
            log("Checkout callback returned client_secret");
            return data.client_secret as string;
          },
        );
        if (!result.successful) {
          surfaceError("Checkout failed");
        }
      } catch (e) {
        if (e instanceof Error && e.message === 'wallet_ownership_verification_required') {
          setLoading(false);
          return { code: 'wallet_ownership_required' };
        }
        surfaceError("Checkout error", e);
      } finally {
        setLoading(false);
      }
    },
    [api, log, onramp, surfaceError],
  );

  const handleAddFunds = useCallback(
    async (amount: string, destinationCurrency: string, sourceCurrency: string = "usd") => {
      if (!cryptoCustomerId || !authenticated || !cryptoPaymentToken || !selectedWallet || !selectedWalletNetwork) return null;
      setLoading(true);
      setError(null);
      log(
        "Creating onramp session",
        `amount=$${amount}, currency=${destinationCurrency}, source=${sourceCurrency}`,
      );
      try {
        const data = await api.createSession({
            crypto_customer_id: cryptoCustomerId,
            payment_token: cryptoPaymentToken,
            source_currency: sourceCurrency,
            destination_currency: destinationCurrency,
            source_amount: amount,
            wallet_address: selectedWallet,
            destination_network: selectedWalletNetwork,
            ...(feeResponsibility === "merchant" ? { fee_responsibility: "merchant" } : {}),
        });
        log("Onramp session created", `id=${data.id}`);
        return data;
      } catch (e) {
        surfaceError("Add funds error", e);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [
      log,
      api,
      authenticated,
      cryptoCustomerId,
      cryptoPaymentToken,
      selectedWallet,
      selectedWalletNetwork,
      feeResponsibility,
      surfaceError,
    ],
  );

  const handleSelectWallet = useCallback(
    (wallet: { wallet_address: string; network: string } | null) => {
      setSelectedWallet(wallet?.wallet_address ?? null);
      setSelectedWalletNetwork(wallet?.network ?? null);
    },
    [],
  );

  const [walletOwnershipVerification, setWalletOwnershipVerification] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = getTheme(darkMode);
  const c = t.colors;

  return (
    <Box
      sx={{
        bgcolor: c.bg,
        minHeight: "100vh",
        overflow: viewMode === "cli" ? "hidden" : "auto",
        transition: "background-color 0.2s ease",
      }}
    >
      {/* Top bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 3,
          py: 1.5,
          borderBottom: `1px solid ${c.borderSubtle}`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${c.accent}, ${c.cyan})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "0.85rem",
              color: "#fff",
            }}
          >
            S
          </Box>
          <Typography
            sx={{ color: c.textPrimary, fontWeight: 700, fontSize: "1.1rem" }}
          >
            Stripe Onramp
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Button
            size="small"
            onClick={() => setSettingsOpen((p) => !p)}
            sx={{
              color: c.textSecondary,
              textTransform: "none",
              fontSize: "0.8rem",
            }}
          >
            Settings
          </Button>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v && setViewMode(v)}
            size="small"
            sx={{
              "& .MuiToggleButton-root": {
                color: c.textSecondary,
                borderColor: c.borderSubtle,
                textTransform: "none",
                px: 2,
                py: 0.5,
                fontSize: "0.8rem",
                "&.Mui-selected": {
                  bgcolor: c.accent,
                  color: "#fff",
                  borderColor: c.accent,
                  "&:hover": { bgcolor: c.accentLight },
                },
              },
            }}
          >
            <ToggleButton value="form">Wizard</ToggleButton>
            <ToggleButton value="cli">CLI</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Box>

      {/* Settings drawer */}
      <Collapse in={settingsOpen}>
        <Box
          sx={{
            px: 3,
            py: 1.5,
            borderBottom: `1px solid ${c.borderSubtle}`,
            bgcolor: c.cardBg,
          }}
        >
          <Stack direction="row" spacing={3} alignItems="center">
            <FormControlLabel
              control={
                <Switch
                  checked={darkMode}
                  onChange={(e) => setDarkMode(e.target.checked)}
                  size="small"
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": { color: c.accent },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      bgcolor: c.accent,
                    },
                  }}
                />
              }
              label={
                <Typography sx={{ color: c.textSecondary, fontSize: "0.8rem" }}>
                  Dark Mode
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={livemode}
                  onChange={(e) => setLivemode(e.target.checked)}
                  size="small"
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": { color: c.success },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      bgcolor: c.success,
                    },
                  }}
                />
              }
              label={
                <Typography sx={{ color: c.textSecondary, fontSize: "0.8rem" }}>
                  Livemode
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={limitSource === "api"}
                  onChange={(e) => setLimitSource(e.target.checked ? "api" : "local")}
                  size="small"
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": { color: c.accent },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      bgcolor: c.accent,
                    },
                  }}
                />
              }
              label={
                <Typography sx={{ color: c.textSecondary, fontSize: "0.8rem" }}>
                  Fetch Limit API
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={walletOwnershipVerification}
                  onChange={(e) => setWalletOwnershipVerification(e.target.checked)}
                  size="small"
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": { color: c.accent },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      bgcolor: c.accent,
                    },
                  }}
                />
              }
              label={
                <Typography sx={{ color: c.textSecondary, fontSize: "0.8rem" }}>
                  EU Wallet Ownership Verification
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={feeResponsibility === "merchant"}
                  onChange={(e) =>
                    setFeeResponsibility(e.target.checked ? "merchant" : "consumer")
                  }
                  size="small"
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": { color: c.accent },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      bgcolor: c.accent,
                    },
                  }}
                />
              }
              label={
                <Typography sx={{ color: c.textSecondary, fontSize: "0.8rem" }}>
                  Merchant Covers Fees
                </Typography>
              }
            />
          </Stack>
        </Box>
      </Collapse>

      {/* Main content */}
      <Box sx={{ p: 4 }}>
        {viewMode === "form" ? (
          <WizardView
            darkMode={darkMode}
            email={email}
            setEmail={setEmail}
            error={error}
            setError={setError}
            accountStatus={accountStatus}
            cryptoCustomerId={cryptoCustomerId}
            api={api}
            authenticated={authenticated}
            kycLevel={kycLevel}
            kycRegion={kycRegion}
            providedFields={providedFields}
            onramp={onramp}
            cryptoPaymentToken={cryptoPaymentToken}
            selectedWallet={selectedWallet}
            selectedWalletNetwork={selectedWalletNetwork}
            loading={loading}
            polling={polling}
            livemode={livemode}
            onCheckAccount={handleCheckAccount}
            onRegister={handleRegister}
            onSubmitKycInfo={handleSubmitKycInfo}
            onRegisterWallet={handleRegisterWalletAddress}
            onDeleteWallet={handleDeleteWalletAddress}
            onCollectPaymentMethod={handleCollectPaymentMethod}
            onVerifyDocuments={handleVerifyDocuments}
            onAddFunds={handleAddFunds}
            onCheckout={handleCheckout}
            onSelectWallet={handleSelectWallet}
            onRefreshKycLevel={() => {
              if (cryptoCustomerId && authenticated) {
                refreshKycLevel(cryptoCustomerId);
              }
            }}
            authenticating={!!authenticationElement}
            currentKycTier={currentKycTier}
            kycTiers={kycTiers}
            limitSource={limitSource}
            walletOwnershipVerification={walletOwnershipVerification}
            log={log}
          />
        ) : (
          <CliView
            email={email}
            setEmail={setEmail}
            error={error}
            setError={setError}
            accountStatus={accountStatus}
            cryptoCustomerId={cryptoCustomerId}
            api={api}
            authenticated={authenticated}
            kycLevel={kycLevel}
            cryptoPaymentToken={cryptoPaymentToken}
            selectedWallet={selectedWallet}
            selectedWalletNetwork={selectedWalletNetwork}
            loading={loading}
            polling={polling}
            livemode={livemode}
            onCheckAccount={handleCheckAccount}
            onRegister={handleRegister}
            onSubmitKycInfo={handleSubmitKycInfo}
            onRegisterWallet={handleRegisterWalletAddress}
            onDeleteWallet={handleDeleteWalletAddress}
            onCollectPaymentMethod={handleCollectPaymentMethod}
            onVerifyDocuments={handleVerifyDocuments}
            onAddFunds={handleAddFunds}
            onCheckout={handleCheckout}
            onSelectWallet={handleSelectWallet}
            log={log}
          />
        )}
        {authenticationElement ? (
          <LinkAuthenticationModal
            open={!!authenticationElement}
            setOpen={() => setAuthenticationElement(null)}
            element={authenticationElement}
          />
        ) : null}
      </Box>
    </Box>
  );
};
