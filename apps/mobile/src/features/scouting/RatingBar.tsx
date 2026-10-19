import { ATTRIBUTE_MAX } from "@rsc/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";

interface Props {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

/** A 1-10 rating: ten tappable segments filled up to the value; tapping the value again clears it. */
export function RatingBar({ label, value, onChange }: Props) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.value, { color: value ? colors.primary : colors.textMuted }]}>
          {value ?? "-"}
        </Text>
      </View>
      <View style={styles.bar}>
        {Array.from({ length: ATTRIBUTE_MAX }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${n}`}
            accessibilityState={{ selected: value === n }}
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() => onChange(value === n ? undefined : n)}
            style={[
              styles.seg,
              {
                backgroundColor:
                  value !== undefined && n <= value ? colors.primary : colors.surfaceAlt,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
  head: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: fontSize.sm, fontWeight: "600" },
  value: { fontSize: fontSize.sm, fontWeight: "800" },
  bar: { flexDirection: "row", gap: 4 },
  seg: { flex: 1, height: 22, borderRadius: radius.sm / 2 },
});
