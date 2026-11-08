import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { useMe } from "../src/auth/session";
import { openAllowedLink, PROD_APK_URL, PROD_WEB_URL } from "../src/features/help/links";
import { useIsStaging } from "../src/features/help/useIsStaging";
import { BackBar } from "../src/ui/BackBar";
import { ListGroup, ListRow } from "../src/ui/ListGroup";
import { Screen } from "../src/ui/Screen";
import { Body, Title } from "../src/ui/Text";

/**
 * Staging only: where to get the production app (the club's "SFF RSC"). Only fixed https
 * addresses open (see `links.ts`); nothing here reads a tester code or any secret.
 */
export default function ProdApp() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMe();
  const staging = useIsStaging();
  if (me.data === null || (Platform.OS !== "web" && !staging)) return <Redirect href="/" />;
  return (
    <Screen>
      <BackBar onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <Title>{t("prodApp.title")}</Title>
      <Body muted>{t("prodApp.hint")}</Body>
      <ListGroup>
        <ListRow
          icon="globe-outline"
          title={t("prodApp.web")}
          subtitle={PROD_WEB_URL.replace("https://", "")}
          onPress={() => openAllowedLink(PROD_WEB_URL)}
        />
        <ListRow
          icon="logo-android"
          title={t("prodApp.apk")}
          subtitle={t("prodApp.apkHint")}
          onPress={() => openAllowedLink(PROD_APK_URL)}
        />
      </ListGroup>
      <Body muted>{t("prodApp.ios")}</Body>
      <Body muted>{t("prodApp.security")}</Body>
    </Screen>
  );
}
