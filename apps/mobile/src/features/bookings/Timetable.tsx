import {
  type TimetableBlock as Block,
  columnSpace,
  TIMETABLE_STEP,
  type TimetableSheet,
} from "@rsc/shared";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, useColors } from "../../theme";
import { blockLook } from "./CalendarGrid";
import { type BookingSummary, type SpaceSummary, whoOf } from "./occupancy";
import { DEFAULT_DURATION, daySlots, fitDuration } from "./slots";
import { clockTime, dateParts, dayHeading, minutesToClock, todayLisbon } from "./time";

/** Height of one row, which is `TIMETABLE_STEP` minutes. */
const ROW = 32;
const GUTTER = 44;
const HEADER = 40;
const MARKS = 16;
/** Narrowest a day is drawn before the sheet scrolls sideways, per column of the day. */
const MIN_COLUMN = 42;
const MIN_DAY = 84;

interface Props {
  sheets: TimetableSheet<BookingSummary>[];
  spaces: SpaceSummary[];
  bookings: BookingSummary[];
  range: { from: number; to: number };
  onOpen: (booking: BookingSummary) => void;
  /** Tapping a free time books it: the space (a part for a divided pitch), day, start, length. */
  onSlot?: (spaceId: string, date: string, start: number, minutes: number) => void;
  onDay?: (date: string) => void;
}

/**
 * The week of every pitch (or room), one grid each: days across, hours down, a divided pitch
 * with a column per part. Booked stretches are blocks that name their team; free times are
 * green and book on a tap.
 */
export function Timetable({ sheets, ...rest }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  if (sheets.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textMuted }]}>
        {t("bookings.timetable.empty")}
      </Text>
    );
  }
  return (
    <View style={styles.sheets}>
      {sheets.map((sheet) => (
        <SheetGrid key={sheet.space.id} sheet={sheet} {...rest} />
      ))}
    </View>
  );
}

