import type { LinkSuggestion } from "@rsc/shared";
import { isValidNif } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../api";
import { ApiRequestError, errorKey, jsonOrThrow } from "../../errors";
import { fontSize, spacing, useColors } from "../../theme";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { ListItem } from "../../ui/ListItem";
import { Body, Message } from "../../ui/Text";
import { TextField } from "../../ui/TextField";
import { showToast } from "../../ui/Toast";

interface Props {
  prospectId: string;
  nif: string | null;
  person: { id: string; fullName: string; identityCode: string } | null;
  canWrite: boolean;
}

/** Link a scouted athlete to a club person: shown, suggested by name, forced by NIF. */
export function ProspectLink({ prospectId, nif, person, canWrite }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [nifText, setNifText] = useState(nif ?? "");
  const [pending, setPending] = useState<{ fullName: string; identityCode: string } | null>(null);
  const q = search.trim();
  const suggestions = useQuery({
    queryKey: ["scouting", "suggestions", prospectId, q],
    enabled: !person && (q.length === 0 || q.length >= 2),
    queryFn: async () =>
      jsonOrThrow(
        await api.scouting.prospects[":prospectId"]["link-suggestions"].$get({
          param: { prospectId },
          query: q ? { q } : {},
        }),
      ),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["scouting"] });
    await queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
  };
  const patch = useMutation({
    mutationFn: async (json: {
      personId?: string | null;
      nif?: string | null;
      confirmLink?: boolean;
    }) =>
      jsonOrThrow(
        await api.scouting.prospects[":prospectId"].$patch({ param: { prospectId }, json }),
      ),
    onSuccess: async (_d, vars) => {
      setPending(null);
      showToast(
        t(
          vars.personId === null
            ? "scoutingModel.ui.unlinkSuccess"
            : "scoutingModel.ui.linkSuccess",
        ),
      );
      await refresh();
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === "link_confirmation_required") {
        const found = (
          error.issues as { person?: { fullName: string; identityCode: string } } | undefined
        )?.person;
        if (found) setPending(found);
      }
    },
  });
  const nifOk = nifText.trim() === "" || isValidNif(nifText.replace(/\s/g, ""));
  const error = patch.error && !pending ? patch.error : null;

  return (
    <View style={styles.stack}>
      <Card>
        <Text style={[styles.heading, { color: colors.text }]}>
          {t("scoutingModel.ui.linkTitle")}
        </Text>
        <Body muted>{t("scoutingModel.ui.linkExplain")}</Body>
        {person ? (
          <>
            <ListItem
              title={t("scoutingModel.ui.linkedTo", { name: person.fullName })}
              subtitle={t("scoutingModel.ui.linkedCode", { code: person.identityCode })}
              onPress={() =>
                router.push({ pathname: "/person/[personId]", params: { personId: person.id } })
              }
            />
            {canWrite ? (
              <Button
                variant="secondary"
                label={t("scoutingModel.ui.unlink")}
                busy={patch.isPending}
                onPress={() => patch.mutate({ personId: null })}
              />
            ) : null}
          </>
        ) : null}
      </Card>

      {canWrite ? (
        <Card>
          <TextField
            label={t("scoutingModel.ui.nif")}
            value={nifText}
            onChangeText={setNifText}
            keyboardType="number-pad"
          />
          <Body muted>{t("scoutingModel.ui.nifHint")}</Body>
          {!nifOk ? <Message tone="error">{t("scoutingModel.ui.nifInvalid")}</Message> : null}
          <Button
            variant="secondary"
            label={t("common.save")}
            disabled={!nifOk || nifText.trim() === (nif ?? "")}
            busy={patch.isPending && !pending}
            onPress={() => patch.mutate({ nif: nifText.trim() === "" ? null : nifText })}
          />
        </Card>
      ) : null}

      {pending ? (
        <Card style={{ borderColor: colors.warning, borderWidth: 2 }}>
          <Text style={[styles.heading, { color: colors.warning }]}>
            {t("scoutingModel.ui.confirmTitle", { name: pending.fullName })}
          </Text>
          <Body>{t("scoutingModel.ui.confirmBody", { code: pending.identityCode })}</Body>
          <Button
            label={t("scoutingModel.ui.confirmAction")}
            busy={patch.isPending}
            onPress={() => patch.mutate({ nif: nifText, confirmLink: true })}
          />
          <Button
            variant="secondary"
            label={t("scoutingModel.ui.cancel")}
            onPress={() => setPending(null)}
          />
        </Card>
      ) : null}

      {!person && canWrite ? (
        <Card>
          <Text style={[styles.heading, { color: colors.text }]}>
            {t("scoutingModel.ui.suggestions")}
          </Text>
          <TextField
            label={t("scoutingModel.ui.searchPerson")}
            value={search}
            onChangeText={setSearch}
          />
          {suggestions.data && suggestions.data.suggestions.length === 0 ? (
            <Body muted>{t("scoutingModel.ui.noSuggestions")}</Body>
          ) : null}
          {suggestions.data?.suggestions.map((s: LinkSuggestion) => (
            <ListItem
              key={s.personId}
              title={s.fullName}
              subtitle={[
                s.reason === "nif"
                  ? t("scoutingModel.ui.nifMatch")
                  : t("scoutingModel.ui.nameMatch"),
                s.birthYearMatch ? t("scoutingModel.ui.yearMatch") : null,
                s.identityCode,
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={`${Math.round(s.score * 100)}%`}
              onPress={() => patch.mutate({ personId: s.personId })}
            />
          ))}
        </Card>
      ) : null}
      {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  heading: { fontSize: fontSize.md, fontWeight: "700" },
});
