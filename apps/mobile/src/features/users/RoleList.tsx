import type { RoleGrantInput } from "@rsc/shared";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import { fontSize, radius, spacing, touchTarget, useColors } from "../../theme";
import { Button } from "../../ui/Button";
import { useScopeOptions } from "./scopes";

/**
 * One role in a list: its name, the team or class for coach and delegado, and a remove
 * action. `scopeName` wins over the name looked up from the teams list.
 */
export function GrantRow({
  grant,
  scopeName,
  onRemove,
  busy,
}: {
  grant: RoleGrantInput;
  scopeName?: string | null;
  onRemove?: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const { nameOf } = useScopeOptions();
  const where = scopeName ?? (grant.teamId || grant.classId ? nameOf(grant) : null);
  const label = t(`roles.${grant.role}`);
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.texts}>
        <Text style={[styles.title, { color: colors.text }]}>{label}</Text>
        {where ? <Text style={[styles.sub, { color: colors.textMuted }]}>{where}</Text> : null}
      </View>
      {onRemove ? (
        <Button
          label={t("users.removeRole")}
          accessibilityLabel={t("users.removeRoleNamed", {
            role: where ? `${label} (${where})` : label,
          })}
          variant="ghost"
          compact
          busy={busy}
          onPress={onRemove}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget + 8,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.md, fontWeight: "600" },
  sub: { fontSize: fontSize.sm },
});
