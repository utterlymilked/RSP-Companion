import { type Href, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Switch } from "react-native";
import { APPEARANCES, useAppearance } from "../../src/appearance";
import { useMe } from "../../src/auth/session";
import { useFeedbackSettings } from "../../src/features/feedback/preference";
import { useIsStaging } from "../../src/features/help/useIsStaging";
import { useBarPreference } from "../../src/features/navigation/barPreference";
import { barFor, moreItems } from "../../src/navigation";
import { useColors } from "../../src/theme";
import { Avatar } from "../../src/ui/Avatar";
import { Choice } from "../../src/ui/Choice";
import { LanguageSwitch } from "../../src/ui/LanguageSwitch";
import { ListGroup, ListRow } from "../../src/ui/ListGroup";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Section } from "../../src/ui/Section";
import { UpdateInfo } from "../../src/ui/UpdateInfo";

/** Everything that is not in the bottom bar, grouped, plus the account and the language. */
export default function More() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe().data;
  const colors = useColors();
  const { appearance, setAppearance } = useAppearance();
  const feedbackSettings = useFeedbackSettings();
  const staging = useIsStaging();
  const { saved } = useBarPreference(me?.user.id);
  const { bar } = barFor(saved, me?.permissions ?? [], me?.modules);
  const { club, management } = moreItems(me?.permissions ?? [], me?.modules, bar);
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
          <ListGroup>
            {club.map((item) => (
              <ListRow
                key={item.key}
                icon={item.icon as never}
                title={t(`more.items.${item.key}`)}
                onPress={go(item.href)}
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}
      {management.length > 0 ? (
        <Section title={t("more.management")}>
          <ListGroup>
            {management.map((item) => (
              <ListRow
                key={item.key}
                icon={item.icon as never}
                title={t(`more.items.${item.key}`)}
                onPress={go(item.href)}
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}
      <Section title={t("more.settings")}>
        <ListGroup>
          <ListRow
            icon="language-outline"
            title={t("account.language")}
            trailing={<LanguageSwitch />}
          />
          <ListRow icon="apps-outline" title={t("account.barEntry")} onPress={go("/bar")} />
          {me?.permissions.includes("feedback.submit") ? (
            <ListRow
              icon="chatbubble-ellipses-outline"
              title={t("account.feedbackWidget")}
              trailing={
                <Switch
                  accessibilityLabel={t("account.feedbackWidget")}
                  value={feedbackSettings.enabled}
                  onValueChange={feedbackSettings.setEnabled}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              }
            />
          ) : null}
          {staging ? (
            <ListRow
              icon="download-outline"
              title={t("more.items.prodApp")}
              onPress={go("/prod-app")}
            />
          ) : null}
          <UpdateInfo />
        </ListGroup>
        <Choice
          label={t("account.appearance")}
          options={APPEARANCES.map((value) => ({
            value,
            label: t(`account.appearances.${value}`),
          }))}
          value={appearance}
          onChange={setAppearance}
        />
      </Section>
    </Screen>
  );
}
