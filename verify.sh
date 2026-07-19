#!/usr/bin/env bash
# verify.sh — THE gate. Operator-owned; the agent must never edit this file.
#
# Usage:
#   ./verify.sh          # incremental gate: everything that exists must be green
#   ./verify.sh --done   # completion gate: incremental gate + every acceptance
#                        # criterion (AC-*) in specs/ covered by a test
#
# Exit code 0 = green. Anything else = not done, keep working.

set -uo pipefail
cd "$(dirname "$0")"

DONE_MODE=0
[[ "${1:-}" == "--done" ]] && DONE_MODE=1

PHASE=""
phase() {
  PHASE="$1"
  printf '\n\033[36m── %s ──────────────────────────────\033[0m\n' "$PHASE"
}
fail() {
  printf '\n\033[31m✗ FAILED at phase: %s\033[0m\n%s\n' "$PHASE" "${1:-}"
  exit 1
}
run() { "$@" || fail "command failed: $*"; }

# ── 0. preflight ────────────────────────────────────────────────
phase "preflight"
if [[ ! -f package.json ]]; then
  fail "package.json not found.
The app has not been scaffolded yet. Scaffold it per specs/00-architecture.md
(hand-authored, no interactive create-next-app), including every required npm
script listed there, then re-run ./verify.sh."
fi

run node -e '
const p = require("./package.json").scripts || {};
const need = ["dev","build","start","start:e2e","typecheck","lint",
  "test:unit","test:integration","test:e2e","db:migrate","db:seed","db:reset:test"];
const miss = need.filter(s => !p[s]);
if (miss.length) {
  console.error("Missing required npm scripts (specs/00-architecture.md): " + miss.join(", "));
  process.exit(1);
}'

if [[ ! -d node_modules ]]; then
  echo "node_modules missing — installing…"
  run npm install --no-audit --no-fund
fi

# ── 1. static gates ─────────────────────────────────────────────
phase "typecheck"
run npm run --silent typecheck

phase "lint"
run npm run --silent lint

phase "guard (anti-gaming checks)"
run bash scripts/guard.sh

# ── 2. build ────────────────────────────────────────────────────
phase "build"
run npm run --silent build

# ── 3. tests, cheapest first ────────────────────────────────────
phase "unit tests"
run npm run --silent test:unit

phase "integration tests (ephemeral db)"
run npm run --silent db:reset:test
run npm run --silent test:integration

phase "e2e (mock LLM, built app)"
run npm run --silent db:reset:test
run npm run --silent test:e2e

# ── 4. completion gate ──────────────────────────────────────────
if [[ $DONE_MODE -eq 1 ]]; then
  phase "acceptance-criteria coverage (--done)"
  run bash scripts/guard.sh --done
fi

printf '\n\033[32m✓ ALL GATES PASSED%s\033[0m\n' "$([[ $DONE_MODE -eq 1 ]] && echo ' (DONE — every acceptance criterion covered)')"
