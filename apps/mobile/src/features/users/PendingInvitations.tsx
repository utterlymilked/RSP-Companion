import type { PendingInvitation } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { api } from "../../api";
import { errorKey, jsonOrThrow } from "../../errors";
import { spacing } from "../../theme";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { ListItem } from "../../ui/ListItem";
import { Section } from "../../ui/Section";
import { Body, Message } from "../../ui/Text";
import { shortDate } from "./format";
import { useScopeOptions } from "./scopes";

/** Invitations not accepted yet, each with "send again" and "cancel". Hidden when none. */
export function PendingInvitations() {
  const { t } = useTranslation();
  const invitations = useQuery({
    queryKey: ["invitations"],
    queryFn: async () => jsonOrThrow(await api.invitations.$get()),
  });
  const list = invitations.data?.invitations ?? [];
  if (invitations.isError) return <Message tone="error">{t(errorKey(invitations.error))}</Message>;
  if (list.length === 0) return null;
  return (
    <Section title={t("users.pending.title")}>
      {list.map((invitation) => (
        <InvitationRow key={invitation.id} invitation={invitation} />
      ))}
    </Section>
  );
}

function InvitationRow({ invitation }: { invitation: PendingInvitation }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { nameOf } = useScopeOptions();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["invitations"] });
  const resend = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.invitations[":invitationId"].resend.$post({
          param: { invitationId: invitation.id },
        }),
      ),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.invitations[":invitationId"].$delete({ param: { invitationId: invitation.id } }),
      ),
    onSuccess: refresh,
  });
  const roles = invitation.roles
    .map((g) => {
      const where = g.teamId || g.classId ? nameOf(g) : null;
      return where ? `${t(`roles.${g.role}`)} (${where})` : t(`roles.${g.role}`);
    })
    .join(", ");
  const error = resend.error ?? revoke.error;
  return (
    <ListItem
      title={invitation.email}
      subtitle={[invitation.personName, roles].filter(Boolean).join(" · ")}
      footer={
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          {invitation.expired ? (
            <Badge tone="warning" label={t("users.pending.expired")} />
          ) : (
            <Body muted>
              {t("users.pending.expires", { date: shortDate(invitation.expiresAt) })}
            </Body>
          )}
          {resend.isSuccess ? <Message tone="success">{t("users.pending.resent")}</Message> : null}
          {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            <Button
              label={t("users.pending.resend")}
              variant="secondary"
              compact
              busy={resend.isPending}
              onPress={() => resend.mutate()}
            />
            <Button
              label={t("users.pending.revoke")}
              accessibilityLabel={t("users.pending.revokeFor", { email: invitation.email })}
              variant="tertiary"
              compact
              busy={revoke.isPending}
              onPress={() => revoke.mutate()}
            />
          </View>
        </View>
      }
    />
  );
}
