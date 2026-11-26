import type { SxProps, Theme } from "@mui/material";

const getColors = (dark: boolean) =>
  dark
    ? {
        bg: "#0a0e1a",
        cardBg: "#111827",
        cardBgAlt: "#1a2035",
        accent: "#635bff",
        accentLight: "#818cf8",
        cyan: "#00d4ff",
        textPrimary: "#e0e7ff",
        textSecondary: "#8892b0",
        textMuted: "#4a5568",
        success: "#00e676",
        error: "#ff4444",
        warning: "#ffaa00",
        borderSubtle: "rgba(255,255,255,0.08)",
        borderGlow: "rgba(99,91,255,0.3)",
        glowShadow: "0 0 20px rgba(99,91,255,0.15)",
      }
    : {
        bg: "#f5f7fa",
        cardBg: "#ffffff",
        cardBgAlt: "#f0f2f5",
        accent: "#635bff",
        accentLight: "#818cf8",
        cyan: "#0097a7",
        textPrimary: "#1a1a2e",
        textSecondary: "#5f6b7a",
        textMuted: "#9ca3af",
        success: "#16a34a",
        error: "#dc2626",
        warning: "#d97706",
        borderSubtle: "rgba(0,0,0,0.08)",
        borderGlow: "rgba(99,91,255,0.25)",
        glowShadow: "0 0 20px rgba(99,91,255,0.1)",
      };

export function getTheme(dark: boolean) {
  const c = getColors(dark);

  const glowCardSx: SxProps<Theme> = {
    bgcolor: c.cardBg,
    border: `1px solid ${c.borderGlow}`,
    borderRadius: 2,
    p: 3,
    boxShadow: c.glowShadow,
  };

  const inputSx: SxProps<Theme> = {
    "& .MuiOutlinedInput-root": {
      color: c.textPrimary,
      "& fieldset": { borderColor: c.borderSubtle },
      "&:hover fieldset": { borderColor: c.accentLight },
      "&.Mui-focused fieldset": { borderColor: c.accent },
    },
    "& .MuiInputLabel-root": { color: c.textSecondary },
    "& .MuiInputLabel-root.Mui-focused": { color: c.accentLight },
  };

  const accentButtonSx: SxProps<Theme> = {
    bgcolor: c.accent,
    color: "#fff",
    fontWeight: 600,
    py: 1.2,
    "&:hover": { bgcolor: c.accentLight },
    "&.Mui-disabled": { bgcolor: c.textMuted, color: "#888" },
  };

  return { colors: c, glowCardSx, inputSx, accentButtonSx };
}
