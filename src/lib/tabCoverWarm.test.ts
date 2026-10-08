// M3-02 warmHiddenPane — 숨은 판을 한 번 배치했다가 React 가 쥔 inline style 을 그대로 되돌리는가, 'later' 를 'skip' 과 구별하는가.
// 동작 효과(첫 진입 글꼴 인스턴스 생성이 클릭 프레임에서 빠짐)는 CPU4 하네스로 쟀다(fix-m3-02-1004.md). 여기는 계약만.
// 실행: npx vitest run src/lib/tabCoverWarm.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { warmHiddenPane } from './tabCover';

type FakePane = { dataset: { tab: string }; style: { cssText: string; display: string }; attrs: Set<string>; seen: string[]; offsetWidth: number };
let panes: FakePane[] = [];
let htmlAttrs = new Set<string>();
const mk = (tab: string, hidden: boolean): FakePane => {
  const p: FakePane = { dataset: { tab }, style: { cssText: hidden ? 'display: none;' : '', display: hidden ? 'none' : '' }, attrs: new Set(), seen: [], offsetWidth: 390 };
  panes.push(p);
  return p;
};
const el = (p: FakePane) => ({
  dataset: p.dataset,
  style: {
    get cssText() { return p.style.cssText; },
    set cssText(v: string) { p.style.cssText = v; p.style.display = /display:\s*block/.test(v) ? 'block' : /display:\s*none/.test(v) ? 'none' : ''; },
    get display() { return p.style.display; },
  },
  hasAttribute: (n: string) => p.attrs.has(n),
  get offsetHeight() { p.seen.push(p.style.cssText); return 100; },
  offsetWidth: p.offsetWidth,
  parentElement: { clientWidth: 390 },
});

beforeEach(() => {
  panes = []; htmlAttrs = new Set();
  vi.stubGlobal('window', { innerWidth: 390 });
  vi.stubGlobal('document', {
    hidden: false,
    documentElement: { hasAttribute: (n: string) => htmlAttrs.has(n) },
    querySelector: (sel: string) => { const m = /data-tab="([^"]+)"/.exec(sel); const p = panes.find((x) => x.dataset.tab === m?.[1]); return p ? el(p) : null; },
    querySelectorAll: () => panes.map(el),
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('warmHiddenPane', () => {
  it('숨은 판을 화면 밖 fixed·visibility hidden 으로 한 번 배치하고 inline style 을 바이트 그대로 되돌린다', () => {
    mk('home', false);
    const cal = mk('calendar', true);
    expect(warmHiddenPane('calendar')).toBe('done');
    expect(cal.seen).toHaveLength(1);
    expect(cal.seen[0]).toMatch(/display:block;position:fixed;.*width:390px;visibility:hidden/);
    expect(cal.style.cssText).toBe('display: none;');
  });
  it('보이는 판은 skip(이미 배치돼 있다) — 손대지 않는다', () => {
    const home = mk('home', false);
    expect(warmHiddenPane('home')).toBe('skip');
    expect(home.seen).toHaveLength(0);
  });
  it('아직 마운트 전 · 판 교체 중이면 later — 버리지 말고 다음에 다시', () => {
    // (2026-10-08 8차 INSTANT-SWAP) '떠나는 중(data-pane-leaving)' 상태는 없어졌다 — 판 교체는 한 프레임이다.
    expect(warmHiddenPane('calendar')).toBe('later');
    const live = mk('live', true);
    htmlAttrs.add('data-tab-swap');
    expect(warmHiddenPane('live')).toBe('later');
    expect(live.seen).toHaveLength(0);
  });
});
