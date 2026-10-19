import {
  type ArchetypeKey,
  ATTRIBUTES,
  type AttributeKey,
  attributesFor,
  type PositionGroup,
  percentileIn,
  type Scores,
} from "@rsc/shared";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useWindowDimensions } from "react-native";
import { api } from "../../api";
import { jsonOrThrow } from "../../errors";

/** Radar series colours (CVD-safe pair plus two more for comparisons of up to four). */
export const SERIES_COLORS = ["#0863B0", "#E5842B", "#18794E", "#9B3FB5"] as const;

/** Axis label for charts: the short name when there is one, else the name cut to fit. */
export const axisLabel = (t: TFunction, key: AttributeKey) => {
  const label = t(`scoutingModel.attribute.${key}`);
  const short = t(`scoutingModel.attributeShort.${key}`, { defaultValue: label });
  return short.length > 11 ? `${short.slice(0, 10)}…` : short;
};

/** Every prospect with its profile; the pool for percentiles and for picking who to compare. */
export function useProspectPool() {
  return useQuery({
    queryKey: ["scouting", "pool"],
    queryFn: async () => jsonOrThrow(await api.scouting.prospects.$get({ query: {} })),
  });
}

/** Percentile of each rated attribute among pool members of the same group; null under 5. */
export function attributePercentiles(
  pool: { profile: { group: PositionGroup; scores: Scores } }[],
  group: PositionGroup,
  scores: Scores,
): { percentiles: Scores; size: number } | null {
  const peers = pool.filter((p) => p.profile.group === group);
  if (peers.length < 5) return null;
  const out: Scores = {};
  for (const key of attributesFor(group)) {
    const value = scores[key];
    if (value === undefined) continue;
    const values = peers
      .map((p) => p.profile.scores[key])
      .filter((v): v is number => v !== undefined);
    out[key] = percentileIn(values, value) / 10; // 0-100 drawn on the 0-10 axis
  }
  return { percentiles: out, size: peers.length };
}

export const cornerOf = (key: AttributeKey) => ATTRIBUTES[key].corner;
export type { ArchetypeKey };

/** Radar size that fits the card on phones and grows on desktop (card padding and gutters removed). */
export const useRadarSize = (max = 420) => Math.min(useWindowDimensions().width - 74, max);
