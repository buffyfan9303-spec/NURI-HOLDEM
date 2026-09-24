// BOTTOM-TAB-SMOOTH 덮개 — 기기별 스위치 해석 + 키프레임 + 준비 대기 + App.tsx 배선 계약. 동작(프레임)은 e2e/tab-cover.spec.ts 가 잰다.
// 음성 대조(2026-09-24 확인): TAB_COVER_DEFAULT_ON 을 false 로 바꾸면 ①의 '기본 켜짐' 이,
//   키프레임에 transform 을 섞거나 머묾 구간을 빼면 ② 가, playTabCover 가 준비를 기다리지 않고 바로 걷으면 ③ 이,
//   App.tsx 의 playTabCover 호출을 layout effect 밖으로 옮기거나 목적지 탭을 넘기지 않으면 ④ 가 빨개진다.
// 실행: npx vitest run src/lib/tabCover.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  nextTabCoverValue, tabCoverOnFor, tabCoverKeyframes, tabPaneReady, playTabCover, resetTabCoverCache, isSettled,
  SUB_PANEL, OWN_SCROLL_SCOPES, TAB_COVER_DEFAULT_ON, TAB_COVER_MS, TAB_COVER_WAIT_MAX_MS,
} from './tabCover';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('① 기기별 스위치', () => {
  it('기본 켜짐(2026-09-24 리드 결정) — 스위치 없는 기기는 켜짐', () => {
    expect(TAB_COVER_DEFAULT_ON).toBe(true);
    expect(tabCoverOnFor(nextTabCoverValue('', null))).toBe(true);
  });
  it('?fx=off 는 그 기기만 끄고 저장한다 — URL 없이도 유지, ?fx=tabsoft 로 다시 켠다', () => {
    expect(nextTabCoverValue('?fx=off', null)).toBe('off');
    expect(nextTabCoverValue('?tab=home', 'off')).toBe('off');
    expect(tabCoverOnFor('off')).toBe(false);
    expect(nextTabCoverValue('?fx=tabsoft', 'off')).toBe('tabsoft');
  });
  it('3차: 지운 ?fx=tabfade 는 무시되고, 저장돼 있던 tabfade 도 미지정(=기본 켜짐)으로 정리된다', () => {
    expect(nextTabCoverValue('?fx=tabfade', null)).toBeNull();
    expect(nextTabCoverValue('', 'tabfade')).toBeNull();
    expect(nextTabCoverValue('?fx=tabfade', 'off')).toBe('off');
    expect(tabCoverOnFor(nextTabCoverValue('', 'tabfade'))).toBe(true);
  });
  it('전체 끄기(기본값 false)면 스위치 없는 기기는 꺼지고, 켠 기기만 남는다', () => {
    expect(tabCoverOnFor(null, false)).toBe(false);
    expect(tabCoverOnFor('tabsoft', false)).toBe(true);
  });
  it('모르는 값·오염된 저장값은 무시한다', () => {
    for (const v of ['bogus', 'tabwipe', 'tabrise', 'TABSOFT']) expect(nextTabCoverValue(`?fx=${v}`, null)).toBeNull();
    expect(nextTabCoverValue('', 'garbage')).toBeNull();
  });
});

describe('② 키프레임 — opacity 만, 첫 프레임 1(K-07)', () => {
  it('opacity 외 속성이 없고 1 에서 0 으로', () => {
    const kf = tabCoverKeyframes();
    for (const f of kf) expect(Object.keys(f).filter((k) => !['opacity', 'offset', 'easing'].includes(k))).toEqual([]);
    expect(kf[0].opacity).toBe(1);
    expect(kf.at(-1)!.opacity).toBe(0);
  });
  it('약 280ms, 첫 40~60ms 는 거의 불투명(≥0.95)으로 머문 뒤 감속 곡선으로 풀린다', () => {
    expect(TAB_COVER_MS).toBeGreaterThanOrEqual(260);
    expect(TAB_COVER_MS).toBeLessThanOrEqual(300);
    const kf = tabCoverKeyframes();
    const holdMs = kf[1].offset! * TAB_COVER_MS;
    expect(holdMs).toBeGreaterThanOrEqual(40);
    expect(holdMs).toBeLessThanOrEqual(60);
    expect(Number(kf[1].opacity)).toBeGreaterThanOrEqual(0.95);
    expect(String(kf[1].easing)).toMatch(/^cubic-bezier/);
  });
});

