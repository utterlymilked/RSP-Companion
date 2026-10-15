import { HEALTH_DISCIPLINES, type Permission } from "@rsc/shared";

/** Bottom tabs. A tab with a permission is hidden from users without it (the API refuses too). */
export const TABS = [
  { name: "index", titleKey: "tabs.home", icon: "home" },
  { name: "people", titleKey: "tabs.people", icon: "people-circle", permission: "people.read" },
  { name: "teams", titleKey: "tabs.teams", icon: "shirt", permission: "teams.read" },
  { name: "users", titleKey: "tabs.users", icon: "people", permission: "users.manage" },
  { name: "account", titleKey: "tabs.account", icon: "person-circle" },
] as const satisfies readonly {
  name: string;
  titleKey: string;
  icon: string;
  permission?: Permission;
}[];

export type TabName = (typeof TABS)[number]["name"];

export function canOpenTab(name: TabName, permissions: readonly Permission[]): boolean {
  const tab = TABS.find((t) => t.name === name);
  return !!tab && (!("permission" in tab) || permissions.includes(tab.permission));
}

/** Areas the home screen lists, each shown to users holding any of its permissions. */
const AREAS: { key: string; anyOf: readonly Permission[] }[] = [
  { key: "people", anyOf: ["people.read", "teams.read"] },
  { key: "availability", anyOf: ["availability.read"] },
  { key: "health", anyOf: HEALTH_DISCIPLINES.map((d) => `health.${d}.read` as const) },
  { key: "audit", anyOf: ["audit.read"] },
];

export function areasFor(permissions: readonly Permission[]): string[] {
  return AREAS.filter((a) => a.anyOf.some((p) => permissions.includes(p))).map((a) => a.key);
}
