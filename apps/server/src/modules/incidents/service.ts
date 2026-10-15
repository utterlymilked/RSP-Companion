import {
  type AccessScope,
  type CreateIncidentInput,
  hasPermission,
  type IncidentPersonRole,
  type ListIncidentsQuery,
  type UpdateIncidentInput,
} from "@rsc/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import type { Principal } from "../access/service.js";
import { persons } from "../people/schema.js";
import { type Incident, incidentPeople, incidents } from "./schema.js";

/** Most incidents one list call returns, newest first. */
const LIST_LIMIT = 200;

export type IncidentView = "full" | "summary";

/**
 * How much of an incident the principal may see, or null for none (callers answer 404):
 * - the reporter sees their own reports in full;
 * - injuries: full detail with `incidents.read_injury`, a summary (no text, no people) for
 *   other readers of the incident's team;
 * - other types: full for anyone with `incidents.read` over the incident's team.
 */
export function viewOf(principal: Principal, incident: Incident): IncidentView | null {
  if (incident.reportedBy === principal.userId) return "full";
  const scope: AccessScope = {
    teamIds: incident.teamId ? [incident.teamId] : [],
    classIds: [],
  };
  const canRead = hasPermission(principal.grants, "incidents.read", scope);
  if (incident.type !== "injury") return canRead ? "full" : null;
  if (hasPermission(principal.grants, "incidents.read_injury", scope)) return "full";
  return canRead ? "summary" : null;
}

/**
 * The API shape of an incident for a given view. Every view has the same keys so clients
 * get one type: a summary has no text (`description` and `followUp` are null) and no people.
 */
export function present(
  incident: Incident,
  view: IncidentView,
  extra: { people?: IncidentPerson[]; peopleCount?: number } = {},
) {
  const { clientKey: _clientKey, description, followUp, ...rest } = incident;
  const full = view === "full";
  const people = full ? (extra.people ?? []) : [];
  return {
    ...rest,
    view,
    description: full ? description : null,
    followUp: full ? followUp : null,
    people,
    peopleCount: full ? (extra.peopleCount ?? people.length) : 0,
  };
}

export interface IncidentPerson {
  personId: string;
  fullName: string;
  role: IncidentPersonRole;
}

export async function createIncident(
  db: Db,
  input: CreateIncidentInput,
  userId: string,
): Promise<{ incident: Incident; created: boolean }> {
  if (input.clientKey) {
    const [existing] = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.reportedBy, userId), eq(incidents.clientKey, input.clientKey)));
    if (existing) return { incident: existing, created: false };
  }
  const { people, ...fields } = input;
  const [incident] = await db
    .insert(incidents)
    .values({ ...fields, reportedBy: userId })
    .returning();
  if (!incident) throw new Error("Insert returned no row");
  const unique = [...new Map(people.map((p) => [p.personId, p])).values()];
  if (unique.length > 0) {
    await db.insert(incidentPeople).values(unique.map((p) => ({ incidentId: incident.id, ...p })));
  }
  return { incident, created: true };
}

export async function listIncidents(db: Db, filter: ListIncidentsQuery): Promise<Incident[]> {
  return db
    .select()
    .from(incidents)
    .where(
      and(
        filter.type ? eq(incidents.type, filter.type) : undefined,
        filter.status ? eq(incidents.status, filter.status) : undefined,
        filter.teamId ? eq(incidents.teamId, filter.teamId) : undefined,
      ),
    )
    .orderBy(desc(incidents.occurredAt), desc(incidents.id))
    .limit(LIST_LIMIT);
}

export async function getIncident(db: Db, incidentId: string): Promise<Incident | null> {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId));
  return incident ?? null;
}

/** People involved, with their names (general tier only). */
export async function incidentPeopleOf(db: Db, incidentId: string) {
  return db
    .select({ personId: persons.id, fullName: persons.fullName, role: incidentPeople.role })
    .from(incidentPeople)
    .innerJoin(persons, eq(persons.id, incidentPeople.personId))
    .where(eq(incidentPeople.incidentId, incidentId));
}

/** Number of people involved per incident, for list rows. */
export async function peopleCounts(db: Db, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ incidentId: incidentPeople.incidentId })
    .from(incidentPeople)
    .where(inArray(incidentPeople.incidentId, ids));
  const counts = new Map<string, number>();
  for (const { incidentId } of rows) counts.set(incidentId, (counts.get(incidentId) ?? 0) + 1);
  return counts;
}

export async function updateIncident(
  db: Db,
  incidentId: string,
  input: UpdateIncidentInput,
): Promise<Incident | null> {
  const values = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (Object.keys(values).length === 0) return getIncident(db, incidentId);
  const [incident] = await db
    .update(incidents)
    .set(values)
    .where(eq(incidents.id, incidentId))
    .returning();
  return incident ?? null;
}
