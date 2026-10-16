import { randomBytes } from "node:crypto";
import type { Category, Sex } from "@rsc/shared";
import { and, asc, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { auditLog } from "../modules/audit/schema.js";
import { accounts, invitations, roleAssignments, sessions, users } from "../modules/auth/schema.js";
import { createUserWithPassword } from "../modules/auth/service.js";
import { bookings, spaceComponents, spaces, venues } from "../modules/bookings/schema.js";
import { syncParts } from "../modules/bookings/service.js";
import { equipmentItems } from "../modules/equipment/schema.js";
import { eventSeries } from "../modules/events/schema.js";
import { todayInLisbon } from "../modules/fees/service.js";
import { departments, organisations } from "../modules/organisations/schema.js";
import { guardianships, memberships, persons } from "../modules/people/schema.js";
import { ageGroups, seasons } from "../modules/seasons/schema.js";
import {
  classAgeGroups,
  classes,
  classMembers,
  classSchedules,
  staffAssignments,
  teamMembers,
  teams,
} from "../modules/teams/schema.js";
import { seedActivity } from "./demo.js";
import type { Db } from "./index.js";

/**
 * Fake but realistic data for development: the club's organisations and gabinetes, season
 * 2026/27 with its escalões, Escola de Futebol classes, competition teams, athletes with
 * guardians, coaches and clinical staff. Every person is invented; deterministic output.
 */

const FIRST_NAMES: Record<Sex, string[]> = {
  male: [
    "João",
    "Tiago",
    "Rodrigo",
    "Martim",
    "Francisco",
    "Duarte",
    "Tomás",
    "Gonçalo",
    "Diogo",
    "Afonso",
    "Rui",
    "Miguel",
    "Pedro",
    "Nuno",
    "Bruno",
  ],
  female: [
    "Maria",
    "Leonor",
    "Matilde",
    "Beatriz",
    "Carolina",
    "Inês",
    "Mariana",
    "Sofia",
    "Ana",
    "Rita",
    "Marta",
    "Joana",
    "Catarina",
    "Sara",
    "Teresa",
  ],
};
const SURNAMES = [
  "Silva",
  "Santos",
  "Ferreira",
  "Pereira",
  "Oliveira",
  "Costa",
  "Rodrigues",
  "Martins",
  "Jesus",
  "Sousa",
  "Fernandes",
  "Gonçalves",
  "Gomes",
  "Lopes",
  "Marques",
  "Alves",
  "Almeida",
  "Ribeiro",
  "Pinto",
  "Carvalho",
];

/** Small deterministic PRNG (mulberry32) so every seed run produces the same data. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEASON = { name: "2026/27", startsOn: "2026-07-01", endsOn: "2027-06-30" };

/** Escalões for 2026/27: Sub-N = born from (2027 - N), two birth years each. */
const AGE_GROUPS: { name: string; category: Category; from: number; to: number }[] = [
  { name: "Sub-7 (Petizes)", category: "mixed", from: 2020, to: 2021 },
  { name: "Sub-9 (Traquinas)", category: "mixed", from: 2018, to: 2019 },
  { name: "Sub-11 (Benjamins)", category: "male", from: 2016, to: 2017 },
  { name: "Sub-13 (Infantis)", category: "male", from: 2014, to: 2015 },
  { name: "Sub-15 (Iniciados)", category: "male", from: 2012, to: 2013 },
  { name: "Sub-17 (Juvenis)", category: "male", from: 2010, to: 2011 },
  { name: "Sub-19 (Juniores)", category: "male", from: 2008, to: 2009 },
  { name: "Seniores", category: "male", from: 1960, to: 2007 },
  { name: "Sub-15 Feminino", category: "female", from: 2012, to: 2014 },
  { name: "Sub-19 Feminino", category: "female", from: 2008, to: 2011 },
  { name: "Seniores Femininas", category: "female", from: 1960, to: 2007 },
];

const GABINETES = {
  club: [
    "Direção RSC",
    "Coordenação",
    "Metodologia de Treino e Jogo",
    "Treino Específico de GR",
    "Nutrição",
    "Avaliação Funcional / Treino de Força",
    "Scouting e Recrutamento",
    "Análise de Dados de Performance",
    "Psicologia",
    "Intervenção Social",
    "Medicina e Reabilitação",
    "Fisioterapia",
    "Gestão Administrativa",
  ],
  school: ["Direção EF"],
};

export interface SeedOptions {
  /** Lisbon date the activity (agenda, call-ups, fees) is laid out around; default today. */
  today?: string;
  /** Password of the demo logins; default DEV_PASSWORD (development only). */
  password?: string;
}

/** Logins the seed creates, one per kind of user, so each view of the app can be tried. */
export const DEMO_LOGINS = [
  { email: "admin@rsc.test", name: "Direção (demo)", role: "admin" },
  { email: "treinador@rsc.test", name: "Treinador (demo)", role: "coach" },
  { email: "delegado@rsc.test", name: "Delegado (demo)", role: "team_manager" },
  { email: "pais@rsc.test", name: "Encarregado de educação (demo)", role: "guardian" },
  { email: "tesouraria@rsc.test", name: "Tesouraria (demo)", role: "treasurer" },
  { email: "economato@rsc.test", name: "Economato (demo)", role: "stores" },
  { email: "fisio@rsc.test", name: "Fisioterapia (demo)", role: "physio" },
  { email: "scout@rsc.test", name: "Scouting (demo)", role: "scout" },
] as const;

export async function seed(db: Db, options: SeedOptions = {}): Promise<void> {
  const today = options.today ?? todayInLisbon();
  const random = rng(2026);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  let personCount = 0;
  const fakePerson = (sex: Sex, birthYear: number, contact: boolean) => {
    personCount++;
    const fullName = `${pick(FIRST_NAMES[sex])} ${pick(SURNAMES)} ${pick(SURNAMES)}`;
    const month = String(1 + Math.floor(random() * 12)).padStart(2, "0");
    const day = String(1 + Math.floor(random() * 28)).padStart(2, "0");
    return {
      fullName,
      sex,
      birthDate: `${birthYear}-${month}-${day}`,
      email: contact ? `pessoa${personCount}@example.test` : null,
      phone: contact ? `+351 900 ${String(personCount).padStart(6, "0")}` : null,
    };
  };
  const insertPerson = async (p: ReturnType<typeof fakePerson>) => {
    const [row] = await db.insert(persons).values(p).returning();
    if (!row) throw new Error("insert failed");
    return row;
  };

  const [club, sad, school, partner] = await db
    .insert(organisations)
    .values([
      { name: "Real Sport Clube Massamá", shortName: "Real SC", kind: "club" },
      { name: "Real SC SAD", shortName: "SAD", kind: "sad" },
      { name: "Escola de Futebol Real SC", shortName: "EF", kind: "football_school" },
      { name: "GP Sport Academy", kind: "partner" },
    ])
    .returning();
  if (!club || !sad || !school || !partner) throw new Error("organisations not created");

  const depts = await db
    .insert(departments)
    .values([
      ...GABINETES.club.map((name) => ({ organisationId: club.id, name })),
      ...GABINETES.school.map((name) => ({ organisationId: school.id, name })),
    ])
    .returning();
  const dept = (name: string) => {
    const found = depts.find((d) => d.name === name);
    if (!found) throw new Error(`department ${name} missing`);
    return found;
  };

  const [season] = await db
    .insert(seasons)
    .values({ ...SEASON, isCurrent: true })
    .returning();
  if (!season) throw new Error("season not created");
  const groups = await db
    .insert(ageGroups)
    .values(
      AGE_GROUPS.map((g, i) => ({
        seasonId: season.id,
        name: g.name,
        category: g.category,
        birthYearFrom: g.from,
        birthYearTo: g.to,
        sortOrder: i,
      })),
    )
    .returning();

  const base = { seasonId: season.id };
  const assign = (personId: string, values: Partial<typeof staffAssignments.$inferInsert>) =>
    db.insert(staffAssignments).values({
      ...base,
      personId,
      function: "head_coach",
      organisationId: club.id,
      ...values,
    });

  // Escola de Futebol: one class per youth escalão, 8 athletes each with guardians.
  const fees = [3750, 4250, 5500];
  const youth = groups.filter((g) => g.birthYearFrom >= 2008);
  for (const [i, group] of youth.entries()) {
    const [turma] = await db
      .insert(classes)
      .values({
        ...base,
        organisationId: school.id,
        code: `${i + 1}1`,
        name: `Turma ${group.name}`,
        monthlyFeeCents: fees[i % fees.length] ?? null,
      })
      .returning();
    if (!turma) throw new Error("class not created");
    await db.insert(classAgeGroups).values({ classId: turma.id, ageGroupId: group.id });
    await db.insert(classSchedules).values([
      { classId: turma.id, weekday: 2, startsAt: "18:00", endsAt: "19:30" },
      { classId: turma.id, weekday: 4, startsAt: "18:00", endsAt: "19:30" },
    ]);

    const coach = await insertPerson(fakePerson("male", 1985, true));
    await assign(coach.id, { organisationId: school.id, classId: turma.id });

    const [team] = await db
      .insert(teams)
      .values({
        ...base,
        organisationId: club.id,
        ageGroupId: group.id,
        name: `${group.name} A`,
        category: group.category,
      })
      .returning();
    if (!team) throw new Error("team not created");
    await assign(coach.id, { teamId: team.id });
    const delegate = await insertPerson(fakePerson("female", 1982, true));
    await assign(delegate.id, { function: "team_manager", teamId: team.id });

    for (let n = 0; n < 8; n++) {
      const sex: Sex =
        group.category === "mixed" ? pick(["male", "female"] as const) : group.category;
      const year =
        group.birthYearFrom + Math.floor(random() * (group.birthYearTo - group.birthYearFrom + 1));
      const athlete = await insertPerson(fakePerson(sex, year, false));
      await db
        .insert(classMembers)
        .values({ classId: turma.id, personId: athlete.id, joinedOn: SEASON.startsOn });
      await db.insert(teamMembers).values({
        teamId: team.id,
        personId: athlete.id,
        shirtNumber: n + 1,
        joinedOn: SEASON.startsOn,
      });

      const mother = await insertPerson(
        fakePerson("female", 1980 + Math.floor(random() * 10), true),
      );
      await db.insert(guardianships).values({
        guardianId: mother.id,
        childId: athlete.id,
        relationship: "mother",
        isPrimary: true,
      });
      if (random() < 0.5) {
        const father = await insertPerson(
          fakePerson("male", 1978 + Math.floor(random() * 10), true),
        );
        await db
          .insert(guardianships)
          .values({ guardianId: father.id, childId: athlete.id, relationship: "father" });
      }
      if (random() < 0.4) {
        await db.insert(memberships).values({
          personId: mother.id,
          organisationId: club.id,
          memberNumber: String(1000 + personCount),
          startedOn: "2024-09-01",
        });
      }
    }
  }

  // Club-wide staff in their gabinetes.
  const clinical = [
    ["nutritionist", "Nutrição"],
    ["physio", "Fisioterapia"],
    ["doctor", "Medicina e Reabilitação"],
    ["psychologist", "Psicologia"],
    ["sociologist", "Intervenção Social"],
    ["scout", "Scouting e Recrutamento"],
    ["coordinator", "Coordenação"],
    ["director", "Direção RSC"],
  ] as const;
  for (const [fn, gabinete] of clinical) {
    const person = await insertPerson(fakePerson(pick(["male", "female"] as const), 1975, true));
    await assign(person.id, { function: fn, departmentId: dept(gabinete).id });
  }

  await seedFacilities(db);
  await seedLogins(db, options.password ?? DEV_PASSWORD);
  await seedActivity(db, today, random);
}

/**
 * The home complex: campo 1 whole only, campo 2 whole, halves or thirds, campo 3 whole or
 * halves (their parts are created by `syncParts`), rooms and gabinetes.
 */
async function seedFacilities(db: Db) {
  const [home] = await db
    .insert(venues)
    .values({ name: "Complexo desportivo (casa)", kind: "home" })
    .returning();
  if (!home) throw new Error("venue not created");
  const rows = await db
    .insert(spaces)
    .values([
      { venueId: home.id, name: "Campo 1", kind: "field" },
      { venueId: home.id, name: "Campo 2", kind: "field", divisions: [2, 3] },
      { venueId: home.id, name: "Campo 3", kind: "field", divisions: [2] },
      { venueId: home.id, name: "Auditório", kind: "auditorium", capacity: 80 },
      { venueId: home.id, name: "Sala de reuniões 1", kind: "meeting_room", capacity: 12 },
      { venueId: home.id, name: "Sala de reuniões 2", kind: "meeting_room", capacity: 8 },
      { venueId: home.id, name: "Sala de treino de força", kind: "gym" },
      { venueId: home.id, name: "Gabinete de recrutamento/metodologia", kind: "office" },
      { venueId: home.id, name: "Gabinete da direção", kind: "office" },
      { venueId: home.id, name: "Gabinete DEF", kind: "office" },
    ])
    .returning();
  for (const row of rows) if (row.divisions.length > 0) await syncParts(db, row.id);
}

/** Password of the development logins created by the seed. */
export const DEV_PASSWORD = "rsc-dev-password";

/**
 * Demo logins (DEMO_LOGINS). The coach and delegado hold the first team, the guardian is the
 * mother of one of its athletes, so call-ups and fees show up for them.
 */
async function seedLogins(db: Db, password: string) {
  const [coaching] = await db
    .select({ personId: staffAssignments.personId, teamId: staffAssignments.teamId })
    .from(staffAssignments)
    .where(and(eq(staffAssignments.function, "head_coach"), isNotNull(staffAssignments.teamId)))
    .orderBy(asc(staffAssignments.createdAt), asc(staffAssignments.id))
    .limit(1);
  if (!coaching?.teamId) throw new Error("no coach to log in as");
  const teamId = coaching.teamId;
  const [delegate] = await db
    .select({ personId: staffAssignments.personId })
    .from(staffAssignments)
    .where(and(eq(staffAssignments.function, "team_manager"), eq(staffAssignments.teamId, teamId)))
    .limit(1);
  const [parent] = await db
    .select({ personId: guardianships.guardianId })
    .from(guardianships)
    .innerJoin(teamMembers, eq(teamMembers.personId, guardianships.childId))
    .where(and(eq(teamMembers.teamId, teamId), eq(guardianships.isPrimary, true)))
    .orderBy(asc(teamMembers.shirtNumber))
    .limit(1);
  const [physio] = await db
    .select({ personId: staffAssignments.personId })
    .from(staffAssignments)
    .where(eq(staffAssignments.function, "physio"))
    .limit(1);
  const personFor: Partial<Record<string, string | undefined>> = {
    coach: coaching.personId,
    team_manager: delegate?.personId,
    guardian: parent?.personId,
    physio: physio?.personId,
  };
  let adminId: string | null = null;
  for (const login of DEMO_LOGINS) {
    const user = await createUserWithPassword(db, {
      email: login.email,
      name: login.name,
      password,
      personId: personFor[login.role] ?? null,
    });
    if (login.role === "admin") adminId = user.id;
    const scoped = login.role === "coach" || login.role === "team_manager";
    await db
      .insert(roleAssignments)
      .values({ userId: user.id, role: login.role, teamId: scoped ? teamId : null });
  }
  // Pending invitations for the Utilizadores screen (one expired). The token hashes are random,
  // so no link can ever accept them.
  const day = 24 * 60 * 60 * 1000;
  await db.insert(invitations).values([
    {
      email: "nova.treinadora@example.test",
      tokenHash: randomBytes(32).toString("hex"),
      roles: [{ role: "coach", teamId, classId: null }],
      invitedBy: adminId,
      expiresAt: new Date(Date.now() + 5 * day),
    },
    {
      email: "socio.novo@example.test",
      tokenHash: randomBytes(32).toString("hex"),
      roles: [{ role: "member", teamId: null, classId: null }],
      invitedBy: adminId,
      expiresAt: new Date(Date.now() - 2 * day),
    },
  ]);
}

/** Empties every table seeded above (development only). */
export async function truncateAll(db: Db): Promise<void> {
  await db.execute(
    sql`TRUNCATE ${equipmentItems}, ${eventSeries}, ${bookings}, ${spaceComponents}, ${spaces}, ${venues}, ${auditLog}, ${invitations}, ${users}, ${staffAssignments}, ${teamMembers}, ${teams}, ${classMembers}, ${classSchedules}, ${classAgeGroups}, ${classes}, ${ageGroups}, ${seasons}, ${memberships}, ${guardianships}, ${persons}, ${departments}, ${organisations} CASCADE`,
  );
}

/**
 * Staging: replaces the demo data with a fresh set around today, keeping every login that is
 * not a demo one (with its password, sessions and club-wide roles). Their person links and
 * team roles go, because the people and teams they pointed at are replaced.
 */
export async function reseedKeepingAccounts(db: Db, options: SeedOptions = {}): Promise<void> {
  const demoEmails = DEMO_LOGINS.map((l) => l.email);
  const kept = await db.select().from(users).where(notInArray(users.email, demoEmails));
  const ids = kept.map((u) => u.id);
  const keptAccounts = ids.length
    ? await db.select().from(accounts).where(inArray(accounts.userId, ids))
    : [];
  const keptSessions = ids.length
    ? await db.select().from(sessions).where(inArray(sessions.userId, ids))
    : [];
  const keptRoles = ids.length
    ? await db
        .select()
        .from(roleAssignments)
        .where(
          and(
            inArray(roleAssignments.userId, ids),
            isNull(roleAssignments.teamId),
            isNull(roleAssignments.classId),
          ),
        )
    : [];

  await truncateAll(db);
  await seed(db, options);

  if (ids.length === 0) return;
  await db.insert(users).values(kept.map((u) => ({ ...u, personId: null })));
  if (keptAccounts.length) await db.insert(accounts).values(keptAccounts);
  if (keptSessions.length) await db.insert(sessions).values(keptSessions);
  if (keptRoles.length) {
    await db.insert(roleAssignments).values(keptRoles.map((r) => ({ ...r, grantedBy: null })));
  }
}
