import { CONSENT_KINDS, type ConsentKind } from "@rsc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { dayOf } from "../../src/features/bookings/time";
import { shareExport } from "../../src/features/privacy/export";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { Choice } from "../../src/ui/Choice";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";

type Notice = { tone: "error" | "success"; key: string };

/**
 * Privacy of one person: consents (given by the person, a guardian, or recorded by the
 * office from a paper form), a copy of their data, and erasure (requested by the person or
 * guardian, carried out by the office).
 */
export default function PersonPrivacy() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const me = useMe().data;
  const permissions = me?.permissions ?? [];
  const office = permissions.includes("privacy.manage");
  const canRecord = permissions.includes("consents.write");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [grantor, setGrantor] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["privacy", personId, "consents"],
    queryFn: async () =>
      jsonOrThrow(await api.privacy.people[":personId"].consents.$get({ param: { personId } })),
  });
  const subjects = useQuery({
    queryKey: ["privacy", "subjects"],
    queryFn: async () => jsonOrThrow(await api.privacy.subjects.$get()),
  });
  const own = !!subjects.data?.subjects.some((s) => s.id === personId);
  const minor = status.data?.minor ?? false;
  // Who may sign: a minor's guardians, or the adult themself.
  const guardians = useQuery({
    queryKey: ["person", personId, "guardians"],
    enabled: minor && canRecord,
    queryFn: async () =>
      jsonOrThrow(await api.people[":personId"].guardians.$get({ param: { personId } })),
  });
  const grantorOptions = minor
    ? (guardians.data?.guardians ?? []).map((g) => ({
        value: (g.guardian as { id: string }).id,
        label: (g.guardian as { fullName: string }).fullName,
      }))
    : [];
  // In the app people sign in their own name; the office picks who signed the paper form.
  const grantedBy = canRecord ? (minor ? grantor : personId) : (me?.personId ?? null);

  const done = (key: string) => () => {
    setNotice({ tone: "success", key });
    queryClient.invalidateQueries({ queryKey: ["privacy"] });
  };
  const failed = (error: unknown) => setNotice({ tone: "error", key: errorKey(error) });

  const give = useMutation({
    mutationFn: async (kind: ConsentKind) =>
      jsonOrThrow(
        await api.privacy.people[":personId"].consents.$post({
          param: { personId },
          json: {
            kind,
            grantedByPersonId: grantedBy ?? "",
            grantedOn: dayOf(new Date().toISOString()),
          },
        }),
      ),
    onSuccess: done("privacy.consentGiven"),
    onError: failed,
  });
  const withdraw = useMutation({
    mutationFn: async (kind: ConsentKind) =>
      jsonOrThrow(
        await api.privacy.people[":personId"].consents[":kind"].revoke.$post({
          param: { personId, kind },
        }),
      ),
    onSuccess: done("privacy.consentWithdrawn"),
    onError: failed,
  });
  const exportData = useMutation({
    mutationFn: () => shareExport(personId),
    onError: failed,
  });
  const requestErasure = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.privacy.requests.$post({ json: { personId, kind: "erasure", message: null } }),
      ),
    onSuccess: done("privacy.erasureRequested"),
    onError: failed,
  });
  const erase = useMutation({
    mutationFn: async () =>
      jsonOrThrow(
        await api.privacy.people[":personId"].erase.$post({ param: { personId }, json: {} }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries();
      router.back();
    },
    onError: (error) => {
      setConfirmErase(false);
      failed(error);
    },
  });

  if (status.isPending) return <Centered />;
  const canChange = canRecord || own;
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("privacy.title")}</Title>
      {status.isError ? <Message tone="error">{t(errorKey(status.error))}</Message> : null}
      {notice ? <Message tone={notice.tone}>{t(notice.key)}</Message> : null}
      {status.data ? (
        <>
          <Body muted>{t(minor ? "privacy.minorHint" : "privacy.adultHint")}</Body>
          {canRecord && minor && grantorOptions.length > 0 ? (
            <Choice
              label={t("privacy.signedBy")}
              options={grantorOptions}
              value={grantor}
              onChange={setGrantor}
            />
          ) : null}
          {CONSENT_KINDS.map((kind) => {
            const consent = status.data.consents.find((c) => c.kind === kind);
            const given = !!consent?.given;
            return (
              <ListItem
                key={kind}
                title={t(`consentKind.${kind}`)}
                subtitle={
                  given
                    ? t("privacy.givenBy", {
                        name: consent?.grantedByName ?? "—",
                        date: consent?.grantedOn ?? "",
                      })
                    : t("privacy.notGiven")
                }
                trailing={canChange ? t(given ? "privacy.withdraw" : "privacy.give") : undefined}
                onPress={
                  canChange
                    ? () => {
                        setNotice(null);
                        if (given) withdraw.mutate(kind);
                        else if (!grantedBy)
                          setNotice({ tone: "error", key: "privacy.pickSigner" });
                        else give.mutate(kind);
                      }
                    : undefined
                }
              />
            );
          })}
        </>
      ) : null}
      {own || office ? (
        <>
          <Body muted>{t("privacy.yourData")}</Body>
          <Button
            label={t("privacy.export")}
            variant="secondary"
            busy={exportData.isPending}
            onPress={() => exportData.mutate()}
          />
        </>
      ) : null}
      {own && !office ? (
        <Button
          label={t("privacy.requestErasure")}
          variant="secondary"
          busy={requestErasure.isPending}
          onPress={() => requestErasure.mutate()}
        />
      ) : null}
      {office ? (
        confirmErase ? (
          <>
            <Message tone="error">{t("privacy.eraseWarning")}</Message>
            <Button
              label={t("privacy.eraseConfirm")}
              busy={erase.isPending}
              onPress={() => erase.mutate()}
            />
            <Button
              label={t("common.cancel")}
              variant="secondary"
              onPress={() => setConfirmErase(false)}
            />
          </>
        ) : (
          <Button
            label={t("privacy.erase")}
            variant="secondary"
            onPress={() => setConfirmErase(true)}
          />
        )
      ) : null}
    </Screen>
  );
}
