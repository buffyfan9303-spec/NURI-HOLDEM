// 게시글 좋아요 큐 — App 이 첫 누름 때 동적 import 한다(App.tsx 는 첫 화면 임계 경로라 번들 여유가 0).
// 판정은 likeQueue 한 벌. 여기는 서버 전송만 묶는다.
import { createLikeQueue } from './likeQueue';
import { togglePostLike } from '../api/community';
import { currentUser } from '../api/_session';

export function createPostLikeQueue(o: Omit<Parameters<typeof createLikeQueue>[0], 'send'>) {
  return createLikeQueue({
    ...o,
    // 계정 전환 경합(verifier 메모 A): 보내기 직전 세션이 이 주기를 시작한 계정이 아니면 보내지 않는다.
    send: async (id, owner) => ((await currentUser())?.id ?? null) === owner ? togglePostLike(id) : null,
  });
}
