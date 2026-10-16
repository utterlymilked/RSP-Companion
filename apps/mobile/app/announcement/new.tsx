import { createAnnouncementSchema, hasPermission } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Button } from "../../src/ui/Button";
import { Choice } from "../../src/ui/Choice";
import { Screen } from "../../src/ui/Screen";
import { Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

const CLUB = "club";

/** Writes an announcement to the whole club (office) or to one team (also coaches, delegados). */
export default function NewAnnouncement() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const clubWide = !!me && hasPermission(me.roles, "announcements.write");
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => jsonOrThrow(await api.teams.$get({ query: {} })),
  });
  const [audience, setAudience] = useState(clubWide ? CLUB : "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const parsed = createAnnouncementSchema.safeParse({
    title,
    body,
    teamId: audience === CLUB || audience === "" ? null : audience,
  });
  const ready = parsed.success && audience !== "";
  const options = [
    ...(clubWide ? [{ value: CLUB, label: t("announcements.wholeClub") }] : []),
    ...(teams.data?.teams ?? []).map((team) => ({ value: team.id, label: team.name })),
  ];

  const send = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error("invalid");
      return jsonOrThrow(await api.announcements.$post({ json: parsed.data }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      router.back();
    },
  });

  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      <Title>{t("announcements.new")}</Title>
      <Choice
        label={t("announcements.audience")}
        value={audience}
        onChange={setAudience}
        options={options}
      />
      <TextField label={t("announcements.title")} value={title} onChangeText={setTitle} />
      <TextField label={t("announcements.body")} value={body} onChangeText={setBody} multiline />
      {submitted && !ready ? <Message tone="error">{t("announcements.incomplete")}</Message> : null}
      {send.isError ? <Message tone="error">{t(errorKey(send.error))}</Message> : null}
      <Button
        label={t("announcements.send")}
        busy={send.isPending}
        onPress={() => {
          setSubmitted(true);
          if (ready) send.mutate();
        }}
      />
    </Screen>
  );
}
