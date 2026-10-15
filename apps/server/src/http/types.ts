import type { Db } from "../db/index.js";
import type { Mailer } from "../mail/mailer.js";
import type { Principal } from "../modules/access/service.js";
import type { Auth } from "../modules/auth/auth.js";

/** What the HTTP app needs from the outside world; tests pass a transaction and a fake mailer. */
export interface AppDeps {
  db: Db;
  auth: Auth;
  mailer: Mailer;
  /** Public URL of the web app, for links in emails. */
  appUrl: string;
}

/** Hono environment of every route: the signed-in principal, or null. */
export interface AppEnv {
  Variables: { principal: Principal | null };
}
