import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { elevation, fontSize, radius, spacing, touchTarget, useColors } from "../theme";
import { Sheet } from "./BottomSheet";
import { Button } from "./Button";

type IconName = ComponentProps<typeof Ionicons>["name"];

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** A second line under the label. */
  hint?: string;
  /** Shown greyed out, with `hint` saying why, rather than hidden (NN/g). */
  disabled?: boolean;
}

/** Lists this long get a search box: typing beats scrolling (NN/g). */
export const SEARCH_FROM = 8;
/** From this window width the list drops down under the field; narrower, it is a bottom sheet. */
const WIDE = 600;
const GAP = 4;
const EDGE = 12;
const DROPDOWN_MAX = 400;

interface Common<T extends string> {
  label: string;
  options: SelectOption<T>[];
  icon?: IconName;
  /** Shown while nothing is chosen. Defaults to "Escolher". */
  placeholder?: string;
  error?: string | null;
  /**
   * Remote search: the box is always shown and each change is passed here; the caller loads
   * matching `options`. Without it, lists of SEARCH_FROM or more are filtered locally.
   */
  onSearch?: (text: string) => void;
  /** The caller is loading options for the current search. */
  loading?: boolean;
  /** Shown when no option matches. Defaults to "Sem resultados." */
  emptyText?: string;
}

interface SelectProps<T extends string> extends Common<T> {
  value: T | null;
  onChange: (value: T) => void;
}

interface MultiSelectProps<T extends string> extends Common<T> {
  values: T[];
  onChange: (values: T[]) => void;
}

/**
 * One value from a list (a combo box): a field showing the choice that opens the options as a
 * dropdown under it on wide screens and as a bottom sheet on phones, searchable when long. Use
 * it whenever the options don't fit a `Segmented` control; see docs/UI_GUIDELINES.md.
 */
export function Select<T extends string>({ value, onChange, ...common }: SelectProps<T>) {
  const current = common.options.find((o) => o.value === value);
  return (
    <Picker
      {...common}
      multiple={false}
      chosen={value === null ? [] : [value]}
      display={current?.label}
      onPick={(picked, close) => {
        onChange(picked);
        close();
      }}
    />
  );
}

/** Several values from a list, with a checkbox per option (roles, teams, audiences). */
export function MultiSelect<T extends string>({
  values,
  onChange,
  ...common
}: MultiSelectProps<T>) {
  const labels = common.options.filter((o) => values.includes(o.value)).map((o) => o.label);
  return (
    <Picker
      {...common}
      multiple
      chosen={values}
      display={labels.length > 0 ? labels.join(", ") : undefined}
      onPick={(picked) =>
        onChange(values.includes(picked) ? values.filter((v) => v !== picked) : [...values, picked])
      }
      onClear={() => onChange([])}
    />
  );
}

interface PickerProps<T extends string> extends Common<T> {
  multiple: boolean;
  chosen: T[];
  display: string | undefined;
  onPick: (value: T, close: () => void) => void;
  onClear?: () => void;
}

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const NO_ANCHOR: Anchor = { x: 0, y: 0, width: 0, height: 0 };
/** The search box's own border shows focus, so the browser's outline would draw a second one. */
const webNoOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null;

