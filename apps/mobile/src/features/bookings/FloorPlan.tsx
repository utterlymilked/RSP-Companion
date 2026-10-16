import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { type Colors, fontSize, radius, spacing, useColors } from "../../theme";
import type { BookingSummary, SpaceState } from "./occupancy";
import {
  type Marking,
  PLAN_BACKDROP,
  PLAN_HEIGHT,
  type PlacedArea,
  type PlacedCombination,
} from "./planLayout";
import { clockTime } from "./time";

export interface AreaStatus {
  state: SpaceState;
  booking: BookingSummary | null;
  until: string | null;
}

interface Props {
  areas: PlacedArea[];
  combinations: PlacedCombination[];
  status: (spaceId: string) => AreaStatus;
  selectedId: string | null;
  onSelect: (spaceId: string) => void;
}

/** Width used before the plan is measured (and in tests, where layout never runs). */
const FALLBACK_WIDTH = 340;

/**
 * The club's complex seen from above: fields, the athletics track and the building's rooms,
 * each coloured by whether it is free at the chosen time. Tapping a space selects it.
 */
export function FloorPlan({ areas, combinations, status, selectedId, onSelect }: Props) {
  const colors = useColors();
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const unit = width / 100;
  const box = (r: { x: number; y: number; w: number; h: number }): ViewStyle => ({
    position: "absolute",
    left: r.x * unit,
    top: r.y * unit,
    width: r.w * unit,
    height: r.h * unit,
  });
  const { track, building } = PLAN_BACKDROP;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.plan, { height: PLAN_HEIGHT * unit, backgroundColor: colors.surfaceAlt }]}
    >
      <View
        style={[box(track), { backgroundColor: colors.track, borderRadius: (track.h * unit) / 2 }]}
      >
        {[2, 4].map((inset) => (
          <View
            key={inset}
            style={[
              styles.lane,
              {
                margin: inset * unit,
                borderRadius: ((track.h - 2 * inset) * unit) / 2,
                borderColor: colors.trackLine,
              },
            ]}
          />
        ))}
      </View>
      <View
        style={[
          box(building),
          { backgroundColor: colors.building, borderColor: colors.border, borderRadius: radius.sm },
          styles.building,
        ]}
      />
      {areas.map((area) =>
        area.kind === "field" && area.space ? (
          <Field
            key={area.short}
            area={area}
            style={box(area)}
            status={status(area.space.id)}
            selected={selectedId === area.space.id}
            onPress={() => area.space && onSelect(area.space.id)}
          />
        ) : area.kind === "room" && area.space ? (
          <Room
            key={area.short}
            area={area}
            style={box(area)}
            status={status(area.space.id)}
            selected={selectedId === area.space.id}
            onPress={() => area.space && onSelect(area.space.id)}
          />
        ) : (
          <View
            key={area.short}
            style={[
              box(area),
              styles.fixed,
              { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
            ]}
          >
            <Text numberOfLines={2} style={[styles.roomLabel, { color: colors.textMuted }]}>
              {area.short}
            </Text>
          </View>
        ),
      )}
      {combinations.map((combo) => (
        <Combination
          key={combo.space.id}
          combo={combo}
          unit={unit}
          status={status(combo.space.id)}
          selected={selectedId === combo.space.id}
          onPress={() => onSelect(combo.space.id)}
        />
      ))}
    </View>
  );
}

/** Text colour, soft fill and overlay of each state. */
function stateLook(state: SpaceState, colors: Colors) {
  return {
    free: { fg: colors.success, soft: colors.successSoft, overlay: "transparent" },
    pending: { fg: colors.warning, soft: colors.warningSoft, overlay: colors.pendingOverlay },
    busy: { fg: colors.danger, soft: colors.dangerSoft, overlay: colors.busyOverlay },
  }[state];
}

function useStateLabel() {
  const { t } = useTranslation();
  return (s: AreaStatus) => {
    const label = t(`bookings.state.${s.state}`);
    return s.state === "free"
      ? s.until
        ? `${label} ${t("bookings.until", { time: clockTime(s.until) })}`
        : label
      : `${label} ${t("bookings.until", { time: clockTime(s.until ?? "") })}`;
  };
}

interface AreaProps {
  area: PlacedArea;
  style: ViewStyle;
  status: AreaStatus;
  selected: boolean;
  onPress: () => void;
}

