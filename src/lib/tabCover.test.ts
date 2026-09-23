// BOTTOM-TAB-SMOOTH 덮개 — 기기별 스위치 해석 + 키프레임 + App.tsx 배선 계약. 동작(프레임·레이어)은 e2e/tab-cover.spec.ts 가 잰다.
// 음성 대조(2026-09-24 확인): TAB_COVER_DEFAULT_ON 을 false 로 바꾸면 ①의 '기본 켜짐' 이,
//   tabsoft 키프레임에 transform 을 섞거나 머묾 구간을 빼면 ② 가,
//   App.tsx 의 playTabCover 호출을 layout effect 밖(useEffect·rAF)으로 옮기면 ③ 이 빨개진다.
// 실행: npx vitest run src/lib/tabCover.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTabCoverValue, tabCoverOnFor, tabCoverFxFor, tabCoverKeyframes, TAB_COVER_DEFAULT_ON, TAB_COVER_MS } from './tabCover';

describe('① 기기별 스위치', () => {
  it('기본 켜짐(2026-09-24 리드 결정) — 스위치 없는 기기는 tabsoft', () => {
    expect(TAB_COVER_DEFAULT_ON).toBe(true);
    expect(tabCoverFxFor(nextTabCoverValue('', null))).toBe('tabsoft');
  });
  it('?fx=off 는 그 기기만 끄고 저장한다 — URL 없이도 유지', () => {
    expect(nextTabCoverValue('?fx=off', null)).toBe('off');
    expect(nextTabCoverValue('?tab=home', 'off')).toBe('off');
    expect(tabCoverOnFor('off')).toBe(false);
  });
  it('?fx=tabfade(1차 160ms, 비교용)·?fx=tabsoft 도 저장되고, 새 URL 이 저장값을 이긴다', () => {
    expect(nextTabCoverValue('?fx=tabfade', null)).toBe('tabfade');
    expect(tabCoverFxFor('tabfade')).toBe('tabfade');
    expect(nextTabCoverValue('?fx=tabsoft', 'off')).toBe('tabsoft');
    expect(nextTabCoverValue('?fx=off', 'tabfade')).toBe('off');
  });
  it('전체 끄기(기본값 false)면 스위치 없는 기기는 꺼지고, 켠 기기만 남는다', () => {
    expect(tabCoverFxFor(null, false)).toBeNull();
    expect(tabCoverFxFor('tabsoft', false)).toBe('tabsoft');
  });
  it('모르는 값·만들지 않은 변형·오염된 저장값은 무시한다', () => {
    for (const v of ['bogus', 'tabwipe', 'tabrise', 'TABSOFT']) expect(nextTabCoverValue(`?fx=${v}`, null)).toBeNull();
    expect(nextTabCoverValue('', 'garbage')).toBeNull();
  });
});

describe('② 키프레임 — opacity 만, 첫 프레임 1(K-07)', () => {
  it.each(['tabfade', 'tabsoft'] as const)('%s: opacity 외 속성이 없고 1 에서 0 으로', (fx) => {
    const kf = tabCoverKeyframes(fx);
    for (const f of kf) expect(Object.keys(f).filter((k) => !['opacity', 'offset', 'easing'].includes(k))).toEqual([]);
    expect(kf[0].opacity).toBe(1);
    expect(kf.at(-1)!.opacity).toBe(0);
  });
  it('tabsoft: 약 280ms, 첫 40~60ms 는 거의 불투명(≥0.95)으로 머문 뒤 감속 곡선으로 풀린다', () => {
    expect(TAB_COVER_MS.tabsoft).toBeGreaterThanOrEqual(260);
    expect(TAB_COVER_MS.tabsoft).toBeLessThanOrEqual(300);
    const kf = tabCoverKeyframes('tabsoft');
    const holdMs = kf[1].offset! * TAB_COVER_MS.tabsoft;
    expect(holdMs).toBeGreaterThanOrEqual(40);
    expect(holdMs).toBeLessThanOrEqual(60);
    expect(Number(kf[1].opacity)).toBeGreaterThanOrEqual(0.95);
    expect(String(kf[1].easing)).toMatch(/^cubic-bezier/);
  });
});

describe('③ App.tsx 배선', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
  it('덮개는 스크롤 맨 위로와 **같은 useLayoutEffect** 안에서 시작한다(첫 페인트 — K-07)', () => {
    const i = app.indexOf('playTabCover(tabCoverRef.current)');
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
    // 첫 탭 pane 보다 앞에 있다 = 어떤 .tab-pane 의 자식도 아니다
    expect(app.indexOf('<div ref={tabCoverRef}')).toBeLessThan(app.indexOf('className="tab-pane'));
  });
});
