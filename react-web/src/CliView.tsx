import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import type { KycInfo, CryptoNetwork } from "@stripe/crypto";
import type { CheckoutError } from "./types";
import { getNetworks, getExplorerUrl } from "./shared";
import type { AccountStatus, KycLevel, Wallet, OnrampSession } from "./types";

type OutputLine = {
  text: string;
  color: "green" | "red" | "yellow" | "cyan" | "white" | "gray";
};

export type CliViewProps = {
  email: string;
  setEmail: (email: string) => void;
  error: string | null;
  setError: (error: string | null) => void;
  accountStatus: AccountStatus;
  cryptoCustomerId: string | null | undefined;
  linkAuthIntentId: string | null | undefined;
  kycLevel: KycLevel;
  cryptoPaymentToken: string | null | undefined;
  selectedWallet: string | null;
  selectedWalletNetwork: string | null;
  loading: boolean;
  polling: boolean;
  livemode: boolean;
  settingsLai: string | null;
  onCheckAccount: (email: string) => Promise<void>;
  onRegister: (
    email: string,
    phone: string,
    country: string,
  ) => Promise<void>;
  onSubmitKycInfo: (info: KycInfo) => Promise<void>;
  onRegisterWallet: (
    address: string,
    network: CryptoNetwork,
  ) => Promise<void>;
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
  onCheckout: (sessionId: string) => Promise<void | CheckoutError>;
  onSelectWallet: (
    wallet: { wallet_address: string; network: string } | null,
  ) => void;
  log: (event: string, detail?: string) => void;
};

const COLOR_MAP: Record<OutputLine["color"], string> = {
  green: "#00ff41",
  red: "#ff4444",
  yellow: "#ffaa00",
  cyan: "#00ddff",
  white: "#e0e0e0",
  gray: "#888888",
};


const HELP_TEXT = [
  { cmd: "login <email>", desc: "Check account & authenticate" },
  { cmd: "register <email> <phone> <country>", desc: "Register new Link account" },
  { cmd: "kyc", desc: "Show current KYC level" },
  {
    cmd: "kyc submit <first> <last> <line1> <city> <state> <zip> <country>",
    desc: "Submit KYC info (add --dob YYYY-MM-DD --ssn 123456789)",
  },
  { cmd: "kyc step-up --dob YYYY-MM-DD --ssn 123456789", desc: "L0 step-up KYC" },
  { cmd: "kyc verify", desc: "Document verification (L1 → L2)" },
  { cmd: "wallets", desc: "List registered wallets" },
  { cmd: "add-wallet <address> <network>", desc: "Register a new wallet" },
  { cmd: "select-wallet <index>", desc: "Select wallet by index" },
  { cmd: "delete-wallet <index>", desc: "Delete wallet by index" },
  { cmd: "pay [card|bank|all]", desc: "Collect payment method" },
  { cmd: "buy <amount> [currency]", desc: "Create onramp session (default: usdc)" },
  { cmd: "checkout", desc: "Confirm and execute trade" },
  { cmd: "status", desc: "Show current state" },
  { cmd: "clear", desc: "Clear terminal" },
];

function parseFlags(
  args: string[],
): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, flags };
}

