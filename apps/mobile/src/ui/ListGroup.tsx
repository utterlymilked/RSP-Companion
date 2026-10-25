import Ionicons from "@expo/vector-icons/Ionicons";
import { Children, type ComponentProps, Fragment, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, touchTarget, useColors } from "../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * Rows in one rounded container with hairline dividers, like iOS Settings and Material 3
 * lists. Use it for menus and settings; use `ListItem` for rows that are records.
 */
export function ListGroup({ children }: { children: ReactNode }) {
  const colors = useColors();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static, ordered children
        <Fragment key={i}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

interface RowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** A control on the right (a switch, a segmented switch); replaces the chevron. */
  trailing?: ReactNode;
  onPress?: () => void;
}

/** One row of a `ListGroup`: icon, title (wraps, never overflows), optional subtitle. */
export function ListRow({ title, subtitle, icon, trailing, onPress }: RowProps) {
  const colors = useColors();
  const content = (
    <>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing ??
        (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md + 36 + spacing.md },
  row: {
    minHeight: touchTarget + 8,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.md, fontWeight: "500" },
  subtitle: { fontSize: fontSize.sm },
});
