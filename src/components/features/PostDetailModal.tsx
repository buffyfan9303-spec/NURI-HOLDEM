import { useRef, useState, useEffect } from 'react';
import { getEquippedMarks } from '../../api/community';
import Modal from '../atoms/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlockContext';
import { useToast } from '../atoms/Toast';
import type { CommunityPost, ReactionType, Comment } from '../../api/community';
import { reactToPost, removeReaction, getMyReaction, incrementPostView, adminSetPostBlinded, getComments, addComment, deleteComment } from '../../api/community';
import CommentThread from './CommentThread';
import ReportModal from './ReportModal';
import { parseAttachments } from '../../lib/hand';
import HandReplayer from './HandReplayer';
import { renderMentions } from '../../lib/mentions';
import { promptLogin } from '../../lib/requireLogin';
import HandCards from '../atoms/HandCards';
import HandGtoModal from './HandGtoModal';
import TitleChip from '../atoms/TitleChip';
import { useTitlePoints } from '../../lib/useTitles';
import Avatar from '../atoms/Avatar';
import Icon from '../atoms/Icon';
import ImageLightbox from '../atoms/ImageLightbox';
import { thumbUrl, thumbSrcSet } from '../../lib/imageUrl';
import PostAttachments from './PostAttachments';
import { fetchAttachment, castPollVote, subscribePollResults } from '../../api/postAttachments';
import type { Attachment, PollOption } from '../../api/postAttachments';