function Field({ area, style, status, selected, onPress }: AreaProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const stateLabel = useStateLabel();
  const look = stateLook(status.state, colors);
  const what = status.booking
    ? (status.booking.title ?? t(`activities.${status.booking.activity}`))
    : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[area.space?.name, stateLabel(status), what].filter(Boolean).join(", ")}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        styles.field,
        {
          backgroundColor: colors.turf,
          borderColor: selected ? colors.accent : colors.pitchLine,
          borderWidth: selected ? 3 : 1.5,
        },
        pressed && styles.pressed,
      ]}
    >
      <Stripes color={colors.turfStripe} />
      <Markings marking={area.marking ?? "full"} color={colors.pitchLine} />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: look.overlay }]}
      />
      <View pointerEvents="none" style={styles.fieldContent}>
        <Text
          style={[styles.fieldName, { color: colors.onTurf, textShadowColor: colors.turfShadow }]}
        >
          {area.short}
        </Text>
        <View style={[styles.pill, { backgroundColor: colors.surface }]}>
          <View style={[styles.dot, { backgroundColor: look.fg }]} />
          <Text numberOfLines={1} style={[styles.pillText, { color: colors.text }]}>
            {stateLabel(status)}
          </Text>
        </View>
        {what ? (
          <Text
            numberOfLines={1}
            style={[styles.fieldWhat, { color: colors.onTurf, textShadowColor: colors.turfShadow }]}
          >
            {what}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Room({ area, style, status, selected, onPress }: AreaProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const stateLabel = useStateLabel();
  const look = stateLook(status.state, colors);
  const what = status.booking
    ? (status.booking.title ?? t(`activities.${status.booking.activity}`))
    : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[area.space?.name, stateLabel(status), what].filter(Boolean).join(", ")}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        styles.room,
        {
          backgroundColor: look.soft,
          borderColor: selected ? colors.primary : look.fg,
          borderWidth: selected ? 3 : 1.5,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.roomDot, { backgroundColor: look.fg }]} />
      <Text numberOfLines={2} style={[styles.roomLabel, { color: colors.text }]}>
        {area.short}
      </Text>
      {status.state !== "free" && area.w >= 30 ? (
        <Text numberOfLines={1} style={[styles.roomUntil, { color: look.fg }]}>
          {t("bookings.until", { time: clockTime(status.until ?? "") })}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Combination({
  combo,
  unit,
  status,
  selected,
  onPress,
}: {
  combo: PlacedCombination;
  unit: number;
  status: AreaStatus;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const stateLabel = useStateLabel();
  const look = stateLook(status.state, colors);
  const pad = 0.8 * unit;
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.outline,
          {
            left: combo.x * unit - pad,
            top: combo.y * unit - pad,
            width: combo.w * unit + 2 * pad,
            height: combo.h * unit + 2 * pad,
            borderColor: selected ? colors.primary : colors.textMuted,
            borderWidth: selected ? 2 : 1,
          },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${combo.space.name}, ${stateLabel(status)}`}
        accessibilityState={{ selected }}
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [
          styles.tab,
          {
            top: combo.y * unit - pad - 12,
            left: (combo.x + combo.w / 2) * unit - 52,
            backgroundColor: selected ? colors.primary : colors.surface,
            borderColor: selected ? colors.primary : colors.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: selected ? colors.onPrimary : look.fg }]} />
        <Text
          numberOfLines={1}
          style={[styles.tabText, { color: selected ? colors.onPrimary : colors.text }]}
        >
          {combo.space.name}
        </Text>
      </Pressable>
    </>
  );
}

/** Mowing stripes across a pitch. */
function Stripes({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.stripes]}>
      {Array.from({ length: 8 }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decoration
          key={i}
          style={[styles.stripe, { backgroundColor: i % 2 === 0 ? color : "transparent" }]}
        />
      ))}
    </View>
  );
}

/** Pitch lines: touchlines, halfway line, centre circle and penalty boxes. */
function Markings({ marking, color }: { marking: Marking; color: string }) {
  const line = { borderColor: color, borderWidth: 1.5 };
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.markings]}>
      <View style={[StyleSheet.absoluteFill, line]}>
        {marking === "full" ? (
          <>
            <View style={[styles.halfway, { backgroundColor: color }]} />
            <View style={[styles.circle, line]} />
            <View style={[styles.boxLeft, line]} />
            <View style={[styles.boxRight, line]} />
          </>
        ) : (
          <>
            <View style={[marking === "half-left" ? styles.boxLeft : styles.boxRight, line]} />
            <View
              style={[
                styles.halfCircle,
                marking === "half-left" ? styles.halfCircleRight : styles.halfCircleLeft,
                line,
              ]}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plan: { width: "100%", borderRadius: radius.lg, overflow: "hidden" },
  building: { borderWidth: 1 },
  lane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1 },
  field: { borderRadius: 6, overflow: "hidden" },
  pressed: { opacity: 0.85 },
  stripes: { flexDirection: "row" },
  stripe: { flex: 1 },
  markings: { padding: "6%" },
  halfway: { position: "absolute", left: "50%", top: 0, bottom: 0, width: 1.5 },
  circle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 34,
    height: 34,
    marginLeft: -17,
    marginTop: -17,
    borderRadius: 17,
  },
  boxLeft: { position: "absolute", left: -1.5, top: "25%", width: "16%", height: "50%" },
  boxRight: { position: "absolute", right: -1.5, top: "25%", width: "16%", height: "50%" },
  halfCircle: {
    position: "absolute",
    top: "50%",
    width: 34,
    height: 34,
    marginTop: -17,
    borderRadius: 17,
  },
  halfCircleRight: { right: -17 },
  halfCircleLeft: { left: -17 },
  fieldContent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
  },
  fieldName: {
    fontSize: fontSize.md,
    fontWeight: "800",
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  fieldWhat: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    maxWidth: "100%",
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    maxWidth: "100%",
  },
  pillText: { fontSize: fontSize.xs, fontWeight: "700", flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  room: {
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
  },
  roomDot: { position: "absolute", top: 5, right: 5, width: 8, height: 8, borderRadius: 4 },
  roomLabel: { fontSize: 11, fontWeight: "700", textAlign: "center" },
  roomUntil: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  fixed: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  outline: { position: "absolute", borderRadius: 10, borderStyle: "dashed" },
  tab: {
    position: "absolute",
    width: 104,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  tabText: { fontSize: fontSize.xs, fontWeight: "700" },
});
