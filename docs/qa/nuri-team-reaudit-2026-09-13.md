# NURI HOLDEM 재점검 대조표 — 2026-09-13

실행문: `홀덤 캘린더/outputs/NURI_스킬_커넥터_모델라우팅_에이전트팀_통합실행_2026-09-13.md` (578줄)
이 문서는 **그 실행문의 D절이 요구한 정본 기록**이다. 완료 보고가 아니라 **진행 중인 대조표**다.

> **빈 칸을 성공으로 간주하지 않는다.** `NOT_RUN` 은 "돌리지 않았다" 이지 "통과" 가 아니다.
> 운영 DB·배포·실제 이용권 처리는 이 세션에서 **하지 않았다**(커밋 0 · 푸시 0 · 배포 0 · 운영 DB 쓰기 0).

---

## 0. 환경 — 실측 (2026-09-13 09:4x KST)

| 항목 | 실측값 | 비고 |
|---|---|---|
| Git 루트 | `C:\Users\buffy\OneDrive\바탕 화면\누리홀덤` | 폴더명이 비슷한 `홀덤 캘린더` 는 **문서 폴더**이지 앱이 아니다 |
| 브랜치 · HEAD | `main` · `e008b02` | `origin/main` 보다 **9 뒤** — **pull 하지 않았다**(지시된 금지) |
| 변경 파일 | 237개 (전부 이전·이번 세션 작업, 커밋 안 함) | 기존 diff·작성자 보존 |
| `CLAUDE_CONFIG_DIR` | `C:\Users\buffy\.claude-b` | ⚠ 실행문 A절이 지정한 **`.claude-max-new` 가 아니다** |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | `1` (켜짐) | 프로젝트 `.claude/settings.json` `env` 와 일치 |
| `teammateMode` | `in-process` | 프로젝트 설정 |
| 활성 플러그인 | **41개** (`.claude`·`.claude-b` 양쪽 동일) | 유저 스코프 → 전 프로젝트 적용 |
| MCP 커넥터 | **10종 Connected** — Context7·Playwright·Supabase·Vercel·Mobbin·Shutterstock·Base44·Google Drive·Calendar·Gmail | Connected 는 **서버 응답 확인**이지 작업 성공 증거가 아니다 |
| 프로젝트 스킬 | **11종** | 아래 §2 |

### 보호 파일 (사용자 작업물 — 읽기만)
`e2e/nuri-spot.spec.ts` · `public/sitemap.xml` · `src/lib/ranges.data.ts` · `src/lib/spotEvaluate.test.ts` · `src/lib/spotEvaluate.ts`
`git hash-object public/sitemap.xml` = `6130e0858d79ea6e6af979cc17e58d3f0eb2c80f` — **세션 시작·현재 동일**.

⚠ `npm run build` 는 `scripts/gen-sitemap.mjs` 를 돌려 이 파일을 **다시 쓴다**(2026-09-13 실제로 발동 — UTC 날짜가
넘어가며 `lastmod` 가 바뀌었다). 백업→복원 절차로 기준 해시를 지켰다. 절차는 `.claude/skills/nuri-e2e/SKILL.md`.

---

## 1. 팀·모델 검증 기록 (실행문 준비 1 요구 형식)

### 판정: **"네이티브 팀" 라벨은 붙이지 않는다.** 협업 능력 자체는 실증됐다.

| 능력 | 결과 | 증거(도구 반환값 원문) |
|---|---|---|
| 리드 → 에이전트 직접 메시지 | ✅ | 이 세션 **3회 성공** — 전부 재개·응답 |
| 에이전트 ↔ 형제 에이전트 **양방향 왕복** | ✅ | 보냄 `{"success":true,"message":"Message queued for delivery to …"}` → 수신(`from` 확인) → 답장 → **발신자가 `PONG-B2 …` 실제 수신** |
| 에이전트의 `ListAgents` | ❌ **없음** | `No matching deferred tools found`(두 에이전트 × 서로 다른 질의 3회) — **팀원이 서로를 발견할 수 없다** |
| 리드의 `ListAgents` 묶음 라벨 | `Subagents` | `Teammates` 가 아니다 |
| 공유 Task·작업 소유권 UI | **미확인** | — |

→ 준비 2-4 의 실질(*"리드에게만 보고하고 끝내지 않는다"*)은 **리드가 상대 agentId 를 명시**하면 충족된다.
그 방식으로 작업하되 **라벨을 바꿔 부르지 않는다**(실행문 요구 12).

