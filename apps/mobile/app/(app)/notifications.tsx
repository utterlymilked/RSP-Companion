import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { errorKey, jsonOrThrow } from "../../src/errors";
import { Badge } from "../../src/ui/Badge";
import { Button } from "../../src/ui/Button";
import { EmptyState } from "../../src/ui/EmptyState";
import { Fab } from "../../src/ui/Fab";
import { ListItem } from "../../src/ui/ListItem";
import { Screen } from "../../src/ui/Screen";
import { Message } from "../../src/ui/Text";

const KIND_ICON = {
  announcement: "megaphone-outline",
  callup: "football-outline",
  document_expiry: "document-text-outline",
} as const;

/** "16 out., 10:00" in the app language and Lisbon time. */
const when = (iso: string | undefined, locale: string) =>
  iso
    ? new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Lisbon",
      }).format(new Date(iso))
    : null;

/** The user's inbox: announcements and alerts, newest first. Opening one marks it read. */
export default function Notifications() {
  const { t, i18n } = useTranslation();
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
    <Screen
      overlay={
        canAnnounce ? (
          <Fab label={t("announcements.new")} onPress={() => router.push("/announcement/new")} />
        ) : null
      }
    >
      {inbox.isError ? (
        <>
          <Message tone="error">{t(errorKey(inbox.error))}</Message>
          <Button label={t("common.retry")} onPress={() => inbox.refetch()} />
        </>
      ) : null}
      {inbox.data?.notifications.length === 0 ? (
        <EmptyState icon="chatbubbles-outline" text={t("notifications.empty")} />
      ) : null}
      {inbox.data && inbox.data.unread > 0 ? (
        <Button
          compact
          icon="checkmark-done-outline"
          label={t("notifications.markAllRead", { count: inbox.data.unread })}
          variant="secondary"
          busy={readAll.isPending}
          onPress={() => readAll.mutate()}
        />
      ) : null}
      {inbox.data?.notifications.map((n) => (
        <ListItem
          key={n.id}
          icon={KIND_ICON[n.kind]}
          title={n.title}
          subtitle={[n.body ?? t(`notifications.kinds.${n.kind}`), when(n.createdAt, i18n.language)]
            .filter(Boolean)
            .join("\n")}
          footer={n.readAt ? undefined : <Badge label={t("notifications.unread")} tone="accent" />}
          onPress={() => {
            if (!n.readAt) read.mutate(n.id);
            if (n.link) router.push(n.link as never);
          }}
        />
      ))}
    </Screen>
  );
}
