import { memo, useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, Fragment, useTransition, startTransition, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { withViewTransition } from '../../lib/viewTransition';
import { promptLogin } from '../../lib/requireLogin';
import { useSkeletonGate } from '../../lib/useSkeletonGate';
import { getActiveCommunityAds, type CommunityAd } from '../../api/ads';
import { getEquippedMarks, getNickColors, isBumped } from '../../api/community';
import { getAppSetting, COMMUNITY_ADS_EVERY_KEY, COMMUNITY_ADS_EVERY_DEFAULT, parseAdsEvery } from '../../api/settings';
import { pinnedFirst } from '../../lib/pinnedFirst';
import TitleChip from '../atoms/TitleChip';
import { tierCss } from '../atoms/TierBadge';
import { nickColorVar } from '../../lib/cosmetics';
import { useTitlePoints } from '../../lib/useTitles';
import { getVenueRatings, type VenueRating } from '../../api/reviews';
import type { Venue, Comment, CommunityPost, LiveMessage, PostCategory, GroupKind, JoinedGroup } from '../../api/community';
import { getLiveMessages, addLiveMessage, deleteLiveMessage, subscribeLiveWall, createMyVenue, createGroup, GROUP_KIND_LABEL, getMyOwnedCommunities, getMyJoinedGroups, removeMember } from '../../api/community';
import { REGION_CHIPS } from './IntegratedSearchBar';
import type { MarketplaceNotice } from '../../api/marketplace';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlockContext';
import { useBackClose } from '../../lib/backstack';
import OwnerCommunity from './OwnerCommunity';
import DealerCommunity from './DealerCommunity';
import TierLeaderboard from './TierLeaderboard';
import CommunityShoutBar from './CommunityShoutBar';
import { useToast } from '../atoms/Toast';
import EmptyState from '../atoms/EmptyState';
import { filterContent } from '../../lib/content-filter';
import { parseAttachments } from '../../lib/hand';
import { MiniCard } from '../atoms/HandCards';
import Avatar from '../atoms/Avatar';
import Icon from '../atoms/Icon';
import VenueThumb from '../atoms/VenueThumb';
import Modal from '../atoms/Modal';
import PostDetailModal from './PostDetailModal';
import SlidingPill from '../atoms/SlidingPill';
import { useIsDesktop } from '../../lib/responsive';
import { thumbUrl, thumbSrcSet } from '../../lib/imageUrl';
import { BOARD_FILTER_CATEGORIES, categoryPillClass } from '../../lib/postCategory';

interface CommunityTabProps {
  /** 장터 화면 임베드 슬롯 — 서브탭을 유지한 채 커뮤니티 안에서 장터를 보여준다 */
  marketSlot?: ReactNode;
  venues: Venue[];
  comments: Comment[];
  posts: CommunityPost[];
  /** 운영자 공지 (전역 피드 최상단에 핀 고정) */
  notices?: MarketplaceNotice[];
  isAdmin?: boolean;
  onWriteNotice?: () => void;
  /** 공지 클릭 시 상세 모달 열기 */
  onSelectNotice?: (notice: MarketplaceNotice) => void;
  onSelectVenue: (venueId: string) => void;
  onSelectPost: (post: CommunityPost) => void;
  /** 글쓰기 버튼 → 글쓰기 모달 열기. category로 기본 카테고리 지정('홀덤 공부' 탭=study) */
  onOpenWrite: (category?: PostCategory) => void;
  onLikePost: (postId: string) => void;
  /** 데스크탑 2-pane 인라인 상세에서 게시글 삭제(관리자/작성자) */
  onDeletePost?: (postId: string) => void;
  /** 업주가 본인 홀덤펍 생성 후 목록/프로필 새로고침 */
  onReloadVenues?: () => void;
  /**
   * 이 탭이 지금 화면에 보이는가(App 의 keep-alive display 토글과 같은 값).
   * 뒤로가기 겹을 **보일 때만** 등록하기 위해 필요하다 — 숨은 채 마운트만 돼 있는 탭이
   * 겹을 들고 있으면 사용자의 뒤로가기가 아무 일도 안 하고 소진된다(먹통).
   */
  active?: boolean;
}

// 커뮤니티 섹션 — 홀덤펍 / 게시판 / 실시간 / 랭킹 / 장터 / 딜러 / 매장(owner, 구 '업주' 라벨) (사용 빈도순 진열)
// (홀덤 공부는 게시판으로 통합, 도구는 메인 탭으로 분리)
type Section = 'live' | 'board' | 'venues' | 'rank' | 'dealer' | 'owner' | 'market';
// 다른 메인 탭(중고장터 등)으로 갔다 돌아와도 커뮤니티 섹션이 유지되도록 모듈 레벨에 기억
let lastCommunitySection: Section = 'venues';
// 서브탭 진열 순서 — View Transition 방향성(오른쪽 탭 = forward) 판정용.
// market/owner 는 조건부 노출이지만 indexOf 상대 비교라 정적 전체 배열로 충분하다.
const SEC_ORDER: Section[] = ['venues', 'board', 'live', 'rank', 'market', 'dealer', 'owner'];

// 게시판 카테고리 필터 — 라벨·색표는 src/lib/postCategory.ts 가 단일 출처.
// (글보기 상세에도 같은 뱃지를 넣어야 해서 모듈로 뺐다 — 복사해 두면 언젠가 한쪽만 바뀐다)
const BOARD_CATEGORIES = BOARD_FILTER_CATEGORIES;


function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return '방금 전';
  if (diff < 3600)  return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  return `${Math.floor(diff/86400)}일 전`;
}

// 섹션 루트 memo (2026-08-28) — 서브탭 전환은 section state 로 CommunityTab 을 재렌더하는데,
// keep-alive + 유휴 프리마운트로 6개 섹션이 전부 마운트돼 있으면 그 재렌더가 전 섹션으로 번진다.
// 실측(CPU 4×): memo 없이 프리마운트만 켰더니 첫 전환 롱프레임이 115ms → 219ms(게시판)로 악화됐다.
// 각 섹션은 section 을 읽지 않으므로 memo 로 끊는다 — 전환 프레임에는 '숨김→표시' 레이아웃만 남는다.
// (marketSlot 은 App 의 useMemo 로 요소 참조가 고정돼 React 가 이미 서브트리를 건너뛴다)
const LiveWallSectionM     = memo(LiveWallSection);
const FeedSectionM         = memo(FeedSection);
const VenuesSectionM       = memo(VenuesSection);
const MyCommunitiesActionM = memo(MyCommunitiesAction);
const TierLeaderboardM     = memo(TierLeaderboard);
const DealerCommunityM     = memo(DealerCommunity);
const OwnerCommunityM      = memo(OwnerCommunity);

