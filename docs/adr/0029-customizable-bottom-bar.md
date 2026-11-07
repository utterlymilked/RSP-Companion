# 0029: Customizable bottom bar

Status: accepted (2026-11-07)

## Context

The bottom bar was fixed at four buttons (Reservas, Scouting, Perfil, Definições). Roles and
modules differ a lot between people, and Pedro asked for a bar each person can shape, more than
four buttons, and a collector when it overflows.

## Decision

- Each person picks the screens in the bar and their order (Perfil > Barra de navegação, also in
  Definições). Choices are every screen the user can open (module on and permission held),
  except Definições itself.
- Definições is always the last button, so settings are always reachable. With more than 5
  buttons (`BAR_SLOTS`) the first four stay and Definições turns into the "Mais" collector; the
  rest of the choice lives there. Screens not in the bar are listed on that screen.
- Perfil and Definições are no longer special: Perfil can leave the bar (it stays reachable from
  the avatar row on the Definições/Mais screen).
- Default (nothing saved): Reservas, Scouting, Perfil, Definições. Screens a user can no longer
  open (module off, role changed) are dropped silently.
- Stored locally per login (`AsyncStorage`, key `rsc.bottomBar`, by user id), not on the server:
  it is a display preference, not personal data, and needs no migration or API. Trade-off: it
  does not follow the user to another device. A server-side preference can replace the store
  (`features/navigation/barPreference.ts`) later without touching the screens.

Logic: `barFor`, `barChoices` and `moreItems` in `apps/mobile/src/navigation.ts`.
