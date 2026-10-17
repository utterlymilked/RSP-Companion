import { PITCH_DIVISIONS } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { ApproverSettings } from "../../src/features/bookings/ApproverSettings";
import type { SpaceSummary } from "../../src/features/bookings/occupancy";
import { DivisionPreview } from "../../src/features/spaces/DivisionPreview";
import { canOpenTab } from "../../src/navigation";
import { fontSize, spacing, useColors } from "../../src/theme";
import { Badge } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Centered } from "../../src/ui/Centered";
import { Screen } from "../../src/ui/Screen";
import { Section } from "../../src/ui/Section";
import { MultiSelect } from "../../src/ui/Select";
import { Body, Message } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";
import { showToast } from "../../src/ui/Toast";

/**
 * Fields and spaces of the complex (facilities.write): which pitches can be booked in parts.
 * The layout is data, not code: changes apply to the booking flow at once.
 */
export default function Spaces() {
  const { t } = useTranslation();
  const permissions = useMe().data?.permissions ?? [];
  const allowed = canOpenTab("spaces", permissions);
  const queryClient = useQueryClient();
  const facilities = useQuery({
    queryKey: ["facilities"],
    enabled: allowed,
    queryFn: async () => jsonOrThrow(await api.facilities.$get()),
  });
  const save = useMutation({
    mutationFn: async (v: { id: string; json: Record<string, unknown> }) =>
      jsonOrThrow(
        await api.facilities.spaces[":spaceId"].$patch({
          param: { spaceId: v.id },
          json: v.json as never,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["facilities"] });
      showToast(t("spaces.saved"));
    },
    onError: (error) => showToast(t(errorKey(error)), "error"),
  });

  if (!allowed) return <Redirect href="/" />;
  if (facilities.isPending) return <Centered />;
  const all = (facilities.data?.spaces ?? []) as SpaceSummary[];
  const home = facilities.data?.venues.find((v) => v.kind === "home") ?? facilities.data?.venues[0];
  const wholes = all.filter((s) => !s.parentId && s.active && s.componentIds.length === 0);
  const fields = wholes.filter((s) => s.kind === "field");
  return (
    <Screen>
      {facilities.isError ? <Message tone="error">{t(errorKey(facilities.error))}</Message> : null}
      <Body muted>{t("spaces.intro")}</Body>
      <Section title={t("spaces.fields")}>
        {fields.map((field) => (
          <FieldCard
            key={field.id}
            field={field}
            parts={all.filter((s) => s.parentId === field.id && s.active).length}
            saving={save.isPending}
            onDivisions={(divisions) => save.mutate({ id: field.id, json: { divisions } })}
          />
        ))}
      </Section>
      {permissions.includes("users.manage") ? <ApproverSettings /> : null}
      {home ? (
        <NewField
          venueId={home.id}
          existing={all.map((s) => s.name.toLowerCase())}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["facilities"] })}
        />
      ) : null}
    </Screen>
  );
}

function FieldCard({
  field,
  parts,
  saving,
  onDivisions,
}: {
  field: SpaceSummary;
  parts: number;
  saving: boolean;
  onDivisions: (divisions: number[]) => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const divisions = [...field.divisions].sort();
  return (
    <Card>
      <View style={styles.head}>
        <Text style={[styles.name, { color: colors.text }]}>{field.name}</Text>
        <Badge
          label={
            divisions.length ? t("spaces.partsCount", { count: parts }) : t("spaces.wholeOnly")
          }
          tone={divisions.length ? "primary" : "neutral"}
        />
      </View>
      <MultiSelect
        icon="grid-outline"
        label={t("spaces.divisions")}
        placeholder={t("spaces.wholeOnly")}
        values={divisions.map(String)}
        onChange={(values) => !saving && onDivisions(values.map(Number).sort())}
        options={PITCH_DIVISIONS.map((n) => ({
          value: String(n),
          label: t(`spaces.division${n}`),
        }))}
      />
      <DivisionPreview divisions={divisions} label={(n) => t(`spaces.division${n}Row`)} />
      {divisions.length > 0 ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t("spaces.overlapHint")}</Text>
      ) : null}
    </Card>
  );
}

function NewField({
  venueId,
  existing,
  onCreated,
}: {
  venueId: string;
  existing: string[];
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [divisions, setDivisions] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.facilities.spaces.$post({
          json: {
            venueId,
            name: name.trim(),
            kind: "field",
            capacity: null,
            componentIds: [],
            divisions: divisions.map(Number).sort(),
          } as never,
        }),
      ),
    onSuccess: () => {
      setName("");
      setDivisions([]);
      onCreated();
      showToast(t("spaces.created"));
    },
    onError: (error) => showToast(t(errorKey(error)), "error"),
  });
  const taken = existing.includes(name.trim().toLowerCase());
  return (
    <Section title={t("spaces.newField")}>
      <Card>
        <TextField label={t("spaces.name")} value={name} onChangeText={setName} />
        {taken ? <Message tone="error">{t("spaces.nameTaken")}</Message> : null}
        <MultiSelect
          icon="grid-outline"
          label={t("spaces.divisions")}
          placeholder={t("spaces.wholeOnly")}
          values={divisions}
          onChange={setDivisions}
          options={PITCH_DIVISIONS.map((n) => ({
            value: String(n),
            label: t(`spaces.division${n}`),
          }))}
        />
        <Button
          icon="add-circle-outline"
          label={t("spaces.add")}
          disabled={!name.trim() || taken}
          busy={create.isPending}
          onPress={() => create.mutate()}
        />
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  name: { fontSize: fontSize.lg, fontWeight: "700", flex: 1 },
  hint: { fontSize: fontSize.xs },
});
