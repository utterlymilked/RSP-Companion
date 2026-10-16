# ADR 0013: Dashboards and CSV exports

- Status: Accepted
- Date: 2026-10-16

## Context

Managers want a quick view of what needs attention (overdue fees, low stock, open incidents,
expiring documents, open data requests) and the lists behind it as spreadsheets.

## Decision

- `GET /api/dashboard` returns counts, each present only when the caller holds the
  underlying permission **club-wide** (`readScope(...) === "all"`; incidents use
  `incidents.manage`). Team-scoped roles get no club totals, so a count never reveals more
  than the screen behind it. No health or personal-tier data is aggregated.
- `GET /api/dashboard/export/{overdue-fees,stock,expiring-documents}.csv` return the same
  lists the screens show, guarded by the same permissions. CSV is UTF-8 with BOM (Excel),
  CRLF, and cells starting with `= + - @` are prefixed with `'` against formula injection.
- The app shows the widgets on the home screen and exports through a download (web) or the
  share sheet (phones). No new permissions or tables.
- PDF export is not built; CSV covers the club's need for spreadsheets. Revisit on request.
