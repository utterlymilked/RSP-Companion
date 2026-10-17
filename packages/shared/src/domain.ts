/**
 * Fixed value sets of the core data model (M1). The server builds its Postgres enums from
 * these arrays, so client and server always agree. Adding a value needs a migration;
 * removing one needs a data migration first (see .claude/skills/db-migration).
 */

/** Legal or organisational entities that share people and spaces with the club. */
export const ORGANISATION_KINDS = [
  "club", // Real Sport Clube Massamá itself
  "sad", // Real SC SAD (professional senior side)
  "football_school", // Escola de Futebol
  "partner", // e.g. GP Sport Academy
  "external", // renters and other outside parties
] as const;
export type OrganisationKind = (typeof ORGANISATION_KINDS)[number];

/** Sex as used by federation competitions (feminino / masculino). */
export const SEXES = ["female", "male"] as const;
export type Sex = (typeof SEXES)[number];

/** Competition category of an age group or team: feminino, masculino or misto. */
export const CATEGORIES = ["female", "male", "mixed"] as const;
export type Category = (typeof CATEGORIES)[number];

export const GUARDIAN_RELATIONSHIPS = [
  "mother",
  "father",
  "legal_guardian",
  "grandparent",
  "sibling",
  "other",
] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

/** Club membership (sócio) status. */
export const MEMBERSHIP_STATUSES = ["active", "suspended", "ended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * What a person does for the club in a season. Descriptive (who coaches which team, who
 * works in which gabinete); access rights come from roles, added in M2.
 */
export const STAFF_FUNCTIONS = [
  "director",
  "coordinator",
  "head_coach",
  "assistant_coach",
  "goalkeeper_coach",
  "fitness_coach",
  "team_manager",
  "analyst",
  "scout",
  "recruiter",
  "doctor",
  "nurse",
  "physio",
  "nutritionist",
  "psychologist",
  "sociologist",
  "stores",
  "administrative",
  "other",
] as const;
export type StaffFunction = (typeof STAFF_FUNCTIONS)[number];

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Where a space is: the club's home complex or an external ground (away venues list). */
export const VENUE_KINDS = ["home", "external"] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

/** What a bookable space is. A field can be combined from parts (campo 2+3). */
export const SPACE_KINDS = [
  "field",
  "auditorium",
  "meeting_room",
  "gym",
  "office",
  "other",
] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

/** What a booking is for (atividade in the club's sheet). */
export const BOOKING_ACTIVITIES = [
  "training",
  "match",
  "formation", // formação
  "game_analysis", // análise de jogo
  "meeting", // reunião (EE/jogadores, direção, staff)
  "recruitment",
  "rental", // aluguer
  "other",
] as const;
export type BookingActivity = (typeof BOOKING_ACTIVITIES)[number];

