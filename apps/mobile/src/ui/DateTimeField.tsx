import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, touchTarget, useColors } from "../theme";

export interface DateTimeFieldProps {
  label: string;
  /** "YYYY-MM-DD" for `date`, "HH:MM" for `time`; "" when empty. */
  value: string;
  onChangeText: (value: string) => void;
  mode: "date" | "time";
  /** Optional fields show a clear button once a value is set. */
  clearable?: boolean;
  error?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Parses the field value into a local Date (today / 00:00 when empty or invalid). */
export function toPickerDate(value: string, mode: "date" | "time"): Date {
  const now = new Date();
  if (mode === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : now;
  }
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  return m ? new Date(2000, 0, 1, Number(m[1]), Number(m[2])) : new Date(2000, 0, 1, 0, 0);
}

export function fromPickerDate(date: Date, mode: "date" | "time"): string {
  return mode === "date"
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A labelled date or time input that opens the platform's calendar / clock picker instead
 * of asking people to type. Values stay plain strings so forms and zod schemas are unchanged.
 * The web build uses the browser's native input (DateTimeField.web.tsx).
 */
export function DateTimeField({
  label,
  value,
  onChangeText,
  mode,
  clearable,
  error,
}: DateTimeFieldProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const onPick = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === "set" && date) onChangeText(fromPickerDate(date, mode));
  };

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={styles.row}>
        {Platform.OS === "ios" ? (
          <DateTimePicker
            accessibilityLabel={label}
            value={toPickerDate(value, mode)}
            mode={mode}
            display="compact"
            locale="pt-PT"
            onChange={onPick}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() =>
              DateTimePickerAndroid.open({
                value: toPickerDate(value, mode),
                mode,
                is24Hour: true,
                onChange: onPick,
              })
            }
            style={[
              styles.input,
              {
                backgroundColor: colors.surface,
                borderColor: error ? colors.danger : colors.border,
              },
            ]}
          >
            <Text style={{ color: value ? colors.text : colors.textMuted, fontSize: fontSize.md }}>
              {value || t("common.choose")}
            </Text>
          </Pressable>
        )}
        {clearable && value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.clear")}
            onPress={() => onChangeText("")}
            style={styles.clear}
          >
            <Text style={{ color: colors.accent, fontSize: fontSize.md }}>{t("common.clear")}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  input: {
    flex: 1,
    minHeight: touchTarget,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  clear: { minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.sm },
  error: { fontSize: fontSize.sm },
});
