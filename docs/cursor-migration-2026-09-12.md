# Cursor 이전 + Claude Max 2계정 운영 (2026-09-12)

## 0. 먼저 알아야 할 것 — 이게 설계를 결정한다

**Cursor 자체 에이전트(Composer/Agent)는 Claude Max 구독을 쓸 수 없다.**

2026년 1월부터 Anthropic 이 소비자 구독(Pro·Max)의 OAuth 토큰을 통한 자동화 도구 접근을 차단했다.
Cursor 의 BYOK 는 **API 키(종량 과금)만** 받는다 — 구독은 못 꽂는다.

그래서 Max 20x 2개를 쓰려면 경로는 하나다:

```
Cursor (에디터)  ─┬─ Cursor 자체 에이전트  → Cursor 요금제 (Max 구독과 무관)
                  └─ Claude Code          → 여기가 Max 구독을 쓴다  ★
```

Claude Code 를 Cursor 안에서 쓰는 방법은 두 가지고, **둘 다 같은 Max 계정으로 로그인한다**:

| | 설치 | 장점 | 단점 |
|---|---|---|---|
| **확장(추천)** | `cursor:extension/anthropic.claude-code` 또는 확장 탭에서 "Claude Code" 검색 | 인라인 diff·플랜 검토·@멘션·체크포인트(되감기)·탭 여러 개 | CLI 전용 기능 일부 없음 |
| **CLI** | 통합 터미널에서 `claude` | 훅·스킬·서브에이전트 전부 동작. **계정 전환이 쉽다** ★ | 터미널 UI |

> 확장을 깔아도 `claude` 가 PATH 에 들어가지 않는다. 확장은 자기 채팅 패널용 CLI 사본을 따로 들고 있다.
> 터미널에서 `claude` 를 쓰려면 CLI 를 별도로 설치해야 한다.

**결론: 계정 로테이션이 목적이라면 CLI 를 주력으로 써라.** 아래 2번이 그 방법이다.

---

## 1. 설치 순서

```bash
winget install --id Anthropic.Cursor -e
```

```bash
npm install -g @anthropic-ai/claude-code
```

Cursor 에서 프로젝트 폴더를 연다:

```bash
cursor "C:\Users\buffy\OneDrive\바탕 화면\누리홀덤"
```

Cursor 확장 탭(`Ctrl+Shift+X`)에서 **Claude Code** 검색 → 설치 → 창 다시 로드.

---

## 2. Max 2계정 로테이션 ★

Claude Code 는 설정·세션 기록·로그인 토큰을 **`CLAUDE_CONFIG_DIR`** 이 가리키는 폴더에 넣는다
(기본값 `%USERPROFILE%\.claude`). 이 값만 바꾸면 **두 계정이 각자 로그인 상태를 유지한 채 공존**한다.
매번 로그아웃/로그인 할 필요가 없다.

### 최초 1회 — 계정 두 개를 각각 로그인

PowerShell 터미널에서:

```powershell
$env:CLAUDE_CONFIG_DIR="$env:USERPROFILE\.claude-a"; claude
```

`/login` 으로 **A 계정** 로그인 → 종료.

```powershell
$env:CLAUDE_CONFIG_DIR="$env:USERPROFILE\.claude-b"; claude
```

`/login` 으로 **B 계정** 로그인 → 종료.

### 이후 — 쓰고 싶은 계정으로 시작

```powershell
$env:CLAUDE_CONFIG_DIR="$env:USERPROFILE\.claude-a"; claude
```

```powershell
$env:CLAUDE_CONFIG_DIR="$env:USERPROFILE\.claude-b"; claude
```

### 매번 치기 귀찮으면 — PowerShell 프로필에 등록

```powershell
notepad $PROFILE
```

아래를 붙여넣고 저장, 터미널 새로 열기:

```powershell
function cca { $env:CLAUDE_CONFIG_DIR="$env:USERPROFILE\.claude-a"; claude @args }
function ccb { $env:CLAUDE_CONFIG_DIR="$env:USERPROFILE\.claude-b"; claude @args }
function ccwho { if ($env:CLAUDE_CONFIG_DIR) { Split-Path $env:CLAUDE_CONFIG_DIR -Leaf } else { "기본(.claude)" } }
```

