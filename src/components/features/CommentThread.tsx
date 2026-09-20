import { useState, useEffect, useMemo, useRef } from 'react';
import type { Comment } from '../../api/community';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlockContext';
import { promptLogin } from '../../lib/requireLogin';
import Avatar from '../atoms/Avatar';
import Icon from '../atoms/Icon';
import { useTitlePoints } from '../../lib/useTitles';
import { getEquippedMarks, getNickColors } from '../../api/community';
import { tierCss } from '../atoms/TierBadge';
import { nickColorVar } from '../../lib/cosmetics';
import { relativeTime } from '../../lib/relativeTime';

interface CommentThreadProps {
  comments: Comment[];
  // N04(2026-09-12): Promise 계약 — 성공을 기다린 뒤에만 입력을 비운다.
  // 실패하면 reject 해라(throw) — 그래야 이 컴포넌트가 원문을 지우지 않고 남긴다.
  onSubmit: (content: string, parentId?: string) => Promise<void>;
  /** 관리자(또는 본인) 댓글 삭제 콜백 — 전달되지 않으면 삭제 버튼 미노출 */
  onDelete?: (commentId: string) => void;
  /** 이 영역(예: 본인 매장 커뮤니티)에서 모든 댓글을 관리(삭제)할 수 있는 권한자 — 업주 등 */
  moderator?: boolean;
  emptyText?: string;
  /** 🔴 C1(2026-09-20) — **모바일 게시글 상세 전용** 표시 분기. 기본 false.
   *
   *  이 컴포넌트는 게시글 상세뿐 아니라 **매장 Q&A·요강 댓글**에도 쓰인다(공통 통로).
   *  그래서 시안을 위해 스타일을 무조건 바꾸면 게시글과 무관한 화면 두 곳이 같이 변한다.
   *  → 호출부를 늘리지 않고 **명시적 단일 분기** 하나만 둔다. 지금 true 를 넘기는 곳은
   *    `PostDetailModal`(inline=false, 즉 모바일 독립 상세) 하나뿐이다.
   *  ⚠ 값이 true 여도 실제 스타일 차이는 전부 `max-lg:` 로 걸려 **PC 에서는 종전 그대로**다
   *    — 같은 컴포넌트가 breakpoint 마다 다른 DOM 을 만들지 않게 한다(2-pane 회귀 방지). */
  postDetailMobile?: boolean;
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

// ── 제출 계약(N04, 2026-09-12) ───────────────────────────────────────────────
// 재현한 버그: 댓글·답글 submit 이 onSubmit/onReply 를 fire-and-forget 으로 부른 뒤
// 즉시 입력을 비웠다 → 오프라인·제재 게이트(P0001) 로 실패해도 토스트만 뜨고 원문은
// 이미 사라져 되돌릴 수 없었다. 중복 제출 잠금도 없었다.
// 수정: 성공을 기다린 뒤에만 비우고, pending 중 재진입은 즉시 막는다(pendingRef 는
// React state 배칭과 무관하게 동기적으로 막혀야 해서 useState 가 아니라 ref 로 잰다).
// 렌더러 없이(vitest environment: node) 이 계약만 따로 테스트하려고 뽑아낸 순수 함수.
export type SubmitOutcome = 'skipped' | 'success' | 'error';

// eslint-disable-next-line react-refresh/only-export-components -- 테스트가 순수 함수를 직접 검증(groupThreads 와 같은 관행)
export async function guardedSubmit(
  content: string,
  pendingRef: { current: boolean },
  onSubmit: (trimmed: string) => Promise<void>,
  onSuccess: () => void,
): Promise<SubmitOutcome> {
  const trimmed = content.trim();
  if (!trimmed || pendingRef.current) return 'skipped';
  pendingRef.current = true;
  try {
    await onSubmit(trimmed);
    onSuccess();
    return 'success';
  } catch {
    return 'error'; // 원문은 호출부가 지우지 않은 채로 남는다
  } finally {
    pendingRef.current = false;
  }
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
}: {
  marks?: Record<string, string>;
  /** userId → 닉네임 색의 등급 토큰명(--tier-<token>). 상점 600점 · 20260830n */
  nickTokens?: Record<string, string>;
  titleOf?: (id?: string | null) => number | undefined;
  comment: Comment;
  /** 평탄화된 3레벨+ 답글의 원부모 닉 — '@닉' 프리픽스로 맥락 유지 */
  mention?: string;
  replies: ThreadGroup['replies'];
  /** 이 댓글에 답글을 달 때 저장할 parentId — depth≥1 댓글은 루트 id 로 캡(쓰기시점 재부모화 아님, 새 글만) */
  composeParentId: string;
  /** N04: Promise 계약 — 성공을 기다린 뒤에만 답글 입력을 비운다(실패 시 throw). */
  onReply: (parentId: string, content: string) => Promise<void>;
  onDelete?: (commentId: string) => void;
  /** (commentId) => 이 댓글을 삭제할 권한이 있는지 */
  canDelete: (comment: Comment) => boolean;
  loggedIn: boolean;
}) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replyPending, setReplyPending] = useState(false);
  // 동기적 재진입 가드 — useState 는 배칭돼 두 번째 클릭이 첫 setPending(true) 커밋 전에
  // 통과할 수 있다(2026-09-10 알약 버그와 같은 종류의 함정). ref 는 즉시 반영된다.
  const replyPendingRef = useRef(false);

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (replyPendingRef.current) return; // 중복 제출 잠금
    setReplyPending(true);
    guardedSubmit(
      replyContent,
      replyPendingRef,
      (trimmed) => onReply(composeParentId, trimmed),
      () => { setReplyContent(''); setShowReplyBox(false); },
    ).finally(() => setReplyPending(false));
    // 실패 시 setReplyContent/setShowReplyBox 를 호출하지 않으므로 원문·parent·focus 가 그대로 남는다.
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
            {/* 칭호 칩 미노출 — 목록과 같은 이유(2026-09-18 오너 지시). PostRowCard 주석 참고. */}
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
          <button type="submit" className="btn-primary px-3 shrink-0" disabled={!replyContent.trim() || replyPending}>등록</button>
        </form>
      )}

      {/* 답글 목록 — 루트 아래 전체 하위 트리 평탄 수집(3레벨+ 유실 방지, 검증 #05).
          스레드 선: border-subtle 2px 는 다크 1.11:1 · 라이트 1.23:1 로 **있으나 마나 한 선**이었다
          (모달 헤더 구분선을 border-strong 으로 올린 것과 같은 이유 — 어느 댓글이 어느 답글인지
          알려주는 유일한 단서가 이 선이다). 굵기를 1px 로 줄이고 값을 올린다: 2.88 / 3.13. */}
      {replies.length > 0 && (
        <div className="ml-10 space-y-3 border-l border-border-strong pl-3">
          {replies.map(({ comment: r, mentionOf }) => (
            <CommentItem key={r.id} marks={marks} nickTokens={nickTokens} titleOf={titleOf} comment={r} mention={mentionOf} replies={[]} composeParentId={composeParentId} onReply={onReply} onDelete={onDelete} canDelete={canDelete} loggedIn={loggedIn} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentThread({
  comments, onSubmit, onDelete, moderator = false, emptyText = '아직 댓글이 없습니다.',
  postDetailMobile = false,
}: CommentThreadProps) {
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const [content, setContent] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false); // 동기 재진입 가드 — CommentItem 의 replyPendingRef 와 같은 이유
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
  //
  // ⚠ 차단(block)을 여기서 함께 거른다(2026-09-07 감사). 종전엔 차단이 **글·매물에만** 걸려 있어
  //   (isBlocked 호출부가 App.tsx·CommunityTab·MarketplaceTab 3곳뿐이었다) 차단한 사람의 글은
  //   사라지는데 **그 사람의 댓글·대댓글은 계속 보였다.** 손님 입장에서는 차단이 안 먹는 것으로 읽히고,
  //   그 다음에 취할 수 있는 수가 없다. 이 컴포넌트가 글 상세·매장 Q&A·요강 댓글의 공통 통로라
  //   여기 한 곳만 거르면 호출부를 손댈 필요가 없다.
  //   ⚠ 본인 댓글은 절대 숨기지 않는다 — isBlocked 가 어떤 이유로 참이 되어도 내가 쓴 말이 사라지면
  //     '글이 안 써졌다'로 오해한다.
  const threads = useMemo(
    () => groupThreads(comments.filter((c) => c.userId === user?.id || !isBlocked(c.userId))),
    [comments, isBlocked, user?.id],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingRef.current) return; // 중복 제출 잠금
    setPending(true);
    guardedSubmit(content, pendingRef, (trimmed) => onSubmit(trimmed), () => setContent(''))
      .finally(() => setPending(false));
    // 실패하면 setContent('') 를 호출하지 않으므로 원문·focus 가 입력창에 그대로 남는다.
  };

  return (
    <div className="space-y-4">
      {/* 입력창 */}
      {user ? (
        /* 🔴 C1(2026-09-20 시안) — 모바일 게시글 상세에서는 아바타·입력·보내기가 **둥근 한 면** 안에
           들어간다(시안 두 번째 카드). 바뀌는 것은 겉면뿐이다: `submit`·`content`·`pending`·
           disabled 조건·IME·placeholder 는 한 글자도 안 바꿨다(실패 후 초안 보존·동기 재진입 가드 포함).
           ⚠ 비로그인 분기(`user ? … : 로그인 버튼`)는 그대로다 — 그걸 지우면 `user.name` 에서 크래시난다. */
        <form onSubmit={submit} className={postDetailMobile
          /* ⚠ 입력 면은 테마마다 **반대 방향**이다(PostDetailModal 의 카드 면 주석과 같은 함정).
             라이트 팔레트는 high(#F0F1F4)가 가장 어둡고 mid/low 가 흰색이라, 댓글 카드가 high 를
             쓰는 지금 입력까지 high 로 두면 **입력칸이 카드에 흡수된다**(실측으로 잡았다).
             → 라이트는 흰색(mid)으로 띄우고, 다크는 종전대로 카드보다 밝은 high. */
          ? 'flex gap-2 py-2 max-lg:items-center max-lg:gap-1.5 max-lg:rounded-[16px] max-lg:border max-lg:border-border-strong max-lg:bg-surface-mid max-lg:dark:bg-surface-high max-lg:p-1.5 max-lg:py-1.5'
          : 'flex gap-2 py-2'}>
          <Avatar name={user.name} src={user.avatarUrl} color={user.avatarColor} size={32} />
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 입력하세요…"
            className={postDetailMobile
              ? 'input min-w-0 flex-1 max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none max-lg:focus:ring-0'
              : 'input flex-1'}
          />
          {/* 보내기 — 모바일은 시안대로 정사각 아이콘 버튼. 글자 라벨은 `sr-only` 로 **남긴다**
              (아이콘만 남기고 이름을 지우면 보조기술에 이름 없는 버튼이 된다). 44px 계약:
              루트가 17px 이라 `h-11` 은 46.75px — 44 이상이므로 통과한다(여기선 넉넉한 쪽이 맞다). */}
          <button type="submit" aria-label={postDetailMobile ? '댓글 등록' : undefined}
            className={postDetailMobile
              ? 'btn-primary shrink-0 px-4 max-lg:flex max-lg:h-11 max-lg:w-11 max-lg:items-center max-lg:justify-center max-lg:rounded-[12px] max-lg:px-0'
              : 'btn-primary px-4 shrink-0'}
            disabled={!content.trim() || pending}>
            {postDetailMobile && <Icon name="send" size={18} className="hidden max-lg:block" aria-hidden />}
            <span className={postDetailMobile ? 'max-lg:sr-only' : undefined}>등록</span>
          </button>
        </form>
      ) : (
        /* 🔴 C1 — 비로그인 CTA 도 입력창과 **같은 자리·같은 면**이다. 라이트에서 `bg-surface-high` 만
           두면 댓글 카드(역시 high)에 흡수돼 버튼이 사라진다 — 위 form 과 같은 이유·같은 처방. */
        <button type="button" onClick={() => promptLogin()}
          className={['w-full rounded-input border border-border-strong bg-surface-high p-3 text-center text-xs text-ink-secondary transition-colors hover:border-accent-300/60 hover:text-ink-primary',
            postDetailMobile ? 'max-lg:bg-surface-mid max-lg:dark:bg-surface-high' : ''].join(' ')}>
          로그인하면 댓글을 작성할 수 있어요 — <b className="text-accent-200">로그인하기 →</b>
        </button>
      )}

      {/* 목록 — 입력 폼이 이미 "쓸 수 있다"고 말하고 있으므로, 로그인 상태(=입력 폼 렌더)에서는
          같은 말을 반복하는 점선 안내 박스를 생략한다(오너 2026-09-14: 댓글 0 헤더 → 입력창 →
          "첫 댓글을 남겨보세요" 3단 중복). 비로그인(=입력 폼 대신 로그인 버튼)에서는 이 박스가
          "댓글이 없다"를 알리는 유일한 신호라 그대로 둔다 — 기존 `user` 분기를 그대로 재사용한다. */}
      {threads.length === 0 ? (
        user ? null : (
          <p className="rounded-card border border-dashed border-border-default py-6 text-center text-xs text-ink-muted">{emptyText}</p>
        )
      ) : (
        /* 🔴 C1(2026-09-20 시안) — 모바일 게시글 상세에서는 **서로 다른 댓글 사이에만** 얇은 선을 둔다.
           `divide-y` 는 첫 줄 위·마지막 줄 아래에 선을 만들지 않으므로 카드 안쪽에 중복 테두리가
           생기지 않는다(시안의 두 번째 카드가 정확히 그 모양이다).
           ⚠ 답글(대댓글) 안의 계층선·부모 ID·3레벨 평탄 수집은 `CommentItem` 안이라 **안 건드린다** —
             루트 댓글만 감싼다. 여기를 답글까지 적용하면 답글마다 선이 생겨 계층이 뭉개진다. */
        <div className={postDetailMobile
          ? 'space-y-4 max-lg:space-y-0 max-lg:divide-y max-lg:divide-border-strong'
          : 'space-y-4'}>
          {threads.map(({ root, replies }) => (
            <div key={root.id} className={postDetailMobile ? 'max-lg:py-3 max-lg:first:pt-1' : undefined}>
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
            />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
