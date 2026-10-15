/**
 * Every table of the app. drizzle-kit reads this file to generate migrations, and
 * createDb() passes it to Drizzle for the relational query API. New module schemas must be
 * re-exported here.
 */
export * from "../modules/organisations/schema.js";
export * from "../modules/people/schema.js";
export * from "../modules/seasons/schema.js";
export * from "../modules/teams/schema.js";
export * from "./relations.js";