export const CliView: React.FC<CliViewProps> = (props) => {
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [_historyIndex, setHistoryIndex] = useState(-1);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [session, setSession] = useState<OnrampSession | null>(null);
  const [busy, setBusy] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const paymentContainerRef = useRef<HTMLDivElement>(null);
  const [showPaymentContainer, setShowPaymentContainer] = useState(false);

  const print = useCallback(
    (text: string, color: OutputLine["color"] = "white") => {
      setOutputLines((prev) => [...prev, { text, color }]);
    },
    [],
  );

  // Welcome message
  const welcomeShown = useRef(false);
  useEffect(() => {
    if (welcomeShown.current) return;
    welcomeShown.current = true;
    print("=== Stripe Crypto Onramp CLI ===", "cyan");
    print("Type 'help' for available commands.", "gray");
    print("", "white");
  }, [print]);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputLines]);

  // Focus input on click anywhere in terminal
  const handleTerminalClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const fetchWallets = useCallback(async (): Promise<Wallet[]> => {
    if (!props.cryptoCustomerId || !props.linkAuthIntentId) return [];
    try {
      const res = await fetch(
        `/api/crypto/customers/${props.cryptoCustomerId}/wallets?lai=${encodeURIComponent(props.linkAuthIntentId)}&livemode=${props.livemode}`,
      );
      if (res.ok) {
        const data = await res.json();
        const w = data.data ?? [];
        setWallets(w);
        return w;
      }
    } catch {}
    return [];
  }, [props.cryptoCustomerId, props.linkAuthIntentId, props.livemode]);

  const pollSession = useCallback(
    async (sessionId: string) => {
      const terminalStatuses = new Set([
        "fulfillment_complete",
        "fulfillment_error",
        "expired",
        "canceled",
      ]);
      print("Polling transaction status...", "gray");
      while (true) {
        try {
          const res = await fetch(
            `/api/crypto/onramp_sessions/${sessionId}?livemode=${props.livemode}`,
          );
          const data = await res.json();
          if (terminalStatuses.has(data.status)) {
            if (data.status === "fulfillment_complete") {
              print("Transaction complete!", "green");
              if (data.transaction_id) {
                print(`  TX: ${data.transaction_id}`, "white");
                const network = props.selectedWalletNetwork;
                if (network) {
                  const url = getExplorerUrl(data.transaction_id, network, props.livemode);
                  if (url) {
                    print(`  Explorer: ${url}`, "cyan");
                  }
                }
              }
            } else {
              print(`Transaction ended: ${data.status}`, "red");
            }
            return;
          }
          print(`  status: ${data.status}...`, "gray");
        } catch (e) {
          print(`Poll error: ${e}`, "red");
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
    [props.livemode, props.selectedWalletNetwork, print],
  );

  const executeCommand = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      print(`$ ${trimmed}`, "white");

      const parts =
        trimmed.match(/(?:[^\s"]+|"[^"]*")/g)?.map((s) =>
          s.replace(/^"|"$/g, ""),
        ) ?? [];
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      switch (command) {
        // ─── HELP ──────────────────────────────────────────
        case "help": {
          print("", "white");
          print("Available commands:", "cyan");
          for (const h of HELP_TEXT) {
            print(`  ${h.cmd.padEnd(55)} ${h.desc}`, "white");
          }
          print("", "white");
          break;
        }

        // ─── LOGIN ─────────────────────────────────────────
        case "login": {
          const email = args[0] || props.email;
          if (!email) {
            print("Usage: login <email>", "yellow");
            break;
          }
          props.setEmail(email);
          print(`Logging in as ${email}...`, "cyan");
          try {
            await props.onCheckAccount(email);
            print("Authentication flow initiated.", "green");
            print(
              "Complete authentication in the popup if prompted.",
              "gray",
            );
          } catch (e: any) {
            print(`Login error: ${e.message || e}`, "red");
          }
          break;
        }

        // ─── REGISTER ──────────────────────────────────────
        case "register": {
          if (args.length < 3) {
            print(
              "Usage: register <email> <phone> <country>",
              "yellow",
            );
            print(
              '  Example: register user@example.com +14155551234 US',
              "gray",
            );
            break;
          }
          const [regEmail, phone, country] = args;
          print(`Registering ${regEmail}...`, "cyan");
          try {
            await props.onRegister(regEmail, phone, country);
            print("Registration complete. Authentication flow initiated.", "green");
            print(
              "Complete authentication in the popup if prompted.",
              "gray",
            );
          } catch (e: any) {
            print(`Register error: ${e.message || e}`, "red");
          }
          break;
        }

        // ─── KYC ───────────────────────────────────────────
        case "kyc": {
          const sub = args[0]?.toLowerCase();
          if (!sub) {
            print(`KYC Level: ${props.kycLevel}`, "cyan");
            if (props.kycLevel === "REQUIRES_KYC") {
              print(
                "Use 'kyc submit' to submit your information.",
                "gray",
              );
            } else if (props.kycLevel === "L0") {
              print(
                "Use 'kyc step-up --dob YYYY-MM-DD --ssn 123456789' for L1.",
                "gray",
              );
            } else if (props.kycLevel === "L1") {
              print("Use 'kyc verify' for document verification.", "gray");
            }
            break;
          }

          if (sub === "submit") {
            const { positional, flags } = parseFlags(args.slice(1));
            if (positional.length < 7) {
              print(
                "Usage: kyc submit <first> <last> <line1> <city> <state> <zip> <country>",
                "yellow",
              );
              print(
                "  Optional: --dob YYYY-MM-DD --ssn 123456789",
                "gray",
              );
              break;
            }
            const [first, last, line1, city, state, zip, kycCountry] =
              positional;
            const info: KycInfo = {
              given_name: first,
              surname: last,
              address: { line1, city, state, postal_code: zip, country: kycCountry },
            };
            if (flags.dob) {
              const [y, m, d] = flags.dob.split("-");
              info.date_of_birth = {
                year: parseInt(y),
                month: parseInt(m),
                day: parseInt(d),
              };
            }
            if (flags.ssn) {
              info.id_number = { type: "us_ssn" as const, value: flags.ssn };
            }
            print("Submitting KYC info...", "cyan");
            try {
              await props.onSubmitKycInfo(info);
              print("KYC submitted successfully.", "green");
            } catch (e: any) {
              print(`KYC error: ${e.message || e}`, "red");
            }
            break;
          }

          if (sub === "step-up") {
            const { flags } = parseFlags(args.slice(1));
            if (!flags.dob || !flags.ssn) {
              print(
                "Usage: kyc step-up --dob YYYY-MM-DD --ssn 123456789",
                "yellow",
              );
              break;
            }
            const [y, m, d] = flags.dob.split("-");
            const info: KycInfo = {
              date_of_birth: {
                year: parseInt(y),
                month: parseInt(m),
                day: parseInt(d),
              },
              id_number: { type: "us_ssn" as const, value: flags.ssn },
            };
            print("Submitting step-up KYC...", "cyan");
            try {
              await props.onSubmitKycInfo(info);
              print("Step-up KYC submitted.", "green");
            } catch (e: any) {
              print(`KYC error: ${e.message || e}`, "red");
            }
            break;
          }

          if (sub === "verify") {
            print("Starting document verification...", "cyan");
            try {
              await props.onVerifyDocuments();
              print("Document verification complete.", "green");
            } catch (e: any) {
              print(`Verify error: ${e.message || e}`, "red");
            }
            break;
          }

          print(`Unknown kyc subcommand: ${sub}`, "red");
          break;
        }

        // ─── WALLETS ───────────────────────────────────────
        case "wallets": {
          if (!props.cryptoCustomerId) {
            print("Not authenticated. Run 'login' first.", "yellow");
            break;
          }
          print("Fetching wallets...", "gray");
          const w = await fetchWallets();
          if (w.length === 0) {
            print("No wallets registered.", "gray");
            print(
              "Use 'add-wallet <address> <network>' to add one.",
              "gray",
            );
          } else {
            print("", "white");
            print(
              `  ${"#".padEnd(4)} ${"Network".padEnd(12)} ${"Address"}`,
              "cyan",
            );
            print(`  ${"─".repeat(50)}`, "gray");
            w.forEach((wallet, i) => {
              const selected =
                props.selectedWallet === wallet.wallet_address
                  ? " ◀ selected"
                  : "";
              print(
                `  ${String(i).padEnd(4)} ${wallet.network.padEnd(12)} ${wallet.wallet_address.slice(0, 20)}...${selected}`,
                props.selectedWallet === wallet.wallet_address
                  ? "green"
                  : "white",
              );
            });
            print("", "white");
          }
          break;
        }

        // ─── ADD-WALLET ────────────────────────────────────
        case "add-wallet": {
          if (args.length < 2) {
            print("Usage: add-wallet <address> <network>", "yellow");
            print(
              `  Networks: ${getNetworks(props.livemode).join(", ")}`,
              "gray",
            );
            break;
          }
          const [addr, net] = args;
          if (!getNetworks(props.livemode).includes(net as CryptoNetwork)) {
            print(
              `Invalid network. Options: ${getNetworks(props.livemode).join(", ")}`,
              "red",
            );
            break;
          }
          print(`Registering wallet on ${net}...`, "cyan");
          try {
            await props.onRegisterWallet(addr, net as CryptoNetwork);
            print("Wallet registered.", "green");
            await fetchWallets();
          } catch (e: any) {
            print(`Error: ${e.message || e}`, "red");
          }
          break;
        }

        // ─── SELECT-WALLET ─────────────────────────────────
        case "select-wallet": {
          const idx = parseInt(args[0]);
          if (isNaN(idx) || idx < 0 || idx >= wallets.length) {
            print(
              `Invalid index. Run 'wallets' first. (0-${wallets.length - 1})`,
              "yellow",
            );
            break;
          }
          const w = wallets[idx];
          const supported = getNetworks(props.livemode);
          if (!supported.includes(w.network as CryptoNetwork)) {
            print(
              `Network "${w.network}" is not supported in ${props.livemode ? "live" : "test"} mode. Supported: ${supported.join(", ")}`,
              "red",
            );
            break;
          }
          props.onSelectWallet({
            wallet_address: w.wallet_address,
            network: w.network,
          });
          print(
            `Selected wallet: ${w.wallet_address.slice(0, 20)}... (${w.network})`,
            "green",
          );
          break;
        }

        // ─── DELETE-WALLET ─────────────────────────────────
        case "delete-wallet": {
          const delIdx = parseInt(args[0]);
          if (isNaN(delIdx) || delIdx < 0 || delIdx >= wallets.length) {
            print(
              `Invalid index. Run 'wallets' first. (0-${wallets.length - 1})`,
              "yellow",
            );
            break;
          }
          const dw = wallets[delIdx];
          print(`Deleting wallet ${dw.wallet_address.slice(0, 20)}...`, "cyan");
          try {
            await props.onDeleteWallet(dw.id);
            print("Wallet deleted.", "green");
            if (props.selectedWallet === dw.wallet_address) {
              props.onSelectWallet(null);
            }
            await fetchWallets();
          } catch (e: any) {
            print(`Error: ${e.message || e}`, "red");
          }
          break;
        }

        // ─── PAY ───────────────────────────────────────────
        case "pay": {
          if (!props.cryptoCustomerId) {
            print("Not authenticated. Run 'login' first.", "yellow");
            break;
          }
          const typeArg = (args[0] || "all").toLowerCase();
          let types: string[];
          if (typeArg === "card") types = ["card"];
          else if (typeArg === "bank") types = ["us_bank_account"];
          else types = ["card", "us_bank_account"];

          print(`Collecting payment method (${typeArg})...`, "cyan");
          try {
            const el = await props.onCollectPaymentMethod(types, {
              applePay: "auto",
              googlePay: "auto",
            });
            if (paymentContainerRef.current) {
              paymentContainerRef.current.innerHTML = "";
              paymentContainerRef.current.appendChild(el);
              setShowPaymentContainer(true);
            }
            print(
              "Payment element mounted. Complete payment in the form above.",
              "green",
            );
          } catch (e: any) {
            print(`Error: ${e.message || e}`, "red");
          }
          break;
        }

        // ─── BUY ───────────────────────────────────────────
        case "buy": {
          if (!props.cryptoCustomerId) {
            print("Not authenticated. Run 'login' first.", "yellow");
            break;
          }
          if (!props.selectedWallet) {
            print("No wallet selected. Run 'wallets' then 'select-wallet <index>'.", "yellow");
            break;
          }
          if (!props.cryptoPaymentToken) {
            print("No payment method. Run 'pay' first.", "yellow");
            break;
          }
          const amount = args[0];
          if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            print("Usage: buy <amount> [currency]", "yellow");
            print("  Example: buy 5 usdc", "gray");
            break;
          }
          const currency = args[1] || "usdc";
          print(
            `Creating onramp session for $${amount} → ${currency.toUpperCase()}...`,
            "cyan",
          );
          try {
            const s = await props.onAddFunds(amount, currency);
            if (s) {
              setSession(s);
              const td = s.transaction_details;
              print("", "white");
              print("  Session created:", "green");
              print(`  ID:           ${s.id}`, "white");
              print(
                `  You pay:      $${s.source_total_amount}`,
                "white",
              );
              print(
                `  You receive:  ${td.destination_amount} ${td.destination_currency.toUpperCase()}`,
                "white",
              );
              print(`  Network:      ${td.destination_network}`, "white");
              print(
                `  Wallet:       ${td.wallet_address.slice(0, 20)}...`,
                "white",
              );
              print(
                `  Network fee:  $${td.fees.network_fee_amount}`,
                "gray",
              );
              print(
                `  Txn fee:      $${td.fees.transaction_fee_amount}`,
                "gray",
              );
              print("", "white");
              print("Run 'checkout' to confirm.", "cyan");
            } else {
              print("Failed to create session.", "red");
            }
          } catch (e: any) {
            print(`Error: ${e.message || e}`, "red");
          }
          break;
        }

        // ─── CHECKOUT ──────────────────────────────────────
        case "checkout": {
          if (!session) {
            print("No session. Run 'buy <amount>' first.", "yellow");
            break;
          }
          print(`Checking out session ${session.id}...`, "cyan");
          try {
            await props.onCheckout(session.id);
            await pollSession(session.id);
            setSession(null);
          } catch (e: any) {
            print(`Checkout error: ${e.message || e}`, "red");
          }
          break;
        }

        // ─── STATUS ────────────────────────────────────────
        case "status": {
          print("", "white");
          print("  Current State", "cyan");
          print(`  ${"─".repeat(40)}`, "gray");
          print(
            `  Email:          ${props.email || "(not set)"}`,
            "white",
          );
          print(
            `  Account:        ${props.accountStatus}`,
            "white",
          );
          print(
            `  Customer ID:    ${props.cryptoCustomerId || "(none)"}`,
            "white",
          );
          print(
            `  KYC Level:      ${props.kycLevel}`,
            props.kycLevel === "L2"
              ? "green"
              : props.kycLevel === "REJECTED"
                ? "red"
                : "white",
          );
          print(
            `  Wallet:         ${props.selectedWallet ? `${props.selectedWallet.slice(0, 20)}... (${props.selectedWalletNetwork})` : "(none)"}`,
            "white",
          );
          print(
            `  Payment token:  ${props.cryptoPaymentToken ? `${String(props.cryptoPaymentToken).slice(0, 20)}...` : "(none)"}`,
            "white",
          );
          print(
            `  Session:        ${session ? session.id : "(none)"}`,
            "white",
          );
          print(
            `  Livemode:       ${props.livemode}`,
            "white",
          );
          print("", "white");
          break;
        }

        // ─── CLEAR ─────────────────────────────────────────
        case "clear": {
          setOutputLines([]);
          break;
        }

        // ─── UNKNOWN ───────────────────────────────────────
        default: {
          print(`Unknown command: ${command}`, "red");
          print("Type 'help' for available commands.", "gray");
        }
      }
    },
    [props, wallets, session, fetchWallets, pollSession, print],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const val = e.currentTarget.value;
        setInputValue("");
        setHistoryIndex(-1);
        if (val.trim()) {
          setCommandHistory((prev) => [val, ...prev]);
        }
        setBusy(true);
        executeCommand(val).finally(() => {
          setBusy(false);
          setTimeout(() => inputRef.current?.focus(), 0);
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHistoryIndex((prev) => {
          const next = Math.min(prev + 1, commandHistory.length - 1);
          if (next >= 0) setInputValue(commandHistory[next]);
          return next;
        });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHistoryIndex((prev) => {
          const next = prev - 1;
          if (next < 0) {
            setInputValue("");
            return -1;
          }
          setInputValue(commandHistory[next]);
          return next;
        });
      }
    },
    [commandHistory, executeCommand],
  );

  // Hide payment container once payment token is set
  useEffect(() => {
    if (props.cryptoPaymentToken && showPaymentContainer) {
      setShowPaymentContainer(false);
      print("Payment method collected.", "green");
    }
  }, [props.cryptoPaymentToken, showPaymentContainer, print]);

  return (
    <Box
      onClick={handleTerminalClick}
      sx={{
        bgcolor: "#1a1a2e",
        color: "#e0e0e0",
        fontFamily:
          '"Source Code Pro", "Fira Code", "Consolas", "Monaco", monospace',
        borderRadius: 1,
        p: 2,
        height: "calc(100vh - 130px - 32px)",
        width: "calc(100% - 32px)",
        display: "flex",
        flexDirection: "column",
        cursor: "text",
        position: "relative",
      }}
    >
      {/* Title bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 1,
          pb: 1,
          borderBottom: "1px solid #333",
        }}
      >
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            bgcolor: "#ff5f57",
          }}
        />
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            bgcolor: "#ffbd2e",
          }}
        />
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            bgcolor: "#28c840",
          }}
        />
        <Typography
          sx={{
            fontFamily: "inherit",
            fontSize: "0.75rem",
            color: "#666",
            ml: 1,
          }}
        >
          stripe-onramp — bash
        </Typography>
      </Box>

      {/* Output area */}
      <Box
        ref={outputRef}
        sx={{
          flex: 1,
          overflowY: "auto",
          mb: 1,
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: "#444",
            borderRadius: 3,
          },
          "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
        }}
      >
        {outputLines.map((line, i) => (
          <Typography
            key={i}
            sx={{
              fontFamily: "inherit",
              fontSize: "0.85rem",
              color: COLOR_MAP[line.color],
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {line.text}
          </Typography>
        ))}
        {(busy || props.loading) && (
          <Typography
            sx={{
              fontFamily: "inherit",
              fontSize: "0.85rem",
              color: COLOR_MAP.gray,
              lineHeight: 1.6,
            }}
          >
            ...
          </Typography>
        )}
      </Box>

      {/* SDK element container */}
      <Box
        ref={paymentContainerRef}
        sx={{
          display: showPaymentContainer ? "block" : "none",
          mb: 1,
          p: 1,
          border: "1px solid #333",
          borderRadius: 1,
          bgcolor: "#fff",
        }}
      />

      {/* Input line */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          borderTop: "1px solid #333",
          pt: 1,
        }}
      >
        <Typography
          sx={{
            color: COLOR_MAP.green,
            fontFamily: "inherit",
            fontSize: "0.85rem",
            mr: 1,
            userSelect: "none",
          }}
        >
          $
        </Typography>
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          autoFocus
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#e0e0e0",
            fontFamily: "inherit",
            fontSize: "0.85rem",
            flex: 1,
            caretColor: COLOR_MAP.green,
          }}
        />
      </Box>
    </Box>
  );
};
