import { redirect } from "next/navigation";
import { CreateProfileForm } from "@/components/create-profile-form";
import { listProfiles } from "@/server/profiles";
import { getHouseholdSession } from "@/server/session";

export default async function NewProfilePage() {
  const session = await getHouseholdSession();
  if (!session) redirect("/login");
  if (listProfiles(session.user.id).length >= 4) redirect("/profiles");
  return (
    <main className="flex min-h-dvh items-center justify-center py-8">
      <section className="terminal-panel" aria-labelledby="new-profile-title">
        <p className="prompt-line mb-3">somm@cellar:~$ add-taster</p>
        <h1 id="new-profile-title" className="bloom-cyan mb-8 text-base tracking-[0.18em] text-[var(--cyan)]">NEW TASTER</h1>
        <CreateProfileForm />
      </section>
    </main>
  );
}
