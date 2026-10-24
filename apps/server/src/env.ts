import { STACKS, type Stack } from "@rsc/shared";
import { z } from "zod";

/** What database scripts (migrate, seed, create-admin) need. */
const dbEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

/** Environment variables of the API server, validated once at startup. See .env.example. */
const envSchema = dbEnvSchema
  .extend({
    PORT: z.coerce.number().int().positive().default(3000),
    APP_VERSION: z.string().default("dev"),
    /** Staging sandbox: offer the fake demo logins on the sign-in screen (ADR 0018). Never on prod. */
    DEMO_MODE: z
      .enum(["true", "false", ""])
      .default("false")
      .transform((v) => v === "true"),
    /** Secret testers type to open the demo accounts; required with DEMO_MODE. Never committed or logged. */
    DEMO_ACCESS_CODE: z.string().min(16).optional(),
    /** Open self-registration on this stack (ADR 0026); also needs the `registration` module on. */
    SELF_REGISTRATION: z
      .enum(["on", "off", ""])
      .default("off")
      .transform((v) => v === "on"),
    /** Staging: rotating key testers need to register; never committed or logged. */
    REGISTRATION_KEY: z.string().min(16).optional(),
    /** Registration emails per day before they pause (circuit breaker; Brevo free plan is 300). */
    REGISTRATION_EMAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(250),
    /** Deployment (modules, ADR 0025); derived when unset: see `stackOf`. */
    APP_STACK: z.enum(STACKS).optional(),
    APP_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:8081"),
    /** Signs session cookies and tokens. Generate with `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32),
    /** smtp(s)://user:pass@host:port. Without it, emails are printed to the console. */
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    MAIL_FROM: z.string().default("SFF RSC <no-reply@localhost>"),
    /** Directory of the app's web build (apps/mobile/dist); served at / when set. */
    WEB_DIST_DIR: z.string().min(1).optional(),
    /** Android over-the-air update export (apps/mobile/dist-ota); updates are off when unset. */
    OTA_DIR: z.string().min(1).optional(),
    /**
     * File storage for documents (ADR 0009). Either an S3-compatible bucket (all four
     * STORAGE_S3_* values) or a directory on the server's disk; with neither, uploads answer 503.
     */
    STORAGE_S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    STORAGE_S3_REGION: z.string().default("us-east-1"),
    STORAGE_S3_BUCKET: z.string().min(1).optional(),
    STORAGE_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    STORAGE_DIR: z.string().min(1).optional(),
    /**
     * Master keys for identity evidence (ADR 0026 section 10): comma-separated `id:base64` of
     * 32-byte keys, the first one current. Server-only; generate with `openssl rand -base64 32`.
     */
    IDENTITY_DOCS_KEYS: z.string().min(10).optional(),
    /** Apple Developer Team ID; enables iOS universal links (apple-app-site-association). */
    APPLE_TEAM_ID: z
      .string()
      .regex(/^[A-Z0-9]{10}$/)
      .optional(),
    /** SHA-256 fingerprints of the Android signing certificate(s), comma-separated (EAS). */
    ANDROID_CERT_SHA256: z
      .string()
      .transform((value) =>
        value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().regex(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)))
      .optional(),
  })
  .refine((env) => !env.DEMO_MODE || env.DEMO_ACCESS_CODE, {
    message: "DEMO_ACCESS_CODE (16+ characters) is required with DEMO_MODE",
    path: ["DEMO_ACCESS_CODE"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.SMTP_URL, {
    message: "SMTP_URL is required in production",
    path: ["SMTP_URL"],
  })
  .refine(
    (env) =>
      !env.STORAGE_S3_BUCKET || (env.STORAGE_S3_ACCESS_KEY_ID && env.STORAGE_S3_SECRET_ACCESS_KEY),
    {
      message:
        "STORAGE_S3_ACCESS_KEY_ID and STORAGE_S3_SECRET_ACCESS_KEY are required with a bucket",
      path: ["STORAGE_S3_BUCKET"],
    },
  )
  .refine((env) => env.NODE_ENV !== "production" || env.APP_URL.startsWith("https://"), {
    message: "APP_URL must be https in production",
    path: ["APP_URL"],
  });
export type Env = z.infer<typeof envSchema>;

/** The stack the server runs as: `APP_STACK`, else prod/staging/dev from NODE_ENV and DEMO_MODE. */
export function stackOf(env: Pick<Env, "APP_STACK" | "NODE_ENV" | "DEMO_MODE">): Stack {
  if (env.APP_STACK) return env.APP_STACK;
  if (env.NODE_ENV !== "production") return "dev";
  return env.DEMO_MODE ? "staging" : "prod";
}

export type DbEnv = z.infer<typeof dbEnvSchema>;

function parse<T>(schema: z.ZodType<T>, source: NodeJS.ProcessEnv): T {
  // An empty value counts as unset, as Docker Compose passes `VAR: ${VAR:-}` through as "".
  const set = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const result = schema.safeParse(set);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Parses and validates the environment; throws a readable error listing every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parse(envSchema, source);
}

/** The subset that database scripts need, so they run without auth or mail settings. */
export function loadDbEnv(source: NodeJS.ProcessEnv = process.env): DbEnv {
  return parse(dbEnvSchema, source);
}
