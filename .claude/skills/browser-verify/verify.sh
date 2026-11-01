#!/usr/bin/env bash
# DueMate 헤드리스 Chrome 검증: test | shot <name> <query> [height] | shots
set -u
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
ROOT="$(git rev-parse --show-toplevel)"
BASE="file:///$(cygpath -m "$ROOT" 2>/dev/null || echo "$ROOT")"
# 프로필 경로는 Windows 형식이어야 한다 (POSIX 경로를 넘기면 Chrome이 멈춘다)
PROFILE="$(cygpath -w "${TMPDIR:-/tmp}/duemate-verify-chrome" 2>/dev/null || echo "${TMPDIR:-/tmp}/duemate-verify-chrome")"

chrome() { timeout 60 "$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" "$@" 2>/dev/null; }

run_tests() {
  local fail=0
  for f in "$ROOT"/js/*.js; do
    node --check "$f" || { echo "SYNTAX ERROR: $f"; fail=1; }
  done
  local dom
  dom="$(chrome --virtual-time-budget=5000 --dump-dom "$BASE/tests.html")"
  local summary
  summary="$(printf '%s' "$dom" | grep -o '<p id="summary"[^<]*' | sed 's/<[^>]*>//')"
  echo "${summary:-테스트 결과를 읽지 못했습니다 (tests.html 로드 실패)}"
  printf '%s' "$dom" | grep -o '<li class="fail">[^<]*' | sed 's/<li class="fail">/FAIL: /'
  printf '%s' "$dom" | grep -q 'data-result="pass"' || fail=1
  return $fail
}

shot() {
  local name="$1" query="$2" height="${3:-1000}"
  local out="$ROOT/docs/images/$name.png"
  chrome --hide-scrollbars --window-size=1440,"$height" --virtual-time-budget=3000 \
    --screenshot="$(cygpath -w "$out" 2>/dev/null || echo "$out")" "$BASE/index.html?$query"
  [ -f "$out" ] && echo "saved docs/images/$name.png" || echo "screenshot failed: $name"
}

case "${1:-test}" in
  test) run_tests ;;
  shot) shot "$2" "$3" "${4:-1000}" ;;
  shots)
    shot v2-today "demo&tab=today&pomo" 1100
    shot v2-tasks "demo&tab=tasks"
    shot v2-calendar "demo&tab=calendar"
    shot v2-analytics "demo&tab=analytics" 1500
    shot v2-grades "demo&tab=analytics&view=grades"
    shot v2-settings "demo&tab=settings" 1500
    ;;
  *) echo "usage: verify.sh test | shot <name> <query> [height] | shots"; exit 2 ;;
esac
