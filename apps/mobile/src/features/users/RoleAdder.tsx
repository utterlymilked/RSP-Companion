import { isScopedRole, type Role, type RoleGrantInput } from "@rsc/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { spacing } from "../../theme";
import { Button } from "../../ui/Button";
import { Choice } from "../../ui/Choice";
import { Select } from "../../ui/Select";
import { type ScopeValue, scopeIds, scopeValue, useScopeOptions } from "./scopes";

interface Props {
  /** Roles offered (a segmented control for 2-5, otherwise a searchable select). */
  roles: readonly Role[];
  /** Grants already held: shown greyed out instead of offered twice. */
  taken: readonly RoleGrantInput[];
  onAdd: (grant: RoleGrantInput) => void;
  busy?: boolean;
  label?: string;
}

/**
 * Picks one role to add and, for coach and delegado, the team or class it applies to. Used by
 * the user screen (any role) and the invite form (team roles).
 */
export function RoleAdder({ roles, taken, onAdd, busy, label }: Props) {
  const { t } = useTranslation();
  const scopes = useScopeOptions();
  const [role, setRole] = useState<Role | null>(roles.length === 1 ? (roles[0] ?? null) : null);
  const [scope, setScope] = useState<ScopeValue | null>(null);
  const scoped = role !== null && isScopedRole(role);
  const held = (r: Role, s: ScopeValue | null) =>
    taken.some((g) => g.role === r && scopeValue(g) === s);

  const grant: RoleGrantInput | null =
    role === null
      ? null
      : scoped
        ? scope
          ? { role, ...scopeIds(scope) }
          : null
        : { role, teamId: null, classId: null };
  const ready = grant !== null && !held(grant.role, scopeValue(grant));

  return (
    <View style={{ gap: spacing.sm }}>
      <Choice
        label={label ?? t("users.role")}
        value={role}
        onChange={(r) => {
          setRole(r);
          setScope(null);
        }}
        options={roles.map((r) => {
          const already = !isScopedRole(r) && held(r, null);
          return {
            value: r,
            label: t(`roles.${r}`),
            disabled: already,
            hint: already ? t("users.alreadyHeld") : undefined,
          };
        })}
      />
      {scoped ? (
        <Select
          icon="people-outline"
          label={t("users.scope.label")}
          value={scope}
          onChange={setScope}
          loading={scopes.loading}
          options={scopes.options.map((o) =>
            held(role, o.value) ? { ...o, disabled: true, hint: t("users.alreadyHeld") } : o,
          )}
        />
      ) : null}
      <Button
        label={t("users.addRole")}
        icon="add"
        variant="secondary"
        disabled={!ready}
        busy={busy}
        onPress={() => {
          if (!grant || !ready) return;
          onAdd(grant);
          setScope(null);
          if (roles.length > 1) setRole(null);
        }}
      />
    </View>
  );
}
