import { type BookingActivity, type BookingStatus, fromLisbon, parseLocal } from "@rsc/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import { departments } from "../organisations/schema.js";
import { type Issue, normalizeHeader, parseDate } from "../people/import.js";
import { bookings, spaces } from "./schema.js";
import { createBookings } from "./service.js";

// Import of the club's room-booking sheet (tab MARCAÇÃO, exported as CSV). Pure parsing is
// here and tested with invented data; the CLI (src/scripts/import-bookings.ts) reads the
// real file. Spaces and departments must already exist (create them in the app first): rows
// naming an unknown one are reported, not guessed. Output cites line numbers only.

const HEADER_ALIASES = {
  space: ["infraestrutura", "infraestruturas", "espaco", "local", "sala"],
  department: ["gabinete", "departamento", "gabinete que marca", "departamento que marca"],
  date: ["data", "dia"],
  activity: ["atividade", "atividades", "actividade"],
  start: ["inicio", "hora inicio", "hora de inicio", "hi"],
  end: ["fim", "hora fim", "hora de fim", "hf"],
  status: ["estado", "status", "situacao"],
  targetGroup: ["publico alvo", "grupo alvo", "destinatarios", "publico", "target group"],
  expected: ["previstos", "n previstos", "participantes previstos", "n participantes previstos"],
  actual: ["reais", "n reais", "participantes reais", "n participantes reais", "presencas"],
  notes: ["observacoes", "notas", "obs", "notes"],
} as const;
type Field = keyof typeof HEADER_ALIASES;

const STATUSES: Record<string, BookingStatus> = {
  confirmado: "confirmed",
  "a confirmar": "to_confirm",
  "nao confirmado": "not_confirmed",
  anulado: "voided",
  realizado: "done",
  agendar: "to_schedule",
  reagendar: "to_reschedule",
  adiada: "postponed",
  adiado: "postponed",
  reagendado: "rescheduled",
  reagendada: "rescheduled",
  cancelado: "cancelled",
  cancelada: "cancelled",
};

function activityOf(text: string): BookingActivity {
  const n = normalizeHeader(text);
  if (n.startsWith("formacao")) return "formation";
  if (n.startsWith("analise")) return "game_analysis";
  if (n.startsWith("reuniao")) return "meeting";
  if (n.startsWith("recrutamento")) return "recruitment";
  if (n.startsWith("treino")) return "training";
  if (n.startsWith("jogo")) return "match";
  if (n.startsWith("aluguer")) return "rental";
  return "other";
}

/** "18:30", "18h30" or "18h" → "18:30"; null when it is not a time of day. */
export function parseTime(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})\s*(?:[:h]\s*(\d{2})?)\s*$/i);
  if (!m) return null;
  const time = `${m[1]}:${m[2] ?? "00"}`;
  return parseLocal("2000-01-01", time) ? time : null;
}

export interface BookingRow {
  line: number;
  space: string;
  department: string;
  startsAt: Date;
  endsAt: Date;
  activity: BookingActivity;
  title: string | null;
  status: BookingStatus;
  targetGroup: string | null;
  expectedAttendance: number | null;
  actualAttendance: number | null;
  notes: string | null;
}

const count = (value: string | null) => {
  if (value === null) return { value: null, bad: false };
  const n = Number(value.replace(/\s/g, ""));
  const ok = Number.isInteger(n) && n >= 0;
  return { value: ok ? n : null, bad: !ok };
};

