import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

function readJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, filename), "utf8")) as T;
}

describe("architecture contracts", () => {
  it("AC-ARCH-1 enables strict TypeScript checking", () => {
    const config = readJson<{ compilerOptions?: { strict?: boolean } }>("tsconfig.json");
    expect(config.compilerOptions?.strict).toBe(true);
  });

  it("AC-ARCH-2 treats explicit any as a lint error", () => {
    const config = fs.readFileSync(path.join(root, "eslint.config.mjs"), "utf8");
    expect(config).toContain('"@typescript-eslint/no-explicit-any": "error"');
  });

  it("AC-ARCH-3 configures a standalone Next.js build", () => {
    const config = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
    expect(config).toMatch(/output:\s*["']standalone["']/);
  });

  it("AC-ARCH-4 exposes every required lifecycle script", () => {
    const manifest = readJson<{ scripts?: Record<string, string> }>("package.json");
    const required = [
      "dev", "build", "start", "start:e2e", "typecheck", "lint",
      "test:unit", "test:integration", "test:e2e", "db:migrate", "db:seed", "db:reset:test",
    ];
    expect(Object.keys(manifest.scripts ?? {})).toEqual(expect.arrayContaining(required));
    expect(manifest.scripts?.["start:e2e"]).toContain("next start -p 3100");
  });

  it("AC-ARCH-5 documents the complete environment contract", () => {
    const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    const variables = [
      "DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY", "AVAILABLE_MODELS", "DEFAULT_MODEL", "TAVILY_API_KEY", "MOCK_LLM",
    ];
    for (const variable of variables) expect(example).toMatch(new RegExp(`^#?\\s*${variable}=`, "m"));
  });
});