function CommunityTab({
  venues, comments, posts: rawPosts, notices = [], isAdmin = false, onWriteNotice, onSelectNotice,
  onSelectVenue, onSelectPost, onOpenWrite, onLikePost, onDeletePost, onReloadVenues, marketSlot,
  active = true,
}: CommunityTabProps) {
  // 차단한 사용자의 글 + 신고 누적 자동 숨김(blinded) 글은 피드에서 제외(운영자·작성자는 예외)
  const { isBlocked } = useBlocks();
  const { user: meForFeed } = useAuth();
  const posts = useMemo(
    () => rawPosts.filter((p) => !isBlocked(p.userId) && (!p.blinded || isAdmin || p.userId === meForFeed?.id)),
    [rawPosts, isBlocked, isAdmin, meForFeed],
  );
  const [section, setSectionState] = useState<Section>(() => {
    // 은퇴한 market 탭 딥링크(?tab=market)·'내 장터 거래' 바로가기가 남긴 1회성 지정
    try {
      const pre = sessionStorage.getItem('nuri:community-section');
      if (pre) { sessionStorage.removeItem('nuri:community-section'); lastCommunitySection = pre as Section; }
    } catch { /* noop */ }
    return lastCommunitySection;
  });
  // 칩 하이라이트(알약)는 즉시, 컨텐츠 교체는 트랜지션 — 장터(lazy) 첫 진입에도 이전 화면이 유지돼 끊김이 없다
  const [shownSec, setShownSec] = useState<Section>(lastCommunitySection);
  const [, startSecTransition] = useTransition();
  // keep-alive — 한 번 방문한 섹션은 언마운트하지 않고 display 만 끈다(메인 탭 visitedTabs 와 같은 조리법).
  // 재방문 마운트 비용이 0이라 전환 커밋 프레임이 가벼워지고, 스냅샷 뒤 동기 커밋(flushSync)이 가능해진다.
  const [visitedSecs] = useState(() => new Set<Section>([section]));
  useEffect(() => { visitedSecs.add(section); }, [section, visitedSecs]);
  // 섹션별 스크롤 — 스크롤러가 window 하나라 섹션을 오가면 위치가 섞인다. 떠날 때 저장, 도착하면 페인트 전 복원.
  const secScrollRef = useRef(new Map<Section, number>());
  const activeSecRef = useRef<Section>(section);
  useEffect(() => { activeSecRef.current = section; }, [section]);
  // 마지막 서브탭 전환 시각 — 유휴 프리마운트가 전환(VT .26s) 한복판에 커밋을 얹지 않도록 양보 판정용
  const lastSwitchAtRef = useRef(0);
  // 스크롤 복원이 실제로 필요한 전환인지 — setSection 이 판정한다. 초기값 false 라
  // '마운트만 된' 경우(App 의 탭 프리마운트로 숨긴 채 마운트)엔 보이는 탭의 스크롤을 건드리지 않는다.
  const needScrollRef = useRef(false);
  // 메인 하단 탭 changeTab(App.tsx)과 동일 조리법 — 재방문(keep-alive)은 View Transition 스냅샷 뒤
  // flushSync 동기 커밋(방향성 푸시: 오른쪽 탭 = forward), 첫 방문(lazy·초기 fetch)은 startTransition 으로
  // 이전 화면 유지. 렌더 상태를 읽지 않아(모듈 변수·ref·안정 Set) 빈 deps 리스너의 stale closure 에도 안전.
  const setSection = useCallback((s: Section) => {
    if (s === lastCommunitySection && s === activeSecRef.current) return; // 같은 탭 재탭 — 무의미한 스냅샷 방지
    lastSwitchAtRef.current = performance.now(); // 프리마운트에게 '지금은 비켜라' 신호
    // scrollY 는 여기서 딱 한 번 읽는다 — 레이아웃이 아직 깨끗한 시점이라 강제 리플로우가 없다.
    const curY = window.scrollY;
    secScrollRef.current.set(activeSecRef.current, curY);
    // 복원할 위치가 지금과 같으면(둘 다 0인 흔한 경우) scrollTo 를 아예 부르지 않는다 —
    // VT 콜백(flushSync) 안의 scrollTo 는 강제 동기 레이아웃을 한 번 더 유발한다.
    needScrollRef.current = (secScrollRef.current.get(s) ?? 0) !== curY;
    lastCommunitySection = s;
    setShownSec(s);
    if (visitedSecs.has(s)) {
      const from = SEC_ORDER.indexOf(activeSecRef.current);
      const to = SEC_ORDER.indexOf(s);
      // 서브섹션 전환 동안만 서브탭 바를 root 스냅샷에서 제외(자기 이름의 스냅샷 — index.css 마커 참조).
      // 상시 name 이면 메인 탭 전환(커뮤니티→홈)에서 old-only 스냅샷이 전환 내내 얼어붙는 잔상을 실측했다.
      // 마커는 old 캡처(startViewTransition 호출 시점) 전에 켜져 있어야 하고, new 캡처가 끝난 뒤에 꺼야
      // 하므로 전환 duration(--dur-panel .26s)보다 넉넉한 타이머로 해제한다(vtDir 마커와 같은 조리법).
      document.documentElement.dataset.vtScope = 'community-sec';
      withViewTransition(
        () => { flushSync(() => setSectionState(s)); },
        () => startSecTransition(() => setSectionState(s)),
        to >= from ? 'forward' : 'back',
      );
      window.setTimeout(() => {
        if (document.documentElement.dataset.vtScope === 'community-sec') delete document.documentElement.dataset.vtScope;
      }, 450);
    } else {
      startSecTransition(() => setSectionState(s));
    }
  }, [visitedSecs]);
  // 뒤로가기 — 진입 섹션이 아닌 서브섹션(딜러/랭킹/장터 등)에선 먼저 진입 섹션으로 복귀, 그 다음에야 탭을 빠져나감.
  //
  // ⚠ 2026-08-28 근치 — 여기가 오너가 말한 '뒤로가기가 먹통' 의 진원지 중 하나였다.
  //   ① 기준이 'board' 로 하드코딩돼 있었는데, 이 탭이 실제로 여는 섹션은 'venues'(lastCommunitySection 기본값)다.
  //      즉 **마운트되는 순간 조건이 항상 참**이라 겹이 하나 등록된다.
  //   ② 게다가 이 탭은 App 의 idle 프리마운트로 **화면에 보이지도 않는 채** 미리 마운트된다.
  //      그래서 부팅 ~10초 뒤부터 모든 사용자에게 '보이지 않는 겹' 이 하나 깔려 있었고,
  //      뒤로가기를 누르면 화면은 그대로인 채 숨은 탭의 섹션만 바뀌며 입력이 소진됐다.
  //      사용자 눈에는 '뒤로가기를 눌렀는데 아무 일도 안 일어남 → 한 번 더 누르니 홈' 으로 보인다.
  //   → 기준을 '이 탭이 열린 섹션'(마운트 시점 값)으로 잡고, **보일 때만** 겹을 등록한다.
  const [entrySection] = useState<Section>(section);
  useBackClose(active && section !== entrySection, () => setSection(entrySection));
  // 복원은 layout 단계(페인트 전) — '맨 위가 번쩍했다가 내려가는' 깜빡임 방지. keep-alive 라 DOM 높이가 이미 있다.
  // flushSync 커밋 경로에선 스냅샷 뒤에서 실행돼 복원 비용까지 크로스페이드가 가린다.
  useLayoutEffect(() => {
    if (!needScrollRef.current) return;
    needScrollRef.current = false;
    window.scrollTo({ top: secScrollRef.current.get(section) ?? 0, behavior: 'instant' as ScrollBehavior });
  }, [section]);
  // 이미 마운트된 상태(keep-alive)에서 외부가 섹션을 지정할 때 — 예: 대시보드 '내 장터 거래'
  useEffect(() => {
    const h = (e: Event) => {
      const sec = (e as CustomEvent<string>).detail as Section;
      if (sec) setSection(sec);
    };
    window.addEventListener('nuri:community-section', h);
    return () => window.removeEventListener('nuri:community-section', h);
  }, [setSection]);
  const [query, setQuery] = useState('');

  // (2026-08-27 오너 지시) 본문 좌우 스와이프 섹션 전환 제거 — 칩 가로 스크롤·상세 화면 넘김과
  // 충돌해 의도치 않은 섹션 이동을 만들었다. 서브탭 전환은 탭 바 클릭만.
  const { user } = useAuth();
  // 데스크탑 게시판 2-pane: 좌측 목록 + 우측 인라인 상세. 모바일은 기존 오버레이 모달(onSelectPost) 사용.
  const isDesktop = useIsDesktop();
  const [boardSelected, setBoardSelected] = useState<CommunityPost | null>(null);
  const canOwnerCommunity = isAdmin || (user?.role === 'venue_owner' && user?.venueVerified === true);
  // 인라인 화살표면 FeedSectionM 의 memo 가 서브탭 전환마다 깨진다 — 참조 고정
  const openWriteFree = useCallback(() => onOpenWrite('free'), [onOpenWrite]);

  // 서브탭 바(가로 스크롤) — 외부 지정(딥링크·대시보드 바로가기)으로 바뀐 활성 탭이 화면 밖이면 보이게 끌어온다
  const secBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    secBarRef.current?.querySelector<HTMLElement>('[data-pill-active]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [shownSec]);

  // ── 유휴 프리마운트 (2026-08-28) ─────────────────────────────────────────────
  // 오너 관찰: "하부 메뉴는 처음 들어갈 때만 뚝뚝 끊기고 두 번째 이동부터 부드럽다."
  // 원인은 위 setSection 의 두 갈래다 —
  //   · 미방문 섹션 → else 가지(startTransition). View Transition 이 아예 없어 크로스페이드가
  //     붙지 않고, 첫 마운트 비용(첫 조회·목록 렌더·레이아웃)이 그대로 노출된다.
  //   · 재방문 → VT 스냅샷 + flushSync. 같은 커밋 비용이 크로스페이드 뒤에서 치러져 '부드럽다'가 된다.
  // 그래서 커뮤니티가 실제로 화면에 뜬 뒤, idle 마다 '하나씩' 미방문 섹션을 display:none 인 채로
  // 미리 마운트해 사용자의 첫 이동까지 재방문(VT) 경로로 만든다. App.tsx premountTick 과 같은 사상.
  //   · 한 번에 하나인 이유: 6개 동시 커밋은 그 자체가 idle 롱태스크가 된다.
  //   · display:none 서브트리는 레이아웃·페인트를 건너뛰므로 프리마운트 커밋은 실제 전환보다 싸다.
  //   · 화면에 뜬 뒤에 시작하는 이유: 커뮤니티를 열지도 않은 사용자에게 랭킹·실시간·딜러 조회를
  //     미리 태우지 않는다(App 의 탭 프리마운트는 커뮤니티를 '숨긴 채' 마운트한다).
  const rootRef = useRef<HTMLDivElement>(null);
  const [, setPremountTick] = useState(0);
  const hasMarket = !!marketSlot;
  useEffect(() => {
    let cancelled = false;
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const idle = (cb: () => void) => {
      if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 3000 });
      else window.setTimeout(cb, 600);
    };
    // 진열 순서 = 사용자가 다음에 누를 확률 순서. 조건부 섹션은 노출될 때만 태운다.
    const seq = SEC_ORDER.filter((s) => (s === 'market' ? hasMarket : s === 'owner' ? canOwnerCommunity : true));
    const mountNext = () => {
      if (cancelled) return;
      const s = seq.find((x) => !visitedSecs.has(x));
      if (!s) return; // 전부 마운트 완료 — 체인 종료
      // 사용자가 방금 서브탭을 눌렀다면 그 전환(VT --dur-panel .26s)이 끝날 때까지 양보한다.
      // 사용자가 고른 섹션은 section===s 로 이미 즉시 렌더되므로 언제나 프리마운트보다 우선이다.
      if (performance.now() - lastSwitchAtRef.current < 500) { idle(mountNext); return; }
      visitedSecs.add(s);
      // transition: 장터(lazy 청크)가 suspend 해도 상위 Suspense 폴백으로 교체되지 않는다
      startTransition(() => setPremountTick((n) => n + 1));
      idle(mountNext);
    };
    // 커뮤니티 페인이 display:none 이면 교차하지 않는다 — 탭이 실제로 열리는 순간 1회만 발화
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      idle(mountNext);
    });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
    // visitedSecs 는 안정 Set 인스턴스(useState 초기화) — 참조 불변
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMarket, canOwnerCommunity]);

  // 매장 정렬: 1) 유료광고(isPaidAd) → 2) 팔로워수 내림차순
  const sortedVenues = useMemo(() => {
    return venues
      .filter((v) => !query || v.name.includes(query) || v.region.includes(query))
      .map((v) => {
        const venueComments = comments
          .filter((c) => c.venueId === v.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return { venue: v, commentCount: venueComments.length, latest: venueComments[0] };
      })
      .sort((a, b) => {
        // 1순위: 인증 매장(verified) 우선
        const av = a.venue.verificationStatus === 'verified' ? 1 : 0;
        const bv = b.venue.verificationStatus === 'verified' ? 1 : 0;
        if (av !== bv) return bv - av;
        // 2순위: isPaidAd (true가 먼저)
        if (a.venue.isPaidAd !== b.venue.isPaidAd) return a.venue.isPaidAd ? -1 : 1;
        // 3순위: followerCount 내림차순
        return (b.venue.followerCount ?? 0) - (a.venue.followerCount ?? 0);
      });
  }, [venues, comments, query]);

  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts],
  );

  // 게시판 = 전체 글(홀덤 공부 탭을 게시판으로 통합)
  const boardPosts = sortedPosts;

  return (
    <div ref={rootRef} className="space-y-3">
      {/* 섹션 서브탭 바 — 세계 표준 세그먼트 문법(트위터/인스타 상단 탭): 일정한 패딩·간격,
          넘치면 가로 스크롤, 활성 표시는 공용 SlidingPill(LedgerStatsPanel 기간 바와 같은 집안 문법).
          진열은 사용 빈도순(게시판·실시간·랭킹·장터 앞, 딜러·업주 뒤). 첫 탭은 매장 디렉터리라
          상위 탭명과 겹치던 '커뮤니티' 라벨만 '홀덤펍'으로 명확화(기능·화면 불변).
          ⚠ 하단 탭바의 '커뮤니티' 라벨은 e2e 잠금 — 여기(서브탭)만 바꾼다. */}
      {/* 스크롤해도 항상 보이도록 헤더+메인탭 바로 아래에 고정.
          data-community-secbar: 서브섹션 View Transition(root 스냅샷)에서 제외 — 헤더·하단 탭바와 같은
          '상시 크롬'이라 전환 블러/슬라이드에 딸려 움직이면 안 된다(index.css VT 예외 블록 참조) */}
      <div data-community-secbar="" className="sticky top-[calc(theme(spacing.header-h)+env(safe-area-inset-top)-0.5rem)] lg:top-[calc(theme(spacing.header-h)+theme(spacing.tab-h)-0.5rem)] z-30 -mx-page-x px-page-x bg-surface-base border-b border-border-subtle pt-2.5 pb-2 lg:pt-2.5 before:pointer-events-none before:absolute before:inset-x-0 before:-top-4 before:h-4 before:bg-surface-base">
        <div ref={secBarRef} className="relative flex items-center gap-1 overflow-x-auto scrollbar-none rounded-input bg-surface-high p-0.5">
          <SlidingPill containerRef={secBarRef} activeKey={shownSec} underline className="rounded-full bg-accent-300" />
          <SectionTab active={shownSec === 'venues'} label="홀덤펍" onClick={() => setSection('venues')} />
          <SectionTab active={shownSec === 'board'}  label="게시판" onClick={() => setSection('board')} />
          <SectionTab active={shownSec === 'live'}   label="실시간" onClick={() => setSection('live')} />
          <SectionTab active={shownSec === 'rank'}   label="랭킹"   onClick={() => setSection('rank')} />
          {marketSlot && <SectionTab active={shownSec === 'market'} label="장터" onClick={() => setSection('market')} />}
          <SectionTab active={shownSec === 'dealer'} label="딜러"   onClick={() => setSection('dealer')} />
          {canOwnerCommunity && (
            <SectionTab active={shownSec === 'owner'} label="매장" onClick={() => setSection('owner')} />
          )}
        </div>
      </div>

      {/* 📣 외치기(오너 #8) — 활동점수로 산 한마디를 서브탭과 무관하게 같은 자리에 건다.
          어느 서브탭을 보든 보여야 '눈에 띄게'가 성립한다(게시판 피드 안에 넣으면 다른 탭에선 안 보인다).
          컴포넌트가 min-h 로 자리를 미리 잡아 도착 시 아래가 밀리지 않는다. */}
      <div className="mx-auto w-full max-w-3xl">
        <CommunityShoutBar />
      </div>

      {/* 섹션 콘텐츠 — 게시판은 2-pane 전체폭, 그 외 단일 컬럼은 읽기폭(max-w-3xl)으로 제한.
          keep-alive: 방문한 섹션은 언마운트하지 않고 display 토글(메인 탭과 동일) — 재방문 커밋 프레임이 가볍다 */}
      <div className={(section === 'board' || section === 'market') ? '' : 'mx-auto w-full max-w-3xl'}>
      {(visitedSecs.has('live') || section === 'live') && (
        <div data-sec="live" style={{ display: section === 'live' ? undefined : 'none' }}>
          <LiveWallSectionM />
        </div>
      )}

      {(visitedSecs.has('board') || section === 'board') && (
        <div data-sec="board" style={{ display: section === 'board' ? undefined : 'none' }}
          className="lg:flex lg:items-start lg:gap-4">
          {/* 좌측: 목록(압축) — 19rem(304px)은 PostRow 고정 메타(작성자+칭호+시간+조회 ≈368px)보다
              좁아 제목이 0px로 뭉개지고 조회수가 행 밖으로 잘렸다(PC 1280·1536 점검 2026-08-28).
              lg 24rem / xl 30rem: 1280 기준 우측 상세는 692px 확보(max-w-3xl 읽기폭과 근접). */}
          <div className="min-w-0 lg:w-[24rem] lg:shrink-0 xl:w-[30rem]">
            <FeedSectionM
              posts={boardPosts}
              notices={notices}
              isAdmin={isAdmin}
              onWriteNotice={onWriteNotice}
              onSelectNotice={onSelectNotice}
              onOpenWrite={openWriteFree}
              onLike={onLikePost}
              onSelectPost={isDesktop ? setBoardSelected : onSelectPost}
              selectedId={isDesktop ? boardSelected?.id : undefined}
              placeholder="나누고 싶은 이야기를 적어보세요…"
              emptyText="첫 게시글을 남겨보세요"
              enableCategory
            />
          </div>
          {/* 우측: 게시글 상세(크게) */}
          <aside className="hidden lg:sticky lg:top-[8.5rem] lg:block lg:min-w-0 lg:flex-1">
            {boardSelected ? (
              <PostDetailModal
                inline open
                post={boardSelected}
                onClose={() => setBoardSelected(null)}
                onLike={onLikePost}
                onDelete={onDeletePost ? (id) => { onDeletePost(id); setBoardSelected(null); } : undefined}
                venues={venues}
                onVenueClick={(vid) => { setBoardSelected(null); onSelectVenue(vid); }}
              />
            ) : (
              <div className="flex h-72 items-center justify-center rounded-aura border border-dashed border-border-default px-4 text-center text-2xs text-ink-muted">
                왼쪽에서 게시글을 선택하면<br />여기에 상세가 표시됩니다.
              </div>
            )}
          </aside>
        </div>
      )}

      {(visitedSecs.has('venues') || section === 'venues') && (
        <div data-sec="venues" style={{ display: section === 'venues' ? undefined : 'none' }} className="space-y-3">
          <MyCommunitiesActionM onSelectVenue={onSelectVenue} onCreated={onReloadVenues} />
          <VenuesSectionM
            sortedVenues={sortedVenues}
            query={query}
            onQuery={setQuery}
            onSelectVenue={onSelectVenue}
            onReloadVenues={onReloadVenues}
          />
        </div>
      )}

      {(visitedSecs.has('rank') || section === 'rank') && (
        <div data-sec="rank" style={{ display: section === 'rank' ? undefined : 'none' }}>
          <TierLeaderboardM />
        </div>
      )}

      {(visitedSecs.has('dealer') || section === 'dealer') && (
        <div data-sec="dealer" style={{ display: section === 'dealer' ? undefined : 'none' }}>
          <DealerCommunityM />
        </div>
      )}

      {canOwnerCommunity && (visitedSecs.has('owner') || section === 'owner') && (
        <div data-sec="owner" style={{ display: section === 'owner' ? undefined : 'none' }}>
          <OwnerCommunityM />
        </div>
      )}
      {!!marketSlot && (visitedSecs.has('market') || section === 'market') && (
        <div data-sec="market" style={{ display: section === 'market' ? undefined : 'none' }}>
          {marketSlot}
        </div>
      )}
      </div>
    </div>
  );
}

