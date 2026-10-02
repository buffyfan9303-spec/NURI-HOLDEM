// useVenueScope 반례 — critical-reviewer(review-store-link-1002 §1·§6) 의 격리 반례를 저장소로 옮겼다(2026-10-02).
//   사본이 아니라 훅 몸체(createVenueRun)를 직접 부른다. 매장 전환은 훅의 레이아웃 이펙트(:owner 가 다르면 bumpScope)를 흉내 낸다.
// 실행: npx vitest run src/lib/venueScope.counter.test.ts
import { describe, it, expect } from 'vitest';
import { bumpScope, type ScopeRef } from './scopedLoad';
import { createVenueRun } from './useVenueScope';

function harness(initial: string) {
  const ref: ScopeRef = { current: { seq: 0, owner: initial } };
  const setVenue = (v: string) => { if (ref.current.owner !== v) bumpScope(ref, v); };
  return { ref, setVenue, run: createVenueRun(ref) };
}
function deferred<T>() { let res!: (v: T) => void; const p = new Promise<T>((r) => { res = r; }); return { p, res }; }
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('useVenueScope 반례', () => {
  it('ABA: A 첫 응답이 A→B→A 뒤 두 번째 A 로 오인되지 않는다(seq)', async () => {
    const h = harness('A'); const shown: string[] = [];
    const a1 = deferred<string>(), a2 = deferred<string>();
    h.run('k', () => a1.p, (x) => shown.push(x));
    h.setVenue('B'); h.setVenue('A');
    h.run('k', () => a2.p, (x) => shown.push(x));
    a2.res('A-second'); await flush();
    a1.res('A-first-late'); await flush();
    expect(shown).toEqual(['A-second']);
  });

  it('A→B 전환 뒤 늦은 A 응답은 버리고, B 요청은 B id 로 나간다', async () => {
    const h = harness('A'); const shown: string[] = []; const asked: string[] = [];
    const a = deferred<string>();
    h.run('k', (v) => { asked.push(v); return a.p; }, (x) => shown.push(x));
    h.setVenue('B');
    h.run('k', (v) => { asked.push(v); return Promise.resolve('B'); }, (x) => shown.push(x));
    await flush(); a.res('A-late'); await flush();
    expect(asked).toEqual(['A', 'B']);
    expect(shown).toEqual(['B']);
  });

  it('🔴 같은 매장 재요청: 먼저 낸 응답이 늦게 와도 새 응답을 덮지 않는다(같은 key 는 마지막 요청만)', async () => {
    // 모델: NuriPosLedger prefill(date D1→D2) · copyMain · TournamentClock seed(S1→S2) · PresetManager startFromRound 연타
    const h = harness('A'); const shown: string[] = [];
    const d1 = deferred<string>(), d2 = deferred<string>();
    h.run('prefill', () => d1.p, (x) => shown.push(x)); // date=D1
    h.run('prefill', () => d2.p, (x) => shown.push(x)); // date=D2 (같은 매장)
    d2.res('D2-settings'); await flush();
    d1.res('D1-settings-late'); await flush();
    expect(shown).toEqual(['D2-settings']);
  });

  it('같은 key 의 늦은 실패도 버린다(err 도 부르지 않는다)', async () => {
    const h = harness('A'); const log: string[] = [];
    const d1 = deferred<string>();
    h.run('k', () => d1.p.then(() => { throw new Error('old'); }), () => log.push('ok1'), () => log.push('err1'));
    h.run('k', () => Promise.resolve('new'), (x) => log.push(x), () => log.push('err2'));
    await flush(); d1.res('x'); await flush();
    expect(log).toEqual(['new']);
  });

  it('다른 key 끼리는 서로를 무효로 하지 않는다(목록·직전 설정·검색은 독립)', async () => {
    const h = harness('A'); const shown: string[] = [];
    const list = deferred<string>();
    h.run('list', () => list.p, (x) => shown.push(x));
    h.run('search', () => Promise.resolve('search'), (x) => shown.push(x));
    await flush(); list.res('list'); await flush();
    expect(shown).toEqual(['search', 'list']);
  });

  it('cancel(key) 는 새 요청 없이 비행 중 응답만 버린다', async () => {
    const h = harness('A'); const shown: string[] = [];
    const s1 = deferred<string>();
    h.run('seed', () => s1.p, (x) => shown.push(x));
    h.run.cancel('seed');
    s1.res('S1-late'); await flush();
    expect(shown).toEqual([]);
  });

  it('fetch 가 동기로 던져도 err 로 간다', async () => {
    const h = harness('A'); const log: string[] = [];
    h.run('k', () => { throw new Error('sync'); }, () => log.push('ok'), (e) => log.push((e as Error).message));
    await flush();
    expect(log).toEqual(['sync']);
  });
});
