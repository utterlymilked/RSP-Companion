import { normaliseName } from "@rsc/shared";
import { asc, eq, ilike, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { type Club, clubs } from "./schema.js";

const WIKIDATA_URL = "https://query.wikidata.org/sparql";
/** Portuguese association football clubs (Q476028 in Q45), with their seat when known. */
const WIKIDATA_QUERY = `SELECT ?c ?cLabel ?cityLabel WHERE {
  ?c wdt:P31/wdt:P279* wd:Q476028; wdt:P17 wd:Q45.
  OPTIONAL { ?c wdt:P159 ?city. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
}`;

export interface WikidataBinding {
  c: { value: string };
  cLabel?: { value: string };
  cityLabel?: { value: string };
}

/** Clubs matching the text (accents and case ignored), best first; the first few when empty. */
export async function searchClubs(db: Db, q?: string, limit = 20): Promise<Club[]> {
  const key = q ? normaliseName(q) : "";
  return db
    .select()
    .from(clubs)
    .where(key ? ilike(clubs.nameKey, `%${key.replace(/[%_\\]/g, "\\$&")}%`) : undefined)
    .orderBy(
      // Names that start with the text come first.
      sql`(${clubs.nameKey} like ${`${key}%`}) desc`,
      asc(clubs.name),
    )
    .limit(limit);
}

/** Adds a club typed in by hand unless one with that name exists; returns the stored club. */
export async function ensureClub(db: Db, name: string, city?: string | null): Promise<Club | null> {
  const clean = name.trim();
  const nameKey = normaliseName(clean);
  if (nameKey.length < 2) return null;
  const [created] = await db
    .insert(clubs)
    .values({ name: clean, nameKey, city: city ?? null, source: "manual" })
    .onConflictDoNothing({ target: clubs.nameKey })
    .returning();
  if (created) return created;
  const [existing] = await db.select().from(clubs).where(eq(clubs.nameKey, nameKey));
  return existing ?? null;
}

/** Stores the clubs of a Wikidata result; returns how many were new. Existing names are kept. */
export async function importWikidataClubs(
  db: Db,
  bindings: readonly WikidataBinding[],
): Promise<number> {
  const rows = new Map<string, typeof clubs.$inferInsert>();
  for (const b of bindings) {
    const name = b.cLabel?.value.trim();
    const wikidataId = b.c.value.split("/").pop();
    // Entries without a label come back as their Q-number.
    if (!name || /^Q\d+$/.test(name) || !wikidataId) continue;
    const nameKey = normaliseName(name);
    if (nameKey.length < 2 || rows.has(nameKey)) continue;
    rows.set(nameKey, {
      name,
      nameKey,
      city: b.cityLabel?.value ?? null,
      source: "wikidata",
      wikidataId,
    });
  }
  const values = [...rows.values()];
  let added = 0;
  for (let i = 0; i < values.length; i += 200) {
    const done = await db
      .insert(clubs)
      .values(values.slice(i, i + 200))
      .onConflictDoNothing()
      .returning({ id: clubs.id });
    added += done.length;
  }
  return added;
}

/** Downloads the public list from Wikidata (CC0) and stores it. */
export async function fetchWikidataClubs(
  fetcher: typeof fetch = fetch,
): Promise<WikidataBinding[]> {
  const url = `${WIKIDATA_URL}?${new URLSearchParams({ query: WIKIDATA_QUERY })}`;
  const res = await fetcher(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "rsc-companion/1.0 (club picker)",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
  const body = (await res.json()) as { results: { bindings: WikidataBinding[] } };
  return body.results.bindings;
}

/**
 * On first start the club list is empty: loads the public list once in the background so the
 * picker works without anyone pressing a button. A failure is logged and retried at the next
 * start; the office can also load it from the API.
 */
export async function loadClubsIfEmpty(db: Db): Promise<void> {
  try {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(clubs);
    if ((row?.n ?? 0) > 0) return;
    const added = await importWikidataClubs(db, await fetchWikidataClubs());
    console.log(`clubs: loaded ${added} from Wikidata`);
  } catch (error) {
    console.warn("clubs: could not load the public list", error);
  }
}
