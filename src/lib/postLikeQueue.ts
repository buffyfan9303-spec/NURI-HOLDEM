// 게시글 좋아요 큐 — App 이 첫 누름 때 동적 import 한다(App.tsx 는 첫 화면 임계 경로라 번들 여유가 0).
// 판정은 likeQueue 한 벌. 여기는 서버 전송·화면 반영 묶음만 둔다(App 에 남기면 entry 가 커진다).
import { createLikeQueue } from './likeQueue';
import { togglePostLike, type CommunityPost } from '../api/community';
import { currentUser } from '../api/_session';

type Apply = (id: string, fn: (p: CommunityPost) => CommunityPost) => void;

/** 반환: 누름 함수 — 누른 순간의 계정(uid)이 지금도 같을 때만 큐에 넣는다(청크 로드 중 계정 전환 방지). */
export function createPostLikeQueue(apply: Apply, fail: (e: unknown) => void, owner: () => string | null) {
  const q = createLikeQueue({
    // 계정 전환 경합(verifier 메모 A): 보내기 직전 세션이 이 주기를 시작한 계정이 아니면 보내지 않는다.
    send: async (id, who) => ((await currentUser())?.id ?? null) === who ? togglePostLike(id) : null,
    settle: (id, { liked, count }) => apply(id, (p) => ({ ...p, liked, likeCount: count })),
    undo: (id) => apply(id, (p) => ({ ...p, liked: !p.liked, likeCount: Math.max(0, p.likeCount + (p.liked ? -1 : 1)) })),
    fail,
    owner,
  });
  return (id: string, uid: string | null) => { if (owner() === uid) q.tap(id); };
}
