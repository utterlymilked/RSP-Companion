# Scouting athlete model

What we record about a scouted athlete, and why. Decision record: `docs/adr/0021-scouting-profiles.md`.
Code: `packages/shared/src/scouting-model.ts` (catalogue, archetypes, maths), `apps/server/src/modules/scouting/`.

## What the industry describes an athlete with

- **Report templates** (ScoutDecision, generic scouting sheets) group a player into technical,
  tactical, physical and mental sections plus strengths, weaknesses and a recommendation.
  [ScoutDecision template](https://www.scoutdecision.com/blog/player-scouting-report-template-pdf-excel/)
- **Youth talent identification** uses the English FA "4 Corner Model": technical/tactical,
  psychological, social, physical, with maturation and relative age as context. Coaches rank
  technical, tactical and mental factors above anthropometrics.
  [Kelly & Williams review](https://ore.exeter.ac.uk/repository/handle/10871/121815),
  [Norwegian coaches study](https://pmc.ncbi.nlm.nih.gov/articles/PMC8875243)
- **Games and manager sims** (Football Manager, FIFA) use 1 to 20 attribute scales in
  technical, mental, physical and goalkeeping groups, summarised as six headline stats.
  [FM attributes](https://www.fifplay.com/football-manager-2025-player-attributes/)
- **Analytics sites** show radar charts of per-90 stats as **percentiles against players of the
  same position**; FBref uses one stat set for all outfield players, StatsBomb position-specific
  templates. [FBref](https://fbref.com/en/about/scouting-reports-explained),
  [StatsBomb radars](https://blogarchive.statsbomb.com/articles/soccer/understanding-statsbomb-radars/)
- **Roles/archetypes** are defined by function (ball-playing defender, box-to-box midfielder…)
  and are best derived from the attributes, not only the position label.
  [SciSports roles](https://support.scisports.com/en/articles/4599518-what-are-relevant-player-roles-for-any-position),
  [SCOUTED archetypes](https://scoutedftbl.com/scouted-archetypes-explained-player-profiles/)
- **Heat maps** are built from event data with x/y touch locations (Wyscout, StatsBomb, Opta),
  so they show on-ball actions only; off-ball positioning needs tracking data.
  [penaltyblog recipe](https://penaltyblog.readthedocs.io/en/latest/matchflow_recipes/05_touchmap.html)

A small amateur club has no event or tracking feed: scouts watch a match and write it up.
So the model is scout-entered, with a path for provider data later.

## Our model

| Piece | Choice | Why |
| --- | --- | --- |
| Attributes | 21 attributes in the 4 corners (technical, tactical, physical, psychological), **1 to 10**; goalkeepers rated on their own set (reflexes, handling, aerial, distribution, 1v1) | FA 4 corners fit youth; 10 points is quick to enter on a phone and reads as a radar |
| Corner radar | Mean per corner, 4 axes | The summary every report shows at a glance |
| Detail radar | One axis per rated attribute of the position group | The "radial diagram" Pedro asked for |
| Profile | Mean of the **last 3 reports** per attribute | Shows progress, damps a bad day |
| Percentile | Rank of the overall score among scouted athletes of the same position group | Analytics convention; honest only with a pool, so it is shown from 5 athletes |
| Position group | gk, cb, fb, mid, wing, fwd, from the form's position codes | Radars and archetypes differ by group |
| Archetype | 18 archetypes, each 4 key attributes; fit = mean of them (needs 3 of 4 rated); best fit shown, can be overridden by hand | Role from function, not only position |
| Heat map | **Manual 6x3 zone grid** (length x width), intensity 0 to 3, per report; profile = mean | No data feed; coarse on purpose so a scout can fill it in under 20 seconds |
| Provider data later | `heatFromPoints` bins 0-100 x/y touches into the same grid | Same storage, no migration |
| Athlete to person | Optional `person_id` on the prospect, set at creation or later; NIF forces it | See below |

Not recorded: height/weight trends, maturation (PHV) and relative age are context; height already
exists on the sheet. Add them if the club asks.

## Linking a scouted athlete to a person

1. A prospect is **not** a person (ADR 0007); the link is optional and can be made at creation or later.
2. **By NIF**: if the sheet has a NIF and a person has the same one, the link is forced. The API
   answers `link_confirmation_required` with the person's name; the app shows a warning ("will be
   linked to X") and resends with `confirmLink`. A person chosen by hand whose NIF differs is refused (`nif_mismatch`).
3. **By name**: `GET /prospects/:id/link-suggestions` ranks people by name similarity (accents and
   middle names ignored) with a bonus for the same birth year. Only name and identity code leave
   the server; the birth year is reported as a match flag.
4. NIF is personal-tier on both tables, validated (9 digits, mod-11).
5. Unlinking is allowed. Linking does not copy data; registering a signed player stays a deliberate act.
