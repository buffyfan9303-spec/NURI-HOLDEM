import { useState, useEffect, useMemo } from 'react';
import type { Comment } from '../../api/community';
import { useAuth } from '../../contexts/AuthContext';
import { promptLogin } from '../../lib/requireLogin';
import Avatar from '../atoms/Avatar';
import Icon from '../atoms/Icon';
import TitleChip from '../atoms/TitleChip';
import { useTitlePoints } from '../../lib/useTitles';
import { getEquippedMarks, getNickColors } from '../../api/community';
import { tierCss } from '../atoms/TierBadge';
import { nickColorVar } from '../../lib/cosmetics';

interface CommentThreadProps {
  comments: Comment[];
  onSubmit: (content: string, parentId?: string) => void;
  /** 관리자(또는 본인) 댓글 삭제 콜백 — 전달되지 않으면 삭제 버튼 미노출 */
  onDelete?: (commentId: string) => void;
  /** 이 영역(예: 본인 매장 커뮤니티)에서 모든 댓글을 관리(삭제)할 수 있는 권한자 — 업주 등 */
  moderator?: boolean;
  emptyText?: string;
  // ── 응원(30점) 배선 — **커뮤니티 글 댓글에서만** 쓴다(2026-08-30).
  //   onCheer 를 넘기지 않으면 버튼 자체가 안 그려진다 → 요강 Q&A·매장 댓글은 종전 그대로다
  //   (서버 send_cheer 도 post_id 없는 댓글은 거절한다 — 화면과 서버가 같은 범위를 본다).
  /** 댓글 id → 받은 응원 수 */
  cheers?: Record<string, number>;
  /** 내가 이미 응원한 댓글 id */
  myCheers?: Set<string>;
  /** 응원 보내기. 미전달 = 응원 UI 없음 */
  onCheer?: (commentId: string) => void;
  /** 응원 1회 가격(서버 shop_skus.cheer). null 이면 '준비 중' */
  cheerPrice?: number | null;
  /** 응원 요청 진행 중 — 연타 방지 */
  cheerBusy?: boolean;
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return '방금 전';
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

// ── 읽기시점 재그룹(검증 #05) ────────────────────────────────────────────────
// 과거 버그: 대댓글의 replies 를 하드코딩 빈 배열로 렌더 → 3레벨 이상 댓글이 화면에서
// 유실됐다(데이터는 존재). 수정: parentId 데이터는 보존하되, 렌더 시 루트 스레드 밑으로
// 전체 하위 트리를 평탄 수집한다(4레벨+ 흡수). 루트 직속이 아닌 답글은 '@원부모닉'
// 프리픽스(mentionOf)로 맥락을 유지한다.

export interface ThreadGroup {
  root: Comment;
  /** 루트 아래 전체 하위 트리(깊이 무관)를 DFS 순서로 평탄 수집한 답글 목록 */
  replies: { comment: Comment; mentionOf?: string }[];
}

// eslint-disable-next-line react-refresh/only-export-components -- 테스트가 순수 함수를 직접 검증(기존 표시 유틸 공유 관행과 동일)
export function groupThreads(comments: Comment[]): ThreadGroup[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const kids = new Map<string, Comment[]>();
  // 부모가 목록에 없는 답글(부모 삭제 등) — 루트로 승격해 화면 유실을 막는다
  const orphans: Comment[] = [];
  for (const c of comments) {
    if (!c.parentId) continue;
    if (byId.has(c.parentId)) {
      const arr = kids.get(c.parentId);
      if (arr) arr.push(c);
      else kids.set(c.parentId, [c]);
    } else {
      orphans.push(c);
    }
  }
  const roots = [...comments.filter((c) => !c.parentId), ...orphans];
  return roots.map((root) => {
    const replies: ThreadGroup['replies'] = [];
    const walk = (id: string, depth: number) => {
      if (depth > 50) return; // 순환 데이터 방어
      for (const child of kids.get(id) ?? []) {
        replies.push({
          comment: child,
          // 루트 직속 답글은 바로 위가 문맥이므로 생략, 3레벨+에서만 원부모 닉 표기
          mentionOf: child.parentId !== root.id ? byId.get(child.parentId!)?.userName : undefined,
        });
        walk(child.id, depth + 1);
      }
    };
    walk(root.id, 0);
    return { root, replies };
  });
}

function CommentItem({ marks = {}, nickTokens = {}, titleOf,
  comment,
  mention,
  replies,
  composeParentId,
  onReply,
  onDelete,
  canDelete,
  loggedIn,
  cheer,
}: {
  marks?: Record<string, string>;
  /** userId → 닉네임 색의 등급 토큰명(--tier-<token>). 상점 600점 · 20260830n */
  nickTokens?: Record<string, string>;
  titleOf?: (id?: string | null) => number | undefined;
  comment: Comment;
  /** 응원 배선 묶음 — 없으면 버튼을 그리지 않는다(요강 Q&A·매장 댓글) */
  cheer?: {
    counts: Record<string, number>;
    mine: Set<string>;
    price: number | null;
    busy: boolean;
    onSend: (commentId: string) => void;
    myId?: string;
  };
  /** 평탄화된 3레벨+ 답글의 원부모 닉 — '@닉' 프리픽스로 맥락 유지 */
  mention?: string;
  replies: ThreadGroup['replies'];
  /** 이 댓글에 답글을 달 때 저장할 parentId — depth≥1 댓글은 루트 id 로 캡(쓰기시점 재부모화 아님, 새 글만) */
  composeParentId: string;
  onReply: (parentId: string, content: string) => void;
  onDelete?: (commentId: string) => void;
  /** (commentId) => 이 댓글을 삭제할 권한이 있는지 */
  canDelete: (comment: Comment) => boolean;
  loggedIn: boolean;
}) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyContent, setReplyContent] = useState('');

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    onReply(composeParentId, replyContent.trim());
    setReplyContent('');
    setShowReplyBox(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Avatar name={comment.userName} src={comment.userAvatar} color={comment.isOwner ? '#FFD100' : '#5A6175'} size={32} />
        <div className="flex-1 min-w-0">
          {/* 배지 정책은 게시글 상세(PostDetailModal)와 같다 — 색은 하나만.
              · '매장 답글' 은 댓글의 **의미를 바꾸는** 표식이라 유일하게 accent 를 유지하되
                틴트 채움을 걷고 아웃라인으로 무게를 낮춘다.
                accent-300 → accent-200: 300 은 다크 틴트 위 3.14:1 로 AA 미달이었다(정본: postCategory.ts).
                200 은 라이트에서 index.css 오버라이드(#6946C8)로 딥 톤이 되어 양 테마를 통과한다.
              · '운영자' 는 danger 틴트(빨강)여서 경고처럼 읽혔다 — 작성자 메타데이터일 뿐이라 중립 아웃라인으로. */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mb-0.5">
            {/* 닉네임 색 — 텍스트용 --tier-*(4.5:1 계약). 색이 없으면 종전 ink-primary 그대로다. */}
            <span className="text-xs font-semibold text-ink-primary"
                  style={nickColorVar(nickTokens[comment.userId]) ? { color: tierCss(nickColorVar(nickTokens[comment.userId])!) } : undefined}>
              {marks[comment.userId] ?? ''}{comment.userName}
            </span>
            <TitleChip points={titleOf?.(comment.userId)} />
            {comment.isOwner && (
              <span className="shrink-0 rounded-badge border border-accent-300/50 px-1.5 py-0.5 text-2xs font-semibold leading-none text-accent-200">매장 답글</span>
            )}
            {comment.userRole === 'admin' && (
              <span className="shrink-0 rounded-badge border border-border-strong px-1.5 py-0.5 text-2xs font-semibold leading-none text-ink-secondary">운영자</span>
            )}
            <span className="text-2xs text-ink-muted">· {relativeTime(comment.createdAt)}</span>
          </div>
          <p className="text-sm text-ink-primary leading-relaxed whitespace-pre-wrap break-words">
            {mention && <span className="font-semibold text-accent-200">@{mention} </span>}
            {comment.content}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => { if (!loggedIn) { promptLogin(); return; } setShowReplyBox((v) => !v); }}
              className="hit text-2xs text-ink-muted transition-colors hover:text-accent-200"
            >
              {showReplyBox ? '취소' : '답글'}
            </button>
            {/* 응원 — 유료 동작이라 값을 라벨에 박는다(누르기 전에 가격을 읽게).
                내 댓글에는 아예 안 그린다(서버도 자기 글 응원을 거절한다 — 화면이 먼저 말한다). */}
            {cheer && cheer.myId !== comment.userId && (
              cheer.mine.has(comment.id) ? (
                <span className="inline-flex items-center gap-0.5 text-2xs font-bold text-accent-200">
                  <Icon name="chip-stack" size={11} strokeWidth={2} className="shrink-0" />
                  응원 <span className="tabular-nums">{cheer.counts[comment.id] ?? 1}</span>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={cheer.busy || cheer.price === null}
                  onClick={() => { if (!loggedIn) { promptLogin(); return; } cheer.onSend(comment.id); }}
                  className="hit inline-flex items-center gap-0.5 text-2xs tabular-nums text-ink-muted transition-colors hover:text-accent-200 disabled:opacity-50"
                >
                  <Icon name="chip-stack" size={11} strokeWidth={2} className="shrink-0" />
                  응원{cheer.price === null ? '' : ` ${cheer.price.toLocaleString()}점`}
                  {(cheer.counts[comment.id] ?? 0) > 0 && <span className="ml-0.5 text-accent-200">{cheer.counts[comment.id]}</span>}
                </button>
              )
            )}
            {/* 관리자(또는 본인)에게만 삭제 버튼 노출 */}
            {onDelete && canDelete(comment) && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('이 댓글을 삭제하시겠습니까?')) onDelete(comment.id);
                }}
                className="hit text-2xs text-ink-muted transition-colors hover:text-danger-light"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 답글 입력창 */}
      {showReplyBox && (
        <form onSubmit={submitReply} className="ml-10 flex gap-2 animate-slide-up">
          <input
            type="text"
            autoFocus
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder={`@${comment.userName} 에게 답글…`}
            className="input flex-1"
          />
          <button type="submit" className="btn-primary px-3 shrink-0">등록</button>
        </form>
      )}

      {/* 답글 목록 — 루트 아래 전체 하위 트리 평탄 수집(3레벨+ 유실 방지, 검증 #05).
          스레드 선: border-subtle 2px 는 다크 1.11:1 · 라이트 1.23:1 로 **있으나 마나 한 선**이었다
          (모달 헤더 구분선을 border-strong 으로 올린 것과 같은 이유 — 어느 댓글이 어느 답글인지
          알려주는 유일한 단서가 이 선이다). 굵기를 1px 로 줄이고 값을 올린다: 2.88 / 3.13. */}
      {replies.length > 0 && (
        <div className="ml-10 space-y-3 border-l border-border-strong pl-3">
          {replies.map(({ comment: r, mentionOf }) => (
            <CommentItem key={r.id} marks={marks} nickTokens={nickTokens} titleOf={titleOf} comment={r} mention={mentionOf} replies={[]} composeParentId={composeParentId} onReply={onReply} onDelete={onDelete} canDelete={canDelete} loggedIn={loggedIn} cheer={cheer} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentThread({
  comments, onSubmit, onDelete, moderator = false, emptyText = '아직 댓글이 없습니다.',
  cheers, myCheers, onCheer, cheerPrice = null, cheerBusy = false,
}: CommentThreadProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  // 작성자 장착 마크(상점) — 댓글 userId 일괄 조회
  const [marks, setMarks] = useState<Record<string, string>>({});
  // 작성자 닉네임 색(상점 600점 · 20260830n) — 마크와 같은 결합 지점이라 같은 자리에서 함께 받는다.
  const [nickTokens, setNickTokens] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = [...new Set(comments.map((c) => c.userId).filter(Boolean))];
    if (ids.length === 0) { setMarks({}); setNickTokens({}); return; }
    getEquippedMarks(ids).then(setMarks).catch(() => {});
    getNickColors(ids).then(setNickTokens).catch(() => {});
  }, [comments]);
  // 작성자 칭호(활동점수) — 댓글 userId 일괄 조회
  const titleOf = useTitlePoints(comments.map((c) => c.userId));

  // 관리자/모더레이터(본인 매장 업주)는 모든 댓글, 일반 사용자는 본인 댓글만 삭제 (서버 RLS와 동일)
  const canDelete = (c: Comment) => moderator || user?.role === 'admin' || user?.id === c.userId;

  // 읽기시점 재그룹 — 루트별 전체 하위 트리 평탄 수집(3레벨+ 유실 0, 검증 #05)
  const threads = useMemo(() => groupThreads(comments), [comments]);

  // 응원 배선 — onCheer 가 없으면 undefined 라 버튼이 통째로 사라진다(종전 화면 그대로).
  const cheer = onCheer
    ? { counts: cheers ?? {}, mine: myCheers ?? new Set<string>(), price: cheerPrice,
        busy: cheerBusy, onSend: onCheer, myId: user?.id }
    : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSubmit(content.trim());
    setContent('');
  };

  return (
    <div className="space-y-4">
      {/* 입력창 */}
      {user ? (
        <form onSubmit={submit} className="flex gap-2 py-2">
          <Avatar name={user.name} src={user.avatarUrl} color={user.avatarColor} size={32} />
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 입력하세요…"
            className="input flex-1"
          />
          <button type="submit" className="btn-primary px-4 shrink-0" disabled={!content.trim()}>
            등록
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => promptLogin()}
          className="w-full rounded-input border border-border-strong bg-surface-high p-3 text-center text-xs text-ink-secondary transition-colors hover:border-accent-300/60 hover:text-ink-primary">
          로그인하면 댓글을 작성할 수 있어요 — <b className="text-accent-200">로그인하기 →</b>
        </button>
      )}

      {/* 목록 */}
      {threads.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-default py-6 text-center text-xs text-ink-muted">{emptyText}</p>
      ) : (
        <div className="space-y-4">
          {threads.map(({ root, replies }) => (
            <CommentItem
              key={root.id}
              marks={marks}
              nickTokens={nickTokens}
              titleOf={titleOf}
              comment={root}
              replies={replies}
              composeParentId={root.id}
              onReply={(parentId, content) => onSubmit(content, parentId)}
              onDelete={onDelete}
              canDelete={canDelete}
              loggedIn={!!user}
              cheer={cheer}
            />
          ))}
        </div>
      )}
    </div>
  );
}
