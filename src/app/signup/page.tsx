import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getHouseholdSession } from "@/server/session";

export default async function SignupPage() {
  if (await getHouseholdSession()) redirect("/profiles");
  return (
    <main className="flex min-h-dvh items-center justify-center py-8">
      <section className="terminal-panel" aria-labelledby="signup-title">
        <p className="mb-3 text-sm text-[var(--text-dim)]">somm@cellar:~$ create-household</p>
        <h1 id="signup-title" className="bloom-cyan mb-8 text-2xl text-[var(--cyan)]">NEW HOUSEHOLD</h1>
        <AuthForm mode="signup" />
      </section>
    </main>
  );
}
