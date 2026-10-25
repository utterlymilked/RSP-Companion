import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { elevation, fontSize, radius, touchTarget, useColors } from "../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface Props<T extends string> {
  label: string;
  options: { value: T; label: string; icon?: IconName }[];
  value: T | null;
  onChange: (value: T) => void;
  /**
   * tab: switches between views of the same thing (plan, day, week…).
   * radio: picks a value in a form or filter (used by `Choice`).
   */
  kind?: "tab" | "radio";
}

/**
 * A segmented control for 2-5 short options, all visible at once (Material 3 segmented
 * buttons, Apple HIG segmented controls). More options than that belong in a `Select`; see
 * docs/UI_GUIDELINES.md.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  kind = "tab",
}: Props<T>) {
  const colors = useColors();
  // Icons go on very narrow phones (320 pt) so five labels still fit uncut.
  const showIcons = useWindowDimensions().width >= 360 || options.length <= 3;
  return (
    <View
      accessibilityRole={kind === "tab" ? "tablist" : "radiogroup"}
      accessibilityLabel={label}
      style={[styles.track, { backgroundColor: colors.surfaceAlt }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const fg = selected ? colors.primary : colors.textMuted;
        return (
          <Pressable
            key={option.value}
            accessibilityRole={kind}
            accessibilityLabel={option.label}
            accessibilityState={kind === "tab" ? { selected } : { checked: selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && [styles.selected, { backgroundColor: colors.surface }],
              pressed && !selected && { opacity: 0.7 },
            ]}
          >
            {option.icon && showIcons ? <Ionicons name={option.icon} size={18} color={fg} /> : null}
            <Text
              numberOfLines={(option.icon && showIcons) || options.length >= 4 ? 1 : 2}
              adjustsFontSizeToFit={options.length >= 4}
              minimumFontScale={0.8}
              style={[
                (option.icon && showIcons) || options.length >= 4 ? styles.small : styles.text,
                { color: fg },
              ]}
            >
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
    minHeight: touchTarget,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
  },
  selected: elevation,
  small: { fontSize: fontSize.xs, fontWeight: "700", textAlign: "center" },
  text: { fontSize: fontSize.sm, fontWeight: "700", textAlign: "center" },
});
