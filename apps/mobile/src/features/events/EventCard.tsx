import Ionicons from "@expo/vector-icons/Ionicons";
import type { EventKind, EventStatus, HomeAway } from "@rsc/shared";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { brand, elevation, fontSize, radius, spacing, useColors } from "../../theme";
import { Badge } from "../../ui/Badge";
import { clockTime } from "../bookings/time";

export interface EventSummary {
  id: string;
  kind: EventKind;
  status: EventStatus;
  title: string | null;
  startsAt: string;
  endsAt: string;
  teamName: string | null;
  spaceName: string | null;
  venueName: string | null;
  location: string | null;
  opponent: string | null;
  homeAway: HomeAway | null;
  competition?: string | null;
}

const KIND_ICON = {
  training: "fitness",
  match: "football",
  club_event: "people",
  meeting: "chatbubbles",
  formation: "school",
  game_analysis: "videocam",
} as const;

type HeadlineFields = Pick<EventSummary, "kind" | "opponent" | "homeAway" | "teamName" | "title">;

/** "Home – Away" for a match, else the event's title, team or kind. */
export function eventHeadline(event: HeadlineFields, t: (key: string) => string): string {
  if (event.kind === "match" && event.opponent) {
    return event.homeAway === "away"
      ? `${event.opponent} – ${event.teamName ?? ""}`
      : `${event.teamName ?? ""} – ${event.opponent}`;
  }
  return event.title ?? event.teamName ?? t(`eventKinds.${event.kind}`);
}

/** One calendar entry: time, what it is, who and where, with a colour per kind. */
export function EventCard({ event, onPress }: { event: EventSummary; onPress?: () => void }) {
  const { t } = useTranslation();
  const colors = useColors();
  const kindColor = {
    training: colors.primary,
    match: brand.red,
    club_event: brand.black,
    meeting: brand.black,
    formation: brand.black,
    game_analysis: brand.black,
  }[event.kind];
  const headline = eventHeadline(event, t);
  const place = event.spaceName ?? event.location ?? event.venueName;
  const off = event.status === "cancelled" || event.status === "postponed";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        `${clockTime(event.startsAt)}–${clockTime(event.endsAt)}`,
        headline,
        place,
        event.status === "scheduled" ? null : t(`eventStatus.${event.status}`),
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: kindColor }]} />
      <View style={styles.time}>
        <Text style={[styles.start, { color: colors.text }]}>{clockTime(event.startsAt)}</Text>
        <Text style={[styles.end, { color: colors.textMuted }]}>{clockTime(event.endsAt)}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.kindRow}>
          <Ionicons name={KIND_ICON[event.kind]} size={14} color={kindColor} />
          <Text style={[styles.kind, { color: kindColor }]}>
            {event.kind === "match" && event.competition
              ? event.competition
              : t(`eventKinds.${event.kind}`)}
          </Text>
        </View>
        <Text
          style={[styles.title, { color: colors.text }, off && styles.struck]}
          numberOfLines={2}
        >
          {headline}
        </Text>
        {place || event.homeAway ? (
          <View style={styles.kindRow}>
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.place, { color: colors.textMuted }]} numberOfLines={1}>
              {[event.homeAway ? t(`homeAway.${event.homeAway}`) : null, place]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        ) : null}
        {event.status !== "scheduled" ? (
          <Badge
            label={t(`eventStatus.${event.status}`)}
            tone={off ? "danger" : event.status === "played" ? "neutral" : "warning"}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    ...elevation,
  },
  bar: { width: 5 },
  time: {
    width: 64,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  start: { fontSize: fontSize.md, fontWeight: "800" },
  end: { fontSize: fontSize.xs, marginTop: 2 },
  body: { flex: 1, paddingVertical: spacing.sm + 4, paddingRight: spacing.md, gap: 4 },
  kindRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  kind: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: { fontSize: fontSize.md, fontWeight: "700" },
  struck: { textDecorationLine: "line-through" },
  place: { fontSize: fontSize.sm, flexShrink: 1 },
});
