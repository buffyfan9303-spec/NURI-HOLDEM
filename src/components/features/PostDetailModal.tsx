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
// 카테고리 라벨·pill 색은 src/lib/postCategory.ts 가 단일 출처 — 색표를 이 파일로 복사하지 않는다
// (복사하면 목록 뱃지와 상세 뱃지가 언젠가 다른 색이 된다).
import { categoryPillClass, postCategoryLabel } from '../../lib/postCategory';
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

/**
 * 반응 알약의 단일 스타일 — 좋아요·추천·비추천이 **같은 모양**이어야 한 덩어리로 읽힌다.
 * (예전엔 좋아요만 아이콘+텍스트 링크, 추천·비추천은 전폭 grid 박스로 모양도 줄도 따로였다.)
 *
 * 면(surface) 계약 — 테마마다 '셸에서 멀어지는 방향'이 반대라 한 값으로 못 민다.
 * 셸은 모달(surface-mid). 라이트는 surface-low == surface-mid == #FFFFFF 라 아래로 못 가고
 * (PostAttachments §면 계약과 같은 함정) surface-high(#F0F1F4)로 **내려앉혀야** 면이 생긴다.
 * 다크는 surface-high(#2D2747)가 셸(#241F3A)보다 밝아 면은 생기지만, 그러면 테두리
 * (border-strong #6C6392)가 자기 면 대비 2.7 로 주저앉는다 — 다크만 surface-low(#1D192E)로
 * 내리면 테두리가 자기 면 대비 3.12 로 올라간다(실측). 두 테마 모두 '셸보다 어두운 눌린 면'이라
 * 인상은 같고 숫자만 각자 최적이 된다.
 * 테두리가 border-strong 인 이유: 알약은 '버튼'이라 WCAG 1.4.11(비텍스트 3:1) 대상이다.
 *
 * hit: 알약 실높이는 33px 라 44px 터치 타깃을 ::after 로 확장한다(레이아웃 영향 0).
 */
