import type { AppType } from "@rsc/server/app";
import { hc } from "hono/client";
import { API_ORIGIN, isWeb, sessionHeaders } from "./auth/client";

/** Typed API client. Route and payload types come straight from the server's AppType. */
export const api = hc<AppType>(API_ORIGIN, {
  headers: sessionHeaders,
  init: { credentials: isWeb ? "same-origin" : "omit" },
}).api;
