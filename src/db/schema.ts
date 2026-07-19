import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
};

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  ...timestamps,
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_id_idx").on(table.userId)]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
}, (table) => [index("account_user_id_idx").on(table.userId)]);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color", { enum: ["cyan", "magenta", "amber", "green"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [
  uniqueIndex("profiles_household_name_unique").on(table.householdId, table.name),
  uniqueIndex("profiles_household_color_unique").on(table.householdId, table.color),
  index("profiles_household_idx").on(table.householdId),
]);

export const palateProfiles = sqliteTable("palate_profiles", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull().unique().references(() => profiles.id, { onDelete: "cascade" }),
  quizAnswers: text("quiz_answers", { mode: "json" }).$type<Record<string, unknown>>(),
  sweetness: integer("sweetness"),
  acidity: integer("acidity"),
  tannin: integer("tannin"),
  body: integer("body"),
  oak: integer("oak"),
  adventurousness: integer("adventurousness"),
  notes: text("notes").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [
  check("palate_sweetness_range", sql`${table.sweetness} is null or ${table.sweetness} between 1 and 5`),
  check("palate_acidity_range", sql`${table.acidity} is null or ${table.acidity} between 1 and 5`),
  check("palate_tannin_range", sql`${table.tannin} is null or ${table.tannin} between 1 and 5`),
  check("palate_body_range", sql`${table.body} is null or ${table.body} between 1 and 5`),
  check("palate_oak_range", sql`${table.oak} is null or ${table.oak} between 1 and 5`),
  check("palate_adventurousness_range", sql`${table.adventurousness} is null or ${table.adventurousness} between 1 and 5`),
]);

export const wines = sqliteTable("wines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  producer: text("producer"),
  vintage: integer("vintage"),
  grapes: text("grapes", { mode: "json" }).notNull().$type<string[]>(),
  region: text("region"),
  country: text("country"),
  style: text("style", { enum: ["red", "white", "rose", "sparkling", "dessert", "fortified", "orange"] }).notNull(),
  priceBand: text("price_band", { enum: ["under_15", "15_30", "30_60", "over_60"] }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [uniqueIndex("wines_identity_unique").on(table.name, table.producer, table.vintage)]);

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  participantIds: text("participant_ids", { mode: "json" }).notNull().$type<string[]>(),
  title: text("title").notNull().default("New tasting session"),
  model: text("model").notNull(),
  ...timestamps,
}, (table) => [index("conversations_household_idx").on(table.householdId)]);

export interface MessagePart {
  type: string;
  [key: string]: unknown;
}

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  parts: text("parts", { mode: "json" }).notNull().$type<MessagePart[]>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [index("messages_conversation_idx").on(table.conversationId)]);

export interface TastingPalate {
  sweetness: number | null;
  acidity: number | null;
  tannin: number | null;
  alcohol: number | null;
  body: number | null;
  flavors: string[];
}

export const tastingNotes = sqliteTable("tasting_notes", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => profiles.id),
  wineId: text("wine_id").notNull().references(() => wines.id),
  appearance: text("appearance"),
  nose: text("nose", { mode: "json" }).notNull().$type<string[]>(),
  palate: text("palate", { mode: "json" }).notNull().$type<TastingPalate>(),
  finish: text("finish"),
  rating: integer("rating"),
  verdict: text("verdict", { enum: ["liked", "mixed", "disliked"] }).notNull(),
  freeform: text("freeform"),
  conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [
  index("tasting_notes_household_idx").on(table.householdId),
  index("tasting_notes_profile_idx").on(table.profileId),
  index("tasting_notes_conversation_idx").on(table.conversationId),
  check("tasting_notes_rating_range", sql`${table.rating} is null or ${table.rating} between 1 and 5`),
]);

export const recommendations = sqliteTable("recommendations", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  profileId: text("profile_id").references(() => profiles.id),
  wineName: text("wine_name").notNull(),
  producer: text("producer"),
  grape: text("grape"),
  region: text("region"),
  style: text("style", { enum: ["red", "white", "rose", "sparkling", "dessert", "fortified", "orange"] }),
  priceBand: text("price_band", { enum: ["under_15", "15_30", "30_60", "over_60"] }),
  reasoning: text("reasoning").notNull(),
  status: text("status", { enum: ["suggested", "purchased", "tasted", "dismissed"] }).notNull().default("suggested"),
  source: text("source", { enum: ["chat", "dashboard"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (table) => [
  index("recommendations_household_idx").on(table.householdId),
  index("recommendations_profile_idx").on(table.profileId),
]);

export const grapes = sqliteTable("grapes", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  color: text("color", { enum: ["red", "white"] }).notNull(),
  aka: text("aka", { mode: "json" }).notNull().$type<string[]>(),
  profile: text("profile").notNull(),
  classicRegions: text("classic_regions", { mode: "json" }).notNull().$type<string[]>(),
  whatToTasteFor: text("what_to_taste_for").notNull(),
  benchmarkStyles: text("benchmark_styles", { mode: "json" }).notNull().$type<string[]>(),
  orderIndex: integer("order_index").notNull().unique(),
});

export type Profile = typeof profiles.$inferSelect;
export type PalateProfile = typeof palateProfiles.$inferSelect;
export type TastingNote = typeof tastingNotes.$inferSelect;
