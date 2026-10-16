import type { ReactNode } from "react";
import { Text as RNText, StyleSheet, type TextStyle } from "react-native";
import { fontSize, useColors } from "../theme";

interface Props {
  children: ReactNode;
  muted?: boolean;
}

export function Title({ children }: Props) {
  const colors = useColors();
  return (
    <RNText accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
      {children}
    </RNText>
  );
}

export function Body({ children, muted, style }: Props & { style?: TextStyle }) {
  const colors = useColors();
  return (
    <RNText style={[styles.body, { color: muted ? colors.textMuted : colors.text }, style]}>
      {children}
    </RNText>
  );
}

/** An error or success message, announced to screen readers when it appears. */
export function Message({ children, tone }: Props & { tone: "error" | "success" }) {
  const colors = useColors();
  return (
    <RNText
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.body, { color: tone === "error" ? colors.danger : colors.success }]}
    >
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xl, fontWeight: "800", letterSpacing: -0.3 },
  body: { fontSize: fontSize.md, lineHeight: 22 },
});
