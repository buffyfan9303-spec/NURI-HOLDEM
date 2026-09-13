# 전체 게이트 (완료 판정)

`.claude/skills/nuri-ship/SKILL.md` 를 먼저 읽고 그 순서를 따른다. 이 프로젝트에서 "끝"은 아래가 전부 초록일 때만이다.

```bash
npm run lint
```
```bash
npm test
```
```bash
npm run build
```
```bash
npm run test:e2e
```

기준선: lint **0 error**(경고 126은 기존 — 2026-09-12 실측. 대부분 fs 기반 계약 테스트의 `security/*` 오탐이다) ·
vitest 전량 통과 · build 성공(`tsc -b` 가 타입 게이트라 별도 tsc 불필요) · e2e 전량 통과.

## 화면·번들을 건드렸으면 추가

```bash
npm run bundle:budget
```
```bash
npm run legal:check
```

## 보안 (api·supabase·의존성을 건드렸으면)

```bash
npm run secrets
```
```bash
npm audit --omit=dev --audit-level=high
```

## DB 를 건드렸으면

`.claude/skills/nuri-migration/SKILL.md` 를 **먼저** 읽는다. 적용 후 Supabase 어드바이저 **보안 ERROR 0** 확인.
`supabase db push` 는 쓰지 않는다.

## 마지막 확인

- [ ] `git diff` 의 **삭제 줄**을 읽었다 — 리팩터가 조용히 떨어뜨린 기능이 없는지. (전 게이트 초록인데 기능 3건이 소실된 적이 있다)
- [ ] 라벨·이모지를 바꿨다면 같은 커밋에서 e2e 셀렉터를 `data-testid` 로 교체했다.
- [ ] `CLAUDE.md` 와 `AGENTS.md` 의 공통 본문이 여전히 같다.
      PowerShell 의 `diff` 는 `Compare-Object` 별칭이라 파일 비교가 아니다 — 아래를 쓴다:
      `git --no-pager diff --no-index -- CLAUDE.md AGENTS.md`
      **예상되는 차이는 `AGENTS.md` 끝의 `AI 협업 라우팅` 절 하나뿐이다.** 그 밖의 차이는 회귀다.
- [ ] 새 테스트가 음성 대조를 통과했다(수정을 되돌리면 실패한다).

## 커밋·푸시

**`main` 푸시 = Vercel 자동 배포 = 라이브 반영이다.** 사용자가 명시적으로 시키기 전에는 커밋도 푸시도 하지 않는다.

⚠️ 현재 `main` 에 브랜치 보호·룰셋이 없어서 **CI 가 실패한 커밋도 프로덕션에 나간다**(2026-09-07 실사례 2건).
게이트를 사람이 지켜야 하는 상태다.
