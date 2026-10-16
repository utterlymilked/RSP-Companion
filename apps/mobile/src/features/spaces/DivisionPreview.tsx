import { PITCH_UNITS, partSpan } from "@rsc/shared";
import { StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";

/**
 * A pitch drawn lengthways once per way it can be booked: the whole, then each division with
 * its parts side by side. Parts that sit above each other here are the ones that block each
 * other (a half and the thirds it touches).
 */
export function DivisionPreview({
  divisions,
  label,
}: {
  divisions: number[];
  /** Row title for a division, e.g. "Metades". */
  label: (count: number) => string;
}) {
  const colors = useColors();
  const rows = [1, ...divisions];
  return (
    <View style={styles.wrap}>
      {rows.map((n) => (
        <View key={n} style={styles.row}>
          <Text numberOfLines={1} style={[styles.label, { color: colors.textMuted }]}>
            {label(n)}
          </Text>
          <View
            style={[styles.bar, { borderColor: colors.pitchLine, backgroundColor: colors.turf }]}
          >
            {Array.from({ length: n }, (_, i) => {
              const { from, to } = partSpan(n, i + 1);
              return (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed parts
                  key={i}
                  style={[
                    styles.part,
                    {
                      flex: (to - from) / PITCH_UNITS,
                      borderLeftWidth: i === 0 ? 0 : 1.5,
                      borderLeftColor: colors.pitchLine,
                    },
                  ]}
                >
                  <Text style={[styles.mark, { color: colors.onTurf }]}>
                    {n === 1 ? "" : n === 2 ? String.fromCharCode(65 + i) : i + 1}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { width: 68, fontSize: fontSize.xs, fontWeight: "600" },
  bar: {
    flex: 1,
    flexDirection: "row",
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  part: { alignItems: "center", justifyContent: "center" },
  mark: { fontSize: fontSize.xs, fontWeight: "800" },
});
