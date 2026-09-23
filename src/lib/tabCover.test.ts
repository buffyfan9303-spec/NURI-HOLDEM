// BOTTOM-TAB-SMOOTH 덮개 — 기기별 스위치 해석 + App.tsx 배선 계약. 동작(프레임·레이어)은 e2e/tab-cover.spec.ts 가 잰다.
// 음성 대조(2026-09-24 확인): TAB_COVER_DEFAULT_ON 을 true 로 바꾸면 ①의 '기본 꺼짐' 이,
//   App.tsx 의 playTabCover 호출을 layout effect 밖(useEffect·rAF)으로 옮기면 ② 가 빨개진다.
// 실행: npx vitest run src/lib/tabCover.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTabCoverValue, tabCoverOnFor, TAB_COVER_DEFAULT_ON } from './tabCover';

describe('① 기기별 스위치', () => {
  it('기본 꺼짐 — 전체 켜기는 리드가 이 상수 한 줄로 한다', () => {
    expect(TAB_COVER_DEFAULT_ON).toBe(false);
    expect(tabCoverOnFor(nextTabCoverValue('', null))).toBe(false);
  });
  it('?fx=tabfade 가 켜고 저장한다, 이후 URL 없이도 유지', () => {
    expect(nextTabCoverValue('?fx=tabfade', null)).toBe('tabfade');
    expect(nextTabCoverValue('?tab=home', 'tabfade')).toBe('tabfade');
    expect(tabCoverOnFor('tabfade')).toBe(true);
  });
  it('?fx=off 는 끈다 — 전체 켜기 뒤에도 그 기기는 꺼진 채', () => {
    expect(nextTabCoverValue('?fx=off', 'tabfade')).toBe('off');
    expect(tabCoverOnFor('off', true)).toBe(false);
    expect(tabCoverOnFor(null, true)).toBe(true);
  });
  it('모르는 값·오염된 저장값은 무시한다', () => {
    expect(nextTabCoverValue('?fx=bogus', null)).toBeNull();
    expect(nextTabCoverValue('', 'garbage')).toBeNull();
  });
});

describe('② App.tsx 배선', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
  it('덮개는 스크롤 맨 위로와 **같은 useLayoutEffect** 안에서 시작한다(첫 페인트 — K-07)', () => {
    const i = app.indexOf('playTabCover(tabCoverRef.current)');
    expect(i).toBeGreaterThan(0);
    const effStart = app.lastIndexOf('useLayoutEffect(() => {', i);
    const between = app.slice(effStart, i);
    expect(between).toContain("window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });");
    expect(between).not.toMatch(/useEffect\(|requestAnimationFrame\(/);
  });
  it('덮개 요소는 .tab-pane 밖의 fixed 한 장이다(본문 레이어를 건드리지 않는다)', () => {
    const tag = app.slice(app.indexOf('<div ref={tabCoverRef}'), app.indexOf('/>', app.indexOf('<div ref={tabCoverRef}')));
    expect(tag).toMatch(/data-tab-cover/);
    expect(tag).toMatch(/pointer-events-none fixed/);
    expect(tag).toMatch(/\bhidden\b/);
    expect(tag).toMatch(/opacity-0/);
    // 첫 탭 pane 보다 앞에 있다 = 어떤 .tab-pane 의 자식도 아니다
    expect(app.indexOf('<div ref={tabCoverRef}')).toBeLessThan(app.indexOf('className="tab-pane'));
  });
});
