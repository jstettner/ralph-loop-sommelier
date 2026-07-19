import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";
import { getActiveProfile, getHouseholdSession } from "@/server/session";

export default async function OnboardingPage() {
  const session = await getHouseholdSession();
  if (!session) redirect("/login");
  const profile = await getActiveProfile(session);
  if (!profile) redirect("/profiles");
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-10">
      <p className="prompt-line mb-3">somm@cellar:~$ calibrate-palate --taster={profile.name}</p>
      <h1 className="bloom-cyan mb-3 text-base tracking-[0.18em] text-[var(--cyan)]">TELL ME HOW YOU TASTE</h1>
      <p className="mb-10 text-sm text-[var(--text-dim)]">There are no right answers. These six signals give your tutor a useful place to begin.</p>
      <OnboardingForm />
    </main>
  );
}
