import { type Href, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMe } from "../../src/auth/session";
import { moreItems } from "../../src/navigation";
import { Avatar } from "../../src/ui/Avatar";
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
          <ListRow
            icon="person-circle-outline"
            title={t("tabs.account")}
            onPress={go("/account")}
          />
          <ListRow
            icon="shield-checkmark-outline"
            title={t("privacyNotice.title")}
            onPress={go("/privacy")}
          />
          <UpdateInfo />
        </ListGroup>
      </Section>
    </Screen>
  );
}
