import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, touchTarget, useColors } from "../theme";

interface Props {
  title: string;
  subtitle?: string;
  trailing?: string;
  onPress?: () => void;
  selected?: boolean;
}

export function ListItem({ title, subtitle, trailing, onPress, selected }: Props) {
  const colors = useColors();
  const content = (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing ? (
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{trailing}</Text>
      ) : null}
    </View>
  );
  const style = [
    styles.item,
    { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.border },
  ];
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.md, fontWeight: "500" },
  subtitle: { fontSize: fontSize.sm },
});
