import { ROLES, type Role } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { errorKey, jsonOrThrow } from "../../errors";
import { Section } from "../../ui/Section";
import { MultiSelect } from "../../ui/Select";
import { Body, Message } from "../../ui/Text";
import { showToast } from "../../ui/Toast";

/** Roles that can be made approvers: club staff, not people who only use the app. */
const CANDIDATES = ROLES.filter(
  (r) =>
    !["athlete", "guardian", "member", "tester"].includes(r) && r !== "admin" && r !== "developer",
);

/**
 * Admin setting: which roles confirm, move and cancel bookings. Direção is always included.
 * Everyone else with booking rights only requests, so the club can change who approves
 * without a new release.
 */
export function ApproverSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings", "bookings"],
    queryFn: async () => jsonOrThrow(await api.settings.bookings.$get()),
  });
  const save = useMutation({
    mutationFn: async (approverRoles: Role[]) =>
      jsonOrThrow(await api.settings.bookings.$put({ json: { approverRoles } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      showToast(t("bookingSettings.saved"));
    },
    onError: (error) => showToast(t(errorKey(error)), "error"),
  });
  const chosen = (settings.data?.approverRoles ?? []).filter(
    (r) => r !== "admin" && r !== "developer",
  );
  return (
    <Section title={t("bookingSettings.title")}>
      <Body muted>{t("bookingSettings.intro")}</Body>
      {settings.isError ? <Message tone="error">{t(errorKey(settings.error))}</Message> : null}
      {settings.data ? (
        <MultiSelect
          icon="checkmark-done-outline"
          label={t("bookingSettings.approvers")}
          placeholder={t("bookingSettings.onlyDirecao")}
          values={chosen}
          onChange={(roles) => !save.isPending && save.mutate(roles)}
          options={CANDIDATES.map((role) => ({ value: role, label: t(`roles.${role}`) }))}
        />
      ) : null}
    </Section>
  );
}
