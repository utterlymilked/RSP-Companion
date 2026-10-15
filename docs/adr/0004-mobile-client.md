# ADR 0004: Mobile client with Expo (iOS, Android and web)

- Status: Accepted. Supersedes the client parts of [ADR 0001](0001-stack.md): constraint 4
  ("no app stores"), the Web client and Styling rows, the web client test plan, and the
  rejection of native apps. Server, database, auth and hosting choices in 0001 stand.
- Date: 2026-10-15

## Context

Pedro confirmed RSC Companion is a **mobile app project**: athletes, guardians and coaches
should install it from the App Store and Google Play. A web version is welcome as a
secondary target (secretaria and direção at a desk, people without the app, links opened on
a laptop).

ADR 0001 chose an installable PWA to avoid app stores. On iOS a PWA only gets push
notifications after the user adds it to the home screen, has no store presence, and feels
like a website. That no longer matches the goal.

What stays true from 0001: low running cost, low maintenance, one language end to end,
cheap for AI agents to work on, EU data protection. The client work so far is a placeholder
page, so switching costs nothing; the API (Hono, typed client), Better Auth, the permission
matrix and the shared zod schemas must be reused unchanged.

## Decision

One client codebase in **`apps/mobile`** (`@rsc/mobile`), built with **Expo** (SDK 57, React
Native 0.86, React 19.2) and **Expo Router**. It ships as native apps for iOS and Android
and as a static web build (react-native-web) served by the API server, as the PWA would
have been.

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Expo managed workflow, Continuous Native Generation (no `ios/` or `android/` folders committed; native config in `app.json` and config plugins) | Native apps plus web from one TypeScript codebase; Expo handles native toolchains, SDK upgrades and store builds. |
| Navigation | Expo Router (file-based routes in `apps/mobile/app/`) | Same routes become deep links and web URLs. |
| API client | The existing typed Hono client, `hc<AppType>(baseUrl)` in `src/api.ts` | End-to-end types with no codegen, unchanged from 0001. Web uses the same origin; native reads `EXPO_PUBLIC_API_URL` at build time. |
| Auth | Better Auth's Expo integration: `@better-auth/expo` plugin on the server, Expo client with `expo-secure-store` | Native stores the session token in the Keychain / Keystore and sends it as a cookie header; web keeps the httpOnly cookie. Invite-only accounts and roles (ADR 0003) are untouched. |
| Links in emails | HTTPS universal links (iOS) and App Links (Android) on the app's domain; `rsc://` scheme in development | Invite, magic-link and reset emails keep one `https://…/invite?token=` URL: it opens the app when installed and the web version otherwise. The server serves `/.well-known/apple-app-site-association` and `assetlinks.json`. |
| Styling | React Native `StyleSheet` with shared theme tokens (`src/theme.ts`) and a few own primitives (Screen, Button, TextField, ListItem) | No CSS pipeline or Babel plugin to break on SDK upgrades; renders the same on web. Replaces Tailwind. |
| Data fetching | TanStack Query, `onlineManager` fed by NetInfo, `focusManager` by AppState | Same caching model as planned; refetches when the app returns to the foreground or regains a connection. |
| i18n | react-i18next with `expo-localization` for the device locale, `pt-PT` default | Unchanged library; strings in `apps/mobile/src/i18n/<locale>.json`. |
| Tests | `jest-expo` with React Native Testing Library for everything in `apps/mobile` (server and shared stay on Vitest) | Vitest cannot run React Native's sources without heavy configuration; Jest is what Expo supports. |
| Builds and releases | EAS Build and EAS Submit (free tier, or `eas build --local`); EAS Update for JavaScript-only fixes without a store review | No Mac or Android toolchain needed in CI. Store builds run on demand (manual workflow or tag), not on every PR. |
| Dev loop | `pnpm dev`: API on :3000 and Expo on :8081; web at `http://localhost:8081` (Metro proxies `/api`); phones through Expo Go with `EXPO_PUBLIC_API_URL` set to the computer's LAN address | Expo Go needs no build; switch to an EAS development build when a native module outside Expo Go is added. |

### Push notifications

- Devices register with `expo-notifications`; the app sends its Expo push token to the API,
  which stores one row per user and device (table added in M15) and removes tokens the push
  service reports as invalid.
- The server sends through the **Expo Push Service** (free HTTP API), which relays to Apple
  (APNs) and Google (FCM). Credentials: an APNs key from the Apple developer account and a
  free Firebase project for FCM; EAS stores both.
- Payloads carry no personal or health data: a generic title ("Nova convocatória") and an
  id; the app loads details after authenticating. Expo (650 Industries, USA) and
  Apple/Google process device tokens, so the privacy notice (M17) lists them.
