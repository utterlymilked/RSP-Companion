# ADR 0021: Scouting profiles, archetypes and person link

- Status: Accepted
- Date: 2026-10-19

## Context

Scouting reports were only a rating and free text (ADR 0007). The club wants to compare scouted
athletes with radial charts, archetypes and position heat maps, keep the data of its existing
form as a section, and tie a scouted athlete to a person in the registry when they join.

## Decision

1. Attributes, archetypes and the heat grid are a **code catalogue** in `@rsc/shared`
   (`scouting-model.ts`), not tables: they drive charts and must stay comparable over time.
   Reports store `scores` (jsonb, key to 1-10) and `heat` (jsonb, 18 zone values 0-3).
   Rationale and sources: `docs/SCOUTING_MODEL.md`.
2. Profile, overall score, archetype and heat are **computed** from the last 3 reports; the
   archetype can be overridden by hand (`prospects.archetype`).
3. `prospects.person_id` (nullable, `on delete set null`) and `persons.nif` / `prospects.nif`
   (both personal tier, `persons.nif` unique). A NIF matching a person forces the link after an
   explicit confirmation (`confirmLink`); mismatches are refused. Suggestions by name expose only
   general-tier fields.
4. The prospect keeps its own retention (ADR 0007) even when linked; unlinking is allowed.

## Consequences

- Changing the catalogue changes how old reports read; add attributes, never rename keys.
- Percentiles compare only scouted athletes, so they are meaningful once the pool grows.
