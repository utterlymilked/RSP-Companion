import {
  DOCUMENT_KINDS,
  type DocumentKind,
  expiryStatus,
  localDateString,
  toLisbon,
} from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import {
  absoluteUrl,
  cameraAvailable,
  type PickedFile,
  pickFile,
  takePhoto,
  uploadDocument,
} from "../../src/features/documents/upload";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { DateTimeField } from "../../src/ui/DateTimeField";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";
import { TextField } from "../../src/ui/TextField";

const today = () => localDateString(toLisbon(new Date()));
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Documents of one person: medical exam, federation registration, ID. Everyone with access
 * sees kind and expiry; opening or adding a file needs the right the API checks (medical
 * exams: medical roles only).
 */
export default function PersonDocuments() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const permissions = useMe().data?.permissions ?? [];
  const uploadable = DOCUMENT_KINDS.filter((kind) =>
    kind === "medical_exam"
      ? permissions.includes("health.medical.write")
      : permissions.includes("documents.write"),
  );
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [kind, setKind] = useState<DocumentKind | undefined>(uploadable[0]);
  const [form, setForm] = useState({ title: "", issuedOn: "", expiresOn: "" });
  const [submitted, setSubmitted] = useState(false);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const list = useQuery({
    queryKey: ["documents", personId],
    queryFn: async () =>
      jsonOrThrow(await api.documents.people[":personId"].$get({ param: { personId } })),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!picked || !kind) return;
      await uploadDocument(personId, picked, { kind, ...form });
    },
    onSuccess: async () => {
      setPicked(null);
      setSubmitted(false);
      setForm({ title: "", issuedOn: "", expiresOn: "" });
      await refresh();
    },
  });
  const open = useMutation({
    mutationFn: async (documentId: string) => {
      const { url } = await jsonOrThrow(
        await api.documents[":documentId"].url.$get({ param: { documentId } }),
      );
      await Linking.openURL(absoluteUrl(url));
    },
  });
  const remove = useMutation({
    mutationFn: async (documentId: string) => {
      const res = await api.documents[":documentId"].$delete({ param: { documentId } });
      if (!res.ok) await jsonOrThrow(res as never);
    },
    onSuccess: refresh,
  });
  const choose = async (pick: () => Promise<PickedFile | null>) => {
    const file = await pick();
    if (file) setPicked(file);
  };

  if (list.isPending) return <Centered />;
  const error = list.error ?? upload.error ?? open.error ?? remove.error;
  const valid =
    picked && kind && [form.issuedOn, form.expiresOn].every((d) => d === "" || DAY.test(d));
  const canUpload = uploadable.length > 0 && list.data?.canUpload !== false;

  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("documents.title")}</Title>
      {error ? <Message tone="error">{t(errorKey(error))}</Message> : null}

      {list.data?.documents.length === 0 ? <Body>{t("documents.empty")}</Body> : null}
      {list.data?.documents.map((d) => {
        const status = expiryStatus(d.expiresOn, today());
        return (
          <ListItem
            key={d.id}
            title={`${t(`documents.kinds.${d.kind}`)}${d.title ? ` · ${d.title}` : ""}`}
            subtitle={
              d.expiresOn
                ? t(`documents.status.${status}`, { date: d.expiresOn })
                : t("documents.noExpiry")
            }
            onPress={() => open.mutate(d.id)}
          />
        );
      })}
      {list.data?.documents.map((d) =>
        uploadable.includes(d.kind) ? (
          <Button
            key={d.id}
            label={t("documents.remove", { kind: t(`documents.kinds.${d.kind}`) })}
            variant="secondary"
            busy={remove.isPending && remove.variables === d.id}
            onPress={() => remove.mutate(d.id)}
          />
        ) : null,
      )}

      {canUpload ? (
        <>
          <Body muted>{t("documents.add")}</Body>
          <Button
            label={t("documents.pickFile")}
            variant="secondary"
            onPress={() => choose(pickFile)}
          />
          {cameraAvailable ? (
            <Button
              label={t("documents.takePhoto")}
              variant="secondary"
              onPress={() => choose(takePhoto)}
            />
          ) : null}
          {picked ? (
            <>
              <Body>{picked.name}</Body>
              <Choice
                label={t("documents.kind")}
                value={kind ?? null}
                onChange={(v) => setKind(v as DocumentKind)}
                options={uploadable.map((k) => ({ value: k, label: t(`documents.kinds.${k}`) }))}
              />
              <TextField
                label={t("documents.titleLabel")}
                value={form.title}
                onChangeText={set("title")}
              />
              <DateTimeField
                label={t("documents.issuedOn")}
                value={form.issuedOn}
                onChangeText={set("issuedOn")}
                mode="date"
                clearable
              />
              <DateTimeField
                label={t("documents.expiresOn")}
                value={form.expiresOn}
                onChangeText={set("expiresOn")}
                mode="date"
                clearable
              />
              {submitted && !valid ? (
                <Message tone="error">{t("documents.needDates")}</Message>
              ) : null}
              <Button
                label={t("documents.upload")}
                busy={upload.isPending}
                onPress={() => {
                  setSubmitted(true);
                  if (valid) upload.mutate();
                }}
              />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
