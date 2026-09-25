import { useRef, useState, useEffect, useMemo } from 'react';
import { getEquippedMarks, getNickColors } from '../../api/community';
import { tierCss } from '../atoms/TierBadge';
import { nickColorVar } from '../../lib/cosmetics';
import Modal from '../atoms/Modal';
import { SkeletonList } from '../atoms/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlockContext';
import { useToast } from '../atoms/Toast';
import type { CommunityPost, ReactionType, Comment } from '../../api/community';
import type { UserRole } from '../../api/auth';
import { reactToPost, removeReaction, getMyReaction, incrementPostView, adminSetPostBlinded, getComments, addComment, deleteComment, bumpPost, getShopSkus, isBumped, isPostHidden, BUMP_SLOTS, subscribePostComments, type PostCommentEvent } from '../../api/community';
import CommentThread from './CommentThread';
import { DETAIL_CARD_AURA, DETAIL_CARD_AURA_CLASS } from '../../lib/detailCardAura';
import ReportModal from './ReportModal';
import { parseAttachments } from '../../lib/hand';
import HandReplayer from './HandReplayer';
import { renderMentions } from '../../lib/mentions';
import { promptLogin } from '../../lib/requireLogin';
import { neighborsOf, appendPage, canExtend, type PostNavCtx } from '../../lib/postNav';
import { searchPosts } from '../../api/community';
import HandCards from '../atoms/HandCards';
import HandGtoModal from './HandGtoModal';
import TitleChip from '../atoms/TitleChip';
import { useTitlePoints } from '../../lib/useTitles';
import Avatar from '../atoms/Avatar';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import ImageLightbox from '../atoms/ImageLightbox';
import { thumbUrl, thumbSrcSet } from '../../lib/imageUrl';
import PostAttachments from './PostAttachments';
import SpotPostCard from './community/SpotPostCard';
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
  /** UI-04: 이 글을 열었던 목록의 스냅샷(없으면 이동 비활성 + 목록으로). */
  nav?: PostNavCtx | null;
  /** 이전/다음으로 이동 — 컨테이너(Modal)는 유지하고 글만 바꾼다. 늘어난 ctx 를 **같이** 올린다(라이브락 방지). */
  onNavigate?: (post: CommunityPost, nav: PostNavCtx) => void;
}

