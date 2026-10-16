import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { elevation, fontSize, radius, spacing, useColors } from "../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** A square shortcut with an icon and a label, laid out in a two- or three-column grid. */
export function Tile({
  icon,
  label,
  value,
  detail,
  onPress,
  tone = "primary",
}: {
  icon: IconName;
  label: string;
  /** A number or amount shown big, for dashboard figures. */
  value?: string;
  /** A short second line under the label. */
  detail?: string;
  onPress?: () => void;
  tone?: "primary" | "danger" | "warning";
}) {
  const colors = useColors();
  const fg = { primary: colors.primary, danger: colors.danger, warning: colors.warning }[tone];
  const bg = {
    primary: colors.primarySoft,
    danger: colors.dangerSoft,
    warning: colors.warningSoft,
  }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        !value && styles.shortcut,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={fg} />
      </View>
      {value ? (
        <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Text
        style={[styles.label, { color: value ? colors.textMuted : colors.text }]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {detail ? (
        <Text style={[styles.detail, { color: colors.textMuted }]} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Wraps tiles into rows of `columns`. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: "40%",
    minWidth: 140,
    minHeight: 96,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
    ...elevation,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  value: { fontSize: fontSize.lg, fontWeight: "800" },
  label: { fontSize: fontSize.sm, fontWeight: "600" },
  shortcut: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    paddingVertical: spacing.sm,
  },
  shortcutLabel: { flex: 1, fontSize: fontSize.md },
  detail: { fontSize: fontSize.xs },
});