⚠ `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 과 `teammateMode` 가 **이미 켜져 있으므로 A절을 재실행해도 같은 결과일 수 있다.**
차이는 프로필(`.claude-max-new`)과 `--teammate-mode` 를 CLI 플래그로 주는 것뿐이다. → **사용자 판단 필요.**

### 모델 — 요청 vs 실제 (에이전트 자기 주장이 아니라 **시스템 프롬프트 원문 인용**)

| 요청 | 역할 | 런타임 관찰(원문) | effort | 프로필 |
|---|---|---|---|---|
| `fable` | critical-reviewer · store-team | "You are powered by the model named Fable 5.1. The exact model ID is **claude-fable-5-1**." | **미확인** | `.claude-b` |
| `sonnet` | verifier ×2 | "...named Sonnet 5. The exact model ID is **claude-sonnet-5**." | **미확인** | `.claude-b` |
| `haiku` | capability-steward ×2 | `claude-haiku-4-5-20251001` | **미확인** | `.claude-b` |
| `opus` | nuri-lead(이 세션) | Opus 5 (1M context) / `claude-opus-5[1m]` | **미확인** | `.claude-b` |

⚠ **낮은 모델 신뢰도 — 실물 기록.** `haiku` 에이전트 2개가 사실 오류 2건을 냈다:
`.claude/rules/nuri-team-capabilities.md` → "없음"(**실제 존재**, 2,692 B) · `.claude/agents/nuri-lead.md` → "미존재"(**실제 존재**).
→ **haiku 보고는 전부 재확인하고 판정 근거로 쓰지 않는다.**

---

## 2. 도구·스킬 적용 표 (실행문 준비 4 요구 형식)

| 도구/스킬 | 출처·버전 | 프로필·범위 | 상태 | 요구 ID | 적용/생략 이유 | 실제 명령·종료 코드 | 미검증 |
|---|---|---|---|---|---|---|---|
| `nuri-affect` | 프로젝트(이번 신설) | 프로젝트 + 유저 스코프 사본 | 활성 | P02 | PostgREST 0행·오류 계약 | 구현자·검증자 모두 읽음 | 런타임 도달은 mock 까지 |
| `nuri-async-guard` | 프로젝트(이번 신설) | 프로젝트 + 사본 | 활성 | P02·S02 | 늦은 응답·오류 원문 노출 | 〃 | 실화면 재현 없음 |
| `nuri-verify` | 프로젝트(이번 신설) | 프로젝트 + 사본 | 활성 | 전역 | 음성 대조 절차·검증자 브리핑(§7) | NC 5종 실행 | — |
| `nuri-edit` | 프로젝트(이번 신설) | 프로젝트 + 사본 | 활성 | 전역 | 줄끝·앵커·원자적 쓰기 | 줄끝 실측 유지 확인 | BOM·혼합 줄끝 |
| `nuri-single-source` · `nuri-time` | 프로젝트(이번 신설) | 프로젝트 + 사본 | 활성 | (이전 작업) | 복제 통합 · KST 축 | — | 이름 바꾼 복제 |
| `nuri-e2e` | 프로젝트(이번 신설) | **프로젝트 전용** | 활성 | 전역 | 보호 파일 안 덮는 E2E 절차 | 전체 E2E 1회 | — |
| `nuri-ship` · `security-audit` | 프로젝트(갱신) | **프로젝트 전용** | 활성 | 전역 | 게이트 실행 · 보안 | 게이트 4종 | semgrep·gitleaks 로컬 미실행 |
| `nuri-migration` | 프로젝트(갱신) | 프로젝트 + 사본 | 활성 | (초안 2건) | 라이브 DB 안전 절차 | 격리 컨테이너 검증 | **운영 미적용** |
| `nuri-capability-gate` | 사용자 추가(09:00) | 프로젝트 + 사본 | 활성 | 준비 3 | 실행문 작성 규칙 | — | — |
| 플러그인 41종 | `claude-plugins-official` 39 + `taste-skill` + `ponytail` | 유저(양 프로필) | 활성 | — | 이 세션 프로필이 **빈 상태**였다 | `claude plugin list` 41 | 각 커넥터 실작업 |
| Playwright MCP · Context7 | 기존 등록 | 유저 | Connected | — | 브라우저 검증·공식 문서 | `claude mcp list` | 실제 캡처 **NOT_RUN** |

---

## 3. 요구 대조표

판정 구분: `수정 후 검증` · `기존 정상 확인·수정 생략` · `재현 안 됨` · `운영 검증 필요` · `권한/외부 의존 차단` · `지원 범위 밖` · `미착수`

### E-1 — 직원별 권한 (최우선)

| 요구 ID | 재현·원인 | 변경 파일 | 구현자·관찰 모델 | 독립 검증자·관찰 모델 | 환경·명령·종료 코드 | 판정 | 증거·잔여 위험 |
|---|---|---|---|---|---|---|---|
| **P02** | 🔴 **전제 정정됨** — 원래 적었던 "RLS 거부(42501)에서 `[]`" 는 **서버가 만들 수 없는 조건**이다. `get_voucher_access_user_ids` 는 인가를 **WHERE 절**(`and can_manage_pos(p_venue_id)`)로 표현해 비인가 호출자에게 **`200 + 0행`**(error=null)을 준다. `ledger_access` 의 RLS `la_select` 도 오류가 아니라 **자기 행만** 준다. 따라서 `if (error) throw error` 가 실제로 잡는 것은 **네트워크·JWT 만료·5xx 뿐**이고, 인가 경로의 "확인 실패가 권한 없음으로 위장" 은 **그대로 남아 있다** | `api/ledger.ts` · `api/vouchers.ts` · **신설** `lib/staffAccess.ts`(+테스트 2) · `VenueManageTab.tsx` · `NuriPosLedger.tsx` · **신설** `StaffAccessState.contract.test.ts` | store-team / **claude-fable-5-1** | 4명 독립 — 인가우회 `claude-opus-5` 🔴**FAIL** · 기능소실 `claude-opus-5` ⚠PASS_WITH_CONCERNS · 음성대조 `claude-sonnet-5` ✅PASS · 서버인가 `claude-fable-5-1` ⚠PASS_WITH_CONCERNS | `tsc -b` 0 · lint 오류 0 · `vitest` 162 files / 1892 tests · NC용 25건 exit 0 | 🔴 **FAIL — 재작업 필요** | 음성 대조는 **진짜였다**(N1~N5 전부 해당 테스트만 적색, `cmp`+`sha256` 바이트 동일, `git status` 238→238). 다만 **보고 있는 조건이 틀렸다** — `staffAccess.errorPropagation.test.ts` 가 `rpcError: RLS_DENIED` 를 목킹한다. 서버 인가는 **별도로 존재**한다(부여/회수 RPC 4개 전부 `if not can_manage_pos(...) then raise`) — 클라이언트 게이트가 유일한 벽은 아니다 |
| P01 | — | — | — | — | — | **미착수** | 직원 관리 토글 2종이 이미 존재. 권한 묶음이 과도한지 대조 필요 |
| P03 | — | — | — | — | — | **미착수** | 비관리자 `?tab=admin`·새로고침·인증 지연에서 보호 컴포넌트 실행 여부 |
| P04 | — | — | — | — | — | **미착수** | 승인 공동 운영자가 `role=user` 여도 진입 가능한지 / 소속 없는 업주 role 차단 |
| P05 | — | — | — | — | — | **미착수** | `ledgerOk`·`manageOk`·`voucherView`·`staffOk`·`canPosters` 판정 일관성 |
| P06 | — | — | — | — | — | **미착수** | `can_manage_venue_staff` vs `manage_staff`·`set_staff_title` 서버 범위 대조 |
| P07 | — | — | — | — | — | **미착수** | grant RPC 의 **대상 회원 소속 검증** 유무 — 없으면 보완 |
| 권한 행렬 13행 | — | — | — | — | — | **미착수** | E-1 §권한 행렬 각 행에 정상/수정/운영확인 판정 필요 |

### E · F · G · H · I · J-1 — 미착수

| 절 | 요구 ID | 판정 |
|---|---|---|
| E 관리자 | A01 · A02 · A03 | **미착수** |
| F 내 매장·이용권·클락 | S01 · S02 · S03 · S04 | **미착수** |
| G GTO·스팟 | G01 ~ G06 | **미착수** |
| H 커뮤니티 | C01 ~ C06 | **미착수** |
| I 아이콘 | 전량 점검 | **미착수** |
| J-1 신규 | U01 글 복구 · U04 이용권 내역 · U09 정보 신뢰 · U06 관심 매장 알림 | **미착수** |
| J 화면·한국어·반응형 | 7개 뷰포트 × 다크/라이트 | **미착수** |

---

## 4. 게이트 실측 (실행문 K절)

| 게이트 | 명령 | 결과 |
|---|---|---|
| 타입 | `npx tsc -b` | **exit 0** |
| 린트 | `npm run lint` | **0 error** / 223 warning(전부 기존 `security/detect-*` 오탐) |
| 단위 | `npx vitest run` | **162 files / 1892 tests 전부 통과** (세션 시작 154/1812) |
| 빌드 | `npm run build` | **exit 0** |
| 번들 | `npm run bundle:budget` | **통과** — ⚠ 첫 화면 임계 경로 **256/256 KB gz = 여유 0%** |
| 법적 문서 | `npm run legal:check` | **exit 0** — 5개 문서가 TSX 원문과 일치. ⚠ **CI 에 이 스텝이 없다** |
| E2E | `E2E_BASE_URL=… npx playwright test --retries=2` | **463 passed / 1 failed / 1 flaky / 26 skipped** |
| E2E boot | `test:e2e:boot` | **NOT_RUN** (직렬 규칙 — 별도 실행 필요) |
| 변이 테스트 | `npm run test:mutation` | **NOT_RUN** — 소스를 덮어써서 이 세션에서 돌리지 않았다 |
| semgrep · gitleaks | CI 전용 | **NOT_RUN** — 윈도우 로컬 미지원 |

**E2E 유일 실패**: `auth-smoke.spec.ts:93` — `community_ads_public` RPC **404**. 원인은 `BLOCKED.md #20`(운영 DB 미적용).
**flaky**: `home-flow-fit.spec.ts:336`(배너 양방향 랩) — 단독 2회 통과, 재시도로 초록. **"flaky 0" 이라고 적으면 안 된다.**

