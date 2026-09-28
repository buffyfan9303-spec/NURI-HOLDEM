# store-team 보고 — 장부 애드온 행

요구 키: 오너 채팅 2026-09-28 "장부에 애드온 행 추가 — 현금 완납/현금 미수 고르는 칸 맨 아래에"
작업트리: .claude/worktrees/pos-system-defect-fixes-938532 (미커밋, 앞 세션 수정본 보존)

## 실제 diff (내 몫만)
- supabase/migrations/20260928g_ledger_addon_payment.sql (신규·초안·미적용): ledger_sessions.addon_amount, ledger_buyins.addon_method/addon_unpaid/addon_amount, CHECK 2개, 서버 트리거 _ledger_buyin_addon_rule(금액을 세션 가격으로 서버 스냅샷, 애드온 게임 아니면 거절, 지우면 0 정리), 자가검사, 리허설 R1~R6 제안. 머리 주석에 라이브 정의 실측 ①~⑥.
- src/api/ledger.ts: LedgerBuyin.addonMethod/addonUnpaid/addonAmount(선택), LedgerSession.addonAmount, AddonMethod, addonFinance/addonTotals/ZERO_ADDON, rowToBuyin·rowToSession 매핑, setBuyinAddon(별도 UPDATE+mustAffect), saveLedgerSession/openLedgerSession 은 isAddon 일 때만 addon_amount 전송, ledgerLossSummary·customerLedgerTotals 에 애드온 합산. buyinFinance·ledgerCounts 는 손대지 않음.
- src/lib/ledgerSettlement.ts: GameSettlement.addon(게임·합계), 손님 줄 paid/unpaid/moneyIn 에 애드온(미수자 명단 포함). revenue·unpaid·value·entries·buyinCount 는 바인 전용 그대로.
- src/lib/gameInherit.ts: applyToLedger 가 프리셋 addonCost → addonAmount, presetFromRound 가 addonAmount → addonCost.
- src/components/features/NuriPosLedger.tsx: 결제 모달 맨 아래 AddonRow(없음/현금 완납/현금 미수 + 다른 수단 select, h-11=46.75px, nowrap, 바인 기록된 셀·가격>0 일 때만 활성, session.isAddon 일 때만 표시), onSetAddon 핸들러, 세션 폼 애드온 가격 입력(포스터 buyIn.addon 상속 A1 경로·메인 복사·지난 게임·프리셋), 요약바/정산바/마감 모달 매출·미수에 애드온 합산 + 마감 모달 애드온 블록, 미수자 명단(playerTotals)에 애드온.
- src/components/features/LedgerSettlementPanel.tsx: KPI 완납 매출·미수금에 애드온 합산(힌트로 분해), 받은 방법 카드에 애드온 타일, 게임별 표.
- src/components/features/LedgerStatsPanel.tsx: 매출·미수·티켓 합계에 애드온(엔트리·횟수 제외), 완납액·미수 카드에 '애드온 N만 포함'.
- src/api/ledger.money.test.ts: 애드온 4건 추가(기존 단언 변경 없음).

## 명령 · 종료 코드
- 수정 전 `npx vitest run src/api/ledger.money.test.ts` → 4 failed / 73 passed (새 테스트가 실패)
- 수정 후 같은 명령 → 77 passed
- 음성 대조: ledgerSettlement.ts 의 addAddon(g.addon, a) 한 줄 주석 → 3 failed, 복원 후 git hash-object 동일(a6a8087…)
- `npx tsc -p . --noEmit` → 0 (주의: 루트 tsconfig 는 files:[] 라 아무것도 검사하지 않는다)
- `npx tsc -p tsconfig.app.json --noEmit` → 0, tsconfig.node.json → 0, tsconfig.e2e.json → 0
- `npx vitest run src/api src/components/features src/lib` → 5 failed(community.searchPosts, .env.local 없음·무관) / 3662 passed
- `npm run lint` → 0 (오류 0)

## 판정
- 금액 계산·정산·통계 반영: PASS(단위 테스트)
- 마이그레이션: NOT_RUN(초안, 적용·리허설은 리드)
- 모달·설정 화면 실측(375/1280, 44px, nowrap): NOT_RUN(브라우저 미실행)

## 리드 판단 필요
- N1: 완납 애드온 삭제·완납→미수를 감액 비밀번호로 묶을지. 서버 _ledger_buyin_tiers·update_ledger_buyin_reduce 가 애드온을 모른다. 지금은 비밀번호 없이 지워진다.
- 배포 순서: 마이그레이션을 먼저 적용해야 한다. 적용 전 배포면 애드온 게임의 세션 저장(addon_amount 칸)·애드온 기록이 실패한다(일반 게임 저장은 영향 없게 조건부 전송).
- 범위 밖(보고만): StoreDashboard.tsx 매출 집계, src/api/reservations.ts(CRM) 는 컬럼을 골라 select 해서 애드온이 안 잡힌다.

## 다음 한 단계
리드가 20260928g 를 begin…rollback 리허설(R1~R6) 후 적용 → 1280 폭에서 애드온 게임 장부 열어 모달 맨 아래 줄 실측.
