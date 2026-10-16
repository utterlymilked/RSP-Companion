import type { ImportKind, ImportReport, ImportRowResult } from "@rsc/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { errorKey } from "../../src/errors";
import {
  type PickedSheet,
  pickSpreadsheet,
  saveTemplate,
  sendImport,
} from "../../src/features/imports/files";
import { spacing } from "../../src/theme";
import { Badge, type Tone } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Section } from "../../src/ui/Section";
import { Body, Message } from "../../src/ui/Text";

const TONES: Record<ImportRowResult["status"], Tone> = {
  create: "success",
  update: "primary",
  unchanged: "neutral",
  error: "danger",
};
/** Rows shown besides the errors; a long file would otherwise bury them. */
const SHOWN_OK_ROWS = 30;

/** Imports players or teams from an Excel file: template, preview with errors, then apply. */
export default function ImportScreen() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ImportKind>("players");
  const [sheet, setSheet] = useState<PickedSheet | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const preview = useMutation({
    mutationFn: (file: PickedSheet) => sendImport(kind, file, false),
    onSuccess: setReport,
  });
  const apply = useMutation({
    mutationFn: () => sendImport(kind, sheet as PickedSheet, true),
    onSuccess: setReport,
  });
  const template = useMutation({ mutationFn: () => saveTemplate(kind) });

  const choose = async () => {
    const picked = await pickSpreadsheet();
    if (!picked) return;
    setSheet(picked);
    setReport(null);
    preview.mutate(picked);
  };
  const changeKind = (next: ImportKind) => {
    setKind(next);
    setSheet(null);
    setReport(null);
  };

  const error = preview.error ?? apply.error ?? template.error;
  const writable = report && !report.applied ? report.counts.create + report.counts.update : 0;
  const rows = report ? [...report.rows].sort((a, b) => rank(a) - rank(b) || a.line - b.line) : [];
  const shown = rows.filter((r, i) => r.status === "error" || i < SHOWN_OK_ROWS);

  return (
    <Screen>
      <Choice
        label={t("imports.kind")}
        value={kind}
        onChange={changeKind}
        options={[
          { value: "players", label: t("imports.players") },
          { value: "teams", label: t("imports.teams") },
        ]}
      />
      <Card>
        <Body>{t(`imports.help.${kind}`)}</Body>
        <Button
          label={t("imports.template")}
          icon="download-outline"
          variant="secondary"
          compact
          onPress={() => template.mutate()}
          busy={template.isPending}
        />
      </Card>
      <Button
        label={sheet ? t("imports.change") : t("imports.choose")}
        icon="document-outline"
        onPress={choose}
        busy={preview.isPending}
      />
      {sheet ? <Body muted>{sheet.name}</Body> : null}
      {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}

      {report ? (
        <>
          <Section title={t(report.applied ? "imports.done" : "imports.preview")}>
            <View style={styles.counts}>
              <Badge
                label={t("imports.counts.create", { count: report.counts.create })}
                tone="success"
              />
              <Badge
                label={t("imports.counts.update", { count: report.counts.update })}
                tone="primary"
              />
              <Badge label={t("imports.counts.unchanged", { count: report.counts.unchanged })} />
              <Badge
                label={t("imports.counts.error", { count: report.counts.error })}
                tone="danger"
              />
            </View>
          </Section>
          {report.applied ? <Message tone="success">{t("imports.applied")}</Message> : null}
          <View style={styles.rows}>
            {shown.map((row) => (
              <ListItem
                key={`${row.line}-${row.status}`}
                title={row.label ?? t("imports.file")}
                subtitle={
                  row.error
                    ? `${t("imports.row", { line: row.line })} · ${t(`imports.errors.${row.error}`, { defaultValue: row.error })}`
                    : [t("imports.row", { line: row.line }), row.identityCode]
                        .filter(Boolean)
                        .join(" · ")
                }
                footer={
                  <Badge label={t(`imports.status.${row.status}`)} tone={TONES[row.status]} />
                }
              />
            ))}
          </View>
          {rows.length > shown.length ? (
            <Body muted>{t("imports.more", { count: rows.length - shown.length })}</Body>
          ) : null}
          {!report.applied ? (
            <Button
              label={t("imports.apply", { count: writable })}
              onPress={() => apply.mutate()}
              busy={apply.isPending}
              disabled={writable === 0}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const rank = (r: ImportRowResult) => (r.status === "error" ? 0 : 1);

const styles = StyleSheet.create({
  counts: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  rows: { gap: spacing.sm },
});
