"use client";

import { useEffect, useRef } from "react";
import type { Profile } from "@/db/schema";
import { isToolPart, LABELS, toolDetail, toolName, type ToolPart } from "@/lib/tool-summary";

// Build the transient trace content from streamed message parts: provider-visible reasoning
// summaries and safe tool activity, in order. Never fabricates reasoning and never exposes raw
// JSON, ids, or provider metadata (specs/04, specs/10).
export function traceLinesFromParts(parts: Array<{ type: string; text?: string }>, participants: Profile[]): string[] {
  const lines: string[] = [];
  for (const part of parts) {
    if (part.type === "reasoning") {
      const text = part.text?.trim();
      if (text) lines.push(...text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line) => `· ${line}`));
    } else if (isToolPart(part)) {
      const toolPart = part as ToolPart;
      const name = toolName(toolPart);
      const detail = toolDetail(name, toolPart.input, participants);
      lines.push(`▸ ${LABELS[name] ?? name.replaceAll("_", " ")}${detail ? ` — ${detail}` : ""}`);
    }
  }
  return lines;
}

export function boundedTraceLines(lines: string[]) {
  return lines.slice(-64);
}

// The full-viewport ghost TUI. Fixed, pointer-transparent, out of the accessibility tree, and
// semi-opaque so the real app stays visible beneath it (specs/10, AC-UI-12).
export function NeuralTrace({ lines, dissolving }: { lines: string[]; dissolving: boolean }) {
  const body = useRef<HTMLDivElement>(null);
  const visibleLines = boundedTraceLines(lines);
  const latestVisibleLine = visibleLines.at(-1);
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [visibleLines.length, latestVisibleLine]);
  return (
    <div className={`neural-trace${dissolving ? " neural-trace--dissolving" : ""}`} data-testid="neural-trace" aria-hidden="true">
      <p className="neural-trace__label">┌─ NEURAL TRACE · provider-visible reasoning summary ─┄</p>
      <div className="neural-trace__body" ref={body} data-line-count={visibleLines.length}>
        {visibleLines.map((line, index) => (
          <p className="neural-trace__line" key={index} style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
            <span className="neural-trace__gutter">{String(index + 1).padStart(2, "0")}</span> {line}
          </p>
        ))}
        <p className="neural-trace__line neural-trace__cursor">└┄ streaming<span className="neural-trace__blink">▌</span></p>
      </div>
    </div>
  );
}