---

## 5. 오너 결정·운영 권한이 필요한 것 (내가 끝낼 수 없음)

| 항목 | 증상 | 필요한 한 가지 행동 |
|---|---|---|
| `BLOCKED.md` **#20** | 운영 DB 에 마이그레이션 **12개 미적용** → `community_ads_public` 404 → `auth-smoke` 실패, 이벤트 메뉴 미노출 | 오너가 적용 승인 |
| `20260913a` 초안 | 관리자 가드 NULL-safe. 격리 컨테이너 검증 완료, **미적용** | 적용 전 **`select version();`**(PG15+ 필요) + **미리보기 블록만** 먼저 실행 |
| `20260913b` 초안 | `post_spots.analysis` 공개 GRANT 제외. 클라이언트 선반영 완료 | **앱 배포 뒤** 적용(반대 순서면 구버전 앱에서 스팟 카드가 사라진다) |
| 프로필 선택 | 실행문 A절은 `.claude-max-new`, 현재는 `.claude-b` | 사용자가 어느 프로필로 갈지 결정 |

---

## 6. 갱신 규칙

- 요구 ID 하나가 끝날 때마다 이 표의 해당 행을 **구현자·검증자·관찰 모델·종료 코드·증거**까지 채운다.
- **빈 칸은 성공이 아니다.** 돌리지 않았으면 `NOT_RUN`, 막혔으면 `권한/외부 의존 차단`.
- 상세 경위는 `.claude/handoff/current.md` 에 시간순으로 남아 있다. 이 문서는 **요구 ID 기준 대조표**다.

### P02 독립 검증 상세 — 2026-09-13 10:4x KST · 🔴 FAIL

구현자(fable)의 완료 보고를 **그대로 승인하지 않았다**. 서로 겹치지 않는 4각도를 붙였고, 그중 **3명이 같은 구멍**을 독립적으로 지목했다.

