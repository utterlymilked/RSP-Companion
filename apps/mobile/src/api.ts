import type { AppType } from "@rsp/server/app";
import { hc } from "hono/client";
import { Platform } from "react-native";
import { apiBaseUrl } from "./config";

/** Typed API client. Route and payload types come straight from the server's AppType. */
export const api = hc<AppType>(apiBaseUrl(process.env.EXPO_PUBLIC_API_URL, Platform.OS)).api;
