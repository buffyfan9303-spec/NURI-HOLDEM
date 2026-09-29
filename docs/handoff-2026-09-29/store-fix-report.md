# store-team — PC 매장 점검 결함 F1~F7 수리 보고 (2026-09-29)

요구 키: 오너 채팅 2026-09-28 "전체 제대로 잘 되는지" → PC 매장 점검 F1~F7
원천: scratchpad/audit-pc-store.md (design-reviewer)
작업트리: .claude/worktrees/pos-system-defect-fixes-938532 (HEAD e77dc25b), 커밋 없음
측정: scratchpad/pc/wt 격리 사본 빌드(vite build, main 의 미추적 postcss.config.js 우회) → vite preview :4181, 목킹 업주(운영 DB 쓰기 0)
하네스: scratchpad/pc/fixcheck.cjs (F1·F2·F3·F4·F6·F7), chipcls.cjs (F5), addon.cjs (회귀). 전후 원본 출력: pc/before.txt · pc/after.txt

| 결함 | 판정 | 수리 전 | 수리 후 |
|---|---|---|---|
| F1 KPI·미수 배너 애드온 누락 | PASS | 대시보드 완납 14,995.8 / 미수 394.2 (정산 15,052.8 / 409.2). 애드온 미수만 있는 날: 대시보드 미수 0·배너 없음(정산 15만) | 대시보드 15,052.8 / 409.2 = 정산. 애드온 미수만: 미수 15만·배너 "오늘 15만원 미수금이 있습니다" |
| F2 결제 모달 애드온 줄 가림 | PASS | 1280×800 13.6/131.7px, 1440×900 98.6/131.7px | 둘 다 131.7/131.7(전부 보임). 할인 0개·390 도 전부 보임 |
| F3 세션 수정 가격 칸 고아 줄 | PASS | top [374,374,423] (1280·1440) | 한 줄 [t,t,t], 칸 158px, 8자리 여유 45px. 390 은 두 칸이 **짝으로** 둘째 줄 |
| F4 장부 요약 띠 GNB 가림 | PASS | 띠 y60–107, 5점 모두 GNB | 띠 y103–150(=--stack-top 103px), 5점 모두 띠 (1280·1440) |
| F5 '오늘 게임' 칩 47px 밀림 | PASS | LAT 600ms: CLS 0.0164 ×5/5 | 0 ×5/5, 대조군 0 |
| F6 첫 방문 '불러오는 중…' | PASS | 캘린더·파트너·이벤트 각 18프레임 280ms | 0프레임 0ms |
| F7 정산 애드온 타일 빈 칸 | PASS | 4열(222×4), 오른쪽 230.6px 빈칸 | 3열(299×3), 빈칸 0 (1280·1440) |

## 실제 diff 요약
- `src/api/ledger.ts` — `ledgerMoney(buyins, session)` 추가: buyinFinance 합 + addonTotals(revenue→paid, unpaid→unpaid). entry·ticket 은 바인만.
- `src/components/features/StoreDashboard.tsx` — fin·todayGames 가 ledgerMoney 사용(바인만 도는 루프 2벌 삭제). 7일 추세 paid·전주 prevPaid 도 `+ addonFinance(b).revenue`(통계 '완납액' 정의와 맞춤 — 같은 결함 부류라 함께 고침).
- `src/components/features/NuriPosLedger.tsx` — (F2) AddonRow 를 수단 격자 바로 밑으로(오너 원문 "현금 완납/현금 미수 고르는 칸 맨 아래에"), 결제 모달 maxWidth sm→md(408→476px, 할인 줄 3→2줄). (F3) 스택·가격 칸을 `flex min-w-64 max-w-88 flex-1` 한 묶음 + 각 `min-w-0 flex-1`. (F4) 요약 띠 `lg:top-[var(--stack-top,6.0625rem)]`.
- `src/components/features/VenueManageTab.tsx` — (F6) lazy 3종을 `*L` 로 분리해 tabActive 때 requestIdleCallback 으로 `.preload()`. (F5) 모듈 캐시 `chipCache`(매장|영업일) — GameChipBar 첫 렌더가 캐시로 시작, 조회는 종전대로 재실행. 같은 idle 에 `warmGameChips`(ledgerOk 일 때 getLedgerGames 1회).
- `src/components/features/LedgerSettlementPanel.tsx` — 애드온 타일 `sm:grid-cols-4` → `sm:grid-cols-3`.
- 테스트: `src/api/ledger.money.test.ts` +4(ledgerMoney=정산 KPI 등식, 애드온 미수만 → unpaid 30,000, 대시보드 배선 계약 2). `storeDashboardVoucherStats.contract.test.ts` — '오늘 회수' 잠금을 ledgerMoney 로 옮김(느슨하게 안 함: 대시보드가 ledgerMoney 로 fin 을 만든다 + ledgerMoney 가 ticketPaid 를 합산한다 두 겹).
- JSX 조건부 안 주석 0(주석은 모두 조건식 앞 형제 자리).

## 명령 · 종료 코드
- `npx tsc -p tsconfig.app.json --noEmit` → 0
- `npx vitest run src/api src/lib src/components/features` → 5 fail(전부 community.searchPosts, 원래 실패) / 3666 pass
- 음성 대조(F1 테스트): ledger.ts `m.paid += a.revenue; m.unpaid += a.unpaid;` 한 줄 주석 → 2 fail, 복원 후 `git hash-object` 원본과 동일
- `npm run lint` → 0 (오류 0)
- `node scripts/bundle-budget.mjs --dist scratchpad/pc/wt/dist` → 0 · VenueManageTab 118.1/119 KB gz(여유 1%), JS 합계 1009.1/1014(여유 0%) — 상한 안이나 여유 거의 없음
- 전후 측정 대조: F5·F6 수리 전 값은 HEAD 의 VenueManageTab 으로 사본만 되돌려 다시 빌드해 잰 값(F5), before.txt(F6)
- public/sitemap.xml: 워크트리 파일 git hash 5b5953aa… 전후 동일(빌드는 사본에서만 함)

## NOT_RUN / 경계
- 실네트워크·운영 데이터 — 전부 목킹. F5 는 ledger_sessions 600ms 지연으로만 흉내.
- F5 캐시는 영업일이 서버 조회로 바뀌는 첫 순간(자정 넘긴 토너)엔 키가 달라 한 번 빈 채 시작할 수 있다(종전 동작과 같음).
- F6 preload 전에(탭 진입 직후 idle 전) 누르면 종전 폴백이 그대로 뜬다 — 안전망.
- npm run test:e2e 전체 — 돌리지 않음(요청 범위 밖).

## 범위 밖 관찰(보고만)
- 작업 중 `supabase/migrations/20260928h_server_now.sql`(미추적)가 이 작업트리에 새로 생겼다 — 내가 만들지 않았다. 건드리지 않음.
- Git Bash `sed -i` 가 CRLF 파일을 LF 로 통째로 바꾼다(이번에 ledger.ts·ledger.money.test.ts 에서 실측) → CRLF 로 되돌려 놓았다.

## 다음 한 단계
리드: diff 검토 후 커밋. 필요하면 verifier 에 fixcheck.cjs 재실행 요청(서버 기동: `bash scratchpad/pc/rebuild.sh` → wt 에서 `npx vite preview --port 4181`).
