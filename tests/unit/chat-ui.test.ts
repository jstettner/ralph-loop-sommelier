import { describe, expect, it } from "vitest";
import { shouldSubmitChatShortcut } from "../../src/components/chat-client";
import { boundedTraceLines, traceLinesFromParts } from "../../src/components/neural-trace";

const base = { key: "Enter", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, composing: false };

describe("chat UI contracts", () => {
  it("AC-CHAT-20 accepts Meta/Control+Enter and rejects newline, modifiers, repeat, and IME composition", () => {
    expect(shouldSubmitChatShortcut({ ...base, metaKey: true })).toBe(true);
    expect(shouldSubmitChatShortcut({ ...base, ctrlKey: true })).toBe(true);
    expect(shouldSubmitChatShortcut(base)).toBe(false);
    expect(shouldSubmitChatShortcut({ ...base, metaKey: true, shiftKey: true })).toBe(false);
    expect(shouldSubmitChatShortcut({ ...base, ctrlKey: true, altKey: true })).toBe(false);
    expect(shouldSubmitChatShortcut({ ...base, metaKey: true, repeat: true })).toBe(false);
    expect(shouldSubmitChatShortcut({ ...base, ctrlKey: true, composing: true })).toBe(false);
    expect(shouldSubmitChatShortcut({ ...base, key: "a", metaKey: true })).toBe(false);
  });

  it("AC-UI-14 bounds a long reasoning trace to the newest 64 logical lines", () => {
    const reasoning = Array.from({ length: 80 }, (_, index) => `${String(index + 1).padStart(2, "0")} · signal`).join("\n");
    const lines = traceLinesFromParts([{ type: "reasoning", text: reasoning }], []);
    expect(lines).toHaveLength(80);
    const visible = boundedTraceLines(lines);
    expect(visible).toHaveLength(64);
    expect(visible[0]).toContain("17 · signal");
    expect(visible[63]).toContain("80 · signal");
  });
});
