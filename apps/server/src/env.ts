import { z } from "zod";

/** Environment variables, validated once at startup. See .env.example. */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_VERSION: z.string().default("dev"),
});
export type Env = z.infer<typeof envSchema>;

/** Parses and validates the environment; throws a readable error listing every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