- Web version: Web Push with VAPID keys is possible from the same server, but email is the
  fallback for web-only users; M15 decides whether web push is worth it.

### Offline

The club's grounds have patchy signal, so the app must stay useful without a connection,
without becoming a sync engine.

1. **Read cache.** The TanStack Query cache is persisted (AsyncStorage on native, browser
   storage on web) for an allowlist of `general`-tier queries: own schedule, call-ups,
   rosters (names only), bookings. Offline screens show the cached data with its age. The
   persisted cache is wiped on logout.
2. **No sensitive data at rest.** `health`-tier data is never persisted. `personal`-tier data
   (phones, addresses) is not persisted either; a module that needs it offline (for example
   guardian phones for away games, M16) adds encrypted storage in its own PR.
3. **Offline writes only where the field needs them**: attendance (M11) and incident drafts
   (M7) are queued as persisted mutations with an idempotency key and replayed when the
   connection returns; the server rejects conflicting replays with an error code. Other
   writes need a connection and say so.

No offline-first database (WatermelonDB, PowerSync, …): the data a club member needs offline
is small and read-mostly.

### Store accounts and costs

| Item | Cost | Notes |
| --- | --- | --- |
| Apple Developer Program | €99 per year | Organisation enrolment needs a legal entity and a D-U-N-S number. Apple waives the fee for eligible non-profits in some countries; worth checking for the club. |
| Google Play Console | US$25 once | Organisation accounts also need a D-U-N-S number. New personal accounts must run a closed test with at least 12 testers for 14 days before going public; organisation accounts are exempt. |
| D-U-N-S number | Free | Requested from Dun & Bradstreet in the club's name; can take a couple of weeks. |
| Expo (EAS Build, Submit, Update) | Free tier | Free tier has a monthly build quota and an update audience cap sized for small apps; check expo.dev/pricing before the first release. Local builds avoid the quota. |
| Expo Push, APNs, FCM, Firebase project | Free | |

Distribution:

- **Android**: Google Play, starting on the internal testing track (up to 100 testers, no
  review wait), then production.
- **iOS**: TestFlight for testing, then the App Store. If the club prefers the app not to be
  searchable, Apple's **unlisted app distribution** (reachable only by link, still reviewed)
  suits a members' app. App Review needs a demo account, a privacy policy URL, the privacy
  "nutrition" labels and in-app account deletion (or a deletion request), all planned in
  M4b and M17.
- **Web**: the static export (`pnpm --filter @rsc/mobile build`, output `apps/mobile/dist`)
  served by the API server at the same origin, as in 0001.

Accounts are best opened in the **club's name** so the store shows the club as publisher and
access survives changes of people; Pedro owns them, as with hosting. The bundle identifier
(`pt.realsportmassama.companion` in `app.json`, a placeholder) cannot change after the first
store release and should match the domain the club will use.

## Alternatives considered

- **Keep the PWA** (ADR 0001). Cheapest, but no store presence, home-screen install is
  awkward on iOS and push only works after it, weaker background behaviour. Does not meet
  Pedro's goal.
- **PWA wrapped in Capacitor**. Store apps from web code (React DOM + Vite). The UI stays a
  web view, native features go through a second plugin ecosystem, and Better Auth has no
  first-class Capacitor integration. With no client code to reuse yet, Expo's native UI
  plus web from one codebase is the better trade.
- **Flutter**. Good native apps and web, but Dart is a second language: the shared zod
  schemas, the permission matrix and the typed Hono client would have to be duplicated.
- **Native Swift and Kotlin**. Two more codebases to maintain. Not viable for this team.
- **Bare React Native (no Expo)**. Same UI layer, but we would maintain `ios/` and
  `android/` projects, build pipelines and upgrades by hand.

## Consequences

- `apps/web` (the Vite placeholder) is retired; M3 removes it once the Expo shell replaces
  it. Docs, `pnpm dev` and CI now centre on `apps/mobile`.
- `APP_URL` in development is `http://localhost:8081` (Expo web), replacing Vite's port.
- Native releases go through two store reviews; JavaScript-only fixes can ship with EAS
  Update (only to builds with the same native runtime version).
- Expo ships about three SDKs a year; upgrading is an Ongoing task (`npx expo install
  --fix`, then check the changelog).
- The server gains the `@better-auth/expo` plugin and the app scheme as a trusted origin
  (M3), and the well-known files for universal links (M4). Web stays same-origin, so no CORS.
- The dev proxy uses Metro's `server.enhanceMiddleware`, deprecated in Metro but still
  honoured by Expo CLI; if it goes, web dev switches to `EXPO_PUBLIC_API_URL` plus CORS.
- Store publishing needs decisions and accounts only Pedro (or the club) can provide; until
  then the club can use the web version and Android test builds.
