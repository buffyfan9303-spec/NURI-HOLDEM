// 헤더 히스테리시스 + 섹션 스크롤 복원 목표값 — lib/headerShrink 계약.
//
// 왜: CommunityTab 이 저장값으로 복원하면 App 의 히스테리시스가 헤더를 뒤집고, 스크롤 앵커링이 그 높이 차(12.75px)만큼
//     scrollY 를 되민다(2026-09-13 실측: 107 복원 → 94). 여기 함수가 그 되밀림을 미리 더하되, 히스테리시스 띠 안이라
//     헤더가 안 뒤집힐 때는 더하지 않는다. 앵커링 없는 엔진(Safari)에서는 보정하지 않는다.
// 못 보는 것: 실제 브라우저의 앵커링 양·헤더 픽셀 — 그것은 e2e/rank-scroll-slots.spec.ts 가 잰다.
// 음성 대조: restoreScrollTop 의 `nextHeaderShrunk(...) !== shrunkNow` 조건을 지우면 '띠 안' 케이스가, 보정 부호를 뒤집으면
//            '뒤집힘' 케이스가 실패한다.
//   ⚠ 아래 restoreScrollTop 케이스들은 `anchoring` 을 **명시 전달**(true/false)하므로 `SCROLL_ANCHORING` 기본값 배선을 보지 않는다 —
//     독립 검증(2026-09-13) 실측: 기본값을 false 로 바꿔도 그 8건은 통과했고 배선을 지킨 건 e2e 였다. 그래서 마지막 describe 가
//     CSS.supports 유무에 따라 **기본 인자로** 보정이 켜지고 꺼지는지를 따로 본다(모듈을 다시 읽어 상수를 재평가한다).
//     음성 대조: headerShrink.ts 의 `anchoring: boolean = SCROLL_ANCHORING` 을 `= false` 로 바꾸면 '엔진이 앵커링을 알면' 케이스가,
//     SCROLL_ANCHORING 식의 `CSS.supports('overflow-anchor', 'none')` 을 `true` 로 바꾸면 'Safari' 케이스가 실패한다
//     (처음엔 'CSS 가 없으면' 케이스가 잡는다고 적었다가 음성 대조에서 통과해 버려 — typeof 가드가 먼저 false 라 — 케이스를 추가했다).
// 실행: npx vitest run src/lib/headerShrink.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { HEADER_SHRINK_DOWN, HEADER_SHRINK_UP, nextHeaderShrunk, restoreScrollTop } from './headerShrink';

const SHRUNK = 47.75, FULL = 60.5, DELTA = FULL - SHRUNK;

describe('nextHeaderShrunk — App 의 56/40 히스테리시스와 같은 판정', () => {
  it('펼친 상태는 56 을 넘어야 접힌다', () => {
    expect(nextHeaderShrunk(false, HEADER_SHRINK_DOWN)).toBe(false);
    expect(nextHeaderShrunk(false, HEADER_SHRINK_DOWN + 0.5)).toBe(true);
  });
  it('접힌 상태는 40 이하여야 펴진다', () => {
    expect(nextHeaderShrunk(true, HEADER_SHRINK_UP + 0.5)).toBe(true);
    expect(nextHeaderShrunk(true, HEADER_SHRINK_UP)).toBe(false);
  });
});

describe('restoreScrollTop', () => {
  it('헤더 높이가 같으면 저장값 그대로', () => {
    expect(restoreScrollTop({ y: 107, headerH: SHRUNK }, SHRUNK, 500, true)).toBe(107);
    expect(restoreScrollTop({ y: 30, headerH: FULL }, FULL, 500, true)).toBe(30);
  });
  it('접힌 채 저장 → 지금은 펼침: 복원이 헤더를 접을 것이면 앵커링 되밀림(+Δ)을 미리 더한다', () => {
    // 107 + 12.75 = 119.75 로 가면 히스테리시스가 접고(>56) 앵커링이 −12.75 → 107 에 선다
    expect(restoreScrollTop({ y: 107, headerH: SHRUNK }, FULL, 500, true)).toBeCloseTo(107 + DELTA, 5);
  });
  it('펼친 채 저장 → 지금은 접힘: 복원이 헤더를 펼 것이면 −Δ 를 미리 뺀다', () => {
    // 30 − 12.75 = 17.25 로 가면 히스테리시스가 펴고(≤40) 앵커링이 +12.75 → 30 에 선다
    expect(restoreScrollTop({ y: 30, headerH: FULL }, SHRUNK, 500, true)).toBeCloseTo(30 - DELTA, 5);
  });
  it('히스테리시스 띠 안이라 헤더가 안 뒤집힐 때는 보정하지 않는다(보정하면 12.75 어긋난다)', () => {
    // 접힌 채 41 저장, 지금 펼침: 41+12.75=53.75 는 56 을 못 넘어 안 접힘 → 41 그대로가 정답
    expect(restoreScrollTop({ y: 41, headerH: SHRUNK }, FULL, 500, true)).toBe(41);
    // 펼친 채 55 저장, 지금 접힘: 55−12.75=42.25 는 40 위라 안 펴짐 → 55 그대로
    expect(restoreScrollTop({ y: 55, headerH: FULL }, SHRUNK, 500, true)).toBe(55);
  });
  it('앵커링이 없는 엔진에서는 보정하지 않는다', () => {
    expect(restoreScrollTop({ y: 107, headerH: SHRUNK }, FULL, 500, false)).toBe(107);
  });
  it('문서 최대·0 으로 클램프한다(짧아진 섹션)', () => {
    expect(restoreScrollTop({ y: 107, headerH: SHRUNK }, SHRUNK, 60, true)).toBe(60);
    expect(restoreScrollTop({ y: 5, headerH: FULL }, SHRUNK, 500, true)).toBe(0);
  });
});

describe('SCROLL_ANCHORING 기본값 배선 — anchoring 을 안 넘기면 CSS.supports(overflow-anchor) 가 결정한다', () => {
  const g = globalThis as { CSS?: unknown };
  const saved = g.CSS;
  afterEach(() => { if (saved === undefined) delete g.CSS; else g.CSS = saved; vi.resetModules(); });

  it('🔴 엔진이 앵커링을 알면(CSS.supports → true) 기본 인자로 보정이 켜진다', async () => {
    vi.resetModules();
    g.CSS = { supports: (p: string, v: string) => p === 'overflow-anchor' && v === 'none' };
    const m = await import('./headerShrink');
    expect(m.SCROLL_ANCHORING).toBe(true);
    expect(m.restoreScrollTop({ y: 107, headerH: SHRUNK }, FULL, 500)).toBeCloseTo(107 + DELTA, 5);
  });

  it('🔴 CSS 는 있는데 overflow-anchor 를 모르면(Safari) 기본 인자로 보정하지 않는다', async () => {
    vi.resetModules();
    g.CSS = { supports: () => false };
    const m = await import('./headerShrink');
    expect(m.SCROLL_ANCHORING).toBe(false);
    expect(m.restoreScrollTop({ y: 107, headerH: SHRUNK }, FULL, 500)).toBe(107);
  });

  it('🔴 CSS 가 없으면(Node · 앵커링 없는 엔진) 기본 인자로 보정하지 않는다', async () => {
    vi.resetModules();
    delete g.CSS;
    const m = await import('./headerShrink');
    expect(m.SCROLL_ANCHORING).toBe(false);
    expect(m.restoreScrollTop({ y: 107, headerH: SHRUNK }, FULL, 500)).toBe(107);
  });
});
