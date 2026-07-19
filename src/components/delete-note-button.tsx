"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteNoteButton({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function remove() {
    if (!window.confirm("Delete this tasting note?")) return;
    const response = await fetch(`/api/journal/${noteId}`, { method: "DELETE" });
    if (!response.ok) { setError("The tasting note could not be deleted."); return; }
    router.push("/journal"); router.refresh();
  }
  return <div><button className="terminal-button terminal-button--danger" type="button" onClick={remove}>DELETE NOTE</button>{error && <p className="mt-2 text-[var(--magenta)]" role="alert">{error}</p>}</div>;
}