/** Maps CSV rows (header first, as from parseCsv) to booking rows; bad rows become issues. */
export function parseBookingImport(table: string[][]): { rows: BookingRow[]; issues: Issue[] } {
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
  const missing = (["space", "department", "date", "start", "end"] as const).filter(
    (f) => !column.has(f),
  );
  if (missing.length > 0) {
    return {
      rows: [],
      issues: [{ line: 1, message: `missing columns: ${missing.join(", ")}` }],
    };
  }
  const rows: BookingRow[] = [];
  const issues: Issue[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (field: Field) => cells[column.get(field) ?? -1]?.trim() || null;
    const problems: string[] = [];
    const space = get("space");
    const department = get("department");
    if (!space) problems.push("missing space");
    if (!department) problems.push("missing department");
    const date = parseDate(get("date") ?? "");
    const start = parseTime(get("start") ?? "");
    const end = parseTime(get("end") ?? "");
    if (!date) problems.push("invalid date");
    if (!start) problems.push("invalid start time");
    if (!end) problems.push("invalid end time");
    const statusRaw = get("status");
    const status = statusRaw ? STATUSES[normalizeHeader(statusRaw)] : "to_confirm";
    if (!status) problems.push("unknown status");
    const expected = count(get("expected"));
    const actual = count(get("actual"));
    if (expected.bad || actual.bad) problems.push("invalid attendance");
    let startsAt: Date | undefined;
    let endsAt: Date | undefined;
    if (date && start && end) {
      const s = parseLocal(date, start);
      const e = parseLocal(date, end);
      if (s && e) {
        startsAt = fromLisbon(s);
        endsAt = fromLisbon(e);
        if (endsAt <= startsAt) problems.push("end is not after start");
      }
    }
    if (problems.length > 0 || !space || !department || !status || !startsAt || !endsAt) {
      issues.push({ line, message: problems.join(", ") || "unusable row" });
      return;
    }
    const activityText = get("activity");
    rows.push({
      line,
      space,
      department,
      startsAt,
      endsAt,
      activity: activityText ? activityOf(activityText) : "other",
      title: activityText,
      status,
      targetGroup: get("targetGroup"),
      expectedAttendance: expected.value,
      actualAttendance: actual.value,
      notes: get("notes"),
    });
  });
  return { rows, issues };
}

export interface BookingImportSummary {
  created: number;
  alreadyThere: number;
  issues: Issue[];
}

/**
 * Creates the bookings of `rows`. A row identical to an existing booking (space, department,
 * times) is skipped, so the import can be re-run. Rows that overlap another booking or name
 * an unknown space or department are reported. Each row runs in a savepoint. Callers run
 * this in a transaction and roll it back for a dry run.
 */
export async function importBookings(db: Db, rows: BookingRow[]): Promise<BookingImportSummary> {
  const spaceIds = new Map(
    (await db.select({ id: spaces.id, name: spaces.name }).from(spaces)).map((s) => [
      normalizeHeader(s.name),
      s.id,
    ]),
  );
  const departmentIds = new Map(
    (await db.select({ id: departments.id, name: departments.name }).from(departments)).map((d) => [
      normalizeHeader(d.name),
      d.id,
    ]),
  );
  const summary: BookingImportSummary = { created: 0, alreadyThere: 0, issues: [] };
  for (const row of rows) {
    const spaceId = spaceIds.get(normalizeHeader(row.space));
    const departmentId = departmentIds.get(normalizeHeader(row.department));
    if (!spaceId || !departmentId) {
      const what = [!spaceId && "space", !departmentId && "department"]
        .filter(Boolean)
        .join(" and ");
      summary.issues.push({ line: row.line, message: `unknown ${what}` });
      continue;
    }
    const [same] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.spaceId, spaceId),
          eq(bookings.departmentId, departmentId),
          eq(bookings.startsAt, row.startsAt),
          eq(bookings.endsAt, row.endsAt),
        ),
      );
    if (same) {
      summary.alreadyThere++;
      continue;
    }
    try {
      await db.transaction(async (tx) => {
        const [booking] = await createBookings(
          tx,
          {
            spaceId,
            departmentId,
            teamId: null,
            activity: row.activity,
            title: row.title,
            targetGroup: row.targetGroup,
            expectedAttendance: row.expectedAttendance,
            notes: row.notes,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            status: row.status,
            repeat: null,
          },
          null,
        );
        if (booking && row.actualAttendance !== null) {
          await tx
            .update(bookings)
            .set({ actualAttendance: row.actualAttendance })
            .where(eq(bookings.id, booking.id));
        }
      });
      summary.created++;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      const message =
        error.code === "booking_conflict" ? "overlaps another booking" : `rejected (${error.code})`;
      summary.issues.push({ line: row.line, message });
    }
  }
  return summary;
}
