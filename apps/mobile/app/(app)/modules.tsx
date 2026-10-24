import { MODULE_TIERS, type ModuleId, type ModuleStatus, type ModuleTier } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, Switch, View } from "react-native";
import { api } from "../../src/api";
import { refreshSession, useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { canOpenTab } from "../../src/navigation";
import { spacing, useColors } from "../../src/theme";
import { Badge, type Tone } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Centered } from "../../src/ui/Centered";
import { Screen } from "../../src/ui/Screen";
import { Section } from "../../src/ui/Section";
import { Body, Message } from "../../src/ui/Text";
import { showToast } from "../../src/ui/Toast";

const TIER_TONE: Record<ModuleTier, Tone> = {
  release: "success",
  beta: "warning",
  alpha: "danger",
};

/** Developer screen (modules.manage): every module by tier, with version, dependencies and a switch. */
export default function Modules() {
  const { t } = useTranslation();
  const colors = useColors();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const allowed = canOpenTab("modules", me?.permissions ?? []);
  const query = useQuery({
    queryKey: ["modules"],
    enabled: allowed,
    queryFn: async () => jsonOrThrow(await api.modules.$get()),
  });
  const change = useMutation({
    mutationFn: async (input: { id: ModuleId; enabled: boolean }) =>
      jsonOrThrow(
        await api.modules[":id"].$put({
          param: { id: input.id },
          json: { enabled: input.enabled },
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(["modules"], data);
      void refreshSession(queryClient); // the menus follow
    },
    onError: (error) => showToast(t(errorKey(error))),
  });

  if (!allowed) return <Redirect href="/" />;
  if (query.isPending) return <Centered />;
  if (query.isError) {
    return (
      <Screen>
        <Message tone="error">{t(errorKey(query.error))}</Message>
        <Button label={t("common.retry")} onPress={() => query.refetch()} />
      </Screen>
    );
  }
  const { stack, modules } = query.data;
  const label = (id: ModuleId) => t(`modules.items.${id}.name`);
  return (
    <Screen>
      <Body muted>{t("modules.intro", { stack: t(`modules.stacks.${stack}`) })}</Body>
      {MODULE_TIERS.map((tier) => {
        const rows = modules.filter((m: ModuleStatus) => m.tier === tier);
        return (
          <Section key={tier} title={t(`modules.tiers.${tier}`)}>
            <Body muted>{t(`modules.tierHint.${tier}`)}</Body>
            {rows.map((m) => (
              <Card key={m.id}>
                <View style={styles.row}>
                  <View style={styles.texts}>
                    <Body>{label(m.id)}</Body>
                    <Body muted>{t(`modules.items.${m.id}.description`)}</Body>
                    <View style={styles.badges}>
                      <Badge label={`v${m.version}`} />
                      <Badge label={t(`modules.tiers.${m.tier}`)} tone={TIER_TONE[m.tier]} />
                      {!m.available ? (
                        <Badge
                          label={t(
                            m.version === "0.0.0" ? "modules.planned" : "modules.notInBuild",
                          )}
                        />
                      ) : null}
                    </View>
                    {m.deps.length > 0 ? (
                      <Body muted>
                        {t("modules.needs", { list: m.deps.map(label).join(", ") })}
                      </Body>
                    ) : null}
                  </View>
                  <Switch
                    accessibilityLabel={label(m.id)}
                    value={m.enabled}
                    disabled={!m.toggleable || change.isPending}
                    onValueChange={(enabled) => change.mutate({ id: m.id, enabled })}
                    trackColor={{ true: colors.primary, false: colors.border }}
                  />
                </View>
              </Card>
            ))}
          </Section>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  texts: { flex: 1, gap: spacing.xs },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
});
