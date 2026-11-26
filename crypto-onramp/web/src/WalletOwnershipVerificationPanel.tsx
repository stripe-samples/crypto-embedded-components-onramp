import React from "react";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { WalletOwnershipChallenge } from "@stripe/crypto";

export type WalletOwnershipVerificationPanelProps = {
  challenge: WalletOwnershipChallenge;
  sig: string;
  onSigChange: (sig: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  loading: boolean;
  livemode: boolean;
  /** Compact inline variant (used inside the Wallets step). Full-page otherwise. */
  compact?: boolean;
  colors: {
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    cardBgAlt: string;
    borderSubtle: string;
    accent: string;
  };
  inputSx: object;
  accentButtonSx: object;
};

export const WalletOwnershipVerificationPanel: React.FC<WalletOwnershipVerificationPanelProps> = ({
  challenge,
  sig,
  onSigChange,
  onSubmit,
  onCancel,
  loading,
  livemode,
  compact,
  colors,
  inputSx,
  accentButtonSx,
}) => {
  return (
    <Stack spacing={compact ? 2 : 3}>
      {compact && <Divider sx={{ borderColor: colors.borderSubtle }} />}

      <Box>
        <Typography
          sx={{
            color: colors.textPrimary,
            fontSize: compact ? "1rem" : "1.5rem",
            fontWeight: 700,
            mb: compact ? 0 : 0.5,
          }}
        >
          {compact ? "EU Travel Rule — Verify Wallet Ownership" : "Verify Wallet Ownership"}
        </Typography>
        {!compact && (
          <Typography sx={{ color: colors.textSecondary, fontSize: "0.9rem" }}>
            EU Travel Rule requires proof that you control this wallet.
          </Typography>
        )}
      </Box>

      <Box>
        <Typography
          sx={{
            color: colors.textMuted,
            fontSize: "0.75rem",
            fontWeight: 600,
            mb: 1,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Challenge Message
        </Typography>
        <Box
          sx={{
            bgcolor: colors.cardBgAlt,
            borderRadius: 1.5,
            p: 1.5,
            border: `1px solid ${colors.borderSubtle}`,
            fontFamily: "monospace",
            fontSize: "0.8rem",
            color: colors.textSecondary,
            wordBreak: "break-all",
            userSelect: "text",
          }}
        >
          {challenge.message}
        </Box>
      </Box>

      {/* Test mode hint */}
      <Box
        sx={{
          bgcolor: `${colors.accent}11`,
          border: `1px solid ${colors.accent}33`,
          borderRadius: 1.5,
          p: 1.5,
        }}
      >
        <Typography sx={{ color: colors.accent, fontSize: "0.8rem" }}>
          Test mode: use{" "}
          <Box component="span" sx={{ fontFamily: "monospace" }}>
            abcd
          </Box>{" "}
          as the signature to bypass verification{livemode ? "" : " (pre-filled)"}.
        </Typography>
      </Box>

      <TextField
        label="Signature"
        value={sig}
        onChange={(e) => onSigChange(e.target.value)}
        placeholder="Paste your signature here"
        size="small"
        fullWidth
        multiline={compact}
        rows={compact ? 2 : undefined}
        sx={inputSx}
      />

      <Stack direction="row" spacing={1.5}>
        {onCancel && (
          <Button
            variant="outlined"
            onClick={onCancel}
            fullWidth
            sx={{ py: 1.2, color: colors.textSecondary, borderColor: colors.borderSubtle }}
          >
            Cancel
          </Button>
        )}
        <Button
          variant="contained"
          onClick={onSubmit}
          disabled={loading || !sig.trim()}
          fullWidth
          sx={{ ...accentButtonSx, fontSize: "1rem" }}
        >
          {loading ? (
            <CircularProgress size={20} sx={{ color: "#fff" }} />
          ) : (
            "Submit Signature"
          )}
        </Button>
      </Stack>
    </Stack>
  );
};
