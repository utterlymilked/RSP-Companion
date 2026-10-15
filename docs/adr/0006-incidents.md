# ADR 0006: Incident log and injury visibility

- Status: Accepted
- Date: 2026-10-15

## Context

The club records ocorrências: injuries, discipline, damage to facilities or material, match
incidents. Reports are written by coaches, delegados and the office, often on the pitch. An
injury report is not a clinical record, but it names a person and says they were hurt, which
sits next to health data (ADR 0003: the admin cannot read health data; each clinical role
reads its own discipline).

## Decision

1. **One `incidents` table** with type, status (open → in progress → closed), occurrence time,
   place, optional team, free-text description, follow-up and reporter, plus
   `incident_people` (person and role: involved, injured, witness).
2. **Visibility is decided per row** by `viewOf` in `modules/incidents/service.ts`: the
   reporter sees their own report in full; other types are full for anyone with
   `incidents.read` over the incident's team (club-wide for the office, own team for coaches
   and delegados); an **injury** is full only with `incidents.read_injury` (clinical roles)
   and a *summary* (type, time, place, team, status; no text, no people) for other readers.
   What is not visible answers 404.
3. **Clinical detail does not belong in an incident.** The form says so; anything clinical
   goes into M13 records. If injury reports later need to feed M13, that is a link by id
   from the clinical side, not a copy of the text.
4. **Permissions**: `incidents.read`, `.write` (team-scoped for coaches and delegados),
   `.manage` (status and follow-up; admin and staff), `.read_injury` (doctor, nurse, physio,
   nutritionist, psychologist). The reporter may correct their own report until it is closed.
5. **Idempotent creation**: `clientKey` (uuid made when the form opens) is unique per
   reporter; replaying a POST returns the existing incident (200 instead of 201). This is
   what a future offline queue relies on.

## Consequences

- Lists filter in the service layer after a bounded query (200 rows, newest first); fine for
  a small club, revisit with SQL-side scoping if the log grows.
- Not yet built: attachments and camera photos (needs object storage for app files, a
  separate decision), the offline draft queue in the app (the server side is ready), and
  adding people involved from the app form (the API accepts them).
- Reading the people of an incident is not audited; they are shown by name only (general
  tier), never contacts or birth dates.
