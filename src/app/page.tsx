import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center py-8">
      <section className="terminal-panel" aria-labelledby="title">
        <p className="mb-8 text-sm text-[var(--text-dim)]">somm@cellar:~$ ./begin</p>
        <h1 id="title" className="bloom-cyan mb-4 text-3xl tracking-tight text-[var(--cyan)]">
          WINE TRAINER
        </h1>
        <p className="mb-10 leading-7 text-[var(--text)]">
          Learn your palate, one bottle and one honest conversation at a time.
        </p>
        <nav className="flex flex-wrap gap-4" aria-label="Account">
          <Link className="flex min-h-11 items-center border border-[var(--cyan)] px-5 no-underline" href="/signup">
            CREATE HOUSEHOLD
          </Link>
          <Link className="flex min-h-11 items-center border border-[var(--border)] px-5 no-underline" href="/login">
            LOG IN
          </Link>
        </nav>
      </section>
    </main>
  );
}
