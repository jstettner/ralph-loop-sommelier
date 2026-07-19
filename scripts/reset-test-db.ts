import fs from "node:fs";
import { spawnSync } from "node:child_process";

const databases = ["./data/wine-test.db", "./data/wine-e2e.db"];

for (const database of databases) {
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(`${database}${suffix}`, { force: true });
  }
  for (const script of ["src/db/migrate.ts", "src/db/seed.ts"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", script], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: database },
      encoding: "utf8",
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      process.exit(result.status ?? 1);
    }
  }
}

console.log("Reset and seeded test databases.");
