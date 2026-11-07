import { HEALTH_DISCIPLINES, type ModuleId, type Permission } from "@rsc/shared";
import type { Href } from "expo-router";

type Access = { permission?: Permission; anyOf?: readonly Permission[]; module?: ModuleId };

const HEALTH_ACCESS = [
  "availability.read",
  ...HEALTH_DISCIPLINES.map((d) => `health.${d}.read` as const),
] as const satisfies readonly Permission[];

/**
 * Screens of the signed-in area. Only four sit in the bottom bar (`bar: true`): reservations,
 * scouting, profile and settings; the rest open from the settings tab ("Definições"), which keeps
 * the bar readable on a phone. A screen shows only when its module is on (ADR 0025) and the user
 * has its permission (the API refuses too).
 */
export const TABS = [
  {
    name: "bookings",
    titleKey: "tabs.bookings",
    icon: "business",
    bar: true,
    module: "reservations",
    permission: "bookings.read",
  },
  {
    name: "scouting",
    titleKey: "tabs.scouting",
    barLabelKey: "tabs.scoutingBar",
    icon: "search",
    bar: true,
    module: "scouting",
    permission: "athletes.read",
  },
  {
    name: "account",
    titleKey: "tabs.account",
    icon: "person-circle",
    bar: true,
    module: "profile",
  },
  { name: "more", titleKey: "tabs.more", icon: "settings", bar: true, module: "settings" },
  { name: "index", titleKey: "tabs.home", icon: "home", module: "home" },
  {
    name: "events",
    titleKey: "tabs.events",
    icon: "calendar",
    module: "events",
    permission: "events.read",
  },
  {
    name: "notifications",
    titleKey: "tabs.notifications",
    icon: "chatbubbles",
    module: "notifications",
  },
  {
    name: "people",
    titleKey: "tabs.people",
    icon: "people",
    module: "persons",
    permission: "people.read",
  },
  {
    name: "teams",
    titleKey: "tabs.teams",
    icon: "shirt",
    module: "teams",
    permission: "teams.read",
  },
  {
    name: "incidents",
    titleKey: "tabs.incidents",
    icon: "alert-circle",
    module: "incidents",
    permission: "incidents.read",
  },
  {
    name: "equipment",
    titleKey: "tabs.equipment",
    icon: "cube",
    module: "equipment",
    permission: "equipment.read",
  },
  {
    name: "documents",
    titleKey: "tabs.documents",
    icon: "document-text",
    module: "documents",
    permission: "documents.read",
  },
  { name: "fees", titleKey: "tabs.fees", icon: "wallet", module: "fees", permission: "fees.read" },
  {
    name: "health",
    titleKey: "tabs.health",
    icon: "medkit",
    module: "health",
    anyOf: HEALTH_ACCESS,
  },
  {
    name: "import",
    titleKey: "tabs.import",
    icon: "cloud-upload",
    module: "persons",
    permission: "people.write",
  },
  {
    name: "users",
    titleKey: "tabs.users",
    icon: "key",
    module: "users",
    permission: "users.manage",
  },
  {
    name: "spaces",
    titleKey: "tabs.spaces",
    icon: "map",
    module: "reservations",
    permission: "facilities.write",
  },
  {
    name: "modules",
    titleKey: "tabs.modules",
    icon: "toggle",
    module: "settings",
    permission: "modules.manage",
  },
] as const satisfies readonly ({
  name: string;
  titleKey: string;
  icon: string;
  bar?: boolean;
  /** Shorter label for the bottom bar when the title is too long to fit. */
  barLabelKey?: string;
} & Access)[];

export type TabName = (typeof TABS)[number]["name"];

/** `modules` is what /api/me lists as on for the user; without it only permissions count. */
const allowed = (
  access: Access,
  permissions: readonly Permission[],
  modules?: readonly ModuleId[],
) => {
  if (modules && access.module && !modules.includes(access.module)) return false;
  if (access.anyOf) return access.anyOf.some((p) => permissions.includes(p));
  return !access.permission || permissions.includes(access.permission);
};

const accessOf = (tab: (typeof TABS)[number]): Access => ({
  permission: "permission" in tab ? tab.permission : undefined,
  anyOf: "anyOf" in tab ? tab.anyOf : undefined,
  module: tab.module,
});

export function canOpenTab(
  name: TabName,
  permissions: readonly Permission[],
  modules?: readonly ModuleId[],
): boolean {
  const tab = TABS.find((t) => t.name === name);
  return !!tab && allowed(accessOf(tab), permissions, modules);
}

/** Most buttons the bar shows at once; beyond it the last one becomes "Mais" (the collector). */
export const BAR_SLOTS = 5;

