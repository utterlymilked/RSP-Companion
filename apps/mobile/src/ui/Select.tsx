import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { elevation, fontSize, radius, spacing, touchTarget, useColors } from "../theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface Props {
  label: string;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (value: string) => void;
  icon?: IconName;
  /** Shown while nothing is chosen. */
  placeholder?: string;
}

/**
 * One choice from a long list (spaces, teams) without a wall of chips: a compact field showing
 * the current value that opens a bottom sheet with the options.
 */
export function Select({ label, options, value, onChange, icon, placeholder }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder ?? "—"}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.8 },
        ]}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.primary} /> : null}
        <View style={styles.fieldText}>
          <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
          <Text
            numberOfLines={1}
            style={[styles.fieldValue, { color: current ? colors.text : colors.textMuted }]}
          >
            {current?.label ?? placeholder ?? "—"}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityLabel={label}
          style={[styles.backdrop, { backgroundColor: colors.backdrop }]}
          onPress={() => setOpen(false)}
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.text }]}>
            {label}
          </Text>
          <ScrollView accessibilityRole="radiogroup" style={styles.list}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    { borderBottomColor: colors.border },
                    selected && { backgroundColor: colors.primarySoft },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.optionText}>
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: selected ? colors.primary : colors.text },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {option.hint ? (
                      <Text style={[styles.optionHint, { color: colors.textMuted }]}>
                        {option.hint}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  fieldText: { flex: 1 },
  fieldLabel: { fontSize: fontSize.xs, fontWeight: "600" },
  fieldValue: { fontSize: fontSize.md, fontWeight: "700" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "75%",
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
    ...elevation,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2 },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  list: { paddingHorizontal: spacing.sm },
  option: {
    minHeight: touchTarget,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: fontSize.md, fontWeight: "600" },
  optionHint: { fontSize: fontSize.sm },
});
