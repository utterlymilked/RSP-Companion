import { Platform, useColorScheme, type ViewStyle } from "react-native";

/**
 * Design tokens. Every colour, spacing and font size in the app comes from here, so the look
 * changes in one place. Brand colours come from the club crest: royal blue, yellow, black and
 * the red of the ribbon (realsportclube.com uses the same blue).
 */
export const brand = {
  blue: "#0863B0",
  blueDark: "#064A85",
  blueDeep: "#043D6C",
  yellow: "#F8EB2D",
  black: "#231F20",
  red: "#D12329",
} as const;

const palette = {
  light: {
    background: "#F2F5F9",
    surface: "#FFFFFF",
    surfaceAlt: "#E8F0F9",
    text: "#14202E",
    textMuted: "#5B6878",
    border: "#DDE4EC",
    primary: brand.blue,
    primarySoft: "#E3EEF9",
    onPrimary: "#FFFFFF",
    header: brand.blueDeep,
    onHeader: "#FFFFFF",
    accent: brand.yellow,
    onAccent: brand.black,
    danger: "#C0262C",
    dangerSoft: "#FCE8E8",
    success: "#18794E",
    successSoft: "#E4F4EC",
    warning: "#9A6200",
    warningSoft: "#FFF4D6",
    turf: "#3E9B5C",
    turfStripe: "#47A665",
    pitchLine: "rgba(255, 255, 255, 0.8)",
    backdrop: "rgba(10, 18, 29, 0.45)",
    onTurf: "#FFFFFF",
    turfShadow: "rgba(0, 0, 0, 0.4)",
    track: "#7C9CC2",
    trackLine: "rgba(255, 255, 255, 0.55)",
    building: "#E4EAF1",
    busyOverlay: "rgba(200, 32, 40, 0.72)",
    pendingOverlay: "rgba(230, 150, 0, 0.7)",
  },
  dark: {
    background: "#0A121D",
    surface: "#131E2C",
    surfaceAlt: "#1A2A3E",
    text: "#EEF3F9",
    textMuted: "#9AA8B8",
    border: "#26354A",
    primary: "#5AA7EE",
    primarySoft: "#16304B",
    onPrimary: "#04182B",
    header: "#0B1C30",
    onHeader: "#FFFFFF",
    accent: brand.yellow,
    onAccent: brand.black,
    danger: "#F47A73",
    dangerSoft: "#3A1C1E",
    success: "#4CC38A",
    successSoft: "#14301F",
    warning: "#F2B84B",
    warningSoft: "#33280F",
    turf: "#2B6E42",
    turfStripe: "#317A4A",
    pitchLine: "rgba(255, 255, 255, 0.65)",
    backdrop: "rgba(0, 0, 0, 0.6)",
    onTurf: "#FFFFFF",
    turfShadow: "rgba(0, 0, 0, 0.5)",
    track: "#2D4867",
    trackLine: "rgba(255, 255, 255, 0.25)",
    building: "#1A2636",
    busyOverlay: "rgba(200, 40, 45, 0.72)",
    pendingOverlay: "rgba(220, 140, 0, 0.7)",
  },
} as const;

export type Colors = { [K in keyof (typeof palette)["light"]]: string };

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 26, xxl: 32 } as const;
/** Minimum touch target (Apple HIG 44pt, Material 48dp). */
export const touchTarget = 48;

/** A soft card shadow that works on iOS, Android and web. */
export const elevation: ViewStyle = Platform.select({
  web: { boxShadow: "0 1px 2px rgba(16, 32, 54, 0.06), 0 2px 8px rgba(16, 32, 54, 0.06)" },
  android: { elevation: 2 },
  default: {
    shadowColor: "#102036",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
}) as ViewStyle;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? palette.dark : palette.light;
}
