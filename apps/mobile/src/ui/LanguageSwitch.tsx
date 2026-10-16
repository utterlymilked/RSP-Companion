import { LOCALES } from "@rsc/shared";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { setLocale } from "../i18n";
import { fontSize, radius, spacing, useColors } from "../theme";

const SHORT = { "pt-PT": "PT", en: "EN" } as const;

/** A compact PT | EN switch; the choice is saved on the device. */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t("account.language")}
      style={[styles.group, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      {LOCALES.map((locale) => {
        const selected = i18n.language === locale;
        return (
          <Pressable
            key={locale}
            accessibilityRole="radio"
            accessibilityLabel={t(`languages.${locale}`)}
            accessibilityState={{ selected }}
            onPress={() => setLocale(locale)}
            style={[styles.option, selected && { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.text, { color: selected ? colors.onPrimary : colors.text }]}>
              {SHORT[locale]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    alignSelf: "flex-end",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 2,
  },
  option: {
    minWidth: 44,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontSize: fontSize.sm, fontWeight: "700" },
});