// ── 댓글 저장 계약(N04, 2026-09-12) ─────────────────────────────────────────
// 재현한 버그: handleSubmitComment 가 addComment(...).catch(...) 로 fire-and-forget 호출됐고,
// CommentThread 는 결과를 기다리지 않고 즉시 입력을 비웠다 → 실패해도 원문이 이미 사라져
// 되돌릴 수 없었다. 저장 중 다른 글로 이동하면 늦게 온 성공이 새 글에 붙는 문제도 있었다.
// React 렌더러 없이(vitest environment: node) 테스트하려고 addComment/setReplies/toast 를
// 의존성 주입으로 뽑아낸 순수 함수 — handleSubmitComment 는 이 함수에 얇게 위임한다.
export interface SubmitPostCommentDeps {
  postId: string;
  parentId?: string;
  user: { id: string; name: string; role: UserRole };
  addComment: (payload: Pick<Comment, 'postId' | 'parentId' | 'userId' | 'userName' | 'userRole' | 'isOwner' | 'content'>) => Promise<Comment>;
  /** 응답 도착 시점의 "현재 열려 있는 글" id — 저장 중 다른 글로 이동했는지 대조한다 */
  getCurrentPostId: () => string | null;
  onSaved: (saved: Comment) => void;
  onError: (message: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components -- 테스트가 순수 함수를 직접 검증(CommentThread.groupThreads 와 같은 관행)
export async function submitPostComment(content: string, deps: SubmitPostCommentDeps): Promise<void> {
  const { postId, parentId, user, addComment, getCurrentPostId, onSaved, onError } = deps;
  try {
    const saved = await addComment({
      postId, parentId,
      userId: user.id, userName: user.name, userRole: user.role,
      isOwner: user.role === 'venue_owner', content,
    });
    // 저장 중 다른 글로 옮겨갔으면 늦게 온 성공을 그 글에 붙이지 않는다(N04)
    if (getCurrentPostId() !== postId) return;
    onSaved(saved);
  } catch (err) {
    onError(err instanceof Error ? err.message : '댓글 등록에 실패했습니다');
    throw err; // 호출부(CommentThread)가 원문을 지우지 않도록 다시 던진다
  }
}

// ── 실시간 댓글 반영 계약(N05, 2026-09-12) ──────────────────────────────────
// 재현한 버그: 이 모달의 replies 는 열릴 때(그리고 재시도 클릭 때)만 getComments 로 조회됐다.
// 다른 사람이 같은 글에 새 댓글을 달아도(또는 관리자가 수정·삭제해도) 이 화면이 이미 열려 있으면
// 닫았다 다시 열기 전까지 반영되지 않았다. 그렇다고 전체 댓글(수백 건)을 다시 조회하면 안 되므로
// (지시문) 이 글 하나만 필터링해 듣는 subscribePostComments(위)의 이벤트를 여기서 병합한다.
// 순수 함수로 뽑은 이유는 submitPostComment 와 같다 — 렌더러 없이(vitest environment: node) 검증.
// eslint-disable-next-line react-refresh/only-export-components -- 테스트가 순수 함수를 직접 검증(submitPostComment 와 같은 관행)
export function applyCommentEvent(prev: Comment[] | null, evt: PostCommentEvent): Comment[] {
  const list = prev ?? [];
  if (evt.type === 'insert') {
    // 내가 방금 쓴 댓글은 onSaved 로 이미 앞에 붙어 있다 — 뒤늦게 온 내 것의 에코를 또 붙이면 중복이다.
    if (list.some((c) => c.id === evt.comment.id)) return list;
    return [evt.comment, ...list];
  }
  if (evt.type === 'update') {
    return list.map((c) => (c.id === evt.comment.id ? evt.comment : c));
  }
  // delete — 대댓글까지 함께 지운다(handleDeleteComment 와 같은 규칙)
  return list.filter((c) => c.id !== evt.id && c.parentId !== evt.id);
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

/**
 * 🔴 C1(2026-09-20 오너 시안) — 모바일 독립 상세의 4등분 반응 트레이 셀.
 *
 * 위 `reactionPill` 과 무엇이 다른가: 알약은 **테두리가 셀마다** 있고 가로로 늘어선다.
 * 트레이는 **바깥 테두리 하나**에 네 칸이 나뉘어 들어가므로 셀에는 테두리를 주지 않는다 —
 * 안 그러면 시안이 없애려던 '중복 내부 pill 테두리'가 그대로 남는다.
 *
 * 활성 표시는 알약과 **같은 규칙**이다(accent 한 색 · 채움 + 글자색). 여기서만 다른 색을
 * 쓰면 같은 동작이 화면에 따라 다른 색으로 보인다.
 *
 * 높이: POST-DETAIL-DENSITY(2026-09-24 오너 "한 화면에 더 많이") — 위 아이콘·아래 라벨 두 줄(68px)을
 * 아이콘+라벨+숫자 **한 줄 `h-[44px]` 실박스**로 낮췄다(오버행 `.hit` 없음 — HANDOVER §3 J). 글자를 줄이지 않고
 * 줄바꿈도 막는다(whitespace-nowrap). 숫자가 늘어도 `tabular-nums` 라 폭이 흔들리지 않는다.
 */
function trayCell(active: boolean): string {
  return [
    // ≥360 한 줄(POST-DETAIL-TRIM 전에는 ≥380): 4등분 grid 는 '좋아요 1234' 처럼 긴 칸이 넘쳤다(design-reviewer 2026-09-24, 390 ±5.1px).
    //   flex-auto 로 칸 폭을 내용에 비례시키고, 좌우 안쪽을 px-0.5 로 줄인다.
    // 🔴 CI 2026-09-24 — 칸을 min-w-fit 로 두면 **글꼴 폭이 곧 트레이 폭**이다. 리눅스/안드로이드 래스터는 윈도우보다
    //   글자가 넓어(380 에서 합계 ~7px) 트레이가 1px 넘쳤다. → 칸은 min-w-0 로 줄어들 수 있게 두고, 줄어드는 몫은
    //   `trayLabel` 의 라벨 낱말(말줄임)이 받는다. 숫자·아이콘은 줄지 않는다. 아이콘↔글자 간격을 gap-0.5 로 좁혀
    //   실제 글꼴에서는 말줄임이 나오지 않을 여유를 만든다(e2e post-detail-read '큰 숫자' · '넓은 글꼴').
    // POST-DETAIL-TRIM(2026-09-24 오너 "반응 줄이 너무 커"): 히트는 44px 실박스 그대로, **보이는 면**만 가운데 캡슐로 줄인다 —
    //   py-1.5 + bg-clip-content 라 활성 채움이 44 → 약 31.5px 높이로만 칠해진다(DOM·잉크 폭 변화 0, 큰 숫자 여유 불변).
    'flex h-[44px] min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-clip-content px-1 py-1.5 min-[360px]:flex-auto min-[360px]:gap-0.5 min-[360px]:px-0.5',
    'text-xs font-semibold leading-none transition-colors active:scale-[0.98]',
    active ? 'bg-accent-300/15 text-accent-200' : 'text-ink-secondary',
  ].join(' ');
}

/** 트레이 칸의 '라벨 숫자'. 칸이 좁아지면 라벨 낱말만 말줄임되고 숫자는 끝까지 남는다(위 trayCell 주석).
 *  낱말 사이 `{' '}` 는 flex 라 그려지지 않지만 textContent·읽기 이름('좋아요 9999')에는 남는다. */
function TrayLabel({ label, count }: { label: string; count?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-[0.25em]">
      <span className="min-w-0 overflow-x-clip text-ellipsis">{label}</span>
      {count !== undefined && <>{' '}<span className="tabular-nums">{count}</span></>}
    </span>
  );
}

export default function PostDetailModal({
  post, open, onClose, onLike, onDelete, venues = [], onVenueClick, inline = false, nav = null, onNavigate,
}: PostDetailModalProps) {
  const [gtoHero, setGtoHero] = useState<string[] | null>(null);
  // 확대해서 볼 첨부 사진의 인덱스(null=닫힘). 뷰어는 포스터에 쓰던 ImageLightbox 를 그대로 재사용한다.
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  // 불러오지 못한 첨부 사진(url 기준). 빈 회색 사각형은 '사진이 원래 이런 글'로 읽혀 글쓴이가
  // 재업로드를 반복하게 만든다 — 실패는 실패라고 쓰고, 다시 시도할 길을 남긴다(§5-3 이미지 오류 상태).
  const [imgErr, setImgErr] = useState<Record<string, boolean>>({});
  // 열린 시각 — 고스트 클릭(피드 카드 탭의 합성 click) 판정 기준. 방금 마운트된 첨부 사진에
  // 유령 클릭이 꽂혀 라이트박스가 멋대로 열리는 것 방지(ScheduleDetailModal 과 동일 패턴).
  const openedAtRef = useRef(0);
  // 저장 중(addComment await) 다른 글로 이동해도 늦게 도착한 성공이 새 글에 안 붙게 —
  // 매 렌더 최신 post.id 로 동기화해 둔다(N04). useEffect 로 하면 응답이 effect 커밋보다
  // 먼저 도착하는 경합을 못 없애므로, 렌더 본문에서 직접 갱신하는 "최신 ref" 패턴을 쓴다.
  const currentPostIdRef = useRef<string | null>(post?.id ?? null);
  currentPostIdRef.current = post?.id ?? null;
  const { user } = useAuth();
  // ── UI-04 이전/다음 글 — 훅은 `if (!post) return null` **위**(컴포넌트 최상단)에 둔다(훅 규칙).
  const neighbors = useMemo(
    () => neighborsOf(nav ?? null, post?.id ?? '', (p) => isPostHidden(p, user)),
    [nav, post?.id, user],
  );
  const [navBusy, setNavBusy] = useState(false);
  const [navErr, setNavErr] = useState<unknown>(null);
  const articleRef = useRef<HTMLElement>(null);
  /** 🔴 C1(2026-09-20) — 모바일 작성자 행의 `…` 메뉴(`<details>`).
   *  `<details>` 는 바깥을 눌러도 스스로 닫히지 않는다 — 닫는 길을 셋 다 만든다:
   *  바깥 pointerdown(여기) · 메뉴 안 항목 클릭 · Escape·blur(JSX 쪽).
   *  ⚠ `open` 일 때만 리스너를 다는 것이 아니라 **모달이 열려 있는 동안**만 단다 —
   *    닫힌 모달의 리스너가 살아 있으면 다른 화면의 클릭마다 이 콜백이 돈다. */
  const actionMenuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: PointerEvent) => {
      const menu = actionMenuRef.current;
      if (menu?.open && !menu.contains(e.target as Node)) menu.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  // 글이 바뀌면 **상세 내부 스크롤만** 새 글 시작점으로(배경 목록 스크롤은 건드리지 않는다 — page 는 fixed 라 문서 스크롤과 무관).
  useEffect(() => {
    if (!open || !post) return;
    const scroller = articleRef.current?.closest<HTMLElement>('.overflow-y-auto');
    if (scroller) scroller.scrollTop = 0;
  }, [open, post?.id]);
  const goNeighbor = async (dir: 'prev' | 'next') => {
    if (!post || !nav || !onNavigate || navBusy) return;
    const side = dir === 'prev' ? neighbors.prev : neighbors.next;
    if (side.post) { onNavigate(side.post, nav); return; }
    if (dir !== 'next' || side.edge !== 'more' || !canExtend(nav)) return;
    // 다음 페이지를 같은 필터·정렬·커서로 받아 스냅샷 뒤에 잇고, **늘어난 ctx 를 위로 전파**한다 — 원본 nav 를 그대로 올리면
    // 같은 페이지를 매번 다시 받아 items 가 영원히 안 늘고 '다음 글' 이 busy 만 반복한다(라이브락).
    const startId = post.id;
    setNavBusy(true); setNavErr(null);
    try {
      const page = await searchPosts({ q: nav.q || undefined, category: nav.category, order: nav.order, cursor: nav.cursor });
      if (currentPostIdRef.current !== startId) return;   // 그 사이 다른 글로 갔으면 이 응답은 버린다
      const grown = appendPage(nav, page);
      const n2 = neighborsOf(grown, startId, (p) => isPostHidden(p, user));
      if (n2.next.post) onNavigate(n2.next.post, grown);
      else onNavigate(post, grown);   // 받았는데도 이웃이 없다(전부 숨김·끝) — 늘어난 ctx 만 올려 상태 문구가 갱신되게
    } catch (e) {
      if (currentPostIdRef.current === startId) setNavErr(e);
    } finally {
      if (currentPostIdRef.current === startId) setNavBusy(false);
    }
  };
  const { block } = useBlocks();
  // 더블탭 좋아요(인스타) — 본문을 빠르게 두 번 탭하면 좋아요 + 하트 팝
  const [heartKey, setHeartKey] = useState(0);
  const [authorMark, setAuthorMark] = useState('');
  // 작성자 닉네임 색(상점 600점 · 20260830n) — 마크와 같은 자리에서 함께 받는다.
  const [authorNickToken, setAuthorNickToken] = useState<string | null>(null);
  const titlePts = useTitlePoints([post?.userId]); // 작성자 칭호(활동점수)
  useEffect(() => {
    setAuthorMark('');
    setAuthorNickToken(null);
    if (post?.userId) {
      getEquippedMarks([post.userId]).then((m) => setAuthorMark(m[post.userId] ?? '')).catch(() => {});
      getNickColors([post.userId]).then((m) => setAuthorNickToken(m[post.userId] ?? null)).catch(() => {});
    }
  }, [post?.userId]);
  const doubleLike = () => {
    if (!user || !post) return;
    onLike(post.id);
    setHeartKey((k) => k + 1);
  };
  // null = 아직 안 불러옴 · [] = 조회했고 댓글 없음.
  // 하나로 겸하면 글을 열 때마다(그리고 PC 2단에서 글을 갈아탈 때마다) '댓글 0 · 첫 댓글을
  // 남겨보세요'가 먼저 뜨고, 목록이 도착하며 아래가 밀린다(2026-09-05 전수 조사).
  const [replies, setReplies] = useState<Comment[] | null>(null);
  // 댓글 조회 실패 — 배지엔 댓글 N 인데 본문은 0개면 '댓글이 삭제됐나'로 읽힌다. 실패는 실패라고 말한다(LoadErrorCard).
  const [cErr, setCErr] = useState<unknown>(null);
  const [cReload, setCReload] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const toast = useToast();
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [bb, setBb] = useState(0);
  const [gr, setGr] = useState(0);
  // ── 끌올(100점) — 2026-08-30 반복 소비형. (응원은 2026-09-15 오너 지시로 전량 삭제했다.)
  //   상태를 bb/gr 과 **같은 방식**으로 둔다: 글이 바뀔 때만 props 로 재시드하고,
  //   그 뒤로는 서버가 돌려준 값만 믿는다. (App 이 posts 갱신마다 openPost 를 갈아끼우므로
  //    props 를 매 렌더 신뢰하면 방금 누른 끌올이 한 프레임 뒤에 되돌아간 것처럼 보인다.)
  const [bumpUntil, setBumpUntil] = useState<string | null>(null);
  const [bumpBusy, setBumpBusy] = useState(false);
  // 가격은 서버 shop_skus 가 유일한 출처다 — 화면에 100 을 박지 않는다.
  // (박아 두면 가격표를 바꾼 날 화면은 옛 값을 말하고 서버는 새 값을 걷는다.)
  const [bumpSku, setBumpSku] = useState<{ price: number; hours: number } | null>(null);

  useEffect(() => {
    if (!open || !post) return;
    setBb(post.badbeatCount ?? 0);
    setGr(post.goodrunCount ?? 0);
    setBumpUntil(post.bumpedUntil ?? null);
    setMyReaction(null);
    setZoomIdx(null); // 2-pane 은 같은 인스턴스로 글만 갈아끼우므로 이전 글의 확대 뷰가 남는다
    setImgErr({});    // 같은 이유로 이전 글의 '사진 못 불러옴' 표시도 함께 지운다
    // UI-04 §7.4: 이전/다음으로 글이 바뀌면 A 글에서 비행 중이던 끌올의 finally 는 stale 이라 setXBusy(false) 를 안 돌린다 —
    //   그래서 **여기서 같이** busy 를 푼다(빼면 유료 버튼이 영구 disabled 로 굳는다).
    setBumpBusy(false); setNavBusy(false); setNavErr(null);
    openedAtRef.current = performance.now();
    let active = true;
    getMyReaction(post.id).then((r) => { if (active) setMyReaction(r); }).catch(() => {});
    if (!isPostHidden(post, user)) incrementPostView(post.id).catch(() => {});  // 숨김 글은 집계하지 않는다
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post?.id]);

  // 댓글 조회 — 반응·조회수와 이펙트를 가른 이유: 재시도(cReload)가 조회수를 다시 올리면 안 된다.
  // 이전에는 로컬 state에만 쌓여 새로고침 시 사라졌다(저장 안 됨).
  useEffect(() => {
    if (!open || !post) return;
    let active = true;
    setReplies(null); setCErr(null);
    getComments({ postId: post.id })
      .then((cs) => {
        if (!active) return;
        setReplies(cs);
      })
      .catch((e) => { if (active) setCErr(e); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post?.id, cReload]);

  // 이 글에 달리는 새 댓글·수정·삭제를 실시간으로 받는다(N05) — 열려 있는 동안만, 글이 바뀌면
  // 구독을 갈아끼운다(post 전환 시 구독 정리). setReplies 는 병합(applyCommentEvent)만 하므로
  // 입력 중이던 초안·스크롤 위치·focus 는 CommentThread 내부 상태라 그대로 남는다.
  useEffect(() => {
    if (!open || !post) return;
    const unsubscribe = subscribePostComments(post.id, (evt) => {
      setReplies((prev) => applyCommentEvent(prev, evt));
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post?.id]);

  // 가격표(서버 단일 출처) — 끌올 버튼 라벨이 여기서 나온다. 열릴 때 1회.
  //   (2026-09-15 오너 지시로 응원 SKU 조회는 함께 걷어냈다.)
  useEffect(() => {
    if (!open) return;
    let active = true;
    getShopSkus().then((list) => {
      if (!active) return;
      const b = list.find((s) => s.kind === 'bump');
      setBumpSku(b ? { price: b.price, hours: b.durationHours } : null);
    }).catch(() => {});
    return () => { active = false; };
  }, [open]);

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
    // FULL-ERROR-SWEEP-B(2026-09-25): 로그인 시트를 여는 길에는 토스트를 띄우지 않는다 — fixed 하단 토스트가
    //   시트의 'Google로 계속하기' CTA 를 덮었다(390·360 실측 히트 높이 18/46). 시트 자체가 안내다.
    if (!user) { promptLogin(); return; }
    // 낙관적으로 먼저 바꾼다 — 실패하면 이 스냅샷으로 되돌린다(서버는 거부했는데 화면만 바뀐 채 남지 않게).
    const before = { my: myReaction, bb, gr };
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
      setMyReaction(before.my); setBb(before.bb); setGr(before.gr);
      toast.show(e instanceof Error ? e.message : '처리에 실패했습니다', 'error');
    }
  };


  // ── 끌올 — 내 글만. 자리 상한·중복은 서버가 최종 판정하고, 화면은 결과만 반영한다.
  const handleBump = async () => {
    if (!user || bumpBusy) return;
    setBumpBusy(true);
    const startId = post.id;
    try {
      const r = await bumpPost(post.id);
      if (currentPostIdRef.current !== startId) return;
      setBumpUntil(r.untilAt);
      toast.show(`끌올했어요. ${bumpSku?.hours ?? 3}시간 동안 목록 맨 위에 올라갑니다`, 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '끌올에 실패했습니다', 'error');
    } finally { if (currentPostIdRef.current === startId) setBumpBusy(false); }
  };

  const bumpActive = isBumped({ bumpedUntil: bumpUntil });
  const bumpRemain = (): string => {
    if (!bumpUntil) return '';
    const m = Math.max(1, Math.ceil((new Date(bumpUntil).getTime() - Date.now()) / 60000));
    return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분 남음` : `${m}분 남음`;
  };

  // 댓글 작성 — CommentThread(답글 parentId 지원) 계약. 저장 성공분만 반영(임시행 롤백 불필요).
  // N04(2026-09-12): 성공을 기다린 뒤에만 CommentThread 가 입력을 비운다 — 그래서 이 함수는
  // Promise 를 반환하고, 실패는 삼키지 않고 다시 던진다(그래야 입력창이 원문을 물고 있는다).
  // 실제 판정 로직은 submitPostComment(순수 함수, 위)에 위임한다.
  const handleSubmitComment = (content: string, parentId?: string): Promise<void> => {
    if (!user) { promptLogin(); return Promise.reject(new Error('로그인이 필요합니다')); }
    return submitPostComment(content, {
      postId: post.id, parentId, user,
      addComment,
      getCurrentPostId: () => currentPostIdRef.current,
      onSaved: (saved) => setReplies((prev) => [saved, ...(prev ?? [])]),
      onError: (msg) => toast.show(msg, 'error'),
    });
  };
  const handleDeleteComment = (commentId: string) => {
    deleteComment(commentId) // 권한은 RLS(본인·관리자)가 강제
      .then(() => setReplies((prev) => (prev ?? []).filter((c) => c.id !== commentId && c.parentId !== commentId)))
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

  // 숨김 글 열람 차단 — 서버 RLS(20260905m)가 타인에게는 행을 안 주지만, 목록 캐시로 들고 있던 글이
  // 숨김된 뒤 열리는 경우를 위해 클라도 한 곳에서 막는다(딥링크·알림·피드 세 진입점 공통).
  const hidden = isPostHidden(post, user);

  return (
    <>
    {/* 상단 조작행(§5-1, 2026-09-12): 예전엔 그립(16px) + '게시글' 제목행(68px) + 본문 여백이
        겹쳐 **390px에서 90.3px**을 먹었다 — 읽으러 들어온 화면의 첫 화면이 창 장식이었다.
        density="compact" 로 그립을 제목행 안에 넣어 한 행(52px)으로 합치고, 창 제목은
        '어느 게시판인가'만 말하는 작은 라벨로 낮춘다(읽어야 할 제목은 글 제목이다).
        폭: max-w-lg(544px)는 PC에서 읽기폭 501px — 2-pane 우측 660px 안에서도 양쪽이 비었다.
        2xl(714px)로 올려 독립 모달 714 / 2-pane 은 패널 폭을 그대로 쓴다(§5-2). */}
    {/* UI-02(2026-09-13, 실행문 §7.1·N02 §6.1): 모바일은 짧은 글도 **전체화면**(page) — 위쪽 큰 검은 scrim·작은 하단 시트 없음.
        PC 독립 열기도 같은 전체화면 셸 안 중앙 읽기 열(read = 46rem → 본문 ≈ 72ch). inline(2-pane)은 Modal 의 inline 분기가
        page 분기보다 먼저 return 하므로 **바이트 동일** — `inline ? 'sheet' : 'page'` 같은 분기를 만들지 않는다.
        🔴 2026-09-19 오너: "위에서 아래로 스와이프 해서 내리면 **창이 내려가는 모션 살려줘**".
          종전 `dragToClose={false}` 를 뺐다(page 변형의 기본값은 켜짐). 그립(상단 손잡이)도 다시 그려진다.
        ⚠ 껐던 이유는 "본문 선택·세로 읽기·댓글 편집 중 끌어내려 닫히는 것" 이었다. 그 위험은 남아 있지만,
          드래그는 **스크롤러가 맨 위일 때만** 시작된다(Modal 의 bodyDrag 주석). 글을 읽어 내려간 상태나
          댓글 입력 중에는 시작되지 않는다. 오너가 모션을 명시적으로 요구했으므로 되살린다.
        backdrop 클릭 닫기는 page 에 정의상 없다(리드 결정) — 닫는 길은 헤더 X(44px)·ESC·뒤로가기 셋이고 e2e/post-nav.spec.ts 가 셋 다 잠근다.
        진입 모션: sheet-up 0.26s → fade-in 0.16s(index.css 가 tailwind 값을 덮는다). */}
    <Modal open={open} onClose={onClose} title="커뮤니티 게시판" maxWidth={inline ? '2xl' : 'read'} variant="page" inline={inline} density="compact">
      {/* 리듬은 space-y-4 균등 간격이 아니라 **블록별 mt** 로 준다.
          균등 간격은 'ddd' 같은 짧은 글에서 제목·작성자·본문·반응이 전부 같은 거리로 떨어져
          섬 여섯 개처럼 흩어져 보였다(본문 45px < 반응 92px — 내용보다 버튼이 큰 화면).
          제목↔작성자는 한 덩어리라 좁게(12px), 내용 경계는 넓게(16px)로 위계를 준다. */}
      <article ref={articleRef} data-pd-root className="p-4 sm:p-5 lg:p-6 max-lg:p-3">
        {/* 🔴 C1(2026-09-20 오너 시안) — **모바일에서만** 게시글 내용(카테고리~끌올)을 둥근 카드
            한 벌로 감싼다. 댓글은 이 카드 **밖**의 형제 카드다(아래).
            왜 여기서 감싸나: `article` 자체를 카드로 만들면 댓글·이전/다음 내비게이션까지 같은 면에
            들어가 "한 카드 속 작은 우물"이 된다 — 오너 시안은 **두 개의 형제 카드**다.
            ⚠ PC 는 `lg:contents` 로 **박스를 없앤다** — article 의 padding·자식 배치·ref·스크롤이
              종전 그대로 유지되고 2-pane 인상이 안 바뀐다(inline=true 경로도 같다).
            ⚠ 고정 높이를 주지 않는다. 본문·사진·첨부가 늘면 카드가 따라 늘어야 한다. */}
        <div data-pd-post-card {...DETAIL_CARD_AURA} className={[
          'lg:contents',
          // POST-DETAIL-TRIM — 카드 뒤 LED(기존 [data-aura] hero, 세기만 한 단계 ↑). lib/detailCardAura 참고.
          DETAIL_CARD_AURA_CLASS,
          // POST-DETAIL-DENSITY(2026-09-24): 모바일 카드 안쪽 25.5px → 17px, article 여백 18px → 12.75px(첫 화면 확보).
          'max-lg:rounded-[24px] max-lg:border max-lg:border-border-strong max-lg:bg-surface-high max-lg:p-4',
          // 상단의 미세한 보라→청록 빛 — 시안의 카드 윗변 광. 기존 ring-aura 와 같은 계열의
          // 헤어라인이라 새 색을 들이지 않는다(라이트 모드에서는 거의 안 보이게 alpha 가 낮다).
          'max-lg:ring-aura',
        ].join(' ')}>
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
        {!hidden && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* 고정·끌올 — 목록(CommunityTab PostRow)과 같은 배지. 목록에서 '왜 위에 있는지' 보고 들어온 사람이
                상세에서 그 상태를 잃지 않게 한다(끌올은 작성자 전용 행에만 있어 남에게는 사라졌다). */}
            {post.pinnedAt && (
              <span className="shrink-0 rounded-badge bg-gold-400/15 px-1 text-2xs font-extrabold leading-none text-gold-400">고정</span>
            )}
            {isBumped(post) && (
              <span className="shrink-0 rounded-badge bg-accent-300/15 px-1 text-2xs font-extrabold leading-none text-accent-200">끌올</span>
            )}
            {/* 분류는 §5-2 의 '시간·조회·분류' 역할(12–13px) — 11.69px 은 같은 역할 중 혼자 작았다. */}
            <span data-pd-cat className={['inline-flex shrink-0 items-center rounded-badge px-1.5 py-0.5 text-xs font-semibold leading-none', categoryPillClass(post.category)].join(' ')}>
              {postCategoryLabel(post.category)}
            </span>
            {/* 조회수는 여기 있던 것을 **작성자·시각 줄**로 내렸다(§5-1: 분류 → 제목 → 작성자·시각·조회).
                오버라인에 '어디(게시판)'와 '얼마나 읽혔나'가 섞여 있으면 제목 위 한 줄이 두 가지를 말한다. */}
          </div>
          {/* 제목 18px → 20px(sm 이상 24px). 본문이 16px 이라 예전 배율은 1.125 배 —
              굵기만 다르고 크기는 거의 같아 '제목처럼' 읽히지 않았다. 1.25(모바일)/1.5(데스크탑)로 벌린다. */}
          {/* 행간 leading-tight(1.25)는 두 줄 한국어 제목에서 줄이 붙어 읽혔다 → snug(1.375, §5-2 의 1.35–1.45).
              줄바꿈: 전역이 word-break:keep-all 이라 한국어는 단어 단위로 끊기고,
              break-words(overflow-wrap:break-word)가 긴 URL·띄어쓰기 없는 입력만 넘침 직전에 쪼갠다.
              최대 줄수로 자르지 않는다 — line-clamp 를 붙이지 말 것(§5-1). */}
          {post.title && (
            /* 🔴 C1(2026-09-20 오너 시안) — 모바일 제목을 `text-xl`(21.25px) → `text-2xl`(25.5px)로 올렸다.
               왜: 시안의 제목/본문 크기 비는 약 1.7 인데 종전은 **1.25** 였다 — 굵기만 다르고 크기는
               거의 같아 "제목처럼" 읽히지 않는다(이 파일 위 2026-08 주석이 같은 이유로 18→20 을 했고,
               같은 방향으로 한 단 더 간 것이다). 루트가 17px 이라 `text-2xl` 이 곧 25.5px 다.
               행간은 `leading-snug`(1.375) 그대로 — §5-2 의 1.32~1.48 안이다.
               ⚠ PC 는 종전과 같다(원래도 `sm:text-2xl`). 즉 이 변경은 모바일 한 단계뿐이다. */
            /* POST-DETAIL-DENSITY(2026-09-24 오너 "글씨 크기 줄여 한 화면에 더"): 모바일 25.5 → 20px, 본문 15px 과 비 1.33.
               PC 는 lg:text-2xl 그대로. 행간 snug(1.375) 유지. */
            <h3 data-pd-title className="text-[20px] font-bold text-ink-primary leading-snug tracking-tight break-words lg:text-2xl">{post.title}</h3>
          )}
        </div>
        )}

        {/* ── 작성자 정보 ─────────────────────────────────── */}
        {/* border-subtle(다크 1.11:1 · 라이트 1.23:1)은 비텍스트 3:1 기준에서 사실상 안 보이는 선이었다
            → 구조를 나누는 두 가로줄만 border-default(1.76 / 1.79)로 승급.
            2026-08-30: 공유는 아래 반응 줄로 내렸다(같은 '이 글 메뉴' 가족이고,
            헤더 우측 4버튼이 폭을 먹어 이름+칩이 3줄로 접히던 원인이었다).
            여기 남는 신고·차단·삭제는 '가끔 쓰는 관리 동작'이라 한 덩어리로 묶어 우측에 둔다. */}
        {/* UI-Aura(2026-09-14, design 실측): 작성자→본문 경계는 border-strong 실선(mid 위 2.71:1) — 아래 참고.
            제목→본문 84.8px 는 실측 과다 — pb-3→pb-2(본문 mt-4→mt-3 과 합쳐 −13px). line-height 는 안 건드린다. */}
        {!hidden && (
        <header className="mt-2 flex items-center gap-2.5 pb-2">
          {/* 2026-08-30: 여기 있던 `!object-contain` 땜질을 제거했다 — Avatar 의 기본값이 contain 이 됐다.
              (근거 실측은 유지: 이 글 작성자 아바타가 256×151 로고인데 object-cover 가 가로 59% 만 남겨
               원 안에 글자 토막만 보였다. 정사각 사진에서는 cover 와 결과가 동일해 회귀가 없다.)
              꽉 채우는 크롭이 필요해지면 `fit="cover"` 로 명시할 것 — ! 유틸을 다시 붙이지 말 것. */}
          {/* UI-Aura(2026-09-14): data-aura 는 Avatar.tsx(공용 atom, 8개 파일이 쓴다)가 임의 속성을 안 받아
              직접 못 붙인다 — 그 파일을 고치는 대신 원 모양(rounded-full)의 얇은 래퍼로 감싼다. */}
          <span data-aura data-aura-level="micro" className="inline-block shrink-0 rounded-full">
            <Avatar name={post.userName} src={post.userAvatar} color={post.userColor} size={inline ? 40 : 32}
              className="border border-border-default" />
          </span>
          <div className="flex-1 min-w-0">
            {/* flex-wrap(2026-08-28 스윕): 390px에서 우측 버튼들이 폭을 다 먹어 작성자 이름이
                '♣..'로 통째로 사라졌다 — 칩이 다음 줄로 내려가고 이름이 먼저 살아남게 줄바꿈을
                허용한다(이름 자체는 max-w-full truncate 유지). 역할배지를 메타 줄로 내린 지금은
                실제로 접히는 일이 거의 없지만, 긴 닉네임 방어로 남긴다. */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {/* 닉네임 색 — 텍스트용 --tier-*(4.5:1 계약). 색이 없으면 종전 ink-primary 그대로다. */}
              {/* truncate → break-words: 200% 확대 실측에서 이 이름만 `59px` 이 말줄임으로 잘렸다
                  (§10: 말줄임으로 감춘 화면은 합격이 아니다). 줄바꿈을 허용하면 잘리는 대신 다음 줄로 흐른다.
                  ⚠ 옛 주석의 '이름이 ♣.. 로 사라지던' 문제는 이 줄의 truncate 가 아니라 flex-wrap+min-w-0 이
                  막고 있다 — 그 보호는 그대로다. */}
              <span data-pd-author className="max-w-full break-words text-sm font-semibold text-ink-primary"
                    style={nickColorVar(authorNickToken) ? { color: tierCss(nickColorVar(authorNickToken)!) } : undefined}>{authorMark}{post.userName}</span>
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
              {/* ⚠ 색은 ink-muted 가 아니라 ink-secondary 다 — 다크 surface-mid 위 ink-muted 는 실측 4.46:1 로
                  일반 텍스트 AA(4.5)에 0.04 모자란다(라이트 5.35 는 통과). 같은 역할이 테마마다 통과/미달로
                  갈리지 않게 두 테마 모두 통과하는 토큰으로 올린다. */}
              <span data-pd-meta className="text-xs text-ink-secondary tabular-nums">
                {formatFullDate(post.createdAt)}
              </span>
              {/* 조회 — 오버라인에서 내려온 자리(§5-1). 시각과 같은 역할·같은 크기로 한 줄에 둔다. */}
              <span className="inline-flex items-center gap-1 text-xs text-ink-secondary" aria-label={`조회 ${post.viewCount ?? 0}`}>
                {/* [E] 1.6 은 실효 0.87px — 화면 굵기 하한(1.1px) 미달. PostRowCard 목록과 같은 굵기로.
                    조회수는 여기서만 상시 표시한다(오너 결정 2026-09-23 BOARD-VIEWCOUNT-DETAIL-ONLY) — 0 도 보인다. */}
                <Icon name="eye" size={13} strokeWidth={2.2} className="shrink-0" />
                <span className="tabular-nums">{post.viewCount ?? 0}</span>
              </span>
            </div>
          </div>
          {/* 관리 동작 묶음 — 셋 다 같은 급(작게·중립·hover 에서만 의도 색).
              🔴 C1(2026-09-20 시안) — **권한 조건과 핸들러를 한 곳(`postActions`)에 모았다.**
                모바일 `…` 메뉴와 PC 가로 묶음이 같은 목록을 두 모양으로 그린다. 종전처럼 JSX 를
                두 벌 복사하면 한쪽에만 조건을 고치는 사고가 난다(이 저장소에서 실제로 났다 —
                '한 화면만 고치는 것이 사고' · CLAUDE.md 연동 항목). 여기 목록이 유일한 출처다.
              ⚠ 같은 동작을 한 화면에 두 번 노출하지 않는다: 모바일은 메뉴만(`lg:hidden`),
                PC·2-pane 은 가로 묶음만(`max-lg:hidden`, inline 이면 항상). */}
          {(() => {
            const acts: { key: string; label: string; onClick: () => void; strong?: boolean }[] = [];
            if (user && user.id !== post.userId) {
              acts.push({ key: 'report', label: '신고', onClick: () => setReportOpen(true) });
              acts.push({ key: 'block', label: '차단', onClick: async () => {
                if (!confirm(`'${post.userName}'님을 차단할까요?\n이 사용자의 글·댓글이 보이지 않게 됩니다.`)) return;
                try { await block(post.userId, post.userName); toast.show('차단했습니다. 이 사용자의 글이 숨겨집니다', 'info'); onClose(); }
                catch (e) { toast.show(e instanceof Error ? e.message : '차단 실패', 'error'); }
              } });
            }
            /* 삭제도 평상시엔 중립 — 파괴적 확인은 confirm() 이 이미 잡고 있고,
               빨간 알약을 상시 띄우면 '읽어야 할 것'(제목·본문)보다 눈에 먼저 들어온다.
               의도가 생긴 순간(hover)에만 danger 로 물든다. 굵기로 셋 중 위계는 유지. */
            if (onDelete && (user?.role === 'admin' || user?.id === post.userId)) {
              acts.push({ key: 'delete', label: '삭제', strong: true, onClick: () => { if (confirm('이 게시글을 삭제하시겠습니까?')) onDelete(post.id); } });
            }
            // 쓸 수 있는 동작이 하나도 없으면(비로그인·남의 글) 메뉴 버튼 자체를 안 그린다 —
            // 열어도 빈 판이 나오는 버튼은 소음이다(끌올 주석과 같은 원칙).
            if (acts.length === 0) return null;
            return (<>
              {!inline && (
                <details ref={actionMenuRef} className="relative shrink-0 lg:hidden"
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false; }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Escape' || !actionMenuRef.current?.open) return;
                    // ⚠ Escape 를 여기서 멈추지 않으면 Modal 까지 올라가 **글 자체가 닫힌다**.
                    e.preventDefault(); e.stopPropagation();
                    actionMenuRef.current.open = false;
                    actionMenuRef.current.querySelector('summary')?.focus();
                  }}>
                  <summary aria-label="게시글 메뉴"
                    className="flex h-[44px] w-[44px] cursor-pointer list-none items-center justify-center rounded-input text-lg leading-none text-ink-secondary transition-colors hover:text-ink-primary [&::-webkit-details-marker]:hidden">
                    …
                  </summary>
                  {/* 메뉴를 누르는 동작이 본문 스와이프로 오발동하지 않게 — Modal 의 드래그는
                      스크롤러가 맨 위일 때만 시작되지만, 여기서도 시작점을 끊어 둔다. */}
                  <div data-drag-close="off"
                    className="absolute right-0 top-full z-30 mt-2 min-w-32 rounded-input border border-border-strong bg-surface-high p-1 shadow-xl"
                    onClick={() => { if (actionMenuRef.current) actionMenuRef.current.open = false; }}>
                    {acts.map((a) => (
                      <button key={a.key} type="button" onClick={a.onClick}
                        className={['flex min-h-11 w-full items-center rounded-input px-3 text-left text-xs transition-colors hover:text-danger-light',
                          a.strong ? 'font-semibold text-ink-secondary' : 'text-ink-muted'].join(' ')}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </details>
              )}
              <div className={['flex shrink-0 items-center gap-0.5', inline ? '' : 'max-lg:hidden'].join(' ')}>
                {acts.map((a) => (
                  <button key={a.key} type="button" onClick={a.onClick}
                    className={['hit shrink-0 rounded-input px-1.5 py-1 text-2xs transition-colors hover:text-danger-light',
                      a.strong ? 'font-semibold text-ink-secondary' : 'text-ink-muted'].join(' ')}>
                    {a.label}
                  </button>
                ))}
              </div>
            </>);
          })()}
        </header>
        )}
        {/* UI-Aura(2026-09-14): divider-aura(peak 1.89:1, 양끝 0)는 사실상 안 보였다 — index.css 는 공용(NoticeDetailModal
            도 쓰고, home-team 이 같은 파일 view-transition 블록을 동시 편집 중)이라 전역 alpha 대신 이 화면 세 곳만
            국소적으로 border-strong 실선(mid 위 2.71:1)으로 바꾼다. */}
        {!hidden && <hr className="border-t border-border-strong" aria-hidden="true" />}

        {/* 신고 누적 자동 숨김 안내 — 배너는 blinded 면 항상(운영자에겐 해제 버튼), 아래 본문·사진·댓글은 hidden 이면 미렌더 */}
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
        {!hidden && (() => {
          const { text, hand, replay } = parseAttachments(post.content);
          return (
            <div className="mt-3 space-y-3">
              {text && (
                <div data-pd-body onDoubleClick={doubleLike}
                  /* 읽기 면: 문단·공백·링크·멘션은 renderMentions 가 그대로 보존한다(whitespace-pre-wrap).
                     행간 1.625 → 1.7(§5-2 의 1.65–1.75). 비율값이라 200% 확대에서도 같이 늘어난다.
                     본문 밑에 광원·입자·노이즈를 넣지 않는다 — 배경은 창 지면 그대로다.
                     P2(2026-09-21): 모바일 본문 17→16px(text-base 는 루트 17px 기준이라 rem 대신
                     고정 px). PC 는 lg:text-base 로 기존 17px 그대로 복원한다. */
                  className="relative text-[15px] leading-[1.7] text-ink-primary whitespace-pre-wrap break-words lg:text-base">
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
                      {imgErr[url] ? (
                        // 실패 타일 — 자리(비율)는 그대로 두어 레이아웃이 튀지 않게 하고, 무슨 일인지 글로 말한다.
                        <div className={`flex flex-col items-center justify-center gap-1 rounded-card border border-dashed border-border-default bg-surface-high px-2 text-center text-2xs text-ink-muted dark:bg-surface-low ${images.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}>
                          <Icon name="image" size={18} strokeWidth={1.6} className="shrink-0" />
                          <span>사진을 불러오지 못했어요</span>
                          <button type="button"
                            onClick={() => setImgErr((prev) => { const n = { ...prev }; delete n[url]; return n; })}
                            className="hit rounded-input border border-border-default px-2 py-1 font-semibold text-ink-secondary hover:text-accent-200">
                            다시 시도
                          </button>
                        </div>
                      ) : (
                      <button type="button" onClick={() => { if (performance.now() - openedAtRef.current < 400) return; setZoomIdx(i); }}
                        aria-label={`첨부 사진 ${i + 1} 확대 보기`}
                        className={`block w-full overflow-hidden rounded-card border border-border-strong bg-surface-high active:opacity-80 ${images.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}>
                        {/* 한 장일 때는 **자르지 않는다**(object-contain): 세로 포스터·안내문은 글이 이미지 안에 있어
                            4:3 크롭이 문장을 통째로 잘라낸다(§5-3). 자리는 4:3 으로 예약해 CLS 를 막고,
                            남는 여백은 사진 면(bg)으로 채운다. 여러 장 격자는 cover 로 정렬을 맞추되,
                            두 경우 모두 탭하면 ImageLightbox 에서 원본 전체를 확인할 수 있다. */}
                        <img src={thumbUrl(url, 480)} srcSet={thumbSrcSet(url, 480)}
                          alt={`첨부 사진 ${i + 1}`} loading="lazy" decoding="async"
                          onError={() => setImgErr((prev) => ({ ...prev, [url]: true }))}
                          className={`h-full w-full ${images.length === 1 ? 'object-contain' : 'object-cover'}`} />
                      </button>
                      )}
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

        {/* ── 게시판에 올라온 NURI SPOT — 투표(어태치먼트)보다 **위**.
            상황을 먼저 보여주고 그 다음에 고르게 한다. 스팟 글이 아니면 스스로 null 을 낸다. */}
        {/* expectSpot: 스팟 글일 때만 자리를 예약한다 — 아니면 144.75px 빈 상자가 떴다 사라지며
            아래가 통째로 −145px 튄다(2026-09-19 실측 LayoutShift 0.0806). SpotPostCard 머리말 참고. */}
        {!hidden && <SpotPostCard postId={post.id} isAuthor={user?.id === post.userId} expectSpot={post.category === 'hand'} />}

        {/* ── 어태치먼트(핸드 결과·투표) — 본문 아래. 로딩 중엔 미표시(스켈레톤 금지). */}
        {!hidden && attachment && (
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
        {/* 🔴 C1(2026-09-20) — 아래 알약 줄은 **PC·2-pane 전용**이 됐다. 모바일 독립 상세는 그 다음의
            4등분 트레이를 쓴다(시안). 두 벌이 동시에 보이면 같은 동작이 한 화면에 두 번 생긴다 —
            그래서 `inline` 이면 종전대로 항상 보이고, 독립 상세면 `lg` 이상에서만 보인다. */}
        {!hidden && (
        <div className={inline ? 'mt-4 flex items-start gap-2' : 'mt-4 hidden items-start gap-2 lg:flex'}>
          {/* 알약 셋만 자기들끼리 접히는 그룹 — 공유는 바깥에 두어 폭이 어떻게 변해도
              항상 첫 줄 오른쪽에 고정된다. 한 통에 넣으면 좋아요가 4자리(1,284)가 되는 순간
              공유가 밀려 내려가 줄 수가 바뀐다(= 숫자 때문에 레이아웃이 흔들린다). */}
          {/* UI-Aura(2026-09-14)의 ring-aura 묶음 칸은 POST-DETAIL-TRIM(2026-09-24 오너 "덮고 있는 네모 칸을 지워")에서 걷었다 —
              알약마다 이미 테두리가 있어 바깥 칸이 한 겹 더였다. 활성 알약에만 data-aura(micro) 는 그대로다.
              data-pd-pills: e2e 가 '모바일에서 PC 알약 줄이 안 보인다'를 이 표식으로 찾는다(클래스에 기대지 않는다). */}
          <div data-pd-pills className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              type="button"
              aria-pressed={!!post.liked}
              data-aura={post.liked || undefined}
              data-aura-level={post.liked ? 'micro' : undefined}
              onClick={() => { if (!user) { promptLogin(); return; } onLike(post.id); }}
              className={reactionPill(!!post.liked)}
            >
              {/* [E] 1.8 은 실효 1.05px — 화면 굵기 하한(1.1px) 미달 */}
              <Icon name={post.liked ? 'heart-fill' : 'heart'} size={14} strokeWidth={2.0} className="shrink-0" />
              좋아요 <span className="tabular-nums min-w-[1.5ch] text-right">{post.likeCount}</span>
            </button>
            {/* 추천 / 비추천 (등급 점수에는 반영되지 않음) */}
            <button
              type="button"
              aria-pressed={myReaction === 'goodrun'}
              data-aura={myReaction === 'goodrun' || undefined}
              data-aura-level={myReaction === 'goodrun' ? 'micro' : undefined}
              onClick={() => react('goodrun')}
              className={reactionPill(myReaction === 'goodrun')}
            >
              <Icon name="chevron-up" size={14} strokeWidth={2.2} className="shrink-0" />
              추천 <span className="tabular-nums min-w-[1.5ch] text-right">{gr}</span>
            </button>
            <button
              type="button"
              aria-pressed={myReaction === 'badbeat'}
              data-aura={myReaction === 'badbeat' || undefined}
              data-aura-level={myReaction === 'badbeat' ? 'micro' : undefined}
              onClick={() => react('badbeat')}
              className={reactionPill(myReaction === 'badbeat')}
            >
              <Icon name="chevron-down" size={14} strokeWidth={2.2} className="shrink-0" />
              비추천 <span className="tabular-nums min-w-[1.5ch] text-right">{bb}</span>
            </button>
          </div>
          {/* 공유 — 헤더에서 내려온 자리. 같은 '이 글 메뉴'이라 반응과 한 줄이 맞고,
              헤더는 그만큼 작성자 정보만 남아 375px에서 3줄 → 2줄로 접힘이 사라졌다.
              단 **알약이 아니다**: 셋과 달리 숫자가 없는 동작이라 같은 테두리를 주면
              '네 번째 카운터'로 오독되고, 375px에서 네 알약 합이 347px > 343px 라 줄도 접혔다.
              테두리 없는 보조 동작으로 두면 세 카운터가 한 가족으로 읽히고 폭도 남는다(실측 마진 +23px). */}
          <button type="button" onClick={copyLink} aria-label="링크 복사"
            className="hit -mr-1 ml-auto inline-flex shrink-0 items-center gap-1 rounded-input border border-transparent px-1 py-2 text-xs font-semibold leading-none text-ink-muted transition-colors hover:text-accent-200">
            {/* [E] 1.8 은 실효 1.05px — 화면 굵기 하한(1.1px) 미달 */}
            <Icon name="share" size={14} strokeWidth={2.0} className="shrink-0" />
            공유
          </button>
        </div>
        )}

        {/* 🔴 C1(2026-09-20 시안) — 모바일 독립 상세의 **외곽선 하나짜리 4등분 반응 트레이**.
            위 아이콘 / 아래 라벨+숫자, 마지막 공유 셀만 차분한 보라 면.
            ⚠ 핸들러·카운트·`aria-pressed`·로그인 유도는 **위 알약과 같은 것을 그대로 쓴다** —
              새 상태도, 새 API 도 만들지 않는다(눌렀을 때의 서버 연동·롤백은 onLike/react 안에 있다).
            ⚠ 320 은 2칸씩 두 줄, 360 이상부터 네 칸 — 숫자가 커져도 글자를 줄이지 않는다.
              `min-[360px]` 은 임의 값이 아니라 **실측으로 정한다**(아래 e2e 가 겹침 0 을 잰다). POST-DETAIL-TRIM(2026-09-24)에서 바깥 칸(테두리+여백 10.5px)을
              걷어 380 → 360 으로 내렸다: 360 트레이 여유 실측(윈도우) 보통 숫자 66.3px · 9999/999/999 9.1px · 넓은 글꼴+큰 숫자는 말줄임 안전망.
            ⚠ 셀은 `h-[44px]` 한 줄 실박스다(POST-DETAIL-DENSITY 2026-09-24). `gap-0.5` 를 빼지 마라 — 2줄(320/360)에서
              윗줄 칸 아래 끝의 히트 테스트가 픽셀 스냅으로 아랫줄 칸에 먹혔다(e2e 트레이 히트 실측 실패로 확인). */}
        {!hidden && !inline && (
        <div role="group" aria-label="게시글 반응"
          /* POST-DETAIL-TRIM(2026-09-24 오너 "덮고 있는 네모 칸을 지워버려") — 바깥 테두리·면·안쪽 여백을 걷었다(54.5 → 44px 한 줄). */
          className="mt-2 grid grid-cols-2 gap-0.5 min-[360px]:flex lg:hidden">
          <button type="button" aria-pressed={!!post.liked}
            onClick={() => { if (!user) { promptLogin(); return; } onLike(post.id); }}
            className={trayCell(!!post.liked)}>
            <Icon name={post.liked ? 'heart-fill' : 'heart'} size={14} strokeWidth={2.0} className="shrink-0" />
            <TrayLabel label="좋아요" count={post.likeCount} />
          </button>
          <button type="button" aria-pressed={myReaction === 'goodrun'} onClick={() => react('goodrun')}
            className={trayCell(myReaction === 'goodrun')}>
            <Icon name="chevron-up" size={14} strokeWidth={2.2} className="shrink-0" />
            <TrayLabel label="추천" count={gr} />
          </button>
          <button type="button" aria-pressed={myReaction === 'badbeat'} onClick={() => react('badbeat')}
            className={trayCell(myReaction === 'badbeat')}>
            <Icon name="chevron-down" size={14} strokeWidth={2.2} className="shrink-0" />
            <TrayLabel label="비추천" count={bb} />
          </button>
          {/* 공유는 글자색으로만 구분한다 — 숫자가 없는 동작이라는 표시. 면(bg)은 POST-DETAIL-TRIM 에서 걷었다(네모 칸 제거). */}
          <button type="button" onClick={copyLink} aria-label="링크 복사"
            className={[trayCell(false), 'text-accent-200'].join(' ')}>
            <Icon name="share" size={14} strokeWidth={2.0} className="shrink-0" />
            <TrayLabel label="공유" />
          </button>
        </div>
        )}

        {/* 🔴 C1 — 반응 직후의 이 구분선은 PC 전용이다. 모바일에서는 트레이 자체가 카드 하단을
            마감하므로 선을 하나 더 그으면 경계가 두 번 생긴다. */}
        {!hidden && <hr className="border-t border-border-strong mt-3 max-lg:hidden" aria-hidden="true" />}

        {/* ── 끌올 — 작성자 본인에게만. 남의 글에서는 아예 그리지 않는다(살 수 없는 버튼은 소음이다). */}
        {user?.id === post.userId && (
          <div data-pd-bump className="mt-1.5 flex items-center gap-2">
            <Icon name="zap" size={16} strokeWidth={1.8} className="shrink-0 text-ink-muted" />
            <span className="min-w-0 flex-1 text-xs leading-tight text-ink-secondary">
              <b className="text-ink-primary">끌올</b>
              <span className="ml-1.5">
                {bumpActive
                  ? `목록 맨 위 · ${bumpRemain()}`
                  : `${bumpSku?.hours ?? 3}시간 목록 맨 위 · 동시 ${BUMP_SLOTS}자리`}
              </span>
            </span>
            {bumpActive ? (
              <span className="shrink-0 rounded-badge border border-accent-300 bg-accent-300/15 px-2 py-1 text-2xs font-bold text-accent-200">끌올 중</span>
            ) : (
              <button type="button" disabled={bumpBusy || bumpSku === null}
                onClick={handleBump}
                className="inline-flex h-[44px] shrink-0 items-center whitespace-nowrap rounded-badge border border-accent-400/50 px-3 text-2xs font-bold tabular-nums text-accent-300 transition-colors hover:bg-accent-300/10 disabled:opacity-50">
                {bumpBusy ? '올리는 중…' : bumpSku === null ? '준비 중' : `${bumpSku.price.toLocaleString()}점 끌올`}
              </button>
            )}
          </div>
        )}

        {/* ── 댓글 — CommentThread 재사용: 답글(대댓글)·칭호칩·삭제까지 게시판에도 동일하게.
            예전 자체 flat 목록은 답글 버튼이 없어 '너라면 어떻게?' 대화가 이어지질 못했다. */}
        {/* 댓글은 '이 글' 이 아니라 그 다음 층이라 유일하게 가로줄로 끊는다.
            예전엔 본문 위(header)·반응 위 두 군데에 줄이 있어, 짧은 글에서는 거의 빈 띠를
            선 두 개가 감싼 꼴이었다. 경계는 진짜 층이 바뀌는 여기 하나면 충분하다. */}
        {/* 면 구분 이력: §5-1(2026-08)은 full-bleed 음수 마진 + surface-base 띠 → 오너가 "갑자기 큰 검은
            띠로 끊긴다"고 지적해 UI-03(2026-09-13)이 걷어내고 구분선 하나로만 말하게 했다.
            UI-Aura(2026-09-14, design 실측): compact 셸을 surface-mid 로 고친 뒤 재보니 article·본문·댓글
            섹션이 **전부 투명**이라 인접 면 대비가 1.00(구분 자체가 없음)이었다. 그래서 **full-bleed 가 아닌
            테두리 있는 우물**(rounded-card, article 좌우 여백 안에 갇힘 — 창 폭을 꽉 채우지 않는다)로
            다시 도입한다 — §5-1 이 겪은 "화면을 가로지르는 검은 띠"와는 다른 모양이라 같은 결함이 아니다. */}
        </div>{/* /data-pd-post-card — 여기부터는 카드 밖(댓글·이전/다음)이다 */}

        {/* 🔴 C1 — 이 구분선은 **PC 전용**이 됐다. 모바일에서는 두 카드 사이의 빈 공간이 곧 경계라
            선까지 있으면 경계가 두 번 그려진다. PC(2-pane 포함)는 종전 그대로 선으로 끊는다. */}
        {!hidden && <hr className="border-t border-border-strong mt-4 max-lg:hidden" aria-hidden="true" />}
        {!hidden && (
        <section data-pd-comments aria-label="댓글" {...DETAIL_CARD_AURA} className={[
          // P1(2026-09-21): 모바일 카드→댓글 간격 17px→13px(mt-3), PC 는 기존 mt-4(17px) 유지.
          'reveal mt-3 space-y-2 rounded-card border border-border-strong bg-surface-base p-3 ring-aura lg:mt-4',
          DETAIL_CARD_AURA_CLASS,
          // 🔴 C1 — 모바일은 게시글 카드와 **같은 좌우 경계·같은 반지름**의 독립 카드다.
          //   PC 간격 17px: `mt-4`(=1rem=17px, 루트 17px) 가 그 값이라 그대로 쓴다.
          // ⚠ 면은 테마마다 **반대 방향**으로 가야 한다(이 파일 `reactionPill` 의 면 계약과 같은 함정):
          //   라이트는 `surface-low == surface-mid == #FFFFFF` 라 셸과 **같은 흰색**이 되어 카드가
          //   통째로 사라진다(실측으로 잡았다 — 라이트 스크린샷에서 댓글 카드가 지면에 흡수됐다).
          //   그래서 라이트는 `surface-high`(#F0F1F4)로 **내려앉히고**, 다크만 셸보다 어두운 `surface-low`.
          // POST-DETAIL-TRIM(2026-09-24 오너 "칸을 줄여, 너무 넓어"): 모바일 안쪽 17 → 12.75px.
          'max-lg:rounded-[24px] max-lg:bg-surface-high max-lg:dark:bg-surface-low max-lg:p-3',
        ].join(' ')}>
          {/* 댓글 수는 화면에 실제로 불러온 목록(replies)만 신뢰한다.
              post.commentCount 는 DB 트리거가 같은 값을 넣어주는 컬럼이라 더하면 2배가 된다.
              (트리거 도입 전에는 항상 0이라 0+n 으로 우연히 맞아 보였을 뿐이다.
               App.tsx 가 posts 갱신마다 openPost 를 덮어쓰므로 리얼타임 갱신 때 반드시 드러난다.) */}
          {/* POST-DETAIL-TRIM(2026-09-24 오너 "(이모티콘)댓글 지우고 아래에 남겨두면 · '대화에 참여해 보세요' 제거") —
              보이는 제목 행(말풍선·'댓글'·수 배지·우측 안내)을 걷었다. 이름은 section 의 aria-label('댓글' 영역)로 보조기술에 남기고,
              수는 섹션 **맨 아래** 작은 한 줄로 옮겼다. (sr-only 제목은 e2e clippedNodes 가 '감춰진 채 넘친 요소'로 잡아 영역 이름으로 둔다.) */}
          {/* 실패 카드는 스레드 **위에** 얹는다 — 작성 폼은 남겨 둔다(기능 보존). replies 가 null 로 남아 빈 문구도 안 뜬다. */}
          {cErr != null && <LoadErrorCard error={cErr} what="댓글" onRetry={() => setCReload((k) => k + 1)} compact />}
          {/* 🔴 2026-09-20 — 댓글이 도착하며 목록이 늘어나 **아래 이전/다음 내비게이션이 밀렸다.**
              e2e(post-open-stability ①)가 CI 에서 세 번 이 커밋을 죽였고, 원인을 CPU 8x 로 조여
              재현해 노드 이름까지 찍어서 확정했다 — `div.space-y-4` · `nav[data-pd-nav]` 가 +0.0568.
              (댓글 섹션 **자기 top** 은 안 움직였다. 그래서 `drift` 단언만으로는 못 잡았다.)
            🔴 몇 줄을 예약할지 **추측하지 않는다.** `post.commentCount` 는 DB 트리거가 유지하는
              실제 개수라 목록이 오기 전에 이미 정확한 수를 알고 있다 — 그 수만큼만 예약한다.
              ⚠ 그래서 0개인 글에서는 아무것도 예약하지 않는다(예약했다가 비우면 그게 또 이동이다).
              ⚠ 상한 4줄 — 댓글 50개짜리 글에 50줄을 예약하면 화면이 스켈레톤으로 가득 찬다.
                4줄이면 첫 화면에 보이는 범위를 덮고, 그 아래는 어차피 스크롤 밖이라 이동이 안 보인다.
              ⚠ `h-12`(51px @17px 루트)는 SkeletonList 기본값이다. 실제 댓글 줄과의 오차는 남지만
                예약 0 일 때의 이동(0.0568)보다 훨씬 작다 — 정확도가 아니라 **방향**이 요점이다. */}
          {replies === null && post.commentCount > 0 && (
            <div aria-hidden className="space-y-2">
              <SkeletonList rows={Math.min(4, post.commentCount)} rowClassName="h-12" />
            </div>
          )}
          <CommentThread
            /* UI-04 §7.4: 댓글 초안은 postId 단위로 분리한다 — 컨테이너(Modal)는 유지하고 스레드만 글별로 갈아끼운다
               (초안은 CommentThread 의 컴포넌트 상태뿐이라 다른 글에 붙지 않게 하는 것이 먼저다. 저장소 정책이 없어 예고 없는 폐기는 남는다). */
            key={post.id}
            /* 🔴 C1 — 모바일 **독립 상세**에서만 시안 표시를 켠다. PC 2-pane(inline=true)과
               매장 Q&A·요강 댓글 등 다른 호출부는 이 값을 안 받으므로 종전 그대로다. */
            postDetailMobile={!inline}
            comments={replies ?? []}
            onSubmit={handleSubmitComment}
            onDelete={handleDeleteComment}
            moderator={user?.role === 'admin'}
            /* 미로드 구간에는 빈 상태 문구를 내지 않는다 — '없다'는 아직 사실이 아니다 */
            emptyText={replies === null ? ' ' : '첫 댓글을 남겨보세요'}
          />
          {/* 댓글 수 — 불러온 목록(replies)만 신뢰한다(post.commentCount 를 더하면 2배, 위 주석).
              ⚠ 아직 도착 전(null)·0개에는 그리지 않는다 — 미확정 0 은 "댓글이 없다"는 사실이 아닌 말이다. */}
          {replies !== null && replies.length > 0 && (
            <p data-pd-comment-count className="text-right text-2xs tabular-nums text-ink-muted">댓글 {replies.length}</p>
          )}
        </section>
        )}
        {/* ── 이전 글 / 다음 글(UI-04, 실행문 §7.3·§7.4) — 열었던 목록의 실제 화면 순서(스냅샷) 기준. lib/postNav 가 이웃·끝·상한을 판정한다.
            새 hr 을 두지 않는다(독서 경계 구분선은 3곳 계약 — readingSurface.contract) — 탐색 행은 subtle 경계선 하나.
            UI-Aura(2026-09-14): 활성 카드만 border-transparent + ring-aura(헤어라인). 비활성은 그대로 둔다. */}
        {/* P1(2026-09-21): 모바일 댓글→탐색 공백(25.5px+12.75px)을 mt-4·pt-0·border-t-0 으로 좁힌다.
            PC 는 기존 mt-6·border-t·pt-3 그대로 — 두 카드 사이가 곧 경계인 모바일과 달리
            PC 2-pane 은 선 구분이 필요하다(§6 P1). */}
        <nav aria-label="이전 글 · 다음 글" data-pd-nav className="mt-4 grid grid-cols-2 gap-2 border-t-0 border-border-subtle pt-0 lg:mt-6 lg:border-t lg:pt-3">
          {(['prev', 'next'] as const).map((dir) => {
            const side = dir === 'prev' ? neighbors.prev : neighbors.next;
            const isMore = dir === 'next' && side.edge === 'more';
            const enabled = !!side.post || isMore;
            const label = dir === 'prev' ? '이전 글' : '다음 글';
            const reason = side.edge === 'no-context' ? '목록에서 열면 이동할 수 있어요'
              : side.edge === 'first' ? '첫 글이에요'
              : side.edge === 'end' ? '마지막 글이에요'
              : side.edge === 'loaded-end' ? '불러온 범위의 끝이에요 · 목록으로'
              : side.edge === 'skipped' ? `숨긴 글 ${side.skipped}개가 이어져 건너뛸 수 없어요 · 목록으로`
              : isMore ? (navBusy ? '다음 글을 불러오는 중…' : navErr ? '불러오지 못했어요 · 다시 시도' : '다음 글 불러오기')
              : side.post ? (side.post.title || side.post.content.slice(0, 40)) : '';
            return (
              <button key={dir} type="button" disabled={!enabled || navBusy}
                data-pd-nav-dir={dir} data-pd-nav-edge={side.edge ?? ''}
                aria-disabled={!enabled || navBusy || undefined}
                onClick={() => goNeighbor(dir)}
                className={['flex min-h-11 min-w-0 items-center gap-1.5 rounded-input border px-3 py-2 text-left transition-colors',
                  dir === 'next' ? 'flex-row-reverse text-right' : '',
                  enabled ? 'border-transparent ring-aura hover:bg-surface-high/50' : 'border-border-subtle opacity-60 cursor-not-allowed'].join(' ')}>
                <Icon name={dir === 'prev' ? 'chevron-left' : 'chevron-right'} size={14} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-2xs font-bold text-ink-muted">{label}</span>
                  {/* P2·P3(2026-09-21): 모바일은 12px·단일행 말줄임(data-pd-nav-text, min-w-0 +
                      overflow-hidden/whitespace-nowrap/text-ellipsis). PC(lg)는 기존 12.75px·
                      두 줄 line-clamp·break-words 그대로 복원한다. line-clamp 를 lg: 로만 걸어
                      display:-webkit-box 가 모바일에 남지 않게 한다(Tailwind line-clamp 함정). */}
                  <span data-pd-nav-text className={['block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-snug lg:whitespace-normal lg:break-words lg:text-xs lg:line-clamp-2', enabled && side.post ? 'text-ink-primary' : 'text-ink-muted'].join(' ')}>{reason}</span>
                </span>
              </button>
            );
          })}
          {(neighbors.prev.edge === 'no-context' || neighbors.next.edge === 'loaded-end' || neighbors.next.edge === 'skipped' || neighbors.prev.edge === 'skipped') && (
            <button type="button" onClick={onClose} className="btn-ghost col-span-2 min-h-11 text-xs">목록으로</button>
          )}
        </nav>
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
