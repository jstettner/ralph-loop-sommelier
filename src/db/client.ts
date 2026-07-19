import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

function databasePath(): string {
  const configured = process.env.DATABASE_URL ?? "./data/wine.db";
  return configured.startsWith("file:") ? configured.slice(5) : configured;
}

function openDatabase() {
  const filename = databasePath();
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  return sqlite;
}

const globalDatabase = globalThis as typeof globalThis & {
  wineTrainerSqlite?: ReturnType<typeof openDatabase>;
};

export const sqlite = globalDatabase.wineTrainerSqlite ?? openDatabase();
if (process.env.NODE_ENV !== "production") globalDatabase.wineTrainerSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
