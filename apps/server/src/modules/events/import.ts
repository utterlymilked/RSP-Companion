import {
  type EventStatus,
  fromLisbon,
  type HomeAway,
  MATCH_FORMATS,
  type MatchFormat,
  type MatchType,
  parseLocal,
} from "@rsc/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { parseTime } from "../bookings/import.js";
import { venues } from "../bookings/schema.js";
import { type Issue, normalizeHeader, parseDate } from "../people/import.js";
import { teams } from "../teams/schema.js";
import { eventMatches, events } from "./schema.js";

// Import of the club's matches sheet (Marcação_Jogos, exported as CSV). Pure parsing is here
// and tested with invented data; the CLI (src/scripts/import-events.ts) reads the real file.
// Only events are created: the field reservations come from the room-booking import. Teams
// and external venues are matched by name when they exist; otherwise the row is kept without
// a team and the venue text goes to `location`. Output cites line numbers only.

const HEADER_ALIASES = {
  team: ["equipa", "team"],
  group: ["escalao", "escalão", "escalao seccao", "seccao"],
  date: ["data", "dia"],
  type: ["atividade", "atividades", "actividade", "tipo de jogo"],
  status: ["estado", "status", "situacao"],
  competition: ["competicao", "tipo"],
  round: ["jornada", "ronda"],
  start: ["inicio", "hora inicio", "hora de inicio", "hi"],
  end: ["fim", "hora fim", "hora de fim", "hf"],
  format: ["formato", "futebol"],
  opponent: ["adversario", "adversário", "opponent"],
  venue: ["local", "campo", "infraestrutura"],
  notes: ["observacoes", "notas", "obs", "notes"],
  transport: ["transporte"],
  kit: ["equipamento", "equipamentos"],
  medicalCover: ["apoio medico", "cobertura medica", "assistencia medica"],
} as const;
type Field = keyof typeof HEADER_ALIASES;

const STATUSES: Record<string, EventStatus> = {
  confirmado: "scheduled",
  "a confirmar": "scheduled",
  agendar: "scheduled",
  realizado: "played",
  adiada: "postponed",
  adiado: "postponed",
  cancelado: "cancelled",
  cancelada: "cancelled",
  anulado: "cancelled",
};

function matchTypeOf(text: string | null): MatchType {
  const n = normalizeHeader(text ?? "");
  if (n.includes("taca")) return "cup";
  if (n.includes("campeonato")) return "league";
  return "friendly";
}

/** "Fut 7", "futebol 4+GR", "F11" → a format, or null when it is none of them. */
export function formatOf(text: string | null): MatchFormat | null {
  const digits = normalizeHeader(text ?? "").match(/\d+/)?.[0];
  const format = `fut${digits}` as MatchFormat;
  return digits && (MATCH_FORMATS as readonly string[]).includes(format) ? format : null;
}

export interface MatchRow {
  line: number;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
  team: string | null;
  title: string | null;
  matchType: MatchType;
  competition: string | null;
  round: string | null;
  format: MatchFormat | null;
  opponent: string;
  venue: string | null;
  homeAway: HomeAway;
  notes: string | null;
  transport: string | null;
  kit: string | null;
  medicalCover: string | null;
}

