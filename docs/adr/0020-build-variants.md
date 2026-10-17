# ADR 0020: Production and tester apps as build variants

- Status: Accepted
- Date: 2026-10-17
- Supersedes: the "Servidor" switch in ADR 0017

## Context

ADR 0017 let any native build be pointed at staging or prod from a "Servidor" link, so the
APK the club installs could reach the test environment, and testers could point their app at
real data. That is not acceptable for an app handed to a club.

## Decision

- **Two apps from one codebase**, chosen at build time with `APP_VARIANT`
  (`apps/mobile/app.config.js`, `src/variant.ts`):
  - `production`: "SFF RSC", `pt.realsportmassama.companion`, scheme `rsc`. Built with the prod
    API address only. No server switch, no demo-account picker, no feedback bubble. The staging
    address is not in its bundle or its update manifest.
  - `tester`: "SFF RSC Teste", `pt.realsportmassama.companion.teste`, scheme `rsc-teste`.
    Installs next to the production app. Built with the staging address only; has the demo
    picker (behind the tester access code, ADR 0018) and the feedback bubble.
- **The "Servidor" switch is removed** from both: an app talks to one server, fixed at build time.
- **Over-the-air updates per variant.** The image holds one JS export per variant
  (`/app/ota/tester`, `/app/ota/production`), each built for its own server. A stack serves only
  its variant's export (`OTA_VARIANT`: staging default `tester`, prod `production`), and the
  update URL in each APK is its own server's. `runtimeVersion` went to `"2"` so APKs from before
  this change (which had the switch) receive no further updates and must be reinstalled.
- **CI.** The tester APK stays the rolling pre-release `android-latest`, rebuilt on merges that
  touch native inputs. The production APK is built only by hand (workflow input
  `variant = production`, ~15 minutes of Actions) and published as `android-prod`.
- **Web.** One web build serves both stacks. Prod web is the prod domain; staging web is the
  tester sandbox. The web build cannot know its stack, so the server decides: the demo picker
  exists only where `DEMO_MODE` is on (staging, with its access code), and prod answers 404.

## Consequences

- Anyone holding the production APK cannot reach staging. Staging data is still protected by
  sign-in and the tester code, not by hiding the address.
- Two release streams to keep an eye on; native changes need both APKs rebuilt (tester is
  automatic, production by hand).
- iOS later: a second bundle identifier and an ad hoc/TestFlight tester build follow the same
  variants.
