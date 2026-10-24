import { useQuery } from "@tanstack/react-query";
import { type Href, Redirect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { useMe } from "../../src/auth/session";
import { jsonOrThrow } from "../../src/errors";
import { addDays, dayHeading, dayOf, todayLisbon } from "../../src/features/bookings/time";
import { MyCallUps } from "../../src/features/callups/MyCallUps";
import { Dashboard } from "../../src/features/dashboard/Dashboard";
import { EventCard, type EventSummary } from "../../src/features/events/EventCard";
import { firstTab } from "../../src/navigation";
import { fontSize, radius, spacing, useColors } from "../../src/theme";
import { EmptyState } from "../../src/ui/EmptyState";
import { ListItem } from "../../src/ui/ListItem";
import { Section } from "../../src/ui/Section";
import { Body } from "../../src/ui/Text";
import { Tile, TileGrid } from "../../src/ui/Tile";

const crest = require("../../assets/crest.png");

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Home: who you are, what's next, your call-ups, club news and, for managers, the numbers. */
export default function Home() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const me = useMe().data;
  const permissions = me?.permissions ?? [];
  const today = todayLisbon();
  const canSeeEvents = permissions.includes("events.read");
  const upcoming = useQuery({
    queryKey: ["events", "upcoming", today],
    enabled: canSeeEvents,
    queryFn: async () =>
      jsonOrThrow(await api.events.$get({ query: { from: today, to: addDays(today, 7) } })),
  });
  const inbox = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => jsonOrThrow(await api.notifications.$get({ query: {} })),
    refetchInterval: 30_000,
    staleTime: 0,
  });
  if (!me) return null;
  // Home is a module like any other: when it is off, land on the first screen of the menu bar.
  if (me.modules && !me.modules.includes("home"))
    return <Redirect href={firstTab(me.permissions, me.modules)} />;

  const now = Date.now();
  const next = ((upcoming.data?.events ?? []) as EventSummary[])
    .filter((e) => new Date(e.endsAt).getTime() > now && e.status !== "cancelled")
    .slice(0, 4);
  const news = (inbox.data?.notifications ?? []).slice(0, 3);
  const go = (href: string) => () => router.push(href as Href);
  const shortcuts = [
    permissions.includes("events.write") && {
      icon: "calendar" as const,
      label: t("home.shortcut.event"),
      href: "/event/new",
    },
    (permissions.includes("bookings.write") || permissions.includes("bookings.request")) && {
      icon: "business" as const,
      label: t("home.shortcut.booking"),
      href: "/booking/new",
    },
    permissions.includes("bookings.read") && {
      icon: "bookmarks" as const,
      label: t("home.shortcut.myBookings"),
      href: "/booking/mine",
    },
    permissions.includes("incidents.write") && {
      icon: "alert-circle" as const,
      label: t("home.shortcut.incident"),
      href: "/incident/new",
    },
    permissions.includes("announcements.write") && {
      icon: "megaphone" as const,
      label: t("home.shortcut.announcement"),
      href: "/announcement/new",
    },
  ].filter((s) => !!s);
  const firstName = me.user.name.split(/\s+/)[0] ?? me.user.name;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
    >
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.header, paddingTop: insets.top + spacing.lg },
        ]}
      >
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <Text style={[styles.date, { color: colors.accent }]}>
              {capitalize(dayHeading(today, i18n.language))}
            </Text>
            <Text accessibilityRole="header" style={[styles.greeting, { color: colors.onHeader }]}>
              {t("home.greeting", { name: firstName })}
            </Text>
            <Text style={[styles.club, { color: colors.onHeader }]}>{t("common.club")}</Text>
          </View>
          <Image
            source={crest}
            style={styles.crest}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <View style={styles.roles}>
          {me.roles.map((grant) => (
            <View
              key={`${grant.role}:${grant.teamId ?? grant.classId ?? ""}`}
              style={[styles.role, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.roleText, { color: colors.onAccent }]}>
                {t(`roles.${grant.role}`)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.body}>
        {me.roles.length === 0 ? <Body>{t("home.noRoles")}</Body> : null}

        {shortcuts.length > 0 ? (
          <TileGrid>
            {shortcuts.map((s) => (
              <Tile key={s.href} icon={s.icon} label={s.label} onPress={go(s.href)} />
            ))}
          </TileGrid>
        ) : null}

        <MyCallUps />

        {canSeeEvents ? (
          <Section
            title={t("home.next")}
            action={{ label: t("home.seeAgenda"), onPress: go("/events") }}
          >
            {upcoming.data && next.length === 0 ? (
              <EmptyState icon="calendar-clear-outline" text={t("home.noEvents")} />
            ) : null}
            {next.map((e, i) => {
              const day = dayOf(e.startsAt);
              const newDay = i === 0 || dayOf(next[i - 1]?.startsAt ?? "") !== day;
              return (
                <View key={e.id} style={styles.event}>
                  {newDay ? (
                    <Text style={[styles.eventDay, { color: colors.textMuted }]}>
                      {day === today ? `${t("events.today")} · ` : ""}
                      {dayHeading(day, i18n.language)}
                    </Text>
                  ) : null}
                  <EventCard
                    event={e}
                    onPress={() =>
                      router.push({ pathname: "/event/[eventId]", params: { eventId: e.id } })
                    }
                  />
                </View>
              );
            })}
          </Section>
        ) : null}

        <Section
          title={t("home.news")}
          action={{ label: t("home.seeAll"), onPress: go("/notifications") }}
        >
          {inbox.data && news.length === 0 ? (
            <EmptyState icon="chatbubbles-outline" text={t("notifications.empty")} />
          ) : null}
          {news.map((n) => (
            <ListItem
              key={n.id}
              icon={n.kind === "announcement" ? "megaphone-outline" : "notifications-outline"}
              title={n.title}
              subtitle={n.body ?? t(`notifications.kinds.${n.kind}`)}
              onPress={go("/notifications")}
            />
          ))}
        </Section>

        <Dashboard />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl * 2 },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.lg * 1.5,
    borderBottomRightRadius: radius.lg * 1.5,
    gap: spacing.md,
  },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroText: { flex: 1, gap: 4 },
  date: { fontSize: fontSize.sm, fontWeight: "700" },
  greeting: { fontSize: fontSize.xxl, fontWeight: "800", letterSpacing: -0.5 },
  club: { fontSize: fontSize.sm, opacity: 0.85 },
  crest: { width: 72, height: 80 },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  role: { borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  roleText: { fontSize: fontSize.xs, fontWeight: "800" },
  body: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  event: { gap: 4 },
  eventDay: { fontSize: fontSize.xs, fontWeight: "700", textTransform: "uppercase" },
});
