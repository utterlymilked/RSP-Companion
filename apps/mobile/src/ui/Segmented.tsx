import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { elevation, fontSize, radius, useColors } from "../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface Props<T extends string> {
  label: string;
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (value: T) => void;
}

/** A segmented control: a few views of the same thing (plan, day, week…), one selected. */
export function Segmented<T extends string>({ label, options, value, onChange }: Props<T>) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[styles.track, { backgroundColor: colors.surfaceAlt }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const fg = selected ? colors.primary : colors.textMuted;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && [styles.selected, { backgroundColor: colors.surface }],
              pressed && !selected && { opacity: 0.7 },
            ]}
          >
            {option.icon ? <Ionicons name={option.icon} size={18} color={fg} /> : null}
            <Text numberOfLines={1} style={[styles.text, { color: fg }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: radius.md, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
  },
  selected: elevation,
  text: { fontSize: fontSize.xs, fontWeight: "700" },
});
