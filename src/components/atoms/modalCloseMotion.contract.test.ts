// M03(2026-10-08) — 가운데 모달 닫기: 투명도는 한 겹, 이동은 열기의 역방향.
//   열기: 본문 slide-up(+8px · 투명도 0→1) / 딤 dim-in 은 따로.
//   닫기(예전): 래퍼 fade-out + 본문 fade-out — 본문의 보이는 투명도가 o×o 로 곱해져 딤보다 먼저 꺼졌고, 열 때 올라온 8px 은 되짚지 않았다.
//   닫기(지금): 래퍼 fade-out(딤과 본문을 한 겹으로) + 본문 nudge-down(0 → +8px, 투명도 없음).
//   시트(slide-down)·드래그 닫기(dragClosed)·전면 page(PAGE_LEAVE)는 바뀌지 않는다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('M03 가운데 모달 닫기 모션', () => {
  const modal = read('components', 'atoms', 'Modal.tsx');
  const css = read('index.css');

  it('본문 닫기 분기: 시트는 slide-down, 가운데는 nudge-down(본문이 스스로 투명해지지 않는다)', () => {
    expect(modal).toMatch(/\(dragClosed \? '' : variant === 'sheet' \? 'animate-slide-down' : 'animate-nudge-down'\)/);
    // 래퍼(딤 포함)는 가운데 모달 닫기에서 여전히 fade-out 한 겹을 맡는다
    expect(modal).toMatch(/closing && variant !== 'sheet' \? 'animate-fade-out' : ''/);
  });

  it('nudge-down 은 slide-up 의 시작 거리(8px)로 되돌아가고 투명도를 건드리지 않는다', () => {
    const kf = stripComments(css).match(/@keyframes nudge-down \{([\s\S]*?)\n\s*\}/);
    expect(kf, 'nudge-down 키프레임을 못 찾았다').toBeTruthy();
    expect(kf![1]).toMatch(/translateY\(8px\)/);
    expect(kf![1]).not.toMatch(/opacity/);
    expect(stripComments(css)).toMatch(/@keyframes slide-up \{\s*from \{ transform: translateY\(8px\)/);
    // 래퍼 fade-out 과 같은 길이·곡선(0.18s) — 둘이 동시에 끝난다
    expect(css).toMatch(/--animate-nudge-down: nudge-down 0\.18s cubic-bezier\(0\.32, 0\.72, 0, 1\) forwards;/);
  });

  it('reduced-motion 목록과 keep-alive 무효화 목록에 등록돼 있다', () => {
    const rm = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\{ animation: none !important; \}/);
    expect(rm).toBeTruthy();
    expect(stripComments(rm![0])).toMatch(/\.animate-nudge-down\b/);
    expect(stripComments(css)).toMatch(/\.tab-pane :is\([^)]*\.animate-nudge-down[^)]*\):not\(\.fixed\)/);
  });
});
