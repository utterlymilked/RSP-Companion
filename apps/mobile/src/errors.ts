import { API_ERROR_CODES } from "@rsc/shared";

/** A non-2xx answer from our API, carrying its `{ error: { code } }`. */
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`API error ${status}: ${code}`);
  }
}

/** Throws ApiRequestError unless the response is 2xx; returns the parsed JSON body. */
export async function jsonOrThrow<T>(res: { ok: boolean; status: number; json(): Promise<T> }) {
  if (res.ok) return res.json();
  let code = "internal_error";
  try {
    const body = (await res.json()) as { error?: { code?: string } };
    code = body.error?.code ?? code;
  } catch {
    // Not JSON (proxy error page): keep the generic code.
  }
  throw new ApiRequestError(code, res.status);
}

/** Better Auth error codes we show a specific message for. */
const AUTH_CODES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "errors.invalid_credentials",
  INVALID_TOKEN: "errors.invalid_token",
  INVALID_PASSWORD: "errors.invalid_credentials",
  ACCOUNT_DEACTIVATED: "errors.account_deactivated",
};

/**
 * The i18n key for an error from our API, from Better Auth (`{ code, status }`) or from the
 * network. The API returns codes, never sentences; the app owns the wording.
 */
export function errorKey(error: unknown): string {
  if (error instanceof TypeError) return "errors.network"; // fetch failed: offline or no server
  if (typeof error !== "object" || error === null) return "errors.generic";
  const { code, status } = error as { code?: unknown; status?: unknown };
  if (status === 429) return "errors.rate_limited";
  if (typeof code === "string") {
    if (code in AUTH_CODES) return AUTH_CODES[code] ?? "errors.generic";
    if ((API_ERROR_CODES as readonly string[]).includes(code)) return `errors.${code}`;
  }
  return "errors.generic";
}
