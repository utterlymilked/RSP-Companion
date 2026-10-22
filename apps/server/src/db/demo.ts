import {
  addLocalDays,
  type BookingActivity,
  fromLisbon,
  type LocalDateTime,
  type MatchFormat,
  overallScore,
  type PositionGroup,
  type RsvpStatus,
  type Scores,
} from "@rsc/shared";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { roleAssignments, users } from "../modules/auth/schema.js";
import { bookings, spaces, venues } from "../modules/bookings/schema.js";
import { eventParticipants } from "../modules/callups/schema.js";
import { equipmentItems, equipmentLoans, stockMovements } from "../modules/equipment/schema.js";
import { eventInvitees, eventMatches, eventSeries, events } from "../modules/events/schema.js";
import { charges, feePlans, payments } from "../modules/fees/schema.js";
import { healthConsents, injuries } from "../modules/health/schema.js";
import { incidentPeople, incidents } from "../modules/incidents/schema.js";
import { announcements, notifications } from "../modules/notifications/schema.js";
import { departments } from "../modules/organisations/schema.js";
import { guardianships, memberships, persons } from "../modules/people/schema.js";
import { prospectReports, prospects } from "../modules/scouting/schema.js";
import { ageGroups, seasons } from "../modules/seasons/schema.js";
import { teamMembers, teams } from "../modules/teams/schema.js";
import { transportPassengers, transportRides } from "../modules/transport/schema.js";
import type { Db } from "./index.js";

/**
 * Club activity for the demo and development data, laid out around `today` (a Lisbon date)
 * so the agenda, call-ups and fees always look current: weekly trainings and weekend matches
 * for the whole season, call-ups and attendance near today, monthly fees with payments,
 * the economato, incidents, injuries, scouting and announcements. Everything is invented.
 */

type Random = () => number;

const OPPONENTS = [
  "GD Rio de Mouro",
  "AD Oeiras",
  "CD Cacém",
  "SU Sintrense",
  "Atlético Queluz",
  "CF Amadora Norte",
  "GD Tires",
  "Belas FC",
  "AC Agualva",
  "Mem Martins SC",
  "CD Paço de Arcos",
  "Casal de Cambra FC",
];

const TRAINING_TIMES: [number, number][] = [
  [18, 0],
  [19, 30],
];
const TRAINING_FIELDS = ["Campo 1", "Campo 2", "Campo 3"];

/**
 * Two weekly sessions per team (Mon/Wed, Tue/Thu, Wed/Fri, …), each in the first free time and
 * field of that weekday, so no two trainings ever share a field.
 */
function trainingSlots(teamCount: number) {
  const used = new Set<string>();
  const result: { weekday: number; start: [number, number]; field: string }[][] = [];
  for (let team = 0; team < teamCount; team++) {
    const sessions: { weekday: number; start: [number, number]; field: string }[] = [];
    for (const offset of [0, 2]) {
      let found = false;
      for (let shift = 0; shift < 5 && !found; shift++) {
        const weekday = ((team + offset + shift) % 5) + 1;
        for (const start of TRAINING_TIMES) {
          const field = TRAINING_FIELDS.find((f) => !used.has(`${weekday} ${start} ${f}`));
          if (!field || sessions.some((x) => x.weekday === weekday)) continue;
          used.add(`${weekday} ${start} ${field}`);
          sessions.push({ weekday, start, field });
          found = true;
          break;
        }
      }
    }
    result.push(sessions);
  }
  return result;
}

interface RoomSlot {
  space: string;
  department: string;
  activity: BookingActivity;
  title: string;
  targetGroup?: string;
  /** Days of the week, 0 = Sunday. */
  weekdays: number[];
  start: [number, number];
  minutes: number;
}

/** Weekly use of the rooms and gabinetes; none overlaps another in the same space. */
const ROOM_SLOTS: RoomSlot[] = [
  {
    space: "Sala de treino de força",
    department: "Avaliação Funcional / Treino de Força",
    activity: "training",
    title: "Treino de força Sub-17 e Sub-19",
    targetGroup: "Sub-17, Sub-19",
    weekdays: [1, 2, 3, 4, 5],
    start: [17, 0],
    minutes: 60,
  },
  {
    space: "Sala de treino de força",
    department: "Avaliação Funcional / Treino de Força",
    activity: "other",
    title: "Avaliação funcional",
    weekdays: [2, 4],
    start: [10, 0],
    minutes: 120,
  },
  {
    space: "Sala de reuniões 1",
    department: "Direção RSC",
    activity: "meeting",
    title: "Reunião de direção",
    weekdays: [1],
    start: [10, 0],
    minutes: 90,
  },
  {
    space: "Sala de reuniões 1",
    department: "Coordenação",
    activity: "meeting",
    title: "Reunião de coordenação técnica",
    weekdays: [3],
    start: [18, 30],
    minutes: 90,
  },
  {
    space: "Sala de reuniões 2",
    department: "Análise de Dados de Performance",
    activity: "game_analysis",
    title: "Análise de jogo Seniores",
    targetGroup: "Seniores",
    weekdays: [4],
    start: [19, 0],
    minutes: 60,
  },
  {
    space: "Sala de reuniões 2",
    department: "Nutrição",
    activity: "formation",
    title: "Nutrição: sessão de grupo",
    weekdays: [2],
    start: [18, 0],
    minutes: 60,
  },
  {
    space: "Auditório",
    department: "Metodologia de Treino e Jogo",
    activity: "formation",
    title: "Formação de treinadores",
    weekdays: [6],
    start: [10, 0],
    minutes: 150,
  },
  {
    space: "Gabinete DEF",
    department: "Psicologia",
    activity: "other",
    title: "Consultas de psicologia",
    weekdays: [2, 4],
    start: [17, 0],
    minutes: 120,
  },
  {
    space: "Gabinete de recrutamento/metodologia",
    department: "Scouting e Recrutamento",
    activity: "recruitment",
    title: "Reunião de observadores",
    weekdays: [3],
    start: [17, 0],
    minutes: 120,
  },
  {
    space: "Gabinete da direção",
    department: "Gestão Administrativa",
    activity: "meeting",
    title: "Atendimento a encarregados de educação",
    weekdays: [2, 4],
    start: [18, 0],
    minutes: 120,
  },
];

