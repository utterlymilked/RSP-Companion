import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { elevation, fontSize, radius, spacing, touchTarget, useColors } from "../theme";

interface Props {
  title: string;
  subtitle?: string;
  trailing?: string;
  /** Shown left of the text in a tinted circle. */
  icon?: ComponentProps<typeof Ionicons>["name"];
  /** Anything else on the left, e.g. an avatar (wins over `icon`). */
  leading?: ReactNode;
  /** Extra content under the subtitle, e.g. badges. */
  footer?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
}

/** One row: a card on its own, with a chevron when it opens something. */
export function ListItem({
  title,
  subtitle,
  trailing,
  icon,
  leading,
  footer,
  onPress,
  selected,
}: Props) {
  const colors = useColors();
  const content = (
    <View style={styles.row}>
      {leading ??
        (icon ? (
          <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name={icon} size={20} color={colors.primary} />
          </View>
        ) : null)}
      <View style={styles.texts}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
        {footer}
      </View>
      {trailing ? (
        <Text style={[styles.trailing, { color: selected ? colors.primary : colors.textMuted }]}>
          {trailing}
        </Text>
      ) : null}
      {onPress && !trailing ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      ) : null}
    </View>
  );
  const style = [
    styles.item,
    {
      backgroundColor: selected ? colors.primarySoft : colors.surface,
      borderColor: selected ? colors.primary : colors.border,
    },
  ];
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && { opacity: 0.75 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: touchTarget + 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    justifyContent: "center",
    ...elevation,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: { flex: 1, gap: 3 },
  title: { fontSize: fontSize.md, fontWeight: "600" },
  subtitle: { fontSize: fontSize.sm, lineHeight: 19 },
  trailing: { fontSize: fontSize.sm, fontWeight: "600" },
});