interface PostDetailModalProps {
  post: CommunityPost | null;
  open: boolean;
  onClose: () => void;
  onLike: (postId: string) => void;
  /** 관리자 또는 작성자 삭제 */
  onDelete?: (postId: string) => void;
  /** @매장 멘션 링크용 */
  venues?: { id: string; name: string }[];
  onVenueClick?: (venueId: string) => void;
  /** true면 오버레이가 아닌 인라인 패널로 렌더(데스크탑 커뮤니티 2-pane 우측). */
  inline?: boolean;
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

export default function PostDetailModal({
  post, open, onClose, onLike, onDelete, venues = [], onVenueClick, inline = false,
}: PostDetailModalProps) {
  const [gtoHero, setGtoHero] = useState<string[] | null>(null);
  // 확대해서 볼 첨부 사진의 인덱스(null=닫힘). 뷰어는 포스터에 쓰던 ImageLightbox 를 그대로 재사용한다.
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  // 열린 시각 — 고스트 클릭(피드 카드 탭의 합성 click) 판정 기준. 방금 마운트된 첨부 사진에
  // 유령 클릭이 꽂혀 라이트박스가 멋대로 열리는 것 방지(ScheduleDetailModal 과 동일 패턴).
  const openedAtRef = useRef(0);
  const { user } = useAuth();
  const { block } = useBlocks();
  // 더블탭 좋아요(인스타) — 본문을 빠르게 두 번 탭하면 좋아요 + 하트 팝
  const [heartKey, setHeartKey] = useState(0);
  const [authorMark, setAuthorMark] = useState('');
  const titlePts = useTitlePoints([post?.userId]); // 작성자 칭호(활동점수)
  useEffect(() => {
    setAuthorMark('');
    if (post?.userId) getEquippedMarks([post.userId]).then((m) => setAuthorMark(m[post.userId] ?? '')).catch(() => {});
  }, [post?.userId]);
  const doubleLike = () => {
    if (!user || !post) return;
    onLike(post.id);
    setHeartKey((k) => k + 1);
  };
  const [replies, setReplies] = useState<Comment[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const toast = useToast();
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [bb, setBb] = useState(0);
  const [gr, setGr] = useState(0);

  useEffect(() => {
    if (!open || !post) return;
    setBb(post.badbeatCount ?? 0);
    setGr(post.goodrunCount ?? 0);
    setMyReaction(null);
    setZoomIdx(null); // 2-pane 은 같은 인스턴스로 글만 갈아끼우므로 이전 글의 확대 뷰가 남는다
    openedAtRef.current = performance.now();
    let active = true;
    getMyReaction(post.id).then((r) => { if (active) setMyReaction(r); }).catch(() => {});
    incrementPostView(post.id).catch(() => {});
    // 댓글 실제 조회 — 이전에는 로컬 state에만 쌓여 새로고침 시 사라졌다(저장 안 됨).
    setReplies([]);
    getComments({ postId: post.id })
      .then((cs) => { if (active) setReplies(cs); })
      .catch(() => { /* 조회 실패 시 빈 목록 유지 */ });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post?.id]);

  // ── 어태치먼트(핸드 결과·투표) — DB 기반 신규 시스템(src/api/postAttachments).
  // 로딩 중엔 아무것도 그리지 않는다(스켈레톤 금지 — 유무를 모르는 상태의 공간 예약은 없는 글에서 CLS).
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  // 낙관 갱신 직후 리얼타임 에코 가드 — castPollVote 서버 응답이 최종이므로,
  // 마지막 vote 후 800ms 안에 도착한 구독 콜백은 무시한다(§7-6).
  const lastVoteAtRef = useRef(0);
  useEffect(() => {
    setAttachment(null);
    if (!open || !post) return;
    let active = true;
    fetchAttachment(post.id).then((a) => { if (active) setAttachment(a); }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post?.id]);

  const pollId = attachment?.kind === 'poll' ? attachment.id : null;
  useEffect(() => {
    if (!open || !pollId) return;
    const unsubscribe = subscribePollResults(pollId, (options) => {
      if (performance.now() - lastVoteAtRef.current < 800) return;
      setAttachment((prev) => (prev && prev.kind === 'poll' && prev.id === pollId ? { ...prev, options } : prev));
    });
    return unsubscribe; // 닫힘/글 전환/언마운트 시 해제
  }, [open, pollId]);

  if (!post) return null;

  // 첨부 사진(최대 4장, community_posts.images). 업로드·저장은 되고 있었는데 그리는 코드가 없어
  // 어느 화면에도 안 나왔다 → 글쓴이가 재업로드/삭제하던 원인.
  const images = post.images ?? [];
  // 인덱스로 직접 접근하면 타입이 흔들려 여기서 한 번만 좁혀 둔다.
  const zoomSrc = zoomIdx === null ? null : (images[zoomIdx] ?? null);

  const copyLink = async () => {
    const url = `${window.location.origin}/?post=${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.show('게시물 링크를 복사했습니다', 'success');
    } catch {
      // 클립보드 권한 거부 등 — 프롬프트로 폴백
      window.prompt('아래 링크를 복사해 공유하세요', url);
    }
  };

  const react = async (type: ReactionType) => {
    if (!user) { toast.show('로그인 후 이용할 수 있습니다', 'error'); promptLogin(); return; }
    try {
      if (myReaction === type) {
        setMyReaction(null);
        if (type === 'badbeat') setBb((n) => Math.max(0, n - 1)); else setGr((n) => Math.max(0, n - 1));
        await removeReaction(post.id);
      } else {
        const prev = myReaction;
        setMyReaction(type);
        if (type === 'badbeat') { setBb((n) => n + 1); if (prev === 'goodrun') setGr((n) => Math.max(0, n - 1)); }
        else { setGr((n) => n + 1); if (prev === 'badbeat') setBb((n) => Math.max(0, n - 1)); }
        await reactToPost(post.id, type);
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '처리에 실패했습니다', 'error');
    }
  };

  // 댓글 작성 — CommentThread(답글 parentId 지원) 계약. 저장 성공분만 반영(임시행 롤백 불필요).
  const handleSubmitComment = (content: string, parentId?: string) => {
    if (!user) { promptLogin(); return; }
    addComment({
      postId: post.id, parentId,
      userId: user.id, userName: user.name, userRole: user.role,
      isOwner: user.role === 'venue_owner', content,
    })
      .then((saved) => setReplies((prev) => [saved, ...prev]))
      .catch((err) => toast.show(err instanceof Error ? err.message : '댓글 등록에 실패했습니다', 'error'));
  };
  const handleDeleteComment = (commentId: string) => {
    deleteComment(commentId) // 권한은 RLS(본인·관리자)가 강제
      .then(() => setReplies((prev) => prev.filter((c) => c.id !== commentId && c.parentId !== commentId)))
      .catch((err) => toast.show(err instanceof Error ? err.message : '삭제에 실패했습니다', 'error'));
  };

  // 투표 배선 — 서버 집계가 최종. 실패는 토스트 + rethrow(PostAttachments 가 낙관 갱신 롤백).
  const handleVote = async (pId: string, optionId: string): Promise<PollOption[]> => {
    lastVoteAtRef.current = performance.now(); // 비행 중 리얼타임 에코도 가드
    try {
      const options = await castPollVote(pId, optionId);
      lastVoteAtRef.current = performance.now();
      setAttachment((prev) => (prev && prev.kind === 'poll' && prev.id === pId
        ? { ...prev, options, myOptionId: optionId }
        : prev));
      return options;
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '투표에 실패했습니다', 'error');
      throw e;
    }
  };

  return (
    <>
    <Modal open={open} onClose={onClose} title="게시글" maxWidth="lg" variant="sheet" inline={inline}>
      <article className="p-4 space-y-4">
        {/* ── 작성자 정보 ─────────────────────────────────── */}
        <header className="flex items-center gap-2 pb-3 border-b border-border-subtle">
          <Avatar name={post.userName} src={post.userAvatar} color={post.userColor} size={40} />
          <div className="flex-1 min-w-0">
            {/* flex-wrap(2026-08-28 스윕): 390px에서 칭호칩+역할배지+우측 공유·신고·차단 버튼이
                폭을 다 먹어 작성자 이름이 '♣..'로 통째로 사라졌다 — 칩이 다음 줄로 내려가고
                이름이 먼저 살아남게 줄바꿈을 허용한다(이름 자체는 max-w-full truncate 유지). */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="max-w-full truncate text-sm font-semibold text-ink-primary">{authorMark}{post.userName}</span>
              <TitleChip points={titlePts(post.userId)} />
              {post.userRole === 'venue_owner' && (
                <span className="text-2xs font-bold text-accent-300 bg-accent-300/15 px-1.5 py-0.5 rounded-badge">업주</span>
              )}
              {post.userRole === 'admin' && (
                <span className="text-2xs font-bold text-danger-light bg-danger/15 px-1.5 py-0.5 rounded-badge">운영자</span>
              )}
            </div>
            <p className="text-2xs text-ink-muted mt-0.5 tabular-nums">
              {formatFullDate(post.createdAt)}
            </p>
          </div>
          <button type="button" onClick={copyLink} aria-label="링크 복사"
            className="shrink-0 inline-flex items-center gap-1 text-2xs text-ink-muted hover:text-accent-300 transition-colors px-1.5 py-1">
            <Icon name="share" size={13} /> 공유
          </button>
          {user && user.id !== post.userId && (
            <button type="button" onClick={() => setReportOpen(true)}
              className="shrink-0 text-2xs text-ink-muted hover:text-danger-light transition-colors px-1 py-1">
              신고
            </button>
          )}
          {user && user.id !== post.userId && (
            <button type="button"
              onClick={async () => {
                if (!confirm(`'${post.userName}'님을 차단할까요?\n이 사용자의 글·댓글이 보이지 않게 됩니다.`)) return;
                try { await block(post.userId, post.userName); toast.show('차단했습니다 — 이 사용자의 글이 숨겨집니다', 'info'); onClose(); }
                catch (e) { toast.show(e instanceof Error ? e.message : '차단 실패', 'error'); }
              }}
              className="shrink-0 text-2xs text-ink-muted hover:text-danger-light transition-colors px-1 py-1">
              차단
            </button>
          )}
          {onDelete && (user?.role === 'admin' || user?.id === post.userId) && (
            <button
              type="button"
              onClick={() => { if (confirm('이 게시글을 삭제하시겠습니까?')) onDelete(post.id); }}
              className="shrink-0 text-2xs font-semibold px-2 py-1 rounded-badge border bg-danger/15 text-danger-light border-danger/30 hover:bg-danger/25 transition-colors"
            >
              삭제
            </button>
          )}
        </header>

        {/* 신고 누적 자동 숨김 안내(운영자·작성자만 이 글에 접근) */}
        {post.blinded && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-card border border-danger/40 bg-danger/[0.06] px-3 py-2">
            <span className="text-2xs font-bold text-danger">🚫 신고 누적으로 숨김 처리된 게시글입니다</span>
            {user?.role === 'admin' && (
              <button type="button"
                onClick={async () => {
                  try { await adminSetPostBlinded(post.id, false); toast.show('숨김을 해제했습니다', 'success'); onClose(); }
                  catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
                }}
                className="ml-auto rounded-input border border-border-default px-2.5 py-1 text-2xs font-bold text-ink-secondary hover:text-accent-300">숨김 해제</button>
            )}
          </div>
        )}

        {/* ── 본문 ───────────────────────────────────────── */}
        {(() => {
          const { text, hand, replay } = parseAttachments(post.content);
          return (
            <div className="space-y-3 py-2">
              {text && (
                <div onDoubleClick={doubleLike}
                  className="relative text-base text-ink-primary leading-relaxed whitespace-pre-wrap break-words">
                  {heartKey > 0 && (
                    <span key={heartKey} aria-hidden
                      className="anim-heart pointer-events-none absolute inset-0 flex items-center justify-center text-6xl"
                      onAnimationEnd={() => setTimeout(() => setHeartKey(0), 250)}>
                      ❤️
                    </span>
                  )}
                  {onVenueClick ? renderMentions(text, venues, onVenueClick) : text}
                </div>
              )}
              {/* 본문 사진 — 탭하면 확대. 그리드는 480px 변환본만 받아 Egress 를 아끼고,
                  원본은 라이트박스에서만 내려받는다(무료 5GB/월 한도 방어). */}
              {images.length > 0 && (
                <ul className={`grid gap-1.5 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {images.map((url, i) => (
                    <li key={url}>
                      <button type="button" onClick={() => { if (performance.now() - openedAtRef.current < 400) return; setZoomIdx(i); }}
                        aria-label={`첨부 사진 ${i + 1} 확대 보기`}
                        className={`block w-full overflow-hidden rounded-card border border-border-subtle bg-surface-high active:opacity-80 ${images.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}>
                        <img src={thumbUrl(url, 480)} srcSet={thumbSrcSet(url, 480)}
                          alt={`첨부 사진 ${i + 1}`} loading="lazy" decoding="async"
                          className="h-full w-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {hand && <HandCards hand={hand} />}
              {replay && <HandReplayer replay={replay} />}
              {(() => {
                const heroCards = (replay?.hero?.length ? replay.hero : hand?.hero) ?? [];
                if (heroCards.length < 2) return null;
                return (
                  <button type="button" onClick={() => { if (performance.now() - openedAtRef.current < 400) return; setGtoHero(heroCards); }}
                    className="inline-flex items-center gap-1.5 rounded-input border border-accent-400/40 bg-accent-300/10 px-3 py-2 text-xs font-bold text-accent-300 active:opacity-80">
                    🎯 이 핸드 GTO 분석
                  </button>
                );
              })()}
              {gtoHero && <HandGtoModal hero={gtoHero} onClose={() => setGtoHero(null)} />}
            </div>
          );
        })()}

        {/* ── 어태치먼트(핸드 결과·투표) — 본문 아래. 로딩 중엔 미표시(스켈레톤 금지). */}
        {attachment && (
          <PostAttachments key={post.id} attachment={attachment} onVote={handleVote} />
        )}

        {/* ── 통계 + 액션 ─────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
          <div className="flex items-center gap-3 text-ink-muted">
            <button
              type="button"
              aria-pressed={!!post.liked}
              onClick={() => { if (!user) { toast.show('로그인 후 이용할 수 있습니다', 'error'); promptLogin(); return; } onLike(post.id); }}
              className={`inline-flex items-center gap-1 transition-colors ${post.liked ? 'text-danger' : 'hover:text-danger'}`}
            >
              <svg width="14" height="14" viewBox="0 0 13 13" fill={post.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M6.5 11.5L1.5 6.5C0.5 5.5 0.5 3.5 1.5 2.5C2.5 1.5 4.5 1.5 5.5 2.5L6.5 3.5L7.5 2.5C8.5 1.5 10.5 1.5 11.5 2.5C12.5 3.5 12.5 5.5 11.5 6.5L6.5 11.5Z" strokeLinejoin="round" />
              </svg>
              좋아요 {post.likeCount}
            </button>
          </div>
        </div>

        {/* ── 추천 / 비추천 (등급 점수에는 반영되지 않음) ─────────── */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => react('goodrun')}
            className={[
              'relative flex items-center justify-center gap-1.5 rounded-card border py-3 text-sm font-bold transition-colors active:scale-[0.98]',
              myReaction === 'goodrun'
                ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300'
                : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary',
            ].join(' ')}
          >
            추천 <span className="tabular-nums">{gr}</span>
          </button>
          <button
            type="button"
            onClick={() => react('badbeat')}
            className={[
              'relative flex items-center justify-center gap-1.5 rounded-card border py-3 text-sm font-bold transition-colors active:scale-[0.98]',
              myReaction === 'badbeat'
                ? 'border-ink-muted bg-surface-float text-ink-primary'
                : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary',
            ].join(' ')}
          >
            비추천 <span className="tabular-nums">{bb}</span>
          </button>
        </div>

        {/* ── 댓글 — CommentThread 재사용: 답글(대댓글)·칭호칩·삭제까지 게시판에도 동일하게.
            예전 자체 flat 목록은 답글 버튼이 없어 '너라면 어떻게?' 대화가 이어지질 못했다. */}
        <section className="reveal space-y-2">
          {/* 댓글 수는 화면에 실제로 불러온 목록(replies)만 신뢰한다.
              post.commentCount 는 DB 트리거가 같은 값을 넣어주는 컬럼이라 더하면 2배가 된다.
              (트리거 도입 전에는 항상 0이라 0+n 으로 우연히 맞아 보였을 뿐이다.
               App.tsx 가 posts 갱신마다 openPost 를 덮어쓰므로 리얼타임 갱신 때 반드시 드러난다.) */}
          <h3 className="text-sm font-semibold text-ink-primary">댓글 {replies.length}</h3>
          <CommentThread
            comments={replies}
            onSubmit={handleSubmitComment}
            onDelete={handleDeleteComment}
            moderator={user?.role === 'admin'}
            emptyText="첫 댓글을 남겨보세요"
          />
        </section>
      </article>
    </Modal>
    {/* Modal 밖에 두는 이유: 데스크톱 2-pane 은 Modal 이 inline 패널(overflow-hidden 카드)로 렌더돼
        안에 넣으면 확대 뷰가 그 패널 안에 갇힌다. ReportModal 과 같은 층에 세운다. */}
    {zoomSrc && (
      <ImageLightbox src={zoomSrc} alt={`${post.title || '게시글'} 첨부 사진`} onClose={() => setZoomIdx(null)} />
    )}
    <ReportModal open={reportOpen} onClose={() => setReportOpen(false)}
      target={{ type: 'post', id: post.id, ownerId: post.userId, summary: post.title || post.content }} />
    </>
  );
}
