// 레인지 매트릭스 셀 글자색 — 칸 배경 명도 규칙 (2026-09-25 전수 스윕: 라이트 혼합 칸 흰 글자 1.0~1.98).
// 실행: npx vitest run src/components/features/tools/cellText.test.ts
import { describe, it, expect } from 'vitest';
import { ACTION_COLORS } from '../../../lib/ranges.data';
import { TEXT_DARK, TEXT_LIGHT, contrastRatio, hexToRgb, pickCellText, type Rgb } from './cellText';

const DARK: Rgb = [27, 36, 60];      // --surface-high 다크 #1B243C
const LIGHT: Rgb = [238, 242, 248];  // --surface-high 라이트 #EEF2F8
const seg = (color: string, f: number) => [{ color, from: 0, to: f }];
const STEPS = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

describe('pickCellText — 지면색을 본다', () => {
  it('🔴 라이트 지면의 반쯤 채운 칸은 검은 글자 — 예전 규칙(total>0.45 → 흰)은 여기서 1.12 였다', () => {
    const r = pickCellText(seg(ACTION_COLORS.raise, 0.5), LIGHT);
    expect(r.color).toBe(TEXT_DARK);
    expect(r.worst).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexToRgb(TEXT_LIGHT), LIGHT)).toBeLessThan(1.2);   // 옛 선택의 실제 대비
  });
  it('다크 지면의 반쯤 채운 레이즈 칸은 흰 글자', () => {
    expect(pickCellText(seg(ACTION_COLORS.raise, 0.5), DARK)).toMatchObject({ color: TEXT_LIGHT });
  });
  it('띠(30~70%) 밖의 얕은 채움(≤25%)은 지면색만 본다 — 라이트 검정·다크 흰', () => {
    expect(pickCellText(seg(ACTION_COLORS.call, 0.25), LIGHT).color).toBe(TEXT_DARK);
    expect(pickCellText(seg(ACTION_COLORS.call, 0.25), DARK).color).toBe(TEXT_LIGHT);
    expect(pickCellText([], LIGHT).color).toBe(TEXT_DARK);
  });
  it('🔴 라이트 모드 — 세 액션 × 8단 채움 전부 4.5:1 이상(레이즈 채움 #606CD4 는 흰·검 모두 ≥4.5 가 되게 2단 밝혔다)', () => {
    const bad: string[] = [];
    for (const [k, c] of Object.entries(ACTION_COLORS)) if (k !== 'fold') for (const f of STEPS) {
      const r = pickCellText(seg(c, f), LIGHT);
      if (r.worst < 4.5) bad.push(`${k} f=${f} ${r.color} ${r.worst.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });
  it('다크 모드 — 가득 찬 칸은 전부 4.5 이상, 띠에 걸친 콜·4벳 칸만 채움색 한계(콜 2.54 · 4벳 4.23)로 남는다', () => {
    const residual: string[] = [];
    for (const [k, c] of Object.entries(ACTION_COLORS)) if (k !== 'fold') for (const f of STEPS) {
      const r = pickCellText(seg(c, f), DARK);
      if (r.worst < 4.5) residual.push(`${k} f=${f}`);
    }
    // 흰 글자로는 콜(#10B981) 2.54 · 4벳(#8B5CF6) 4.23 이 상한, 검은 글자는 다크 지면과 1.36 — 어느 쪽도 4.5 를 못 넘는 띠.
    expect(residual).toEqual([
      'call f=0.375', 'call f=0.5', 'call f=0.625',
      'fourbet f=0.375', 'fourbet f=0.5', 'fourbet f=0.625',
    ]);
    for (const f of [0.75, 1]) for (const c of [ACTION_COLORS.raise, ACTION_COLORS.call, ACTION_COLORS.fourbet]) expect(pickCellText(seg(c, f), DARK).worst).toBeGreaterThanOrEqual(4.5);
  });
  it('겹쳐 쌓인 두 액션(레이즈 50% + 콜 25%)은 띠에 걸친 조각 둘과 지면을 함께 본다', () => {
    const segs = [{ color: ACTION_COLORS.raise, from: 0, to: 0.5 }, { color: ACTION_COLORS.call, from: 0.5, to: 0.75 }];
    const r = pickCellText(segs, LIGHT);
    expect(r.color).toBe(TEXT_DARK);
    expect(r.worst).toBeGreaterThanOrEqual(4.5);
  });
});
