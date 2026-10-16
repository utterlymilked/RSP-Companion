import {
  addLocalDays,
  fromLisbon,
  type LocalDateTime,
  type MatchFormat,
  type RsvpStatus,
} from "@rsc/shared";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { roleAssignments, users } from "../modules/auth/schema.js";
import { bookings, spaces, venues } from "../modules/bookings/schema.js";
import { eventParticipants } from "../modules/callups/schema.js";
import { equipmentItems, equipmentLoans, stockMovements } from "../modules/equipment/schema.js";
import { eventMatches, eventSeries, events } from "../modules/events/schema.js";
import { charges, feePlans, payments } from "../modules/fees/schema.js";
import { healthConsents, injuries } from "../modules/health/schema.js";
import { incidentPeople, incidents } from "../modules/incidents/schema.js";
import { announcements, notifications } from "../modules/notifications/schema.js";
import { departments } from "../modules/organisations/schema.js";
import { guardianships, memberships } from "../modules/people/schema.js";
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
            spaceId: field(t % 2 === 0 ? "Campo 1" : "Campo 2+3").id,
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

async function seedScouting(db: Db, today: string, createdBy: string | null) {
  const list = [
    {
      fullName: "Rafael Antunes Lopes",
      birthYear: 2013,
      currentClub: "GD Tires",
      position: "Médio",
      status: "trial" as const,
      rating: 4,
    },
    {
      fullName: "Lara Monteiro Dias",
      birthYear: 2012,
      currentClub: "AD Oeiras",
      position: "Avançada",
      status: "shortlisted" as const,
      rating: 5,
    },
    {
      fullName: "Vasco Teixeira Reis",
      birthYear: 2011,
      currentClub: "Belas FC",
      position: "Guarda-redes",
      status: "observed" as const,
      rating: 3,
    },
    {
      fullName: "Henrique Matos Cruz",
      birthYear: 2014,
      currentClub: "CD Cacém",
      position: "Defesa central",
      status: "identified" as const,
      rating: 3,
    },
  ];
  for (const p of list) {
    const [prospect] = await db
      .insert(prospects)
      .values({
        fullName: p.fullName,
        birthYear: p.birthYear,
        currentClub: p.currentClub,
        position: p.position,
        status: p.status,
        retainUntil: plusDays(today, 365),
        createdBy,
      })
      .returning();
    if (!prospect || p.status === "identified") continue;
    await db.insert(prospectReports).values({
      prospectId: prospect.id,
      observedOn: plusDays(today, -12),
      rating: p.rating,
      text: "Boa leitura de jogo e técnica acima da média para o escalão. Rever em jogo oficial.",
      authorId: createdBy,
    });
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
        link: `/announcement/${row.id}`,
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
        link: `/announcement/${teamNote.id}`,
        announcementId: teamNote.id,
        createdAt: daysAgo(1),
      })),
    );
  }
}
