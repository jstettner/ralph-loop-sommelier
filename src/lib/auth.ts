import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "development-secret-change-before-production",
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  rateLimit: { enabled: process.env.MOCK_LLM !== "1" },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    requireEmailVerification: false,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (household) => ({ data: { ...household, emailVerified: true } }),
      },
    },
  },
});
