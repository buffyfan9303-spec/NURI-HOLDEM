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

  // P3(2026-10-09) — 동작 측정은 390 하네스(PR 본문)가 했다. jsdom 에는 WAAPI 가 없어 여기서는 배선만 잠근다.
  it('열기 도중 닫기: 클래스가 바뀌기 전에 보이는 값을 읽고, 닫힘 키프레임의 출발점을 그 값으로 바꾼다', () => {
    const code = modal.replace(/^\s*\/\/.*$/gm, '');
    const openEff = code.match(/useLayoutEffect\(\(\) => \{\s*if \(open\) \{[\s\S]*?\}, \[open\]\);/);
    expect(openEff, '[open] 효과를 못 찾았다').toBeTruthy();
    // 읽기(getComputedStyle)가 setClosing(true) 보다 앞 — 뒤에 오면 열림 애니가 이미 취소돼 끝값만 읽힌다
    expect(openEff![0].indexOf('getComputedStyle')).toBeGreaterThan(-1);
    expect(openEff![0].indexOf('getComputedStyle')).toBeLessThan(openEff![0].indexOf('setClosing(true)'));
    const closeEff = code.match(/useLayoutEffect\(\(\) => \{\s*if \(!closing \|\| open\) return;[\s\S]*?\}, \[closing, open\]\);/);
    expect(closeEff, '[closing, open] 효과를 못 찾았다').toBeTruthy();
    expect(closeEff![0]).toMatch(/setKeyframes\(\[\{ \.\.\.from,/);
  });

  // 🔴 #246 CI 회귀(2026-10-09, e2e/spot-tab-keepalive.spec.ts:109 '공유 확인 시트가 열리지 않는다' 3회 연속).
  //   닫힌 채 마운트 → 같은 커밋의 효과가 open 을 올리면 React 19 가 setClosing(true) 와 묶어 한 렌더로 돌린다.
  //   닫힘 효과가 open 을 안 보면 본문 없음(돌 애니 0개) → setRender(false) 가 setRender(true) 를 이겨 열린 모달이 안 그려진다.
  //   실제 동작은 위 e2e 가 잠근다(jsdom 없음). 여기서는 '열려 있으면 닫힘 단계를 돌지 않는다' 배선만 본다.
  it('열려 있는 동안에는 닫힘 단계(키프레임 교체·언마운트)를 돌지 않는다 — 닫힌 채 마운트 직후 열리는 모달', () => {
    const code = modal.replace(/^\s*\/\/.*$/gm, '');
    const closeEff = code.match(/useLayoutEffect\(\(\) => \{\s*(if \([^)]*\) return;)[\s\S]*?\}, \[([^\]]*)\]\);/g)
      ?.find((m) => m.includes('setKeyframes'));
    expect(closeEff, '닫힘 효과(setKeyframes 를 가진 useLayoutEffect)를 못 찾았다').toBeTruthy();
    const [, guard, deps] = closeEff!.match(/^useLayoutEffect\(\(\) => \{\s*(if \([^)]*\) return;)[\s\S]*\}, \[([^\]]*)\]\);$/)!;
    expect(guard, '닫힘 효과의 첫 줄이 open 을 보지 않는다 — 열린 채로 setRender(false) 가 돈다').toMatch(/\|\|\s*open\b/);
    expect(deps.split(',').map((s) => s.trim()), '닫힘 효과 deps 에 open 이 없다 — 같은 렌더에서 open 이 올라도 다시 판정하지 않는다').toContain('open');
  });

  it('언마운트는 고정 타이머가 아니라 닫힘 모션 finished 뒤 · reduced-motion 이면 같은 커밋', () => {
    const code = modal.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/setTimeout\(\(\) => setRender\(false\), \d+\)/);
    expect(code).toMatch(/\.map\(\(a\) => a\.finished\)\)\.then\(unmount, unmount\)/);
    expect(code).toMatch(/if \(anims\.length\) void Promise\.all\([^;]*\.then\(unmount, unmount\); else unmount\(\);/);   // 돌 모션 0개(RM) = 같은 커밋
  });

  it('reduced-motion 목록과 keep-alive 무효화 목록에 등록돼 있다', () => {
    const rm = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\{ animation: none !important; \}/);
    expect(rm).toBeTruthy();
    expect(stripComments(rm![0])).toMatch(/\.animate-nudge-down\b/);
    expect(stripComments(css)).toMatch(/\.tab-pane :is\([^)]*\.animate-nudge-down[^)]*\):not\(\.fixed\)/);
  });
});
