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
    /** Public URL of the app on the web; used for links in emails and as the trusted origin. */
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
