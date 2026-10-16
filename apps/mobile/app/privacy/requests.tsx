import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { dayOf } from "../../src/features/bookings/time";
import { BackBar } from "../../src/ui/BackBar";
import { Button } from "../../src/ui/Button";
import { Centered } from "../../src/ui/Centered";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message, Title } from "../../src/ui/Text";

/** The office's queue of data requests (copy, erasure, rectification), open ones first. */
export default function PrivacyRequests() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const requests = useQuery({
    queryKey: ["privacy", "requests"],
    queryFn: async () => jsonOrThrow(await api.privacy.requests.$get({ query: {} })),
  });
  const resolve = useMutation({
    mutationFn: async (input: { requestId: string; status: "done" | "rejected" }) =>
      jsonOrThrow(
        await api.privacy.requests[":requestId"].resolve.$post({
          param: { requestId: input.requestId },
          json: { status: input.status, note: null },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["privacy", "requests"] }),
    onError: (e) => setError(errorKey(e)),
  });

  if (requests.isPending) return <Centered />;
  const list = requests.data?.requests ?? [];
  return (
    <Screen>
      <BackBar onPress={() => router.back()} />
      <Title>{t("privacy.requestsTitle")}</Title>
      {requests.isError ? <Message tone="error">{t(errorKey(requests.error))}</Message> : null}
      {error ? <Message tone="error">{t(error)}</Message> : null}
      {list.length === 0 && requests.isSuccess ? <Body>{t("privacy.noRequests")}</Body> : null}
      {list.map((r) => (
        <Fragment key={r.id}>
          <ListItem
            title={`${t(`privacyRequestKind.${r.kind}`)} · ${r.personName ?? t("privacy.erasedPerson")}`}
            subtitle={[dayOf(r.createdAt), r.requestedByName, r.message]
              .filter(Boolean)
              .join(" · ")}
            trailing={t(`privacyRequestStatus.${r.status}`)}
            onPress={
              r.personId
                ? () =>
                    router.push({
                      pathname: "/privacy/[personId]",
                      params: { personId: r.personId as string },
                    })
                : undefined
            }
          />
          {r.status === "open"
            ? (["done", "rejected"] as const).map((status) => (
                <Button
                  key={status}
                  label={t(`privacy.resolve.${status}`)}
                  variant="secondary"
                  busy={resolve.isPending && resolve.variables?.requestId === r.id}
                  onPress={() => resolve.mutate({ requestId: r.id, status })}
                />
              ))
            : null}
        </Fragment>
      ))}
    </Screen>
  );
}
