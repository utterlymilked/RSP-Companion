import { StyleSheet, Text, View } from "react-native";
import { fontSize, spacing, useColors } from "../theme";
import { Segmented } from "./Segmented";
import { Select, type SelectOption } from "./Select";

interface Props<T extends string> {
  label: string;
  options: SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Shown in the select while nothing is chosen. */
  placeholder?: string;
}

/**
 * A labelled single choice that picks its control from the options (docs/UI_GUIDELINES.md):
 * a segmented control when 2-5 short options fit side by side on a phone, otherwise a select
 * (searchable from SEARCH_FROM options). Never a wall of chips or buttons.
 */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder,
}: Props<T>) {
  const colors = useColors();
  if (!fitsInline(options)) {
    return (
      <Select
        label={label}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    );
  }
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Segmented kind="radio" label={label} options={options} value={value} onChange={onChange} />
    </View>
  );
}

/** Usable width of a segmented control on a 360 pt phone (16 pt gutters, 3 pt track padding). */
const TRACK = 360 - 2 * spacing.md - 6;
/** Rough width of one character at the segment's 14 pt bold font. */
const CHAR = 7.5;

/**
 * Whether options read well as segments on the narrowest phone: at most 5 (Apple HIG, Material
 * 3), no word cut and each label on at most two lines. Short numeric scales (1-10) also fit.
 */
export function fitsInline(options: { label: string; hint?: string; disabled?: boolean }[]) {
  const n = options.length;
  if (n < 2 || options.some((o) => o.hint || o.disabled)) return false;
  if (n <= 10 && options.every((o) => o.label.length <= 2)) return true;
  if (n > 5) return false;
  const perLine = Math.floor(((TRACK - 3 * (n - 1)) / n - 8) / CHAR);
  return options.every(
    (o) => o.label.length <= 2 * perLine && o.label.split(/\s+/).every((w) => w.length <= perLine),
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: "600" },
});
