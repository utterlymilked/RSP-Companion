import { clubsQuerySchema, createClubSchema } from "@rsc/shared";
import { Hono } from "hono";
import { ApiError } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { requirePermission } from "../access/middleware.js";
import { ensureClub, fetchWikidataClubs, importWikidataClubs, searchClubs } from "./service.js";

const present = (c: { id: string; name: string; city: string | null }) => ({
  id: c.id,
  name: c.name,
  city: c.city,
});

/**
 * /api/clubs: the club picker. Anyone who may read scouting searches; adding a club by hand
 * needs `scouting.write`, and loading the public Wikidata list `people.write` (office only).
 */
export const clubsRoutes = ({ db, fetchClubs = fetchWikidataClubs }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", requirePermission("scouting.read"), validate("query", clubsQuerySchema), async (c) =>
      c.json({ clubs: (await searchClubs(db, c.req.valid("query").q)).map(present) }),
    )
    .post(
      "/",
      requirePermission("scouting.write"),
      validate("json", createClubSchema),
      async (c) => {
        const { name, city } = c.req.valid("json");
        const club = await ensureClub(db, name, city);
        if (!club) throw new ApiError(400, "invalid_request");
        return c.json({ club: present(club) }, 201);
      },
    )
    .post("/import-wikidata", requirePermission("people.write"), async (c) => {
      let bindings: Awaited<ReturnType<typeof fetchWikidataClubs>>;
      try {
        bindings = await fetchClubs();
      } catch {
        throw new ApiError(502, "upstream_unavailable");
      }
      return c.json({ added: await importWikidataClubs(db, bindings), found: bindings.length });
    });
