import {
  DOMINANT_FEET,
  GUARDIAN_RELATIONS,
  PROSPECT_CONTEXTS,
  PROSPECT_ESCALOES,
  PROSPECT_ID_TYPES,
  PROSPECT_POSITIONS,
} from "@rsc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../api";
import { errorKey, jsonOrThrow } from "../../errors";
import { fontSize, spacing, useColors } from "../../theme";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Choice } from "../../ui/Choice";
import { DateTimeField } from "../../ui/DateTimeField";
import { MultiSelect, Select } from "../../ui/Select";
import { Body, Message } from "../../ui/Text";
import { TextField } from "../../ui/TextField";
import { showToast } from "../../ui/Toast";
import { ClubSelect } from "./ClubSelect";

type Kind = "text" | "multiline" | "number" | "date" | "phone" | "email" | "club" | "positions";
type Field =
  | { key: string; label: string; kind: Kind }
  | { key: string; label: string; kind: "select"; group: string; options: readonly string[] }
  | { key: "authorisation"; label: string; kind: "authorisation" };

interface Section {
  id: string;
  fields: Field[];
}

const text = (key: string, label = key, kind: Kind = "text"): Field => ({ key, label, kind });

/** The athlete's personal area, by category: what the club's request form asks, grouped. */
const SECTIONS: Section[] = [
  {
    id: "identity",
    fields: [
      text("nickname"),
      text("birthDate", "birthDate", "date"),
      {
        key: "idType",
        label: "idType",
        kind: "select",
        group: "prospectIdType",
        options: PROSPECT_ID_TYPES,
      },
      text("nationality"),
      text("birthplace"),
      text("postalCode"),
      text("area"),
    ],
  },
  {
    id: "sporting",
    fields: [
      text("currentClub", "clubNow", "club"),
      text("positions", "positions", "positions"),
      {
        key: "dominantFoot",
        label: "dominantFoot",
        kind: "select",
        group: "scoutingModel.form.dominantFoot",
        options: DOMINANT_FEET,
      },
      {
        key: "targetEscalao",
        label: "targetEscalao",
        kind: "select",
        group: "escalao",
        options: PROSPECT_ESCALOES,
      },
      {
        key: "context",
        label: "context",
        kind: "select",
        group: "prospectContext",
        options: PROSPECT_CONTEXTS,
      },
      text("heightCm", "height", "number"),
      text("seasonsPlayed", "seasons", "number"),
    ],
  },
  {
    id: "contact",
    fields: [
      text("guardianName"),
      {
        key: "guardianRelation",
        label: "guardianRelation",
        kind: "select",
        group: "guardianRelation",
        options: GUARDIAN_RELATIONS,
      },
      text("guardianPhone", "guardianPhone", "phone"),
      text("guardianEmail", "guardianEmail", "email"),
      text("ownPhone", "ownPhone", "phone"),
      text("ownEmail", "ownEmail", "email"),
      text("ownContact"),
      text("socialUrl"),
      text("mediaUrl"),
    ],
  },
  {
    id: "observation",
    fields: [
      text("preferredDate", "preferredDate", "date"),
      text("alternativeDate", "alternativeDate", "date"),
      text("trialDate", "trialDate", "date"),
      text("trialVenue"),
      { key: "authorisation", label: "authNeeded", kind: "authorisation" },
      text("motive", "motive", "multiline"),
      text("goal", "goal", "multiline"),
    ],
  },
  { id: "notes", fields: [text("notes", "notes", "multiline")] },
];

type Prospect = Record<string, unknown>;

const asText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** What a field holds, as one printable line (empty when unset). */
function display(
  t: (key: string, o?: Record<string, unknown>) => string,
  f: Field,
  p: Prospect,
): string {
  if (f.kind === "authorisation") {
    if (!p.clubAuthorisationNeeded) return "";
    return t(p.clubAuthorised ? "scoutingModel.ui.authGiven" : "scoutingModel.ui.authPending");
  }
  const v = p[f.key];
  if (f.kind === "select") return v ? t(`${f.group}.${v}`) : "";
  if (f.kind === "positions")
    return ((v as string[] | undefined) ?? []).map((x) => t(`prospectPosition.${x}`)).join(", ");
  if (f.key === "heightCm") return v ? `${v} cm` : "";
  return asText(v);
}

/** Sections of the athlete's sheet, each filled in on its own (the sheet is never one long form). */
export function ProspectSheet({
  prospectId,
  prospect,
  canWrite,
}: {
  prospectId: string;
  prospect: Prospect;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <View style={styles.stack}>
      {SECTIONS.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          prospectId={prospectId}
          prospect={prospect}
          canWrite={canWrite}
          editing={editing === section.id}
          onEdit={(on) => setEditing(on ? section.id : null)}
          t={t}
        />
      ))}
    </View>
  );
}

