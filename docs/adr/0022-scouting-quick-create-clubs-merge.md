# ADR 0022: Quick athlete creation, sectioned sheet, club list and data merge

- Status: Accepted
- Date: 2026-10-19

## Context

Creating a scouted athlete asked for the whole observation-request form up front, which is
too long for a scout in the field. The club also wants the athlete to have a personal area,
observation trainings recorded as reports, a club picker instead of free text, and the
fields of its own scouting form collected (see `docs/SCOUTING_MODEL.md`).

## Decision

1. **Quick create**: name, birth date or year, NIF and club only. Everything else is filled in
   later on the sheet tab, **by section** (identification, sporting, contacts, observation
   request, notes), each with its own edit and a filled counter.
2. **Report kinds**: `match` or `observation_training`, one table, one `kind` column. Heat map
   only for matches; trainings default their date to the sheet's trial date.
3. **Club list**: table `clubs` (public Wikidata list of Portuguese football clubs, loaded in
   the background at first start, plus clubs typed by hand and remembered). The sheet keeps the
   club as text, so no link breaks if a club is renamed. Wikidata is CC0 and holds only
   organisations. It lacks many small youth clubs, hence the typed fallback.
4. **Merge on link**: for `people.write` holders, linking shows both values of the shared
   identity fields and applies the user's choices in one transaction (`POST .../link`).
5. **Form fields**: club-specific context and grades go in `prospect_reports.details`
   (JSON validated by one zod schema) instead of a dozen columns; six new attributes cover the
   grades the form asks that the model lacked.

## Consequences

- Reports are quick to start and rich when needed; every field is optional.
- The JSON column cannot be filtered in SQL cheaply; filter in the service if a need arises.
- The Wikidata load needs outbound HTTPS from the server; failure only leaves the picker empty
  until the next start (or `POST /api/clubs/import-wikidata`).
