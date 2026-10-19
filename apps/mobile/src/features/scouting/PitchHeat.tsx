import { HEAT_COLS, HEAT_MAX, HEAT_ROWS, HEAT_ZONES } from "@rsc/shared";
import { Pressable, View } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { useColors } from "../../theme";

const COLS = Array.from({ length: HEAT_COLS }, (_, i) => i);
const ZONES = Array.from({ length: HEAT_ZONES }, (_, i) => i);

/** Yellow (a little) through orange to red (a lot). */
const heatColor = (k: number) => {
  const mix = (a: number, b: number) => Math.round(a + (b - a) * k);
  return `rgb(${mix(255, 229)}, ${mix(226, 52)}, ${mix(44, 43)})`;
};

interface Props {
  /** `HEAT_ZONES` intensities 0-`HEAT_MAX` (fractions allowed), row-major; our goal on the left. */
  heat: number[] | null;
  width?: number;
  /** When given, tapping a zone calls it with the zone index (editing). */
  onZone?: (zone: number) => void;
  /** Accessible names for the zones, e.g. "Zona 4 de 18, intensidade 2". */
  zoneLabel?: (zone: number, level: number) => string;
}

/** A pitch with the 6x3 zone heat map; the attacking direction is left to right. */
export function PitchHeat({ heat, width = 320, onZone, zoneLabel }: Props) {
  const colors = useColors();
  const height = (width * 68) / 105;
  const cw = width / HEAT_COLS;
  const ch = height / HEAT_ROWS;
  const line = colors.pitchLine;
  return (
    <View style={{ width, height, alignSelf: "center", borderRadius: 12, overflow: "hidden" }}>
      <Svg width={width} height={height}>
        <Rect width={width} height={height} fill={colors.turf} />
        {COLS.map((i) =>
          i % 2 === 0 ? (
            <Rect key={i} x={i * cw} width={cw} height={height} fill={colors.turfStripe} />
          ) : null,
        )}
        {ZONES.map((z) => {
          const level = Math.max(0, Math.min(HEAT_MAX, heat?.[z] ?? 0));
          return level > 0 ? (
            <Rect
              key={z}
              x={(z % HEAT_COLS) * cw}
              y={Math.floor(z / HEAT_COLS) * ch}
              width={cw}
              height={ch}
              fill={heatColor(level / HEAT_MAX)}
              fillOpacity={0.5 + (level / HEAT_MAX) * 0.4}
            />
          ) : null;
        })}
        <Rect
          x={1}
          y={1}
          width={width - 2}
          height={height - 2}
          fill="none"
          stroke={line}
          strokeWidth={2}
        />
        <Line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke={line} strokeWidth={2} />
        <Circle
          cx={width / 2}
          cy={height / 2}
          r={height * 0.14}
          fill="none"
          stroke={line}
          strokeWidth={2}
        />
        <Rect
          x={1}
          y={height * 0.2}
          width={width * 0.16}
          height={height * 0.6}
          fill="none"
          stroke={line}
          strokeWidth={2}
        />
        <Rect
          x={width - width * 0.16 - 1}
          y={height * 0.2}
          width={width * 0.16}
          height={height * 0.6}
          fill="none"
          stroke={line}
          strokeWidth={2}
        />
        <Rect
          x={1}
          y={height * 0.36}
          width={width * 0.05}
          height={height * 0.28}
          fill="none"
          stroke={line}
          strokeWidth={2}
        />
        <Rect
          x={width - width * 0.05 - 1}
          y={height * 0.36}
          width={width * 0.05}
          height={height * 0.28}
          fill="none"
          stroke={line}
          strokeWidth={2}
        />
      </Svg>
      {onZone ? (
        <View style={{ position: "absolute", inset: 0, flexDirection: "row", flexWrap: "wrap" }}>
          {ZONES.map((z) => {
            const level = heat?.[z] ?? 0;
            return (
              <Pressable
                key={z}
                accessibilityRole="button"
                accessibilityLabel={zoneLabel?.(z, level)}
                onPress={() => onZone(z)}
                style={{ width: cw, height: ch, borderWidth: 0.5, borderColor: colors.pitchLine }}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
