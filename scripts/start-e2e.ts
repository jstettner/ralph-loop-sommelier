import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("Standalone build not found. Run npm run build first.");
  process.exit(1);
}

fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) {
  fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}

const child = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: path.join(root, "data", "wine-e2e.db"),
    BETTER_AUTH_SECRET: "e2e-secret-at-least-32-characters",
    BETTER_AUTH_URL: "http://127.0.0.1:3100",
    MOCK_LLM: "1",
    HOSTNAME: "127.0.0.1",
    PORT: "3100",
  },
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 1));
