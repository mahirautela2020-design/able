#!/usr/bin/env bash
# Able P9 — Android emulator lifecycle controller (adb + emulator).
# Deterministic, no LLM. Feature-detects adb/emulator; exits 2 when absent so
# the caller can degrade to static-only.
set -u

usage() {
  cat <<'EOF'
Able P9 — Android emulator lifecycle controller (adb + emulator).

Commands:
  present              Exit 0 if adb+emulator are on PATH, else 2.
  boot                 Boot AVD headless, wait for device + boot-completed (AVD_NAME required).
  install <apk>        adb install -r <apk>.
  launch <pkg>         Resolve launcher activity and start it via am start / monkey.
  snapshot <out.png>   Capture screen to <out.png> via screencap.
  dump <out.xml>       Dump UI hierarchy to <out.xml> via uiautomator.
  density              Print ro.sf.lcd_density (falls back to 420).
  shutdown             Kill the running emulator.
  --help               This help.

Env:
  AVD_NAME             Emulator AVD name (required for boot).
  BOOT_TIMEOUT         Seconds to wait for boot completion (default 180).
EOF
}

cmd="${1:-help}"
case "$cmd" in
  present)
    command -v adb >/dev/null 2>&1 || exit 2
    command -v emulator >/dev/null 2>&1 || exit 2
    exit 0
    ;;
  help|--help|-h)
    usage
    exit 0
    ;;
esac

# All remaining commands require adb + emulator on PATH.
command -v adb >/dev/null 2>&1 || exit 2
command -v emulator >/dev/null 2>&1 || exit 2

AVD_NAME="${AVD_NAME:-}"
BOOT_TIMEOUT="${BOOT_TIMEOUT:-180}"

case "$cmd" in
  boot)
    [ -z "$AVD_NAME" ] && { echo "AVD_NAME not set" >&2; exit 1; }
    # Kill any stale emulator first to avoid two-instance port conflicts (5554/5555).
    adb emu kill >/dev/null 2>&1 || true
    emulator -avd "$AVD_NAME" -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect >/dev/null 2>&1 &
    adb wait-for-device
    waited=0
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
      [ "$waited" -ge "$BOOT_TIMEOUT" ] && { echo "boot timeout after ${waited}s" >&2; exit 3; }
      sleep 5
      waited=$((waited + 5))
    done
    ;;
  install)
    [ $# -lt 2 ] && { echo "usage: install <apk>" >&2; exit 1; }
    adb install -r "$2" || exit 1
    ;;
  launch)
    [ $# -lt 2 ] && { echo "usage: launch <pkg>" >&2; exit 1; }
    pkg="$2"
    # Resolve the launcher component via monkey output, else let monkey launch it.
    comp="$(adb shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 2>/dev/null | grep -oE "${pkg}/[A-Za-z0-9_.]+" | head -1)"
    if [ -n "$comp" ]; then
      adb shell am start -n "$comp" >/dev/null 2>&1 || exit 1
    else
      adb shell monkey -p "$pkg" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || exit 1
    fi
    sleep 3
    ;;
  snapshot)
    [ $# -lt 2 ] && { echo "usage: snapshot <out.png>" >&2; exit 1; }
    adb exec-out screencap -p > "$2" || exit 1
    ;;
  dump)
    [ $# -lt 2 ] && { echo "usage: dump <out.xml>" >&2; exit 1; }
    # /dev/tty streams the hierarchy XML to stdout instead of device storage.
    adb shell uiautomator dump /dev/tty 2>/dev/null > "$2" || exit 1
    ;;
  density)
    d="$(adb shell getprop ro.sf.lcd_density 2>/dev/null | tr -d '\r')"
    case "$d" in
      ''|*[!0-9]*) echo "420" ;;
      *) echo "$d" ;;
    esac
    ;;
  shutdown)
    adb emu kill >/dev/null 2>&1 || true
    ;;
  *)
    echo "unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
