import { useRouter } from "expo-router";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../src/ui/Button";
import { Screen } from "../../src/ui/Screen";
import { Body, Title } from "../../src/ui/Text";

/** Sections of the notice, in order; the text lives in i18n (`privacyNotice.<key>`). */
const NOTICE_SECTIONS = [
  "controller",
  "data",
  "purposes",
  "recipients",
  "retention",
  "rights",
  "contact",
] as const;

/**
 * The privacy notice, public (no sign-in) so the stores and the sign-in screen can link to
 * it at /privacy. Lists every processor, push services included (ADR 0004, ADR 0010).
 */
export default function PrivacyNotice() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen>
      <Button
        label={t("common.back")}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      />
      <Title>{t("privacyNotice.title")}</Title>
      <Body muted>{t("privacyNotice.updated")}</Body>
      {NOTICE_SECTIONS.map((section) => (
        <Fragment key={section}>
          <Body muted>{t(`privacyNotice.${section}.title`)}</Body>
          <Body>{t(`privacyNotice.${section}.body`)}</Body>
        </Fragment>
      ))}
    </Screen>
  );
}
