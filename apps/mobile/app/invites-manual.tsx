import { Redirect, useRouter } from "expo-router";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { useMe } from "../src/auth/session";
import { canOpenTab } from "../src/navigation";
import { BackBar } from "../src/ui/BackBar";
import { Screen } from "../src/ui/Screen";
import { Body, Title } from "../src/ui/Text";

/** Sections of the manual, in order; the text lives in i18n (`invitesManual.<key>`). */
const SECTIONS = [
  "who",
  "how",
  "roles",
  "person",
  "invitee",
  "pending",
  "problems",
  "signup",
] as const;

/** Manual "Convites": how to invite people and what happens next. Same access as the users screen. */
export default function InvitesManual() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe().data;
  if (me && !canOpenTab("users", me.permissions, me.modules)) return <Redirect href="/" />;
  return (
    <Screen>
      <BackBar onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <Title>{t("invitesManual.title")}</Title>
      <Body muted>{t("invitesManual.intro")}</Body>
      {SECTIONS.map((section) => (
        <Fragment key={section}>
          <Body style={{ fontWeight: "600" }}>{t(`invitesManual.${section}.title`)}</Body>
          <Body>{t(`invitesManual.${section}.body`)}</Body>
        </Fragment>
      ))}
    </Screen>
  );
}
