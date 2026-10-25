import { createInvitationSchema, ROLES, type Role } from "@rsc/shared";
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
import { PersonPicker, type PickedPerson } from "./PersonPicker";

/** Roles an invitation can carry (the developer role is granted by the Ops task only). */
const INVITE_ROLES = ROLES.filter((r) => r !== "developer");

/**
 * Invites someone by email (users.manage). They get a link valid for 7 days to create their
 * account, with these roles and, when chosen, linked to their person record.
 */
export function InviteForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<Role[]>([]);
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const parsed = createInvitationSchema.safeParse({
    email,
    ...(person ? { personId: person.id } : {}),
    roles: picked.map((role) => ({ role })),
  });
  const emailOk = createInvitationSchema.shape.email.safeParse(email).success;
  const emailError = submitted && !emailOk ? t("users.invite.emailInvalid") : null;
  const noRoles = picked.length === 0;

  const invite = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.invitations.$post({ json: parsed.data }));
    },
    onSuccess: async () => {
      setEmail("");
      setPicked([]);
      setPerson(null);
      setSubmitted(false);
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
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
      <PersonPicker
        label={t("users.invite.person")}
        value={person}
        onChange={(p) => {
          setPerson(p);
          invite.reset();
        }}
      />
      {person ? (
        <Button
          label={t("users.invite.noPerson")}
          variant="tertiary"
          compact
          onPress={() => setPerson(null)}
        />
      ) : (
        <Body muted>{t("users.invite.personHint")}</Body>
      )}
      <MultiSelect
        label={t("users.invite.roles")}
        values={picked}
        onChange={(roles) => {
          setPicked(roles);
          invite.reset();
        }}
        options={INVITE_ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) }))}
        error={submitted && noRoles ? t("users.invite.rolesRequired") : null}
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
