# ADR 0028: Forced updates and prompt over-the-air updates

- Status: Accepted
- Date: 2026-10-25

## Context

On 2026-10-25 the club's phone ran the production APK of 2026-10-19 (build 47) and showed menus
and a Planta layout that no longer exist. Cause: `runtimeVersion` went from 2 to 3 in M26
(2026-10-19) and the production APK is built by hand, so nobody rebuilt it. Over-the-air updates
are only offered to installs with the same runtime version, so that phone silently kept its
embedded JavaScript for six days, and the server had no way to notice or refuse it. A critical
security fix could not have been pushed to it. Two weaknesses made this worse everywhere:

- the app only downloaded an update in the background and used it on the **next** launch (open
  twice), and any failure was silent;
- the server never learned which build a client ran, and a stale client was served like any other.

## Decision

1. **Clients identify themselves.** Every API request carries `x-app-platform`, `x-app-runtime`
   (native runtime version), `x-app-built-at` (when the running JavaScript bundle was built, from
   `expo-updates`) and `x-app-update` (update id or `embedded`). Constants and the rule
   `judgeClient` live in `packages/shared/src/app-version.ts`, so server and app agree.
2. **The server publishes and enforces a minimum** (`APP_VERSION_ENFORCEMENT=on` on staging and
   prod; off in development and tests):
   - minimum runtime: `MIN_APP_RUNTIME`, default the runtime of the over-the-air bundle the server
     serves. Raising `runtimeVersion` therefore forces a new APK by itself, as it must: such an
     install can no longer receive updates;
   - minimum bundle build: `MIN_APP_BUILT_AT` (ISO time or `current`), set by the Ops task
     `require-update` for security fixes;
   - `GET /api/app/requirements` (public) returns these; every other API route (except
     `/api/health` and `/api/ota`) answers **426 `app_update_required`** with
     `issues.update = apk | bundle` to a native client below them. A native app that sends no
     identification (an install from before this ADR) counts as outdated. The web app is never
     refused: it reloads itself on a new release (`web-update.ts`).
3. **The app applies updates promptly** (`features/updates/UpdateGate`). At launch it checks and,
   if a newer bundle exists, downloads it and restarts into it before showing anything (check
   timeout 4 s, so a bad network does not hold the launch). When it returns to the foreground it
   re-checks and offers a non-blocking "Atualizar" banner. When the server's minimum is above the
   install, or any call answers 426, a **blocking screen** replaces the app: `bundle` fetches the
   update and restarts (retry button on failure), `apk` explains and opens the download link
   (`APP_DOWNLOAD_URL`: the `android-prod` or `android-latest` release).
4. **Both APK variants are rebuilt on every native-input change** (`android-apk.yml`), so a
   runtime bump can no longer leave the club's APK behind. Installing it is still manual.
5. **Diagnostics.** Definições > "Procurar atualizações" shows the last error of an update
   check, and the server logs one `app-client …` line per app start (platform, runtime, build
   time, update id) so the builds in use can be read from the log.

## Consequences

- A security fix is: merge, deploy, then Ops `require-update` (per stack). Installs below the new
  bundle are blocked until they have it; those that cannot get it over the air (old runtime) are
  told to install the APK.
- Bumping `runtimeVersion` locks out every older install of that stack the moment the server is
  deployed. Publish the new APK first (it is built automatically on merge) and tell the club.
- An install from before this ADR cannot show the new screen: it sees a generic error with a retry
  button. It can only be fixed by installing the new APK (or, if its runtime still matches, by an
  over-the-air update, which `/api/ota` still serves without the check).
- Not done: iOS (no build yet), signed updates, staged rollouts.
