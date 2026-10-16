/**
 * Every table of the app. drizzle-kit reads this file to generate migrations, and
 * createDb() passes it to Drizzle for the relational query API. New module schemas must be
 * re-exported here.
 */
export * from "../modules/audit/schema.js";
export * from "../modules/auth/schema.js";
export * from "../modules/bookings/schema.js";
export * from "../modules/callups/schema.js";
export * from "../modules/documents/schema.js";
export * from "../modules/equipment/schema.js";
export * from "../modules/evaluations/schema.js";
export * from "../modules/events/schema.js";
export * from "../modules/fees/schema.js";
export * from "../modules/health/schema.js";
export * from "../modules/incidents/schema.js";
export * from "../modules/notifications/schema.js";
export * from "../modules/organisations/schema.js";
export * from "../modules/people/schema.js";
export * from "../modules/scouting/schema.js";
export * from "../modules/seasons/schema.js";
export * from "../modules/teams/schema.js";
export * from "../modules/transport/schema.js";
export * from "./relations.js";
