// BOTTOM-TAB-SMOOTH 덮개 — 기기별 스위치 해석 + 준비 판정 + App.tsx 배선 계약. 동작(프레임·휘도)은 e2e/pill-flash.spec.ts 가 잰다.
// 🔴 5차 PILL-FLASH(2026-09-26): 덮개 자체가 '검정 판 → 콘텐츠' 깜빡임이었다 — 이제 덮개를 그리지 않는다(tabCover.ts 5차 절).
//   ② 가 그것을 잠근다. 음성 대조(2026-09-26 실행): 옛 tabCover.ts(덮개 opacity 1 → 준비 대기 → 280ms)로 되돌리면
//   ② 두 건이 빨개진다(display block · animate 호출). 되돌린 파일은 즉시 복원하고 해시를 대조했다.
// 2026-09-26 정리: 덮개 요소·호출·`?fx=` 스위치를 걷으며 ①(스위치)·②(덮개 호출)·④(App 덮개 배선)를 지웠다.
//   남은 것 — 준비 판정(tabPaneReady·isSettled·waitSettled), 하위 탭 P2 스크롤 배선, LazyFallback 준비 표식, App 에 덮개가 되살아나지 않았는지.
// 실행: npx vitest run src/lib/tabCover.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  tabPaneReady, isSettled, waitSettled, SUB_PANEL, OWN_SCROLL_SCOPES, TAB_COVER_WAIT_MAX_MS,
} from './tabCover';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('③ 준비 판정(tabPaneReady · waitSettled)', () => {
  // node 환경(jsdom 없음) — tabCover 가 쓰는 DOM 면만 흉내 낸다.
  type Fake = { style: Record<string, string>; offsetHeight: number; shown: boolean; tab?: string;
    querySelectorAll?: () => unknown[]; getBoundingClientRect?: () => { top: number; bottom: number; left: number; width: number } };
  let panes: Fake[] = [];
  let reserves: Fake[] = [];
  let frames: FrameRequestCallback[] = [];
  let now = 0;
  let wide = false;
  let reducedMotion = false;
  const flush = (ms = 16) => { now += ms; const f = frames; frames = []; f.forEach((cb) => cb(now)); };
  const rects = (f: Fake) => ({ length: f.shown ? 1 : 0 });
  const pane = (tab: string, h: number): Fake => {
    const p: Fake = { style: { display: '' }, offsetHeight: h, shown: true, tab, querySelectorAll: () => [],
      getBoundingClientRect: () => ({ top: 104, bottom: 104 + p.offsetHeight, left: 108, width: 1224 }) };
    panes.push(p); return p;
  };
  const reserve = (shown: boolean): Fake => { const r = { style: {}, offsetHeight: 400, shown }; reserves.push(r); return r; };
  beforeEach(() => {
    panes = []; reserves = []; frames = []; now = 0; wide = false; reducedMotion = false;
    vi.stubGlobal('document', {
      querySelectorAll: (sel: string) => (sel === '.pane-reserve[aria-busy="true"]' ? reserves.map((r) => ({ getClientRects: () => rects(r) })) : []),
      querySelector: (sel: string) => (sel === '[data-stack-tabbar]'
        ? { getBoundingClientRect: () => ({ bottom: 104 }) }
        : panes.find((p) => sel === `.tab-pane[data-tab="${p.tab}"]`) ?? null),
    });
    vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900,
      matchMedia: (q: string) => ({ matches: q.includes('reduce') ? reducedMotion : wide }) });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('tabPaneReady: 로딩 자리(.pane-reserve[aria-busy])가 보이거나, 판이 숨었거나 높이 0 이면 아직이다', () => {
    const p = pane('tools', 0);
    expect(tabPaneReady('tools')).toBe(false); // 높이 0
    p.offsetHeight = 900;
    expect(tabPaneReady('tools')).toBe(true);
    p.style.display = 'none'; // Suspense 폴백 중 React 가 숨긴 기존 자식
    expect(tabPaneReady('tools')).toBe(false);
    p.style.display = '';
    const r = reserve(true);
    expect(tabPaneReady('tools')).toBe(false);
    r.shown = false; // 숨은 탭 안의 자리 예약은 무관
    expect(tabPaneReady('tools')).toBe(true);
    expect(tabPaneReady('event')).toBe(true); // 판 없이 여는 목적지
  });

  it('③ waitSettled — 판정 통과 + 높이 두 프레임 연속 같을 때 한 번 부르고, 상한을 넘기면 그래도 부른다', () => {
    const p = pane('tools', 0);
    const ready = vi.fn();
    waitSettled(() => document.querySelector('.tab-pane[data-tab="tools"]'), ready);
    flush(); flush();
    expect(ready).not.toHaveBeenCalled(); // 높이 0 — 아직
    p.offsetHeight = 900;
    flush();
    expect(ready).not.toHaveBeenCalled(); // 높이가 한 프레임만 같다
    flush();
    expect(ready).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    pane('gto', 0);
    waitSettled(() => document.querySelector('.tab-pane[data-tab="gto"]'), late);
    flush(TAB_COVER_WAIT_MAX_MS - 20);
    expect(late).not.toHaveBeenCalled();
    flush(40);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe('⑤ 단일 준비 판정 isSettled — 판 안 스켈레톤·aria-busy 까지 본다(4차)', () => {
  const el = (tag: string, r: { top: number; h: number }, shown = true) => ({
    tagName: tag, getClientRects: () => ({ length: shown ? 1 : 0 }),
    getBoundingClientRect: () => ({ top: r.top, bottom: r.top + r.h, width: 300, height: r.h }),
  });
  let inner: unknown[] = [];
  const root = { style: { display: '' }, offsetHeight: 800, querySelectorAll: () => inner } as unknown as Element;
  beforeEach(() => {
    inner = [];
    vi.stubGlobal('document', { querySelectorAll: () => [] });
    vi.stubGlobal('window', { innerHeight: 844 });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('화면에 걸친 스켈레톤(invisible 예약 포함 — 레이아웃 박스가 있으면)이 있으면 아직이다', () => {
    expect(isSettled(root)).toBe(true);
    inner = [el('DIV', { top: 200, h: 900 })];
    expect(isSettled(root)).toBe(false); // 첫 방문 라이브의 200ms 게이트 invisible 예약이 이것이다
  });
  it('화면 밖(아래) 로딩·숨은(display none) 로딩은 기다리지 않는다', () => {
    inner = [el('DIV', { top: 1200, h: 100 }), el('DIV', { top: 100, h: 50 }, false)];
    expect(isSettled(root)).toBe(true);
  });
  it('동작 중 버튼·인라인 집계 글자의 aria-busy 는 판 모양을 안 바꾸므로 안 기다린다(상시 700ms 대기 방지)', () => {
    inner = [el('BUTTON', { top: 100, h: 44 }), el('SPAN', { top: 300, h: 19 })];
    expect(isSettled(root)).toBe(true);
  });
});

describe('⑥ 하위 탭 25곳이 같은 전환(P2 스크롤)을 탄다 — goSubTab scope ↔ SUB_PANEL ↔ 판 표식', () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx$/.test(n)) files.push(p); } };
  walk(resolve(process.cwd(), 'src'));
  const calls: { file: string; scope: string }[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf-8');
    for (const m of src.matchAll(/goSubTab\(\s*'([\w-]+)'/g)) calls.push({ file: f, scope: m[1] });
  }
  it('앵커 — 호출부를 실제로 찾았다(공허한 초록 방지)', () => {
    expect(calls.length).toBeGreaterThanOrEqual(20);
  });
  it('모든 scope 에 판 선택자가 있고, 그 판 표식이 **같은 파일**에 실제로 있다', () => {
    const missing = calls.filter((c) => !SUB_PANEL[c.scope]).map((c) => `${c.file}: ${c.scope}`);
    expect(missing, 'SUB_PANEL 에 없는 하위 탭 — 덮개 없이 컷으로 바뀐다. src/lib/tabCover.ts 에 한 줄 추가').toEqual([]);
    const noPanel = calls.filter((c) => {
      const attr = /\[(data-[\w-]+)\]/.exec(SUB_PANEL[c.scope])![1];
      return !readFileSync(c.file, 'utf-8').includes(attr);
    }).map((c) => `${c.file}: ${c.scope} → ${SUB_PANEL[c.scope]}`);
    expect(noPanel, '판 표식이 그 화면에 없다 — 덮개가 엉뚱한 판을 덮거나 아무것도 안 덮는다').toEqual([]);
  });
  it('goSubTab 은 commit() 바로 뒤에 alignSubTabPanel(P2 스크롤)을 부른다(한 줄이 25곳을 먹인다 · 덮개 없음)', () => {
    const g = readFileSync(resolve(process.cwd(), 'src/lib/subTabTransition.ts'), 'utf-8').replace(/\/\/[^\n]*/g, '');
    const i = g.indexOf('commit();');
    expect(i).toBeGreaterThan(0);
    expect(g.slice(i, i + 200)).toMatch(/alignSubTabPanel\(scope,/);
  });
  it('섹션별 복원이 있는 커뮤니티만 공용 스크롤 맞춤에서 뺀다', () => {
    expect([...OWN_SCROLL_SCOPES]).toEqual(['community-sec']);
  });
});

describe('④ App.tsx — 덮개는 없다 · 준비 표식은 남는다', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
  it('덮개 요소·호출·스위치가 App 에 되살아나지 않았다(5차 PILL-FLASH — 판 위 불투명 한 장은 이미 그려진 판도 가린다)', () => {
    expect(app).not.toMatch(/data-tab-cover|playTabCover|isTabCoverOn|TAB_COVER_TOP/);
  });
  it('준비 신호의 짝 — LazyFallback 이 .pane-reserve + aria-busy="true" 를 유지한다(isSettled ① 이 이 표식을 본다)', () => {
    const m = app.match(/function LazyFallback\(\)[\s\S]{0,400}?\n}/);
    expect(m, 'LazyFallback 이 사라졌다 — isSettled 의 표식을 같이 고쳐라').not.toBeNull();
    expect(m![0]).toMatch(/pane-reserve/);
    expect(m![0]).toMatch(/aria-busy="true"/);
  });
});
