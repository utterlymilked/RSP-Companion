import { INCIDENT_STATUSES } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { clockTime, dayOf } from "../../src/features/bookings/time";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

/**
 * One incident. The office sets the status and the follow-up. An injury shows as a summary
 * to everyone except the clinical team and the reporter (ADR 0006).
 */
export default function IncidentDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { incidentId } = useLocalSearchParams<{ incidentId: string }>();
  const manages = !!useMe().data?.permissions.includes("incidents.manage");
  const [followUp, setFollowUp] = useState<string | null>(null);

  const incident = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: async () =>
      jsonOrThrow(await api.incidents[":incidentId"].$get({ param: { incidentId } })),
  });
  const update = useMutation({
    mutationFn: async (json: { status?: string; followUp?: string }) =>
      jsonOrThrow(
        await api.incidents[":incidentId"].$patch({ param: { incidentId }, json: json as never }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["incidents"] });
      await queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
    },
  });

  if (incident.isPending) return <Centered />;
  const i = incident.data?.incident;
  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      {incident.isError ? <Message tone="error">{t(errorKey(incident.error))}</Message> : null}
      {i ? (
        <>
          <Title>{t(`incidentType.${i.type}`)}</Title>
          <ListItem
            title={`${dayOf(i.occurredAt)} ${clockTime(i.occurredAt)}`}
            subtitle={i.place ?? undefined}
          />
          <ListItem title={t(`incidentStatus.${i.status}`)} subtitle={t("incidents.status")} />
          {i.view === "summary" ? (
            <Body muted>{t("incidents.restricted")}</Body>
          ) : (
            <>
              <Body>{i.description}</Body>
              {i.people.length > 0 ? <Body muted>{t("incidents.people")}</Body> : null}
              {i.people.map((p) => (
                <ListItem key={p.personId} title={p.fullName} />
              ))}
              {i.followUp ? (
                <>
                  <Body muted>{t("incidents.followUp")}</Body>
                  <Body>{i.followUp}</Body>
                </>
              ) : null}
            </>
          )}
          {manages ? (
            <>
              <Choice
                label={t("incidents.setStatus")}
                value={i.status}
                onChange={(status) => update.mutate({ status })}
                options={INCIDENT_STATUSES.map((s) => ({
                  value: s,
                  label: t(`incidentStatus.${s}`),
                }))}
              />
              <TextField
                label={t("incidents.followUp")}
                value={followUp ?? i.followUp ?? ""}
                onChangeText={setFollowUp}
              />
              <Button
                label={t("incidents.saveFollowUp")}
                variant="secondary"
                busy={update.isPending}
                onPress={() => update.mutate({ followUp: followUp ?? "" })}
              />
              {update.isError ? <Message tone="error">{t(errorKey(update.error))}</Message> : null}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
