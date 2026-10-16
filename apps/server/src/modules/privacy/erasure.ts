import type { ErasureBlocker } from "@rsc/shared";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { ApiError } from "../../http/errors.js";
import type { FileStorage } from "../../storage/types.js";
import { audit } from "../audit/service.js";
import { users } from "../auth/schema.js";
import { documents } from "../documents/schema.js";
import { equipmentLoans, stockMovements } from "../equipment/schema.js";
import { evaluations } from "../evaluations/schema.js";
import { charges } from "../fees/schema.js";
import { incidentPeople } from "../incidents/schema.js";
import { persons } from "../people/schema.js";
import { transportRides } from "../transport/schema.js";
import { privacyRequests } from "./schema.js";
import { assertAdminRemains, loginsOf } from "./service.js";

/** What keeps a person from being erased now (empty when nothing does). */
export async function erasureBlockers(db: Db, personId: string): Promise<ErasureBlocker[]> {
  const blockers: ErasureBlocker[] = [];
  const [charge] = await db
    .select({ id: charges.id })
    .from(charges)
    .where(eq(charges.personId, personId))
    .limit(1);
  if (charge) blockers.push("fees");
  const [loan] = await db
    .select({ id: equipmentLoans.id })
    .from(equipmentLoans)
    .where(and(eq(equipmentLoans.personId, personId), isNull(equipmentLoans.returnedAt)))
    .limit(1);
  if (loan) blockers.push("equipment_loan");
  return blockers;
}

/**
 * Erases a person (GDPR art. 17): their stored files first (ADR 0009), then in one
 * transaction their evaluations, returned loans, incident involvement, carpools they offered
 * and logins, and finally the person row, whose delete cascades to everything else that
 * describes them (guardianships, rosters, call-ups, documents, health records, consents).
 * The audit log and other people's records keep only nulled references.
 *
 * Refused with 409 `erasure_blocked` (reasons in `issues`) while the club must keep records
 * about them (fees) or an item is still on loan, and with 409 `last_admin` when it would
 * remove the last admin. `requestId` closes the request it answers.
 */
export async function erasePerson(
  db: Db,
  storage: FileStorage | null,
  input: { personId: string; actorUserId: string; requestId?: string | null },
) {
  const { personId } = input;
  const [person] = await db
    .select({ id: persons.id })
    .from(persons)
    .where(eq(persons.id, personId));
  if (!person) throw new ApiError(404, "not_found");
  const blockers = await erasureBlockers(db, personId);
  if (blockers.length > 0) throw new ApiError(409, "erasure_blocked", blockers);
  const logins = await loginsOf(db, personId);
  await assertAdminRemains(db, logins);
  if (input.requestId) {
    const [request] = await db
      .select({ personId: privacyRequests.personId, status: privacyRequests.status })
      .from(privacyRequests)
      .where(eq(privacyRequests.id, input.requestId));
    if (!request || request.personId !== personId) throw new ApiError(404, "not_found");
    if (request.status !== "open") throw new ApiError(409, "conflict");
  }

  const files = await db
    .select({ storageKey: documents.storageKey })
    .from(documents)
    .where(eq(documents.personId, personId));
  if (files.length > 0) {
    if (!storage) throw new ApiError(503, "storage_unavailable");
    // Files first: a failure here stops the erasure with the records intact (retry later).
    for (const file of files) await storage.delete(file.storageKey);
  }

  await db.transaction(async (tx) => {
    if (input.requestId) {
      await tx
        .update(privacyRequests)
        .set({
          status: "done",
          resolvedAt: new Date(),
          resolvedBy: logins.includes(input.actorUserId) ? null : input.actorUserId,
        })
        .where(eq(privacyRequests.id, input.requestId));
    }
    await tx.delete(evaluations).where(eq(evaluations.personId, personId));
    await tx
      .delete(equipmentLoans)
      .where(and(eq(equipmentLoans.personId, personId), isNotNull(equipmentLoans.returnedAt)));
    // Sales without a charge (a charge blocks erasure) keep the stock movement, not the buyer.
    await tx
      .update(stockMovements)
      .set({ personId: null })
      .where(eq(stockMovements.personId, personId));
    await tx.delete(incidentPeople).where(eq(incidentPeople.personId, personId));
    await tx
      .delete(transportRides)
      .where(and(eq(transportRides.driverPersonId, personId), eq(transportRides.kind, "carpool")));
    for (const userId of logins) await tx.delete(users).where(eq(users.id, userId));
    await tx.delete(persons).where(eq(persons.id, personId));
    await audit(tx, {
      // An admin erasing their own record just deleted their login too.
      actorUserId: logins.includes(input.actorUserId) ? null : input.actorUserId,
      action: "person.erased",
      details: { files: files.length, logins: logins.length },
    });
  });
  return { files: files.length, logins: logins.length };
}
