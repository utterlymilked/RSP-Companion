import Ionicons from "@expo/vector-icons/Ionicons";
import { isBlockingStatus, PITCH_UNITS, partSpan } from "@rsc/shared";
import { useTranslation } from "react-i18next";
import {
  type GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { type Colors, fontSize, radius, spacing, useColors } from "../../theme";
import {
  type BookingSummary,
  bookingsOf,
  layoutLanes,
  lisbonMinutes,
  type SpaceSummary,
  whoOf,
} from "./occupancy";
import { shortName } from "./planLayout";
import { addDays, clockTime, dateParts, dayHeading, dayOf, monthGrid, todayLisbon } from "./time";

const HOUR = 56;
const GUTTER = 44;
const COLUMN = 92;
/** A pitch that can be booked in parts needs room to show them side by side. */
const COLUMN_DIVISIBLE = 172;
/** A week column shows at most this many side-by-side blocks, else a count. */
const MAX_LANES = 2;
const HEADER = 44;

/** Fill, edge and text colours of a booking block by status. */
export function blockLook(status: BookingSummary["status"], colors: Colors) {
  if (status === "to_confirm") {
    return { bg: colors.warningSoft, edge: colors.warning, fg: colors.text, off: false };
  }
  if (isBlockingStatus(status)) {
    return { bg: colors.primarySoft, edge: colors.primary, fg: colors.text, off: false };
  }
  return { bg: colors.surfaceAlt, edge: colors.border, fg: colors.textMuted, off: true };
}

/** Hours shown: 08:00 to 23:00, widened to fit any booking outside them. */
function hourRange(bookings: BookingSummary[], day: string) {
  let first = 8;
  let last = 23;
  for (const b of bookings) {
    const start = dayOf(b.startsAt) < day ? 0 : lisbonMinutes(b.startsAt);
    const end = dayOf(b.endsAt) > day ? 24 * 60 : lisbonMinutes(b.endsAt);
    first = Math.min(first, Math.floor(start / 60));
    last = Math.max(last, Math.ceil(end / 60));
  }
  return { first, last };
}

/** Top and height in the grid for a booking on `day`, clipped to that day. */
function place(b: BookingSummary, day: string, firstHour: number) {
  const start = dayOf(b.startsAt) < day ? 0 : lisbonMinutes(b.startsAt);
  const end = dayOf(b.endsAt) > day ? 24 * 60 : lisbonMinutes(b.endsAt);
  return {
    top: ((start - firstHour * 60) / 60) * HOUR,
    height: Math.max(((end - start) / 60) * HOUR, 22),
  };
}

const hoursOf = (first: number, last: number) =>
  Array.from({ length: last - first }, (_, i) => first + i);

function HourLines({ first, last }: { first: number; last: number }) {
  const colors = useColors();
  return (
    <>
      {hoursOf(first, last).map((hour, i) => (
        <View
          key={hour}
          pointerEvents="none"
          style={[styles.hourLine, { top: i * HOUR, borderTopColor: colors.border }]}
        />
      ))}
    </>
  );
}

function Gutter({ first, last }: { first: number; last: number }) {
  const colors = useColors();
  return (
    <View style={[styles.gutter, { height: (last - first) * HOUR }]}>
      {hoursOf(first, last).map((hour, i) => (
        <Text
          key={hour}
          style={[styles.hourLabel, { top: i === 0 ? 2 : i * HOUR - 7, color: colors.textMuted }]}
        >
          {`${String(hour).padStart(2, "0")}:00`}
        </Text>
      ))}
    </View>
  );
}

function NowLine({ day, first }: { day: string; first: number }) {
  const colors = useColors();
  if (day !== todayLisbon()) return null;
  const top = ((lisbonMinutes(new Date()) - first * 60) / 60) * HOUR;
  return (
    <View pointerEvents="none" style={[styles.now, { top, backgroundColor: colors.danger }]} />
  );
}

function Block({
  booking,
  style,
  compact,
  via,
  tag,
  onPress,
}: {
  booking: BookingSummary;
  /** Which part of the column's pitch the block is for ("A", "2"), drawn on its first line. */
  tag?: string;
  style: { top: number; height: number; left: string | number; width: string | number };
  compact?: boolean;
  /** The combined space that occupies this column, shown as a hatched placeholder. */
  via?: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const look = blockLook(booking.status, colors);
  const title = booking.title ?? t(`activities.${booking.activity}`);
  const time = `${clockTime(booking.startsAt)}–${clockTime(booking.endsAt)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        time,
        title,
        whoOf(booking),
        via ? t("bookings.via", { space: booking.spaceName }) : booking.spaceName,
        t(`bookingStatus.${booking.status}`),
      ].join(", ")}
      onPress={onPress}
      style={({ pressed }) => [
        styles.block,
        style as never,
        via
          ? {
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.border,
              borderStyle: "dashed",
            }
          : { backgroundColor: look.bg, borderLeftColor: look.edge },
        via ? styles.viaBlock : styles.edge,
        pressed && { opacity: 0.75 },
      ]}
    >
      {via ? (
        <View style={styles.via}>
          <Ionicons name="link-outline" size={12} color={colors.textMuted} />
          <Text
            numberOfLines={2}
            style={[styles.blockTime, styles.flex, { color: colors.textMuted }]}
          >
            {via}
          </Text>
        </View>
      ) : (
        <>
          {compact && !tag ? null : (
            <Text numberOfLines={1} style={[styles.blockTime, { color: look.edge }]}>
              {[compact ? null : time, tag].filter(Boolean).join(" · ")}
            </Text>
          )}
          <Text
            numberOfLines={compact ? 3 : Math.max(1, Math.floor((style.height - 18) / 15))}
            style={[
              compact ? styles.blockTitleCompact : styles.blockTitle,
              { color: look.fg },
              look.off && styles.off,
            ]}
          >
            {title}
          </Text>
          {style.height < (compact ? 48 : 62) ? null : (
            <Text
              numberOfLines={1}
              style={[compact ? styles.blockWhoCompact : styles.blockWho, { color: look.fg }]}
            >
              {whoOf(booking)}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
}

/** The mark of the part of the column's pitch a booking is for, if it is for a part. */
function partTag(space: SpaceSummary | undefined, column: SpaceSummary) {
  if (space?.parentId !== column.id || !space.partCount || !space.partIndex) return undefined;
  return space.partCount === 2
    ? String.fromCharCode(64 + space.partIndex)
    : String(space.partIndex);
}

interface DayProps {
  day: string;
  spaces: SpaceSummary[];
  allSpaces: SpaceSummary[];
  bookings: BookingSummary[];
  onOpen: (booking: BookingSummary) => void;
  /** Tapping an empty part of a column books that space from the tapped half hour. */
  onSlot?: (spaceId: string, minutes: number) => void;
}

/**
 * Where a booking sits across its column: a booking of a part of the column's pitch fills the
 * part's stretch of the column's width (a half is the left or right half), anything else is
 * laid out in lanes next to the other blocks that overlap it.
 */
function acrossColumn(
  item: BookingSummary,
  column: SpaceSummary,
  spaces: SpaceSummary[],
  lane: number,
  lanes: number,
) {
  const space = spaces.find((s) => s.id === item.spaceId);
  if (space?.parentId === column.id && space.partCount && space.partIndex) {
    const { from, to } = partSpan(space.partCount, space.partIndex);
    return {
      left: `${(from / PITCH_UNITS) * 100}%` as const,
      width: `${((to - from) / PITCH_UNITS) * 100}%` as const,
    };
  }
  return {
    left: `${(lane / lanes) * 100}%` as const,
    width: `${100 / lanes}%` as const,
  };
}

const columnWidth = (space: SpaceSummary) =>
  space.divisions.length > 0 ? COLUMN_DIVISIBLE : COLUMN;

/** One day, one column per space, bookings as blocks on a time grid. */
export function DayGrid({ day, spaces, allSpaces, bookings, onOpen, onSlot }: DayProps) {
  const colors = useColors();
  const { first, last } = hourRange(bookings, day);
  const height = (last - first) * HOUR;
  return (
    <View style={[styles.frame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={styles.gutterColumn}>
          <View style={styles.headerSpacer} />
          <Gutter first={first} last={last} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
              {spaces.map((s) => (
                <Text
                  key={s.id}
                  numberOfLines={2}
                  style={[styles.columnTitle, { width: columnWidth(s), color: colors.text }]}
                >
                  {shortName(s)}
                </Text>
              ))}
            </View>
            <View style={[styles.row, { height }]}>
              {spaces.map((s) => {
                const own = bookingsOf(s.id, bookings, allSpaces);
                return (
                  <Pressable
                    key={s.id}
                    accessible={false}
                    disabled={!onSlot}
                    onPress={(e: GestureResponderEvent) => {
                      const minutes = first * 60 + (e.nativeEvent.locationY / HOUR) * 60;
                      onSlot?.(s.id, Math.floor(minutes / 30) * 30);
                    }}
                    style={[
                      styles.column,
                      { width: columnWidth(s), borderLeftColor: colors.border },
                    ]}
                  >
                    <HourLines first={first} last={last} />
                    {layoutLanes(own).map(({ item, lane, lanes }) => (
                      <Block
                        key={item.id}
                        booking={item}
                        tag={partTag(
                          allSpaces.find((x) => x.id === item.spaceId),
                          s,
                        )}
                        compact={
                          !!partTag(
                            allSpaces.find((x) => x.id === item.spaceId),
                            s,
                          )
                        }
                        via={
                          item.spaceId === s.id ||
                          partTag(
                            allSpaces.find((x) => x.id === item.spaceId),
                            s,
                          )
                            ? undefined
                            : shortName({ name: item.spaceName })
                        }
                        onPress={() => onOpen(item)}
                        style={{
                          ...place(item, day, first),
                          ...acrossColumn(item, s, allSpaces, lane, lanes),
                        }}
                      />
                    ))}
                    <NowLine day={day} first={first} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

interface WeekProps {
  monday: string;
  bookings: BookingSummary[];
  onOpen: (booking: BookingSummary) => void;
  onDay: (day: string) => void;
}

/** Seven day columns with the week's bookings; overlapping ones share the column. */
export function WeekGrid({ monday, bookings, onOpen, onDay }: WeekProps) {
  const colors = useColors();
  const { t, i18n } = useTranslation();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = todayLisbon();
  const ranges = days.map((d) =>
    hourRange(
      bookings.filter((b) => dayOf(b.startsAt) === d),
      d,
    ),
  );
  const first = Math.min(...ranges.map((r) => r.first));
  const last = Math.max(...ranges.map((r) => r.last));
  return (
    <View style={[styles.frame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.headerRow, { borderBottomColor: colors.border, paddingLeft: GUTTER }]}>
        {days.map((d) => {
          const parts = dateParts(d, i18n.language);
          const isToday = d === today;
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={t("bookings.openDay", { day: `${parts.weekday} ${parts.day}` })}
              onPress={() => onDay(d)}
              style={styles.weekDay}
            >
              <Text style={[styles.weekDayName, { color: colors.textMuted }]}>
                {parts.weekday.replace(".", "").slice(0, 3)}
              </Text>
              <View style={[styles.weekDayNumber, isToday && { backgroundColor: colors.primary }]}>
                <Text
                  style={[styles.weekDayText, { color: isToday ? colors.onPrimary : colors.text }]}
                >
                  {parts.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.row, { height: (last - first) * HOUR }]}>
        <Gutter first={first} last={last} />
        {days.map((d) => (
          <View key={d} style={[styles.weekColumn, { borderLeftColor: colors.border }]}>
            <HourLines first={first} last={last} />
            {weekBlocks(bookings.filter((b) => dayOf(b.startsAt) === d)).map((entry) =>
              "count" in entry ? (
                <Pressable
                  key={entry.key}
                  accessibilityRole="button"
                  accessibilityLabel={t("bookings.count", { count: entry.count })}
                  onPress={() => onDay(d)}
                  style={({ pressed }) => [
                    styles.block,
                    styles.edge,
                    styles.crowd,
                    {
                      ...place(entry.span, d, first),
                      backgroundColor: colors.primary,
                      borderLeftColor: colors.primary,
                    },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={[styles.crowdCount, { color: colors.onPrimary }]}>
                    {entry.count}
                  </Text>
                  <Ionicons name="layers-outline" size={14} color={colors.onPrimary} />
                </Pressable>
              ) : (
                <Block
                  key={entry.item.id}
                  compact
                  booking={entry.item}
                  onPress={() => onOpen(entry.item)}
                  style={{
                    ...place(entry.item, d, first),
                    left: `${(entry.lane / entry.lanes) * 100}%`,
                    width: `${100 / entry.lanes}%`,
                  }}
                />
              ),
            )}
            <NowLine day={d} first={first} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A day's blocks for the week view: overlapping groups wider than MAX_LANES become one count
 * block ("6 reservas") that opens the day, so nothing is drawn too thin to read or tap.
 */
function weekBlocks(bookings: BookingSummary[]) {
  const laid = layoutLanes(bookings);
  const result: ((typeof laid)[number] | { key: string; count: number; span: BookingSummary })[] =
    [];
  const groups = new Map<number, typeof laid>();
  for (const entry of laid) groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  for (const [group, entries] of groups) {
    if ((entries[0]?.lanes ?? 0) <= MAX_LANES) {
      result.push(...entries);
      continue;
    }
    const items = entries.map((e) => e.item);
    const startsAt = items.map((b) => b.startsAt).sort()[0] ?? "";
    const endsAt =
      items
        .map((b) => b.endsAt)
        .sort()
        .at(-1) ?? "";
    result.push({
      key: `group-${group}`,
      count: items.length,
      span: { ...(items[0] as BookingSummary), startsAt, endsAt },
    });
  }
  return result;
}

/** What a month cell shows: how many things the day has, and whether one waits for approval. */
export interface DayMark {
  count: number;
  pending?: boolean;
}

/** Month marks for bookings: blocking ones only, by Lisbon day. */
export function bookingMarks(bookings: BookingSummary[]): Map<string, DayMark> {
  const marks = new Map<string, DayMark>();
  for (const b of bookings) {
    if (!isBlockingStatus(b.status)) continue;
    const d = dayOf(b.startsAt);
    const mark = marks.get(d) ?? { count: 0 };
    marks.set(d, { count: mark.count + 1, pending: mark.pending || b.status === "to_confirm" });
  }
  return marks;
}

interface MonthProps {
  /** The selected day; its month is shown. */
  date: string;
  marks: Map<string, DayMark>;
  onDay: (day: string) => void;
  /** Accessible description of a day's count ("2 reservas"); without it, the full date. */
  describe?: (count: number) => string;
  /** Days before it are greyed out and cannot be picked. */
  minDate?: string;
}

/** A month at a glance: a count per day and a dot when something waits for approval. */
export function MonthGrid({ date, marks, onDay, describe, minDate }: MonthProps) {
  const colors = useColors();
  const { i18n } = useTranslation();
  const days = monthGrid(date);
  const month = date.slice(0, 7);
  const today = todayLisbon();
  return (
    <View style={[styles.frame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.monthRow}>
        {days.slice(0, 7).map((d) => (
          <Text key={d} style={[styles.monthHead, { color: colors.textMuted }]}>
            {dateParts(d, i18n.language).weekday.replace(".", "").slice(0, 3)}
          </Text>
        ))}
      </View>
      {Array.from({ length: 6 }, (_, week) => (
        <View key={days[week * 7]} style={[styles.monthRow, { borderTopColor: colors.border }]}>
          {days.slice(week * 7, week * 7 + 7).map((d) => {
            const mark = marks.get(d);
            const count = mark?.count ?? 0;
            const pending = !!mark?.pending;
            const inMonth = d.startsWith(month);
            const isToday = d === today;
            const selected = d === date;
            const disabled = !!minDate && d < minDate;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={
                  describe
                    ? `${Number(d.slice(8))}, ${describe(count)}`
                    : dayHeading(d, i18n.language)
                }
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onDay(d)}
                style={({ pressed }) => [
                  styles.monthCell,
                  selected && { backgroundColor: colors.primarySoft },
                  disabled && styles.outside,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.monthNumber, isToday && { backgroundColor: colors.primary }]}>
                  <Text
                    style={[
                      styles.monthNumberText,
                      {
                        color: isToday
                          ? colors.onPrimary
                          : inMonth
                            ? colors.text
                            : colors.textMuted,
                      },
                      !inMonth && styles.outside,
                    ]}
                  >
                    {Number(d.slice(8))}
                  </Text>
                </View>
                {count > 0 ? (
                  <View style={styles.monthMarks}>
                    <View style={[styles.count, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.countText, { color: colors.onPrimary }]}>{count}</Text>
                    </View>
                    {pending ? (
                      <View style={[styles.pendingDot, { backgroundColor: colors.warning }]} />
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: { flexDirection: "row" },
  gutterColumn: { width: GUTTER },
  headerRow: {
    flexDirection: "row",
    height: HEADER,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSpacer: { height: HEADER },
  columnTitle: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: spacing.xs,
  },
  column: { borderLeftWidth: StyleSheet.hairlineWidth, position: "relative" },
  gutter: { width: GUTTER, position: "relative" },
  hourLabel: {
    position: "absolute",
    right: 6,
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  hourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  now: { position: "absolute", left: 0, right: 0, height: 2 },
  block: {
    position: "absolute",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    overflow: "hidden",
    marginHorizontal: 1,
  },
  edge: { borderLeftWidth: 3 },
  crowd: { left: 0, right: 0, alignItems: "center", justifyContent: "center" },
  crowdCount: { fontSize: fontSize.md, fontWeight: "800" },
  viaBlock: { borderWidth: 1 },
  via: { flexDirection: "row", gap: 3, alignItems: "flex-start" },
  flex: { flex: 1 },
  blockTime: { fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] },
  blockTitle: { fontSize: fontSize.xs, fontWeight: "700", lineHeight: 15 },
  blockTitleCompact: { fontSize: 10, fontWeight: "700", lineHeight: 12 },
  blockWho: { fontSize: fontSize.xs, opacity: 0.8 },
  blockWhoCompact: { fontSize: 10, opacity: 0.8 },
  off: { textDecorationLine: "line-through" },
  weekDay: { flex: 1, alignItems: "center", gap: 2 },
  weekDayName: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  weekDayNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  weekDayText: { fontSize: fontSize.sm, fontWeight: "800" },
  weekColumn: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, position: "relative" },
  monthRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "transparent",
  },
  monthHead: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    paddingVertical: spacing.sm,
  },
  monthCell: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    paddingVertical: 6,
    gap: 4,
    borderRadius: radius.sm,
  },
  monthNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNumberText: { fontSize: fontSize.sm, fontWeight: "700" },
  outside: { opacity: 0.5 },
  monthMarks: { flexDirection: "row", alignItems: "center", gap: 3 },
  count: {
    minWidth: 20,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 10, fontWeight: "800" },
  pendingDot: { width: 7, height: 7, borderRadius: 4 },
});
