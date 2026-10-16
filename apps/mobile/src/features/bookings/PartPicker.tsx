import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { spacing } from "../../theme";
import { Choice } from "../../ui/Choice";
import type { SpaceSummary } from "./occupancy";
import { partsOf, pitchOf } from "./planLayout";

/** "Metade A", "Terço 2": the part's label in the app's language. */
export function usePartLabel() {
  const { t } = useTranslation();
  return (space: Pick<SpaceSummary, "partCount" | "partIndex">) =>
    space.partCount && space.partIndex
      ? t(`bookings.parts.name.${space.partCount}`, {
          mark: space.partCount === 2 ? String.fromCharCode(64 + space.partIndex) : space.partIndex,
        })
      : "";
}

/**
 * How a divisible pitch is booked: whole, or in halves, thirds or quarters (whatever the
 * office configured), and which part. Nothing is shown for a space that cannot be divided.
 * Picking a division selects its first part; the plan draws the parts once one is selected.
 */
export function PartPicker({
  space,
  spaces,
  onSelect,
}: {
  space: SpaceSummary;
  spaces: SpaceSummary[];
  onSelect: (spaceId: string) => void;
}) {
  const { t } = useTranslation();
  const partLabel = usePartLabel();
  const pitch = pitchOf(space, spaces);
  const divisions = pitch.divisions.filter((n) => partsOf(spaces, pitch.id, n).length === n);
  if (divisions.length === 0) return null;
  const count = space.partCount ?? 1;
  const parts = count > 1 ? partsOf(spaces, pitch.id, count) : [];
  return (
    <View style={styles.wrap}>
      <Choice
        label={t("bookings.parts.division")}
        value={String(count)}
        onChange={(value) => {
          const n = Number(value);
          onSelect(n === 1 ? pitch.id : (partsOf(spaces, pitch.id, n)[0]?.id ?? pitch.id));
        }}
        options={[
          { value: "1", label: t("bookings.parts.division1") },
          ...divisions.map((n) => ({ value: String(n), label: t(`bookings.parts.division${n}`) })),
        ]}
      />
      {parts.length > 0 ? (
        <Choice
          label={t("bookings.parts.part")}
          value={space.id}
          onChange={onSelect}
          options={parts.map((p) => ({ value: p.id, label: partLabel(p) }))}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: spacing.sm } });
