// 좋아요 누름 직렬화 — 화면은 누를 때마다 즉시 뒤집고, 서버에는 '마지막 의도'만 반영한다(오너 #11, 2026-09-29).
//
// 서버 toggle_post_like 는 **토글**(비멱등)이라 요청을 겹쳐 보내면 늦게 온 옛 응답이 최신 화면을 덮는다(C-5).
// 그래서 글마다 비행 중 요청은 1건뿐이다. 예전엔 그동안의 누름을 버렸다 → '빠르게 두 번 = 취소' 가 안 됐다.
// 지금은 누름 수(taps)와 서버가 처리한 토글 수(done)를 센다. 응답이 올 때 둘의 차가 홀수면 서버가 아직
// 마지막 의도와 반대이므로 한 번 더 보낸다(직렬). 짝수면 끝 — 서버 권위값(liked·count)을 화면에 덮는다(화면 = 서버).
// 실패하면 마지막으로 확인된 서버값으로, 확인된 값이 없으면 누른 만큼 되돌린다(홀수면 한 번 뒤집기).
export interface LikeSnap { liked: boolean; count: number }
export type LikeQueue = ReturnType<typeof createLikeQueue>;

// 계정 축(2026-09-29 verifier 메모 A): 비행 중 A→B 로 바뀌면 재전송이 **B 세션으로** 나가 B 의 좋아요로 기록된다.
//   그래서 주기마다 시작한 계정(owner)을 적어 두고, 응답 때 지금 계정이 다르면 그 주기를 조용히 버린다 —
//   재전송 0 · 화면 덮기 0 · 토스트 0(이전 계정 화면은 이미 사라졌다). 같은 글을 새 계정이 누르면 새 주기다.
//   화면의 계정(owner())은 인증 세션보다 한 박자 늦게 바뀔 수 있어, send 는 **보내기 직전 세션**을 주기의 owner 와
//   다시 대조하고 다르면 null(보내지 않음)을 돌려준다 — 그 주기도 조용히 버린다.
export function createLikeQueue(o: {
  /** owner 계정의 세션일 때만 보낸다. 세션이 이미 다른 계정이면 보내지 않고 null */
  send: (id: string, owner: string | null) => Promise<LikeSnap | null>;
  /** 서버 권위값을 화면에 그대로 덮는다 */
  settle: (id: string, s: LikeSnap) => void;
  /** 확인된 서버값 없이 실패 — 화면을 누르기 전으로(홀수 번 눌렀을 때만 불린다) */
  undo: (id: string) => void;
  fail: (e: unknown) => void;
  /** 지금 로그인한 계정 id(없으면 null) */
  owner: () => string | null;
}) {
  type Cycle = { owner: string | null; taps: number; done: number; last?: LikeSnap };
  const st = new Map<string, Cycle>();
  /** 이 응답을 아직 반영해도 되는가 — 같은 주기이고 계정이 그대로일 때만 */
  const live = (id: string, x: Cycle) => {
    if (st.get(id) !== x) return false;
    if (o.owner() === x.owner) return true;
    st.delete(id);
    return false;
  };
  const run = (id: string, x: Cycle) => {
    o.send(id, x.owner).then((s) => {
      if (s === null) { if (st.get(id) === x) st.delete(id); return; }
      if (!live(id, x)) return;
      x.done += 1; x.last = s;
      if ((x.taps - x.done) % 2 === 1) { run(id, x); return; }
      st.delete(id);
      o.settle(id, s);
    }, (e) => {
      if (!live(id, x)) return;
      st.delete(id);
      if (x.last) o.settle(id, x.last);
      else if (x.taps % 2 === 1) o.undo(id);
      o.fail(e);
    });
  };
  return {
    /** 누름 한 번. 화면 뒤집기는 호출부가 먼저 한다. */
    tap(id: string) {
      const me = o.owner();
      const x = st.get(id);
      if (x && x.owner === me) { x.taps += 1; return; }
      const nx: Cycle = { owner: me, taps: 1, done: 0 };
      st.set(id, nx);   // 다른 계정의 주기가 남아 있었다면 여기서 끊긴다(그 응답은 live 에서 버려진다)
      run(id, nx);
    },
  };
}
