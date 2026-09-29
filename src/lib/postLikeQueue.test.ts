// 게시글 좋아요 큐의 **실제 send** — 보내기 직전 세션 대조(verifier 메모 A · PR #43 테스트 구멍 보강).
// likeQueue.test 의 rig 는 send 를 목으로 복제해 이 줄을 못 본다 → 여기서는 _session·community API 만 목으로 건다.
// 실행: npx vitest run src/lib/postLikeQueue.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const env = { session: 'A' as string | null };
const held: (() => void)[] = [];
const toggle = vi.fn((id: string) => new Promise<{ liked: boolean; count: number }>((res) => {
  held.push(() => res({ liked: id !== '' && toggle.mock.calls.length % 2 === 1, count: 1 }));
}));

vi.mock('../api/_session', () => ({ currentUser: async () => (env.session ? { id: env.session } : null) }));
vi.mock('../api/community', () => ({ togglePostLike: (id: string) => toggle(id) }));

const { createPostLikeQueue } = await import('./postLikeQueue');

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { toggle.mockClear(); held.length = 0; env.session = 'A'; });

describe('createPostLikeQueue — 실제 send 의 세션 대조', () => {
  it('🔴 재전송 직전 세션이 B 로 바뀌었으면(화면 계정은 아직 A) 요청 0건', async () => {
    const apply = vi.fn();
    const tap = createPostLikeQueue(apply, () => {}, () => 'A');
    tap('p', 'A'); tap('p', 'A');             // 두 번 = 취소 의도 → 첫 응답 뒤 재전송이 필요하다
    await tick();
    expect(toggle).toHaveBeenCalledTimes(1);
    env.session = 'B';                        // onAuthStateChange 가 화면 상태보다 먼저 바뀐 순간
    held.shift()!(); await tick(); await tick();
    expect(toggle, '재전송이 B 세션으로 나갔다').toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it('세션이 그대로면 재전송이 나간다(양성 대조)', async () => {
    const apply = vi.fn();
    const tap = createPostLikeQueue(apply, () => {}, () => 'A');
    tap('p', 'A'); tap('p', 'A');
    await tick();
    held.shift()!(); await tick(); await tick();
    expect(toggle).toHaveBeenCalledTimes(2);
    held.shift()!(); await tick(); await tick();
    expect(apply).toHaveBeenCalledTimes(1);   // 끝나면 서버값으로 한 번 덮는다
  });

  it('누른 순간 계정과 지금 계정이 다르면(청크 로드 중 전환) 큐에 넣지 않는다', async () => {
    const tap = createPostLikeQueue(vi.fn(), () => {}, () => 'B');
    tap('p', 'A');
    await tick();
    expect(toggle).not.toHaveBeenCalled();
  });
});
