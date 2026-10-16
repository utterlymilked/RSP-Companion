import { StyleSheet, Text, View } from "react-native";
import { radius, useColors } from "../theme";

/** Initials of a name ("Ana Maria Costa" → "AC"). */
export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w));
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** A round badge with a person's initials. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const colors = useColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, { width: size, height: size, backgroundColor: colors.primarySoft }]}
    >
      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: size * 0.38 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
