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
    /** Public URL of the web app; used for links in emails and as the trusted origin. */
    APP_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:5173"),
    /** Signs session cookies and tokens. Generate with `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32),
    /** smtp(s)://user:pass@host:port. Without it, emails are printed to the console. */
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    MAIL_FROM: z.string().default("RSP Companion <no-reply@localhost>"),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.SMTP_URL, {
    message: "SMTP_URL is required in production",
    path: ["SMTP_URL"],
  })
  .refine((env) => env.NODE_ENV !== "production" || env.APP_URL.startsWith("https://"), {
    message: "APP_URL must be https in production",
    path: ["APP_URL"],
  });
export type Env = z.infer<typeof envSchema>;

export type DbEnv = z.infer<typeof dbEnvSchema>;

function parse<T>(schema: z.ZodType<T>, source: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(source);
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
