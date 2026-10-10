// 홈 요구 A·E·F (2026-10-10) — 배너 5초 자동 넘김 · 매장 사진 확대 뷰어 · 홈 퀵 '커뮤니티'.
// 실행: npx vitest run src/components/features/homeRequests1010.test.ts
// 한계: 단위 환경이 node 라 DOM 렌더는 못 본다 — 타이머 정책은 순수 함수·컨트롤러를 가짜 타이머로, 배선은 소스 계약으로 본다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTO_ADVANCE_MS, autoAdvanceActive, createAutoAdvance, createHolds } from './posterAutoAdvance';

const dir = join(process.cwd(), 'src', 'components', 'features');
const PC = readFileSync(join(dir, 'PosterCarousel.tsx'), 'utf8');
const VENUE = readFileSync(join(dir, 'VenuePage.tsx'), 'utf8');
const HOME = readFileSync(join(dir, 'HomeTab.tsx'), 'utf8');

afterEach(() => { vi.useRealTimers(); });

describe('A · 배너 자동 넘김 5000ms', () => {
  it('간격은 5000ms 다', () => { expect(AUTO_ADVANCE_MS).toBe(5000); });

  it('5초가 차야 한 번 넘어가고, 정지하면 더는 넘어가지 않는다(정리)', () => {
    vi.useFakeTimers();
    const step = vi.fn();
    const t = createAutoAdvance(step);
    t.start();
    vi.advanceTimersByTime(4999);
    expect(step).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(step).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(step).toHaveBeenCalledTimes(2);
    t.stop();
    expect(t.running()).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(step).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('조작해서 다시 시작하면 5초를 처음부터 센다(타이머가 겹치지 않는다)', () => {
    vi.useFakeTimers();
    const step = vi.fn();
    const t = createAutoAdvance(step);
    t.start();
    vi.advanceTimersByTime(4000);
    t.start(); // 사용자가 화살표를 눌렀다
    vi.advanceTimersByTime(4000); // 첫 시작 기준으로는 8초 — 다시 센 뒤 4초뿐이라 아직이다
    expect(step).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(step).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    t.stop();
  });

  it('1장 · 탭 숨김 · 화면 밖 · 읽는 중(올림·포커스·터치)이면 돌지 않는다', () => {
    const ok = { count: 3, docHidden: false, inView: true, held: false };
    expect(autoAdvanceActive(ok)).toBe(true);
    expect(autoAdvanceActive({ ...ok, count: 1 })).toBe(false);
    expect(autoAdvanceActive({ ...ok, count: 0 })).toBe(false);
    expect(autoAdvanceActive({ ...ok, docHidden: true })).toBe(false);
    expect(autoAdvanceActive({ ...ok, inView: false })).toBe(false);
    expect(autoAdvanceActive({ ...ok, held: true })).toBe(false);
  });

  it('배선: 컴포넌트가 정지 조건을 실제로 듣고, 자동 스텝은 go(1, true) 로 이동한다', () => {
    expect(PC).toMatch(/visibilitychange/);
    expect(PC).toMatch(/new IntersectionObserver/);
    for (const ev of ['pointerenter', 'pointerleave', 'focusin', 'focusout', 'touchstart', 'touchend']) expect(PC).toContain(`'${ev}'`);
    expect(PC).toMatch(/createAutoAdvance\(\(\) => go\(1, true\)\)/);
    expect(PC).toMatch(/return t\.stop;/); // 언마운트·조건 변화 때 정리
    // reduced-motion 은 go() 안에서 behavior:'auto' (즉시 이동)
    expect(PC).toMatch(/behavior: reduced \? 'auto' : 'smooth'/);
    // 버튼은 수동 이동 뒤 타이머를 다시 센다
    expect(PC).toMatch(/onClick=\{\(\) => goManual\(-1\)\}/);
    expect(PC).toMatch(/onClick=\{\(\) => goManual\(1\)\}/);
  });

  it('일시정지(paused)는 다른 조건이 다 맞아도 자동 넘김을 세운다 — 풀리면 다시 돈다', () => {
    const ok = { count: 3, docHidden: false, inView: true, held: false };
    expect(autoAdvanceActive({ ...ok, paused: true })).toBe(false);
    expect(autoAdvanceActive({ ...ok, paused: false })).toBe(true);
  });

  it('배선: 일시정지 버튼은 aria-pressed 토글이고 paused 가 autoAdvanceActive 로 흘러간다', () => {
    expect(PC).toMatch(/data-testid="home-banner-pause"/);
    expect(PC).toMatch(/aria-pressed=\{paused\}/);
    expect(PC).toMatch(/onClick=\{\(\) => setPaused\(\(p\) => !p\)\}/);
    expect(PC).toMatch(/autoAdvanceActive\(\{ count: n, docHidden, inView, held, paused \}\)/);
  });
});

describe('A · 읽는 중 표식(createHolds) — 동시에 여럿, 전부 내려야 풀린다', () => {
  const make = () => { const log: boolean[] = []; const h = createHolds((v) => log.push(v)); return { h, log }; };

  it('올림과 포커스가 함께 서 있으면 하나가 내려가도 풀리지 않는다', () => {
    const { h, log } = make();
    h.set('hover', true); h.set('focus', true);
    h.set('hover', false);
    expect(h.held()).toBe(true);
    h.set('focus', false);
    expect(h.held()).toBe(false);
    expect(log).toEqual([true, false]); // 상태가 바뀐 때만 알린다
  });

  it('두 손가락 중 하나만 떼도 아직 만지는 중이다(touchend 한 번에 풀리던 결함)', () => {
    const { h } = make();
    h.touches(1); h.touches(2);
    h.touches(1); // 한 손가락 뗌
    expect(h.held()).toBe(true);
    h.touches(0);
    expect(h.held()).toBe(false);
  });

  it('손가락 + 키보드 포커스 — 손가락을 떼도 포커스가 남으면 계속 선다', () => {
    const { h } = make();
    h.set('focus', true); h.touches(1); h.touches(0);
    expect(h.held()).toBe(true);
  });

  it('clear() — 리스너가 걷힐 때 서 있던 표식이 전부 내려간다(사라진 버튼은 focusout 을 안 보낸다)', () => {
    const { h, log } = make();
    h.set('hover', true); h.set('focus', true); h.touches(2);
    h.clear();
    expect(h.held()).toBe(false);
    expect(log).toEqual([true, false]);
    h.clear(); // 두 번 불러도 알림은 한 번
    expect(log).toEqual([true, false]);
  });

  it('배선: 정리에서 clear() 를 부르고, 터치는 e.touches.length 로 센다', () => {
    expect(PC).toMatch(/holds\.clear\(\)/);
    expect(PC).toMatch(/holds\.touches\(e\.touches\.length\)/);
  });
});

describe('E · 매장 사진 확대 뷰어', () => {
  it('대회와 매칭되지 않는 배너 사진은 그 사진 자체를 ImageLightbox 로 연다(없는 URL 을 만들지 않는다)', () => {
    expect(VENUE).toMatch(/import ImageLightbox from '..\/atoms\/ImageLightbox'/);
    expect(VENUE).toMatch(/if \(same\.length === 0\) \{ setHeroViewer\(src\); return; \}/);
    expect(VENUE).toMatch(/<ImageLightbox src=\{heroViewer\}/);
    // 매칭되는 대회가 있으면 종전처럼 상세로 간다
    expect(VENUE).toMatch(/onSelectSchedule\(upcoming\[0\] \?\? same\[same\.length - 1\]\)/);
  });
});

describe('F · 홈 퀵 카드 오른쪽 = 커뮤니티', () => {
  it('prop onOpenCommunity 가 있고, 라벨이 커뮤니티이며, 이벤트 칸이 아니다', () => {
    expect(HOME).toMatch(/onOpenCommunity\?: \(\) => void;/);
    expect(HOME).toMatch(/onClick=\{onOpenCommunity\} data-testid="home-quick-community"/);
    expect(HOME).not.toMatch(/data-testid="home-quick-event"/);
  });

  it('모바일 이벤트 목록 진입 — 퀵 영역 안 한 줄 지름길이 onEvent() 를 부르고 lg 에서는 숨는다(PC 는 GNB)', () => {
    const q = HOME.slice(HOME.indexOf('data-testid="home-quick"'), HOME.indexOf('{/* ── 지금 등록 가능'));
    const i = q.indexOf('data-testid="home-event-list-entry"');
    expect(i, '퀵 영역 안에 이벤트 목록 진입이 없다').toBeGreaterThan(-1);
    const btn = q.slice(q.lastIndexOf('<button', i), q.indexOf('</button>', i));
    expect(btn).toMatch(/onClick=\{\(\) => onEvent\(\)\}/); // 인자 없음 = 목록(MouseEvent 가 slug 로 새지 않게)
    expect(btn).toMatch(/whitespace-nowrap/);
    expect(btn).toMatch(/lg:hidden/);
    expect(btn).not.toMatch(/min-h-\[44px\]/); // 오너 10-05: 44px 고정 금지 — 글자·여백 균형(py-2)
    expect(q).toMatch(/\{eventMenuVisible && \(\s*<button type="button" onClick=\{\(\) => onEvent\(\)\} data-testid="home-event-list-entry"/); // 관리자 이벤트 메뉴 스위치를 존중
    expect(HOME).toMatch(/eventMenuVisible = true/); // 디스트럭처링 복원 — 안 읽는 prop 이 아니다
  });
});
