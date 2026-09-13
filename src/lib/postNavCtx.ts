// 게시글 이전/다음 맥락의 **타입과 스냅샷 정리 한 줄** — App.tsx 가 정적으로 무는 유일한 조각 (UI-04 · 2026-09-13).
//
// 왜 postNav.ts 와 갈라 두나: App.tsx 는 삭제된 글을 스냅샷에서 빼는 dropFromCtx(5줄)만 필요한데, postNav.ts 를 통째로 물면
//   neighborsOf·appendPage·canExtend(gz 2.1KB)가 **첫 화면 임계 경로**에 딸려 온다 — bundle:budget 이 257.1/256KB 로 넘쳤다
//   (2026-09-13 실측, 리드가 'loaded-end' 리터럴로 entry 청크에서 추적). App.tsx:5-6 의 api/events→lib/eventSlug 와 같은 함정.
//   postNav.ts 는 여기서 받아 re-export 한다 — 판정은 한 곳(단일 출처), 소비처 import 경로는 그대로.
import type { CommunityPost, PostCursor, PostCategory } from '../api/community';

export interface PostNavCtx {
  /** 필터 키(검색어·분류·정렬) — 같은 화면인지 대조용 */
  key: string;
  q: string;
  category: PostCategory | 'all';
  order: 'new' | 'popular';
  /** 광고 제외·중복 제거된 실제 화면 순서(스냅샷) */
  items: CommunityPost[];
  /** 서버 커서(이어받기용). null 이면 더 없음(order=new) 또는 아직 서버 조회 전 */
  cursor: PostCursor | null;
  /** 서버가 '더 없음' 을 말했는가 */
  done: boolean;
}

/** 삭제·숨김된 글을 스냅샷에서 뺀다(현재 글이 아닌 남의 글이 지워져도 이웃만 갱신되고 맥락은 남는다). */
export function dropFromCtx(ctx: PostNavCtx | null, id: string): PostNavCtx | null {
  if (!ctx) return null;
  if (!ctx.items.some((p) => p.id === id)) return ctx;
  return { ...ctx, items: ctx.items.filter((p) => p.id !== id) };
}
