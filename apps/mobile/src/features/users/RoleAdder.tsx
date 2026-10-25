import type { Role } from "@rsc/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { spacing } from "../../theme";
import { Button } from "../../ui/Button";
import { Choice } from "../../ui/Choice";

interface Props {
  /** Roles offered (a segmented control for 2-5, otherwise a searchable select). */
  roles: readonly Role[];
  /** Roles already held: shown greyed out instead of offered twice. */
  taken: readonly Role[];
  onAdd: (role: Role) => void;
  busy?: boolean;
  label?: string;
}

/** Picks one role to add. Which teams a coach or delegado works with is set separately. */
export function RoleAdder({ roles, taken, onAdd, busy, label }: Props) {
  const { t } = useTranslation();
  const [role, setRole] = useState<Role | null>(null);
  return (
    <View style={{ gap: spacing.sm }}>
      <Choice
        label={label ?? t("users.role")}
        value={role}
        onChange={setRole}
        options={roles.map((r) => {
          const already = taken.includes(r);
          return {
            value: r,
            label: t(`roles.${r}`),
            disabled: already,
            hint: already ? t("users.alreadyHeld") : undefined,
          };
        })}
      />
      <Button
        label={t("users.addRole")}
        icon="add"
        variant="secondary"
        disabled={role === null || taken.includes(role)}
        busy={busy}
        onPress={() => {
          if (role === null || taken.includes(role)) return;
          onAdd(role);
          setRole(null);
        }}
      />
    </View>
  );
}
