import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
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
import type { AccountStatus, KycLevel, KycRegion, Verification } from "./types";

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
    setOnramp(null);
    fetch(`/api/config?livemode=${livemode}`)
      .then((res) => res.json())
      .then(({ publishableKey }) => {
        if (darkMode) {
          return loadCryptoOnrampAndInitialize(publishableKey, {
            theme: "night",
          });
        } else {
          return loadCryptoOnrampAndInitialize(publishableKey);
        }
      })
      .then(setOnramp);
  }, [darkMode, livemode]);

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
  const [linkAuthIntentId, setLinkAuthIntentId] = useState<string | null>();
  const [cryptoPaymentToken, setCryptoPaymentToken] = useState<string | null>();
  const [settingsLai, setSettingsLai] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("lai") ?? null,
  );
  const [kycLevel, setKYCLevel] = useState<KycLevel>("REQUIRES_KYC");
  const [kycRegion, setKycRegion] = useState<KycRegion>(null);
  const [verifications, setVerifications] = useState<Verification[]>([]);
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
    if (settingsLai) {
      params.set("lai", settingsLai);
    } else {
      params.delete("lai");
    }
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [email, settingsLai]);

  const log = useCallback((event: string, detail?: string) => {
    const time = timestamp();
    console.log(`[Onramp] [${time}] ${event}${detail ? ` ${detail}` : ""}`);
  }, []);

  const surfaceError = useCallback(
    (context: string, e?: unknown) => {
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
    async (customerId: string, lai: string) => {
      const terminalStates = new Set([
        "REQUIRES_KYC",
        "L0",
        "L1",
        "L2",
        "REJECTED",
        "PENDING",
      ]);
      setPolling(true);
      setError(null);
      log("Polling KYC level...");
      try {
        while (true) {
          const response = await fetch(
            `/api/crypto/customers/${customerId}?email=${encodeURIComponent(email)}&lai=${lai}&livemode=${livemode}`,
          );
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            surfaceError(
              "KYC check failed",
              data?.error ?? `HTTP ${response.status}`,
            );
            break;
          }
          const json = await response.json();
          const level = json.kyc_level;
          if (json.kyc_region !== undefined) {
            setKycRegion(json.kyc_region);
          }
          if (json.verifications) {
            setVerifications(json.verifications);
          }
          if (json.provided_fields) {
            setProvidedFields(json.provided_fields);
          }
          log(`KYC Level: ${level}${json.kyc_region ? `, Region: ${json.kyc_region}` : ""}`);
          setKYCLevel(level);
          if (terminalStates.has(level)) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (e) {
        surfaceError("KYC check error", e);
      } finally {
        setPolling(false);
      }
    },
    [email, livemode, log, surfaceError],
  );

  const handleAuthenticate = useCallback(
    async (lai: string) => {
      log("Authenticating User...");
      setCryptoPaymentToken(null);
      setSelectedWallet(null);
      setSelectedWalletNetwork(null);
      setCryptoCustomerId(null);
      try {
        const authenticateResult = await onramp.authenticate(
          lai,
          async (result) => {
            log(
              `Authentication result: ${result.result}. CryptoCustomerId: ${result.crypto_customer_id}`,
            );
            setCryptoCustomerId(result.crypto_customer_id);
            if (result.crypto_customer_id) {
              await refreshKycLevel(result.crypto_customer_id, lai);
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
    [log, onramp, refreshKycLevel, surfaceError],
  );

  const handleCheckAccount = useCallback(
    async (_email: string) => {
      setLoading(true);
      setError(null);
      setAccountStatus("idle");
      setLinkAuthIntentId(null);
      log("hasLinkAccount", `email=${_email}`);
      try {
        let lai: string | null = null;
        if (settingsLai) {
          log(`Using LinkAuthIntent Id from settings: ${settingsLai}`);
          lai = settingsLai;
        } else {
          const laiResponse = await fetch("/api/link_auth_intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: _email, livemode }),
          });
          log("Creating LinkAuthIntent", `email=${_email}`);
          if (laiResponse.ok) {
            log(`Link account found for ${_email}`);
            const laiResponseJSON = await laiResponse.json();
            lai = laiResponseJSON.id;
            log("LinkAuthIntent created", `id=${laiResponseJSON.id}`);
          } else if (laiResponse.status === 404) {
            log(`Link account not found for ${_email}`);
            setAccountStatus("not_found");
          } else {
            const data = await laiResponse.json().catch(() => null);
            setAccountStatus("not_found");
            surfaceError(
              "Login failed",
              data?.error ?? `HTTP ${laiResponse.status}`,
            );
          }
        }
        if (lai) {
          setLinkAuthIntentId(lai);
          setAccountStatus("exists");
          await handleAuthenticate(lai);
        }
      } catch (e) {
        surfaceError("Login error", e);
      } finally {
        setLoading(false);
      }
    },
    [log, settingsLai, livemode, handleAuthenticate, surfaceError],
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
          const laiResponse = await fetch("/api/link_auth_intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: _email, livemode }),
          });
          if (laiResponse.ok) {
            const laiResponseJSON = await laiResponse.json();
            setLinkAuthIntentId(laiResponseJSON.id);
            log("LinkAuthIntent created", `id=${laiResponseJSON.id}`);
          } else {
            const data = await laiResponse.json().catch(() => null);
            surfaceError(
              "Registration failed",
              data?.error ?? `HTTP ${laiResponse.status}`,
            );
          }
          setAccountStatus("exists");
        }
      } catch (e) {
        surfaceError("Registration error", e);
      } finally {
        setLoading(false);
      }
    },
    [log, onramp, livemode, surfaceError],
  );

  const handleSubmitKycInfo = useCallback(
    async (info: KycInfo) => {
      setLoading(true);
      setError(null);
      log("KYC submit sent", `name=${info.given_name} ${info.surname}`);
      try {
        await onramp.submitKycInfo(info);
        log("KYC submit result", "success");
        if (cryptoCustomerId && linkAuthIntentId) {
          await refreshKycLevel(cryptoCustomerId, linkAuthIntentId);
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
      linkAuthIntentId,
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
          `wallet_token=${response.id}, network=${response.network}`,
        );
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
      wallets: { applePay: "auto" | "never"; googlePay: "auto" | "never" },
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
      if (cryptoCustomerId && linkAuthIntentId) {
        await refreshKycLevel(cryptoCustomerId, linkAuthIntentId);
      }
    } catch (e) {
      surfaceError("Identity verification error", e);
    } finally {
      setLoading(false);
    }
  }, [
    cryptoCustomerId,
    linkAuthIntentId,
    log,
    onramp,
    refreshKycLevel,
    surfaceError,
  ]);

  const handleCheckout = useCallback(
    async (sessionId: string) => {
      setLoading(true);
      setError(null);
      log("Checking out onramp session", `sessionId=${sessionId}`);
      try {
        const result = await onramp.performCheckout(
          sessionId,
          async (onrampSessionId: string) => {
            const response = await fetch(
              `/api/crypto/onramp_sessions/${onrampSessionId}/checkout`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lai: linkAuthIntentId, livemode }),
              },
            );
            const data = await response.json();
            if (response.ok) {
              log("Checkout complete", `status=${data.status}`);
            } else {
              surfaceError(
                "Checkout failed",
                data?.error ?? JSON.stringify(data),
              );
            }
            return data.client_secret as string;
          },
        );
        if (!result.successful) {
          surfaceError("Checkout failed");
        }
      } catch (e) {
        surfaceError("Checkout error", e);
      } finally {
        setLoading(false);
      }
    },
    [log, onramp, linkAuthIntentId, livemode, surfaceError],
  );

  const handleAddFunds = useCallback(
    async (amount: string, destinationCurrency: string) => {
      if (!cryptoCustomerId || !linkAuthIntentId) return;
      setLoading(true);
      setError(null);
      log(
        "Creating onramp session",
        `amount=$${amount}, currency=${destinationCurrency}`,
      );
      try {
        const response = await fetch("/api/crypto/onramp_sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lai: linkAuthIntentId,
            livemode,
            crypto_customer_id: cryptoCustomerId,
            payment_token: cryptoPaymentToken,
            source_currency: "usd",
            destination_currency: destinationCurrency,
            source_amount: amount,
            wallet_address: selectedWallet,
            destination_network: selectedWalletNetwork,
          }),
        });
        const data = await response.json();
        if (response.ok) {
          log("Onramp session created", `id=${data.id}`);
          return data;
        } else {
          surfaceError("Add funds failed", data?.error ?? JSON.stringify(data));
          return null;
        }
      } catch (e) {
        surfaceError("Add funds error", e);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [
      log,
      livemode,
      cryptoCustomerId,
      linkAuthIntentId,
      cryptoPaymentToken,
      selectedWallet,
      selectedWalletNetwork,
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
            <TextField
              label="LAI Override"
              value={settingsLai ?? ""}
              onChange={(e) => setSettingsLai(e.target.value || null)}
              size="small"
              placeholder="lai_..."
              sx={{ ...t.inputSx, width: 260 }}
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
            linkAuthIntentId={linkAuthIntentId}
            kycLevel={kycLevel}
            kycRegion={kycRegion}
            verifications={verifications}
            providedFields={providedFields}
            onramp={onramp}
            cryptoPaymentToken={cryptoPaymentToken}
            selectedWallet={selectedWallet}
            selectedWalletNetwork={selectedWalletNetwork}
            loading={loading}
            polling={polling}
            livemode={livemode}
            settingsLai={settingsLai}
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
              if (cryptoCustomerId && linkAuthIntentId) {
                refreshKycLevel(cryptoCustomerId, linkAuthIntentId);
              }
            }}
            authenticating={!!authenticationElement}
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
            linkAuthIntentId={linkAuthIntentId}
            kycLevel={kycLevel}
            cryptoPaymentToken={cryptoPaymentToken}
            selectedWallet={selectedWallet}
            selectedWalletNetwork={selectedWalletNetwork}
            loading={loading}
            polling={polling}
            livemode={livemode}
            settingsLai={settingsLai}
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
