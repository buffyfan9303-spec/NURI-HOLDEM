# 전체 완성도 개선 추적 — 2026-09-05 (Codex 실행명령문 + 모바일 점검 27건)

> 단일 추적 문서. 상태 어휘: **이미 해결 / 코드 확인 / 실행 검증 / 미검증 / 결정 필요 / 승인 대기**.
> 작업 브랜치 `wholeness/2026-09-05`(main 32bcf3f 기반). **운영 배포·DB 마이그레이션·푸시는 오너 승인 전까지 하지 않는다.**

## 0. 현재 상태(세션 끊김 대비)
- 브랜치: `wholeness/2026-09-05` — 모바일 점검 27건(7 묶음) 병합 완료, E2E 쓰기 차단 가드 커밋(da97aab).
- 게이트: `npx tsc -b` 0 · `npx eslint .` 0 error(26 warning 기존) · `npx vitest run` 508/508 · Playwright: 실행 중/결과는 §4.
- **이미 운영에 반영된 것(지시 이전)**: 마이그레이션 `20260905o_table_privilege_hygiene`(anon·authenticated 의 TRUNCATE/REFERENCES/TRIGGER 561건 회수, DML 무변경). 롤백: 파일 상단 주석.
- **승인 대기(운영 미적용)**: 마이그레이션 `20260905j`(바인 요청 영업일 RPC) · `k`(출석 적용 공유 함수 + check_in jsonb) · `l`(방문=체크인) · `m`(숨김 글 RLS) · `n`(조회수 dedupe). 적용 순서: j·l·m·n → 클라 배포 → k(check_in 반환 타입 변경, 클라가 문자열/객체 둘 다 처리).
- 테스트 대상 환경: 프런트 `.env.local` 과 E2E 모두 **운영 프로젝트(idsxiqspecrucvfvtgbw)** 를 가리킨다. 격리 프로젝트 없음 → E2E 는 `e2e/_fixtures.ts` 가드로 **읽기·STABLE RPC 만 통과**(쓰기는 네트워크 단에서 차단, 노드 `restAs` 도 차단). 로그인 스펙(33건)은 자격증명 없이 skip = **미검증**.
- 다른 작업자 흔적 보존: `.agents/`, `.codex/`, `AGENTS.md` 미추적 유지. `public/sitemap.xml` 은 빌드가 lastmod 를 갱신하는 생성물.

## 1. 모바일 점검 27건(2026-09-05 오전 워크플로 확정) — 구현 상태
| 묶음 | 항목 | 상태 | 증거 |
|---|---|---|---|
| A+B 장부·출석 | #1 자정 이후 바인 요청 소실 · #2 이용권 사용→출석 4시간 봉쇄 · #22 두 번째 체크인 '+3점' 오안내 · #23 체크인 후 점수 미반영 · #8(c) | 코드 확인(클라) / **승인 대기(j·k)** | f7ab692 · vitest checkins.result.test |
| C 랭킹 허브 | #3 인증 제출 무음 · #15 탭 44px · #17 스켈레톤 CLS · #19 잔액 미확정 · #20 실패 위장 · #21 내 행 강조 · 국내 순위 금액 제거 | 코드 확인 | 3d1f0ef · community.balance.test |
| D 프로필 | #4 아바타 제거 미반영 · #5 재업로드 캐시 · #13 OTP 탭 튕김 | 코드 확인 | 40c5780 · auth.profilePatch.test |
| E+F 대시보드 | #8 방문=체크인 · #6 바인/머니인 단위 · #7 도감 backstack · #14 · #18 입력 보존 · #26 내 글 수 · #27 44px | 코드 확인 / **승인 대기(l)** | 1f9c859 · checkins.visits.test |
| G 이용권 | #7 RedeemSheet backstack · #9 보유 장수 · #14 · #27 | 코드 확인 | 6ea8aad · vouchers.held.test |
| H 게시판 | #10 광고→고정→HOT · #15 서브탭 44px · #16 · #24 · #25 | 코드 확인 | 1a043ae · pinnedFirst.test |
| I+J+K 서버·시트 | #11 숨김 글 RLS · #12 조회수 dedupe · #14 Modal safe-area | 코드 확인(클라) / **승인 대기(m·n)** | 07766a4 · community.hidden.test |

## 2. Codex 실행명령문 F01~F11 + 업무 경로 R1~R8 — 분류(감사 워크플로 결과 반영 예정)
(작성 중)

## 3. 결정 필요 / 승인 대기
- 운영 반영 승인: 위 j·k·l·m·n + 클라 배포(순서 §0).
- BLOCKED #17~19(등수 점수→활동 등급, 클락 TV 프라이즈 표시, 지급된 순위 유래 12점) — 현행 유지 중.

## 4. 테스트 실행 기록
| 시각 | 명령 | 대상 | 결과 |
|---|---|---|---|
| 22:33 | `npx tsc -b` | 병합 트리 d2d1f92 | exit 0 |
| 22:33 | `npx eslint .` | 〃 | exit 0 · 0 error · 26 warning(기존) |
| 22:33 | `npx vitest run` | 〃 | 54 files · **508 passed** (5.1s) |
| 22:41 | `npm run test:e2e` (build → preview 4173, 쓰기 차단 가드) | da97aab · 운영 프로젝트 읽기 전용 | main **85 passed · 33 skipped**(로그인 스펙 = 미검증) · boot 2 passed · exit 0 |