function SheetGrid({
  sheet,
  spaces,
  bookings,
  range,
  onOpen,
  onSlot,
  onDay,
}: Omit<Props, "sheets"> & { sheet: TimetableSheet<BookingSummary> }) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const today = todayLisbon();
  const rows = ((range.to - range.from) * 60) / TIMETABLE_STEP;
  const head = HEADER + (sheet.columns > 1 ? MARKS : 0);
  const minDay = Math.max(MIN_DAY, sheet.columns * MIN_COLUMN);
  const hours = Array.from({ length: range.to - range.from }, (_, i) => range.from + i);
  return (
    <View
      accessibilityLabel={sheet.space.name}
      style={[styles.frame, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {sheet.space.name}
      </Text>
      <View style={styles.row}>
        <View style={{ width: GUTTER }}>
          <View style={{ height: head }} />
          <View style={{ height: rows * ROW }}>
            {hours.map((hour) => (
              <Text
                key={hour}
                style={[
                  styles.hourLabel,
                  { top: (hour - range.from) * 2 * ROW - 7, color: colors.textMuted },
                ]}
              >
                {`${String(hour).padStart(2, "0")}:00`}
              </Text>
            ))}
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.grow}
          style={styles.flex}
        >
          <View style={[styles.flex, { minWidth: 7 * minDay }]}>
            <View
              style={[
                styles.row,
                { height: head, borderBottomColor: colors.border },
                styles.headRow,
              ]}
            >
              {sheet.days.map(({ date }) => {
                const parts = dateParts(date, i18n.language);
                const isToday = date === today;
                return (
                  <Pressable
                    key={date}
                    accessibilityRole="button"
                    accessibilityLabel={t("bookings.openDay", {
                      day: dayHeading(date, i18n.language),
                    })}
                    disabled={!onDay}
                    onPress={() => onDay?.(date)}
                    style={[styles.day, { borderLeftColor: colors.border }]}
                  >
                    <View style={styles.dayHead}>
                      <Text style={[styles.dayName, { color: colors.textMuted }]}>
                        {parts.weekday.replace(".", "").slice(0, 3)}
                      </Text>
                      <View
                        style={[styles.dayNumber, isToday && { backgroundColor: colors.primary }]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            { color: isToday ? colors.onPrimary : colors.text },
                          ]}
                        >
                          {parts.day}
                        </Text>
                      </View>
                    </View>
                    {sheet.columns > 1 ? (
                      <View style={styles.marks}>
                        {sheet.columnMarks.map((mark) => (
                          <Text key={mark} style={[styles.mark, { color: colors.textMuted }]}>
                            {mark}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.row, { height: rows * ROW }]}>
              {sheet.days.map(({ date, blocks }) => (
                <DayColumn
                  key={date}
                  sheet={sheet}
                  date={date}
                  blocks={blocks}
                  spaces={spaces}
                  bookings={bookings}
                  range={range}
                  rows={rows}
                  onOpen={onOpen}
                  onSlot={onSlot}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function DayColumn({
  sheet,
  date,
  blocks,
  spaces,
  bookings,
  range,
  rows,
  onOpen,
  onSlot,
}: {
  sheet: TimetableSheet<BookingSummary>;
  date: string;
  blocks: Block<BookingSummary>[];
  spaces: SpaceSummary[];
  bookings: BookingSummary[];
  range: { from: number; to: number };
  rows: number;
  onOpen: (booking: BookingSummary) => void;
  onSlot?: Props["onSlot"];
}) {
  const { t, i18n } = useTranslation();
  const colors = useColors();
  const columns = Array.from({ length: sheet.columns }, (_, i) => i);
  const rowList = Array.from({ length: rows }, (_, i) => i);
  return (
    <View style={[styles.day, styles.body, { borderLeftColor: colors.border }]}>
      {rowList.map((r) => (
        <View
          key={r}
          pointerEvents="none"
          style={[
            styles.line,
            {
              top: r * ROW,
              borderTopColor: colors.border,
              borderTopWidth: r % 2 === 0 ? StyleSheet.hairlineWidth : 0,
            },
          ]}
        />
      ))}
      {columns.map((column) => {
        const part = columnSpace(sheet.space, spaces, column, sheet.columns);
        const free = new Map(
          daySlots(part.id, date, bookings, spaces)
            .filter((slot) => !slot.booking)
            .map((slot) => [slot.start, slot] as const),
        );
        return (
          <View
            key={column}
            style={[
              styles.part,
              {
                left: `${(column / sheet.columns) * 100}%`,
                width: `${100 / sheet.columns}%`,
                borderLeftColor: colors.border,
                borderLeftWidth: column > 0 ? StyleSheet.hairlineWidth : 0,
              },
            ]}
          >
            {rowList.map((r) => {
              const start = range.from * 60 + r * TIMETABLE_STEP;
              const slot = free.get(start);
              if (!slot) return null;
              const cell = [styles.free, { top: r * ROW, backgroundColor: colors.successSoft }];
              if (!onSlot) return <View key={r} pointerEvents="none" style={cell} />;
              return (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  accessibilityLabel={t("bookings.timetable.bookFree", {
                    space: part.name,
                    day: dayHeading(date, i18n.language),
                    time: minutesToClock(start),
                  })}
                  onPress={() => onSlot(part.id, date, start, fitDuration(slot, DEFAULT_DURATION))}
                  style={({ pressed }) => [...cell, pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.plus, { color: colors.success }]}>+</Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}
      {blocks.map((block) => (
        <BlockView
          key={`${block.booking.id}-${block.fromUnit}`}
          block={block}
          from={range.from}
          onPress={() => onOpen(block.booking)}
        />
      ))}
    </View>
  );
}

function BlockView({
  block,
  from,
  onPress,
}: {
  block: Block<BookingSummary>;
  from: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const { booking } = block;
  const look = blockLook(booking.status, colors);
  const top = ((block.startMin - from * 60) / TIMETABLE_STEP) * ROW;
  const height = ((block.endMin - block.startMin) / TIMETABLE_STEP) * ROW;
  const span = (block.toUnit - block.fromUnit) / 12;
  const title = booking.title ?? t(`activities.${booking.activity}`);
  const time = `${clockTime(booking.startsAt)}–${clockTime(booking.endsAt)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        time,
        whoOf(booking),
        title,
        block.via ? t("bookings.via", { space: booking.spaceName }) : booking.spaceName,
        t(`bookingStatus.${booking.status}`),
      ].join(", ")}
      onPress={onPress}
      style={({ pressed }) => [
        styles.block,
        {
          top,
          height: height - 1,
          left: `${(block.fromUnit / 12 + (span * block.lane) / block.lanes) * 100}%`,
          width: `${(span / block.lanes) * 100}%`,
        },
        block.via
          ? {
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.border,
              borderStyle: "dashed",
              borderWidth: 1,
            }
          : { backgroundColor: look.bg, borderLeftColor: look.edge, borderLeftWidth: 3 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text numberOfLines={height >= ROW * 2 ? 3 : 2} style={[styles.who, { color: look.fg }]}>
        {whoOf(booking)}
      </Text>
      {height >= ROW * 2 && !block.via ? (
        <Text numberOfLines={1} style={[styles.detail, { color: colors.textMuted }]}>
          {title}
        </Text>
      ) : null}
      {height >= ROW * 3 ? (
        <Text numberOfLines={1} style={[styles.detail, { color: look.edge }]}>
          {block.via ? booking.spaceName : time}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Free, booked, to confirm and booked through another space, as drawn in the grids. */
export function TimetableLegend() {
  const { t } = useTranslation();
  const colors = useColors();
  const items = [
    { key: "free", bg: colors.successSoft, edge: colors.success },
    { key: "confirmed", bg: colors.primarySoft, edge: colors.primary },
    { key: "request", bg: colors.warningSoft, edge: colors.warning },
    { key: "via", bg: colors.surfaceAlt, edge: colors.border },
  ];
  return (
    <View accessibilityLabel={t("bookings.legend")} style={styles.legend}>
      {items.map((item) => (
        <View key={item.key} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: item.bg, borderColor: item.edge }]} />
          <Text style={[styles.legendText, { color: colors.textMuted }]}>
            {t(`bookings.timetable.${item.key}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sheets: { gap: spacing.md },
  empty: { fontSize: fontSize.sm, textAlign: "center", paddingVertical: spacing.lg },
  frame: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  title: {
    fontSize: fontSize.md,
    fontWeight: "800",
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: { flexDirection: "row" },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  headRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  hourLabel: {
    position: "absolute",
    right: 6,
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  day: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
  dayHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: HEADER,
  },
  dayName: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  dayNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: { fontSize: fontSize.sm, fontWeight: "800" },
  marks: { flexDirection: "row", height: MARKS },
  mark: { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "600" },
  body: { position: "relative" },
  line: { position: "absolute", left: 0, right: 0 },
  part: { position: "absolute", top: 0, bottom: 0 },
  free: {
    position: "absolute",
    left: 1,
    right: 1,
    height: ROW - 2,
    marginTop: 1,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  plus: { fontSize: 14, fontWeight: "700", opacity: 0.6 },
  block: {
    position: "absolute",
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 3,
    overflow: "hidden",
    marginHorizontal: 1,
  },
  who: { fontSize: 11, fontWeight: "800", lineHeight: 13 },
  detail: { fontSize: 10, lineHeight: 12 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
  legendText: { fontSize: fontSize.xs },
});
