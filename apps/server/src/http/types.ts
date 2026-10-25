import type { Stack } from "@rsc/shared";
import type { Db } from "../db/index.js";
import type { Mailer } from "../mail/mailer.js";
import type { Principal } from "../modules/access/service.js";
import type { Auth } from "../modules/auth/auth.js";
import type { WikidataBinding } from "../modules/clubs/service.js";
import type { EvidenceStore } from "../modules/evidence/service.js";
import type { RegistrationDeps } from "../modules/registration/service.js";
import type { PushSender } from "../push/index.js";
import type { FileStorage } from "../storage/types.js";
import type { AppPolicy } from "./app-version.js";

/** What the HTTP app needs from the outside world; tests pass a transaction and a fake mailer. */
export interface AppDeps {
  db: Db;
  auth: Auth;
  mailer: Mailer;
  /** Push notifications through Expo; tests pass an in-memory sender. */
  push: PushSender;
  /** Deployment the server runs as; decides which modules exist and their defaults (ADR 0025). */
  stack: Stack;
  /** Public URL of the web app, for links in emails. */
  appUrl: string;
  /** Where uploaded documents are kept; null when the server has none configured. */
  storage: FileStorage | null;
  /** Encrypted identity-evidence storage; null until object storage and the master keys exist. */
  evidence: EvidenceStore | null;
  /** Self-registration and its abuse protection (ADR 0026). */
  registration: RegistrationDeps;
  /** Loads the public club list from Wikidata; tests pass a stub. */
  fetchClubs?: () => Promise<WikidataBinding[]>;
  /** Minimum app version, enforced and published (ADR 0028); absent: no client is refused. */
  appPolicy?: AppPolicy;
}

/** Hono environment of every route: the signed-in principal, or null. */
export interface AppEnv {
  Variables: { principal: Principal | null };
}
