import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center py-8">
      <section className="terminal-panel" aria-labelledby="title">
        <p className="prompt-line mb-8">somm@cellar:~$ ./begin</p>
        <h1 id="title" className="bloom-cyan mb-4 text-xl tracking-[0.22em] text-[var(--cyan)]">
          WINE TRAINER
        </h1>
        <p className="mb-10 text-sm leading-7 text-[var(--text-dim)]">
          Learn your palate, one bottle and one honest conversation at a time.
        </p>
        <nav className="flex flex-wrap gap-4" aria-label="Account">
          <Link className="terminal-button terminal-button--primary inline-flex items-center no-underline" href="/signup">
            CREATE HOUSEHOLD
          </Link>
          <Link className="terminal-button inline-flex items-center no-underline" href="/login">
            LOG IN
          </Link>
        </nav>
      </section>
    </main>
  );
}
