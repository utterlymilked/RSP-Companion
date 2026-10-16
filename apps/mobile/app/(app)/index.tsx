import { useTranslation } from "react-i18next";
import { useMe } from "../../src/auth/session";
import { MyCallUps } from "../../src/features/callups/MyCallUps";
import { areasFor } from "../../src/navigation";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Title } from "../../src/ui/Text";

/** Role-based home: the user's roles and the areas their permissions open. */
export default function Home() {
  const { t } = useTranslation();
  const me = useMe().data;
  if (!me) return null;
  const areas = areasFor(me.permissions);
  return (
    <Screen>
      <Title>{t("home.greeting", { name: me.user.name })}</Title>
      <Body muted>{t("home.yourRoles")}</Body>
      {me.roles.length === 0 ? <Body>{t("home.noRoles")}</Body> : null}
      {me.roles.map((grant) => (
        <ListItem
          key={`${grant.role}:${grant.teamId ?? grant.classId ?? ""}`}
          title={t(`roles.${grant.role}`)}
        />
      ))}
      {areas.length > 0 ? <Body muted>{t("home.areas")}</Body> : null}
      {areas.map((area) => (
        <ListItem key={area} title={t(`home.area.${area}`)} trailing={t("home.comingSoon")} />
      ))}
      <MyCallUps />
    </Screen>
  );
}
