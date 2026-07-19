"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import type { Profile } from "@/db/schema";
import { Barrel, GrapeCluster, Journal, Terminal, WineGlass } from "@/components/icons";

const navigation = [
  ["/dashboard", "DASHBOARD", Barrel], ["/chat", "CHAT", Terminal], ["/journal", "JOURNAL", Journal],
  ["/grapes", "GRAPES", GrapeCluster], ["/profile", "PROFILE", WineGlass],
] as const;

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  async function logout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="hidden min-h-dvh border-r border-[var(--border)] p-5 md:flex md:flex-col" data-testid="desktop-rail">
        <Link href="/dashboard" className="bloom-cyan mb-10 text-sm tracking-[0.22em] text-[var(--cyan)] no-underline">WINE_TRAINER</Link>
        <nav className="flex flex-col gap-1" aria-label="Primary">
          {navigation.map(([href, label, Icon]) => <Link key={href} href={href}
            className={`flex min-h-11 items-center border-l border-transparent px-3 text-xs tracking-[0.1em] no-underline transition-colors ${pathname.startsWith(href) ? "border-[var(--cyan)] bloom-cyan text-[var(--cyan)]" : "text-[var(--text-dim)] hover:text-[var(--text)]"}`}
            aria-current={pathname.startsWith(href) ? "page" : undefined}><Icon size={16} className="mr-2" /> {label}</Link>)}
        </nav>
        <div className="mt-auto space-y-2 border-t border-[var(--border)] pt-5">
          <Link href="/profiles" className={`flex min-h-11 items-center text-xs tracking-[0.1em] bloom-${profile.color} no-underline`}
            style={{ color: `var(--${profile.color})` }}>{profile.name}</Link>
          <button className="min-h-11 cursor-pointer text-xs tracking-[0.1em] text-[var(--text-dim)] transition-colors hover:text-[var(--text)]" type="button" onClick={logout}>LOG OUT</button>
        </div>
      </aside>
      <header className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4 md:hidden">
        <span className="text-xs tracking-[0.22em] text-[var(--cyan)]">WINE_TRAINER</span>
        <Link href="/profiles" className={`text-xs tracking-[0.1em] bloom-${profile.color} no-underline`} style={{ color: `var(--${profile.color})` }}>{profile.name}</Link>
        <button className="min-h-11 cursor-pointer text-xs tracking-[0.1em] text-[var(--text-dim)] transition-colors hover:text-[var(--text)]" type="button" onClick={logout}>LOG OUT</button>
      </header>
      <main className="min-w-0 px-4 pb-24 pt-8 md:px-10 md:pb-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-[var(--border)] bg-[var(--bg-raised)] pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Mobile primary" data-testid="bottom-tabs">
        {navigation.map(([href, label, Icon]) => <Link key={href} href={href}
          className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] tracking-[0.08em] no-underline transition-colors ${pathname.startsWith(href) ? "bloom-cyan text-[var(--cyan)]" : "text-[var(--text-dim)]"}`}
          aria-current={pathname.startsWith(href) ? "page" : undefined}><Icon size={16} />{label}</Link>)}
      </nav>
    </div>
  );
}