function reactionPill(active: boolean): string {
  return [
    'hit inline-flex shrink-0 items-center gap-1 rounded-badge border px-2 py-2',
    'text-xs font-semibold leading-none transition-colors active:scale-[0.98]',
    active
      ? 'border-accent-300 bg-accent-300/15 text-accent-200'
      : 'border-border-strong bg-surface-high dark:bg-surface-low text-ink-secondary hover:border-accent-300/60 hover:text-ink-primary',
  ].join(' ');
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
      {/* 리듬은 space-y-4 균등 간격이 아니라 **블록별 mt** 로 준다.
          균등 간격은 'ddd' 같은 짧은 글에서 제목·작성자·본문·반응이 전부 같은 거리로 떨어져
          섬 여섯 개처럼 흩어져 보였다(본문 45px < 반응 92px — 내용보다 버튼이 큰 화면).
          제목↔작성자는 한 덩어리라 좁게(12px), 내용 경계는 넓게(16px)로 위계를 준다. */}
      <article className="p-4 sm:p-5">
        {/* ── 카테고리 · 조회수 · 제목 ─────────────────────────
            감사 P0: post.title 은 이 화면에서 두 번 쓰이는데 둘 다 화면 밖 용도였고
            (라이트박스 alt · 신고 summary), category/viewCount 는 0회였다 —
            목록에서 제목을 보고 들어온 사람이 상세에서 제목을 잃고, 어느 게시판 글인지도 사라졌다.
            표기·값은 목록(CommunityTab 반응 푸터)과 동일하게 맞춘다.
            제목은 선택 항목이라 없는 글에서는 h3 자체를 렌더하지 않는다(빈 줄·빈 간격 금지).
            메타행은 카테고리가 항상 존재하므로(기본 '자유') 제목 유무와 무관하게 남는다.
            2026-08-30 순서 반전: 카테고리·조회수를 제목 **위** 오버라인으로 올린다.
            예전엔 18px 제목 바로 밑에 11px 색 알약이 붙어 둘이 같은 층으로 읽혔다 —
            게시판(어디) → 제목(무엇) 순서가 목록에서 들어온 사람의 실제 독해 순서다. */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={['inline-flex shrink-0 items-center rounded-badge px-1.5 py-0.5 text-2xs font-semibold leading-none', categoryPillClass(post.category)].join(' ')}>
              {postCategoryLabel(post.category)}
            </span>
            {(post.viewCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-2xs text-ink-muted" aria-label={`조회 ${post.viewCount}`}>
                <Icon name="eye" size={13} strokeWidth={1.6} className="shrink-0" />
                <span className="tabular-nums">{post.viewCount}</span>
              </span>
            )}
          </div>
          {/* 제목 18px → 20px(sm 이상 24px). 본문이 16px 이라 예전 배율은 1.125 배 —
              굵기만 다르고 크기는 거의 같아 '제목처럼' 읽히지 않았다. 1.25(모바일)/1.5(데스크탑)로 벌린다. */}
          {post.title && (
            <h3 className="text-xl sm:text-2xl font-bold text-ink-primary leading-tight tracking-tight break-words">{post.title}</h3>
          )}
        </div>

        {/* ── 작성자 정보 ─────────────────────────────────── */}
        {/* border-subtle(다크 1.11:1 · 라이트 1.23:1)은 비텍스트 3:1 기준에서 사실상 안 보이는 선이었다
            → 구조를 나누는 두 가로줄만 border-default(1.76 / 1.79)로 승급.
            2026-08-30: 공유는 아래 반응 줄로 내렸다(같은 '이 글에 대한 동작' 가족이고,
            헤더 우측 4버튼이 폭을 먹어 이름+칩이 3줄로 접히던 원인이었다).
            여기 남는 신고·차단·삭제는 '가끔 쓰는 관리 동작'이라 한 덩어리로 묶어 우측에 둔다. */}
        <header className="mt-3 flex items-center gap-2.5 border-b border-border-default pb-3">
          {/* !object-contain — 레거시 아바타(크롭 도입 전 업로드분)는 정사각이 아니다.
              실측: 이 글 작성자 아바타는 256×151 로고인데 object-cover 가 가운데 59% 만 남기고
              잘라내 원 안에 글자 토막만 보였다('로고가 잘려 보인다'의 원인).
              업로드 경로는 이제 정사각 크롭을 강제하므로(ProfileModal handleCropApply)
              정사각 사진에서는 cover 와 결과가 동일하고, 비정사각 레거시만 온전히 살아난다.
              Avatar.tsx 가 object-cover 를 하드코딩하고 있어(소유 밖) ! 로 덮는다 — 근본 수정은 그 파일에서. */}
          <Avatar name={post.userName} src={post.userAvatar} color={post.userColor} size={40}
            className="!object-contain border border-border-default" />
          <div className="flex-1 min-w-0">
            {/* flex-wrap(2026-08-28 스윕): 390px에서 우측 버튼들이 폭을 다 먹어 작성자 이름이
                '♣..'로 통째로 사라졌다 — 칩이 다음 줄로 내려가고 이름이 먼저 살아남게 줄바꿈을
                허용한다(이름 자체는 max-w-full truncate 유지). 역할배지를 메타 줄로 내린 지금은
                실제로 접히는 일이 거의 없지만, 긴 닉네임 방어로 남긴다. */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="max-w-full truncate text-sm font-semibold text-ink-primary">{authorMark}{post.userName}</span>
              <TitleChip points={titlePts(post.userId)} />
            </div>
            {/* 역할 배지는 이름 줄이 아니라 **메타 줄**(작성 시각과 같은 층)로 내린다.
                두 가지를 동시에 고친다.
                1) 색: 예전 '운영자'는 danger 틴트(빨강)라 경고처럼 읽혔고, 옆 칭호칩(골드)과
                   같은 크기·같은 알약이라 서로 우선순위를 다퉜다 — 한 화면 네 색 중 둘이 여기였다.
                   역할은 상태가 아니라 작성자 메타데이터다. 글자('업주'/'운영자')와 테두리로 충분하다.
                2) 접힘: 이름+칭호칩+역할배지가 한 줄에 다 들어가지 못해 375~390px에서 줄이 접혀
                   헤더가 3줄로 부풀었다(실측 75px). 이름 줄엔 이름과 칭호칩만 남긴다.
                남은 색은 카테고리(목록과 공유하는 색표)·칭호칩(등급 색표)뿐 — 둘 다 공유 단일 출처라
                이 화면에서 임의로 못 바꾼다. 이 화면이 자체적으로 칠하던 색은 전부 중립화했다. */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {(post.userRole === 'venue_owner' || post.userRole === 'admin') && (
                <span className="shrink-0 rounded-badge border border-border-strong px-1.5 py-0.5 text-2xs font-semibold leading-none text-ink-secondary">
                  {post.userRole === 'venue_owner' ? '업주' : '운영자'}
                </span>
              )}
              <span className="text-2xs text-ink-muted tabular-nums">
                {formatFullDate(post.createdAt)}
              </span>
            </div>
          </div>
          {/* 관리 동작 묶음 — 셋 다 같은 급(작게·중립·hover 에서만 의도 색). */}
          <div className="flex shrink-0 items-center gap-0.5">
            {user && user.id !== post.userId && (
              <button type="button" onClick={() => setReportOpen(true)}
                className="hit shrink-0 rounded-input px-1.5 py-1 text-2xs text-ink-muted transition-colors hover:text-danger-light">
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
                className="hit shrink-0 rounded-input px-1.5 py-1 text-2xs text-ink-muted transition-colors hover:text-danger-light">
                차단
              </button>
            )}
            {/* 삭제도 평상시엔 중립 — 파괴적 확인은 confirm() 이 이미 잡고 있고,
                빨간 알약을 상시 띄우면 '읽어야 할 것'(제목·본문)보다 눈에 먼저 들어온다.
                의도가 생긴 순간(hover)에만 danger 로 물든다. 굵기로 셋 중 위계는 유지. */}
            {onDelete && (user?.role === 'admin' || user?.id === post.userId) && (
              <button
                type="button"
                onClick={() => { if (confirm('이 게시글을 삭제하시겠습니까?')) onDelete(post.id); }}
                className="hit shrink-0 rounded-input px-1.5 py-1 text-2xs font-semibold text-ink-secondary transition-colors hover:text-danger-light"
              >
                삭제
              </button>
            )}
          </div>
        </header>

        {/* 신고 누적 자동 숨김 안내(운영자·작성자만 이 글에 접근) */}
        {post.blinded && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card border border-danger/40 bg-danger/[0.06] px-3 py-2">
            <span className="inline-flex items-center gap-1 text-2xs font-bold text-danger"><Icon name="ban" size={12} className="shrink-0" />신고 누적으로 숨김 처리된 게시글입니다</span>
            {user?.role === 'admin' && (
              <button type="button"
                onClick={async () => {
                  try { await adminSetPostBlinded(post.id, false); toast.show('숨김을 해제했습니다', 'success'); onClose(); }
                  catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
                }}
                className="ml-auto rounded-input border border-border-default px-2.5 py-1 text-2xs font-bold text-ink-secondary hover:text-accent-200">숨김 해제</button>
            )}
          </div>
        )}

        {/* ── 본문 ───────────────────────────────────────── */}
        {(() => {
          const { text, hand, replay } = parseAttachments(post.content);
          return (
            <div className="mt-4 space-y-3">
              {text && (
                <div onDoubleClick={doubleLike}
                  className="relative text-base text-ink-primary leading-relaxed whitespace-pre-wrap break-words">
                  {/* rose-500 은 팔레트 밖 기본 Tailwind 색이었다 — 토큰(danger)으로 교체.
                      상시 색이 아니라 250ms 만에 사라지는 피드백이라 색 예산에 잡히지 않는다. */}
                  {heartKey > 0 && (
                    <span key={heartKey} aria-hidden
                      className="anim-heart pointer-events-none absolute inset-0 flex items-center justify-center"
                      onAnimationEnd={() => setTimeout(() => setHeartKey(0), 250)}>
                      <Icon name="heart-fill" size={60} className="text-danger" />
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
                        className={`block w-full overflow-hidden rounded-card border border-border-strong bg-surface-high active:opacity-80 ${images.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}>
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
                    className="inline-flex items-center gap-1.5 rounded-input border border-accent-400/40 bg-accent-300/10 px-3 py-2 text-xs font-bold text-accent-200 active:opacity-80">
                    <Icon name="target" size={14} className="shrink-0" />이 핸드 GTO 분석
                  </button>
                );
              })()}
              {gtoHero && <HandGtoModal hero={gtoHero} onClose={() => setGtoHero(null)} />}
            </div>
          );
        })()}

        {/* ── 어태치먼트(핸드 결과·투표) — 본문 아래. 로딩 중엔 미표시(스켈레톤 금지). */}
        {attachment && (
          <div className="mt-3">
            <PostAttachments key={post.id} attachment={attachment} onVote={handleVote} />
          </div>
        )}

        {/* ── 반응 한 줄 — 좋아요 · 추천 · 비추천 · 공유 ───────────────────────
            예전 구조: 좋아요는 border-t 를 두른 자기 줄(27px), 추천·비추천은 그 아래
            grid-cols-2 로 전폭 49px 박스 두 개 = 반응에만 92px. 본문('ddd')이 45px 인데
            **버튼이 내용의 2배** 였고, 값이 0인데 자리는 최대였다. 같은 성격의 동작이
            서로 다른 모양·다른 줄로 흩어져 있어 '반응'이라는 한 덩어리로 안 읽혔다.
            지금: 같은 알약 4개가 한 줄. 세로 92px → 34px(-58px). 기능·카피는 그대로.

            색: 활성 상태는 셋 다 accent 하나로 통일한다(예전엔 추천=emerald, 비추천=회색,
            좋아요=danger 로 상태 색이 세 갈래였다). 무엇을 눌렀는지는 채움+테두리로 이미 명확하고,
            '내가 누른 표시'에 새 색을 쓸수록 화면의 강조색만 늘어난다.

            숫자: tabular-nums + min-w-[1.5ch] — 0→1 토글이나 8↔9 교체에서 알약 폭이
            흔들리지 않는다(두 자리까지 폭 고정, 세 자리부터만 늘어난다). */}
        <div className="mt-4 flex items-start gap-2">
          {/* 알약 셋만 자기들끼리 접히는 그룹 — 공유는 바깥에 두어 폭이 어떻게 변해도
              항상 첫 줄 오른쪽에 고정된다. 한 통에 넣으면 좋아요가 4자리(1,284)가 되는 순간
              공유가 밀려 내려가 줄 수가 바뀐다(= 숫자 때문에 레이아웃이 흔들린다). */}
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              type="button"
              aria-pressed={!!post.liked}
              onClick={() => { if (!user) { toast.show('로그인 후 이용할 수 있습니다', 'error'); promptLogin(); return; } onLike(post.id); }}
              className={reactionPill(!!post.liked)}
            >
              <Icon name={post.liked ? 'heart-fill' : 'heart'} size={14} strokeWidth={1.8} className="shrink-0" />
              좋아요 <span className="tabular-nums min-w-[1.5ch] text-right">{post.likeCount}</span>
            </button>
            {/* 추천 / 비추천 (등급 점수에는 반영되지 않음) */}
            <button
              type="button"
              aria-pressed={myReaction === 'goodrun'}
              onClick={() => react('goodrun')}
              className={reactionPill(myReaction === 'goodrun')}
            >
              <Icon name="chevron-up" size={14} strokeWidth={2.2} className="shrink-0" />
              추천 <span className="tabular-nums min-w-[1.5ch] text-right">{gr}</span>
            </button>
            <button
              type="button"
              aria-pressed={myReaction === 'badbeat'}
              onClick={() => react('badbeat')}
              className={reactionPill(myReaction === 'badbeat')}
            >
              <Icon name="chevron-down" size={14} strokeWidth={2.2} className="shrink-0" />
              비추천 <span className="tabular-nums min-w-[1.5ch] text-right">{bb}</span>
            </button>
          </div>
          {/* 공유 — 헤더에서 내려온 자리. 같은 '이 글에 대한 동작'이라 반응과 한 줄이 맞고,
              헤더는 그만큼 작성자 정보만 남아 375px에서 3줄 → 2줄로 접힘이 사라졌다.
              단 **알약이 아니다**: 셋과 달리 숫자가 없는 동작이라 같은 테두리를 주면
              '네 번째 카운터'로 오독되고, 375px에서 네 알약 합이 347px > 343px 라 줄도 접혔다.
              테두리 없는 보조 동작으로 두면 세 카운터가 한 가족으로 읽히고 폭도 남는다(실측 마진 +23px). */}
          <button type="button" onClick={copyLink} aria-label="링크 복사"
            className="hit -mr-1 ml-auto inline-flex shrink-0 items-center gap-1 rounded-input border border-transparent px-1 py-2 text-xs font-semibold leading-none text-ink-muted transition-colors hover:text-accent-200">
            <Icon name="share" size={14} strokeWidth={1.8} className="shrink-0" />
            공유
          </button>
        </div>

        {/* ── 댓글 — CommentThread 재사용: 답글(대댓글)·칭호칩·삭제까지 게시판에도 동일하게.
            예전 자체 flat 목록은 답글 버튼이 없어 '너라면 어떻게?' 대화가 이어지질 못했다. */}
        {/* 댓글은 '이 글' 이 아니라 그 다음 층이라 유일하게 가로줄로 끊는다.
            예전엔 본문 위(header)·반응 위 두 군데에 줄이 있어, 짧은 글에서는 거의 빈 띠를
            선 두 개가 감싼 꼴이었다. 경계는 진짜 층이 바뀌는 여기 하나면 충분하다. */}
        <section className="reveal mt-4 space-y-2 border-t border-border-default pt-4">
          {/* 댓글 수는 화면에 실제로 불러온 목록(replies)만 신뢰한다.
              post.commentCount 는 DB 트리거가 같은 값을 넣어주는 컬럼이라 더하면 2배가 된다.
              (트리거 도입 전에는 항상 0이라 0+n 으로 우연히 맞아 보였을 뿐이다.
               App.tsx 가 posts 갱신마다 openPost 를 덮어쓰므로 리얼타임 갱신 때 반드시 드러난다.) */}
          <h3 className="text-sm font-bold text-ink-primary">댓글 <span className="tabular-nums text-ink-secondary">{replies.length}</span></h3>
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
