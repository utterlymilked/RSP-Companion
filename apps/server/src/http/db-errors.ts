import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgCode } from "../db/errors.js";
import type { Db } from "../db/index.js";
import { ApiError } from "./errors.js";

const PG_CHECK_VIOLATION = "23514";

/**
 * Runs a write in its own transaction (a savepoint inside a test transaction, so a failure
 * does not poison the caller's) and turns constraint violations into API errors:
 * unique → 409 conflict, foreign key → 404 not_found, check → 400 invalid_request.
 */
export async function writeOrApiError<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(fn);
  } catch (error) {
    switch (pgCode(error)) {
      case PG_UNIQUE_VIOLATION:
        throw new ApiError(409, "conflict");
      case PG_FOREIGN_KEY_VIOLATION:
        throw new ApiError(404, "not_found");
      case PG_CHECK_VIOLATION:
        throw new ApiError(400, "invalid_request");
      default:
        throw error;
    }
  }
}
