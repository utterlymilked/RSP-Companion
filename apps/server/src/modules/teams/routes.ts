import {
  addStaffAssignmentSchema,
  addTeamMemberSchema,
  createTeamSchema,
  leaveSchema,
  listTeamsQuerySchema,
  updateTeamSchema,
} from "@rsc/shared";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { writeOrApiError } from "../../http/db-errors.js";
import { forbidden, notFound } from "../../http/errors.js";
import type { AppDeps, AppEnv } from "../../http/types.js";
import { validate } from "../../http/validate.js";
import { principalOf, requirePermission } from "../access/middleware.js";
import { readScope } from "../access/service.js";
import { organisations } from "../organisations/schema.js";
import { ageGroups, seasons } from "../seasons/schema.js";
import { classes, staffAssignments, teams } from "./schema.js";
import {
  addTeamMember,
  classRoster,
  enrolInClass,
  leaveClass,
  leaveTeam,
  listClasses,
  listTeams,
  teamRoster,
  teamStaff,
} from "./service.js";

const teamParam = z.object({ teamId: z.uuid() });
const teamMemberParam = teamParam.extend({ personId: z.uuid() });
const classParam = z.object({ classId: z.uuid() });
const classMemberParam = classParam.extend({ personId: z.uuid() });
const assignmentParam = z.object({ assignmentId: z.uuid() });
const joinSchema = z.object({ joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** Teams a reader may see, or 403 when they hold `teams.read` nowhere. */
function visibleIds(c: Parameters<typeof principalOf>[0], key: "teamIds" | "classIds") {
  const scope = readScope(principalOf(c), "teams.read");
  if (scope === "all") return null;
  if (scope.teamIds.length + scope.classIds.length === 0) throw forbidden();
  return scope[key];
}

/**
 * /api/teams: competition squads with their rosters and staff. Reads need `teams.read`
 * (coaches and team managers: their own team); writes need `teams.write` (admin, staff).
 */
export const teamsRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", validate("query", listTeamsQuerySchema), async (c) => {
      const teamIds = visibleIds(c, "teamIds");
      return c.json({
        teams: await listTeams(db, { seasonId: c.req.valid("query").seasonId, teamIds }),
      });
    })
    .post("/", requirePermission("teams.write"), validate("json", createTeamSchema), async (c) => {
      const [team] = await writeOrApiError(db, (tx) =>
        tx.insert(teams).values(c.req.valid("json")).returning(),
      );
      return c.json({ team }, 201);
    })
    .get(
      "/:teamId",
      validate("param", teamParam),
      requirePermission("teams.read", (c) => ({
        teamIds: [c.req.param("teamId") ?? ""],
        classIds: [],
      })),
      async (c) => {
        const { teamId } = c.req.valid("param");
        const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
        if (!team) throw notFound();
        const [roster, staff] = await Promise.all([teamRoster(db, teamId), teamStaff(db, teamId)]);
        return c.json({ team, roster, staff });
      },
    )
    .patch(
      "/:teamId",
      requirePermission("teams.write"),
      validate("param", teamParam),
      validate("json", updateTeamSchema),
      async (c) => {
        const [team] = await writeOrApiError(db, (tx) =>
          tx
            .update(teams)
            .set(c.req.valid("json"))
            .where(eq(teams.id, c.req.valid("param").teamId))
            .returning(),
        );
        if (!team) throw notFound();
        return c.json({ team });
      },
    )
    .post(
      "/:teamId/members",
      requirePermission("teams.write"),
      validate("param", teamParam),
      validate("json", addTeamMemberSchema),
      async (c) => {
        const member = await writeOrApiError(db, (tx) =>
          addTeamMember(tx, { teamId: c.req.valid("param").teamId, ...c.req.valid("json") }),
        );
        return c.json({ member }, 201);
      },
    )
    .post(
      "/:teamId/members/:personId/leave",
      requirePermission("teams.write"),
      validate("param", teamMemberParam),
      validate("json", leaveSchema),
      async (c) => {
        const left = await writeOrApiError(db, (tx) =>
          leaveTeam(tx, { ...c.req.valid("param"), ...c.req.valid("json") }),
        );
        if (!left) throw notFound();
        return c.body(null, 204);
      },
    );

/** /api/classes: turmas of the Escola de Futebol and the club, with athlete enrolment. */
export const classesRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .get("/", validate("query", listTeamsQuerySchema), async (c) => {
      const classIds = visibleIds(c, "classIds");
      return c.json({
        classes: await listClasses(db, { seasonId: c.req.valid("query").seasonId, classIds }),
      });
    })
    .get(
      "/:classId",
      validate("param", classParam),
      requirePermission("teams.read", (c) => ({
        teamIds: [],
        classIds: [c.req.param("classId") ?? ""],
      })),
      async (c) => {
        const { classId } = c.req.valid("param");
        const [turma] = await db.select().from(classes).where(eq(classes.id, classId));
        if (!turma) throw notFound();
        return c.json({ class: turma, roster: await classRoster(db, classId) });
      },
    )
    .post(
      "/:classId/members",
      requirePermission("teams.write"),
      validate("param", classParam),
      validate("json", joinSchema.extend({ personId: z.uuid() })),
      async (c) => {
        const member = await writeOrApiError(db, (tx) =>
          enrolInClass(tx, { classId: c.req.valid("param").classId, ...c.req.valid("json") }),
        );
        return c.json({ member }, 201);
      },
    )
    .post(
      "/:classId/members/:personId/leave",
      requirePermission("teams.write"),
      validate("param", classMemberParam),
      validate("json", leaveSchema),
      async (c) => {
        const left = await writeOrApiError(db, (tx) =>
          leaveClass(tx, { ...c.req.valid("param"), ...c.req.valid("json") }),
        );
        if (!left) throw notFound();
        return c.body(null, 204);
      },
    );

/** /api/staff-assignments: who does what in a season (coach of a team, nutritionist, …). */
export const staffAssignmentsRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .use(requirePermission("teams.write"))
    .post("/", validate("json", addStaffAssignmentSchema), async (c) => {
      const [assignment] = await writeOrApiError(db, (tx) =>
        tx.insert(staffAssignments).values(c.req.valid("json")).returning(),
      );
      return c.json({ assignment }, 201);
    })
    .delete("/:assignmentId", validate("param", assignmentParam), async (c) => {
      const rows = await db
        .delete(staffAssignments)
        .where(eq(staffAssignments.id, c.req.valid("param").assignmentId))
        .returning({ id: staffAssignments.id });
      if (rows.length === 0) throw notFound();
      return c.body(null, 204);
    });

/** Lookup lists the forms need: seasons with their escalões, and organisations. */
export const lookupRoutes = ({ db }: AppDeps) =>
  new Hono<AppEnv>()
    .use(requirePermission("teams.read"))
    .get("/seasons", async (c) =>
      c.json({
        seasons: await db.select().from(seasons).orderBy(asc(seasons.startsOn)),
        ageGroups: await db
          .select()
          .from(ageGroups)
          .orderBy(asc(ageGroups.sortOrder), asc(ageGroups.name)),
      }),
    )
    .get("/organisations", async (c) =>
      c.json({
        organisations: await db.select().from(organisations).orderBy(asc(organisations.name)),
      }),
    );
