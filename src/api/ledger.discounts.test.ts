// 할인 프리셋 '뒤에 추가만' 규칙 (오너 리포트 2026-09-16 "장부에 할인이 없어")
//
// 무엇을 잠그나
//   바인은 할인을 **자리번호**(`discountIndex`, 1-based)로 참조한다. 그래서
//     · 뒤에 새 할인을 덧붙이는 것 → 기존 행 계산에 영향 **0** → 허용해야 한다
//     · 기존 자리의 금액·라벨·레벨 변경, 길이 축소 → 이미 기록된 바인의 적용금액·엔트리가 **소급 변형** → 막아야 한다
//
// 왜 생겼나
//   예전 저장 경로는 `JSON.stringify(a) !== JSON.stringify(b)` 로 통째 비교해서 **추가까지 막았다.**
//   운영 세션에 바인이 27건 있어 오너는 할인을 새로 등록할 길이 아예 없었고, 분납 패널은
//   프리셋이 0개라 할인 줄 자체를 안 그려서 "할인 기능이 없다" 로 보였다.
//   덤: jsonb 는 키를 (label, level, amount) 로 정규화하는데 폼은 (label, amount, level) 순서라
//   **제목만 고쳐도** 통째 비교가 다르다고 판정하는 거짓 양성도 있었다. 필드 비교가 그것도 없앤다.
import { describe, expect, it } from 'vitest';
import { discountsAppendOnly, type DiscountPreset } from './ledger';

const d = (label: string, amount: number, level?: number): DiscountPreset => ({ label, amount, ...(level ? { level } : {}) });
const BASE: DiscountPreset[] = [d('1레벨', 50_000, 1), d('학생', 20_000)];

describe('discountsAppendOnly — 할인은 뒤에 추가만 소급 안전하다', () => {
  it('🔴 그대로면 true', () => {
    expect(discountsAppendOnly(BASE, [d('1레벨', 50_000, 1), d('학생', 20_000)])).toBe(true);
  });

  it('🔴 뒤에 덧붙이면 true — 이것을 막고 있던 것이 이번 결함이다', () => {
    expect(discountsAppendOnly(BASE, [...BASE, d('얼리', 30_000, 2)])).toBe(true);
    expect(discountsAppendOnly([], [d('첫 할인', 10_000)])).toBe(true);
  });

  it('🔴 기존 자리의 금액을 바꾸면 false — 이미 기록된 바인의 적용금액이 소급 변형된다', () => {
    expect(discountsAppendOnly(BASE, [d('1레벨', 30_000, 1), d('학생', 20_000)])).toBe(false);
  });

  it('🔴 기존 자리의 라벨만 바꿔도 false — 라벨이 자리 식별에 쓰인다', () => {
    expect(discountsAppendOnly(BASE, [d('1LV', 50_000, 1), d('학생', 20_000)])).toBe(false);
  });

  it('🔴 기존 자리의 자동적용 레벨을 바꾸면 false', () => {
    expect(discountsAppendOnly(BASE, [d('1레벨', 50_000, 2), d('학생', 20_000)])).toBe(false);
  });

  it('🔴 길이를 줄이면 false — 뒤 자리를 참조하던 바인이 미아가 된다', () => {
    expect(discountsAppendOnly(BASE, [d('1레벨', 50_000, 1)])).toBe(false);
    expect(discountsAppendOnly(BASE, [])).toBe(false);
  });

  it('🔴 순서를 바꾸면 false — 자리번호가 곧 의미다', () => {
    expect(discountsAppendOnly(BASE, [d('학생', 20_000), d('1레벨', 50_000, 1)])).toBe(false);
  });

  it('🔴 level 미지정과 level 0 은 같은 것으로 본다(jsonb 에 키가 없을 수 있다)', () => {
    expect(discountsAppendOnly([d('학생', 20_000)], [{ label: '학생', amount: 20_000, level: 0 }])).toBe(true);
  });
});
