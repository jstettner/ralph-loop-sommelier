import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { db, sqlite } from "./client";

migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
sqlite.close();
