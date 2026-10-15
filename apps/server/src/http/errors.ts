import type { ApiErrorCode } from "@rsc/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** An API error: rendered as `{ error: { code } }` with `status` by the app's error handler. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ApiErrorCode,
    readonly issues?: unknown,
  ) {
    super(code);
  }
}

export const unauthenticated = () => new ApiError(401, "unauthenticated");
export const forbidden = () => new ApiError(403, "forbidden");
export const notFound = () => new ApiError(404, "not_found");
