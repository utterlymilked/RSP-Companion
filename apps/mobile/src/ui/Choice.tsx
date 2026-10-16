import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../theme";

interface Props {
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
  /** One scrolling row instead of wrapping lines (long lists such as teams). */
  scroll?: boolean;
}

/** A labelled single choice shown as wrapping chips (short lists such as status or space). */
export function Choice({ label, options, value, onChange, scroll }: Props) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Chips scroll={scroll} label={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </Chips>
    </View>
  );
}

function Chips({
  scroll,
  label,
  children,
}: {
  scroll?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (!scroll) {
    return (
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={styles.row}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  chipText: { fontSize: fontSize.sm, fontWeight: "600" },
});