describe('③ 준비 대기 — 목적지 판이 그려진 뒤에만 걷는다', () => {
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
  let cover: HTMLElement;
  let animate: ReturnType<typeof vi.fn>;
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
    resetTabCoverCache();
    animate = vi.fn(() => ({ onfinish: null }));
    cover = { style: { display: '', opacity: '' }, animate, getAnimations: () => [] } as unknown as HTMLElement;
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

  it('판이 늦게 그려지면 그동안 덮개는 opacity 1 로 머물고, 그려진 프레임에 걷기를 시작한다', () => {
    const fb = reserve(true); // 첫 방문 lazy 서스펜드 — 판은 아직 없고 폴백만 보인다
    playTabCover(cover, 'tools');
    expect(cover.style.display).toBe('block');
    expect(cover.style.opacity).toBe('1');
    for (let i = 0; i < 20; i++) flush(); // 320ms
    expect(animate).not.toHaveBeenCalled();
    fb.shown = false;
    pane('tools', 900);
    flush(); // 4차: 높이가 **두 프레임 연속** 같아야 걷는다(늦은 붕괴를 덮개 아래서 끝낸다)
    expect(animate).not.toHaveBeenCalled();
    flush();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: TAB_COVER_MS });
  });

  it('상한을 넘기면 준비와 상관없이 걷는다(영원히 덮지 않는다)', () => {
    pane('tools', 0);
    playTabCover(cover, 'tools');
    flush(TAB_COVER_WAIT_MAX_MS - 20);
    expect(animate).not.toHaveBeenCalled();
    flush(40);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('연타 — 새 이동이 이긴다(앞 이동의 대기는 걷기를 시작하지 않는다)', () => {
    playTabCover(cover, 'tools'); // 판 높이 0 — 대기
    const t = pane('tools', 0);
    pane('community', 500);
    playTabCover(cover, 'community');
    flush(); flush(); // 높이 정지 확인에 두 프레임
    expect(animate).toHaveBeenCalledTimes(1);
    t.offsetHeight = 900;
    flush(); flush();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('동작 줄이기면 아무것도 하지 않는다', () => {
    reducedMotion = true;
    playTabCover(cover, 'tools');
    expect(cover.style.display).toBe('');
    expect(frames).toEqual([]);
  });

  it('4차: PC 도 같은 덮개를 탄다 — GNB 밑·콘텐츠 열 폭만(좌우 채움 배경·GNB 는 안 덮는다)', () => {
    wide = true;
    pane('tools', 600);
    playTabCover(cover, 'tools');
    expect(cover.style.display).toBe('block');
    expect(cover.style.top).toBe('104px');
    expect(cover.style.left).toBe('108px');
    expect(cover.style.width).toBe('1224px');
    expect(cover.style.height).toBe('600px');
    flush(); flush();
    expect(animate).toHaveBeenCalledTimes(1);
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

describe('⑥ 하위 탭 25곳이 같은 덮개를 탄다 — goSubTab scope ↔ SUB_PANEL ↔ 판 표식', () => {
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
  it('goSubTab 은 commit() 바로 뒤에 playSubTabCover 를 부른다(한 줄이 25곳을 먹인다)', () => {
    const g = readFileSync(resolve(process.cwd(), 'src/lib/subTabTransition.ts'), 'utf-8').replace(/\/\/[^\n]*/g, '');
    const i = g.indexOf('commit();');
    expect(i).toBeGreaterThan(0);
    expect(g.slice(i, i + 200)).toMatch(/playSubTabCover\(scope,/);
  });
  it('섹션별 복원이 있는 커뮤니티만 공용 스크롤 맞춤에서 뺀다', () => {
    expect([...OWN_SCROLL_SCOPES]).toEqual(['community-sec']);
  });
});

describe('④ App.tsx 배선', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
  it('덮개는 스크롤 맨 위로와 **같은 useLayoutEffect** 안에서, 목적지 탭을 넘겨 시작한다(첫 페인트 — K-07)', () => {
    const i = app.indexOf('playTabCover(tabCoverRef.current, activeTab)');
    expect(i).toBeGreaterThan(0);
    const effStart = app.lastIndexOf('useLayoutEffect(() => {', i);
    const between = app.slice(effStart, i);
    expect(between).toContain("window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });");
    expect(between).not.toMatch(/useEffect\(|requestAnimationFrame\(/);
  });
  it('덮개 요소는 .tab-pane 밖의 fixed·pointer-events-none 한 장이다(본문 레이어·클릭을 건드리지 않는다)', () => {
    const tag = app.slice(app.indexOf('<div ref={tabCoverRef}'), app.indexOf('/>', app.indexOf('<div ref={tabCoverRef}')));
    expect(tag).toMatch(/data-tab-cover/);
    expect(tag).toMatch(/pointer-events-none fixed/);
    expect(tag).toMatch(/\bhidden\b/);
    expect(tag).toMatch(/opacity-0/);
    expect(app.indexOf('<div ref={tabCoverRef}')).toBeLessThan(app.indexOf('className="tab-pane'));
  });
  it('준비 신호의 짝 — LazyFallback 이 .pane-reserve + aria-busy="true" 를 유지한다(빠지면 덮개가 폴백 위에서 걷힌다)', () => {
    const m = app.match(/function LazyFallback\(\)[\s\S]{0,400}?\n}/);
    expect(m, 'LazyFallback 이 사라졌다 — tabPaneReady 의 표식을 같이 고쳐라').not.toBeNull();
    expect(m![0]).toMatch(/pane-reserve/);
    expect(m![0]).toMatch(/aria-busy="true"/);
  });
});
