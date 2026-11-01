---
name: browser-verify
description: 빌드 도구 없는 정적 웹 앱(DueMate)을 헤드리스 Chrome으로 검증한다. JS 문법 검사, 브라우저 테스트 페이지(tests.html) 실행 결과 수집, 데모 데이터로 각 탭 스크린샷 생성을 한 번에 한다. "테스트 돌려줘", "브라우저에서 확인", "스크린샷 갱신", "README 이미지 다시 찍기", 커밋 전 검증이 필요할 때 사용한다.
---

# 브라우저 검증

DueMate의 실행 환경은 브라우저로 한정된다. Node에서 돌리는 테스트는 `localStorage`, `document`, 오디오 같은 실제 실행 환경과 다르므로, 테스트와 화면 확인을 **실제 Chrome 엔진**으로 한다. 사람이 브라우저를 열어 클릭하지 않아도 되도록 헤드리스 모드를 쓴다.

## 준비물

- Chrome: 기본 경로 `C:/Program Files/Google/Chrome/Application/chrome.exe` (다르면 `CHROME` 환경변수로 지정)
- Node: `node --check` 문법 검사용
- 앱 쪽 훅
  - `tests.html`: 로드되면 테스트를 실행하고 `<body data-result="pass|fail">`와 `#summary`에 결과를 쓴다.
  - `index.html?demo`: 샘플 데이터를 메모리에만 올리는 데모 모드 (사용자 데이터를 건드리지 않음)
  - `index.html?demo&tab=<탭>`: 특정 탭으로 바로 연다. `&pomo`를 붙이면 뽀모도로가 진행 중인 상태로 연다.
  - `&at=15:00`: 데모의 시계를 그 시각으로 옮긴다. 밤에 찍어도 오늘 계획이 비지 않게 README 스크린샷은 이 값으로 찍는다. `&theme=dark`는 다크 모드, `&form`은 과제 추가 화면.

## 사용법

Bash에서 저장소 루트 기준으로 실행한다.

```bash
# 1) 문법 검사 + 테스트
bash .claude/skills/browser-verify/verify.sh test

# 2) 스크린샷 한 장: 이름, 쿼리, (선택) 높이
bash .claude/skills/browser-verify/verify.sh shot pomodoro "demo&tab=pomodoro"

# 3) README용 전체 탭 스크린샷 (docs/images/v2-*.png)
bash .claude/skills/browser-verify/verify.sh shots

# 4) 휴대폰 폭(390px) 확인: 탭 3개를 나란히 한 장으로
bash .claude/skills/browser-verify/verify.sh phone "pomodoro todo settings"
```

- 헤드리스 Chrome은 창 너비를 약 500px보다 줄이지 못한다. `--window-size=400`으로 찍으면 500px로 그린 뒤 잘라 보여 주므로 "가로로 넘친다"고 오판하기 쉽다. 휴대폰 화면은 반드시 `phone`(390px iframe)으로 확인한다.

- `test`는 실패한 테스트 이름과 메시지를 출력하고, 실패가 있으면 종료 코드 1을 돌려준다.
- 스크린샷은 1440px 너비로 찍는다. 찍은 뒤 이미지 파일을 직접 열어 보고 레이아웃이 깨지지 않았는지 확인한다.

## 판단 기준

- 테스트 실패가 하나라도 있으면 커밋하지 않는다.
- 테스트는 통과했는데 스크린샷이 이상하면(겹침, 빈 화면, 잘림) 화면 버그로 보고 고친다.
- 헤드리스 결과가 비어 있으면 스크립트 오류 가능성이 높다. `--enable-logging=stderr --v=0` 출력의 `CONSOLE` 줄을 확인한다.
- 검증에서 찾은 문제와 해결은 `duemate-todo-cycle` 스킬 규칙에 따라 TODO 변경 내역에 남긴다.
