import {
  MODULE_IDS,
  type ModuleId,
  type ModuleOverrides,
  moduleOverridesSchema,
} from "@rsc/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { clubSettings } from "../settings/schema.js";

const MODULES_KEY = "modules";

/** The developer's on/off choices (club setting `modules`); unknown ids and bad data are ignored. */
export async function getModuleOverrides(db: Db): Promise<ModuleOverrides> {
  const [row] = await db.select().from(clubSettings).where(eq(clubSettings.key, MODULES_KEY));
  const parsed = moduleOverridesSchema.safeParse(row?.value);
  if (!parsed.success) return {};
  return Object.fromEntries(
    Object.entries(parsed.data).filter(([id]) => (MODULE_IDS as string[]).includes(id)),
  ) as Partial<Record<ModuleId, boolean>>;
}

export async function setModuleOverrides(db: Db, overrides: ModuleOverrides) {
  await db
    .insert(clubSettings)
    .values({ key: MODULES_KEY, value: overrides })
    .onConflictDoUpdate({ target: clubSettings.key, set: { value: overrides } });
}
