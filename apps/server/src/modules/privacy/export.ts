import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "../../db/index.js";
import { roleAssignments, users } from "../auth/schema.js";
import { eventParticipants } from "../callups/schema.js";
import { documents } from "../documents/schema.js";
import { equipmentLoans, stockMovements } from "../equipment/schema.js";
import { evaluationScores, evaluations } from "../evaluations/schema.js";
import { events } from "../events/schema.js";
import { charges, payments } from "../fees/schema.js";
import { healthConsents } from "../health/schema.js";
import { incidentPeople, incidents } from "../incidents/schema.js";
import { notifications } from "../notifications/schema.js";
import { guardianships, memberships, persons } from "../people/schema.js";
import { classMembers, staffAssignments, teamMembers } from "../teams/schema.js";
import { transportPassengers, transportRides } from "../transport/schema.js";
import { consents, privacyRequests } from "./schema.js";

const others = alias(persons, "others");

/**
 * Everything the club holds about a person, as one JSON document (GDPR arts. 15 and 20):
 * the record, relationships, memberships, rosters, consents, call-ups, transport, fees,
 * evaluations, documents (metadata, not files), incidents, equipment and their login.
 * Health records are left out: clinical staff provide them on request (`excluded`).
 * Returns null when the person does not exist.
 */
export async function exportPerson(db: Db, personId: string, now = new Date()) {
  const [person] = await db.select().from(persons).where(eq(persons.id, personId));
  if (!person) return null;

  const guardianColumns = {
    relationship: guardianships.relationship,
    isPrimary: guardianships.isPrimary,
    fullName: others.fullName,
  };
  const guardians = await db
    .select({ personId: guardianships.guardianId, ...guardianColumns })
    .from(guardianships)
    .innerJoin(others, eq(others.id, guardianships.guardianId))
    .where(eq(guardianships.childId, personId));
  const wards = await db
    .select({ personId: guardianships.childId, ...guardianColumns })
    .from(guardianships)
    .innerJoin(others, eq(others.id, guardianships.childId))
    .where(eq(guardianships.guardianId, personId));

  const personCharges = await db.select().from(charges).where(eq(charges.personId, personId));
  const personEvaluations = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.personId, personId));
  const logins = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.personId, personId));
  const loginIds = logins.map((u) => u.id);

  return {
    exportedAt: now.toISOString(),
    person,
    guardians,
    wards,
    memberships: await db.select().from(memberships).where(eq(memberships.personId, personId)),
    teams: await db.select().from(teamMembers).where(eq(teamMembers.personId, personId)),
    classes: await db.select().from(classMembers).where(eq(classMembers.personId, personId)),
    staffAssignments: await db
      .select()
      .from(staffAssignments)
      .where(eq(staffAssignments.personId, personId)),
    consents: await db.select().from(consents).where(eq(consents.personId, personId)),
    healthConsents: await db
      .select()
      .from(healthConsents)
      .where(eq(healthConsents.personId, personId)),
    callUps: await db
      .select({
        eventId: eventParticipants.eventId,
        eventTitle: events.title,
        eventKind: events.kind,
        startsAt: events.startsAt,
        rsvp: eventParticipants.rsvp,
        rsvpNote: eventParticipants.rsvpNote,
        attendance: eventParticipants.attendance,
      })
      .from(eventParticipants)
      .innerJoin(events, eq(events.id, eventParticipants.eventId))
      .where(eq(eventParticipants.personId, personId)),
    transport: {
      seats: await db
        .select({
          rideId: transportPassengers.rideId,
          eventId: transportPassengers.eventId,
          kind: transportRides.kind,
          pickupPoint: transportRides.pickupPoint,
          pickupAt: transportRides.pickupAt,
        })
        .from(transportPassengers)
        .innerJoin(transportRides, eq(transportRides.id, transportPassengers.rideId))
        .where(eq(transportPassengers.personId, personId)),
      driving: await db
        .select()
        .from(transportRides)
        .where(eq(transportRides.driverPersonId, personId)),
    },
    fees: {
      charges: personCharges,
      payments:
        personCharges.length === 0
          ? []
          : await db
              .select()
              .from(payments)
              .where(
                inArray(
                  payments.chargeId,
                  personCharges.map((c) => c.id),
                ),
              ),
    },
    evaluations: personEvaluations,
    evaluationScores:
      personEvaluations.length === 0
        ? []
        : await db
            .select()
            .from(evaluationScores)
            .where(
              inArray(
                evaluationScores.evaluationId,
                personEvaluations.map((e) => e.id),
              ),
            ),
    documents: await db
      .select({
        id: documents.id,
        kind: documents.kind,
        title: documents.title,
        issuedOn: documents.issuedOn,
        expiresOn: documents.expiresOn,
        fileName: documents.fileName,
        contentType: documents.contentType,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.personId, personId)),
    incidents: await db
      .select({
        incidentId: incidents.id,
        type: incidents.type,
        occurredAt: incidents.occurredAt,
        role: incidentPeople.role,
      })
      .from(incidentPeople)
      .innerJoin(incidents, eq(incidents.id, incidentPeople.incidentId))
      .where(eq(incidentPeople.personId, personId)),
    equipment: {
      loans: await db.select().from(equipmentLoans).where(eq(equipmentLoans.personId, personId)),
      purchases: await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.personId, personId)),
    },
    privacyRequests: await db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.personId, personId)),
    logins,
    roles:
      loginIds.length === 0
        ? []
        : await db
            .select({
              userId: roleAssignments.userId,
              role: roleAssignments.role,
              teamId: roleAssignments.teamId,
              classId: roleAssignments.classId,
            })
            .from(roleAssignments)
            .where(inArray(roleAssignments.userId, loginIds)),
    notifications:
      loginIds.length === 0
        ? []
        : await db
            .select({
              kind: notifications.kind,
              title: notifications.title,
              createdAt: notifications.createdAt,
              readAt: notifications.readAt,
            })
            .from(notifications)
            .where(inArray(notifications.userId, loginIds)),
    excluded: ["health_records"],
  };
}

export type PersonExport = NonNullable<Awaited<ReturnType<typeof exportPerson>>>;
