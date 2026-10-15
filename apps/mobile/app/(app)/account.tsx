import { LOCALES } from "@rsc/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut, useMe } from "../../src/auth/session";
import { setLocale } from "../../src/i18n";
import { Button } from "../../src/ui/Button";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Title } from "../../src/ui/Text";

export default function Account() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <Title>{me?.user.name ?? ""}</Title>
      {me ? <Body muted>{t("account.signedInAs", { email: me.user.email })}</Body> : null}
      <Body muted>{t("account.language")}</Body>
      {LOCALES.map((locale) => (
        <ListItem
          key={locale}
          title={t(`languages.${locale}`)}
          trailing={i18n.language === locale ? "✓" : undefined}
          selected={i18n.language === locale}
          onPress={() => setLocale(locale)}
        />
      ))}
      <Button
        label={t("auth.signOut")}
        variant="secondary"
        busy={busy}
        onPress={() => {
          setBusy(true);
          signOut(queryClient).finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}
