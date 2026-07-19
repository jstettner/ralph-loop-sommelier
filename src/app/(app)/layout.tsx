import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getActiveProfile, getHouseholdSession } from "@/server/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getHouseholdSession();
  if (!session) redirect("/login");
  const profile = await getActiveProfile(session);
  if (!profile) redirect("/profiles");
  return <AppShell profile={profile}>{children}</AppShell>;
}
