import {
  AGREEMENTS,
  CONTACT_VIA,
  CONTACT_WITH,
  FRAMINGS,
  OBSERVATION_SETTINGS,
  OBSERVATION_SOURCES,
  ORG_TYPES,
  PROSPECT_ESCALOES,
  REPORT_RECOMMENDATIONS,
  type ReportDetails,
  type ReportRecommendation,
  SUBMITTER_ROLES,
} from "@rsc/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Choice } from "../../ui/Choice";
import { MultiSelect, Select } from "../../ui/Select";
import { Body, Title } from "../../ui/Text";
import { TextField } from "../../ui/TextField";
import { ClubSelect } from "./ClubSelect";

interface Props {
  details: ReportDetails;
  onChange: (next: ReportDetails) => void;
  recommendation: ReportRecommendation | null;
  onRecommendation: (value: ReportRecommendation) => void;
}

const grades = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => {
    const v = String(from + i);
    return { value: v, label: v };
  });

/**
 * The rest of the club's scouting form (docs/SCOUTING_MODEL.md): the context of the
 * observation, the club's own grades, and the contact made, in three blocks so that none of
 * it has to be filled in to save a report.
 */
export function ReportDetailsForm({ details, onChange, recommendation, onRecommendation }: Props) {
  const { t } = useTranslation();
  const [showContact, setShowContact] = useState(details.contactMade != null);
  const set = <K extends keyof ReportDetails>(key: K, value: ReportDetails[K]) =>
    onChange({ ...details, [key]: value });
  const options = <T extends string>(group: string, values: readonly T[]) =>
    values.map((v) => ({ value: v, label: t(`scoutingModel.form.${group}.${v}`) }));
  const num = (v: number | null | undefined) => (v == null ? null : String(v));

  return (
    <>
      <Title>{t("scoutingModel.ui.sectionContext")}</Title>
      <Card>
        <TextField
          label={t("scoutingModel.ui.observedTime")}
          value={details.observedTime ?? ""}
          onChangeText={(v) => set("observedTime", v === "" ? null : v)}
          keyboardType="numbers-and-punctuation"
        />
        <Choice
          label={t("scoutingModel.ui.framing")}
          value={details.framing ?? null}
          onChange={(v) => set("framing", v)}
          options={options("framing", FRAMINGS)}
        />
        <Select
          label={t("scoutingModel.ui.orgType")}
          value={details.orgType ?? null}
          onChange={(v) => set("orgType", v)}
          options={options("orgType", ORG_TYPES)}
        />
        <ClubSelect
          label={t("scoutingModel.ui.orgName")}
          value={details.orgName ?? ""}
          onChange={(v) => set("orgName", v)}
        />
        <Select
          label={t("scoutingModel.ui.escalao")}
          value={details.escalao ?? null}
          onChange={(v) => set("escalao", v)}
          options={PROSPECT_ESCALOES.map((e) => ({ value: e, label: t(`escalao.${e}`) }))}
        />
        <Choice
          label={t("scoutingModel.ui.source")}
          value={details.source ?? null}
          onChange={(v) => set("source", v)}
          options={options("source", OBSERVATION_SOURCES)}
        />
        <Select
          label={t("scoutingModel.ui.setting")}
          value={details.setting ?? null}
          onChange={(v) => set("setting", v)}
          options={options("setting", OBSERVATION_SETTINGS)}
        />
        <Select
          label={t("scoutingModel.ui.submitterRole")}
          value={details.submitterRole ?? null}
          onChange={(v) => set("submitterRole", v)}
          options={options("submitterRole", SUBMITTER_ROLES)}
        />
      </Card>

      <Title>{t("scoutingModel.ui.sectionGrades")}</Title>
      <Card>
        <Choice
          label={t("scoutingModel.ui.relativeHeight")}
          value={num(details.relativeHeight)}
          onChange={(v) => set("relativeHeight", Number(v))}
          options={grades(1, 5)}
        />
        <Choice
          label={t("scoutingModel.ui.goalIndex")}
          value={num(details.goalIndex)}
          onChange={(v) => set("goalIndex", Number(v))}
          options={grades(0, 5)}
        />
        <Choice
          label={t("scoutingModel.ui.differentiation")}
          value={num(details.differentiation)}
          onChange={(v) => set("differentiation", Number(v))}
          options={grades(1, 5)}
        />
        <Select
          label={t("scoutingModel.ui.recommendation")}
          value={recommendation}
          onChange={onRecommendation}
          options={REPORT_RECOMMENDATIONS.map((r) => ({
            value: r,
            label: t(`scoutingModel.recommendation.${r}`),
          }))}
        />
      </Card>

      <Title>{t("scoutingModel.ui.sectionContact")}</Title>
      {showContact ? (
        <Card>
          <Body muted>{t("scoutingModel.ui.contactHint")}</Body>
          <Choice
            label={t("scoutingModel.ui.contactMade")}
            value={details.contactMade == null ? null : details.contactMade ? "yes" : "no"}
            onChange={(v) => set("contactMade", v === "yes")}
            options={[
              { value: "yes", label: t("common.yes") },
              { value: "no", label: t("common.no") },
            ]}
          />
          {details.contactMade ? (
            <>
              <MultiSelect
                label={t("scoutingModel.ui.contactWith")}
                values={details.contactWith ?? []}
                onChange={(v) => set("contactWith", v)}
                options={options("contactWith", CONTACT_WITH)}
              />
              <MultiSelect
                label={t("scoutingModel.ui.contactVia")}
                values={details.contactVia ?? []}
                onChange={(v) => set("contactVia", v)}
                options={options("contactVia", CONTACT_VIA)}
              />
            </>
          ) : null}
          <Choice
            label={t("scoutingModel.ui.reactionLevel")}
            value={num(details.reactionLevel)}
            onChange={(v) => set("reactionLevel", Number(v))}
            options={grades(1, 5)}
          />
          <Select
            label={t("scoutingModel.ui.agreement")}
            value={details.agreement ?? null}
            onChange={(v) => set("agreement", v)}
            options={options("agreement", AGREEMENTS)}
          />
        </Card>
      ) : (
        <Button
          variant="secondary"
          label={t("scoutingModel.ui.show")}
          onPress={() => setShowContact(true)}
        />
      )}
    </>
  );
}