/** The club's status workflow for a booking (estado in the sheet). */
export const BOOKING_STATUSES = [
  "to_confirm", // a confirmar
  "confirmed", // confirmado
  "not_confirmed", // não confirmado
  "voided", // anulado
  "done", // realizado
  "to_schedule", // agendar
  "to_reschedule", // reagendar
  "postponed", // adiada
  "rescheduled", // reagendado
  "cancelled", // cancelado
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that occupy their space: only these take part in conflict detection. */
export const BLOCKING_BOOKING_STATUSES = [
  "to_confirm",
  "confirmed",
  "done",
] as const satisfies readonly BookingStatus[];

export function isBlockingStatus(status: BookingStatus): boolean {
  return (BLOCKING_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
}

/** What an ocorrência is about (M7). Injury reports are restricted, see `incidents.read_injury`. */
export const INCIDENT_TYPES = [
  "injury", // lesão
  "discipline", // disciplinar
  "damage", // danos em instalações ou material
  "match", // incidente de jogo
  "other",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

/** Follow-up of an incident: open → in progress → closed. */
export const INCIDENT_STATUSES = ["open", "in_progress", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** How a person took part in an incident. */
export const INCIDENT_PERSON_ROLES = ["involved", "injured", "witness"] as const;
export type IncidentPersonRole = (typeof INCIDENT_PERSON_ROLES)[number];

/** What an economato item is (M8). */
export const EQUIPMENT_CATEGORIES = ["ball", "bib", "kit", "training", "other"] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

/**
 * Why an item's stock changed. Receipts add; losses and sales remove; adjustments (stock
 * counts) add or remove; loans and returns are created through the loan endpoints.
 */
export const STOCK_MOVEMENT_KINDS = [
  "receipt",
  "adjustment",
  "loss",
  "sale",
  "loan",
  "return",
] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

/** Where a scouting prospect stands in the recruitment pipeline (M9). */
export const PROSPECT_STATUSES = [
  "identified",
  "observed",
  "shortlisted",
  "invited",
  "trial",
  "offered",
  "signed",
  "declined",
  "discarded",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

/** What an entry of the club calendar is (M10). */
export const EVENT_KINDS = ["training", "match", "club_event"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_STATUSES = ["scheduled", "postponed", "cancelled", "played"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Jogo treino, campeonato (FPF) or taça. */
export const MATCH_TYPES = ["friendly", "league", "cup"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

/** Football format of a match (fut 3, 4+GR, 7, 11). */
export const MATCH_FORMATS = ["fut3", "fut4", "fut7", "fut11"] as const;
export type MatchFormat = (typeof MATCH_FORMATS)[number];

export const HOME_AWAY = ["home", "away"] as const;
export type HomeAway = (typeof HOME_AWAY)[number];

/** An athlete's (or guardian's) answer to a call-up. */
export const RSVP_STATUSES = ["pending", "going", "not_going"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

/** What the coach recorded at the session: present, absent, or absent with a valid reason. */
export const ATTENDANCE_STATUSES = ["present", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** What a fee plan or charge is for (M12). */
export const FEE_KINDS = ["dues", "monthly", "registration", "kit", "other"] as const;
export type FeeKind = (typeof FEE_KINDS)[number];

/** How a payment reached the club. Multibanco and MB WAY references arrive with M12b. */
export const PAYMENT_METHODS = ["cash", "bank_transfer", "multibanco", "mbway", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Derived state of a charge: from its payments, due date and cancellation. */
export const CHARGE_STATUSES = ["open", "overdue", "paid", "cancelled"] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

/** Where an injury stands: being treated, back in limited training, or cleared (M13). */
export const INJURY_STATUSES = ["active", "return_to_play", "cleared"] as const;
export type InjuryStatus = (typeof INJURY_STATUSES)[number];

/** What an injury allows meanwhile: no activity, or limited activity. */
export const INJURY_AVAILABILITIES = ["unavailable", "limited"] as const;
export type InjuryAvailability = (typeof INJURY_AVAILABILITIES)[number];

/** The only thing coaches see about health: derived from open injuries, never the diagnosis. */
export const AVAILABILITY_STATUSES = ["available", "limited", "unavailable"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/**
 * Kinds of document kept for a person (M14). `medical_exam` is the sports medical certificate:
 * its file is health-tier and only the medical roles open it; the others see just the kind and
 * the expiry date.
 */
export const DOCUMENT_KINDS = [
  "medical_exam",
  "federation_registration",
  "id_document",
  "other",
  "photo", // foto
  "coaching_licence", // título profissional de treinador (TPTD)
  "professional_card", // cédula profissional
  "training_diploma", // diplomas de formação
  "first_aid_certificate", // SBV / DAE
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Where a player plays (posição). Sporting data, general tier. */
export const PLAYER_POSITIONS = ["goalkeeper", "defender", "midfielder", "forward"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

/** Stronger foot (pé preferencial). */
export const DOMINANT_FEET = ["left", "right", "both"] as const;
export type DominantFoot = (typeof DOMINANT_FEET)[number];
