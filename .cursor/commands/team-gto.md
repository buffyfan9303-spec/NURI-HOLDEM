# GTO 팀 착수

NURI SPOT·프리플랍 차트·푸시폴드·계산기 허브·드릴·용어사전

## 1. 먼저 읽어라

- `.cursor/rules/23-team-gto.mdc` — 이 팀의 파일 지도 · 함정 · 검증 명령 **(전부 읽어라, 요약본이 아니다)**
- `AGENTS.md` — 프로젝트 규약(라이브 서비스 · 법규 · 보안 · 기능 보존, 그리고 AI 협업 라우팅)

## 2. 기준선 확인 (읽기 전용)

```bash
git branch --show-current
git rev-parse HEAD
git status -sb
git status --short
```

기존 수정 파일과 미추적 파일은 **전부 사용자 작업**으로 취급한다 — 덮어쓰지 마라.
지금 `e2e/nuri-spot.spec.ts` · `public/sitemap.xml` · `src/lib/ranges.data.ts` ·
`src/lib/spotEvaluate.test.ts` · `src/lib/spotEvaluate.ts` 가 사용자 수정본이다.

**브랜치 생성과 동기화는 사용자가 명시적으로 요청할 때만 실행한다.**
`git pull` · `fetch` 후 병합 · `switch` · `checkout` · `reset` · `restore` · `clean` · `stash` ·
`commit` · `push` 를 자동으로 돌리지 마라. **`main` 에 직접 커밋하지 마라(푸시 = 라이브 배포).**
요청받았을 때 쓸 브랜치 이름: `feat/gto-<한줄요약>`

## 3. 일하는 방식

- **고치기 전에 재라.** 증상을 보고 짐작하지 말고, 값을 실제로 출력해서 원인을 확인한 다음 고친다.
- **근본 원인을 고쳐라.** 함수를 고치기 전에 호출부를 전부 grep 한다 — 티켓이 말한 경로만 패치하면 형제 호출부는 그대로 깨져 있다.
- **기능을 없애지 마라.** 리팩터·리디자인은 자유지만 **운영 중 기능 소실은 되돌릴 수 없다.**
- 새 테스트는 **음성 대조**를 통과해야 한다 — 수정을 되돌리면 실패해야 한다.

## 4. 끝내기

`/verify` → `/ship`. 한도가 찰 것 같으면 그 전에 `/handoff`.

## 이 팀이 혼자 쓰는 파일 밖으로 나갈 때

`src/App.tsx` · `src/index.css` · `src/components/atoms/**` 는 **네 팀 공용**이다.
여기를 고치면 다른 팀 화면이 깨진다 — 홈 팀 규칙(`22-team-home.mdc`)을 같이 읽고, `npm run test:e2e` 를 전량 돌려라.
