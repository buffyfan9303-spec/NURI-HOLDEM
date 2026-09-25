// 레인지 매트릭스 셀 글자색 — 칸 배경 명도 규칙 (2026-09-25 전수 스윕: 라이트 혼합 칸 흰 글자 1.0~1.98)
// + 테마별 채움색(2026-09-26 RANGE-COLORS-AURA: 다크 콜 2.54·4벳 4.23·폴드 글자 1.98/2.27 은 채움색을 바꿔야 넘는다).
// 실행: npx vitest run src/components/features/tools/cellText.test.ts
import { describe, it, expect } from 'vitest';
import { RANGE_FILL, toneOfKey } from '../../../lib/rangeColors';
import { TEXT_DARK, TEXT_LIGHT, contrastRatio, hexToRgb, pickCellText, type Rgb } from './cellText';

const DARK: Rgb = [27, 36, 60];      // --surface-high 다크 #1B243C
const LIGHT: Rgb = [238, 242, 248];  // --surface-high 라이트 #EEF2F8
const INK_MUTED_DARK = '#8293AD';    // --ink-muted 다크 (src/index.css)
const INK_MUTED_LIGHT = '#5C6B8A';   // --ink-muted 라이트
const seg = (color: string, f: number) => [{ color, from: 0, to: f }];
const STEPS = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

describe('pickCellText — 지면색을 본다', () => {
  it('🔴 라이트 지면의 반쯤 채운 칸은 검은 글자 — 예전 규칙(total>0.45 → 흰)은 여기서 1.12 였다', () => {
    const r = pickCellText(seg(RANGE_FILL.light.raise, 0.5), LIGHT);
    expect(r.color).toBe(TEXT_DARK);
    expect(r.worst).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexToRgb(TEXT_LIGHT), LIGHT)).toBeLessThan(1.2);   // 옛 선택의 실제 대비
  });
  it('다크 지면의 반쯤 채운 레이즈 칸은 흰 글자', () => {
    expect(pickCellText(seg(RANGE_FILL.dark.raise, 0.5), DARK)).toMatchObject({ color: TEXT_LIGHT });
  });
  it('띠(30~70%) 밖의 얕은 채움(≤25%)은 지면색만 본다 — 라이트 검정·다크 흰', () => {
    expect(pickCellText(seg(RANGE_FILL.light.call, 0.25), LIGHT).color).toBe(TEXT_DARK);
    expect(pickCellText(seg(RANGE_FILL.dark.call, 0.25), DARK).color).toBe(TEXT_LIGHT);
    expect(pickCellText([], LIGHT).color).toBe(TEXT_DARK);
  });
  it('겹쳐 쌓인 두 액션(레이즈 50% + 콜 25%)은 띠에 걸친 조각 둘과 지면을 함께 본다 — 두 테마 모두 4.5 이상', () => {
    for (const [fill, surface, want] of [[RANGE_FILL.light, LIGHT, TEXT_DARK], [RANGE_FILL.dark, DARK, TEXT_LIGHT]] as const) {
      const r = pickCellText([{ color: fill.raise, from: 0, to: 0.5 }, { color: fill.call, from: 0.5, to: 0.75 }], surface);
      expect(r.color).toBe(want);
      expect(r.worst).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('RANGE_FILL — 테마별 채움색은 모든 채움 단계에서 글자 4.5:1 이상 (2026-09-26)', () => {
  it('🔴 다크: 세 톤 × 8단 채움 전부 흰 글자 ≥4.5 — 9/25 에 남았던 콜 f=0.375~0.625(2.54)·4벳(4.23) 이 없다', () => {
    const bad: string[] = [];
    for (const [k, c] of Object.entries(RANGE_FILL.dark)) for (const f of STEPS) {
      const r = pickCellText(seg(c, f), DARK);
      if (r.worst < 4.5 || r.color !== TEXT_LIGHT) bad.push(`${k} f=${f} ${r.color} ${r.worst.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });
  it('🔴 라이트: 세 톤 × 8단 채움 전부 검은 글자 ≥4.5', () => {
    const bad: string[] = [];
    for (const [k, c] of Object.entries(RANGE_FILL.light)) for (const f of STEPS) {
      const r = pickCellText(seg(c, f), LIGHT);
      if (r.worst < 4.5 || r.color !== TEXT_DARK) bad.push(`${k} f=${f} ${r.color} ${r.worst.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });
  it('음성 대조 — 옛 채움색(콜 #10B981·4벳 #8B5CF6)을 다크 띠에 놓으면 이 검사가 실제로 빨개진다', () => {
    expect(pickCellText(seg('#10B981', 0.5), DARK).worst).toBeLessThan(4.5);   // 2.54
    expect(pickCellText(seg('#8B5CF6', 0.5), DARK).worst).toBeLessThan(4.5);   // 4.23
  });
  it('채움색은 지면과도 구별된다(빈 칸과 헷갈리지 않게 ≥2.3) — 아우라 지면 위 바이올렛·틸·푸시아', () => {
    for (const c of Object.values(RANGE_FILL.dark)) expect(contrastRatio(hexToRgb(c), DARK)).toBeGreaterThanOrEqual(2.3);
    for (const c of Object.values(RANGE_FILL.light)) expect(contrastRatio(hexToRgb(c), LIGHT)).toBeGreaterThanOrEqual(2.3);
  });
  it('폴드 칸 글자(ink-muted 불투명)는 지면 위 4.5 이상 — /50 이던 때는 1.98(라이트)/2.27(다크)', () => {
    expect(contrastRatio(hexToRgb(INK_MUTED_DARK), DARK)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexToRgb(INK_MUTED_LIGHT), LIGHT)).toBeGreaterThanOrEqual(4.5);
  });
  it('toneOfKey — 레인지 표 키와 푸시폴드 뷰 키를 한 규칙으로 받는다', () => {
    expect(['raise', 'allin', 'shove'].map(toneOfKey)).toEqual(['raise', 'raise', 'raise']);
    expect(['call', 'callBB', 'callSB'].map(toneOfKey)).toEqual(['call', 'call', 'call']);
    expect(toneOfKey('fourbet')).toBe('fourbet');
  });
});
