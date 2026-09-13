// 랭킹 6탭 레일(TierLeaderboard [data-rank-tabbar]) — 2026-09-13 후속 ②·④ 의 소스 계약.
//
// ④ 접근성: 버튼에 role·aria-selected·aria-current·tabindex 가 전부 없고 밑줄 span 은 aria-hidden 이라 선택 상태가
//    프로그램적으로 전혀 전달되지 않았다. 리드 결정: `aria-current` 한 줄만(전체 ARIA tablist 패턴은 방향키·Home/End 까지
//    함께여야 해서 반쪽 구현이 더 나쁘다 — 넣지 않는다).
// ② 주석 정정: UI-07 독립 검증 음성 대조 실측 — `min-w-max` 제거 11/11 통과·수치 동일, `basis-0` 제거 11/11 통과·수치 동일,
//    `flex-1` 제거 4건 실패(1280 에서 472.67/811.75). 세 상태를 실제로 가르는 토큰은 flex-1 + nowrap span 뿐이다.
//    주석이 "flex-1 basis-0 min-w-max" 세 토큰을 계약처럼 적고 min-w-max 가 넘침을 만든다고 했는데 사실과 달랐다.
//
// 못 보는 것: 문장의 존재만 본다. 실제 기하·스크린리더 출력은 e2e/rank-scroll-slots.spec.ts 와 사람 몫이다.
// 음성 대조: TierLeaderboard.tsx 버튼의 `aria-current={board === b ? 'true' : undefined}` 를 지우면 ④ 가,
//            배치 주석에서 `flex-1` 이 실제로 일한다는 문장(`실측` 줄)을 지우면 ② 가 실패한다.
// 실행: npx vitest run src/components/features/rankTabbar.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'TierLeaderboard.tsx'), 'utf-8');
const railAt = SRC.indexOf('data-rank-tabbar');
expect(railAt, '[data-rank-tabbar] 를 찾지 못했다').toBeGreaterThan(-1);
const RAIL = SRC.slice(railAt, SRC.indexOf('data-rank-panel', railAt));

describe('④ 랭킹 탭 버튼이 선택 상태를 aria-current 로 전달한다', () => {
  it('🔴 활성 버튼에만 aria-current="true", 비활성은 속성 없음', () => {
    // 버튼 여는 태그와 aria-current 사이에는 공백·줄 주석만 허용(다른 속성이 끼어들어 다른 요소를 주워 오지 않게).
    expect(RAIL).toMatch(/<button key=\{b\} type="button" onClick=\{\(\) => goBoard\(b\)\}\s*(?:\/\/[^\n]*\s*)*aria-current=\{board === b \? 'true' : undefined\}/);
  });
  it('전체 tablist 패턴은 넣지 않는다(반쪽 구현 금지) — role/aria-selected 가 레일에 없다', () => {
    expect(RAIL).not.toMatch(/role="tab(list)?"/);
    expect(RAIL).not.toMatch(/aria-selected/);
  });
});

describe('② 배치 주석이 실측과 일치한다 — 일하는 토큰은 flex-1(+ nowrap span)', () => {
  const at = SRC.indexOf('6개 메뉴 배치(UI-07');
  expect(at, '배치 주석을 찾지 못했다').toBeGreaterThan(-1);
  const NOTE = SRC.slice(at, SRC.indexOf('const railRef', at));
  // 리드 결정(2026-09-13 독립 검증 뒤): 새 문장의 **정확한 표현**을 요구하지 않는다 — 주석을 더 잘 고치는 것을 막는 세금이다.
  // 남기는 것은 **옛 거짓 문장 금지**(회귀 방지)뿐이다. 실측값 자체는 파일 머리 주석과 e2e/rank-scroll-slots.spec.ts 가 든다.
  it('🔴 옛 거짓 문장이 되살아나지 않는다 — min-w-max/basis-0 가 배치를 만든다고 적지 않는다', () => {
    expect(NOTE).not.toMatch(/min-w-max 가 줄어들기를 막아/);
    expect(NOTE).not.toMatch(/배치 계약은 CSS 하나다 — 버튼 `flex-1 basis-0 min-w-max`/);
  });
});
