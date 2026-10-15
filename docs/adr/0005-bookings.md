# ADR 0005: Rooms and fields bookings

- Status: Accepted
- Date: 2026-10-15

## Context

The club books its auditório, meeting rooms, gym, gabinetes and the home fields from a Google
Sheet (see REQUIREMENTS.md). Fields can be used whole or in parts (campo 2 and 3 together),
many departments and outside parties book, and every booking has a status that matters to
the office (a confirmar, confirmado, realizado, anulado, reagendar…). Coaches need to ask for
a slot without being able to give themselves one.

## Decision

1. **Spaces and combinations**: a `spaces` row per bookable thing, grouped by `venues`. A
   combined space lists its components in `space_components`; two spaces conflict when the
   sets {space and its components} intersect. One level of combination only.
2. **Conflict rule**: only the statuses `to_confirm`, `confirmed` and `done` occupy a space.
   The check runs in the service inside the writing transaction, serialised by one Postgres
   advisory lock (`pg_advisory_xact_lock`). Booking volume is tiny, so one lock is simpler
   than row locks.
3. **Recurrence**: expanded when created into ordinary rows tied by `booking_series`, at the
   same Europe/Lisbon wall-clock time. Editing time or space is per booking; other fields and
   statuses can apply to the rest of the series.
4. **Who may do what**: everyone with an internal role reads the calendar. Admin and staff
   write anything. Coach and team manager (scoped roles) write only bookings with their
   `team_id`, always as `to_confirm`, and may only withdraw them; the office confirms.
5. **iCal**: a per-user secret URL, because calendar apps cannot authenticate. The token is
   rotatable and checked against the user's current permission on every request.
6. **Times** are stored as `timestamptz` (UTC) and converted with `Intl` in
   `packages/shared/src/lisbon.ts`, shared by server and app, with no date library.

## Alternatives

- *Postgres exclusion constraint* (`btree_gist`): enforces no overlap in the database but
  cannot express combinations, so the service check would be needed anyway.
- *RRULE-based recurrence*: compact, but conflict checks, per-day statuses and attendance
  all want one row per day.
- *Fine-grained approval permission* (`bookings.confirm`): not needed until the club says
  who besides the office confirms; adding it later is a matrix change.

## Consequences

- The check is not enforced by the database; every write path must go through
  `createBookings` / `updateBooking` (the importer does).
- Booking history is kept: spaces and departments with bookings cannot be deleted
  (`ON DELETE RESTRICT`); spaces are deactivated instead.
- Open business questions (who confirms, whether clinical roles book directly) are in the
  questionnaire; the defaults above apply until answered.
