// #11(2026-09-29) 좋아요 빠르게 두 번 = 취소 · 화면 = 서버. 실행: npx vitest run src/lib/likeQueue.test.ts
// 가짜 서버는 toggle_post_like 와 같은 토글이고, 응답을 테스트가 풀어 줄 때까지 붙잡는다(비행 중 상태).
import { describe, it, expect } from 'vitest';
import { createLikeQueue, type LikeSnap } from './likeQueue';

const flipLike = (p: { liked: boolean; likeCount: number }) => ({ liked: !p.liked, likeCount: Math.max(0, p.likeCount + (p.liked ? -1 : 1)) });

function rig(start: LikeSnap = { liked: false, count: 3 }) {
  const server = { ...start };
  let ui = { liked: start.liked, likeCount: start.count };
  const held: { ok: () => void; ng: (e: unknown) => void }[] = [];
  let sent = 0;
  const errors: unknown[] = [];
  const q = createLikeQueue({
    send: () => new Promise<LikeSnap>((res, rej) => {
      sent += 1;
      held.push({
        ok: () => { server.liked = !server.liked; server.count += server.liked ? 1 : -1; res({ ...server }); },
        ng: (e) => rej(e),
      });
    }),
    settle: (_id, s) => { ui = { liked: s.liked, likeCount: s.count }; },
    undo: () => { ui = flipLike(ui); },
    fail: (e) => { errors.push(e); },
  });
  const tap = () => { ui = flipLike(ui); q.tap('p'); };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const drain = async () => { while (held.length) { held.shift()!.ok(); await tick(); } };
  return { server, get ui() { return ui; }, held, get sent() { return sent; }, errors, tap, tick, drain };
}

describe('좋아요 직렬 큐', () => {
  it('🔴 응답 전 두 번 = 취소 — 서버도 화면도 누르기 전과 같다', async () => {
    const r = rig();
    r.tap(); r.tap();
    expect(r.ui).toEqual({ liked: false, likeCount: 3 }); // 화면은 즉시 두 번 뒤집혔다
    await r.drain();
    expect(r.server).toEqual({ liked: false, count: 3 });
    expect(r.ui).toEqual({ liked: false, likeCount: r.server.count });
    expect(r.sent).toBe(2); // 겹치지 않고 직렬로 두 번
  });

  it('한 번 누름 = 좋아요 1회 요청, 화면 = 서버', async () => {
    const r = rig();
    r.tap();
    await r.drain();
    expect(r.sent).toBe(1);
    expect(r.server).toEqual({ liked: true, count: 4 });
    expect(r.ui).toEqual({ liked: true, likeCount: 4 });
  });

  it('세 번 = 좋아요 — 요청은 비행 중 1건씩만', async () => {
    const r = rig();
    r.tap(); r.tap(); r.tap();
    expect(r.held.length).toBe(1);
    await r.drain();
    expect(r.server.liked).toBe(true);
    expect(r.ui).toEqual({ liked: true, likeCount: r.server.count });
    expect(r.sent).toBe(1); // 첫 응답에서 이미 마지막 의도(좋아요)와 같다
  });

  it('첫 요청 실패 — 누르기 전으로 돌아가고 토스트 1번', async () => {
    const r = rig({ liked: true, count: 5 });
    r.tap();
    r.held.shift()!.ng(new Error('x'));
    await r.tick();
    expect(r.ui).toEqual({ liked: true, likeCount: 5 });
    expect(r.errors.length).toBe(1);
  });

  it('두 번째 요청 실패 — 마지막으로 확인된 서버값을 보인다(화면 = 서버)', async () => {
    const r = rig();
    r.tap(); r.tap();
    r.held.shift()!.ok(); await r.tick();       // 서버 liked=true
    r.held.shift()!.ng(new Error('x')); await r.tick();
    expect(r.ui).toEqual({ liked: r.server.liked, likeCount: r.server.count });
    expect(r.errors.length).toBe(1);
  });

  it('끝난 뒤 다시 누르면 새 주기로 나간다', async () => {
    const r = rig();
    r.tap(); await r.drain();
    r.tap(); await r.drain();
    expect(r.server).toEqual({ liked: false, count: 3 });
    expect(r.ui).toEqual({ liked: false, likeCount: 3 });
    expect(r.sent).toBe(2);
  });
});
