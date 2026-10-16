import { HEALTH_DISCIPLINES, type Permission } from "@rsc/shared";

/** Bottom tabs. A tab with a permission is hidden from users without it (the API refuses too). */
export const TABS = [
  { name: "index", titleKey: "tabs.home", icon: "home" },
  { name: "notifications", titleKey: "tabs.notifications", icon: "notifications" },
  { name: "people", titleKey: "tabs.people", icon: "people-circle", permission: "people.read" },
  { name: "teams", titleKey: "tabs.teams", icon: "shirt", permission: "teams.read" },
  {
    name: "bookings",
    titleKey: "tabs.bookings",
    icon: "calendar",
    permission: "bookings.read",
  },
  {
    name: "events",
    titleKey: "tabs.events",
    icon: "football",
    permission: "events.read",
  },
  {
    name: "incidents",
    titleKey: "tabs.incidents",
    icon: "alert-circle",
    permission: "incidents.read",
  },
  {
    name: "equipment",
    titleKey: "tabs.equipment",
    icon: "cube",
    permission: "equipment.read",
  },
  {
    name: "documents",
    titleKey: "tabs.documents",
    icon: "document-text",
    permission: "documents.read",
  },
  { name: "fees", titleKey: "tabs.fees", icon: "wallet", permission: "fees.read" },
  {
    name: "scouting",
    titleKey: "tabs.scouting",
    icon: "search",
    permission: "scouting.read",
  },
  {
    name: "health",
    titleKey: "tabs.health",
    icon: "medkit",
    anyOf: ["availability.read", ...HEALTH_DISCIPLINES.map((d) => `health.${d}.read` as const)],
  },
  { name: "users", titleKey: "tabs.users", icon: "people", permission: "users.manage" },
  { name: "account", titleKey: "tabs.account", icon: "person-circle" },
] as const satisfies readonly {
  name: string;
  titleKey: string;
  icon: string;
  permission?: Permission;
  anyOf?: readonly Permission[];
}[];

export type TabName = (typeof TABS)[number]["name"];

export function canOpenTab(name: TabName, permissions: readonly Permission[]): boolean {
  const tab = TABS.find((t) => t.name === name);
  if (!tab) return false;
  if ("anyOf" in tab) return tab.anyOf.some((p) => permissions.includes(p));
  return !("permission" in tab) || permissions.includes(tab.permission);
}

/** Areas the home screen lists, each shown to users holding any of its permissions. */
const AREAS: { key: string; anyOf: readonly Permission[] }[] = [
  { key: "people", anyOf: ["people.read", "teams.read"] },
  { key: "availability", anyOf: ["availability.read"] },
  { key: "health", anyOf: HEALTH_DISCIPLINES.map((d) => `health.${d}.read` as const) },
  { key: "documents", anyOf: ["documents.read"] },
  { key: "audit", anyOf: ["audit.read"] },
];

export function areasFor(permissions: readonly Permission[]): string[] {
  return AREAS.filter((a) => a.anyOf.some((p) => permissions.includes(p))).map((a) => a.key);
}
