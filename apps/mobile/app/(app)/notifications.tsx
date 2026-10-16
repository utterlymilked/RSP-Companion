import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Button } from "../../src/ui/Button";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Body, Message } from "../../src/ui/Text";

/** The user's inbox: announcements and alerts, newest first. Opening one marks it read. */
export default function Notifications() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const canAnnounce = !!me && me.permissions.includes("announcements.write");
  const inbox = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => jsonOrThrow(await api.notifications.$get({ query: {} })),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({
    mutationFn: async (id: string) =>
      api.notifications[":notificationId"].read.$post({ param: { notificationId: id } }),
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: async () => api.notifications["read-all"].$post(),
    onSuccess: refresh,
  });

  return (
    <Screen>
      {canAnnounce ? (
        <Button label={t("announcements.new")} onPress={() => router.push("/announcement/new")} />
      ) : null}
      {inbox.isError ? (
        <>
          <Message tone="error">{t(errorKey(inbox.error))}</Message>
          <Button label={t("common.retry")} onPress={() => inbox.refetch()} />
        </>
      ) : null}
      {inbox.data?.notifications.length === 0 ? <Body>{t("notifications.empty")}</Body> : null}
      {inbox.data && inbox.data.unread > 0 ? (
        <Button
          label={t("notifications.markAllRead", { count: inbox.data.unread })}
          variant="secondary"
          busy={readAll.isPending}
          onPress={() => readAll.mutate()}
        />
      ) : null}
      {inbox.data?.notifications.map((n) => (
        <ListItem
          key={n.id}
          title={n.readAt ? n.title : `● ${n.title}`}
          subtitle={n.body ?? t(`notifications.kinds.${n.kind}`)}
          onPress={() => {
            if (!n.readAt) read.mutate(n.id);
            if (n.link) router.push(n.link as never);
          }}
        />
      ))}
    </Screen>
  );
}
