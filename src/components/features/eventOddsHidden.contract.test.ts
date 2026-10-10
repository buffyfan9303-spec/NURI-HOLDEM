// EventPage — 손님 화면에 이용권 장수·당첨 확률을 싣지 않는 계약 (2026-10-09, 오너 결정 15:50).
//
// 배경: 로티아레나 출석 이벤트는 계속 돌린다. 다만 손님 화면의 "1등 이용권 3장 3.33% · 2등 2장 10% · …" 확률 표와
//   "경품은 매장이용권" 문구는 확률로 이용권(환금성 있는 재화)을 주는 모양이라 §28(사행성·환금성 프레이밍) 에 걸린다
//   (감사 LEGAL-F1, audit-open-1009/r1-result.json). 지급 로직·데이터·관리자/업주 설정은 그대로 두고, 손님에게 보이는 글만 뺀다.
// ⚠ 2026-10-10 오너 최신 지시("이벤트 등수마다 매장이용권 몇개인지 명시")가 10-09 숨김 결정 중 **수량 금지만** 대체했다.
//   등수별 "매장 이용권 N개"(개수만, board.voucherByTier 실제 값)는 허용 — 렌더 단언은 eventVoucherCount1010.test.ts.
//   확률·당첨률·금액·현금가치·결과 시트의 장수/이름·oddsRows 금지는 그대로다.
// 지키는 것:
//   · 손님 화면 코드(주석 제외)의 '이용권' 글자는 수량 라벨 한 줄뿐이다.
//   · 확률 표(Odds)·oddsRows·확률(%) 계산·"당첨 확률" 문구가 없다.
//   · 결과 시트·토스트·열린 카드 타일이 voucherCount/voucherTitle(장수·이름)을 그리지 않는다 — 지급 사실은
//     "혜택이 지급되었습니다" 로만 알린다(지급 사실을 숨기지 않는다).
//   · 대신 안내 문구(카드 1장 · 하루 1회 · 매장 안내)가 있다.
// 못 보는 것: 문장의 존재만 본다(정적 소스 계약). 렌더된 화면은 e2e/click-paths.spec.ts 가 같은 부류를 잠근다.
// 음성 대조: EventPage.tsx 에 `<Odds board={board} />` 나 `이용권 {v}장` 을 되돌려 놓으면 아래가 실패한다.
// 실행: npx vitest run src/components/features/eventOddsHidden.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 블록 주석 · 한 줄 주석(줄 전체·줄 끝) 을 걷어 '실제로 그려지는 코드' 만 본다.
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const EP = strip(readFileSync(join(__dirname, 'EventPage.tsx'), 'utf-8'));

describe('EventPage · 손님 화면에 이용권 장수·확률을 싣지 않는다 (§28)', () => {
  it("🔴 코드(주석 제외)의 '이용권' 글자는 등수별 수량 고정 라벨 '매장 이용권 ${…}개' 한 줄뿐이다 (2026-10-10 오너: 수량만 허용)", () => {
    const hits = EP.split('\n').map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => l.includes('이용권') && !l.includes('`매장 이용권 ${raw}개`'));
    expect(hits, `이용권 글자가 손님 화면에 남았다: ${hits.map(([n, l]) => `${n}: ${l.trim()}`).join(' | ')}`).toEqual([]);
  });

  it('🔴 확률 표·확률 계산·"당첨 확률" 문구가 없다', () => {
    expect(EP).not.toMatch(/oddsRows/);
    expect(EP).not.toMatch(/<Odds\b/);
    expect(EP).not.toMatch(/function Odds\b/);
    expect(EP).not.toMatch(/당첨 확률|전체 당첨|확률/);
    expect(EP).not.toMatch(/<table\b/);
    expect(EP).not.toMatch(/\.toFixed\(2\)/);
    expect(EP).not.toMatch(/\bpct\b/);
  });

  it('🔴 이용권 이름·결과 장수 필드(voucherCount/voucherTitle)를 그리지 않는다 — 등수별 수량은 board.voucherByTier 만 쓴다', () => {
    expect(EP).not.toMatch(/voucherCount/);
    expect(EP).not.toMatch(/voucherTitle/);
    // 2026-10-10: 등수별 개수는 허용(voucherByTier). 누락→0 기본값(?? 0)·확률이 섞인 oddsRows 는 위에서 계속 금지.
    expect(EP).toMatch(/voucherByTier\?\.\[String\(t\)\]/);
    expect(EP).toMatch(/Number\.isSafeInteger\(raw\)/);
    expect(EP).not.toMatch(/voucherByTier[^\n]*\?\? 0/);
    expect(EP).not.toMatch(/경품은/);
    // 열린 카드 타일의 ×N(그 카드에 든 이용권 장수)
    expect(EP).not.toMatch(/×\{card\.count\}/);
  });

  it('지급 사실은 숨기지 않는다 — "혜택이 지급되었습니다" 로 알린다(결과 시트·토스트 둘 다)', () => {
    const sheet = EP.indexOf('function TearSheet(');
    expect(sheet, 'TearSheet 정의가 없다').toBeGreaterThan(-1);
    expect(EP.slice(sheet), '결과 시트가 지급 사실을 안 알린다').toMatch(/혜택이 지급되었습니다/);
    const open = EP.indexOf('const doOpen');
    const toastPart = EP.slice(open, EP.indexOf('MOTION-UNIFY', open) > open ? EP.indexOf('MOTION-UNIFY', open) : open + 2500);
    expect(toastPart, '판을 닫은 사이 확정된 당첨 토스트가 지급 사실을 안 알린다').toMatch(/혜택이 지급되었습니다/);
  });

  it('대신 안내 문구가 있다 — 출석 QR → 카드 1장 · 하루 1회 · 매장 안내', () => {
    expect(EP).toMatch(/카드 1장/);
    expect(EP).toMatch(/하루 1회/);
    expect(EP).toMatch(/매장 안내/);
    expect(EP).toMatch(/data-testid="event-guide"/);
  });

  it('기능은 그대로다 — 카드 열기·등급 표기·킬스위치 안내·되돌릴 수 없음 문구가 남아 있다', () => {
    expect(EP).toMatch(/openEventCard\(/);
    expect(EP).toMatch(/data-testid="event-killswitch-notice"/);
    expect(EP).toMatch(/한 번 연 카드는 되돌릴 수 없습니다/);
    expect(EP).toMatch(/TIER_META/);
  });
});
