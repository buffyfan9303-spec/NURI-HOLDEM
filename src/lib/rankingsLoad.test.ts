// F1 잔여 경합(독립 검증 2026-09-13) — 늦게 도착한 **다른 날짜** 응답이 지금 날짜의 순위 편집기를 덮으면
//   빈 폼이 아니라 **A 날짜 명단으로 B 날짜를 저장**하게 된다(save_venue_rankings 는 (날짜+게임) 전체 교체 — F1 과 같은 소실).
//   재현 경로: A 조회 실패 → [다시 시도](A#2 느림) → 날짜 B 로 이동(B 빠르게 성공) → A#2 늦게 도착 → rows=A, 저장 활성.
//   내가 넣은 '다시 시도' 가 이 경합을 더 쉽게 만들었다.
// 고침: RankingEditor 의 조회 effect 가 lib/rankingsLoad.loadRankingsEffect 에 위임하고 그 **cleanup(alive=false)** 을 effect 가 반환한다 —
//   deps(venueId·date·rankTick)가 바뀌면 React 가 cleanup 을 먼저 부르므로 이전 요청의 응답은 버려진다.
// 이 파일은 **동작 검사**다: fetch 를 목킹해 A 응답을 B 응답보다 늦게 resolve 시키고, 상태에 반영된 명단이 A 것이 아님을 단언한다.
//   (jsdom·react-test-renderer 가 설치돼 있지 않아 컴포넌트 렌더 대신 effect 본문 함수 자체를 React 와 같은 순서로 구동한다 —
//    배선(컴포넌트가 이 함수를 쓰고 cleanup 을 반환하는가)은 RankingEditorLoadGuard.contract.test.ts 가 본다.)
// 음성 대조: rankingsLoad.ts 의 `if (alive)` 세 곳 중 onLoaded 앞의 것을 지우면 '늦은 A 응답' 케이스가 실패한다.
// 실행: npx vitest run src/lib/rankingsLoad.test.ts
import { describe, it, expect } from 'vitest';
import { loadRankingsEffect } from './rankingsLoad';

type Entry = { nickname: string };
function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

/** RankingEditor 의 상태를 흉내 낸다 — setAllEntries/setLoadErr/setLoading 이 받는 값 */
function harness() {
  const state = { entries: null as Entry[] | null, loadErr: null as string | null, loading: false, settled: 0 };
  const run = (fetch: () => Promise<{ entries: Entry[] }>) => {
    state.loading = true;
    return loadRankingsEffect<Entry>({
      fetch,
      onLoaded: (entries) => { state.entries = entries; state.loadErr = null; },
      onError: (m) => { state.entries = []; state.loadErr = m; },
      onSettled: () => { state.loading = false; state.settled += 1; },
    });
  };
  return { state, run };
}

describe('loadRankingsEffect — 대상이 바뀐 뒤 도착한 응답은 버린다', () => {
  it('🔴 A 실패 → 다시 시도(A#2 느림) → 날짜 B(빠름) → A#2 늦게 도착: 명단은 B 것이고 A 닉네임은 없다', async () => {
    const h = harness();
    // A#1 실패
    const a1 = deferred<{ entries: Entry[] }>();
    const cleanupA1 = h.run(() => a1.promise);
    a1.reject({ message: 'network' }); await flush();
    expect(h.state.loadErr).not.toBeNull();
    expect(h.state.loading).toBe(false);
    // 다시 시도 → rankTick 변경 → React: cleanup(A#1) → A#2 시작
    cleanupA1();
    const a2 = deferred<{ entries: Entry[] }>();
    const cleanupA2 = h.run(() => a2.promise);
    expect(h.state.loading).toBe(true);
    // 날짜 B 로 이동 → cleanup(A#2) → B 시작
    cleanupA2();
    const b = deferred<{ entries: Entry[] }>();
    h.run(() => b.promise);
    b.resolve({ entries: [{ nickname: 'B-철수' }, { nickname: 'B-영희' }] }); await flush();
    expect(h.state.entries?.map((e) => e.nickname)).toEqual(['B-철수', 'B-영희']);
    expect(h.state.loadErr).toBeNull();
    expect(h.state.loading).toBe(false);
    // A#2 가 이제야 도착 — 아무것도 바꾸면 안 된다
    a2.resolve({ entries: [{ nickname: 'A-민수' }] }); await flush();
    expect(h.state.entries?.map((e) => e.nickname), '늦은 A 응답이 B 날짜의 명단을 덮었다').toEqual(['B-철수', 'B-영희']);
    expect(h.state.entries?.some((e) => e.nickname.startsWith('A-'))).toBe(false);
    expect(h.state.settled, 'A#2 의 finally 도 무시돼야 한다(loading 을 흔들지 않는다)').toBe(2);
  });

  it('🔴 늦은 A 응답이 **실패**여도 B 화면에 오류를 띄우지 않는다', async () => {
    const h = harness();
    const a = deferred<{ entries: Entry[] }>();
    const cleanupA = h.run(() => a.promise);
    cleanupA();
    const b = deferred<{ entries: Entry[] }>();
    h.run(() => b.promise);
    b.resolve({ entries: [{ nickname: 'B-1' }] }); await flush();
    a.reject({ code: '42501', message: 'permission denied' }); await flush();
    expect(h.state.loadErr).toBeNull();
    expect(h.state.entries?.map((e) => e.nickname)).toEqual(['B-1']);
  });

  it('정상 순서(요청 하나가 끝난 뒤 다음)는 그대로 반영된다 — 가드가 정상 경로를 막지 않는다', async () => {
    const h = harness();
    const a = deferred<{ entries: Entry[] }>();
    h.run(() => a.promise);
    a.resolve({ entries: [{ nickname: 'A-1' }] }); await flush();
    expect(h.state.entries?.map((e) => e.nickname)).toEqual(['A-1']);
    expect(h.state.loading).toBe(false);
  });

  it('실패는 msgOf 문장으로 onError 에 간다(원문 SQL 노출 없이)', async () => {
    const h = harness();
    const a = deferred<{ entries: Entry[] }>();
    h.run(() => a.promise);
    a.reject({ code: '42501', message: 'permission denied for table venue_rankings' }); await flush();
    expect(h.state.loadErr).toBe('권한이 없습니다. 매장 담당자 계정인지 확인해 주세요');
    expect(h.state.entries).toEqual([]);
  });
});
