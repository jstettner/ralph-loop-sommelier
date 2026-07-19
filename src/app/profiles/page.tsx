import { redirect } from "next/navigation";
import { ProfilePicker } from "@/components/profile-picker";
import { listProfiles } from "@/server/profiles";
import { getHouseholdSession } from "@/server/session";

export default async function ProfilesPage() {
  const session = await getHouseholdSession();
  if (!session) redirect("/login");
  const householdProfiles = listProfiles(session.user.id);
  if (householdProfiles.length === 0) redirect("/profiles/new");
  return (
    <main className="flex min-h-dvh items-center justify-center py-8">
      <section className="terminal-panel !max-w-3xl" aria-labelledby="profiles-title">
        <p className="prompt-line mb-3">somm@cellar:~$ select-taster</p>
        <h1 id="profiles-title" className="bloom-cyan mb-8 text-base tracking-[0.18em] text-[var(--cyan)]">WHO&apos;S TASTING?</h1>
        <ProfilePicker profiles={householdProfiles} />
      </section>
    </main>
  );
}
