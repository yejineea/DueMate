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

# 휴대폰 폭 확인: 헤드리스 Chrome은 창을 약 500px보다 좁게 만들지 못하므로 390px iframe 3개에 띄워 한 장으로 찍는다
phone() {
  local page="$ROOT/docs/images/_phone.html" out="$ROOT/docs/images/${2:-phone}.png"
  local tabs="${1:-pomodoro todo settings}" frames=""
  for t in $tabs; do frames="$frames<iframe style=\"width:390px;height:840px;border:0\" src=\"$BASE/index.html?demo&amp;tab=$t\"></iframe>"; done
  printf '<!DOCTYPE html><body style="margin:0;display:flex;gap:12px;background:#999;padding:10px">%s</body>' "$frames" > "$page"
  "$CHROME" --headless=new --disable-gpu --no-first-run --allow-file-access-from-files --user-data-dir="$PROFILE-phone" --hide-scrollbars     --window-size=1220,860 --virtual-time-budget=4000 --screenshot="$(cygpath -w "$out" 2>/dev/null || echo "$out")" "$BASE/docs/images/_phone.html" 2>/dev/null
  rm -f "$page"; echo "saved docs/images/${2:-phone}.png"
}

case "${1:-test}" in
  phone) phone "${2:-}" "${3:-phone}" ;;
  test) run_tests ;;
  shot) shot "$2" "$3" "${4:-1000}" ;;
  shots)
    shot v2-pomodoro "demo&tab=pomodoro&pomo" 1300
    shot v2-todo "demo&tab=todo"
    shot v2-calendar "demo&tab=todo&view=calendar"
    shot v2-report "demo&tab=report" 1500
    shot v2-grades "demo&tab=report&view=grades"
    shot v2-settings "demo&tab=settings" 1300
    ;;
  *) echo "usage: verify.sh test | shot <name> <query> [height] | shots | phone ["tab tab tab"] [name]"; exit 2 ;;
esac