#### 🔴 high — 고치겠다고 선언한 것을 구조적으로 못 고친다
```sql
-- supabase/baseline/2026-07-20-live-snapshot.sql:2593
select va.user_id from public.voucher_access va
where va.venue_id = p_venue_id and can_manage_pos(p_venue_id);
```
인가가 **WHERE 절**이다 → 조건 불만족은 예외가 아니라 **빈 결과**다. `error === null` 이라
`setVouch({status:'ready', ids:[]})` 가 되고, 모든 직원이 `ungranted` 로 떨어지며
`canToggleAccess('ungranted') === true` 라 **버튼이 살아 있다**. 누르면 grant 가 그대로 나간다 —
P02 가 막겠다고 선언한 바로 그 동작이다. 새로 만든 5상태 중 `failed` 는 **네트워크 오류로만 도달**한다.

같은 부류가 장부 쪽에도 있다: `la_select` 가 `can_manage_pos(venue_id) OR user_id = auth.uid()` 라
장부권한 직원에게 **자기 행 1개**만 준다 → `NuriPosLedger` 의 "담당 직원 후보가 조용히 빈다"가
**배너 없이 그대로 재현**된다. `ready` 로 온 **부분 결과**는 이 설계가 구분하지 못하는 **여섯 번째 상태**다.

#### 🔴 medium — 새 보안 결함 (CLAUDE.md 보안 표준 6 위반)
`src/api/vouchers.ts:394` 의 `throw new Error(error.message)` 가 **code 를 버린다** →
`src/lib/dbError.ts:54-58` 의 `isInternalSqlState` 가 `code.length !== 5` 로 즉시 false →
내부 SQLSTATE 필터 무력화 → FK 위반 원문
`insert or update on table "voucher_access" violates foreign key constraint "voucher_access_user_id_fkey"`
가 토스트에 그대로 그려진다. **바로 옆 장부 버튼은 `throw error` 라 code 가 살아 번역된다 — 두 버튼이 다르게 샌다.**

#### 그 밖에 확정된 것
| 심각도 | 내용 |
|---|---|
| medium | 부여·회수에 **감사 기록이 전혀 없다**(트리거 0·로그 insert 0·`ledger_access` 에 `created_at` 조차 없음). 이용권 보유자 **실명 열람권**의 변경 이력이 사후 추적 불가 |
| medium | `grant_voucher_access`·`revoke_voucher_access`·`get_voucher_access_user_ids` 가 **어떤 REVOKE 목록에도 없다** → PUBLIC 기본 EXECUTE 잔존. 지금은 `can_manage_pos` 의 `coalesce` **한 겹**만 막는다 |
| low | `accessLoadFailedMsg` 가 42501/403 만 가르는데 실제로 나는 건 **PGRST301(세션 만료)**·PGRST202·네트워크다. PGRST301 은 "다시 시도"로 **영원히 성공하지 않는다**(재로그인이 답) |
| low | 이용권 킬스위치가 꺼져 **버튼이 렌더되지도 않는데** 조회 실패 배너만 뜬다 |
| low | 낙관적 되돌림이 effect 한 바퀴 뒤 → 저장 실패 직후 **한 커밋 동안** '권한 ✓' 가 활성으로 남는다 |
| low | 두 조회가 **서로 다른 사유**로 실패하면 배너가 OR 로 뭉개 **한쪽 처방만** 말한다 |
| low | **P02 diff 가 P02 단독이 아니다** — 같은 미커밋 덩어리에 C04·C05·C06·mustAffect 7곳·V04/V06/V07 이 섞여 **되돌리기 단위가 없다** |

#### ✅ 결함 없음으로 확인된 것 (재작업 시 건드리지 말 것)
- 호출부 3곳 전부 `.catch()` 보유 → unhandled rejection 없음
- 5개 effect 전부 `let alive` + cleanup + deps 에 `venueId` → **매장 A→B 늦은 응답 덮어쓰기 없음**
- `accessViewOf` 5상태 × changing 6조합 전부 정의됨 — 전이표에 구멍 없음
- 배너·상수는 고정 문장 — **서버 원문 미노출**(보안 표준 6 통과). 새는 건 토글 실패 **토스트** 쪽뿐
- 서버 인가 존재: 부여/회수 RPC 4개 전부 SECURITY DEFINER + 첫 줄 `if not can_manage_pos(...) then raise`

#### 미검증 (PASS 로 세지 않는다)
- **운영 DB 미조회** — 전부 `baseline` + `migrations` 정적 독해다. BLOCKED #20 이 '미적용 12건' 을 적고 있어 라이브 정의는 다를 수 있다
- high 판정은 격리 컨테이너(postgres:16)에서 **비인가 롤로 두 조회를 실행해 `0행 200 vs 42501` 을 실측**해야 확정된다
- 실브라우저·E2E 미실행 — 낙관적 잔상·배너 노출은 정적 추론이다
- 계정 전환(로그아웃→다른 로그인) 시 두 조회 무효화 여부 미확인(두 effect 의 deps 에 `user`/`uid` 가 없다)

---

# 2026-09-13 오후 — UI 실행문 + 전 도메인 점검

정본: `홀덤 캘린더/outputs/NURI_공지_게시글_보기전환_랭킹전체_필수수정_Cursor_2026-09-13.md`
형식은 그 문서 §10 이 지정한 `요구 ID / 재현·원인 / 변경 파일 / 구현자·관찰 모델 / 독립 검증자 / 명령·종료코드 / 판정 / 증거` 다.
**빈 칸을 성공으로 세지 않는다.** 미착수는 `미착수`, 안 돌린 것은 `NOT_RUN`.

