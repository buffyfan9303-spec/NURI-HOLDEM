# verifier 검증 — 장부 애드온 행 추가 (2026-09-28)

작업트리: pos-system-defect-fixes-938532 (미커밋, 앞 세션 매장 결함 수정본과 공존 — 애드온 관련 파일만 diff 로 가려서 검증)
대상 보고: scratchpad/store-addon-report.md (store-team)

## 1. 불변식 — 애드온이 바이인 횟수·엔트리·얼리·총칩에 안 들어가는가
PASS (코드 경로 추적 + 테스트).
- src/api/ledger.ts: `buyinFinance()` 본체는 이번 diff 에서 **한 글자도 안 바뀜**(diff 에 함수 내부 변경 없음, 컨텍스트만). 애드온은 `addonFinance`/`addonTotals` 라는 완전히 별도 함수(:308-330 부근)로 처리.
- `ledgerCounts` 호출부(ledgerSettlement.ts:224 `total.players = ledgerCounts(keptAll).players`)도 무변경 — keptAll 은 바인 배열 그대로.
- NuriPosLedger.tsx playerTotals(:1054-)·settlementReport(byName loop, ledgerSettlement.ts:196-201) 둘 다 `cur.buyins += 1`(바인 횟수)은 그대로 두고 `cur.paid/unpaid`(돈)에만 `a.revenue`/`a.unpaid` 를 더함.
- 서버측: migration 20260928g 헤더 실측 ③에 "_ledger_buyins_client_guard(금액규칙·감액판정)는 바인 칸 9개만 보고 addon_* 는 통과"라고 명시 — 클라·서버 양쪽에서 바인 대차와 분리 확인.

## 2. 완납/미수/티켓 애드온이 단일 함수(addonTotals 등)를 쓰는가
PASS.
- 정본은 src/api/ledger.ts 의 `addonFinance`(행 1건) / `addonTotals`(합계) 둘 뿐.
- LedgerSettlementPanel.tsx(정산 패널) → `settlementReport`(ledgerSettlement.ts) 가 각 행에 `addonFinance(b)` 호출 후 `addAddon()` 으로 누적 — 궁극적으로 같은 `addonFinance`.
- LedgerStatsPanel.tsx(통계) → `addonTotals(src)` 직접 호출.
- NuriPosLedger.tsx 요약바/마감 팝업(CloseModal) → `addonTotals(buyins.filter(...))`.
- 두 벌 계산 없음 — 모두 `addonFinance`(단일 저수준 함수)에서 파생.

## 3. 모달 애드온 줄 — 위치·조건부·주석 함정
PASS. src/components/features/NuriPosLedger.tsx:3442-3445 확인:
```
{session.isAddon && onSetAddon && (
  <AddonRow buyin={cell.buyin} amount={session.addonAmount ?? 0} busy={busy} onSet={onSetAddon} />
)}
```
- 위치: `!splitMode` 블록의 마지막 요소, "분납/할인 상세 입력" 버튼 바로 다음 — 보고대로 결제 선택 칸 맨 아래.
- `session.isAddon` 이 아니면 안 보임 확인.
- JSX 조건부 표현식(`session.isAddon && onSetAddon && (...)`) **안에 주석 없음** — 빌드 깨짐 함정 없음.
- AddonRow 내부 `canPick = !!buyin && amount > 0 && !busy` 로 "바인 기록된 셀·가격>0 일 때만 활성" 확인(버튼 disabled, 안내 문구 2종 분기).
- h-11(=46.75px, 루트폰트 17px 보정) 버튼·select 사용, `whitespace-nowrap` 확인.

## 4. 실행 명령·종료 코드
- `npx tsc -p tsconfig.app.json --noEmit` → **0**(오류 없음)
- `npx vitest run src/api src/lib src/components/features` → **5 failed / 3662 passed**(3673 중 6 skipped). 실패 5건 전부 `src/api/community.searchPosts.test.ts`. `git diff --stat -- src/api/community.ts src/api/community.searchPosts.test.ts` = 빈 출력(이번 작업이 안 건드림) → 애드온 작업과 무관, 보고대로 `.env.local` 부재 원인으로 판단(사전 존재 실패).
- `npm run lint` → **오류 0**(경고 2512, 통과)
- `npx vitest run src/api/ledger.money.test.ts` → **77 passed**
- `npm run build` → **성공**(exit 0). 절차: sitemap.xml sha 대신 `git hash-object` 기준값 기록(`5b5953aa...`) → 빌드 → 즉시 원본 백업 파일로 복원 → `git hash-object` 재확인 **일치** → `git status --porcelain public/` 빈 출력(다른 산출물도 무변화, nuri-e2e SKILL 설명과 일치). E2E(Playwright) 자체는 이번 검증 범위 밖이라 **NOT_RUN**(사용자 지시에 없었음, 시간·리소스상 생략 — 명시).

## 5. 음성 대조
PASS. src/lib/ledgerSettlement.ts:193 `addAddon(g.addon, a);` 한 줄을 주석 처리 → `npx vitest run src/api/ledger.money.test.ts` **3 failed**(애드온 완납/미수/티켓 3건, 보고와 일치) → 즉시 원복 → `git hash-object src/lib/ledgerSettlement.ts` = `a6a808773e7f2796d5621c2c0c101761c86bf263` (원본과 동일, 원복 전 hash 와 일치) → 재실행 `npx vitest run src/api/ledger.money.test.ts` **77 passed** 재확인.

## 부하·격리 사본
CPU 부하 프로세스나 격리 사본을 만들지 않음(별도 정리 불필요). `npm run build` 는 이 작업트리 안에서 직접 실행했고 sitemap.xml 은 위 절차로 원상복구·해시 대조 완료. `npx vite preview` 는 띄우지 않음(빌드 산출물 확인만 필요해 E2E 프리뷰 단계는 생략).

## 종합 판정
PASS — 1·2·3·4·5 전부 실측 확인. FAIL 없음.

## 리드 확인 필요(보고에서 넘어온 것, 검증 범위 밖이라 재확인 안 함)
- N1(완납 애드온 삭제/완납→미수 전환에 감액 비밀번호 미적용) — migration 20260928g 헤더 ③·NEEDS 항목에 명시돼 있고 코드로도 확인(`_ledger_buyins_client_guard` 가 addon_* 를 통과시킴). 리드 판단 대상.
- 마이그레이션은 이미 라이브 적용됨(파일 헤더 "✅ 적용 완료 2026-09-28"로 확인) — 검증 시점에 재적용·재리허설은 안 함(NOT_RUN, 운영 DB 접근 필요해 범위 밖).
