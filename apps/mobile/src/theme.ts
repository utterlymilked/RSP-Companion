import { useColorScheme } from "react-native";

/**
 * Design tokens. Every colour, spacing and font size in the app comes from here, so the look
 * changes in one place. The brand colours are placeholders until the club confirms its own.
 */
const palette = {
  light: {
    background: "#f6f7f9",
    surface: "#ffffff",
    text: "#111827",
    textMuted: "#4b5563",
    border: "#d1d5db",
    primary: "#0f5132",
    onPrimary: "#ffffff",
    danger: "#b42318",
    success: "#067647",
  },
  dark: {
    background: "#0b0f14",
    surface: "#151b23",
    text: "#f3f4f6",
    textMuted: "#9ca3af",
    border: "#30363d",
    primary: "#3fb27f",
    onPrimary: "#04140c",
    danger: "#f97066",
    success: "#47cd89",
  },
} as const;

export type Colors = { [K in keyof (typeof palette)["light"]]: string };

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 6, md: 10 } as const;
export const fontSize = { sm: 14, md: 16, lg: 20, xl: 26 } as const;
/** Minimum touch target (Apple HIG 44pt, Material 48dp). */
export const touchTarget = 48;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? palette.dark : palette.light;
}
