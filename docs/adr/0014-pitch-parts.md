# ADR 0014: Pitches bookable in parts

- Status: Accepted
- Date: 2026-10-16

## Context

The club books its pitches whole or in parts: campo 1 whole only, campo 2 whole, in two halves
or in three thirds, campo 3 whole or in two halves (Pedro, 2026-10-16). The first layout was
hard-coded (campo 2 and 3 as halves of a combined "Campo 2+3", drawn from a file), which was
wrong and could not be changed without a release.

## Decision

- **Parts are spaces.** A whole pitch is an ordinary row in `spaces` with `divisions`
  (`smallint[]`, e.g. `{2,3}`). For each division the service (`syncParts`) keeps one child
  space (`parent_id`, `part_count`, `part_index`) named "Campo 2 · Metade A" or "Campo 2 ·
  Terço 3". Bookings, the booking flow, the calendar and "Minhas reservas" keep working on
  `space_id` unchanged. Removing a division switches its parts off (`active = false`); their
  bookings stay. Renaming a pitch renames its parts. Parts are never edited directly.
- **Configuration is data.** Admins (`facilities.write`) pick the divisions per pitch on
  *Mais › Espaços e campos* (`PATCH /api/facilities/spaces/:id` with `divisions`; allowed:
  2, 3, 4) and can add pitches. A migration seeds the club's defaults and retires the old
  "Campo 2+3" combination (kept as history).
- **Overlap by geometry.** A pitch is `PITCH_UNITS` (12) units long. Part `i` of `n` covers
  `[(i-1)·12/n, i·12/n)`. Two spaces conflict when their footprints overlap on the same pitch
  (`packages/shared/src/pitch.ts`, used by the server check and by the app's greying):

  | Booked | Blocks |
  | --- | --- |
  | Whole | itself and every part |
  | Half A | whole, half A, thirds 1 and 2 |
  | Half B | whole, half B, thirds 2 and 3 |
  | Third 1 | whole, third 1, half A |
  | Third 2 | whole, third 2, both halves (it straddles the middle) |
  | Third 3 | whole, third 3, half B |

  Halves never block each other, nor thirds each other, nor another pitch. Back-to-back
  bookings do not conflict (as before). Combinations (`space_components`) still work and
  occupy their components' footprints; components must be whole pitches, and a combination
  cannot be divided.
- **Check unchanged in shape.** Still in the service under the advisory lock, still `409
  booking_conflict`. Boundary tests cover the matrix above (`pitch.test.ts`,
  `bookings.test.ts`).

## Consequences

- One pitch can host a half and a third at once only if they do not overlap; the calendar's
  day column shows each part's booking in its stretch of the pitch's column.
- Quarters work with no code change (the unit count 12 divides by 2, 3 and 4).
- Real floor plans, when they arrive, only change `planLayout.ts`.
