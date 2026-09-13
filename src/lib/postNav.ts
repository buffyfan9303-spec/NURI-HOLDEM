// 게시글 상세의 이전/다음 글 — **이 글을 열었던 목록의 실제 화면 순서**(UI-04, 실행문 §7.3·§7.4 · 2026-09-13).
//
// 원칙
//   · "이전 글" = 열었던 목록에서 바로 앞, "다음 글" = 바로 뒤. `App.posts[i±1]` 이 아니라 CommunityTab 이 실제로 조립한
//     최종 배열(필터·분류·검색·인기·고정·끌올 순서, 광고 카드 제외, 중복 id 제거)의 **스냅샷**을 쓴다 — 읽는 동안 실시간 순위가
//     바뀌어도 이웃이 흔들리지 않는다.
//   · 숨김(blinded·차단) 글은 노출하지 않고 건너뛴다. 연속 건너뛰기 상한(MAX_SKIP)에 닿으면 그 방향은 **막힘**으로 말한다
//     ('reason: skipped') — 조용히 더 멀리 가지 않는다.
//   · 첫/마지막: 없는 방향은 'first' / 'end' 로 비활성. **불러온 끝은 '전체 마지막' 이 아니다** — 커서가 남아 있으면 'more'(더 받아서
//     이어갈 수 있음)이고, 커서로 화면 순서를 표현할 수 없는 정렬(popular — searchPosts 의 커서는 like_count 기준이라 목록 자신의
//     fetchMore 와 다른 집합을 준다)은 'loaded-end'(불러온 범위의 끝 · 목록으로)로 정직하게 막는다.
//   · 맥락이 없거나(검색·알림·내 글·공유 링크·인라인 진입) 현재 글이 목록에 없으면(광고로 승격된 글) 'no-context' — 이동 비활성 + 목록으로.
import type { CommunityPost, PostCursor } from '../api/community';
import { dropFromCtx, type PostNavCtx } from './postNavCtx';
// PostNavCtx·dropFromCtx 의 출처는 postNavCtx.ts 다(App.tsx 가 무는 작은 조각 — 번들 예산). 여기서 되내보내 기존 소비처 경로를 지킨다.
export { dropFromCtx, type PostNavCtx };

export const MAX_SKIP = 5;

export type NavEdge = 'first' | 'end' | 'loaded-end' | 'more' | 'skipped' | 'no-context' | null;
export interface NavSide { post: CommunityPost | null; edge: NavEdge; skipped: number }
export interface PostNeighbors { index: number; prev: NavSide; next: NavSide }

/** 이 정렬의 서버 커서가 화면 순서를 이어갈 수 있는가(§7.3 '기존 cursor 를 이용해 필요한 만큼만'). */
export function canExtend(ctx: PostNavCtx): boolean {
  return ctx.order === 'new' && !ctx.done;
}

export function neighborsOf(
  ctx: PostNavCtx | null | undefined,
  currentId: string,
  hidden: (p: CommunityPost) => boolean,
  maxSkip = MAX_SKIP,
): PostNeighbors {
  const none = (edge: NavEdge): NavSide => ({ post: null, edge, skipped: 0 });
  if (!ctx) return { index: -1, prev: none('no-context'), next: none('no-context') };
  const index = ctx.items.findIndex((p) => p.id === currentId);
  if (index < 0) return { index, prev: none('no-context'), next: none('no-context') };
  const walk = (dir: -1 | 1): NavSide => {
    let skipped = 0;
    for (let i = index + dir; i >= 0 && i < ctx.items.length; i += dir) {
      const p = ctx.items[i];
      if (hidden(p)) { skipped += 1; if (skipped > maxSkip) return { post: null, edge: 'skipped', skipped }; continue; }
      return { post: p, edge: null, skipped };
    }
    if (dir === -1) return { post: null, edge: 'first', skipped };
    if (ctx.order !== 'new') return { post: null, edge: 'loaded-end', skipped };
    return { post: null, edge: ctx.done ? 'end' : 'more', skipped };
  };
  return { index, prev: walk(-1), next: walk(1) };
}

/** 서버에서 받은 다음 페이지를 스냅샷 뒤에 잇는다(중복 id 제거). 늘어난 ctx 를 **위로 전파**해야 다음 이동이 같은 페이지를 다시 받지 않는다. */
export function appendPage(ctx: PostNavCtx, page: { posts: CommunityPost[]; nextCursor: PostCursor | null }): PostNavCtx {
  const seen = new Set(ctx.items.map((p) => p.id));
  const extra = page.posts.filter((p) => !seen.has(p.id));
  return { ...ctx, items: extra.length ? [...ctx.items, ...extra] : ctx.items, cursor: page.nextCursor, done: !page.nextCursor };
}