function Picker<T extends string>({
  label,
  options,
  icon,
  placeholder,
  error,
  onSearch,
  loading,
  emptyText,
  multiple,
  chosen,
  display,
  onPick,
  onClear,
}: PickerProps<T>) {
  const { t } = useTranslation();
  const colors = useColors();
  const window = useWindowDimensions();
  const field = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const wide = window.width >= WIDE;
  const searchable = !!onSearch || options.length >= SEARCH_FROM;
  const shown = onSearch ? options : filterOptions(options, query);
  const text = display ?? placeholder ?? t("common.choose");

  const show = () => {
    setQuery("");
    setAnchor(null);
    setOpen(true);
    field.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };
  const close = () => {
    setOpen(false);
    if (onSearch && query) onSearch("");
  };
  const search = (value: string) => {
    setQuery(value);
    onSearch?.(value);
  };
  const pickFirst = () => {
    const first = shown.find((o) => !o.disabled);
    if (first && !multiple) onPick(first.value, close);
  };

  const list = (
    <>
      {searchable ? (
        <View style={[styles.search, { borderColor: focused ? colors.primary : colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            accessibilityLabel={t("common.search")}
            placeholder={t("common.search")}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={search}
            onSubmitEditing={pickFirst}
            // Desktop only: on a phone focusing would cover the list with the keyboard.
            autoFocus={Platform.OS === "web" && wide}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text }, webNoOutline]}
          />
          {loading ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
        </View>
      ) : null}
      <ScrollView
        accessibilityRole={multiple ? "list" : "radiogroup"}
        accessibilityLabel={label}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
      >
        {shown.map((option) => (
          <Row
            key={option.value}
            option={option}
            multiple={multiple}
            checked={chosen.includes(option.value)}
            onPress={() => onPick(option.value, close)}
          />
        ))}
        {shown.length === 0 && !loading ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {emptyText ?? t("common.none")}
          </Text>
        ) : null}
      </ScrollView>
      {multiple ? (
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.count, { color: colors.textMuted }]}>
            {t("common.selected", { count: chosen.length })}
          </Text>
          {chosen.length > 0 && onClear ? (
            <Button compact variant="ghost" label={t("common.clear")} onPress={onClear} />
          ) : null}
          <Button compact label={t("common.done")} onPress={close} />
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Pressable
        ref={field}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${text}`}
        accessibilityState={{ expanded: open }}
        onPress={show}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : open ? colors.primary : colors.border,
          },
          pressed && { opacity: 0.8 },
        ]}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.primary} /> : null}
        <Text
          numberOfLines={multiple ? 2 : 1}
          style={[styles.value, { color: display ? colors.text : colors.textMuted }]}
        >
          {text}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
      </Pressable>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType={wide ? "none" : "fade"}
        onRequestClose={close}
      >
        {wide ? (
          // Until the field is measured the panel is laid out but not shown, so it never jumps.
          <View style={[styles.fill, !anchor && styles.hidden]}>
            <Dropdown anchor={anchor ?? NO_ANCHOR} window={window} onClose={close}>
              {list}
            </Dropdown>
          </View>
        ) : (
          <Sheet label={label} onClose={close}>
            {list}
          </Sheet>
        )}
      </Modal>
    </View>
  );
}

function Row<T extends string>({
  option,
  multiple,
  checked,
  onPress,
}: {
  option: SelectOption<T>;
  multiple: boolean;
  checked: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const fg = option.disabled ? colors.textMuted : checked ? colors.primary : colors.text;
  const mark = multiple ? (checked ? "checkbox" : "square-outline") : checked ? "checkmark" : null;
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked, disabled: option.disabled }}
      accessibilityLabel={option.label}
      accessibilityHint={option.hint}
      disabled={option.disabled}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.option,
        checked && !multiple && { backgroundColor: colors.primarySoft },
        (pressed || hovered) && !option.disabled && { backgroundColor: colors.surfaceAlt },
        option.disabled && { opacity: 0.55 },
      ]}
    >
      {multiple && mark ? <Ionicons name={mark} size={22} color={fg} /> : null}
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, { color: fg }]}>{option.label}</Text>
        {option.hint ? (
          <Text style={[styles.optionHint, { color: colors.textMuted }]}>{option.hint}</Text>
        ) : null}
      </View>
      {!multiple && mark ? <Ionicons name={mark} size={20} color={fg} /> : null}
    </Pressable>
  );
}

/** Wide screens: a panel under the field (or above it when there's no room below). */
function Dropdown({
  anchor,
  window,
  onClose,
  children,
}: {
  anchor: Anchor;
  window: { width: number; height: number };
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const below = window.height - (anchor.y + anchor.height) - GAP - EDGE;
  const above = anchor.y - GAP - EDGE;
  const up = below < 260 && above > below;
  const width = Math.min(Math.max(anchor.width, 280), window.width - 2 * EDGE);
  const left = Math.max(EDGE, Math.min(anchor.x, window.width - width - EDGE));
  return (
    <>
      <Pressable accessibilityLabel={t("common.close")} style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.dropdown,
          {
            left,
            width,
            maxHeight: Math.min(DROPDOWN_MAX, up ? above : below),
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
          up ? { bottom: window.height - anchor.y + GAP } : { top: anchor.y + anchor.height + GAP },
        ]}
      >
        {children}
      </View>
    </>
  );
}

/** Case- and accent-insensitive match on the label ("medico" finds "Médico"). */
export function filterOptions<T extends { label: string; hint?: string }>(
  options: T[],
  query: string,
): T[] {
  const q = fold(query.trim());
  if (!q) return options;
  return options.filter((o) => fold(`${o.label} ${o.hint ?? ""}`).includes(q));
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: "600" },
  field: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  value: { flex: 1, fontSize: fontSize.md },
  error: { fontSize: fontSize.sm },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  fill: { flex: 1 },
  hidden: { opacity: 0 },
  dropdown: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    overflow: "hidden",
    ...elevation,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    minHeight: 40,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, paddingVertical: spacing.sm },
  list: { flexGrow: 0, flexShrink: 1, paddingHorizontal: spacing.xs },
  option: {
    minHeight: touchTarget,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: fontSize.md, fontWeight: "500" },
  optionHint: { fontSize: fontSize.sm },
  empty: { padding: spacing.md, fontSize: fontSize.sm },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  count: { flex: 1, fontSize: fontSize.sm },
});