이제 `cca` / `ccb` 로 계정을 고르고, `ccwho` 로 지금 어느 쪽인지 확인한다.

### 한도가 찼을 때 넘기는 순서

1. 현재 세션에서 `/handoff` 를 돌린다 → `docs/handoff/` 에 인수인계 파일이 생긴다.
2. 세션 종료.
3. 다른 계정으로 시작(`ccb`).
4. 첫 메시지: `docs/handoff/<그 파일> 을 읽고 이어서 해줘.`

**중요한 것들**

- 두 계정은 **각자의 한도**를 가진다. 계정별로 정상 사용하는 것이고, 로그인 정보를 남과 공유하는 것과는 다르다.
- `.claude-a` / `.claude-b` 에는 **로그인 토큰이 들어 있다.** 저장소 밖(`%USERPROFILE%`)에 두고 절대 커밋하지 마라.
- 세션 기록도 폴더별로 갈린다 — A 에서 하던 대화는 B 의 `--resume` 목록에 안 보인다. 그래서 `/handoff` 가 필요하다.
- 프로젝트의 `.claude/settings.json`·`.claude/skills/`·`.cursor/` 는 **저장소 안**이라 두 계정이 똑같이 공유한다. 이 부분은 아무것도 안 해도 된다.

---

## 3. 팀으로 나눠 일하기

만든 팀은 넷이다. 각 팀은 **규칙 파일(자동)** + **슬래시 명령(수동)** 한 쌍이다.

| 팀 | 소집 | 자동으로 붙는 규칙 | 범위 |
|---|---|---|---|
| 커뮤니티 | `/team-community` | `.cursor/rules/20-team-community.mdc` | 게시판·댓글·외치기·신고→제재·승격 광고·그룹/딜러·스팟 공유 |
| 내 매장 | `/team-store` | `21-team-store.mdc` | 대시보드·포스터→장부→클락→순위→정산·직원/급여·이용권·고객·설정 |
| 홈(셸) | `/team-home` | `22-team-home.mdc` | App.tsx·탭 구조·홈·캘린더·라이브·장터·검색·알림·로그인·법적 고지 |
| GTO | `/team-gto` | `23-team-gto.mdc` | NURI SPOT·프리플랍 차트·푸시폴드·계산기 허브·드릴 |

**규칙은 자동, 명령은 수동.** `globs` 에 걸리는 파일을 열면 그 팀 지식이 알아서 붙는다.
`/team-gto` 같은 명령은 "이제 이 팀 일을 시작한다"고 선언하는 것 — 읽을 문서·브랜치·작업 방식을 한 번에 세팅한다.

### 왜 팀으로 나누는 게 한도에 도움이 되나

팀별로 창을 나누면 **GTO 세션이 매장 장부 코드를 읽지 않는다.** 지금 `21-team-store.mdc` 하나가 28KB 다 —
네 팀 지식을 한 세션에 다 올리면 그것만으로 컨텍스트가 찬다. 팀 분리는 조직도가 아니라 **토큰 절약 장치**다.

### 두 계정으로 동시에 일하기 — worktree

같은 폴더를 두 세션이 동시에 편집하면 서로 덮어쓴다(이 프로젝트에서 실제로 났던 문제다).
팀별로 **git worktree** 를 따로 두면 폴더가 갈려서 충돌하지 않는다.

```bash
git worktree add ../누리-gto -b feat/gto-작업명
```

```bash
git worktree add ../누리-store -b feat/store-작업명
```

그 다음 Cursor 창을 두 개 열고(`파일 > 새 창`), 각 창에서 각 폴더를 연다.
한 창은 `cca`, 다른 창은 `ccb` 로 돌리면 **두 계정이 동시에, 서로 안 부딪히며** 일한다.

정리는:

```bash
git worktree remove ../누리-gto
```

---

## 4. Cursor 에서 그대로 되는 것 / 안 되는 것

