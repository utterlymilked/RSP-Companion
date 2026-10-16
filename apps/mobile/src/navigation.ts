import { HEALTH_DISCIPLINES, type Permission } from "@rsc/shared";

type Access = { permission?: Permission; anyOf?: readonly Permission[] };

const HEALTH_ACCESS = [
  "availability.read",
  ...HEALTH_DISCIPLINES.map((d) => `health.${d}.read` as const),
] as const satisfies readonly Permission[];

/**
 * Screens of the signed-in area. Only five sit in the bottom bar (reservations, the club's main workflow, is one of them) (`bar: true`); the rest open
 * from the "Mais" tab, which keeps the bar readable on a phone. A screen with a permission is
 * hidden from users without it (the API refuses too).
 */
export const TABS = [
  { name: "index", titleKey: "tabs.home", icon: "home", bar: true },
  {
    name: "events",
    titleKey: "tabs.events",
    icon: "calendar",
    bar: true,
    permission: "events.read",
  },
  {
    name: "bookings",
    titleKey: "tabs.bookings",
    icon: "business",
    bar: true,
    permission: "bookings.read",
  },
  { name: "notifications", titleKey: "tabs.notifications", icon: "chatbubbles", bar: true },
  { name: "more", titleKey: "tabs.more", icon: "grid", bar: true },
  { name: "people", titleKey: "tabs.people", icon: "people", permission: "people.read" },
  { name: "teams", titleKey: "tabs.teams", icon: "shirt", permission: "teams.read" },
  {
    name: "incidents",
    titleKey: "tabs.incidents",
    icon: "alert-circle",
    permission: "incidents.read",
  },
  { name: "equipment", titleKey: "tabs.equipment", icon: "cube", permission: "equipment.read" },
  {
    name: "documents",
    titleKey: "tabs.documents",
    icon: "document-text",
    permission: "documents.read",
  },
  { name: "fees", titleKey: "tabs.fees", icon: "wallet", permission: "fees.read" },
  { name: "scouting", titleKey: "tabs.scouting", icon: "search", permission: "scouting.read" },
  { name: "health", titleKey: "tabs.health", icon: "medkit", anyOf: HEALTH_ACCESS },
  { name: "import", titleKey: "tabs.import", icon: "cloud-upload", permission: "people.write" },
  { name: "users", titleKey: "tabs.users", icon: "key", permission: "users.manage" },
  { name: "account", titleKey: "tabs.account", icon: "person-circle" },
] as const satisfies readonly ({
  name: string;
  titleKey: string;
  icon: string;
  bar?: boolean;
} & Access)[];

export type TabName = (typeof TABS)[number]["name"];

const allowed = (access: Access, permissions: readonly Permission[]) => {
  if (access.anyOf) return access.anyOf.some((p) => permissions.includes(p));
  return !access.permission || permissions.includes(access.permission);
};

const accessOf = (tab: (typeof TABS)[number]): Access => ({
  permission: "permission" in tab ? tab.permission : undefined,
  anyOf: "anyOf" in tab ? tab.anyOf : undefined,
});

export function canOpenTab(name: TabName, permissions: readonly Permission[]): boolean {
  const tab = TABS.find((t) => t.name === name);
  return !!tab && allowed(accessOf(tab), permissions);
}

const tabAccess = (name: TabName): Access => {
  const tab = TABS.find((t) => t.name === name);
  return tab ? accessOf(tab) : {};
};

/** Entries of the "Mais" screen, grouped; each opens a screen of the app. */
const MORE: {
  section: "club" | "management";
  key: string;
  icon: string;
  href: string;
  access: Access;
}[] = [
  ...(["teams", "people", "incidents", "equipment", "documents"] as const).map((name) => ({
    section: "club" as const,
    key: name,
    icon: TABS.find((t) => t.name === name)?.icon ?? "ellipse",
    href: `/${name}`,
    access: tabAccess(name),
  })),
  ...(["fees", "scouting", "health", "users"] as const).map((name) => ({
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
    access: { permission: "audit.read" },
  },
  {
    section: "management",
    key: "feedback",
    icon: "chatbubble-ellipses",
    href: "/feedback",
    access: { permission: "feedback.read" },
  },
  {
    section: "management",
    key: "privacy",
    icon: "shield-checkmark",
    href: "/privacy/requests",
    access: { permission: "privacy.manage" },
  },
];

export type MoreItem = { key: string; icon: string; href: string };

/** What the "Mais" screen offers a user, by section, leaving out empty sections. */
export function moreItems(permissions: readonly Permission[]) {
  const pick = (section: "club" | "management"): MoreItem[] =>
    MORE.filter((m) => m.section === section && allowed(m.access, permissions)).map(
      ({ key, icon, href }) => ({ key, icon, href }),
    );
  return { club: pick("club"), management: pick("management") };
}
