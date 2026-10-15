/** Postgres error code of a failed statement (23505 unique, 23514 check, 23503 foreign key). */
export function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && typeof current.code === "string") return current.code;
    current = current.cause;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