function SectionCard({
  section,
  prospectId,
  prospect,
  canWrite,
  editing,
  onEdit,
  t,
}: {
  section: Section;
  prospectId: string;
  prospect: Prospect;
  canWrite: boolean;
  editing: boolean;
  onEdit: (on: boolean) => void;
  t: (key: string, o?: Record<string, unknown>) => string;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const value = (key: string) => (key in draft ? draft[key] : initial(key));
  const initial = (key: string): unknown => {
    const v = prospect[key];
    if (key === "authorisation")
      return prospect.clubAuthorisationNeeded
        ? prospect.clubAuthorised
          ? "given"
          : "pending"
        : "no";
    if (key === "positions") return (v as string[] | undefined) ?? [];
    return key.endsWith("Date") ||
      ["idType", "targetEscalao", "context", "guardianRelation", "dominantFoot"].includes(key)
      ? (v ?? null)
      : asText(v);
  };
  const set = (key: string, v: unknown) => setDraft((d) => ({ ...d, [key]: v }));
  const num = (v: unknown) => (asText(v).trim() === "" ? null : Number(v));

  const filled = section.fields.filter((f) => display(t, f, prospect) !== "").length;
  const save = useMutation({
    mutationFn: async () => {
      const json: Record<string, unknown> = {};
      for (const f of section.fields) {
        if (!(f.key in draft)) continue;
        const v = draft[f.key];
        if (f.kind === "authorisation") {
          json.clubAuthorisationNeeded = v !== "no";
          json.clubAuthorised = v === "given";
        } else if (f.kind === "number") json[f.key] = num(v);
        else if (f.kind === "date") json[f.key] = v || null;
        else json[f.key] = v;
      }
      return jsonOrThrow(
        await api.scouting.prospects[":prospectId"].$patch({
          param: { prospectId },
          json: json as never,
        }),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scouting"] });
      await queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      showToast(t("scoutingModel.ui.sheetSaved"));
      setDraft({});
      onEdit(false);
    },
  });

  const control = (f: Field) => {
    const label = t(`scouting.${f.label}`);
    const v = value(f.key);
    switch (f.kind) {
      case "club":
        return (
          <ClubSelect key={f.key} label={label} value={asText(v)} onChange={(x) => set(f.key, x)} />
        );
      case "positions":
        return (
          <MultiSelect
            key={f.key}
            label={label}
            values={v as (typeof PROSPECT_POSITIONS)[number][]}
            onChange={(x) => set(f.key, x)}
            options={PROSPECT_POSITIONS.map((p) => ({
              value: p,
              label: t(`prospectPosition.${p}`),
            }))}
          />
        );
      case "select":
        return (
          <Select
            key={f.key}
            label={label}
            value={(v as string | null) ?? null}
            onChange={(x) => set(f.key, x)}
            options={f.options.map((o) => ({ value: o, label: t(`${f.group}.${o}`) }))}
          />
        );
      case "date":
        return (
          <DateTimeField
            key={f.key}
            mode="date"
            clearable
            label={label}
            value={asText(v)}
            onChangeText={(x) => set(f.key, x)}
          />
        );
      case "authorisation":
        return (
          <Choice
            key={f.key}
            label={label}
            value={asText(v)}
            onChange={(x) => set(f.key, x)}
            options={[
              { value: "no", label: t("scoutingModel.ui.authNo") },
              { value: "pending", label: t("scoutingModel.ui.authPending") },
              { value: "given", label: t("scoutingModel.ui.authGiven") },
            ]}
          />
        );
      default:
        return (
          <TextField
            key={f.key}
            label={label}
            value={asText(v)}
            onChangeText={(x) => set(f.key, x)}
            multiline={f.kind === "multiline"}
            keyboardType={
              f.kind === "number"
                ? "numeric"
                : f.kind === "phone"
                  ? "phone-pad"
                  : f.kind === "email"
                    ? "email-address"
                    : undefined
            }
          />
        );
    }
  };

  return (
    <Card>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t(`scoutingModel.ui.section.${section.id}`)}
        </Text>
        <Badge
          tone={filled === section.fields.length ? "success" : "neutral"}
          label={t("scoutingModel.ui.filled", { done: filled, total: section.fields.length })}
        />
      </View>
      {editing ? (
        <>
          {section.fields.map(control)}
          {save.isError ? <Message tone="error">{t(errorKey(save.error))}</Message> : null}
          <Button
            label={t("common.save")}
            busy={save.isPending}
            disabled={Object.keys(draft).length === 0}
            onPress={() => save.mutate()}
          />
          <Button
            variant="secondary"
            label={t("scoutingModel.ui.cancel")}
            onPress={() => {
              setDraft({});
              onEdit(false);
            }}
          />
        </>
      ) : (
        <>
          {section.fields.map((f) => {
            const shown = display(t, f, prospect);
            return (
              <View key={f.key} style={styles.row}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  {t(`scouting.${f.label}`)}
                </Text>
                <Text style={[styles.value, { color: shown ? colors.text : colors.textMuted }]}>
                  {shown || "-"}
                </Text>
              </View>
            );
          })}
          {canWrite ? (
            <Button
              variant="secondary"
              label={t("scoutingModel.ui.edit")}
              onPress={() => onEdit(true)}
            />
          ) : filled === 0 ? (
            <Body muted>{t("scoutingModel.ui.sectionEmpty")}</Body>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.md, fontWeight: "700" },
  row: { gap: 2 },
  label: { fontSize: fontSize.sm },
  value: { fontSize: fontSize.md },
});
