import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";

/** One person: general details always, contacts and guardians per the reader's tier. */
export default function PersonDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const person = useQuery({
    queryKey: ["person", personId],
    queryFn: async () => jsonOrThrow(await api.people[":personId"].$get({ param: { personId } })),
  });
  const guardians = useQuery({
    queryKey: ["person", personId, "guardians"],
    queryFn: async () =>
      jsonOrThrow(await api.people[":personId"].guardians.$get({ param: { personId } })),
  });
  if (person.isPending) return <Centered />;
  const data = person.data;
  const details =
    data?.tier === "personal"
      ? ([
          [t("people.birthDate"), (data.person as { birthDate?: string | null }).birthDate],
          [t("people.email"), (data.person as { email?: string | null }).email],
          [t("people.phone"), (data.person as { phone?: string | null }).phone],
          [
            t("people.federationId"),
            (data.person as { federationId?: string | null }).federationId,
          ],
        ] as const)
      : [];
  return (
    <Screen>
      <Button label={t("common.back")} variant="secondary" onPress={() => router.back()} />
      {person.isError ? <Message tone="error">{t(errorKey(person.error))}</Message> : null}
      {data ? (
        <>
          <Title>{data.person.fullName}</Title>
          {data.tier === "general" ? <Body muted>{t("people.generalOnly")}</Body> : null}
          {details.map(([label, value]) =>
            value ? <ListItem key={label} title={value} subtitle={label} /> : null,
          )}
        </>
      ) : null}
      {guardians.data && guardians.data.guardians.length > 0 ? (
        <>
          <Body muted>{t("people.guardians")}</Body>
          {guardians.data.guardians.map((g) => (
            <ListItem
              key={g.id}
              title={(g.guardian as { fullName: string }).fullName}
              subtitle={
                [
                  (g.guardian as { phone?: string | null }).phone,
                  (g.guardian as { email?: string | null }).email,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              trailing={[
                t(`relationships.${g.relationship}`),
                g.isPrimary ? t("people.primary") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
