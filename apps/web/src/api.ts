import type { AppType } from "@rsp/server/app";
import { hc } from "hono/client";

/** Typed API client. Route and payload types come straight from the server's AppType. */
export const api = hc<AppType>("/").api;
