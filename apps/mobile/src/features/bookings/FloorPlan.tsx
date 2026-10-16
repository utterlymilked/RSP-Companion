import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { type Colors, fontSize, radius, spacing, useColors } from "../../theme";
import type { BookingSummary, SpaceState, SpaceSummary } from "./occupancy";
import { usePartLabel } from "./PartPicker";
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
  /** Shown instead of "Livre até 18:00", e.g. "2 reservas" on a day other than today. */
  label?: string;
}

interface Props {
  areas: PlacedArea[];
  combinations: PlacedCombination[];
  status: (spaceId: string) => AreaStatus;
  selectedId: string | null;
  onSelect: (spaceId: string) => void;
  /**
   * All spaces. When the selected one is a part of a pitch, that pitch is drawn split into the
   * parts of the same division, each tappable and coloured by its own state.
   */
  spaces?: SpaceSummary[];
  /** Fields (with the track) or the building's rooms; both when absent. */
  part?: "fields" | "rooms";
}

/** Plan rows each part covers (see PLAN_BACKDROP: the track above, the building below). */
const PARTS = { fields: { top: 0, bottom: 98 }, rooms: { top: 99, bottom: PLAN_HEIGHT } };

/** Width used before the plan is measured (and in tests, where layout never runs). */
const FALLBACK_WIDTH = 340;

/**
 * The club's complex seen from above: fields, the athletics track and the building's rooms,
 * each coloured by whether it is free at the chosen time. Tapping a space selects it.
 */
export function FloorPlan({
  areas: allAreas,
  combinations: allCombinations,
  status,
  selectedId,
  onSelect,
  part,
  spaces = [],
}: Props) {
  const colors = useColors();
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const unit = width / 100;
  const { top, bottom } = part ? PARTS[part] : { top: 0, bottom: PLAN_HEIGHT };
  const inPart = (r: { y: number; h: number }) => r.y >= top && r.y + r.h <= bottom;
  const areas = allAreas.filter(inPart);
  const combinations = allCombinations.filter(inPart);
  const box = (r: { x: number; y: number; w: number; h: number }): ViewStyle => ({
    position: "absolute",
    left: r.x * unit,
    top: (r.y - top) * unit,
    width: r.w * unit,
    height: r.h * unit,
  });
  const { track, building } = PLAN_BACKDROP;
  const selectedSpace = spaces.find((s) => s.id === selectedId);
  const splitIds = new Set(selectedSpace?.parentId ? [selectedSpace.parentId] : []);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.plan, { height: (bottom - top) * unit, backgroundColor: colors.surfaceAlt }]}
    >
      {inPart(track) ? (
        <View
          style={[
            box(track),
            { backgroundColor: colors.track, borderRadius: (track.h * unit) / 2 },
          ]}
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
      ) : null}
      {inPart(building) ? (
        <View
          style={[
            box(building),
            {
              backgroundColor: colors.building,
              borderColor: colors.border,
              borderRadius: radius.sm,
            },
            styles.building,
          ]}
        />
      ) : null}
      {areas.map((area) =>
        area.kind === "field" && area.space ? (
          <Field
            key={area.short}
            area={area}
            split={splitIds.has(area.space.id)}
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
      {areas.map((area) => {
        const selected = spaces.find((s) => s.id === selectedId);
        if (!area.space || !selected || selected.parentId !== area.space.id) return null;
        const cells = spaces
          .filter(
            (s) => s.active && s.parentId === area.space?.id && s.partCount === selected.partCount,
          )
          .sort((a, b) => (a.partIndex ?? 0) - (b.partIndex ?? 0));
        return (
          <PartCells
            key={`parts-${area.short}`}
            style={box(area)}
            cells={cells}
            status={status}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        );
      })}
      {combinations.map((combo) => (
        <Combination
          key={combo.space.id}
          combo={combo}
          unit={unit}
          top={top}
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
    if (s.label) return s.label;
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
  /** The pitch is drawn as its parts, which carry the status instead. */
  split?: boolean;
  style: ViewStyle;
  status: AreaStatus;
  selected: boolean;
  onPress: () => void;
}

function Field({ area, split, style, status, selected, onPress }: AreaProps) {
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
      <View pointerEvents="none" style={[styles.fieldContent, split && styles.hidden]}>
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
        ) : area.space && area.space.divisions.length > 0 ? (
          <Text
            numberOfLines={1}
            style={[styles.fieldWhat, { color: colors.onTurf, textShadowColor: colors.turfShadow }]}
          >
            {area.space.divisions.map((n) => t(`bookings.parts.division${n}`)).join(" · ")}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * The parts of a pitch side by side over the pitch itself, along its length: each shows its
 * mark (A, B or 1, 2, 3), its state and, when taken, who holds it.
 */
function PartCells({
  style,
  cells,
  status,
  selectedId,
  onSelect,
}: {
  style: ViewStyle;
  cells: SpaceSummary[];
  status: (spaceId: string) => AreaStatus;
  selectedId: string | null;
  onSelect: (spaceId: string) => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  const partLabel = usePartLabel();
  return (
    <View style={[style, styles.cells]}>
      {cells.map((cell) => {
        const s = status(cell.id);
        const look = stateLook(s.state, colors);
        const selected = cell.id === selectedId;
        const who = s.booking ? (s.booking.teamName ?? s.booking.departmentName) : null;
        return (
          <Pressable
            key={cell.id}
            accessibilityRole="button"
            accessibilityLabel={[partLabel(cell), t(`bookings.state.${s.state}`), who]
              .filter(Boolean)
              .join(", ")}
            accessibilityState={{ selected }}
            onPress={() => onSelect(cell.id)}
            style={({ pressed }) => [
              styles.cell,
              {
                backgroundColor: look.overlay === "transparent" ? "rgba(0,0,0,0.12)" : look.overlay,
                borderColor: selected ? colors.accent : colors.pitchLine,
                borderWidth: selected ? 3 : 1.5,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.cellMark,
                { color: colors.onTurf, textShadowColor: colors.turfShadow },
              ]}
            >
              {cell.partCount === 2
                ? String.fromCharCode(64 + (cell.partIndex ?? 1))
                : cell.partIndex}
            </Text>
            <View style={[styles.dot, { backgroundColor: look.fg }]} />
            {who ? (
              <Text
                numberOfLines={2}
                style={[
                  styles.cellWho,
                  { color: colors.onTurf, textShadowColor: colors.turfShadow },
                ]}
              >
                {who}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
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
      {status.label && area.w >= 30 ? (
        <Text numberOfLines={1} style={[styles.roomUntil, { color: look.fg }]}>
          {status.label}
        </Text>
      ) : status.state !== "free" && area.w >= 30 ? (
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
  top,
  status,
  selected,
  onPress,
}: {
  combo: PlacedCombination;
  unit: number;
  /** First plan row drawn, so the outline lines up with a cropped plan. */
  top: number;
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
            top: (combo.y - top) * unit - pad,
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
            top: (combo.y - top) * unit - pad - 12,
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
  hidden: { opacity: 0 },
  cells: { flexDirection: "row", borderRadius: 6, overflow: "hidden" },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, padding: 2 },
  cellMark: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  cellWho: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
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