// ── 섹션 토글 버튼 ───────────────────────────────────────────────────────────

function SectionTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-pill-active={active || undefined}
      className={[
        // flex-[1_0_auto]: 자리가 남으면 균등 분배, 좁으면 내용 폭(일정한 px-3)을 지키고 바가 가로 스크롤
        // §T1: 서브탭 라벨 = t-tab(12.75/600). 활성은 아래 font-bold 가 덮는다.
        'relative flex-[1_0_auto] px-3 py-2 t-tab rounded-[6px] whitespace-nowrap',
        'transition-colors',
        'focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
        active ? 'text-ink-primary font-bold' : 'text-ink-secondary hover:text-ink-primary',
      ].join(' ')}
    >
      {/* 활성 배경은 부모의 공용 SlidingPill 이 미끄러지며 그린다 — 탭별 개별 팝인 제거 */}
      <span className="relative">{label}</span>
    </button>
  );
}

// ── 전역 피드 ────────────────────────────────────────────────────────────────

function FeedSection({
  posts, notices, isAdmin, onWriteNotice, onSelectNotice, onOpenWrite, onLike, onSelectPost,
  selectedId,
  placeholder = '나누고 싶은 이야기를 적어보세요…', emptyText = '첫 게시글을 남겨보세요',
  enableCategory = false,
}: {
  posts: CommunityPost[];
  notices?: MarketplaceNotice[];
  isAdmin?: boolean;
  onWriteNotice?: () => void;
  onSelectNotice?: (notice: MarketplaceNotice) => void;
  onOpenWrite: () => void;
  onLike: (id: string) => void;
  onSelectPost: (p: CommunityPost) => void;
  /** 데스크탑 2-pane: 현재 열린 게시글 id(목록 하이라이트용) */
  selectedId?: string;
  placeholder?: string;
  emptyText?: string;
  /** 게시판: 카테고리 필터 + HOT(최근 6시간 최다 조회) 노출 */
  enableCategory?: boolean;
}) {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<PostCategory | 'all'>('all');
  // 정렬(Phase 14, pokergosu 추천/인기 축) — 별도 게시판 신설 대신 정렬 칩으로.
  const [order, setOrder] = useState<'new' | 'popular'>('new');
  const [visible, setVisible] = useState(15);
  // 보기 모드: feed(카드 스택, **기본**) / compact(에펨코리아식 한 줄).
  // 오너 리포트(2026-08-28) "샘플까지 줬는데 적용이 안 됐다"의 원인이 정확히 이 한 줄이었다 —
  // PostCard(샘플 카드)는 만들어져 있었지만 기본값이 'compact'(PostRow)라 아무도 카드를 못 봤다.
  // 저장된 선택은 그대로 존중하되(기능 보존), 미선택(=키 없음)의 기본을 카드로 뒤집는다.
  const [view, setView] = useState<'compact' | 'feed'>(() =>
    (typeof localStorage !== 'undefined' && localStorage.getItem('nuri:board-view') === 'compact') ? 'compact' : 'feed');
  const switchView = (v: 'compact' | 'feed') => { setView(v); try { localStorage.setItem('nuri:board-view', v); } catch { /* noop */ } };
  // 커뮤니티 광고 5칸 — 게시판(enableCategory)에서만, 글 4개마다 한 칸씩 삽입
  const [ads, setAds] = useState<CommunityAd[]>([]);
  // 광고 빈도 '글 N개마다 1줄' — app_settings community_ads_every(관리자 → 노출 관리). 실패·없음 = 4
  const [adsEvery, setAdsEvery] = useState(COMMUNITY_ADS_EVERY_DEFAULT);
  // 작성자 장착 마크(상점) — posts의 userId 일괄 조회(닉네임 옆 이모지)
  const [authorMarks, setAuthorMarks] = useState<Record<string, string>>({});
  // 작성자 닉네임 색(상점 600점 · 20260830n) — 마크와 **같은 결합 지점**이라 같은 자리에서 함께 받는다.
  // 값은 색이 아니라 등급 토큰명('blue' 등)이다 → 실제 색은 --tier-<token> 이라 테마를 따라간다.
  const [authorColors, setAuthorColors] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = [...new Set(posts.map((p) => p.userId).filter(Boolean))];
    if (ids.length === 0) { setAuthorMarks({}); setAuthorColors({}); return; }
    getEquippedMarks(ids).then(setAuthorMarks).catch(() => {});
    getNickColors(ids).then(setAuthorColors).catch(() => {});
  }, [posts]);
  // 작성자 칭호(활동점수) — posts의 userId 일괄 조회(닉네임 옆 칭호)
  const titleOf = useTitlePoints(posts.map((p) => p.userId));
  useEffect(() => {
    if (!enableCategory) return;
    getActiveCommunityAds().then(setAds).catch(() => {});
    getAppSetting(COMMUNITY_ADS_EVERY_KEY).then((v) => setAdsEvery(parseAdsEvery(v))).catch(() => {});
  }, [enableCategory]);

  // HOT: 최근 6시간 내 조회수 상위 2개 (검색·카테고리 미적용 상태에서만 핀 고정)
  const hotPosts = useMemo(() => {
    if (!enableCategory) return [] as CommunityPost[];
    const since = Date.now() - 6 * 3600 * 1000;
    return [...posts]
      .filter((p) => new Date(p.createdAt).getTime() >= since && (p.viewCount ?? 0) > 0)
      .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
      .slice(0, 2);
  }, [posts, enableCategory]);
  const hotIds = useMemo(() => new Set(hotPosts.map((p) => p.id)), [hotPosts]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const base = posts.filter((p) => {
      if (enableCategory && cat !== 'all' && (p.category ?? 'free') !== cat) return false;
      if (kw && !(p.content.toLowerCase().includes(kw) || (p.title?.toLowerCase().includes(kw) ?? false) || p.userName.toLowerCase().includes(kw))) return false;
      return true;
    });
    // 관리자 고정(20260903a)은 정렬 축과 무관하게 항상 맨 위 — 마지막에 pinnedFirst 로 감싼다.
    // 인기 정렬(Phase 14, pokergosu 추천 축) — 별도 게시판 대신 정렬 칩. 동률은 최신순.
    if (order === 'popular') {
      return pinnedFirst([...base].sort((a, b) => (b.likeCount - a.likeCount) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())));
    }
    // 끌올(100점) — 최신순에서만 상단으로 올린다. '인기'는 읽는 사람이 고른 축이라
    // 거기까지 돈으로 뒤집으면 정렬 칩이 거짓말이 된다(끌올이 산 것은 '목록 맨 위'다).
    // Array.prototype.sort 는 안정 정렬이라 끌올끼리·나머지끼리의 기존 순서(최신순)는 보존된다.
    const bumped = base.filter((p) => isBumped(p));
    if (bumped.length === 0) return pinnedFirst(base);
    const bumpedIds = new Set(bumped.map((p) => p.id));
    return pinnedFirst([
      ...bumped.sort((a, b) => new Date(b.bumpedUntil ?? 0).getTime() - new Date(a.bumpedUntil ?? 0).getTime()),
      ...base.filter((p) => !bumpedIds.has(p.id)),
    ]);
  }, [posts, q, cat, enableCategory, order]);

  const pinHot = enableCategory && cat === 'all' && !q.trim() && order === 'new' && hotPosts.length > 0;
  const listSource = pinHot ? filtered.filter((p) => !hotIds.has(p.id)) : filtered;
  const shown = listSource.slice(0, visible);

  return (
    <div className="space-y-2">
      {/* 글쓰기 — '글쓰기' 버튼 → 글쓰기 모달(카테고리·제목·내용·이미지) (Stage 2) */}
      {user ? (
        <button
          type="button"
          onClick={onOpenWrite}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-input bg-surface-high border border-border-default hover:border-accent-400/50 transition-colors text-left"
        >
          <span className="text-xs text-ink-muted">{placeholder}</span>
          <span className="shrink-0 inline-flex items-center gap-1 text-2xs font-bold text-accent-300">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            글쓰기
          </span>
        </button>
      ) : (
        <button type="button" onClick={() => promptLogin()}
          className="w-full rounded-input bg-surface-high p-2 text-center text-2xs text-ink-secondary transition-colors hover:bg-surface-high/70 hover:text-accent-300">
          로그인하면 게시글을 작성할 수 있어요 — <b className="text-accent-300">로그인하기 →</b>
        </button>
      )}

      {/* ── 관리자 공지 (게시판 맨 위) ───────────────────────── */}
      {(notices && notices.length > 0) || isAdmin ? (
        <section className="rounded-aura border border-accent-400/40 bg-gradient-to-br from-accent-300/[0.06] to-transparent overflow-hidden">
          <header className="flex items-center justify-between px-3 py-2 border-b border-accent-400/20">
            <h2 className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-300">
              공지사항
              {notices && <span className="text-2xs text-ink-muted font-normal">({notices.length})</span>}
            </h2>
            {isAdmin && (
              <button
                type="button"
                onClick={onWriteNotice}
                className="text-2xs text-accent-300 hover:text-accent-200 font-semibold"
              >
                + 공지 작성
              </button>
            )}
          </header>
          {notices && notices.length > 0 ? (
            <ul>
              {notices.map((n) => (
                <li
                  key={n.id}
                  onClick={() => onSelectNotice?.(n)}
                  role={onSelectNotice ? 'button' : undefined}
                  tabIndex={onSelectNotice ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (onSelectNotice && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onSelectNotice(n);
                    }
                  }}
                  className={[
                    'px-3 py-2 border-b border-border-subtle last:border-b-0 transition-colors focus:outline-none',
                    onSelectNotice
                      ? 'hover:bg-surface-high/50 focus-visible:bg-surface-high/50 cursor-pointer'
                      : 'cursor-default',
                  ].join(' ')}
                >
                  {/* 오너 지시(2026-08-27): 공지는 제목만 한 줄 — 본문·작성자는 눌러서 상세에서 */}
                  <p className="flex items-center gap-2 text-xs font-semibold text-ink-primary">
                    <span className="min-w-0 flex-1 truncate">{n.title}</span>
                    <span className="shrink-0 text-2xs font-normal tabular-nums text-ink-muted">{relativeTime(n.createdAt)}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-center text-2xs text-ink-muted">등록된 공지가 없습니다</p>
          )}
        </section>
      ) : null}

      {/* 검색 + 카테고리 필터 */}
      {posts.length > 0 && (
        <div className="space-y-1.5">
          {/* 오너 리포트(2026-08-28) "검색에 '게시글 검색' — 제목 뒤에는 밀려서 보이지도 않아".
              375px 실측: 행 341px 중 정렬 85px + 보기 74px + gap 12px 을 빼면 입력은 169px,
              pl-9(38.25)+pr(12.75) 을 다시 빼면 글자가 설 수 있는 폭은 116px 뿐이었다.
              placeholder '게시글 검색 (제목·내용·작성자)' 는 193px → 77px 초과, 18자 중 11자만 보였다.
              (수정 후 실측: 입력 249.7px · 글자폭 196.7px · placeholder 27.7px → 잘림 0, 한글 14자까지 통째로 보임)
              처방 ① placeholder 를 '검색' 한 단어로(아이콘이 이미 '검색'을 말한다)
                   ② 입력을 1행 전폭으로 올리고, 정렬은 그대로 두되 **보기 토글만** 카테고리 행으로
                     내려보낸다 — 행 수는 2행 그대로라 오너가 지적했던 '세로가 길다'가 재발하지 않는다. */}
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" aria-hidden>
                <circle cx="6" cy="6" r="4.5" /><line x1="9.5" y1="9.5" x2="13" y2="13" />
              </svg>
              <input
                type="search" enterKeyHint="search"
                value={q}
                onChange={(e) => { setQ(e.target.value); setVisible(15); }}
                placeholder="검색"
                aria-label="게시글 검색 (제목·내용·작성자)"
                className="input h-9 min-h-0 w-full py-0 pl-9 pr-3 text-sm"
              />
            </div>
            {/* 최신/인기 정렬(Phase 14) — 인기 = 좋아요순. overflow-hidden이 .hit 확장을 잘라내므로 실높이(h-9)로 탭 타깃 확보 */}
            <div className="inline-flex shrink-0 overflow-hidden rounded-input border border-border-default">
              {(['new', 'popular'] as const).map((o) => (
                <button key={o} type="button" onClick={() => setOrder(o)} aria-pressed={order === o}
                  className={['h-9 px-2.5 text-2xs font-bold transition-colors', order === o ? 'bg-accent-300/15 text-accent-200 font-bold' : 'bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
                  {o === 'new' ? '최신' : '인기'}
                </button>
              ))}
            </div>
          </div>
          {/* 2행 — 카테고리 칩(가로 스크롤) + 보기 토글. 칩 h-8 과 토글 h-8 로 밀도 정합 */}
          <div className="flex items-center gap-1.5">
            {enableCategory ? (
              // 오너 지시(2026-08-27): 카테고리 나열이 지저분 — 줄바꿈 없는 한 줄 스크롤 칩,
              // 균일 높이·보더 없는 면 기반(활성만 인디고), browse 필터 레일과 같은 문법.
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-none">
                {BOARD_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={cat === c.id}
                    onClick={() => { setCat(c.id); setVisible(15); }}
                    className={[
                      'shrink-0 inline-flex items-center h-8 px-3 rounded-chip text-2xs font-bold leading-none transition-colors',
                      cat === c.id
                        ? 'bg-accent-300/15 text-accent-200 ring-1 ring-inset ring-accent-400/45 shadow-glow'
                        : 'bg-surface-high text-ink-secondary hover:bg-surface-float/70',
                    ].join(' ')}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
            {/* 보기 모드 토글 — 카드 스택(기본) / 한 줄 목록. 두 보기 모두 유지(기능 보존) */}
            <div className="flex h-8 shrink-0 items-center rounded-input border border-border-default bg-surface-high p-0.5">
              <button type="button" aria-label="카드 보기" title="카드 보기"
                onClick={() => switchView('feed')}
                className={['flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors', view === 'feed' ? 'bg-surface-float text-accent-300' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" />
                </svg>
              </button>
              <button type="button" aria-label="한 줄 목록" title="한 줄 목록"
                onClick={() => switchView('compact')}
                className={['flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors', view === 'compact' ? 'bg-surface-float text-accent-300' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HOT — 최근 6시간 최다 조회 글 (게시판 기본 화면).
          피드(카드) 모드는 카드 스택 그대로 — HOT 배지가 이미 카드 안에 있어 이중 테두리를 만들지 않는다 */}
      {pinHot && (
        view === 'compact' ? (
          <div className="rounded-aura border border-danger/30 bg-danger/[0.04] overflow-hidden">
            <ul>
              {hotPosts.map((p) => (
                <PostRow key={p.id} post={p} hot selected={p.id === selectedId} mark={authorMarks[p.userId] ?? ''} titlePts={titleOf(p.userId)} onClick={() => onSelectPost(p)} />
              ))}
            </ul>
          </div>
        ) : (
          <ul className="space-y-2">
            {hotPosts.map((p) => (
              <PostCard key={p.id} post={p} hot selected={p.id === selectedId} mark={authorMarks[p.userId] ?? ''} nickToken={authorColors[p.userId]} titlePts={titleOf(p.userId)} onLike={() => onLike(p.id)} onClick={() => onSelectPost(p)} />
            ))}
          </ul>
        )
      )}

      {/* 포스트 목록 — 게시판 형태 (조밀하게 많이 보이게) */}
      {posts.length === 0 ? (
        <>
          <p className="text-center py-12 text-xs text-ink-muted">{emptyText}</p>
          {/* 글이 없어도 광고 칸은 산다 — 게재 미리보기 겸 */}
          {ads[0] && <div className="rounded-aura border card-aura overflow-hidden"><AdRow ad={ads[0]} /></div>}
        </>
      ) : listSource.length === 0 ? (
        <>
          <p className="text-center py-12 text-xs text-ink-muted">{pinHot ? '다른 글이 없습니다' : '검색 결과가 없습니다'}</p>
          {/* 글이 없어도 광고 칸은 산다 — 게재 미리보기 겸 */}
          {ads[0] && <div className="rounded-aura border card-aura overflow-hidden"><AdRow ad={ads[0]} /></div>}
        </>
      ) : view === 'compact' ? (
        <>
          <div className="rounded-aura border card-aura overflow-hidden">
            <ul>
              {shown.map((p, i) => {
                const ad = ads[Math.floor(i / adsEvery)];
                const showAd = i % adsEvery === adsEvery - 1 && !!ad; // 글 N개마다 광고 한 칸(관리자 설정)
                return (
                  <Fragment key={p.id}>
                    <PostRow post={p} mark={authorMarks[p.userId] ?? ''} titlePts={titleOf(p.userId)} selected={p.id === selectedId} onClick={() => onSelectPost(p)} />
                    {showAd && <AdRow ad={ad} />}
                  </Fragment>
                );
              })}
              {/* 글이 적어도 광고 1칸은 보이게 — N개 미만이면 리스트 끝에 첫 광고 */}
              {shown.length < adsEvery && ads[0] && <AdRow ad={ads[0]} />}
            </ul>
          </div>
          {listSource.length > visible && (
            <InfiniteSentinel onMore={() => setVisible((v) => v + 15)} remain={listSource.length - visible} />
          )}
        </>
      ) : (
        <>
          {/* 피드(카드) 모드 — 오너 레퍼런스: 독립 라운드 카드 스택, 광고도 같은 카드 문법 */}
          <ul className="space-y-2">
            {shown.map((p, i) => {
              const ad = ads[Math.floor(i / adsEvery)];
              const showAd = i % adsEvery === adsEvery - 1 && !!ad;
              return (
                <Fragment key={p.id}>
                  <PostCard post={p} mark={authorMarks[p.userId] ?? ''} nickToken={authorColors[p.userId]} titlePts={titleOf(p.userId)} selected={p.id === selectedId} onLike={() => onLike(p.id)} onClick={() => onSelectPost(p)} />
                  {showAd && <AdRow ad={ad} card />}
                </Fragment>
              );
            })}
            {shown.length < adsEvery && ads[0] && <AdRow ad={ads[0]} card />}
          </ul>
          {listSource.length > visible && (
            <InfiniteSentinel onMore={() => setVisible((v) => v + 15)} remain={listSource.length - visible} />
          )}
        </>
      )}
    </div>
  );
}

// 무한 스크롤 센티넬 — 화면에 보이면 자동으로 다음 15개 로드(버튼 클릭도 가능)
function InfiniteSentinel({ onMore, remain }: { onMore: () => void; remain: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const ob = new IntersectionObserver((es) => { if (es[0]?.isIntersecting) onMore(); }, { rootMargin: '200px' });
    ob.observe(el);
    return () => ob.disconnect();
  }, [onMore]);
  return (
    <button ref={ref} type="button" onClick={onMore}
      className="w-full rounded-input bg-surface-high py-2.5 text-xs font-semibold text-ink-muted transition-colors hover:text-ink-primary">
      불러오는 중… ({remain.toLocaleString()}개 남음)
    </button>
  );
}

// 커뮤니티 광고 행 — 한 줄 리스트 사이 [AD] 행(운영자가 관리자 설정 → 게시물 관리에서 게재)
function AdRow({ ad, card = false }: { ad: CommunityAd; card?: boolean }) {
  const href = ad.linkUrl && /^https?:\/\//.test(ad.linkUrl) ? ad.linkUrl : ad.linkUrl ? `https://${ad.linkUrl}` : '';
  const inner = (
    <>
      <span className="shrink-0 rounded-badge bg-accent-300 px-1 py-0.5 text-2xs font-extrabold leading-none text-white">AD</span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-primary">{ad.title}</span>
      {ad.advertiser && <span className="shrink-0 text-xs text-ink-muted">{ad.advertiser}</span>}
    </>
  );
  // card: 피드(카드 스택) 모드 — 행 구분선 대신 글 카드와 같은 라운드 카드 문법(보더+card-elev 동일)
  const cls = card
    ? 'flex items-center gap-2 rounded-aura border card-aura px-3 py-2 transition-colors hover:bg-accent-300/10'
    : 'flex items-center gap-2 border-b border-border-subtle bg-accent-300/[0.04] px-3 py-2 transition-colors last:border-b-0 hover:bg-accent-300/10';
  return (
    <li>
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
        : <div className={cls}>{inner}</div>}
    </li>
  );
}

// 에펨코리아식 한 줄 행 — 제목 크게(타이포 위계), 메타는 작고 연하게. 바이낸스 표 밀도(py-2).
// (A4) 피드 행 memo — 데이터 props만 비교(인라인 onClick/onLike 무시, 같은 post엔 동작 동일). 긴 피드에서 변경된 행만 재렌더.
type PostRowData = { post: CommunityPost; selected?: boolean; mark?: string; titlePts?: number; hot?: boolean };
const samePostProps = (a: PostRowData, b: PostRowData) =>
  a.post === b.post && a.selected === b.selected && a.mark === b.mark && a.titlePts === b.titlePts && a.hot === b.hot;

const PostRow = memo(function PostRow({ post, onClick, hot = false, selected = false, mark = '', titlePts }: { post: CommunityPost; onClick: () => void; hot?: boolean; selected?: boolean; mark?: string; titlePts?: number }) {
  // 화면 밖 행은 브라우저가 렌더를 통째로 건너뛴다(content-visibility) — cv-row-* 는 index.css
  const catLabel = BOARD_CATEGORIES.find((c) => c.id === (post.category ?? 'free'))?.label ?? '자유';
  const { replay, hand } = parseAttachments(post.content);
  // 한 줄 행(에펨식)은 행 높이가 곧 목록 밀도라 썸네일을 넣으면 표가 무너진다 → image 아이콘 배지로만 알린다.
  const imgCount = post.images?.length ?? 0;
  return (
    <li
      onClick={onClick}
      // 공지 행과 같은 키보드 접근 패턴 — Enter/Space로도 열리게
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-current={selected || undefined}
      className={[
        'cv-row-sm min-h-[var(--row-h-sm)] flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border-subtle last:border-b-0 focus:outline-none focus-visible:bg-surface-high/60',
        selected ? 'bg-accent-300/10' : 'hover:bg-surface-high/60 active:bg-surface-high',
      ].join(' ')}
    >
      {/* 끌올(100점)은 카테고리 자리를 뺏지 않는다 — 앞에 한 칸을 더 쓴다.
          돈을 낸 표시를 지우면 '올라가긴 했는데 왜 위에 있는지'가 안 보이고, 카테고리를 지우면
          있던 정보가 사라진다(둘 다 남긴다). */}
      {post.pinnedAt && (
        <span className="shrink-0 rounded-badge bg-gold-400/15 px-1 text-2xs font-extrabold leading-none text-gold-400">고정</span>
      )}
      {isBumped(post) && (
        <span className="shrink-0 rounded-badge bg-accent-300/15 px-1 text-2xs font-extrabold leading-none text-accent-200">끌올</span>
      )}
      {hot
        ? <span className="shrink-0 rounded-badge bg-danger/15 px-1 text-2xs font-extrabold leading-none tracking-wide text-danger-light">HOT</span>
        : <span className={['shrink-0 rounded-badge px-1 py-0.5 text-2xs font-semibold leading-none', categoryPillClass(post.category)].join(' ')}>{catLabel}</span>}
      <span className="min-w-0 flex-1 truncate">
        {/* NEW 도트(Phase 14, pokergosu 리스트 밀도) — 24시간 이내 글 */}
        {Date.now() - new Date(post.createdAt).getTime() < 24 * 3600_000 && (
          <span aria-label="새 글" className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-danger align-middle" />
        )}
        <span className="text-sm font-bold leading-tight text-ink-primary">{post.title || post.content.slice(0, 40)}</span>
        {(replay || hand) && (
          <span className="ml-1 align-middle text-accent-300" aria-label={replay ? '리플레이 첨부' : '핸드 첨부'}>
            <Icon name={replay ? 'cards' : 'spade'} size={12} className="inline align-[-2px]" />
          </span>
        )}
        {imgCount > 0 && (
          <span className="ml-1 align-middle text-2xs tabular-nums text-ink-muted" aria-label={`사진 ${imgCount}장`}>
            <Icon name="image" size={12} className="inline align-[-2px]" />{imgCount > 1 ? imgCount : ''}
          </span>
        )}
        {post.commentCount > 0 && <span className="ml-1 align-middle text-xs font-bold tabular-nums text-accent-300">[{post.commentCount}]</span>}
        {(post.cheerCount ?? 0) > 0 && (
          <span className="ml-1 align-middle text-2xs font-bold tabular-nums text-accent-200" aria-label={`응원 ${post.cheerCount}`}>
            <Icon name="chip-stack" size={11} className="inline align-[-1px]" />{post.cheerCount}
          </span>
        )}
      </span>
      {/* max-w+truncate: 작성자가 shrink-0 무제한이면 좁은 2-pane 목록·긴 닉네임에서
          flex-1 제목이 0px까지 뭉개진다 — 닉네임이 대신 말줄임(제목 우선, 에펨식 위계) */}
      <span className="shrink-0 max-w-[7rem] truncate text-xs text-ink-muted">{mark}{post.userName}</span>
      <TitleChip points={titlePts} />
      <span className="hidden shrink-0 text-xs tabular-nums text-ink-muted sm:inline">{relativeTime(post.createdAt)}</span>
      {(post.viewCount ?? 0) > 0 && (
        <span className="shrink-0 inline-flex w-10 items-center justify-end gap-0.5 text-xs tabular-nums text-ink-muted" aria-label={`조회 ${post.viewCount}`}>
          <Icon name="eye" size={11} className="shrink-0" />{post.viewCount}
        </span>
      )}
    </li>
  );
}, samePostProps);

const PostCard = memo(function PostCard({ post, onLike, onClick, hot = false, selected = false, mark = '', nickToken, titlePts }: { post: CommunityPost; onLike: () => void; onClick: () => void; hot?: boolean; selected?: boolean; mark?: string; /** 작성자가 장착한 닉네임 색의 등급 토큰명(--tier-<token>) */ nickToken?: string | null; titlePts?: number }) {
  // Nightingale 카드 문법(§20.1) — 헤더(이름/시간 2줄 스택)·제목·본문 2줄 클램프·미디어·반응 푸터 순서 고정.
  // 미디어는 첫 장만 44px 썸네일(88px=레티나 2x 요청)로, 2장 이상은 장수 배지 — 목록에서 원본을 내려받지 않는다.
  const imgs = post.images ?? [];
  const catLabel = BOARD_CATEGORIES.find((c) => c.id === (post.category ?? 'free'))?.label ?? '자유';
  // 핸드/리플레이 첨부 파싱(검증 #12) — 기존 lib/hand 파서 재사용, 실패 시 조용히 원문 표시로 폴백
  let att: ReturnType<typeof parseAttachments>;
  try { att = parseAttachments(post.content); }
  catch { att = { text: post.content, hand: null, replay: null }; }
  return (
    <li
      onClick={onClick}
      // 공지 행과 같은 키보드 접근 패턴 — Enter/Space로도 열리게
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-current={selected || undefined}
      // 오너 레퍼런스(2026-08-27): 피드는 독립 라운드 카드 스택 — 행 구분선 대신 카드 보더.
      // 오너 리포트(2026-08-28) '밋밋한 단색 배경에 경계선도 없이' →
      // 앵커 카드(ScheduleCard)의 정본 카드 문법을 그대로 가져온다:
      //   card-elev(정적 수직 광원+상단 하이라이트) + border-border-default + shadow-card(헤어라인 링) + bg-surface-low.
      // 실측(다크, surface-base 대비): border-subtle 1.29:1 → border-default 2.06:1, hover strong 3.37:1.
      // card-elev 는 background-image 라 hover 의 background-color 변화와 충돌하지 않는다.
      className={[
        // v2 아우라 카드(2026-09-02): card-elev+단색 → card-aura(반투명 면·6% 헤어라인·상단 하이라이트). 선택 상태는 바이올렛 틴트가 덮는다.
        'cv-row-lg min-h-[var(--row-h-lg)] card-aura py-2.5 px-3 rounded-aura border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300/60',
        selected
          ? 'border-accent-300/60 bg-accent-300/[0.07]'
          : 'hover:border-border-strong hover:bg-surface-high/50 active:bg-surface-high',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <Avatar name={post.userName} src={post.userAvatar} color={post.userColor} size={24} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          {/* 헤더 — 이름(bold) 위 / 시간·칭호 아래 2줄 스택: 이름 길이와 무관하게 줄수(=높이)가 고정된다 */}
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-2xs leading-4">
                {post.pinnedAt && (
                  <span className="shrink-0 inline-flex items-center rounded-badge bg-gold-400/15 px-1 font-extrabold leading-none text-gold-400">고정</span>
                )}
                {isBumped(post) && (
                  <span className="shrink-0 inline-flex items-center rounded-badge bg-accent-300/15 px-1 font-extrabold leading-none text-accent-200">끌올</span>
                )}
                {hot && (
                  <span className="shrink-0 inline-flex items-center font-extrabold text-danger-light bg-danger/15 px-1 rounded-badge leading-none tracking-wide">HOT</span>
                )}
                {/* 닉네임 색(상점 600점) — 텍스트용 --tier-* 를 쓴다. 장식용 -vivid 가 아니다:
                    닉네임은 '읽는 글자'라 라이트·다크 양쪽에서 4.5:1 을 지켜야 하고, 그 계약이
                    e2e/design-tokens.spec.ts '닉네임 색' 항목으로 잠겨 있다. */}
                <span className="min-w-0 truncate font-bold text-ink-primary"
                      style={nickColorVar(nickToken) ? { color: tierCss(nickColorVar(nickToken)!) } : undefined}>
                  {mark}{post.userName}
                </span>
              </p>
              <p className="flex items-center gap-1 text-2xs leading-4 text-ink-muted">
                <span className="shrink-0 tabular-nums">{relativeTime(post.createdAt)}</span>
                <TitleChip points={titlePts} />
                {post.userRole === 'venue_owner' && <span className="shrink-0">· 매장</span>}
                {post.userRole === 'admin' && <span className="shrink-0">· 운영자</span>}
              </p>
            </div>
            {/* 카테고리 pill — CATEGORY_TINTS 고정 팔레트 */}
            <span className={['mt-px shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-semibold leading-none', categoryPillClass(post.category)].join(' ')}>{catLabel}</span>
          </div>
          {/* 제목 — 한 줄 목록(PostRow)과 같은 15px 위계. 카드에서 제일 먼저 읽히는 줄 */}
          {post.title && (
            <p className="mt-1 truncate text-sm font-bold leading-tight text-ink-primary">{post.title}</p>
          )}
          {/* 본문 발췌 — 2줄 클램프 */}
          {/* §T1: 13px 은 사다리 밖 — 본문 미리보기 = t-desc(12.75/19.13). */}
          <p className="t-desc text-ink-secondary line-clamp-2 mt-1 break-words">
            {(att.hand || att.replay) && (
              <span className="mr-1 inline-flex items-center gap-0.5 rounded-badge bg-accent-300/15 px-1 align-middle font-bold leading-none text-accent-300">
                <Icon name={att.replay ? 'cards' : 'spade'} size={10} className="shrink-0" />
                {att.replay ? '리플레이' : '핸드'}
              </span>
            )}
            {att.text || (att.replay ? '핸드 리플레이를 공유했습니다' : att.hand ? '핸드를 공유했습니다' : '')}
          </p>
          {/* 컴팩트 핸드 프리뷰(검증 #12) — 히어로 카드 최대 2장(+리플레이 보드 소형) 절제된 1행.
              기존 MiniCard 아톰 + parseAttachments 재사용, 새 파서/스키마 없음. 카드가 없으면 렌더 생략(=기존 표시). */}
          {(() => {
            if (!att.hand && !att.replay) return null;
            const hero = (att.replay?.hero ?? att.hand?.hero ?? []).filter(Boolean).slice(0, 2);
            const villain = (att.replay?.villain ?? att.hand?.villain ?? []).filter(Boolean).slice(0, 2);
            const shown = hero.length > 0 ? hero : villain; // 히어로 미기입 핸드는 상대 핸드로 폴백
            const board = (att.replay?.board ?? []).filter(Boolean).slice(0, 5);
            if (shown.length === 0 && board.length === 0) return null;
            // 오너 레퍼런스: 첨부는 카드 안의 라운드 패널로 감싼다(투표 위젯 문법)
            return (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-input border border-border-subtle bg-surface-high/60 px-2 py-1.5">
                {shown.map((cd) => <MiniCard key={cd} id={cd} />)}
                {board.length > 0 && (
                  <>
                    <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border-default" />
                    <span className="flex origin-left scale-90 gap-0.5">
                      {board.map((cd) => <MiniCard key={cd} id={cd} />)}
                    </span>
                  </>
                )}
              </span>
            );
          })()}
          {/* 미디어 — 사진 첨부 글을 목록에서 바로 구분하려는 것 — 지금까진 첨부해도 목록에 아무 표시가 없어 '안 올라갔다'고 오해했다.
              88px 썸네일(=44px 레티나 2x)만 받아 목록에서 원본(최대 1200px)을 내려받지 않는다. */}
          {imgs.length > 0 && (
            // 오너 레퍼런스: 첨부는 카드 안의 라운드 패널로 감싼다(핸드 프리뷰와 같은 문법).
            // 최대 3장까지 나란히, 4장 이상은 마지막 칸에 +N — 목록에서 원본은 절대 내려받지 않는다.
            <div className="mt-1.5 flex w-fit max-w-full gap-1 rounded-input border border-border-subtle bg-surface-high/60 p-1">
              {imgs.slice(0, 3).map((src, i) => (
                <div key={`${src}-${i}`} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[6px] bg-surface-float">
                  <img src={thumbUrl(src, 96)} srcSet={thumbSrcSet(src, 96)}
                    alt="" width={48} height={48} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  {i === 2 && imgs.length > 3 && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xs font-bold text-white">+{imgs.length - 3}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* 반응 푸터 — 조회 → 좋아요 → 댓글, 그리고 추천/비추천(상세와 같은 축).
              좋아요만 인터랙티브(목록에서 바로 누를 수 있는 유일한 액션),
              추천/비추천은 카운트 표시 전용 — 실제 투표는 상세에서(중복 투표 UX 단일화). */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-border-subtle pt-1.5 text-2xs text-ink-muted">
            {(post.viewCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1" aria-label={`조회 ${post.viewCount}`}>
                <Icon name="eye" size={13} strokeWidth={1.6} className="shrink-0" />
                <span className="tabular-nums">{post.viewCount}</span>
              </span>
            )}
            <button
              type="button"
              aria-pressed={!!post.liked}
              aria-label={`좋아요 ${post.likeCount}`}
              onClick={(e) => { e.stopPropagation(); onLike(); }}
              className={`inline-flex items-center gap-1 transition-colors ${post.liked ? 'text-danger-light' : 'hover:text-danger-light'}`}
            >
              <Icon name={post.liked ? 'heart-fill' : 'heart'} size={13} strokeWidth={1.6} className="shrink-0" />
              <span className="tabular-nums">{post.likeCount}</span>
            </button>
            <span className="inline-flex items-center gap-1" aria-label={`댓글 ${post.commentCount}`}>
              <Icon name="comment" size={13} strokeWidth={1.6} className="shrink-0" />
              <span className="tabular-nums">{post.commentCount}</span>
            </span>
            {/* 응원(30점) — 0이면 그리지 않는다. 유료 신호라 '받은 글'에서만 눈에 띄어야 의미가 산다. */}
            {(post.cheerCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-accent-200" aria-label={`응원 ${post.cheerCount}`}>
                <Icon name="chip-stack" size={13} strokeWidth={1.6} className="shrink-0" />
                <span className="tabular-nums font-bold">{post.cheerCount}</span>
              </span>
            )}
            {((post.goodrunCount ?? 0) > 0 || (post.badbeatCount ?? 0) > 0) && (
              <span className="inline-flex items-center gap-2.5">
                <span aria-hidden className="h-3 w-px bg-border-default" />
                <span className="inline-flex items-center gap-0.5 text-emerald-400" aria-label={`추천 ${post.goodrunCount ?? 0}`}>
                  <Icon name="chevron-up" size={13} strokeWidth={2.2} className="shrink-0" />
                  <span className="tabular-nums font-bold">{post.goodrunCount ?? 0}</span>
                </span>
                <span className="inline-flex items-center gap-0.5" aria-label={`비추천 ${post.badbeatCount ?? 0}`}>
                  <Icon name="chevron-down" size={13} strokeWidth={2.2} className="shrink-0" />
                  <span className="tabular-nums">{post.badbeatCount ?? 0}</span>
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}, samePostProps);

// ── 매장 커뮤니티 섹션 ───────────────────────────────────────────────────────

// 내 커뮤니티 관리 — 내가 운영(매장+그룹) + 가입한 그룹(탈퇴). 업주는 홀덤펍 생성도.
function MyCommunitiesAction({ onSelectVenue, onCreated }: {
  onSelectVenue: (id: string) => void;
  onCreated?: () => void;
}) {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [owned, setOwned] = useState<Venue[]>([]);
  const [joined, setJoined] = useState<JoinedGroup[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => {
    getMyOwnedCommunities().then(setOwned).catch(() => {});
    getMyJoinedGroups().then(setJoined).catch(() => {});
  };
  useEffect(() => { reload(); }, []);

  if (!user) return null;
  const isOwner = user.role === 'venue_owner';
  const hasVenue = owned.some((v) => (v.kind ?? 'venue') === 'venue');

  const createVenue = async () => {
    if (!name.trim() || !region.trim()) { toast.show('매장명과 지역은 필수입니다', 'error'); return; }
    setBusy(true);
    try {
      const id = await createMyVenue({ name, region, address });
      toast.show('홀덤펍 커뮤니티를 생성했습니다', 'success');
      setCreateOpen(false); setName(''); setRegion(''); setAddress('');
      await refreshProfile().catch(() => {});
      onCreated?.(); reload(); onSelectVenue(id);
    } catch (e) { toast.show(e instanceof Error ? e.message : '생성 실패', 'error'); }
    finally { setBusy(false); }
  };
  const leave = async (j: JoinedGroup) => {
    if (!confirm(`'${j.group.name}' 커뮤니티에서 탈퇴하시겠습니까?`)) return;
    try { await removeMember(j.membershipId); toast.show('탈퇴했습니다', 'info'); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
  };

  return (
    <div className="rounded-aura border border-accent-400/40 bg-gradient-to-br from-accent-300/[0.08] to-transparent">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-accent-300/15 text-accent-300">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink-primary leading-tight">내 커뮤니티 관리</span>
          <span className="block text-2xs text-ink-muted">내가 운영 {owned.length} · 가입한 그룹 {joined.length}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={['shrink-0 text-accent-300 transition-transform duration-[var(--dur-base)]', open ? 'rotate-180' : ''].join(' ')} aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <div>
            <p className="text-2xs font-bold text-ink-secondary mb-1">내가 운영 ({owned.length})</p>
            {owned.length === 0 ? (
              <p className="text-2xs text-ink-muted">운영 중인 커뮤니티가 없습니다</p>
            ) : (
              <ul className="space-y-1">
                {owned.map((v) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => onSelectVenue(v.id)} className="w-full flex items-center gap-1.5 rounded-input bg-surface-high px-2.5 py-1.5 text-left hover:bg-surface-float">
                      <span className="shrink-0 rounded-badge bg-accent-300/15 px-1.5 py-0.5 text-2xs font-bold text-accent-300">{GROUP_KIND_LABEL[v.kind ?? 'venue']}</span>
                      <span className="text-xs font-semibold text-ink-primary truncate">{v.name}</span>
                      {!v.approved && <span className="ml-auto shrink-0 text-2xs text-ink-muted">승인 대기</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-2xs font-bold text-ink-secondary mb-1">가입한 그룹 ({joined.length})</p>
            {joined.length === 0 ? (
              <p className="text-2xs text-ink-muted">가입한 그룹이 없습니다</p>
            ) : (
              <ul className="space-y-1">
                {joined.map((j) => (
                  <li key={j.membershipId} className="flex items-center gap-1.5 rounded-input bg-surface-high px-2.5 py-1.5">
                    <button type="button" onClick={() => onSelectVenue(j.group.id)} className="flex items-center gap-1.5 min-w-0 flex-1 text-left">
                      <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs font-bold text-ink-secondary">{GROUP_KIND_LABEL[j.group.kind ?? 'other']}</span>
                      <span className="text-xs font-semibold text-ink-primary truncate">{j.group.name}</span>
                      {j.status === 'pending' && <span className="text-2xs text-ink-muted">대기</span>}
                    </button>
                    <button type="button" onClick={() => leave(j)} className="shrink-0 text-2xs text-ink-muted hover:text-danger-light">탈퇴</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {isOwner && !hasVenue && (
            !createOpen ? (
              <button type="button" onClick={() => setCreateOpen(true)} className="w-full rounded-input border border-accent-400/40 py-1.5 text-2xs font-bold text-accent-300">+ 홀덤펍 커뮤니티 생성</button>
            ) : (
              <div className="space-y-2 rounded-input border border-border-default p-2.5">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="매장명 (예: 강남 로얄 홀덤)" className="input w-full text-sm" />
                <select value={region} onChange={(e) => setRegion(e.target.value)} className="input w-full text-sm">
                  <option value="">지역 선택 *</option>
                  {REGION_CHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                  <option value="기타">기타</option>
                </select>
                <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={80} placeholder="주소 (선택)" className="input w-full text-sm" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setCreateOpen(false)} className="btn-ghost text-xs px-3">취소</button>
                  <button type="button" onClick={createVenue} disabled={busy} className="btn-primary text-xs px-4 disabled:opacity-60">생성</button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

const VENUE_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '전체' }, { key: 'venue', label: '홀덤펍' },
  { key: 'dealer_team', label: '딜러팀' }, { key: 'club', label: '동호회' }, { key: 'youtuber', label: '유튜버' },
];
function VenuesSection({
  sortedVenues, query, onQuery, onSelectVenue, onReloadVenues,
}: {
  sortedVenues: { venue: Venue; commentCount: number; latest?: Comment }[];
  query: string;
  onQuery: (q: string) => void;
  onSelectVenue: (id: string) => void;
  onReloadVenues?: () => void;
}) {
  const { user } = useAuth();
  const [kindFilter, setKindFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  // 방문 후기 별점 — 매장 카드에 ⭐4.8(12) 표시(체크인 인증 후기라 신뢰 신호)
  const [ratings, setRatings] = useState<Record<string, VenueRating>>({});
  useEffect(() => { getVenueRatings().then(setRatings).catch(() => {}); }, []);
  const filtered = kindFilter === 'all' ? sortedVenues : sortedVenues.filter((x) => (x.venue.kind ?? 'venue') === kindFilter);
  return (
    <div className="space-y-3">
      {/* 검색 */}
      <div className="relative">
        <input
          type="search" enterKeyHint="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="매장명, 지역으로 검색…"
          className="input pl-9"
        />
        <svg
          width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
          aria-hidden
        >
          <circle cx="8" cy="8" r="5.5" />
          <line x1="12.5" y1="12.5" x2="16" y2="16" />
        </svg>
      </div>

      {/* 종류 필터 + 그룹 만들기 — 오너 지시(2026-08-28): 한 페이지 폭 안에 전부.
          칩 패딩·간격을 글자 폭에 맞춰 최소화(6칩 합 ≈336px ≤ 375px 뷰포트) —
          340px 미만 초소형 기기만 가로 스크롤 폴백. */}
      {/* 오너 지시(2026-08-28): 칩(pill) 형태 제거 — 배경·보더 없는 텍스트 필터.
          활성은 액센트 색+굵기만으로 표시(정렬 안내줄과 같은 텍스트 문법). */}
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-none -mx-page-x px-page-x">
        {VENUE_FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setKindFilter(f.key)}
            className={['shrink-0 whitespace-nowrap py-1 text-xs transition-colors',
              kindFilter === f.key ? 'font-bold text-accent-200' : 'font-semibold text-ink-muted hover:text-ink-primary'].join(' ')}>
            {f.label}
          </button>
        ))}
        {user && (
          <button type="button" onClick={() => setCreateOpen(true)} className="ml-auto shrink-0 whitespace-nowrap py-1 text-xs font-bold text-accent-300 hover:text-accent-200">+ 그룹 만들기</button>
        )}
      </div>

      <p className="text-2xs text-ink-muted text-center py-1">
        홀덤펍·딜러팀·동호회·유튜버 그룹을 선택해 커뮤니티를 이용하세요
      </p>

      {/* 정렬 안내 — 실제 정렬(인증 → 유료광고 → 팔로워순)과 일치 */}
      <div className="flex items-center gap-2 text-2xs text-ink-muted">
        <span>정렬:</span>
        <span className="text-accent-300 font-semibold">인증</span>
        <span className="text-border-strong">→</span>
        <span className="text-accent-300 font-semibold">유료광고</span>
        <span className="text-border-strong">→</span>
        <span className="text-ink-secondary">팔로워순</span>
      </div>

      {/* 리스트 */}
      {filtered.length === 0 ? (
        <EmptyState title="결과가 없습니다" hint="다른 검색어나 카테고리로 시도해 보세요" />
      ) : (
        <ul className="space-y-2">
          {filtered.map(({ venue, commentCount, latest }) => (
            <li key={venue.id}>
              <button
                type="button"
                onClick={() => onSelectVenue(venue.id)}
                className={[
                  'w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-aura border transition-colors duration-[var(--dur-fast)] cursor-pointer active:bg-surface-high',
                  venue.isPaidAd
                    ? 'bg-surface-low border-accent-400/50 shadow-[0_0_12px_rgb(var(--accent-300)/0.22)] hover:border-accent-400'
                    : 'bg-surface-low border-border-default hover:border-border-strong hover:bg-surface-high',
                ].join(' ')}
              >
                {/* 매장 썸네일 — 사진 우선, 없으면 딥톤 이니셜 타일 */}
                <VenueThumb name={venue.name} imageUrl={venue.imageUrl ?? venue.images?.[0]} size="sm" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        {venue.isPaidAd && (
                          <span className="rounded-badge bg-accent-300 px-1.5 py-0.5 text-2xs font-bold text-white leading-none">
                            AD
                          </span>
                        )}
                        {venue.verificationStatus === 'verified' && (
                          <span className="inline-flex items-center gap-0.5 rounded-badge border border-accent-400/50 bg-accent-300/15 px-1.5 py-0.5 text-2xs font-bold text-accent-300 leading-none">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
                            인증
                          </span>
                        )}
                        <p className="text-sm font-semibold text-ink-primary truncate">{venue.name}</p>
                      </div>
                      <p className="text-2xs text-ink-muted truncate">
                        {venue.region}
                        {venue.followerCount !== undefined && (
                          <> · 팔로워 {venue.followerCount.toLocaleString()}</>
                        )}
                        {ratings[venue.id] && (
                          <span className="font-bold tabular-nums text-accent-300"> · <Icon name="star-fill" size={10} className="inline align-[-1px]" />{ratings[venue.id].avg.toFixed(1)}<span className="font-normal text-ink-muted">({ratings[venue.id].count})</span></span>
                        )}
                      </p>
                    </div>
                    {commentCount > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-2xs text-accent-300 font-semibold">
                        댓글 {commentCount}
                      </span>
                    )}
                  </div>

                  {latest && (
                    <div className="mt-1.5 px-2 py-1.5 bg-surface-base/50 rounded-input border-l-2 border-accent-400/40">
                      <p className="text-2xs text-ink-muted leading-tight">
                        <span className={[
                          'font-semibold',
                          latest.isOwner ? 'text-accent-300' : 'text-ink-secondary',
                        ].join(' ')}>
                          {latest.userName}
                          {latest.isOwner && ' (매장)'}
                        </span>
                        <span className="mx-1">·</span>
                        {relativeTime(latest.createdAt)}
                      </p>
                      <p className="text-xs text-ink-secondary line-clamp-1 mt-0.5">
                        {latest.content}
                      </p>
                    </div>
                  )}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="self-center shrink-0 text-ink-muted" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {createOpen && <CreateGroupModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); onReloadVenues?.(); }} />}
    </div>
  );
}

// ── 그룹 만들기 모달(운영자 승인 후 공개) ─────────────────────────────────────
function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('dealer_team');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [joinApproval, setJoinApproval] = useState(true);
  const [sending, setSending] = useState(false);
  const KINDS: GroupKind[] = ['dealer_team', 'club', 'youtuber', 'other'];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.show('그룹 이름을 입력해 주세요', 'error'); return; }
    setSending(true);
    try {
      await createGroup({ name, kind, region, description, joinApproval });
      toast.show('그룹 개설을 신청했습니다. 운영자 승인 후 공개됩니다.', 'success');
      onCreated();
    } catch (err) { toast.show(err instanceof Error ? err.message : '개설 실패', 'error'); }
    finally { setSending(false); }
  };

  return (
    <Modal open onClose={onClose} title="그룹 만들기" maxWidth="sm">
      <form onSubmit={submit} className="p-4 space-y-3">
        <div>
          <span className="block text-2xs text-ink-secondary mb-1">종류</span>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={['rounded-badge border px-3 py-1.5 text-xs font-semibold transition-colors',
                  kind === k ? 'bg-accent-300/15 text-accent-200 border-accent-400/45' : 'bg-surface-high text-ink-secondary border-border-default'].join(' ')}>
                {GROUP_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">그룹 이름 <span className="text-danger">*</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="예: 강남 딜러팀" className="input w-full text-sm" />
        </label>
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">지역 (선택)</span>
          <input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={20} placeholder="예: 서울" className="input w-full text-sm" />
        </label>
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">소개 (선택)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} placeholder="그룹 소개를 적어주세요" className="input w-full resize-none text-sm" />
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={joinApproval} onChange={(e) => setJoinApproval(e.target.checked)} className="accent-accent-300" />
          <span className="text-xs text-ink-secondary">가입 시 내 승인 필요 (해제 시 누구나 즉시 가입)</span>
        </label>
        <p className="text-2xs text-ink-muted">개설하면 내가 매니저가 되며, 운영자 승인 후 목록에 공개됩니다.</p>
        <button type="submit" disabled={sending || !name.trim()} className="btn-primary w-full disabled:opacity-60">{sending ? '신청 중…' : '개설 신청'}</button>
      </form>
    </Modal>
  );
}

// ── 실시간 댓글 (한 줄 라이브 월) ──────────────────────────────────────────────
// 제목 없이 짧게(최대 140자) 올리는 실시간 보드. Supabase Realtime 구독으로 즉시 수신.
function LiveWallSection() {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [draft,    setDraft]    = useState('');
  const [loading,  setLoading]  = useState(true);
  const showSkel = useSkeletonGate(loading); // MO-6C: 200ms 내 도착하면 스켈레톤 생략
  const [sending,  setSending]  = useState(false);

  useEffect(() => {
    let active = true;
    getLiveMessages(50)
      .then((m) => { if (active) setMessages(m); })
      .catch(() => { /* 조회 실패 시 빈 목록 유지 */ })
      .finally(() => { if (active) setLoading(false); });
    // 실시간 수신 — 새 메시지 prepend(id 중복 방지) + 타인 삭제 전파(#19)
    const unsub = subscribeLiveWall(
      (msg) => setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [msg, ...prev])),
      (id) => setMessages((prev) => prev.filter((x) => x.id !== id)),
    );
    return () => { active = false; unsub(); };
  }, []);

  const canDelete = (m: LiveMessage) => !!user && (user.id === m.userId || user.role === 'admin');
  const remove = async (m: LiveMessage) => {
    try { await deleteLiveMessage(m.id); setMessages((prev) => prev.filter((x) => x.id !== m.id)); }
    catch (err) { toast.show(err instanceof Error ? err.message : '삭제에 실패했습니다', 'error'); }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.show('로그인이 필요합니다', 'error');
    const body = draft.trim();
    if (!body) return;
    const check = filterContent(body);
    if (check.blocked) return toast.show(check.reason!, 'error');

    setSending(true);
    try {
      const msg = await addLiveMessage({
        userId:    user.id,
        userName:  user.nickname ?? user.name,
        userRole:  user.role,
        userColor: user.avatarColor,
        content:   body,
      });
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [msg, ...prev]));
      setDraft('');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '전송에 실패했습니다', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      {user ? (
        <form onSubmit={send} className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={140}
            placeholder="한 줄로 빠르게 (최대 140자)"
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="btn-primary px-4 shrink-0 disabled:opacity-50"
          >
            {sending ? '…' : '전송'}
          </button>
        </form>
      ) : (
        <div className="p-2 rounded-input bg-surface-high text-center text-2xs text-ink-muted">
          로그인하면 실시간 댓글을 남길 수 있습니다
        </div>
      )}

      {loading && !showSkel ? null : loading ? (
        // 스켈레톤 — 텍스트 깜빡임 대신 피드 행 형태의 시머 로더
        <ul className="space-y-1" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-input bg-surface-low border border-border-subtle">
              <div className="skeleton h-6 w-6 shrink-0 rounded-full" />
              {/* [DS] MO-6: 실제 행의 줄 높이를 복제(이름행 16px + 본문행 18px) — 교체 시 높이 유지 */}
              <div className="min-w-0 flex-1">
                <div className="skeleton h-4 rounded" style={{ width: `${[42, 55, 48, 60, 44, 52][i]}%` }} />
                <div className="skeleton mt-0.5 h-[18px] rounded" style={{ width: `${[88, 72, 92, 66, 80, 76][i]}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : messages.length === 0 ? (
        <p className="text-center py-12 text-xs text-ink-muted">첫 한 줄을 남겨보세요</p>
      ) : (
        <ul className="space-y-1">
          {messages.map((m) => (
            <li key={m.id} className="flex items-start gap-2 px-2.5 py-1.5 rounded-input bg-surface-low border border-border-subtle">
              <Avatar name={m.userName} src={m.userAvatar} color={m.userColor} size={24} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-2xs">
                  <span className="font-semibold text-ink-primary truncate">{m.userName}</span>
                  {m.userRole === 'venue_owner' && (
                    <span className="font-bold text-accent-300 bg-accent-300/15 px-1 rounded-badge leading-none">매장</span>
                  )}
                  {m.userRole === 'admin' && (
                    <span className="font-bold text-danger-light bg-danger/15 px-1 rounded-badge leading-none">운영자</span>
                  )}
                  <span className="text-ink-muted ml-auto shrink-0">{relativeTime(m.createdAt)}</span>
                  {canDelete(m) && (
                    <button type="button" onClick={() => remove(m)} aria-label="삭제"
                      className="shrink-0 text-ink-muted hover:text-danger-light leading-none">
                      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
                    </button>
                  )}
                </div>
                <p className="text-xs text-ink-primary leading-snug mt-0.5 break-words">{m.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// (A2) App의 무관한 재렌더(알림·바인요청 등)에 커뮤니티 탭이 재렌더되지 않도록 memo. props는 App에서 useCallback/useMemo로 안정화됨.
export default memo(CommunityTab);
