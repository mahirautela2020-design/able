#!/usr/bin/env bash
# Verifier role — deterministic gates, no LLM.
# Usage: bash AGENTS/verifier.sh [phase-key]
# Exits 0 = GREEN, 1 = FAIL. All output appended to build-logs/verify.log.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p build-logs docs/phase-reports
LOG="build-logs/verify.log"
CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
PHASE_KEY="${1:-unknown}"

echo "===== VERIFY $PHASE_KEY $(date '+%F %T') =====" | tee -a "$LOG"

fail() { echo "❌ $1" | tee -a "$LOG"; exit 1; }
pass() { echo "✅ $1" | tee -a "$LOG"; }

# Gate 1: full verify (lint + typecheck + tests + build)
echo "--- Gate 1: npm run verify ---" | tee -a "$LOG"
if ! npm run verify >> "$LOG" 2>&1; then
  fail "Gate 1 FAILED (npm run verify) — see build-logs/verify.log"
fi
pass "Gate 1: npm run verify green"

# Gate 2: browser regression tests (settle-scan + keyboard) with real Chrome
echo "--- Gate 2: browser tests (Chrome) ---" | tee -a "$LOG"
if [ ! -f "$CHROME" ]; then
  echo "⚠ Chrome not found at $CHROME — skipping Gate 2 (browser tests gate themselves)" | tee -a "$LOG"
else
  if ! CHROME_EXECUTABLE_PATH="$CHROME" npx vitest run tests/settle-scan.test.ts tests/keyboard.test.ts >> "$LOG" 2>&1; then
    fail "Gate 2 FAILED (browser tests)"
  fi
  pass "Gate 2: browser tests green"
fi

# Gate 3: phase-specific test files must exist and pass
echo "--- Gate 3: phase tests ($PHASE_KEY) ---" | tee -a "$LOG"
PHASE_TESTS=$(ls tests/phase-"$PHASE_KEY"*.test.ts 2>/dev/null || true)
if [ -n "$PHASE_TESTS" ]; then
  if ! CHROME_EXECUTABLE_PATH="$CHROME" npx vitest run $PHASE_TESTS >> "$LOG" 2>&1; then
    fail "Gate 3 FAILED ($PHASE_TESTS)"
  fi
  pass "Gate 3: $PHASE_TESTS green"
else
  echo "ℹ No phase-specific tests for $PHASE_KEY (Gate 3 skipped)" | tee -a "$LOG"
fi

# Gate 4: no secrets committed (JWT = three dot-separated base64url segments;
# integrity hashes like sha512-... must NOT match)
echo "--- Gate 4: secret scan ---" | tee -a "$LOG"
if git ls-files | grep -qE '(^|/)\.env($|\.)|\.env\.local'; then
  fail "Gate 4 FAILED: .env* tracked in git"
fi
if git grep -nE 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|(postgres|mysql)://[^:]+:[^@]+@[^/]+' -- ':!*.md' > /dev/null 2>&1; then
  fail "Gate 4 FAILED: possible secret in tracked files"
fi
pass "Gate 4: no secrets tracked"

echo "✅ VERIFY $PHASE_KEY GREEN $(date '+%F %T')" | tee -a "$LOG"
exit 0