/** One-off requests still "a confirmar", `inDays` after today, at times the slots leave free. */
const ROOM_REQUESTS: (Omit<RoomSlot, "weekdays"> & { inDays: number })[] = [
  {
    space: "Sala de reuniões 2",
    department: "Direção RSC",
    activity: "meeting",
    title: "Reunião com patrocinador",
    inDays: 1,
    start: [15, 0],
    minutes: 60,
  },
  {
    space: "Auditório",
    department: "Gestão Administrativa",
    activity: "meeting",
    title: "Sessão de esclarecimento: seguro desportivo",
    inDays: 3,
    start: [15, 0],
    minutes: 120,
  },
  {
    space: "Sala de reuniões 1",
    department: "Intervenção Social",
    activity: "meeting",
    title: "Reunião de intervenção social",
    inDays: 0,
    start: [15, 30],
    minutes: 60,
  },
];

const parseDate = (d: string): LocalDateTime => {
  const [year, month, day] = d.split("-").map(Number) as [number, number, number];
  return { year, month, day, hour: 0, minute: 0 };
};
const dateString = (t: LocalDateTime) =>
  `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
const at = (day: LocalDateTime, [hour, minute]: [number, number]) =>
  fromLisbon({ ...day, hour, minute });
const weekdayOf = (t: LocalDateTime) => new Date(Date.UTC(t.year, t.month - 1, t.day)).getUTCDay();
const plusDays = (d: string, n: number) => dateString(addLocalDays(parseDate(d), n));
const isHolidayBreak = (d: string) => d >= "2026-12-21" && d <= "2027-01-03";

function formatFor(groupName: string): MatchFormat {
  if (/Sub-7|Sub-9/.test(groupName)) return "fut4";
  if (/Sub-11|Sub-13/.test(groupName)) return "fut7";
  return "fut11";
}

export async function seedActivity(db: Db, today: string, random: Random): Promise<void> {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const [season] = await db.select().from(seasons).where(eq(seasons.isCurrent, true));
  const [home] = await db.select().from(venues).where(eq(venues.kind, "home"));
  if (!season || !home) throw new Error("seed the registry first");
  const fields = await db.select().from(spaces).where(eq(spaces.venueId, home.id));
  const field = (name: string) => {
    const found = fields.find((f) => f.name === name);
    if (!found) throw new Error(`space ${name} missing`);
    return found;
  };
  const depts = await db.select().from(departments);
  const deptId = (name: string) => depts.find((d) => d.name === name)?.id ?? depts[0]?.id ?? "";
  const method = deptId("Metodologia de Treino e Jogo");

  const teamRows = await db
    .select({ id: teams.id, name: teams.name, ageGroupId: teams.ageGroupId, group: ageGroups.name })
    .from(teams)
    .innerJoin(ageGroups, eq(ageGroups.id, teams.ageGroupId))
    .where(eq(teams.seasonId, season.id))
    .orderBy(asc(ageGroups.sortOrder), asc(teams.name));
  const roster = new Map<string, string[]>();
  for (const m of await db.select().from(teamMembers).orderBy(asc(teamMembers.shirtNumber))) {
    roster.set(m.teamId, [...(roster.get(m.teamId) ?? []), m.personId]);
  }
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(roleAssignments, eq(roleAssignments.userId, users.id))
    .where(eq(roleAssignments.role, "admin"))
    .limit(1);
  const coachUsers = await db
    .select({ userId: roleAssignments.userId, teamId: roleAssignments.teamId })
    .from(roleAssignments)
    .where(and(eq(roleAssignments.role, "coach"), isNotNull(roleAssignments.teamId)));
  const coachOf = (teamId: string) => coachUsers.find((c) => c.teamId === teamId)?.userId ?? null;
  const createdBy = admin?.id ?? null;

  // Trainings: two a week per team, from September to mid-June, as one series per slot.
  const seasonStart = "2026-09-07";
  const seasonEnd = "2027-06-13";
  const windowFrom = plusDays(today, -21);
  const windowTo = plusDays(today, 14);
  const trainingIds: { id: string; teamId: string; day: string }[] = [];
  const slots = trainingSlots(teamRows.length);
  for (const [t, team] of teamRows.entries()) {
    for (const { weekday, start, field: fieldName } of slots[t] ?? []) {
      const [series] = await db
        .insert(eventSeries)
        .values({ everyWeeks: 1, untilOn: seasonEnd })
        .returning();
      const rows: (typeof events.$inferInsert)[] = [];
      const bookingRows: (typeof bookings.$inferInsert)[] = [];
      for (
        let day = parseDate(seasonStart);
        dateString(day) <= seasonEnd;
        day = addLocalDays(day, 1)
      ) {
        const d = dateString(day);
        if (weekdayOf(day) !== weekday || isHolidayBreak(d)) continue;
        const startsAt = at(day, start);
        const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
        bookingRows.push({
          spaceId: field(fieldName).id,
          departmentId: method,
          teamId: team.id,
          activity: "training",
          status: d < today ? "done" : "confirmed",
          title: `Treino ${team.name}`,
          targetGroup: team.group,
          expectedAttendance: 20,
          startsAt,
          endsAt,
          createdBy,
        });
        rows.push({
          kind: "training",
          teamId: team.id,
          seriesId: series?.id ?? null,
          venueId: home.id,
          startsAt,
          endsAt,
          location: fieldName,
          createdBy,
        });
      }
      const booked = await db.insert(bookings).values(bookingRows).returning({ id: bookings.id });
      const inserted = await db
        .insert(events)
        .values(rows.map((r, i) => ({ ...r, bookingId: booked[i]?.id ?? null })))
        .returning({ id: events.id, startsAt: events.startsAt });
      for (const e of inserted) {
        const day = e.startsAt.toISOString().slice(0, 10);
        if (day >= windowFrom && day <= windowTo)
          trainingIds.push({ id: e.id, teamId: team.id, day });
      }
    }
  }

  // Matches: one per weekend per team, alternating home and away, Saturdays and Sundays.
  const matchIds: { id: string; teamId: string; day: string; homeAway: "home" | "away" }[] = [];
  const kickOffs: [number, number][] = [
    [9, 0],
    [10, 45],
    [12, 30],
    [15, 0],
    [17, 0],
  ];
  for (const [t, team] of teamRows.entries()) {
    let round = 0;
    for (
      let day = parseDate("2026-09-19");
      dateString(day) <= "2027-05-30";
      day = addLocalDays(day, 7)
    ) {
      const saturday = dateString(day);
      if (isHolidayBreak(saturday)) continue;
      round++;
      const homeAway = (round + t) % 2 === 0 ? "home" : "away";
      const matchDay = t % 2 === 0 ? day : addLocalDays(day, 1);
      const d = dateString(matchDay);
      const startsAt = at(matchDay, kickOffs[Math.floor(t / 2) % kickOffs.length] ?? [10, 0]);
      const endsAt = new Date(startsAt.getTime() + 105 * 60_000);
      let bookingId: string | null = null;
      if (homeAway === "home") {
        const [b] = await db
          .insert(bookings)
          .values({
            spaceId: field(t % 2 === 0 ? "Campo 1" : "Campo 2").id,
            departmentId: method,
            teamId: team.id,
            activity: "match",
            status: d < today ? "done" : "confirmed",
            title: `Jogo ${team.name}`,
            targetGroup: team.group,
            startsAt,
            endsAt,
            createdBy,
          })
          .returning({ id: bookings.id });
        bookingId = b?.id ?? null;
      }
      const opponent = OPPONENTS[(round * 5 + t * 3) % OPPONENTS.length] ?? "Adversário";
      const [event] = await db
        .insert(events)
        .values({
          kind: "match",
          teamId: team.id,
          bookingId,
          venueId: homeAway === "home" ? home.id : null,
          status: d < today ? "played" : "scheduled",
          startsAt,
          endsAt,
          location: homeAway === "home" ? null : `Campo do ${opponent}`,
          createdBy,
        })
        .returning({ id: events.id });
      if (!event) continue;
      await db.insert(eventMatches).values({
        eventId: event.id,
        matchType: round % 6 === 0 ? "cup" : "league",
        competition: round % 6 === 0 ? "Taça AF Lisboa" : `Campeonato Distrital ${team.group}`,
        round: `Jornada ${round}`,
        format: formatFor(team.group),
        opponent,
        homeAway,
        kit: homeAway === "home" ? "Principal (azul e amarelo)" : "Alternativo (branco)",
        transport: homeAway === "away" ? "Carrinha do clube às 8h00 no complexo" : null,
      });
      if (d >= windowFrom && d <= windowTo) {
        matchIds.push({ id: event.id, teamId: team.id, day: d, homeAway });
      }
    }
  }

  // A club event: parents' meeting in the auditorium next week.
  const meetingDay = addLocalDays(parseDate(today), 6);
  const meetingStart = at(meetingDay, [18, 30]);
  const meetingEnd = new Date(meetingStart.getTime() + 90 * 60_000);
  const [meeting] = await db
    .insert(bookings)
    .values({
      spaceId: field("Auditório").id,
      departmentId: deptId("Direção RSC"),
      activity: "meeting",
      status: "confirmed",
      title: "Reunião de pais e encarregados de educação",
      targetGroup: "Pais/EE",
      expectedAttendance: 60,
      startsAt: meetingStart,
      endsAt: meetingEnd,
      createdBy,
    })
    .returning({ id: bookings.id });
  await db.insert(events).values({
    kind: "club_event",
    bookingId: meeting?.id ?? null,
    venueId: home.id,
    title: "Reunião de pais e encarregados de educação",
    startsAt: meetingStart,
    endsAt: meetingEnd,
    location: "Auditório",
    createdBy,
  });

  // Training-sector events (setor de formação) with who they are for.
  const staffIds = await db.select({ id: users.id }).from(users).limit(3);
  const sectorEvents = [
    {
      kind: "meeting" as const,
      title: "Reunião de coordenação técnica",
      day: 2,
      hour: [19, 0] as [number, number],
    },
    {
      kind: "formation" as const,
      title: "Formação: métodos de treino sub-11",
      day: 4,
      hour: [18, 30] as [number, number],
    },
    {
      kind: "game_analysis" as const,
      title: "Análise de jogo: Jornada anterior",
      day: 5,
      hour: [21, 0] as [number, number],
    },
  ];
  for (const [i, ev] of sectorEvents.entries()) {
    const startsAt = at(addLocalDays(parseDate(today), ev.day), ev.hour);
    const [created] = await db
      .insert(events)
      .values({
        kind: ev.kind,
        title: ev.title,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 90 * 60_000),
        location: "Sala de reuniões",
        createdBy,
      })
      .returning({ id: events.id });
    if (!created) continue;
    await db
      .insert(eventInvitees)
      .values([
        { eventId: created.id, departmentId: i === 1 ? method : deptId("Direção RSC") },
        ...teamRows.slice(i, i + 2).map((team) => ({ eventId: created.id, teamId: team.id })),
        ...staffIds.slice(0, 2).map((u) => ({ eventId: created.id, userId: u.id })),
      ]);
  }

  // Rooms and gabinetes: weekly use for the season, plus a few open requests this week, so
  // the floor plan and calendar show more than the fields.
  const roomRows: (typeof bookings.$inferInsert)[] = [];
  for (let day = parseDate(seasonStart); dateString(day) <= seasonEnd; day = addLocalDays(day, 1)) {
    const d = dateString(day);
    if (isHolidayBreak(d)) continue;
    for (const slot of ROOM_SLOTS) {
      if (!slot.weekdays.includes(weekdayOf(day))) continue;
      const startsAt = at(day, slot.start);
      roomRows.push({
        spaceId: field(slot.space).id,
        departmentId: deptId(slot.department),
        activity: slot.activity,
        status: d < today ? "done" : "confirmed",
        title: slot.title,
        targetGroup: slot.targetGroup ?? null,
        startsAt,
        endsAt: new Date(startsAt.getTime() + slot.minutes * 60_000),
        createdBy,
      });
    }
  }
  for (const request of ROOM_REQUESTS) {
    const startsAt = at(addLocalDays(parseDate(today), request.inDays), request.start);
    roomRows.push({
      spaceId: field(request.space).id,
      departmentId: deptId(request.department),
      activity: request.activity,
      status: "to_confirm",
      title: request.title,
      startsAt,
      endsAt: new Date(startsAt.getTime() + request.minutes * 60_000),
      createdBy,
    });
  }
  await db.insert(bookings).values(roomRows);

  // Call-ups for matches near today, with answers; attendance for the past ones.
  const past = (day: string) => day < today;
  const participantRows: (typeof eventParticipants.$inferInsert)[] = [];
  for (const match of matchIds) {
    const coach = coachOf(match.teamId) ?? createdBy;
    for (const personId of roster.get(match.teamId) ?? []) {
      const roll = random();
      const rsvp: RsvpStatus = past(match.day)
        ? roll < 0.9
          ? "going"
          : "not_going"
        : roll < 0.6
          ? "going"
          : roll < 0.75
            ? "not_going"
            : "pending";
      participantRows.push({
        eventId: match.id,
        personId,
        calledUpBy: coach,
        rsvp,
        rsvpAt: rsvp === "pending" ? null : new Date(),
        rsvpNote:
          rsvp === "not_going" ? pick(["Doente", "Teste na escola", "Viagem de família"]) : null,
        attendance: past(match.day) ? (rsvp === "going" ? "present" : "excused") : null,
        attendanceMarkedAt: past(match.day) ? new Date() : null,
        attendanceBy: past(match.day) ? coach : null,
      });
    }
  }
  for (const training of trainingIds.filter((t) => past(t.day))) {
    const coach = coachOf(training.teamId) ?? createdBy;
    for (const personId of roster.get(training.teamId) ?? []) {
      const roll = random();
      participantRows.push({
        eventId: training.id,
        personId,
        calledUpBy: coach,
        rsvp: "going",
        attendance: roll < 0.85 ? "present" : roll < 0.93 ? "excused" : "absent",
        attendanceMarkedAt: new Date(),
        attendanceBy: coach,
      });
    }
  }
  if (participantRows.length > 0) await db.insert(eventParticipants).values(participantRows);

  // Transport for the next away match of each of the first three teams.
  for (const team of teamRows.slice(0, 3)) {
    const next = matchIds.find(
      (m) => m.teamId === team.id && !past(m.day) && m.homeAway === "away",
    );
    if (!next) continue;
    const [van] = await db
      .insert(transportRides)
      .values({
        eventId: next.id,
        kind: "club_van",
        label: "Carrinha 1",
        seats: 8,
        pickupPoint: "Complexo desportivo",
        pickupAt: new Date(at(parseDate(next.day), [8, 0])),
        createdBy: coachOf(team.id),
      })
      .returning({ id: transportRides.id });
    if (!van) continue;
    const players = (roster.get(team.id) ?? []).slice(0, 5);
    if (players.length > 0) {
      await db
        .insert(transportPassengers)
        .values(players.map((personId) => ({ rideId: van.id, eventId: next.id, personId })));
    }
  }

  await seedFees(db, today, random, season.id);
  await seedEquipment(db, teamRows, roster, createdBy);
  await seedIncidentsAndHealth(db, today, teamRows, roster, coachOf);
  await seedScouting(db, today, createdBy);
  await seedAnnouncements(db, today, teamRows, coachOf, createdBy);
}

async function seedFees(db: Db, today: string, random: Random, seasonId: string) {
  const groups = await db.select().from(ageGroups).where(eq(ageGroups.seasonId, seasonId));
  const members = await db
    .select({ personId: teamMembers.personId, ageGroupId: teams.ageGroupId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId));
  const monthly = new Map<string, { id: string; amount: number }>();
  for (const group of groups) {
    const amount = group.birthYearFrom >= 2016 ? 3750 : group.birthYearFrom >= 2012 ? 4250 : 5500;
    const [plan] = await db
      .insert(feePlans)
      .values({
        seasonId,
        ageGroupId: group.id,
        name: `Mensalidade ${group.name}`,
        kind: "monthly",
        amountCents: amount,
      })
      .returning();
    if (plan) monthly.set(group.id, { id: plan.id, amount });
  }
  const [registration] = await db
    .insert(feePlans)
    .values({ seasonId, name: "Inscrição 2026/27", kind: "registration", amountCents: 6000 })
    .returning();
  const [dues] = await db
    .insert(feePlans)
    .values({ seasonId, name: "Quota de sócio 2026/27", kind: "dues", amountCents: 3000 })
    .returning();

  const months = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];
  const monthName: Record<string, string> = {
    "2026-09": "setembro",
    "2026-10": "outubro",
    "2026-11": "novembro",
    "2026-12": "dezembro",
    "2027-01": "janeiro",
  };
  const chargeRows: (typeof charges.$inferInsert)[] = [];
  for (const m of members) {
    const plan = m.ageGroupId ? monthly.get(m.ageGroupId) : undefined;
    if (registration) {
      chargeRows.push({
        personId: m.personId,
        planId: registration.id,
        kind: "registration",
        description: registration.name,
        amountCents: registration.amountCents,
        dueDate: "2026-09-15",
      });
    }
    if (!plan) continue;
    for (const month of months) {
      chargeRows.push({
        personId: m.personId,
        planId: plan.id,
        kind: "monthly",
        description: `Mensalidade de ${monthName[month]}`,
        amountCents: plan.amount,
        discountCents: random() < 0.1 ? Math.round(plan.amount * 0.25) : 0,
        dueDate: `${month}-08`,
      });
    }
  }
  const memberRows = await db.select({ personId: memberships.personId }).from(memberships);
  for (const member of memberRows) {
    if (!dues) break;
    chargeRows.push({
      personId: member.personId,
      planId: dues.id,
      kind: "dues",
      description: dues.name,
      amountCents: dues.amountCents,
      dueDate: "2026-10-31",
    });
  }
  const inserted = await db.insert(charges).values(chargeRows).returning();
  const paymentRows: (typeof payments.$inferInsert)[] = [];
  for (const charge of inserted) {
    if (charge.dueDate > today) continue;
    // Most families pay on time; older charges are more likely to be settled.
    const paidChance = charge.dueDate < plusDays(today, -40) ? 0.95 : 0.75;
    if (random() > paidChance) continue;
    paymentRows.push({
      chargeId: charge.id,
      amountCents: charge.amountCents - charge.discountCents,
      method: random() < 0.5 ? "mbway" : random() < 0.7 ? "multibanco" : "cash",
      paidOn: plusDays(charge.dueDate, -Math.floor(random() * 6)),
    });
  }
  if (paymentRows.length > 0) await db.insert(payments).values(paymentRows);
}

async function seedEquipment(
  db: Db,
  teamRows: { id: string; name: string }[],
  roster: Map<string, string[]>,
  createdBy: string | null,
) {
  const sizes = ["8", "10", "12", "14", "S", "M", "L"];
  const items = await db
    .insert(equipmentItems)
    .values([
      { name: "Bola de futebol nº 4", category: "ball", priceCents: 2500, minStock: 10 },
      { name: "Bola de futebol nº 5", category: "ball", priceCents: 2800, minStock: 10 },
      { name: "Coletes de treino", category: "bib", minStock: 20 },
      { name: "Cones de sinalização (pack 20)", category: "training", minStock: 4 },
      ...sizes.map((size) => ({
        name: "Equipamento de jogo (azul e amarelo)",
        category: "kit" as const,
        size,
        priceCents: 4500,
        minStock: 5,
      })),
      ...sizes.map((size) => ({
        name: "Fato de treino RSC",
        category: "kit" as const,
        size,
        priceCents: 3500,
        minStock: 4,
      })),
      { name: "Mochila RSC", category: "other", priceCents: 1800, minStock: 5 },
    ])
    .returning();
  const stock: Record<string, number> = {
    "Bola de futebol nº 4": 30,
    "Bola de futebol nº 5": 25,
    "Coletes de treino": 60,
    "Cones de sinalização (pack 20)": 12,
    "Mochila RSC": 4,
  };
  await db.insert(stockMovements).values(
    items.map((item) => ({
      itemId: item.id,
      kind: "receipt" as const,
      // A couple of kit sizes are deliberately low so the low-stock widget has something.
      delta: stock[item.name] ?? (item.size === "L" || item.size === "8" ? 3 : 12),
      note: "Stock inicial da época",
      createdBy,
    })),
  );
  const item = (name: string, size: string | null = null) =>
    items.find((i) => i.name === name && i.size === size);

  // Balls and bibs on loan to the first teams; a few kit sales to athletes.
  for (const team of teamRows.slice(0, 4)) {
    for (const [name, quantity] of [
      ["Bola de futebol nº 4", 6],
      ["Coletes de treino", 10],
    ] as const) {
      const it = item(name);
      if (!it) continue;
      const [loan] = await db
        .insert(equipmentLoans)
        .values({ itemId: it.id, quantity, teamId: team.id, dueDate: "2027-06-30", createdBy })
        .returning();
      if (loan) {
        await db.insert(stockMovements).values({
          itemId: it.id,
          kind: "loan",
          delta: -quantity,
          loanId: loan.id,
          createdBy,
        });
      }
    }
  }
  const buyers = [...roster.values()].flat().slice(0, 6);
  for (const [i, personId] of buyers.entries()) {
    const it = item("Fato de treino RSC", sizes[i % sizes.length] ?? "M");
    if (!it) continue;
    await db.insert(stockMovements).values({
      itemId: it.id,
      kind: "sale",
      delta: -1,
      personId,
      unitPriceCents: it.priceCents,
      note: "Venda no economato",
      createdBy,
    });
  }
}

async function seedIncidentsAndHealth(
  db: Db,
  today: string,
  teamRows: { id: string; name: string }[],
  roster: Map<string, string[]>,
  coachOf: (teamId: string) => string | null,
) {
  const [first, second, third] = teamRows;
  if (!first || !second || !third) return;
  const players = (teamId: string) => roster.get(teamId) ?? [];
  const day = (n: number, time: [number, number]) => at(parseDate(plusDays(today, n)), time);
  const rows = [
    {
      team: first,
      type: "injury" as const,
      status: "in_progress" as const,
      occurredAt: day(-3, [18, 40]),
      place: "Campo 1",
      description: "Queda durante o treino, queixa-se do tornozelo direito. Gelo aplicado.",
      followUp: "Encaminhado para a fisioterapia.",
      people: [[players(first.id)[2], "injured"]] as const,
    },
    {
      team: second,
      type: "damage" as const,
      status: "open" as const,
      occurredAt: day(-1, [19, 50]),
      place: "Balneário 2",
      description: "Porta do cacifo 14 partida. Necessita de reparação.",
      followUp: null,
      people: [] as const,
    },
    {
      team: third,
      type: "match" as const,
      status: "closed" as const,
      occurredAt: day(-9, [11, 30]),
      place: "Campo do adversário",
      description: "Discussão entre pais na bancada; resolvida pelo delegado.",
      followUp: "Comunicado enviado aos encarregados de educação.",
      people: [] as const,
    },
    {
      team: first,
      type: "discipline" as const,
      status: "closed" as const,
      occurredAt: day(-16, [18, 15]),
      place: "Campo 3",
      description: "Atraso repetido aos treinos sem justificação.",
      followUp: "Conversa com o atleta e o encarregado de educação.",
      people: [[players(first.id)[5], "involved"]] as const,
    },
  ];
  for (const row of rows) {
    const [incident] = await db
      .insert(incidents)
      .values({
        type: row.type,
        status: row.status,
        occurredAt: row.occurredAt,
        place: row.place,
        teamId: row.team.id,
        description: row.description,
        followUp: row.followUp,
        reportedBy: coachOf(row.team.id),
      })
      .returning();
    const involved = row.people.filter(
      (p): p is readonly [string, "injured" | "involved"] => !!p[0],
    );
    if (incident && involved.length > 0) {
      await db
        .insert(incidentPeople)
        .values(involved.map(([personId, role]) => ({ incidentId: incident.id, personId, role })));
    }
  }

  // Two injured athletes (fake clinical data, readable only by clinical roles).
  const injured = [
    {
      personId: players(first.id)[2],
      bodyPart: "Tornozelo direito",
      status: "active" as const,
      availability: "unavailable" as const,
      started: -3,
      back: 10,
    },
    {
      personId: players(second.id)[4],
      bodyPart: "Coxa esquerda",
      status: "return_to_play" as const,
      availability: "limited" as const,
      started: -14,
      back: 4,
    },
  ];
  for (const injury of injured) {
    if (!injury.personId) continue;
    const [guardian] = await db
      .select({ id: guardianships.guardianId })
      .from(guardianships)
      .where(eq(guardianships.childId, injury.personId))
      .limit(1);
    await db.insert(healthConsents).values({
      personId: injury.personId,
      grantedOn: "2026-09-01",
      grantedByPersonId: guardian?.id ?? null,
    });
    await db.insert(injuries).values({
      personId: injury.personId,
      discipline: "physio",
      bodyPart: injury.bodyPart,
      description: "Entorse ligeira. Plano de recuperação de duas semanas.",
      startedOn: plusDays(today, injury.started),
      status: injury.status,
      availability: injury.availability,
      expectedReturnOn: plusDays(today, injury.back),
    });
  }
}

/** Fake NIF with a valid check digit from an 8-digit stem (demo data only). */
function demoNif(stem: string): string {
  const sum = [...stem].reduce((acc, d, i) => acc + Number(d) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return `${stem}${check >= 10 ? 0 : check}`;
}

/** Base attribute levels (1-10) per archetype, to give each demo prospect a distinct profile. */
const DEMO_PROFILES: Record<string, Scores> = {
  deepPlaymaker: {
    passing: 8,
    vision: 8,
    composure: 7,
    positioning: 7,
    firstTouch: 7,
    stamina: 6,
    pace: 5,
    duels: 5,
    strength: 4,
    dribbling: 6,
    finishing: 4,
    movement: 6,
    pressing: 5,
    agility: 6,
    workRate: 7,
    coachability: 8,
  },
  poacher: {
    finishing: 9,
    movement: 8,
    composure: 8,
    positioning: 8,
    pace: 7,
    firstTouch: 7,
    dribbling: 6,
    passing: 5,
    vision: 5,
    duels: 5,
    strength: 5,
    stamina: 6,
    pressing: 4,
    agility: 7,
    workRate: 6,
    coachability: 6,
  },
  shotStopper: {
    gkReflexes: 9,
    gkHandling: 8,
    gkOneOnOne: 8,
    gkAerial: 6,
    gkDistribution: 5,
    positioning: 7,
    strength: 5,
    agility: 8,
    composure: 7,
    workRate: 7,
    coachability: 8,
  },
  stopper: {
    duels: 8,
    strength: 8,
    pressing: 7,
    positioning: 7,
    pace: 5,
    passing: 5,
    vision: 5,
    composure: 6,
    firstTouch: 5,
    dribbling: 4,
    finishing: 3,
    movement: 5,
    stamina: 7,
    agility: 5,
    workRate: 8,
    coachability: 7,
  },
  speedWinger: {
    pace: 9,
    dribbling: 8,
    agility: 9,
    stamina: 7,
    finishing: 6,
    passing: 6,
    vision: 6,
    firstTouch: 7,
    movement: 7,
    duels: 4,
    strength: 4,
    pressing: 5,
    positioning: 5,
    composure: 5,
    workRate: 7,
    coachability: 7,
  },
  boxToBox: {
    stamina: 9,
    pressing: 8,
    strength: 7,
    movement: 7,
    duels: 7,
    passing: 6,
    vision: 6,
    firstTouch: 6,
    dribbling: 5,
    finishing: 5,
    pace: 6,
    positioning: 6,
    agility: 6,
    composure: 6,
    workRate: 9,
    coachability: 7,
  },
  attackingFullBack: {
    pace: 8,
    stamina: 8,
    dribbling: 7,
    passing: 7,
    duels: 5,
    strength: 5,
    positioning: 5,
    vision: 6,
    firstTouch: 6,
    finishing: 5,
    movement: 7,
    pressing: 6,
    agility: 7,
    composure: 6,
    workRate: 8,
    coachability: 8,
  },
};

/** Zone intensities (6x3) typical of a position group, as the scout would mark them. */
const DEMO_HEAT: Record<string, number[]> = {
  gk: [3, 1, 0, 0, 0, 0, 3, 1, 0, 0, 0, 0, 3, 1, 0, 0, 0, 0],
  cb: [1, 3, 2, 1, 0, 0, 2, 3, 2, 1, 0, 0, 1, 2, 1, 0, 0, 0],
  mid: [0, 1, 2, 3, 2, 0, 1, 2, 3, 3, 2, 1, 0, 1, 2, 3, 2, 0],
  wing: [0, 0, 1, 2, 3, 2, 0, 0, 1, 2, 2, 1, 0, 0, 0, 1, 1, 0],
  fwd: [0, 0, 0, 1, 2, 3, 0, 0, 1, 2, 3, 3, 0, 0, 0, 1, 2, 2],
};

async function seedScouting(db: Db, today: string, createdBy: string | null) {
  const list = [
    {
      fullName: "Rafael Antunes Lopes",
      birthYear: 2013,
      currentClub: "GD Tires",
      positions: ["mc", "mdc"],
      profile: "deepPlaymaker",
      group: "mid",
      status: "trial" as const,
      escalao: "sub13" as const,
    },
    {
      fullName: "Lara Monteiro Dias",
      birthYear: 2012,
      currentClub: "AD Oeiras",
      positions: ["pl", "sa"],
      profile: "poacher",
      group: "fwd",
      status: "shortlisted" as const,
      escalao: "sub15" as const,
      nif: demoNif("99999001"),
    },
    {
      fullName: "Vasco Teixeira Reis",
      birthYear: 2011,
      currentClub: "Belas FC",
      positions: ["gr"],
      profile: "shotStopper",
      group: "gk",
      status: "observed" as const,
      escalao: "sub15" as const,
    },
    {
      fullName: "Henrique Matos Cruz",
      birthYear: 2014,
      currentClub: "CD Cacém",
      positions: ["dc"],
      profile: "stopper",
      group: "cb",
      status: "observed" as const,
      escalao: "sub11" as const,
    },
    {
      fullName: "Inês Carvalho Neves",
      birthYear: 2012,
      currentClub: "Sporting CP",
      positions: ["ed", "ee"],
      profile: "speedWinger",
      group: "wing",
      status: "invited" as const,
      escalao: "sub15" as const,
    },
    {
      fullName: "Tomás Pinto Garcia",
      birthYear: 2013,
      currentClub: "Escola Básica de Massamá",
      positions: ["mc", "mo"],
      profile: "boxToBox",
      group: "mid",
      status: "identified" as const,
      escalao: "sub13" as const,
    },
    {
      fullName: "Duarte Faria Silva",
      birthYear: 2011,
      currentClub: "AD Sintra",
      positions: ["dd", "de"],
      profile: "attackingFullBack",
      group: "fb",
      status: "observed" as const,
      escalao: "sub15" as const,
    },
  ];
  // A request that came in through the public trial request form, waiting for follow-up.
  await db.insert(prospects).values({
    fullName: "Tomás Pereira Gouveia (pedido)",
    birthDate: "2014-03-12",
    birthYear: 2014,
    currentClub: "CD Massamá",
    targetEscalao: "sub13",
    context: "federated_club",
    positions: ["mc", "mo"],
    guardianName: "Encarregado Demo",
    guardianPhone: "910000000",
    guardianRelation: "parent",
    motive: "Quer jogar mais perto de casa.",
    preferredDate: plusDays(today, 10),
    clubAuthorisationNeeded: true,
    source: "request",
    consentAt: new Date(),
    retainUntil: plusDays(today, 365),
  });
  // Fake club members the demo prospects can be linked to: one by NIF, one by a similar name.
  await db.insert(persons).values([
    { fullName: "Lara Dias Monteiro", nif: demoNif("99999001") },
    { fullName: "Rafael Lopes", birthDate: "2013-04-02" },
  ]);
  const jitter = (base: number, i: number, k: number) =>
    Math.max(1, Math.min(10, base + ((i * 7 + k * 3) % 3) - 1));
  for (const p of list) {
    const [prospect] = await db
      .insert(prospects)
      .values({
        fullName: p.fullName,
        birthYear: p.birthYear,
        currentClub: p.currentClub,
        position: p.positions[0],
        positions: p.positions,
        targetEscalao: p.escalao,
        status: p.status,
        nif: p.nif ?? null,
        retainUntil: plusDays(today, 365),
        createdBy,
      })
      .returning();
    if (!prospect || p.status === "identified") continue;
    const base = DEMO_PROFILES[p.profile] ?? {};
    for (const [i, daysAgo] of [34, 19, 6].entries()) {
      const scores = Object.fromEntries(
        Object.entries(base).map(([k, v], n) => [k, jitter(v, i, n)]),
      ) as Scores;
      await db.insert(prospectReports).values({
        prospectId: prospect.id,
        observedOn: plusDays(today, -daysAgo),
        rating: Math.max(
          1,
          Math.min(5, Math.round((overallScore(scores, p.group as PositionGroup) ?? 6) / 2)),
        ),
        text: "Boa leitura de jogo e técnica acima da média para o escalão. Rever em jogo oficial.",
        scores,
        positionPlayed: p.positions[0],
        heat: i === 2 ? null : (DEMO_HEAT[p.group] ?? null),
        // The latest report is an observation training, the earlier ones league matches.
        kind: i === 2 ? "observation_training" : "match",
        recommendation: i === 2 ? "train" : "follow",
        details: {
          framing: "official",
          orgType: "club",
          orgName: p.currentClub,
          source: "direct",
          setting: i === 2 ? "training" : "district_match",
          submitterRole: "scouting",
          relativeHeight: 3,
          differentiation: 4,
          goalIndex: i,
        },
        authorId: createdBy,
      });
    }
  }
}

async function seedAnnouncements(
  db: Db,
  today: string,
  teamRows: { id: string; name: string }[],
  coachOf: (teamId: string) => string | null,
  createdBy: string | null,
) {
  const allUsers = await db.select({ id: users.id }).from(users);
  const daysAgo = (n: number) => at(parseDate(plusDays(today, -n)), [10, 0]);
  const club = [
    {
      title: "Bem-vindos à época 2026/27",
      body: "A direção deseja a todos os atletas, famílias e staff uma excelente época. Força Real!",
      createdAt: daysAgo(30),
    },
    {
      title: "Reunião de pais na próxima semana",
      body: "Convidamos todos os encarregados de educação para a reunião no auditório do complexo, às 18h30.",
      createdAt: daysAgo(2),
    },
    {
      title: "Novos equipamentos no economato",
      body: "Já estão disponíveis os novos fatos de treino. Passe pelo economato ou fale com o delegado da sua equipa.",
      createdAt: daysAgo(6),
    },
  ];
  for (const a of club) {
    const [row] = await db
      .insert(announcements)
      .values({ ...a, createdBy, updatedAt: a.createdAt })
      .returning();
    if (!row) continue;
    await db.insert(notifications).values(
      allUsers.map((u, i) => ({
        userId: u.id,
        kind: "announcement" as const,
        title: a.title,
        body: a.body,
        announcementId: row.id,
        createdAt: a.createdAt,
        // Older news already read; the newest unread so the badge shows.
        readAt: a.createdAt < daysAgo(5) && i % 2 === 0 ? a.createdAt : null,
      })),
    );
  }
  const team = teamRows[0];
  if (!team) return;
  const author = coachOf(team.id) ?? createdBy;
  const [teamNote] = await db
    .insert(announcements)
    .values({
      teamId: team.id,
      title: `${team.name}: treino de sábado`,
      body: "Sábado há treino extra às 10h00 no Campo 1. Tragam o equipamento alternativo.",
      createdBy: author,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    })
    .returning();
  const coachUserIds = (
    await db
      .select({ userId: roleAssignments.userId })
      .from(roleAssignments)
      .where(inArray(roleAssignments.teamId, [team.id]))
  ).map((r) => r.userId);
  const parentIds = (
    await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(guardianships, eq(guardianships.guardianId, users.personId))
      .innerJoin(teamMembers, eq(teamMembers.personId, guardianships.childId))
      .where(eq(teamMembers.teamId, team.id))
  ).map((r) => r.id);
  const recipients = [...new Set([...coachUserIds, ...parentIds])];
  if (teamNote && recipients.length > 0) {
    await db.insert(notifications).values(
      recipients.map((userId) => ({
        userId,
        kind: "announcement" as const,
        title: teamNote.title,
        body: teamNote.body,
        announcementId: teamNote.id,
        createdAt: daysAgo(1),
      })),
    );
  }
}
