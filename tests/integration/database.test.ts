import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCurriculum } from "../../src/db/seed";
import * as schema from "../../src/db/schema";

const root = path.resolve(__dirname, "../..");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "wine-trainer-data-"));
const databaseFile = path.join(temporaryDirectory, "contracts.db");
const sqlite = new Database(databaseFile);
sqlite.pragma("foreign_keys = ON");
const database = drizzle(sqlite, { schema });

beforeAll(() => {
  migrate(database, { migrationsFolder: path.join(root, "src/db/migrations") });
});

afterAll(() => {
  sqlite.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("database foundation", () => {
  it("AC-DATA-1 applies committed migrations to an empty SQLite database", () => {
    const tables = sqlite.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual(expect.arrayContaining(["user", "profiles", "tasting_notes", "grapes"]));
  });

  it("AC-DATA-2 seeds idempotently and AC-CURR-1 fully populates exactly 18 curriculum grapes", () => {
    seedCurriculum(database);
    const firstCount = (sqlite.prepare("select count(*) as count from grapes").get() as { count: number }).count;
    seedCurriculum(database);
    const rows = database.select().from(schema.grapes).orderBy(schema.grapes.orderIndex).all();

    expect(firstCount).toBe(18);
    expect(rows).toHaveLength(firstCount);
    expect(rows.map((grape) => grape.orderIndex)).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
    for (const grape of rows) {
      expect(grape.name.trim()).not.toBe("");
      expect(grape.profile.split(/[.!?]/).filter(Boolean).length).toBeGreaterThanOrEqual(2);
      expect(grape.classicRegions.length).toBeGreaterThanOrEqual(2);
      expect(grape.whatToTasteFor.split(/[.!?]/).filter(Boolean).length).toBeGreaterThanOrEqual(2);
      expect(grape.benchmarkStyles.length).toBeGreaterThanOrEqual(2);
      expect(`${grape.profile} ${grape.whatToTasteFor}`).not.toMatch(/placeholder|todo|tbd/i);
    }
  });

  it("AC-DATA-3 round-trips every tasting-note JSON field without loss", () => {
    database.insert(schema.user).values({ id: "household-a", name: "Household A", email: "a@example.test" }).run();
    database.insert(schema.profiles).values({ id: "profile-a", householdId: "household-a", name: "Alex", color: "cyan" }).run();
    database.insert(schema.wines).values({
      id: "wine-a", name: "Test Cabernet", producer: "Fixture Cellars", vintage: 2022,
      grapes: ["Cabernet Sauvignon", "Merlot"], style: "red",
    }).run();
    const palate: schema.TastingPalate = {
      sweetness: 1, acidity: 4, tannin: 5, alcohol: 4, body: 5,
      flavors: ["blackcurrant", "cedar", "graphite"],
    };
    database.insert(schema.tastingNotes).values({
      id: "note-a", householdId: "household-a", profileId: "profile-a", wineId: "wine-a",
      nose: ["cassis", "mint"], palate, verdict: "liked", rating: 5,
    }).run();

    const note = database.select().from(schema.tastingNotes).get();
    expect(note?.nose).toEqual(["cassis", "mint"]);
    expect(note?.palate).toEqual(palate);
  });
});
