import type { RoleGrantInput } from "@rsc/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { jsonOrThrow } from "../../errors";
import type { SelectOption } from "../../ui/Select";

/** A team or class a coach or delegado role applies to, as one select value. */
export type ScopeValue = `team:${string}` | `class:${string}`;

export const scopeValue = (g: Pick<RoleGrantInput, "teamId" | "classId">): ScopeValue | null =>
  g.teamId ? `team:${g.teamId}` : g.classId ? `class:${g.classId}` : null;

export function scopeIds(value: ScopeValue): { teamId: string | null; classId: string | null } {
  const [kind, id] = value.split(":") as ["team" | "class", string];
  return kind === "team" ? { teamId: id, classId: null } : { teamId: null, classId: id };
}

/** Teams and classes (turmas) as select options, teams first, each with its kind as hint. */
export function useScopeOptions() {
  const { t } = useTranslation();
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: async () => jsonOrThrow(await api.teams.$get({ query: {} })),
  });
  const classes = useQuery({
    queryKey: ["classes"],
    queryFn: async () => jsonOrThrow(await api.classes.$get({ query: {} })),
  });
  const options: SelectOption<ScopeValue>[] = [
    ...(teams.data?.teams ?? []).map((team) => ({
      value: `team:${team.id}` as const,
      label: team.name,
      hint: t("users.scope.team"),
    })),
    ...(classes.data?.classes ?? []).map((c) => ({
      value: `class:${c.id}` as const,
      label: c.name ?? c.code,
      hint: t("users.scope.class"),
    })),
  ];
  const nameOf = (g: Pick<RoleGrantInput, "teamId" | "classId">) =>
    options.find((o) => o.value === scopeValue(g))?.label ?? null;
  return { options, nameOf, loading: teams.isPending || classes.isPending };
}
