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

# ── models / backends ──
# AGENT_BACKEND=claude   → researcher + builder run via Claude Code CLI (Pro
#                          subscription, OAuth — no opencode-go tokens used)
# AGENT_BACKEND=opencode → researcher + builder run via opencode-go (fallback)
AGENT_BACKEND="${AGENT_BACKEND:-claude}"
RESEARCHER_MODEL="opencode-go/glm-5.2"       # analysis only — cheap + strong (opencode backend)
BUILDER_MODEL="opencode-go/deepseek-v4-pro"  # implementation — quality matters most (opencode backend)

log() { echo "[$(date '+%F %T')] $1" | tee -a "$RUN_LOG"; }

# Run one LLM agent step. Backend-aware:
#   claude   → claude -p (print mode, Pro OAuth) with context files appended
#   opencode → opencode run --model <MODEL> -f <FILES>
# Prints to the phase log; returns non-zero on failure.
run_agent() {
  local ROLE="$1" KEY="$2" MODEL="$3" PROMPT="$4" LOGFILE="$5"
  shift 5
  if [ "$AGENT_BACKEND" = "claude" ]; then
    local CTX=""
    # Claude loads CLAUDE.md + AGENTS.md automatically; append role/spec files
    # via --append-system-prompt-file (only existing files, no hard-fail).
    for f in "$@"; do
      [ -f "$f" ] && CTX="$CTX --append-system-prompt-file \"$f\""
    done
    # shellcheck disable=SC2086
    eval claude -p "$PROMPT" --permission-mode bypassPermissions --max-turns 60 --verbose $CTX >> "$LOGFILE" 2>&1
  else
    local FILES=()
    for f in "$@"; do
      [ -f "$f" ] && FILES+=(-f "$f")
    done
    opencode run "$PROMPT" --model "$MODEL" "${FILES[@]}" >> "$LOGFILE" 2>&1
  fi
}

# ── phase table: key|spec|branch|pr-title ──
PHASES=(
  "p1|WORKBENCH_VISION.md|phase/p1-workbench|P1: Explore workbench (live session, element inspector, live contrast, keyboard replay, color-blind overlays, ARIA tree)"
  "p2|WORKBENCH_VISION.md|phase/p2-modules|P2: Module control + portal sessions + needs-review UI + multi-viewport + regulation mapping"
  "p3|ENTERPRISE_SPEC.md|phase/p3-figma-image|P3: Figma mode (REST + contrast engine + touch targets) + Image upload (vision-LLM advisory)"
  "p4|ENTERPRISE_SPEC.md|phase/p4-mobile-code|P4: APK static analysis (aapt2 + lint) + Code audit (eslint a11y stack)"
  "p5|ENTERPRISE_SPEC.md|phase/p5-sr-maturity|P5: Screen readers (NVDA out-of-process + guided) + W3C maturity module + ACR/VPAT"
  "p6|ENTERPRISE_SPEC.md|phase/p6-enterprise|P6: Enterprise shell (SSO, RBAC, multi-tenant, API, webhooks, MCP framework)"
  "p7|P7_NVDA_SPEC.md|phase/p7-nvda|P7: NVDA screen-reader automation (local Windows driver, announcement capture, deterministic silent-element checks)"
  "p8|P8_VISION_DETECTION_SPEC.md|phase/p8-vision-detection|P8: Deterministic UI element detection (supervision/Python CLI) — measured 2.5.8 + 1.4.11"
  "p9|P9_APK_DYNAMIC_SPEC.md|phase/p9-apk-dynamic|P9: APK dynamic testing (emulator + adb + uiautomator dump — live 4.1.2/2.5.8/1.4.3)"
  "p10|P10_IOS_SPEC.md|phase/p10-ios|P10: iOS IPA static analysis (plist/asset checks) + guided VoiceOver checklist"
)

run_phase() {
  local KEY="$1" SPEC="$2" BRANCH="$3" TITLE="$4"
  log "════════ PHASE $KEY ════════"

  # ── 1. RESEARCHER (backend-aware) ──
  log "  [researcher] analyzing $SPEC → TASKS + RISKS ($AGENT_BACKEND)"
  run_agent researcher "$KEY" "$RESEARCHER_MODEL" \
    "You are the RESEARCHER for Able phase $KEY. YOUR FIRST ACTION: use the write_file tool to create docs/phase-reports/${KEY}-TASKS.md (numbered task checklist for this phase per $SPEC and ORCHESTRATOR.md section 4) and docs/phase-reports/${KEY}-RISKS.md (risks + mitigations). WRITE THE FILES FIRST — do not stop to read long specs first; keep each file under 60 lines. Then reply DONE." \
    "build-logs/researcher-$KEY.log" ORCHESTRATOR.md AGENTS/researcher.md \
    || log "  ⚠ researcher non-zero exit (check build-logs/researcher-$KEY.log)"
  [ -f "docs/phase-reports/${KEY}-TASKS.md" ] && log "  ✅ researcher: TASKS + RISKS written" || log "  ⚠ researcher produced no TASKS — continuing with spec only"

  # ── 1.5 CREATE PHASE BRANCH (before builder — keeps PRs non-cumulative) ──
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH" >> build-logs/git-$KEY.log 2>&1
    log "  [git] using existing branch $BRANCH"
  else
    git checkout -b "$BRANCH" >> build-logs/git-$KEY.log 2>&1
    log "  [git] created branch $BRANCH from main"
  fi

  # ── 2+3. BUILDER loop (max 5 attempts) ──
  local attempt=1
  while [ "$attempt" -le 5 ]; do
    log "  [builder] attempt $attempt/5 ($AGENT_BACKEND)"
    local FEEDBACK=""
    [ -f build-logs/verify-$KEY.log ] && FEEDBACK="The previous verifier run FAILED. Fix exactly these failures: $(tail -60 build-logs/verify-$KEY.log)"

    # Context files — attached only if they exist (both backends tolerate
    # missing files; opencode hard-fails on missing -f args, so gate here).
    local FILES=(ORCHESTRATOR.md AGENTS/builder.md "$SPEC" AGENTS.md)
    [ -f "docs/phase-reports/${KEY}-TASKS.md" ] && FILES+=("docs/phase-reports/${KEY}-TASKS.md")
    [ -f "docs/phase-reports/${KEY}-RISKS.md" ] && FILES+=("docs/phase-reports/${KEY}-RISKS.md")

    run_agent builder "$KEY" "$BUILDER_MODEL" \
      "You are the BUILDER for Able. Read ORCHESTRATOR.md, AGENTS/builder.md, $SPEC, AGENTS.md. Execute the builder role for phase $KEY. ${FEEDBACK} Follow AGENTS/builder.md exactly: implement the phase per the spec, add tests, run npm run verify and the browser tests until green, then commit. IMPORTANT: you must actually change code — the verifier fails if your branch has no commits." \
      "build-logs/builder-$KEY-$attempt.log" "${FILES[@]}"
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
