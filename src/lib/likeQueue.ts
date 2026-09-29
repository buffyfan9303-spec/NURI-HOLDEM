// 좋아요 누름 직렬화 — 화면은 누를 때마다 즉시 뒤집고, 서버에는 '마지막 의도'만 반영한다(오너 #11, 2026-09-29).
//
// 서버 toggle_post_like 는 **토글**(비멱등)이라 요청을 겹쳐 보내면 늦게 온 옛 응답이 최신 화면을 덮는다(C-5).
// 그래서 글마다 비행 중 요청은 1건뿐이다. 예전엔 그동안의 누름을 버렸다 → '빠르게 두 번 = 취소' 가 안 됐다.
// 지금은 누름 수(taps)와 서버가 처리한 토글 수(done)를 센다. 응답이 올 때 둘의 차가 홀수면 서버가 아직
// 마지막 의도와 반대이므로 한 번 더 보낸다(직렬). 짝수면 끝 — 서버 권위값(liked·count)을 화면에 덮는다(화면 = 서버).
// 실패하면 마지막으로 확인된 서버값으로, 확인된 값이 없으면 누른 만큼 되돌린다(홀수면 한 번 뒤집기).
export interface LikeSnap { liked: boolean; count: number }
export type LikeQueue = ReturnType<typeof createLikeQueue>;

export function createLikeQueue(o: {
  send: (id: string) => Promise<LikeSnap>;
  /** 서버 권위값을 화면에 그대로 덮는다 */
  settle: (id: string, s: LikeSnap) => void;
  /** 확인된 서버값 없이 실패 — 화면을 누르기 전으로(홀수 번 눌렀을 때만 불린다) */
  undo: (id: string) => void;
  fail: (e: unknown) => void;
}) {
  const st = new Map<string, { taps: number; done: number; last?: LikeSnap }>();
  const run = (id: string) => {
    o.send(id).then((s) => {
      const x = st.get(id)!;
      x.done += 1; x.last = s;
      if ((x.taps - x.done) % 2 === 1) { run(id); return; }
      st.delete(id);
      o.settle(id, s);
    }, (e) => {
      const x = st.get(id)!;
      st.delete(id);
      if (x.last) o.settle(id, x.last);
      else if (x.taps % 2 === 1) o.undo(id);
      o.fail(e);
    });
  };
  return {
    /** 누름 한 번. 화면 뒤집기는 호출부가 먼저 한다. */
    tap(id: string) {
      const x = st.get(id);
      if (x) { x.taps += 1; return; }
      st.set(id, { taps: 1, done: 0 });
      run(id);
    },
  };
}
