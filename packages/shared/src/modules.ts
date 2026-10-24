import { z } from "zod";

/**
 * Modules: every feature of the app is a module with a tier, a tracked version and
 * dependencies (ADR 0025, docs/MODULES.md).
 *
 * - `release`: ships in production for everyone, always on, not toggleable.
 * - `beta`: ships in production but is off there by default and only shown to testers
 *   (`modules.beta`); on by default on staging.
 * - `alpha`: staging only (never in the production build) and off by default there.
 */
export const MODULE_TIERS = ["release", "beta", "alpha"] as const;
export type ModuleTier = (typeof MODULE_TIERS)[number];

/** Which deployment answers: production, the staging sandbox, or a developer machine/test run. */
export const STACKS = ["prod", "staging", "dev"] as const;
export type Stack = (typeof STACKS)[number];

export interface ModuleDef {
  tier: ModuleTier;
  /** Bumped by hand when the module's behaviour or API changes (semver). */
  version: string;
  /** `planned` modules are catalogued but not built yet: never available. */
  status: "available" | "planned";
  /** Modules that must be on for this one to work. */
  deps: readonly string[];
}

const m = (
  tier: ModuleTier,
  deps: readonly string[] = [],
  status: ModuleDef["status"] = "available",
  version = "1.0.0",
): ModuleDef => ({ tier, deps, status, version: status === "planned" ? "0.0.0" : version });

/** The catalogue. Dependencies never point at a lower tier (pinned by a test). */
export const MODULES = {
  // release: the focus of the first production release
  reservations: m("release"),
  settings: m("release"),
  users: m("release"),
  teams: m("release"), // team pickers of reservations; the team screens stay in Settings
  // beta
  scouting: m("beta"),
  athletes: m("beta", [], "planned"),
  persons: m("beta"),
  profile: m("beta"),
  registration: m("beta", ["profile", "persons", "approvals"], "planned"),
  approvals: m("beta", ["persons"], "planned"),
  feedback: m("beta"), // the testers' feedback widget and inbox
  // alpha: on standby until the club asks for them
  home: m("alpha"),
  events: m("alpha", ["teams", "reservations"]),
  callups: m("alpha", ["events", "persons"]),
  transport: m("alpha", ["events", "callups"]),
  notifications: m("alpha"),
  messages: m("alpha", ["notifications"]),
  incidents: m("alpha", ["persons"]),
  equipment: m("alpha", ["persons"]),
  documents: m("alpha", ["persons"]),
  fees: m("alpha", ["persons"]),
  evaluations: m("alpha", ["persons"]),
  health: m("alpha", ["persons"]),
  privacy: m("alpha", ["persons"]),
  audit: m("alpha"),
  cmd: m("alpha", ["registration"], "planned"), // Chave Móvel Digital sign-in
} as const satisfies Record<string, ModuleDef>;

export type ModuleId = keyof typeof MODULES;
export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];

/** Explicit on/off choices made by a developer; modules without an entry follow their defaults. */
export const moduleOverridesSchema = z.record(z.string(), z.boolean());
export type ModuleOverrides = Partial<Record<ModuleId, boolean>>;

export const setModuleSchema = z.object({ enabled: z.boolean() });

const def = (id: ModuleId): ModuleDef => MODULES[id];
const depsOf = (id: ModuleId) => def(id).deps as readonly ModuleId[];

/** Built into this stack at all: alpha modules never reach production. */
export function isAvailable(id: ModuleId, stack: Stack): boolean {
  const d = def(id);
  return d.status === "available" && (stack !== "prod" || d.tier !== "alpha");
}

/** Release modules are always on; everything else can be switched by a developer. */
export const isToggleable = (id: ModuleId, stack: Stack) =>
  isAvailable(id, stack) && def(id).tier !== "release";

export function defaultEnabled(id: ModuleId, stack: Stack): boolean {
  if (!isAvailable(id, stack)) return false;
  if (stack === "dev") return true;
  const { tier } = def(id);
  return tier === "release" || (tier === "beta" && stack === "staging");
}

/** Which modules are on: the choice (or default) of each, and every dependency also on. */
export function resolveModules(
  stack: Stack,
  overrides: ModuleOverrides = {},
): Record<ModuleId, boolean> {
  const state = {} as Record<ModuleId, boolean>;
  const visit = (id: ModuleId): boolean => {
    if (id in state) return state[id];
    state[id] = false; // guards against cycles (the catalogue has none)
    const chosen = def(id).tier === "release" ? true : (overrides[id] ?? defaultEnabled(id, stack));
    state[id] = isAvailable(id, stack) && chosen && depsOf(id).every(visit);
    return state[id];
  };
  for (const id of MODULE_IDS) visit(id);
  return state;
}

/** Modules a user is shown: those on, and in production the beta ones only for testers. */
export function visibleModules(
  stack: Stack,
  overrides: ModuleOverrides,
  seesBeta: boolean,
): ModuleId[] {
  const on = resolveModules(stack, overrides);
  return MODULE_IDS.filter(
    (id) => on[id] && (stack !== "prod" || def(id).tier !== "beta" || seesBeta),
  );
}

export type ModuleChangeError = "module_locked" | "module_unavailable";

const closure = (start: ModuleId, next: (id: ModuleId) => readonly ModuleId[]) => {
  const seen = new Set<ModuleId>();
  const walk = (id: ModuleId) => {
    for (const n of next(id)) {
      if (!seen.has(n)) {
        seen.add(n);
        walk(n);
      }
    }
  };
  walk(start);
  return [...seen];
};

/**
 * Switches a module and returns the new overrides. Enabling turns on its dependencies too;
 * disabling turns off everything that depends on it. Fails for release modules (always on)
 * and for modules or dependencies this stack does not have.
 */
export function changeModule(
  stack: Stack,
  overrides: ModuleOverrides,
  id: ModuleId,
  enabled: boolean,
): { overrides: ModuleOverrides } | { error: ModuleChangeError } {
  if (!isAvailable(id, stack)) return { error: "module_unavailable" };
  if (!isToggleable(id, stack)) return { error: "module_locked" };
  const next = { ...overrides };
  if (enabled) {
    const needed = [id, ...closure(id, depsOf)];
    if (needed.some((n) => !isAvailable(n, stack))) return { error: "module_unavailable" };
    for (const n of needed) if (def(n).tier !== "release") next[n] = true;
  } else {
    const dependents = (x: ModuleId) => MODULE_IDS.filter((o) => depsOf(o).includes(x));
    for (const n of [id, ...closure(id, dependents)]) {
      if (isToggleable(n, stack)) next[n] = false;
    }
  }
  return { overrides: next };
}

/** One row of the developer's modules screen. */
export interface ModuleStatus {
  id: ModuleId;
  tier: ModuleTier;
  version: string;
  deps: ModuleId[];
  available: boolean;
  toggleable: boolean;
  enabled: boolean;
}

export interface ModulesResponse {
  stack: Stack;
  modules: ModuleStatus[];
}

export function moduleStatuses(stack: Stack, overrides: ModuleOverrides): ModuleStatus[] {
  const on = resolveModules(stack, overrides);
  return MODULE_IDS.map((id) => ({
    id,
    tier: def(id).tier,
    version: def(id).version,
    deps: [...depsOf(id)],
    available: isAvailable(id, stack),
    toggleable: isToggleable(id, stack),
    enabled: on[id],
  }));
}
