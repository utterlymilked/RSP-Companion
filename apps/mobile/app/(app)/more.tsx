import { type Href, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { useMe } from "../../src/auth/session";
import { moreItems } from "../../src/navigation";
import { fontSize, spacing, useColors } from "../../src/theme";
import { Avatar } from "../../src/ui/Avatar";
import { LanguageSwitch } from "../../src/ui/LanguageSwitch";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Section } from "../../src/ui/Section";
import { Tile, TileGrid } from "../../src/ui/Tile";

/** Everything that is not in the bottom bar, grouped, plus the account and the language. */
export default function More() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const me = useMe().data;
  const { club, management } = moreItems(me?.permissions ?? [], me?.modules);
  const go = (href: string) => () => router.push(href as Href);
  return (
    <Screen>
      {me ? (
        <ListItem
          leading={<Avatar name={me.user.name} size={48} />}
          title={me.user.name}
          subtitle={me.user.email}
          onPress={go("/account")}
        />
      ) : null}
      {club.length > 0 ? (
        <Section title={t("more.club")}>
          <TileGrid>
            {club.map((item) => (
              <Tile
                key={item.key}
                icon={item.icon as never}
                label={t(`more.items.${item.key}`)}
                onPress={go(item.href)}
              />
            ))}
          </TileGrid>
        </Section>
      ) : null}
      {management.length > 0 ? (
        <Section title={t("more.management")}>
          <TileGrid>
            {management.map((item) => (
              <Tile
                key={item.key}
                icon={item.icon as never}
                label={t(`more.items.${item.key}`)}
                onPress={go(item.href)}
              />
            ))}
          </TileGrid>
        </Section>
      ) : null}
      <Section title={t("more.settings")}>
        <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text }]}>{t("account.language")}</Text>
          <LanguageSwitch />
        </View>
        <ListItem icon="person-circle-outline" title={t("tabs.account")} onPress={go("/account")} />
        <ListItem
          icon="shield-checkmark-outline"
          title={t("privacyNotice.title")}
          onPress={go("/privacy")}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: { fontSize: fontSize.md, fontWeight: "600" },
});