## UI-01~08

| ID | 재현·원인 | 변경 파일 | 구현자(관찰 모델) | 독립 검증자 | 명령·종료코드 | 판정 | 증거 |
|---|---|---|---|---|---|---|---|
| UI-01 공지 가독성 | 구조 확인: `NoticeDetailModal.tsx:52` 가 `whitespace-pre-wrap` **단일 `<p>`**, `leading-[1.75]` 이미 적용 → 줄높이가 아니라 **문단·번호 간격**이 문제 | — | — | — | — | **미착수** | 소스 확인만 |
| UI-02 게시글 전체화면 | `PostDetailModal.tsx:428` 이 `variant="sheet"` + `density="compact"` — 문서가 요구한 `variant="page"` 아님 | — | — | — | — | **미착수** | 소스 확인만 |
| UI-03 아우라 구분선 | 미조사 | — | — | — | — | **미착수** | — |
| UI-04 이전/다음 글 | **기능 자체가 없다**(저장소 전체 grep 0건). 여는 곳 둘: `App.tsx:3876`(모바일) · `CommunityTab.tsx:417`(PC 인라인). 선례: `PostDetailModal.tsx:211` 주석 — PC 2-pane 이 **이미 재마운트 없이 글만 교체**한다 | — | — | — | — | **미착수** | 소스 확인만 |
| UI-05 보기 전환 | `CommunityTab.tsx:797` 부모 `h-8+border+p-0.5` / 자식 `h-7 w-7` → 클릭영역 **28×28**(문서 목표 44 미달), 아이콘 **15px**(목표 17~19) | — | — | — | — | **미착수** | 소스 확인만 |
| **UI-06 랭킹 진입 튐** | **재현 확정**(390×844, 조건마다 새 로드): 40→**40px** · 56→**56px** · 80(정착67)→**67px** · 200(정착187)→**187px** 위로 이동. 원인 ①`CommunityTab` 첫 방문 `?? 0` 강제 ②헤더 히스테리시스가 y=0 에서 풀려 `47.75→60.5` | `src/lib/headerShrink.ts`(신규) · `App.tsx` · `CommunityTab.tsx` · `e2e/rank-scroll-slots.spec.ts`(신규) · `headerShrink.test.ts`(신규) | community-team / **claude-fable-5-1** | critical-reviewer / **claude-fable-5-1** | 수정 전 `6 failed/5 passed` exit 1 → 수정 후 **11 passed** exit 0(3회) · 회귀 21/21 · `tsc` 0 · `eslint` 0 | ⚠ **PASS_WITH_CONCERNS** | 아래 상세 |
| **UI-07 6메뉴 중앙** | **재현 확정**(390px): 레일 clientW 356 / scrollW **426**(70px 넘침) · 버튼 폭 72.5/55.3/**85.2**/72.5/72.5/**42.5** 최대-최소 **42.73px** · '상점' 중심 419.6 인데 레일 끝 373 → **화면 밖**. 원인: 버튼 `shrink-0` 라 폭이 라벨 글자수를 따름 | `TierLeaderboard.tsx` | 〃 | 〃 | 〃 | ⚠ **PASS_WITH_CONCERNS** | 320~1440 등폭 오차 **≤0.01px** |
| UI-08 랭킹 6화면 | 조사 완료·수정 미착수 — 실패를 "없음"으로 그리는 곳 **9곳** + **계정 경계 1건** | — | — | — | — | **미착수** | 아래 |

### UI-06·07 독립 검증 상세 (PASS_WITH_CONCERNS)

**리드 진단이 틀렸고 실험으로 정정됐다.** 내가 "13px 문서 높이 클램프" 라고 적은 것은 오진이고, 진짜 기제는 **Chromium 스크롤 앵커링**이다.
검증자가 `overflow-anchor` 를 직접 껐다 켜 확정했다:

| 조건 | 프레임 #0 | 프레임 #1 | landmark(내용 위치) |
|---|---|---|---|
| `overflow-anchor: auto` scrollTo(80) | y=80 hH=60.5 | y=**67** hH=47.75 | 120.06 → 120.31 **고정** |
| `overflow-anchor: none` scrollTo(80) | y=80 hH=60.5 | y=**80** hH=47.75 | 120.06 → **107.31**(12.75 위로) |

문서 max=455 ≫ 80 이라 높이 클램프가 아니다. 인플로우 sticky 헤더가 접히면 앵커링이 헤더 차만큼 scrollY 를 되민다.

**"잠깐 튄 뒤 되돌리기" 가 아님도 증명됐다**(문서 UI-06 이 그 방식은 통과가 아니라고 못 박았다):
보정 프레임과 정착 프레임 사이 **내용의 화면상 위치 변화 0.25px**. scrollY 숫자만 두 단계이고 화면 내용은 처음부터 최종 자리에 있다.

**검증자 음성 대조가 구현자 주장 2개를 깼다** (코드는 무해, 주석이 틀림):
| 변형 | 결과 |
|---|---|
| `min-w-max` 만 제거 | 🔴 **11/11 통과**, 기하 수치 바이트 동일 |
| `basis-0` 만 제거 | 🔴 **11/11 통과**, 수치 동일 |
| `flex-1` 만 제거 | ✅ 4건 실패(1280 에서 472.67/811.75 등폭 붕괴) |
`.flex-1{flex:1 1 0%}` 이라 `basis-0` 는 중복, span 이 `whitespace-nowrap` 이라 `min-w-max` 도 무의미. 실제로 일하는 건 **`flex-1` + nowrap span** 뿐.
또 단위 테스트가 `SCROLL_ANCHORING` **기본값을 보지 않는다**(명시 전달) — e2e 가 대신 지킨다.

**리드 결정 3건**
1. **1280 light 7~8px → 고치지 않는다.** 진짜 물리 클램프(게시판 max=81 → 랭킹 max=**73**, 랭킹 문서가 짧다). 피하려면 `min-height`·공백이 필요한데 문서 §4.2-3 이 금지. §9.2 "물리 clamp 별도 기록" 으로 남긴다.
2. **사이 구간(레일 446~535px) → 그대로.** 라벨이 각 슬롯 중앙(오차 ≤0.01)이라 "간격이 조금 다른 한 줄"로 읽힌다. 모바일 가로·작은 태블릿에서만 나타난다.
3. **`aria-current` 만 추가.** 버튼의 `role`·`aria-selected`·`aria-current` 전부 null 이고 밑줄 span 은 `aria-hidden` 이라 **프로그램적 전달이 0**. 시각은 색+굵기(700/600)+밑줄이라 "색만"은 아니어서 문서 위반은 아니다. 전체 tablist 패턴은 **넣지 않는다**(반쪽 구현이 더 나쁘다).

**남은 약점(기록)**: 저장 y ∈ (0, 12.75) + 헤더 상태가 다르면 복원이 5~12.75px 어긋나고 한 프레임 내용 이동. **y=0 에서는 앵커링이 작동하지 않기** 때문이다. 대안 `scrollTo(5)` 는 18 로 앵커돼 13px 어긋나므로 현 선택이 덜 나쁘다. 문서 기준 2px 초과라 숨기지 않는다.

---

## 전 도메인 점검 — 내 매장 · 장부 · 누리 스팟 · 로그인

읽기 전용 4영역 병렬 조사(12 에이전트) → **42건 발견** → 고위험 8건 **적대적 반증 시도** → **6건 생존 · 2건 격추**.

| 영역 | critical | high | medium | low |
|---|---|---|---|---|
| 내 매장 | 1 | 3 | 9 | 1 |
| 장부 | — | 3 | 5 | 2 |
| 누리 스팟 | — | 3 | 3 | 3 |
| 로그인·인증 | 1 | 2 | 3 | 3 |

### 확정 6건 (적대 반증 생존) — 전부 수정 완료

| # | 심각도 | 위치 | 증상 | 판정 |
|---|---|---|---|---|
| F1 | **high**(원 critical) | `VenueManageTab.tsx:1269` | 순위 조회 실패 → 오류 표시 **없이** 빈 폼 → 저장하면 서버가 (날짜+게임) **전체 삭제 후 재삽입**이라 **기존 순위 영구 소실 + `ranking_point_awards` 삭제로 활동점수까지 되돌림** | 수정 |
| F2 | **high** | `NuriPosLedger.tsx:2320` | `emptyClockState` 대신 인라인 `remainingMs: 0` → `clockPhase`='paused' → TV 에 손님 앞 **`PAUSED`**, 버튼 '계속하기', 누르면 0ms 로 시작해 **1레벨 통째 건너뜀** | 수정 |
| F3 | **high** | `StaffPayroll.tsx:129` | 출근 조회 실패 → **"총 인건비 0원"** 이 정상 숫자로. `wageErr` 는 시급 경로만 봄. '기록 없는 달'과 '못 불러온 달'이 동일 | 수정 |
| F4 | medium | `NuriPosLedger.tsx:207` | RLS `la_select` 가 직원에게 **자기 행만** → `operators:[본인]` 저장 → **동료 전원 장부 잠김** | 수정(클라) |
| F5 | medium | `NuriPosLedger.tsx:463` | `clockLinked` 가 venueId 미대조 → 매장 바꿔도 **앞 매장 클락이 정본**, 리모컨이 남의 대회 조작 | 수정 |
| F6 | medium | `dealerShifts.ts:18` | `error` 를 **구조분해조차 안 함** → 딜러 인건비 실종. 호출부 `.catch` 2곳은 **죽은 코드**(PostgREST 가 reject 하지 않음) | 수정 |

**게이트(수정 후)**: `vitest` **167 files / 1925 tests** exit 0(직전 162/1892) · `tsc` 0 · `eslint` 0 error ·
고치기 전 새 검사 **20건 빨간불** 확인 · 음성 대조 **16/16 성립** · 소스 5파일 `sha256sum -c` 전후 동일.

### 격추 2건 — 반증 단계가 제 몫을 했다
- `ledger.ts:947` "SQL 원문 누출": 인용은 정확했으나 **실패 경로가 서버 코드상 도달 불가**.
- `spots.ts:106` 동일 주장: **근거를 거꾸로 읽었다**(BLOCKED.md 인용 오독).

### 수정이 만든 회귀 1건 (구현자 자진 신고 → 후속 처리 중)
`DealerShiftsModal.tsx:27` 의 `.catch(() => {})` 가 F6 수정으로 **죽은 코드 → 실행되는 코드**가 됐다.
실패 시 목록이 갱신되지 않은 채 **안내 없이** 남는다(예전엔 [] 로 비었다).

### 확정되지 않은 34건
medium/low 는 **적대 검증을 거치지 않았다.** PASS 로도 결함으로도 세지 않고 수정 단계에서 하나씩 확인한다.

### 아직 안 고친 것 — UI-08 계정 경계 (조사에서 확인, 수정 미착수)
`<TierLeaderboardM />` 에 **`key` 가 없고** 커뮤니티 탭이 keep-alive 라 로그아웃→다른 계정에도 언마운트되지 않는다.
거기에 `if (x === null)` 재조회 가드가 겹쳐 **A 계정의 업적·미션 진행도·순위 인증 신청 이력·장착 마크가 B 화면에 남는다**
(순위 인증 이력은 대회 입상 증빙 제출 기록 = 개인정보). 상점 분기는 재조회는 하지만 **취소 가드가 없어**
A 의 늦은 응답이 B 의 잔액·보유 목록을 덮는다. 저장소에 `src/lib/staleResponse.ts` 가 **있는데 안 쓴다**.
⚠ 코드 근거 확정 · **실화면 2계정 재현은 미실시**(실계정 소비 금지) — PASS 로 세지 않는다.

---

## 배포 경로 실측 (2026-09-13)

- 배포 = **Vercel git 연동**(push → 자동). `vercel.json` 확인, CI 는 `Wait for CI before deploy` 안내만 있음.
- 로컬 `main` = origin/main 대비 **9 뒤 · 0 앞** → **순수 조상**. `git merge-tree --write-tree` 예행에서 **충돌 메시지 0**.
- 겹치는 파일 **8개**(상류 23 × 로컬 125): `ClockDisplay.tsx`(로컬 +7/−21 vs 상류 +54/**−544**) ·
  `TournamentClock.tsx`(+56/−45 vs +38/**−202**) · `index.css` · `VenueManageTab.tsx` · `schedules.ts` ·
  `clockLevel.ts` · `BLOCKED.md` · `sitemap.xml`. 상류 `03cd8bb` 가 두 클락 파일의 중복 마크업을 도려냈다.
- **순서: 커밋 → 병합 → push.** 커밋을 먼저 해야 미커밋 작업이 병합에서 날아가지 않는다.
- 🔴 **이벤트 배포 주의**: 운영 홈에 EVENT 카드가 **없음**(실측) = 미배포 신규 코드가 맞다. 그러나 배포해도
  화면은 **"진행 중인 이벤트가 없어요"** 그대로다 — 운영 DB 에 캠페인 행이 없고, 만드는 RPC 가 미적용 초안
  `20260912c` 안에 있다. 코드 배포만으로는 이벤트가 뜨지 않는다.

---

# 2026-09-13 12:3x KST — 추가 지시문 N01~N09 접수 + 설계 적대 검토

새 정본: `홀덤 캘린더/outputs/NURI_로컬5174_아우라_폰트_모션_이벤트_이용권_통합추가지시_2026-09-13.md`
🔴 **화면 기준은 http://localhost:5174/ 다.** 공개 도메인으로 최신 상태를 판단하지 않는다(문서 머리말).

## N01~N09 와 기존 UI-01~08 의 연결

| ID | 내용 | 기존 작업과의 관계 | 상태 |
|---|---|---|---|
| N01 | 아우라 표면·LED·테두리 | UI-03(아우라 구분선)의 확장 | 미착수 |
| N02 | 게시글 상세 재설계 | **UI-02 + UI-04 와 합침** | 설계 완료(수정 필요) |
| N03 | 한글·영문 폰트 | 신규 — **실측 완료, 수정 대기** | 큐 |
| N04 | 이용권 전 경로 검증 | 신규 (P02 와 인접) | 미착수 |
| N05 | 모션 일관성 | 신규 — **현 모션 보존이 기본** | 미착수 |
| N06 | 홈 이벤트 → 메인 배너 통합 | 신규 | 미착수 |
| N07 | 공지 한 줄 요약 바 | UI-01 과 같은 도메인 | 구현 중 |
| N08 | 게시판 기본값 compact | **UI-05 와 같은 파일** | 구현 중 |
| N09 | 로그인 헤더 검은 띠 | N01 과 함께 | 미착수 |

## 🔴 N03 폰트 — 리드 CDP 실측 (2026-09-13, 5174)

`CSS.getPlatformFontsForNode` 로 직접 조회:

| 샘플 | CSS 선언 | **실제 렌더** |
|---|---|---|
| 한글 "로그인" | `"Pretendard Variable", Pretendard, NuriMarks, system-ui` | **Malgun Gothic** |
| 영문 "NURI HOLDEM" | 〃 | **Malgun Gothic** |
| 숫자·혼합 | 〃 | **Malgun Gothic** |

- 폰트 파일 네트워크 요청 **0건**
- 🔴 `document.fonts.check('16px Pretendard')` → **`true`** (거짓 양성). 실제 로드 목록은 `NuriMarks` 하나(unloaded).
  **이것만 봤으면 "적용됨"으로 잘못 판정했다.** `index.html:128` 이 경고한 그대로다.

**버그가 아니라 측정 후 결정**이다 — `index.html:98-130` 에 전문이 있다:
- 원인: `pretendardvariable-dynamic-subset.css` 의 **92 face 전부 `font-display: optional`**. 픽셀 해시로 증명
  (`현재(optional) 533346822707` == `woff2 전면차단 533346822707`).
- 켜는 법도 측정 완료(4173·412×915·CPU 4x·n=5 중앙값): ① `optional`→`fallback` ② `<head>` 정적 `<link>`
  → 콜드 LCP 652→**948ms** · CLS 0.0775→**0.0791(사실상 동일)**
- ⚠ **지연 주입 금지** — 그게 CLS 0.132 를 만든 원인이었다.

**리드 결정: 켠다.** 근거 — N03 이 명시 요구, 비용이 실측돼 있고, 지금은 브랜드 폰트가 통째로 없는 상태.
문서가 "폰트 적용에 따른 최소 넘침 보정"을 레이아웃 변경 허용 예외로 열어 뒀다.
⚠ **대가**: 폭 의존 검사 전량 재실행(UI-07 e2e 8종·sliding-pill·pill-press·pill-selfheal·subtab-motion·tabbar-label-ladder·폰트 3종).
문서 §12-3 이 "폰트를 pill 정렬 검증보다 **먼저** 안정화하라"고 했는데 UI-06·07 을 이미 현재 폰트로 끝냈다 — 늦게나마 순서를 맞춘다.

## 설계 적대 검토 — UI-02 · UI-04 · UI-08 (읽기 전용 6 에이전트)

**3축 전부 `NEEDS_REVISION`. 변경 단위 32개 중 16개 `flawed`.** 구현 전에 잡았다.

### UI-02 (게시글 전체화면)
| 잡힌 것 | 내용 |
|---|---|
| 🔴 닫는 경로 손실 미계상 | `page` 에는 **backdrop 자체가 없어** 배경 클릭 닫기가 사라진다. `dragToClose={false}` 와 겹쳐 **4개→2개**. PC 에서 특히 크다(종전 714px 다이얼로그 옆 클릭) |
| 🔴 리드 수치 정정 | page 소비처는 2곳이 아니라 **5곳**(`ToolsPanel`·`GtoDeepModal`·`CalendarToolsPanel`·`StoreToolsPanel`·`ScheduleDetailModal`). Modal 전체는 **38파일 / 47호출** |
| 🔴 e2e 도달 불가 | 1440 읽기폭 단언이 `CommunityTab.tsx:408` + `useMinWidth(1024)` 때문에 inline 패널을 연다 → `?post=` 딥링크 필요 |
| 🔴 산수 오류 | compact page 헤더 **56.25px**(설계는 55.75 — `py-1` 을 16px 기준 8 로 계산). 루트는 17px |
| 🔴 전역 id | `#modal-title` 을 스코프 없이 쓰면 중첩 모달에서 strict mode 위반 |
| ✅ 확인된 것 | **UI-03 은 이미 끝났다** — `readingSurface.contract.test.ts` 10 passed, `PostDetailModal` 아우라 선 3곳(`:568·:743·:812`)이 이미 목표 상태. 설계의 "5/6 FAIL" 전제가 낡았다 |

### UI-04 (이전/다음 글)
| 잡힌 것 | 내용 |
|---|---|
| 🔴 남의 글 삭제가 내 맥락을 지움 | `App.tsx:2728` 은 **조건부** `setOpenPost(cur => cur?.id === id ? null : cur)` 다. 뒤에 무조건 `setPostNav(null)` 을 붙이면 안 보고 있는 글이 삭제될 때마다 이전/다음이 죽는다 |
| 🔴 라이브락 | `appendPostNav` 로 늘어난 ctx 를 위로 전파하는 계약이 없어 "다음 글"이 진행 없이 busy 만 반복 |
| 🔴 popular 정렬 커서 | `like_count.lt.<lc>` 가 목록 자신의 `fetchMore`(전역 인기 상위)와 **정반대 집합**을 준다 |
| 🔴 PC 뷰포트 없음 | `playwright.config.ts` 의 project 가 **mobile-chromium(Pixel 7) 하나뿐** — PC 단언이 모바일 폭에서 돌아 거짓 결과 |
| 🔴 훅 규칙 위반 | `<article>` 기준 배치는 `if (!post) return null` 아래가 되어 빌드/lint 정지 |
| 🔴 계약 충돌 | `readingSurface.contract.test.ts` 가 `divider-aura` **정확히 3개**를 단언 — nav 앞에 선을 넣으면 남의 계약이 빨개진다 |

### UI-08 (랭킹)
| 잡힌 것 | 내용 |
|---|---|
| 🔴 **`key` 재마운트 기각** | 오너 이슈 #5 로 기록된 실측 붕괴를 되살린다 — `TierLeaderboard.tsx:612-621`: `docHeight 1684→1418 · scrollY 487→221 · layout-shift 0.2516`. **`staleResponse` 스탬프로 간다** |
| 🔴 리드 진단 보강 | 업적(badges)은 **위장보다 나쁘다** — `.catch(() => {})` + `badgeStats === null ? '불러오는 중…'` = **재시도 수단 없는 영구 스피너** |
| 🔴 이미 있는 것을 미검증 처리 | `currentUserStrict` 는 **`_session.ts:67` 에 이미 있다**(`if (error) throw error`). 설계가 "시그니처 미확인"으로 범위 밖에 밀어냈다 |
| 🔴 구조적 무효 | T8 고아 정리는 **0건**이 된다 — `20260613e_rank_verifications.sql:31-33` 의 delete 정책이 **admin 전용**이라 회원 `remove()` 는 오류 없이 0건. mock 테스트는 초록인데 운영은 그대로 = 거짓 완료 |
| 🔴 크래시 | T9 를 서술대로 하면 상점 보드가 **TypeError** — `:1084` 의 `{frameSku.label}` 이 보호를 못 받는다 |
| 🔴 범위 밖 반례 | `community.ts:1675 getLiveShouts` 의 `if (error) return [];` 가 **이미 만들어 둔 오류 UI 를 도달 불능**으로 만든다(`CommunityShoutBar.tsx:337-342` 의 catch 가 영영 안 탄다) |

## 이 세션의 검증 효율 (기록)

| 단계 | 제출 | 살아남음 | 격추 |
|---|---|---|---|
| 전 도메인 점검 고위험 | 8 | 6 | **2** |
| UI-02/04/08 설계 단위 | 32 | 16 | **16** |

적대 검증이 **40건 중 18건(45%)** 을 죽였다. 설계 단계에서 죽인 16건은 구현 전이라 비용이 0 이다.
