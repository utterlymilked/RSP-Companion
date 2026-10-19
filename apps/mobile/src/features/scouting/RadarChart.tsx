import { Platform, View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from "react-native-svg";
import { fontSize, useColors } from "../../theme";

export interface RadarSeries {
  label: string;
  /** One value per axis (same order), 0 to `max`; missing values draw as 0. */
  values: (number | undefined)[];
  color: string;
}

interface Props {
  axes: string[];
  series: RadarSeries[];
  max?: number;
  size?: number;
  /** Hide axis labels (for small previews). */
  compact?: boolean;
}

const RINGS = 5;
const RING_IDS = Array.from({ length: RINGS }, (_, i) => i);

/** A radar (spider) chart of one or more series over the same axes. */
export function RadarChart({ axes, series, max = 10, size = 300, compact }: Props) {
  const colors = useColors();
  const pad = compact ? 6 : 72;
  const c = size / 2;
  const r = c - pad;
  const n = axes.length;
  if (n < 3) return null;
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const point = (i: number, value: number) => {
    const k = (Math.max(0, Math.min(max, value)) / max) * r;
    return `${c + k * Math.cos(angle(i))},${c + k * Math.sin(angle(i))}`;
  };
  const ring = (k: number) => axes.map((_, i) => point(i, (max * k) / RINGS)).join(" ");
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={axes
        .map((a, i) => `${a}: ${series.map((s) => s.values[i] ?? "-").join(" / ")}`)
        .join(", ")}
      style={{ width: size, height: size, alignSelf: "center" }}
    >
      <Svg width={size} height={size}>
        {RING_IDS.map((k) => (
          <Polygon
            key={k}
            points={ring(k + 1)}
            fill={k === RINGS - 1 ? colors.surfaceAlt : "none"}
            fillOpacity={k === RINGS - 1 ? 0.5 : 1}
            stroke={colors.border}
            strokeWidth={1}
          />
        ))}
        {axes.map((a, i) => {
          const [x, y] = point(i, max).split(",").map(Number) as [number, number];
          return (
            <Line key={a} x1={c} y1={c} x2={x} y2={y} stroke={colors.border} strokeWidth={1} />
          );
        })}
        {series.map((s) => (
          <G key={s.label}>
            <Polygon
              points={axes.map((_, i) => point(i, s.values[i] ?? 0)).join(" ")}
              fill={s.color}
              fillOpacity={0.22}
              stroke={s.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            {compact
              ? null
              : axes.map((_, i) => {
                  const [x, y] = point(i, s.values[i] ?? 0)
                    .split(",")
                    .map(Number) as [number, number];
                  return <Circle key={axes[i]} cx={x} cy={y} r={3.5} fill={s.color} />;
                })}
          </G>
        ))}
        {compact
          ? null
          : axes.map((a, i) => {
              const lx = c + (r + 12) * Math.cos(angle(i));
              const ly = c + (r + 12) * Math.sin(angle(i));
              const cos = Math.cos(angle(i));
              return (
                <SvgText
                  key={a}
                  x={lx}
                  y={ly + 4}
                  fontSize={fontSize.xs}
                  fontFamily={Platform.OS === "web" ? "Inter, system-ui, sans-serif" : undefined}
                  fill={colors.textMuted}
                  textAnchor={Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end"}
                >
                  {a}
                </SvgText>
              );
            })}
      </Svg>
    </View>
  );
}
