import { SCOPED_ROLE_FUNCTIONS, type StaffFunction, type UserDetail } from "@rsc/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { api } from "../../api";
import { errorKey, jsonOrThrow } from "../../errors";
import { spacing } from "../../theme";
import { Button } from "../../ui/Button";
import { ListItem } from "../../ui/ListItem";
import { Section } from "../../ui/Section";
import { Select } from "../../ui/Select";
import { Body, Message } from "../../ui/Text";
import { type ScopeValue, scopeIds, useScopeOptions } from "./scopes";

const FUNCTIONS: StaffFunction[] = [
  ...SCOPED_ROLE_FUNCTIONS.coach,
  ...SCOPED_ROLE_FUNCTIONS.team_manager,
];

/**
 * The teams and classes a coach or delegado works with: the current staff assignments of the
 * user's person. A role says what they may do; these say where (ADR 0027). A person can have
 * any number of them.
 */
export function CoachingTeams({
  user,
  onChange,
}: {
  user: UserDetail;
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const scopes = useScopeOptions();
  const [place, setPlace] = useState<ScopeValue | null>(null);
  const [fn, setFn] = useState<StaffFunction>("head_coach");

  const add = useMutation({
    mutationFn: async () => {
      if (!user.personId || !place) throw new Error("incomplete");
      const ids = scopeIds(place);
      const target = ids.teamId
        ? scopes.teams.find((x) => x.id === ids.teamId)
        : scopes.classes.find((x) => x.id === ids.classId);
      if (!target) throw new Error("unknown place");
      return jsonOrThrow(
        await api["staff-assignments"].$post({
          json: {
            personId: user.personId,
            seasonId: target.seasonId,
            organisationId: target.organisationId,
            function: fn,
            ...ids,
          },
        }),
      );
    },
    onSuccess: async () => {
      setPlace(null);
      await onChange();
    },
  });
  const remove = useMutation({
    mutationFn: async (assignmentId: string) => {
      const res = await api["staff-assignments"][":assignmentId"].$delete({
        param: { assignmentId },
      });
      if (!res.ok) throw await res.json();
    },
    onSuccess: onChange,
  });
  const error = add.error ?? remove.error;

  return (
    <Section title={t("users.coaching.title")}>
      <Body muted>{t("users.coaching.hint")}</Body>
      {!user.personId ? (
        <Body>{t("users.coaching.needPerson")}</Body>
      ) : (
        <>
          {user.staffPlaces.length === 0 ? <Body>{t("users.coaching.none")}</Body> : null}
          {user.staffPlaces.map((p) => (
            <ListItem
              key={p.id}
              title={p.name}
              subtitle={t(`staffFunctions.${p.function}`)}
              footer={
                <Button
                  label={t("users.coaching.remove")}
                  accessibilityLabel={t("users.coaching.removeNamed", { name: p.name })}
                  variant="tertiary"
                  compact
                  busy={remove.isPending && remove.variables === p.id}
                  onPress={() => {
                    add.reset();
                    remove.mutate(p.id);
                  }}
                />
              }
            />
          ))}
          {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}
          <View style={{ gap: spacing.sm }}>
            <Select
              icon="people-outline"
              label={t("users.coaching.place")}
              value={place}
              onChange={setPlace}
              loading={scopes.loading}
              options={scopes.options.map((o) =>
                user.staffPlaces.some(
                  (p) => `${p.teamId ? "team" : "class"}:${p.teamId ?? p.classId}` === o.value,
                )
                  ? { ...o, disabled: true, hint: t("users.alreadyHeld") }
                  : o,
              )}
            />
            <Select
              label={t("users.coaching.function")}
              value={fn}
              onChange={setFn}
              options={FUNCTIONS.map((f) => ({ value: f, label: t(`staffFunctions.${f}`) }))}
            />
            <Button
              label={t("users.coaching.add")}
              icon="add"
              variant="secondary"
              disabled={!place}
              busy={add.isPending}
              onPress={() => {
                remove.reset();
                add.mutate();
              }}
            />
          </View>
        </>
      )}
    </Section>
  );
}
