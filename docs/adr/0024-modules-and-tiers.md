# ADR 0024: Modules, tiers and feature switches

- Status: Accepted
- Date: 2026-10-24

## Context

The app grew many features at once and the club's business contact found it unusable for the
two things he wants now: space reservations and scouting. Production needs a small, polished
surface; everything else must wait without being deleted. Pedro (2026-10-24) asked for
features to be modules with a tier, a tracked version and dependencies.

## Decision

1. **Module** = a feature with an id, a tier, a semver version and dependencies. The catalogue
   is one table in `packages/shared/src/modules.ts` (documented in `docs/MODULES.md`).
2. **Tiers**: `release` (production for everyone, always on, not toggleable), `beta`
   (production, off by default there, shown only to users with `modules.beta`, the testers;
   on by default on staging), `alpha` (staging only, never in the production build, off by
   default). A module may only depend on modules of the same or a higher tier.
3. **Stack**: `APP_STACK` = `prod | staging | dev`; when unset it is derived (`NODE_ENV` not
   production: dev; production with `DEMO_MODE`: staging; else prod), so no deploy change is
   needed. `dev` (local and tests) has every module on by default.
4. **Switches**: a developer (`modules.manage`) turns non-release modules on/off in
   Settings > Módulos. The choices are stored as one JSON row in `club_settings` (key
   `modules`), no migration. Enabling turns on the dependency closure; disabling turns off all
   dependents; a stale override never enables a module whose dependency is off
   (`resolveModules`).
5. **Enforcement on the server**: one middleware (`moduleGate`) maps the first path segment of
   `/api/*` to a module (`ROUTE_MODULES`) and answers 404 `module_disabled` when the module is
   off, not in this build, or beta and the caller lacks `modules.beta` (production only; on
   staging beta is open to every tester). `/api/me` lists the modules on for the user and the
   app hides menus and tiles accordingly. Data-layer code shared between modules (for example
   people records used by users and bookings) is not gated; only routes and screens are.
6. **Menu bar**: only Reservas, Scouting, Perfil and Definições, when their modules are on.
   Other screens open from Definições. When Home is off the app lands on the first bar tab.
7. **Planned** modules (athletes, registration, approvals, cmd) are catalogued with their tier
   but are never available until built.

## Consequences

- Cheap to add: a module is one catalogue line plus its route segment.
- Release modules cannot be hidden by mistake; going to production only needs the tier right.
- Per-module versions are bumped by hand; they are informational (shown in Módulos).
- The Home dashboard still reads some services of other modules directly; it is alpha, so a
  follow-up must make its widgets respect the switches before it is promoted.
