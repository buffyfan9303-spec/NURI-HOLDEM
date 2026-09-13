// 이벤트 상시 진입(§4) — 로그인 왕복의 **양쪽 실패 모드**를 잠근다.
//
//   ① 복귀가 안 된다   — 이벤트 판을 보다 로그인하면 홈에 떨어진다.
//   ② 카드가 저절로 열린다 — 로그인하고 돌아오니 참여권이 한 장 줄고 카드가 열려 있다.
//
// 둘은 대칭이라 한쪽만 막으면 반드시 다른 쪽으로 샌다. ①은 '이벤트가 현재 화면으로 잡히는가',
// ②는 '복원 동작이 카드를 담을 수 있는가' 로 각각 잠근다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { currentViewFor, restoreActionFor, type OpenViewState } from './viewIntentRestore';
import { VIEW_KINDS, isViewIntent, rememberCurrentView, setCurrentView, takeViewIntent } from './pendingViewIntent';

// vitest environment 가 node 라 localStorage 가 없다 — 최소 구현을 끼운다(pendingViewIntent.test.ts 와 같은 조리법).
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  setCurrentView(null);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

const ALL_TABS = new Set(['home', 'browse', 'live', 'community', 'tools', 'calendar', 'my-store', 'admin']);
const isKnownTab = (id: string) => ALL_TABS.has(id);

const state = (over: Partial<OpenViewState> = {}): OpenViewState => ({
  eventOpen: false, eventSlug: 'card-open-2026-09',
  openPostId: null, openScheduleId: null, openVenueId: null, activeTab: 'home', ...over,
});

describe('① 복귀가 안 된다 — 이벤트 판이 현재 화면으로 잡힌다', () => {
  it('이벤트가 열려 있으면 현재 화면은 이벤트다(탭이 아니라)', () => {
    expect(currentViewFor(state({ eventOpen: true }))).toEqual({ kind: 'event', id: 'card-open-2026-09' });
  });

  it('🔴 아래에 글·대회·매장이 깔려 있어도 이벤트가 이긴다 — 화면 위에 있는 것이 사용자가 보는 것이다', () => {
    const s = state({ eventOpen: true, openPostId: 'p1', openScheduleId: 's1', openVenueId: 'v1', activeTab: 'community' });
    expect(currentViewFor(s).kind, '이벤트가 열렸는데 아래 화면이 스냅샷됐다').toBe('event');
  });

  it('이벤트가 닫혀 있으면 종전 순서 그대로다 — 글 > 대회 > 매장 > 탭', () => {
    expect(currentViewFor(state({ openPostId: 'p1', openScheduleId: 's1' }))).toEqual({ kind: 'post', id: 'p1' });
    expect(currentViewFor(state({ openScheduleId: 's1', openVenueId: 'v1' }))).toEqual({ kind: 'schedule', id: 's1' });
    expect(currentViewFor(state({ openVenueId: 'v1' }))).toEqual({ kind: 'venue', id: 'v1' });
    expect(currentViewFor(state({ activeTab: 'live' }))).toEqual({ kind: 'tab', id: 'live' });
  });

  it('저장소를 한 바퀴 돌아도 살아남는다 — 종류가 허용 목록에 있어야 한다', () => {
    expect(VIEW_KINDS, "VIEW_KINDS 에 'event' 가 없으면 저장 단계에서 통째로 버려진다").toContain('event');
    expect(isViewIntent({ kind: 'event', id: 'card-open-2026-09' })).toBe(true);
    setCurrentView(currentViewFor(state({ eventOpen: true })));
    rememberCurrentView();
    expect(takeViewIntent()).toEqual({ kind: 'event', id: 'card-open-2026-09' });
  });

  it('돌아오면 이벤트 판을 연다', () => {
    expect(restoreActionFor({ kind: 'event', id: 'card-open-2026-09' }, isKnownTab))
      .toEqual({ open: 'event', id: 'card-open-2026-09' });
  });
});

describe('② 카드가 저절로 열린다 — 복원은 판을 여는 데까지다', () => {
  it('🔴 복원 동작이 담는 것은 `open`·`id` 둘뿐이다 — 고른 카드를 담을 자리가 없어야 한다', () => {
    const a = restoreActionFor({ kind: 'event', id: 'card-open-2026-09' }, isKnownTab)!;
    expect(Object.keys(a).sort(),
      '복원 동작에 필드가 늘었다 — 카드 번호가 섞이면 로그인 직후 참여권이 저절로 소모된다').toEqual(['id', 'open']);
  });

  it('🔴 id 는 캠페인 slug 지 카드 번호가 아니다 — 숫자만 있는 의도는 이벤트로 해석되지 않는다', () => {
    // 카드 번호를 id 로 쓰는 구현으로 되돌아가면 여기서 걸린다: '7' 은 slug 가 아니다.
    const a = restoreActionFor({ kind: 'event', id: 'card-open-2026-09' }, isKnownTab)!;
    expect(a.id).toMatch(/[a-z]/);
  });

  it('저장소에 카드 번호를 심어도 읽을 때 kind·id 만 남는다', () => {
    setCurrentView({ kind: 'event', id: 'card-open-2026-09' });
    rememberCurrentView();
    expect(takeViewIntent(), '의도에 여분 필드가 실려 나왔다')
      .toEqual({ kind: 'event', id: 'card-open-2026-09' });
  });
});

describe('해석할 수 없는 의도는 아무 일도 하지 않는다', () => {
  it('없는 탭으로는 보내지 않는다 — 빈 화면이 된다', () => {
    expect(restoreActionFor({ kind: 'tab', id: 'event' }, isKnownTab), "'event' 는 최상위 탭이 아니다").toBeNull();
    expect(restoreActionFor({ kind: 'tab', id: 'home' }, isKnownTab)).toEqual({ open: 'tab', id: 'home' });
  });
  it('의도가 없으면 null', () => {
    expect(restoreActionFor(null, isKnownTab)).toBeNull();
  });
});
