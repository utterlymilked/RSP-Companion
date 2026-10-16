import { createInvitationSchema, isScopedRole, ROLES, type Role } from "@rsc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { api } from "../../api";
import { errorKey, jsonOrThrow } from "../../errors";
import { spacing } from "../../theme";
import { Button } from "../../ui/Button";
import { MultiSelect } from "../../ui/Select";
import { Body, Message, Title } from "../../ui/Text";
import { TextField } from "../../ui/TextField";

/** Roles that can be given here first; team roles last, greyed out. */
const ROLE_ORDER = [...ROLES].sort((a, b) => Number(isScopedRole(a)) - Number(isScopedRole(b)));

/**
 * Invites someone by email (users.manage). They get a link valid for 7 days to create their
 * account. Roles tied to one team or class (coach, delegado) are given later, from the team.
 */
export function InviteForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<Role[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const parsed = createInvitationSchema.safeParse({
    email,
    roles: picked.map((role) => ({ role })),
  });
  const emailOk = createInvitationSchema.shape.email.safeParse(email).success;
  const emailError = submitted && !emailOk ? t("users.invite.emailInvalid") : null;

  const invite = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.invitations.$post({ json: parsed.data }));
    },
    onSuccess: async () => {
      setEmail("");
      setPicked([]);
      setSubmitted(false);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  return (
    <View style={{ gap: spacing.md }}>
      <Title>{t("users.invite.title")}</Title>
      <Body muted>{t("users.invite.hint")}</Body>
      <TextField
        label={t("users.invite.email")}
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          invite.reset();
        }}
        keyboardType="email-address"
        error={emailError}
      />
      <MultiSelect
        label={t("users.invite.roles")}
        values={picked}
        onChange={(roles) => {
          setPicked(roles);
          invite.reset();
        }}
        options={ROLE_ORDER.map((role) => ({
          value: role,
          label: t(`roles.${role}`),
          // Coach and delegado belong to a team, so they are given from the team later.
          disabled: isScopedRole(role),
          hint: isScopedRole(role) ? t("users.invite.scopedHint") : undefined,
        }))}
        error={submitted && picked.length === 0 ? t("users.invite.rolesRequired") : null}
      />
      {invite.isError ? <Message tone="error">{t(errorKey(invite.error))}</Message> : null}
      {invite.isSuccess ? <Message tone="success">{t("users.invite.sent")}</Message> : null}
      <Button
        label={t("users.invite.send")}
        busy={invite.isPending}
        onPress={() => {
          setSubmitted(true);
          if (parsed.success) invite.mutate();
        }}
      />
    </View>
  );
}