/** Maps CSV rows (header first, as from parseCsv) to match rows; bad rows become issues. */
export function parseMatchImport(table: string[][]): { rows: MatchRow[]; issues: Issue[] } {
  const [header, ...body] = table;
  if (!header) return { rows: [], issues: [{ line: 0, message: "file is empty" }] };
  const column = new Map<Field, number>();
  header.forEach((h, index) => {
    const name = normalizeHeader(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if ((aliases as readonly string[]).includes(name) && !column.has(field as Field)) {
        column.set(field as Field, index);
      }
    }
  });
  const missing = (["date", "start", "end", "opponent"] as const).filter((f) => !column.has(f));
  if (missing.length > 0) {
    return { rows: [], issues: [{ line: 1, message: `missing columns: ${missing.join(", ")}` }] };
  }
  const rows: MatchRow[] = [];
  const issues: Issue[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (field: Field) => cells[column.get(field) ?? -1]?.trim() || null;
    const problems: string[] = [];
    const date = parseDate(get("date") ?? "");
    const start = parseTime(get("start") ?? "");
    const end = parseTime(get("end") ?? "");
    if (!date) problems.push("invalid date");
    if (!start) problems.push("invalid start time");
    if (!end) problems.push("invalid end time");
    const opponent = get("opponent");
    if (!opponent) problems.push("missing opponent");
    const statusRaw = get("status");
    const status = statusRaw ? STATUSES[normalizeHeader(statusRaw)] : "scheduled";
    if (!status) problems.push("unknown status");
    const s = date && start ? parseLocal(date, start) : null;
    const e = date && end ? parseLocal(date, end) : null;
    const startsAt = s && fromLisbon(s);
    const endsAt = e && fromLisbon(e);
    if (startsAt && endsAt && endsAt <= startsAt) problems.push("end is not after start");
    if (problems.length > 0 || !opponent || !status || !startsAt || !endsAt) {
      issues.push({ line, message: problems.join(", ") || "unusable row" });
      return;
    }
    const venue = get("venue");
    rows.push({
      line,
      startsAt,
      endsAt,
      status,
      team: get("team"),
      title: get("group"),
      matchType: matchTypeOf(get("type") ?? get("competition")),
      competition: get("competition"),
      round: get("round"),
      format: formatOf(get("format")),
      opponent,
      venue,
      homeAway: venue && /^campo\s*\d/i.test(normalizeHeader(venue)) ? "home" : "away",
      notes: get("notes"),
      transport: get("transport"),
      kit: get("kit"),
      medicalCover: get("medicalCover"),
    });
  });
  return { rows, issues };
}

export interface MatchImportSummary {
  created: number;
  alreadyThere: number;
  issues: Issue[];
}

/**
 * Creates the matches of `rows`. A match with the same start time, opponent and team as an
 * existing one is skipped, so the import can be re-run. Callers run this in a transaction and
 * roll it back for a dry run.
 */
export async function importMatches(db: Db, rows: MatchRow[]): Promise<MatchImportSummary> {
  const teamIds = new Map(
    (await db.select({ id: teams.id, name: teams.name }).from(teams)).map((t) => [
      normalizeHeader(t.name),
      t.id,
    ]),
  );
  const venueIds = new Map(
    (await db.select({ id: venues.id, name: venues.name }).from(venues)).map((v) => [
      normalizeHeader(v.name),
      v.id,
    ]),
  );
  const summary: MatchImportSummary = { created: 0, alreadyThere: 0, issues: [] };
  for (const row of rows) {
    const teamId = row.team ? (teamIds.get(normalizeHeader(row.team)) ?? null) : null;
    if (row.team && !teamId) {
      summary.issues.push({ line: row.line, message: "unknown team, imported without one" });
    }
    const venueId = row.venue ? (venueIds.get(normalizeHeader(row.venue)) ?? null) : null;
    const candidates = await db
      .select({ id: events.id, teamId: events.teamId, opponent: eventMatches.opponent })
      .from(events)
      .innerJoin(eventMatches, eq(eventMatches.eventId, events.id))
      .where(and(eq(events.kind, "match"), eq(events.startsAt, row.startsAt)));
    if (candidates.some((c) => c.teamId === teamId && c.opponent === row.opponent)) {
      summary.alreadyThere++;
      continue;
    }
    const [event] = await db
      .insert(events)
      .values({
        kind: "match",
        teamId,
        venueId,
        status: row.status,
        title: row.title,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        location: venueId ? null : row.venue,
        notes: row.notes,
      })
      .returning({ id: events.id });
    if (!event) throw new Error("Insert returned no row");
    await db.insert(eventMatches).values({
      eventId: event.id,
      matchType: row.matchType,
      competition: row.competition,
      round: row.round,
      format: row.format,
      opponent: row.opponent,
      homeAway: row.homeAway,
      kit: row.kit,
      transport: row.transport,
      medicalCover: row.medicalCover,
    });
    summary.created++;
  }
  return summary;
}
