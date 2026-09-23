// BOTTOM-TAB-SMOOTH 덮개 — 기기별 스위치 해석 + 키프레임 + 준비 대기 + App.tsx 배선 계약. 동작(프레임)은 e2e/tab-cover.spec.ts 가 잰다.
// 음성 대조(2026-09-24 확인): TAB_COVER_DEFAULT_ON 을 false 로 바꾸면 ①의 '기본 켜짐' 이,
//   키프레임에 transform 을 섞거나 머묾 구간을 빼면 ② 가, playTabCover 가 준비를 기다리지 않고 바로 걷으면 ③ 이,
//   App.tsx 의 playTabCover 호출을 layout effect 밖으로 옮기거나 목적지 탭을 넘기지 않으면 ④ 가 빨개진다.
// 실행: npx vitest run src/lib/tabCover.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  nextTabCoverValue, tabCoverOnFor, tabCoverKeyframes, tabPaneReady, playTabCover, resetTabCoverCache,
  TAB_COVER_DEFAULT_ON, TAB_COVER_MS, TAB_COVER_WAIT_MAX_MS,
} from './tabCover';

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
  type Fake = { style: Record<string, string>; offsetHeight: number; shown: boolean; tab?: string };
  let panes: Fake[] = [];
  let reserves: Fake[] = [];
  let frames: FrameRequestCallback[] = [];
  let now = 0;
  let wide = false;
  const flush = (ms = 16) => { now += ms; const f = frames; frames = []; f.forEach((cb) => cb(now)); };
  const rects = (f: Fake) => ({ length: f.shown ? 1 : 0 });
  const pane = (tab: string, h: number): Fake => { const p = { style: { display: '' }, offsetHeight: h, shown: true, tab }; panes.push(p); return p; };
  const reserve = (shown: boolean): Fake => { const r = { style: {}, offsetHeight: 400, shown }; reserves.push(r); return r; };
  let cover: HTMLElement;
  let animate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    panes = []; reserves = []; frames = []; now = 0; wide = false;
    vi.stubGlobal('document', {
      querySelectorAll: (sel: string) => (sel === '.pane-reserve[aria-busy="true"]' ? reserves.map((r) => ({ getClientRects: () => rects(r) })) : []),
      querySelector: (sel: string) => panes.find((p) => sel === `.tab-pane[data-tab="${p.tab}"]`) ?? null,
    });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: wide }) });
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
    flush();
    expect(animate).toHaveBeenCalledTimes(1);
    t.offsetHeight = 900;
    flush(); flush();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('PC 폭·동작 줄이기면 아무것도 하지 않는다', () => {
    wide = true;
    playTabCover(cover, 'tools');
    expect(cover.style.display).toBe('');
    expect(frames).toEqual([]);
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