| 기존 자산 | Cursor | 비고 |
|---|---|---|
| `CLAUDE.md` | ❌ 안 읽음 | Cursor 는 `AGENTS.md` 를 읽는다 — **이미 있다**(같은 내용) |
| `AGENTS.md` | ✅ 자동 | 프로젝트 규약 전체가 항상 붙는다 |
| `.claude/skills/` (nuri-ship·nuri-migration·security-audit) | ✅ 자동 | Cursor 가 레거시 호환으로 `.claude/skills/` 를 읽는다. **아무것도 안 해도 `/nuri-ship` 이 뜬다** |
| `.agents/skills/` (사본) | ✅ 자동 | Cursor 정식 경로. 이미 있다 |
| `.claude/settings.json` 의 `permissions.deny` | ❌ | Cursor 는 별도 체계. `.env`·`*.pem` 읽기 차단은 Cursor 에선 안 걸린다 |
| `.claude/hooks/nuri-guard.mjs` | ❌ | Cursor 훅은 `.cursor/hooks.json` + 다른 페이로드. **포팅 안 함** — 내용은 `30-traps.mdc` 로 옮겼다(그쪽이 더 확실히 읽힌다) |
| `.claude/launch.json` (dev 5173) | ❌ | Cursor 는 `npm run dev` 를 직접 실행 |
| `.githooks/pre-commit` (secretlint) | ✅ | git 훅이라 에디터와 무관 |
| `npm run *` 게이트 전부 | ✅ | 그대로 |
| Claude Code CLI/확장을 Cursor 안에서 | ✅ | 위 스킬·훅·settings 전부 **원래대로** 동작 |

> 즉 **Cursor 에이전트로 일하면** 스킬·규약은 되지만 훅·permissions 는 안 걸리고,
> **Cursor 안의 Claude Code 로 일하면** 전부 원래대로 된다. Max 구독을 쓰는 것도 후자다.

---

## 5. 이번에 새로 만든 파일

```
.cursor/rules/10-security.mdc          보안 코딩 표준 (api·supabase·sql 열면 자동)
.cursor/rules/20-team-community.mdc    커뮤니티 팀 — 실측·검증 완료
.cursor/rules/21-team-store.mdc        내 매장 팀 — 실측·검증 완료
.cursor/rules/22-team-home.mdc         홈 팀 — 부분 실측 (전수는 한도로 중단)
.cursor/rules/23-team-gto.mdc          GTO 팀 — 부분 실측 (전수는 한도로 중단)
.cursor/rules/30-traps.mdc             실제로 났던 버그의 재현 조건 (src/·e2e 열면 자동)

.cursor/commands/verify.md             빠른 검증
.cursor/commands/ship.md               전체 게이트 = 완료 판정
.cursor/commands/handoff.md            계정 전환 전 인수인계  ★ 한도 찼을 때 이것부터
.cursor/commands/remap.md              팀 지도 다시 뜨기
.cursor/commands/team-{community,store,home,gto}.md   팀 착수

docs/nuri-status-2026-09-12.md         진행상황 정본 (실측)
docs/cursor-migration-2026-09-12.md    이 문서
```

**`20-team-community.mdc` 와 `21-team-store.mdc` 는 별도 에이전트가 경로·행번호를 전부 재대조했다**
(커뮤니티는 근거 없는 주장 2건 삭제 + 행번호 8곳 교정, 매장도 2건 삭제).
**홈·GTO 는 주간 한도에 걸려 전수 실측을 못 했다** — 문서 안에 `[실측]`/`[보고 — 미검증]` 으로 표시해 뒀고,
해당 팀 첫 작업 때 `/remap` 을 돌리면 채워진다.

---

## 6. 처음 열었을 때 할 일 (순서대로)

```bash
git pull --ff-only
```

> ⚠️ 로컬이 `origin/main` 보다 **9커밋 뒤**다(2026-09-11~12분 23파일 +1716/-928 + 마이그레이션 `20260911p`).
> 미커밋 변경 5파일(NURI SPOT 차트 조회 수정)이 있으니 pull 후 충돌을 확인해라.

그 다음 Cursor 에서 이 순서로 읽힌다:

1. `docs/nuri-status-2026-09-12.md` — 지금 상태
2. `AGENTS.md` — 규약(자동으로 붙음)
3. 일할 팀의 `/team-*` 명령

### 첫 메시지 예시

```
docs/nuri-status-2026-09-12.md 읽고 현재 상태 확인해줘. 그 다음 /team-gto 로 시작.
```
