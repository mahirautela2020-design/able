#!/usr/bin/env bash
# run-build.sh — Able multi-agent orchestrator (ONE command to run the whole graph)
# Usage: bash run-build.sh [phase-key]     (no arg = run P1→P6)
# Roles: researcher (glm-5.2) → builder (deepseek-v4-pro) → verifier (gates) → pr-riser (git+gh)
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
mkdir -p build-logs docs/phase-reports
RUN_LOG="build-logs/run.log"
CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"

# ── models (opencode-go provider — the only working one on this machine) ──
RESEARCHER_MODEL="opencode-go/glm-5.2"       # analysis only — cheap + strong (was kimi-k3)
BUILDER_MODEL="opencode-go/deepseek-v4-pro"  # implementation — quality matters most

log() { echo "[$(date '+%F %T')] $1" | tee -a "$RUN_LOG"; }

# ── phase table: key|spec|branch|pr-title ──
PHASES=(
  "p1|WORKBENCH_VISION.md|phase/p1-workbench|P1: Explore workbench (live session, element inspector, live contrast, keyboard replay, color-blind overlays, ARIA tree)"
  "p2|WORKBENCH_VISION.md|phase/p2-modules|P2: Module control + portal sessions + needs-review UI + multi-viewport + regulation mapping"
  "p3|ENTERPRISE_SPEC.md|phase/p3-figma-image|P3: Figma mode (REST + contrast engine + touch targets) + Image upload (vision-LLM advisory)"
  "p4|ENTERPRISE_SPEC.md|phase/p4-mobile-code|P4: APK static analysis (aapt2 + lint) + Code audit (eslint a11y stack)"
  "p5|ENTERPRISE_SPEC.md|phase/p5-sr-maturity|P5: Screen readers (NVDA out-of-process + guided) + W3C maturity module + ACR/VPAT"
  "p6|ENTERPRISE_SPEC.md|phase/p6-enterprise|P6: Enterprise shell (SSO, RBAC, multi-tenant, API, webhooks, MCP framework)"
)

run_phase() {
  local KEY="$1" SPEC="$2" BRANCH="$3" TITLE="$4"
  log "════════ PHASE $KEY ════════"

  # ── 1. RESEARCHER (glm-5.2) ──
  log "  [researcher] analyzing $SPEC → TASKS + RISKS"
  opencode run "You are the RESEARCHER for Able. Read ORCHESTRATOR.md, AGENTS/researcher.md, $SPEC, PRODUCT_BLUEPRINT.md, ENTERPRISE_SPEC.md, AGENTS.md. Execute the researcher role for phase $KEY: write docs/phase-reports/${KEY}-TASKS.md and docs/phase-reports/${KEY}-RISKS.md. Follow AGENTS/researcher.md exactly." \
    --model "$RESEARCHER_MODEL" -f ORCHESTRATOR.md -f AGENTS/researcher.md -f "$SPEC" >> build-logs/researcher-$KEY.log 2>&1 \
    || log "  ⚠ researcher non-zero exit (check build-logs/researcher-$KEY.log)"
  [ -f "docs/phase-reports/${KEY}-TASKS.md" ] && log "  ✅ researcher: TASKS + RISKS written" || log "  ⚠ researcher produced no TASKS — continuing with spec only"

  # ── 2+3. BUILDER loop (max 5 attempts) ──
  local attempt=1
  while [ "$attempt" -le 5 ]; do
    log "  [builder] attempt $attempt/5 (deepseek-v4-pro)"
    local FEEDBACK=""
    [ -f build-logs/verify-$KEY.log ] && FEEDBACK="The previous verifier run FAILED. Fix exactly these failures: $(tail -60 build-logs/verify-$KEY.log)"
    opencode run "You are the BUILDER for Able. Read ORCHESTRATOR.md, AGENTS/builder.md, $SPEC, docs/phase-reports/${KEY}-TASKS.md (if present), docs/phase-reports/${KEY}-RISKS.md (if present), AGENTS.md. Execute the builder role for phase $KEY. $FEEDBACK Follow AGENTS/builder.md exactly: implement, add tests for every gate, run npm run verify and the browser tests until green, then commit." \
      --model "$BUILDER_MODEL" -f ORCHESTRATOR.md -f AGENTS/builder.md -f "$SPEC" -f "docs/phase-reports/${KEY}-TASKS.md" -f "docs/phase-reports/${KEY}-RISKS.md" >> build-logs/builder-$KEY-$attempt.log 2>&1
    log "  [builder] attempt $attempt finished (log: build-logs/builder-$KEY-$attempt.log)"

    # ── VERIFIER (deterministic) ──
    if bash AGENTS/verifier.sh "$KEY"; then
      log "  ✅ verifier GREEN — phase $KEY passes all gates"
      # ── 4. PR-RAISER ──
      bash AGENTS/pr-riser.sh "$KEY" "$BRANCH" "$TITLE"
      log "  ✅ phase $KEY shipped as PR $BRANCH"
      return 0
    fi
    log "  ❌ verifier FAILED (attempt $attempt) — feeding failure back to builder"
    attempt=$((attempt + 1))
  done

  log "  ☠ PHASE $KEY FAILED after 5 attempts — see build-logs/verify-$KEY.log"
  log "  ☠ RUN HALTED. Inspect build-logs/, fix, then re-run: bash run-build.sh $KEY"
  exit 1
}

# ── main ──
ONLY="${1:-}"
log "════════ Able build graph START ════════"
log "models: researcher=$RESEARCHER_MODEL builder=$BUILDER_MODEL"
log "chrome: $CHROME"

for line in "${PHASES[@]}"; do
  IFS='|' read -r KEY SPEC BRANCH TITLE <<< "$line"
  if [ -n "$ONLY" ] && [ "$ONLY" != "$KEY" ]; then continue; fi
  run_phase "$KEY" "$SPEC" "$BRANCH" "$TITLE"
done

log "════════ Able build graph COMPLETE — all phases shipped as PRs ════════"
log "Next: git checkout main && git pull && npm run dev → test locally."
