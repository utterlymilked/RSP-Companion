import { StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { fontSize, radius, spacing, touchTarget, useColors } from "../theme";

interface Props
  extends Pick<
    TextInputProps,
    | "value"
    | "onChangeText"
    | "secureTextEntry"
    | "autoComplete"
    | "keyboardType"
    | "onSubmitEditing"
  > {
  label: string;
  error?: string | null;
}

/** A labelled input. Email and password fields never auto-capitalise or auto-correct. */
export function TextField({ label, error, ...input }: Props) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
          },
        ]}
        {...input}
      />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: "600" },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
  },
  error: { fontSize: fontSize.sm },
});
