#!/usr/bin/env bash
# guard.sh — anti-gaming tripwires. Operator-owned; the agent must never edit this file.
#
#   bash scripts/guard.sh          # cheat checks
#   bash scripts/guard.sh --done   # cheat checks + AC coverage

set -uo pipefail
cd "$(dirname "$0")/.."

FAILED=0
err() { printf '\033[31mGUARD: %s\033[0m\n' "$1"; FAILED=1; }

# ── 1. operator-owned files must be untouched (uncommitted edits) ──
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  DIRTY=$(git status --porcelain -- specs verify.sh scripts/guard.sh GOAL.md 2>/dev/null)
  if [[ -n "$DIRTY" ]]; then
    err "operator-owned files modified (specs/, verify.sh, scripts/guard.sh, GOAL.md):"
    echo "$DIRTY"
    err "Revert these. If a spec is wrong, stop and ask the operator."
  fi
fi

# ── 2. no disabled/focused tests ──────────────────────────────────
if [[ -d tests || -d e2e ]]; then
  HITS=$(grep -rnE '\.(only|skip|fixme|todo)\s*\(|\bxit\s*\(|\bxdescribe\s*\(|\bxtest\s*\(' \
    tests e2e 2>/dev/null | grep -v node_modules || true)
  if [[ -n "$HITS" ]]; then
    err "disabled or focused tests found (.only/.skip/.fixme/.todo/xit/xdescribe):"
    echo "$HITS"
  fi
fi

# ── 3. no suppressions or placeholders in src ─────────────────────
if [[ -d src ]]; then
  HITS=$(grep -rnE '@ts-ignore|@ts-expect-error|eslint-disable' src 2>/dev/null || true)
  if [[ -n "$HITS" ]]; then
    err "type/lint suppressions found in src/:"
    echo "$HITS"
  fi
  HITS=$(grep -rniE 'TODO|FIXME|HACK\b|PLACEHOLDER|not implemented|NotImplemented' src 2>/dev/null || true)
  if [[ -n "$HITS" ]]; then
    err "placeholder markers found in src/ (full implementations only — specs/00):"
    echo "$HITS"
  fi
fi

# ── 4. --done: every acceptance criterion covered by a test ───────
if [[ "${1:-}" == "--done" ]]; then
  if [[ ! -d tests && ! -d e2e ]]; then
    err "--done requires tests/ and e2e/ to exist"
  else
    ALL_ACS=$(grep -ohE 'AC-[A-Z]+-[0-9]+' specs/*.md | sort -u)
    MISSING=""
    for AC in $ALL_ACS; do
      if ! grep -rq "$AC" tests e2e 2>/dev/null; then
        MISSING="$MISSING $AC"
      fi
    done
    if [[ -n "$MISSING" ]]; then
      err "acceptance criteria with no referencing test (put the AC id in the test name or a comment beside the test that proves it):"
      for AC in $MISSING; do echo "  $AC"; done
      TOTAL=$(echo "$ALL_ACS" | wc -l | tr -d ' ')
      DONE_COUNT=$((TOTAL - $(echo $MISSING | wc -w | tr -d ' ')))
      echo "coverage: $DONE_COUNT/$TOTAL"
    else
      echo "AC coverage: all $(echo "$ALL_ACS" | wc -l | tr -d ' ') criteria referenced by tests."
    fi
  fi
fi

if [[ $FAILED -eq 1 ]]; then
  exit 1
fi
echo "guard: clean"