/** Default bar: the tabs flagged `bar` (settings is always added by `barFor`). */
export const DEFAULT_BAR: TabName[] = TABS.filter(
  (t) => "bar" in t && t.bar && t.name !== "more",
).map((t) => t.name);

/** Screens a user may put in the bar: everything they can open except settings ("more"). */
export function barChoices(
  permissions: readonly Permission[],
  modules?: readonly ModuleId[],
): TabName[] {
  return TABS.filter(
    (t) => t.name !== "more" && t.name !== "import" && canOpenTab(t.name, permissions, modules),
  ).map((t) => t.name);
}

/**
 * The bar for a user's saved choice (null = default): the chosen screens they can still open,
 * in order, then settings ("more") last so it is always reachable. With more than BAR_SLOTS
 * buttons, the first BAR_SLOTS-1 stay and settings turns into the "Mais" collector, whose
 * screen lists the `overflow` ones.
 */
export function barFor(
  saved: readonly string[] | null,
  permissions: readonly Permission[],
  modules?: readonly ModuleId[],
): { bar: TabName[]; overflow: TabName[]; collector: boolean } {
  const ok = new Set(barChoices(permissions, modules));
  const chosen = [...new Set(saved ?? DEFAULT_BAR)].filter((n): n is TabName =>
    ok.has(n as TabName),
  );
  const collector = chosen.length + 1 > BAR_SLOTS;
  const shown = collector ? chosen.slice(0, BAR_SLOTS - 1) : chosen;
  return {
    bar: [...shown, "more"],
    overflow: collector ? chosen.slice(BAR_SLOTS - 1) : [],
    collector,
  };
}

/** Where to land when Home is off: the first bar tab the user may open ("Definições" always). */
export function firstTab(permissions: readonly Permission[], modules: readonly ModuleId[]): Href {
  const tab = TABS.find((t) => "bar" in t && t.bar && canOpenTab(t.name, permissions, modules));
  return `/${tab?.name ?? "more"}` as Href;
}

const tabAccess = (name: TabName): Access => {
  const tab = TABS.find((t) => t.name === name);
  return tab ? accessOf(tab) : {};
};

/** Entries of the "Mais" screen, grouped; each opens a screen of the app. */
const MORE: {
  section: "club" | "management";
  tab?: TabName;
  key: string;
  icon: string;
  href: string;
  access: Access;
}[] = [
  ...(
    [
      "bookings",
      "scouting",
      "index",
      "events",
      "notifications",
      "teams",
      "people",
      "incidents",
      "equipment",
      "documents",
    ] as const
  ).map((name) => ({
    section: "club" as const,
    tab: name,
    key: name === "index" ? "home" : name,
    icon: TABS.find((t) => t.name === name)?.icon ?? "ellipse",
    href: name === "index" ? "/" : `/${name}`,
    access: tabAccess(name),
  })),
  ...(["fees", "health", "users", "spaces", "modules"] as const).map((name) => ({
    section: "management" as const,
    key: name,
    icon: TABS.find((t) => t.name === name)?.icon ?? "ellipse",
    href: `/${name}`,
    access: tabAccess(name),
  })),
  {
    section: "management",
    key: "audit",
    icon: "eye",
    href: "/audit",
    access: { permission: "audit.read", module: "audit" },
  },
  {
    section: "management",
    key: "invitesManual",
    icon: "help-circle",
    href: "/invites-manual",
    access: { permission: "users.manage", module: "users" },
  },
  {
    section: "management",
    key: "feedback",
    icon: "chatbubble-ellipses",
    href: "/feedback",
    access: { permission: "feedback.read", module: "feedback" },
  },
  {
    section: "management",
    key: "approvals",
    icon: "checkmark-done",
    href: "/approvals",
    access: { permission: "identity.review", module: "approvals" },
  },
  {
    section: "management",
    key: "privacy",
    icon: "shield-checkmark",
    href: "/privacy/requests",
    access: { permission: "privacy.manage", module: "privacy" },
  },
];

export type MoreItem = { key: string; icon: string; href: string };

/** What the "Mais" screen offers a user, by section, leaving out empty sections. */
export function moreItems(
  permissions: readonly Permission[],
  modules?: readonly ModuleId[],
  inBar: readonly string[] = DEFAULT_BAR,
) {
  const pick = (section: "club" | "management"): MoreItem[] =>
    MORE.filter(
      (m) =>
        m.section === section &&
        !(m.tab && inBar.includes(m.tab)) &&
        allowed(m.access, permissions, modules),
    ).map(({ key, icon, href }) => ({ key, icon, href }));
  return { club: pick("club"), management: pick("management") };
}
