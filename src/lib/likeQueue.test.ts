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
  const who = { ui: 'A' as string | null, session: 'A' as string | null };
  let settles = 0;
  const q = createLikeQueue({
    // App 과 같은 계약: 보내기 직전 세션이 주기의 owner 가 아니면 보내지 않는다(null).
    // owner 를 안 넘기는 옛 큐(음성 대조용)는 옛 App 처럼 무조건 보낸다.
    send: (_id, owner) => (owner as unknown) !== undefined && who.session !== owner ? Promise.resolve(null) : new Promise<LikeSnap>((res, rej) => {
      sent += 1;
      held.push({
        ok: () => { server.liked = !server.liked; server.count += server.liked ? 1 : -1; res({ ...server }); },
        ng: (e) => rej(e),
      });
    }),
    settle: (_id, s) => { settles += 1; ui = { liked: s.liked, likeCount: s.count }; },
    undo: () => { ui = flipLike(ui); },
    fail: (e) => { errors.push(e); },
    owner: () => who.ui,
  });
  const tap = () => { ui = flipLike(ui); q.tap('p'); };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const drain = async () => { while (held.length) { held.shift()!.ok(); await tick(); } };
  return { server, get ui() { return ui; }, held, get sent() { return sent; }, get settles() { return settles; }, errors, who, tap, tick, drain };
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

  it('🔴 비행 중 계정 A→B — 재전송 0건 · A 의 응답이 B 화면을 덮지 않는다 · 토스트 0', async () => {
    const r = rig();
    r.tap(); r.tap();                       // A 가 두 번(취소 의도) — 첫 응답 뒤 재전송이 필요한 상태
    r.who.ui = 'B'; r.who.session = 'B';    // 계정 전환
    const uiAtSwitch = { ...r.ui };
    r.held.shift()!.ok(); await r.tick();
    await r.drain();
    expect(r.sent, '재전송이 B 세션으로 나갔다').toBe(1);
    expect(r.settles, 'A 의 응답이 B 화면을 덮었다').toBe(0);
    expect(r.ui).toEqual(uiAtSwitch);
    expect(r.errors.length).toBe(0);
  });

  it('🔴 세션만 먼저 B(화면 계정은 아직 A) — 재전송은 보내기 직전 세션 대조로 막힌다', async () => {
    const r = rig();
    r.tap(); r.tap();
    r.who.session = 'B';                    // onAuthStateChange 가 화면 상태보다 먼저 바뀐 순간
    r.held.shift()!.ok(); await r.tick();
    await r.drain();
    expect(r.sent).toBe(1);
    r.who.ui = 'B';
    r.tap();                                // 이제 B 의 누름은 새 주기로 정상 전송
    await r.drain();
    expect(r.sent).toBe(2);
    expect(r.settles).toBe(1);
  });
});
