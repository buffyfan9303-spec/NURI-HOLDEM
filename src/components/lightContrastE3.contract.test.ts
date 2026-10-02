// 2026-10-03 E3 M-2·L-7·L-9 — 라이트 모드에서 4.5:1 에 못 미치던 글자 5곳(design-reviewer 픽셀 실측: 4.06 · 4.36 · 2.28 · 3.24 · 4.36).
//   원인은 전부 같다: 틴트 배경 위에 한 단 연한 글자색을 쓰거나, 글자에 opacity 를 걸어 지면과 섞었다.
//   검증 방법: index.css 의 **실제 라이트 토큰**을 읽어 (지면 → 틴트 합성 → 글자색) 대비를 계산한다. 소스는 그 토큰을 쓰는지 확인한다.
//   (렌더된 픽셀 재측정은 로그인·관리자 목이 필요해 여기서 하지 않는다 — 계산은 보고서의 실측값 방향과 같은 값이다.)
// ⚠ 지워진 옛 클래스명을 이 파일에 그대로 쓰지 않는다 — Tailwind 가 문자열에서도 CSS 를 만든다(CLAUDE.md 참고 메모). 조립해서 쓴다.
// 실행: npx vitest run src/components/lightContrastE3.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');
const css = src('index.css');

type RGB = [number, number, number];
const lightBlock = css.slice(css.indexOf('html.light {'));
const light = (name: string): RGB => {
  const m = lightBlock.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
  if (!m) throw new Error(`라이트 토큰 ${name} 없음`);
  return [+m[1], +m[2], +m[3]];
};
const hex = (name: string): RGB => {
  const m = css.match(new RegExp(`--color-${name}:\\s*#([0-9a-fA-F]{6})`));
  if (!m) throw new Error(`색 ${name} 없음`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: RGB, b: RGB) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg: RGB, bg: RGB, a: number): RGB => fg.map((v, i) => v * a + bg[i] * (1 - a)) as RGB;

// 이 화면들이 앉는 라이트 지면 — 페이지 바닥(surface-base)·카드(surface-low)·보조 칸(surface-high)
const GROUNDS: [string, RGB][] = [['base', light('surface-base')], ['low', light('surface-low')], ['high', light('surface-high')]];
const AA = 4.5;

describe('라이트 모드 글자 대비 4.5:1 (M-2 · L-7 · L-9)', () => {
  it('ProfileModal — 순위표 표시 이름 선택 칸의 보조 줄: accent-300/12 틴트 위 ink-secondary', () => {
    const t = src('components/features/ProfileModal.tsx').split('\n').find((l) => l.includes('{hint}')) ?? '';
    expect(t).toContain('text-ink-secondary');
    for (const [n, g] of GROUNDS) expect(ratio(light('ink-secondary'), over(light('accent-300'), g, 0.12)), n).toBeGreaterThanOrEqual(AA);
  });

  it('ScheduleDetailModal — 결제수단 칩: emerald-500/15 틴트 위 emerald-800', () => {
    const s = src('components/features/ScheduleDetailModal.tsx');
    expect(s).toMatch(/const PAY_CHIP_INK = 'text-emerald-800 /);
    const chip = s.split('\n').find((l) => l.includes('bg-emerald-500/15') && l.includes('rounded-badge')) ?? '';
    expect(chip).toContain('${PAY_CHIP_INK}');
    for (const [n, g] of GROUNDS) expect(ratio(hex('emerald-800'), over(hex('emerald-500'), g, 0.15)), n).toBeGreaterThanOrEqual(AA);
  });

  it('ActivityBadges — 미획득 칩: 글자를 opacity 로 흐리지 않고 ink-muted 그대로(카드 지면 5.4)', () => {
    const s = src('components/atoms/ActivityBadges.tsx');
    expect(s).not.toMatch(/opacity\s*:/);
    expect(ratio(light('ink-muted'), light('surface-low'))).toBeGreaterThanOrEqual(AA);
  });

  it('UserManagementTab — 필터 알약 안 (수): 글자에 opacity 를 걸지 않는다(활성 흰 글자 · 비활성 ink-secondary)', () => {
    const l = src('components/features/UserManagementTab.tsx').split('\n').find((x) => x.includes("({count ?? '—'})")) ?? '';
    expect(l).not.toContain(['opacity', '70'].join('-'));
    expect(ratio([255, 255, 255], light('accent-300'))).toBeGreaterThanOrEqual(AA);
    for (const [n, g] of GROUNDS) expect(ratio(light('ink-secondary'), g), n).toBeGreaterThanOrEqual(AA);
  });

  it('StoreDashboard — 클락 카드 배지 \'미실행\': surface-float 위 ink-secondary', () => {
    const l = src('components/features/StoreDashboard.tsx').split('\n').find((x) => x.includes('>미실행</span>')) ?? '';
    expect(l).toContain('text-ink-secondary');
    expect(ratio(light('ink-secondary'), light('surface-float'))).toBeGreaterThanOrEqual(AA);
  });
});
