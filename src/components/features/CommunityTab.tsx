import { memo, useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, Fragment, useTransition, startTransition, type ReactNode, type CSSProperties } from 'react';
import { goSubTab } from '../../lib/subTabTransition';
import { centerInRail } from '../../lib/railScroll';
import { promptLogin } from '../../lib/requireLogin';
import { useSkeletonGate } from '../../lib/useSkeletonGate';
import { getActivePromotedPosts, type PromotedPost } from '../../api/ads';
import { getEquippedMarks, getNickColors, isBumped } from '../../api/community';
import { getAppSetting, COMMUNITY_ADS_EVERY_KEY, COMMUNITY_ADS_EVERY_DEFAULT, parseAdsEvery } from '../../api/settings';
import { hotFirst, pinnedFirst, usableAdCount } from '../../lib/pinnedFirst';
import { PostRow, PostCard } from './community/PostRowCard';
import { useTitlePoints } from '../../lib/useTitles';
import { getVenueRatings, type VenueRating } from '../../api/reviews';
import type { Venue, Comment, CommunityPost, LiveMessage, PostCategory, GroupKind, JoinedGroup } from '../../api/community';
import { getLiveMessages, addLiveMessage, deleteLiveMessage, subscribeLiveWall, createMyVenue, createGroup, GROUP_KIND_LABEL, getMyOwnedCommunities, getMyJoinedGroups, removeMember } from '../../api/community';
import { REGION_CHIPS } from './IntegratedSearchBar';
import type { MarketplaceNotice } from '../../api/marketplace';
import NoticeSection from './NoticeSection';
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlockContext';
import { useBackClose } from '../../lib/backstack';
import DealerCommunity from './DealerCommunity';
import TierLeaderboard from './TierLeaderboard';
import CommunityShoutBar from './CommunityShoutBar';
import { useToast } from '../atoms/Toast';
import EmptyState from '../atoms/EmptyState';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { filterContent } from '../../lib/content-filter';
import Avatar from '../atoms/Avatar';
import Icon from '../atoms/Icon';
import VenueThumb from '../atoms/VenueThumb';
import Modal from '../atoms/Modal';
import PostDetailModal from './PostDetailModal';
import SlidingPill from '../atoms/SlidingPill';
import { useIsDesktop } from '../../lib/responsive';
import { BOARD_FILTER_CATEGORIES } from '../../lib/postCategory';
import { relativeTime } from '../../lib/relativeTime';
import { markProgrammaticScroll } from '../../lib/useScrollY';

interface CommunityTabProps {
  /** 장터 화면 임베드 슬롯 — 서브탭을 유지한 채 커뮤니티 안에서 장터를 보여준다 */
  marketSlot?: ReactNode;
  venues: Venue[];
  comments: Comment[];
  posts: CommunityPost[];
  /** 게시글 조회 실패 — 있으면 빈 상태 대신 오류·재시도를 보인다 */
  postsErr?: unknown;
  onRetryPosts?: () => void;
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

// 커뮤니티 섹션 — 홀덤펍 / 게시판 / 실시간 / 랭킹 / 장터 / 딜러 (사용 빈도순 진열)
// 2026-09-10 오너 지시: 업주 전용 커뮤니티('매장') **전량 폐기**. 업주에게만 7번째 탭이 붙어
//   --tab-cols(=5+장터) 계산과 어긋나 레일이 넘쳤고, 그 상태에서 알약이 첫 칸으로 튀었다.
//   이제 최대 6칸이라 계산과 정확히 맞는다. 서버 데이터·API(getOwnerPosts 등)는 남겨 둔다.
// (홀덤 공부는 게시판으로 통합, 도구는 메인 탭으로 분리)
type Section = 'live' | 'board' | 'venues' | 'rank' | 'dealer' | 'market';
// 다른 메인 탭(중고장터 등)으로 갔다 돌아와도 커뮤니티 섹션이 유지되도록 모듈 레벨에 기억
let lastCommunitySection: Section = 'venues';
// 서브탭 진열 순서 — View Transition 방향성(오른쪽 탭 = forward) 판정용.
// market 은 조건부 노출이지만 indexOf 상대 비교라 정적 전체 배열로 충분하다.
const SEC_ORDER: Section[] = ['venues', 'board', 'live', 'rank', 'market', 'dealer'];

// 게시판 카테고리 필터 — 라벨·색표는 src/lib/postCategory.ts 가 단일 출처.
// (글보기 상세에도 같은 뱃지를 넣어야 해서 모듈로 뺐다 — 복사해 두면 언젠가 한쪽만 바뀐다)
const BOARD_CATEGORIES = BOARD_FILTER_CATEGORIES;



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

function CommunityTab({
  venues, comments, posts: rawPosts, postsErr = null, onRetryPosts, notices = [], isAdmin = false, onWriteNotice, onSelectNotice,
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
    if (visitedSecs.has(s) && s !== activeSecRef.current) {
      // 서브섹션 전환 동안만 서브탭 바를 root 스냅샷에서 제외(자기 이름의 스냅샷 — index.css 마커 참조).
      // 상시 name 이면 메인 탭 전환(커뮤니티→홈)에서 old-only 스냅샷이 전환 내내 얼어붙는 잔상을 실측했다.
      // 마커의 켜고 끄기는 goSubTab 이 전환 수명에 맞춰 한다(고정 타이머 금지 — 느린 기기에서 도중에 풀린다).
      // ⚠ 알약 하이라이트(shownSec)도 **전환 안에서** 커밋한다 (2026-09-07 실측).
      //   밖에서 먼저 부르면 React 가 그것을 먼저 flush 해, VT 가 '옛 스냅샷'을 뜨는 시점에
      //   알약이 이미 새 자리에 있다 → 그룹이 B→B 를 보간해 전혀 움직이지 않는다.
      //   (subtab-motion.spec 실측: 키프레임 matrix(…,89,71) → matrix(…,89,71) 로 동일했다.)
      //   전환 안에서 커밋하면 옛=A · 새=B 가 되어 VT 가 알약을 제 손으로 미끄러뜨린다.
      goSubTab('community-sec', SEC_ORDER, activeSecRef.current, s, () => { setShownSec(s); setSectionState(s); });
    } else {
      // 미방문 섹션(첫 진입)은 VT 를 타지 않는다 — 가릴 스냅샷이 없으니 알약은 즉시 하이라이트하고
      // 컨텐츠만 트랜지션으로 넘긴다(장터 lazy 청크에서도 이전 화면이 유지된다).
      setShownSec(s);
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
    // 이 점프는 손짓이 아니다 — 알리지 않으면 하단 탭바 자동숨김이 '확 긁었다'로 읽어 깜빡인다.
    markProgrammaticScroll();
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
  // 데스크탑 게시판 2-pane: 좌측 목록 + 우측 인라인 상세. 모바일은 기존 오버레이 모달(onSelectPost) 사용.
  const isDesktop = useIsDesktop();
  const [boardSelected, setBoardSelected] = useState<CommunityPost | null>(null);
  // 인라인 화살표면 FeedSectionM 의 memo 가 서브탭 전환마다 깨진다 — 참조 고정
  const openWriteFree = useCallback(() => onOpenWrite('free'), [onOpenWrite]);

  // 서브탭 바(가로 스크롤) — 외부 지정(딥링크·대시보드 바로가기)으로 바뀐 활성 탭이 화면 밖이면 보이게 끌어온다
  const secBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // ⚠ scrollIntoView 금지 — 조상 스크롤러를 전부 훑어 **문서(세로)까지** 끌어당긴다(railScroll 주석).
    centerInRail(secBarRef.current?.querySelector<HTMLElement>('[data-pill-active]'), secBarRef.current);
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
    const seq = SEC_ORDER.filter((s) => (s === 'market' ? hasMarket : true));
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
  }, [hasMarket]);

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
        // 3순위: 관리자가 드래그로 정한 노출 순서(display_order) — 이걸 안 보면 관리자 드래그가 죽은 컨트롤이 된다
        const ao = a.venue.displayOrder ?? Number.MAX_SAFE_INTEGER;
        const bo = b.venue.displayOrder ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        // 4순위: followerCount 내림차순
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
      {/* 2026-09-10 오너 지시(이미지 1) — 바가 두껍고 활성 알약이 '큰 사각 카드'로 읽혔다.
          실측 전: 바 64.75px = pt-2(8.5) + 버튼 h-11(46.75) + pb-2(8.5) + 테두리(1).
          실측 후: 바 53.5px  = pt-1(4.25) + 버튼 h-[44px] + pb-1(4.25) + 테두리(1).
          히트 영역은 44px 를 그대로 지킨다(WCAG 2.5.5) — 줄인 것은 트레이 여백과 **시각 알약**뿐이다.
          ⚠ 2026-09-06 의 '알약 40px / 트레이 44px' 지시를 이 지시가 대체한다(같은 오너, 더 최신). */}
      <div data-community-secbar="" className="sticky top-[calc(theme(spacing.header-h)+env(safe-area-inset-top)-0.5rem)] lg:top-[calc(theme(spacing.header-h)+theme(spacing.tab-h)-0.5rem)] z-30 -mx-page-x px-page-x subbar-aura border-b border-border-subtle pt-1 pb-1 lg:pt-1 before:pointer-events-none before:absolute before:inset-x-0 before:-top-4 before:h-4">
        {/* ⚠ 트랙(bg-surface-high) 없이 배경 위에 그대로 띄운다(오너 2회 지적, 2026-09-07).
            세그먼트 트랙이 있으면 그 자체가 '네모칸'으로 읽힌다 — 띠 색을 지면에 맞춰도 박스는 남는다.
            활성 표시는 미끄러지는 알약(pill-active)이 이미 하고 있어 트랙 없이도 어느 탭인지 분명하고,
            같은 앱의 GTO 레인 칩·커뮤니티 그룹 칩이 이미 트랙 없이 배경 위에 떠 있다(그쪽이 '붙어 보인다'는 기준). */}
        {/* --tab-cols = **일반 유저에게 보이는 탭 수**(매장 제외). 칸 폭의 기준이 된다 —
            업주에게 매장이 하나 더 붙어도 앞 칸들이 줄지 않고, 매장만 오른쪽 밖으로 밀려나
            스크롤해야 보인다(오너 2026-09-08). 장터는 슬롯 유무로 빠질 수 있어 숫자를 박지 않는다. */}
        {/* PC 레일 폭 상한(2026-09-10) — 1366/1920 실측에서 칸 하나가 187~200px 로 벌어져
            여섯 메뉴가 화면 끝까지 흩어졌다. max-w-3xl 로 묶어 가운데 정렬하면 칸이 ~128px 로
            고르게 선다. 모바일은 --tab-cols 계산 그대로(상한이 걸리지 않는다).
            ⚠ 래퍼를 새로 씌우지 않는다 — e2e/sliding-pill-hidden 이 '홀덤펍' 버튼의
              parentElement 를 레일로 잡는다(이 div 여야 한다). */}
        <div ref={secBarRef} style={{ '--tab-cols': 5 + (marketSlot ? 1 : 0) } as CSSProperties}
          className="relative flex items-center gap-1 overflow-x-auto scrollbar-none px-0.5 lg:mx-auto lg:max-w-3xl">
          {/* 활성 탭 뒤 글로우(오너 지시 2026-09-05, 2026-09-10 micro 로 조정)
                — pill-active = --grad-cta 채움 + LED 블룸. 블룸 세기는 index.css 의
                  [data-community-secbar] [data-sliding-pill].pill-active 가 **이 바에만** 12px/0.22 로 낮춘다
                  (전역 .pill-active 는 34곳이 공유하므로 건드리지 않는다).
                ⚠ 블룸을 다 보이려고 세로 여백을 키우지 않는다(2026-09-05 실측): overflow 는 **패딩 박스**에서
                  자르므로 여백 4.25px 이면 18px 중 4.25px 만 더 보인다 — 원래 2px 과 눈에 띄는 차이가 없는데
                  트레이만 두꺼워져 '테두리 공백이 크다'는 지적을 받았다. 채움(--grad-cta)이 활성 표시의 본체이고
                  블룸은 그 가장자리를 부드럽게 하는 역할이라, 잘려도 목적은 달성된다.
                하단 메인 탭바와 같은 문법이고, 활성 탭은 정의상 1개라 '글로우는 화면당 1곳' 규칙과 충돌하지 않는다.
                (ring-aura-glow 는 쓰지 않는다 — 카드 후광이고 이 화면엔 이미 유료광고 카드의 강조가 있다) */}
            <SlidingPill containerRef={secBarRef} activeKey={shownSec} className="rounded-[9px] pill-active" />
          <SectionTab active={shownSec === 'venues'} label="홀덤펍" onClick={() => setSection('venues')} />
          <SectionTab active={shownSec === 'board'}  label="게시판" onClick={() => setSection('board')} />
          <SectionTab active={shownSec === 'live'}   label="실시간" onClick={() => setSection('live')} />
          <SectionTab active={shownSec === 'rank'}   label="랭킹"   onClick={() => setSection('rank')} />
          {marketSlot && <SectionTab active={shownSec === 'market'} label="장터" onClick={() => setSection('market')} />}
          <SectionTab active={shownSec === 'dealer'} label="딜러"   onClick={() => setSection('dealer')} />
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
          <LiveWallSectionM visible={section === 'live'} />
        </div>
      )}

      {(visitedSecs.has('board') || section === 'board') && (
        <div data-sec="board" style={{ display: section === 'board' ? undefined : 'none' }}>
          {/* 공지는 게시판 **전체**에 걸리는 안내다. 예전엔 좌측 목록 pane 안에 있어서
              1440px 에서 510px — 화면의 35% 만 쓰고, 바로 오른쪽 660px 는
              '게시글을 선택하면 여기에 상세가 표시됩니다' 빈 자리였다(오너: "공지 칸이 절반이야").
              2-pane **위로** 올려 전체 폭을 쓴다. lg 미만(모바일)은 원래 단일 컬럼이라 변화 없다. */}
          {((notices && notices.length > 0) || isAdmin) && (
            <div className="mb-2">
              <NoticeSection notices={notices ?? []} onSelect={onSelectNotice}
                canWrite={isAdmin} onWrite={onWriteNotice} />
            </div>
          )}
          <div className="lg:flex lg:items-start lg:gap-4">
          {/* 좌측: 목록(압축) — 19rem(304px)은 PostRow 고정 메타(작성자+칭호+시간+조회 ≈368px)보다
              좁아 제목이 0px로 뭉개지고 조회수가 행 밖으로 잘렸다(PC 1280·1536 점검 2026-08-28).
              lg 24rem / xl 30rem: 1280 기준 우측 상세는 692px 확보(max-w-3xl 읽기폭과 근접). */}
          <div className="min-w-0 lg:w-[24rem] lg:shrink-0 xl:w-[30rem]">
            <FeedSectionM
              posts={boardPosts}
              postsErr={postsErr}
              onRetryPosts={onRetryPosts}
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
      className={[
        // flex-[1_0_auto]: 자리가 남으면 균등 분배, 좁으면 내용 폭(일정한 px-2)을 지키고 바가 가로 스크롤
        // §T1: 서브탭 라벨 = t-tab(12.75/600). 활성은 아래 font-bold 가 덮는다.
        // 오너 승인(2026-09-03): px-3 → px-2 — 360px 실측 바 326px 에 6탭(px-2.5 는 344px 로 딜러가 잘렸다 → px-2 ≈ 318px).
        // 44px 탭 타깃(#15): overflow-x-auto 레일이라 .hit/.tap-y-44 의 확장은 세로 오버플로가 된다 →
        // 카테고리 칩 레일과 같은 조리법 — 버튼은 h-[44px] 투명 히트박스, 안쪽 span 이 시각 알약.
        // data-pill-active 는 span 에 둔다(SlidingPill 이 그 박스를 잰다).
        // 알약 32px(모바일)/36px(PC) — 2026-09-10 오너 지시(이미지 1: '활성 pill 이 큰 사각 카드처럼 보임').
        //   히트박스를 46.75 → 44 로 줄여 트레이의 남는 여백을 흡수했다(알약 위아래 6px).
        //   ⚠ rem 이 아니라 px 로 박는다 — 이 앱은 html { font-size: 17px } 이라 h-8 이 34px 이 된다.
        //   이 지시가 2026-09-06 의 '알약 40px' 을 대체한다. 그때 지적이던 '테두리 공백'은
        //   트레이 자체(pt-2 → pt-1)를 줄여서 푼다 — 알약을 키워서 푸는 것이 아니다.
        // 버튼에 relative 를 두지 않는다 — span 의 offsetParent 가 레일이어야 offsetLeft/Top 이 맞는다.
        // flex-none + min-w: 칸 폭이 **탭 개수에 흔들리지 않는다**.
        //   예전 flex-[1_0_auto] 는 남는 공간이 있을 때만 늘어나, 업주에게 매장이 붙어 내용이 넘치는
        //   순간 전부 내용 폭으로 되돌아갔다(실측 375: 59 → 55). 업주만 다른 레이아웃을 보게 된다.
        //   min-w 를 --tab-cols(= 일반 유저 탭 수)로 나눈 몫으로 박으면 일반 유저는 정확히 꽉 차고,
        //   업주는 앞 칸이 그대로인 채 매장만 오른쪽 밖으로 온전히 밀려난다.
        //   gap-1(0.25rem)이 칸 사이 (n-1)개 들어가므로 그만큼 빼고 나눈다.
        //   ⚠ **모바일 한정**이다. PC(lg+)는 폭이 넉넉해 매장까지 다 들어가므로 예전대로 늘려 채운다 —
        //     같은 규칙을 PC 에 걸면 1440 에서 칸이 200px 가 돼 7탭이 넘치고, 넓은 화면에서
        //     굳이 가로 스크롤을 만들게 된다(커뮤니티는 유저 화면이라 모바일이 기준이지만,
        //     업주가 PC 로 볼 때 멀쩡하던 것을 깨뜨릴 이유는 없다).
        'flex-none inline-flex h-[44px] items-center justify-center t-tab whitespace-nowrap',
        'min-w-[calc((100%-(var(--tab-cols)-1)*0.25rem)/var(--tab-cols))] lg:min-w-0 lg:flex-[1_0_auto]',
        'transition-colors',
        'focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
        // 채움 알약(--grad-cta) 위에서는 흰 글자여야 읽힌다 — ink-primary 는 라이트에서 약 2.4:1
        active ? 'text-white font-bold' : 'text-ink-secondary hover:text-ink-primary',
      ].join(' ')}
    >
      {/* 활성 배경은 부모의 공용 SlidingPill 이 미끄러지며 그린다 — 탭별 개별 팝인 제거 */}
      <span
        data-pill-active={active || undefined}
        className="relative inline-flex h-[32px] lg:h-[36px] w-full items-center justify-center px-1 rounded-[9px]"
      >
        {label}
      </span>
    </button>
  );
}

// ── 전역 피드 ────────────────────────────────────────────────────────────────

function FeedSection({
  posts, postsErr = null, onRetryPosts, onOpenWrite, onLike, onSelectPost,
  selectedId,
  placeholder = '나누고 싶은 이야기를 적어보세요…', emptyText = '첫 게시글을 남겨보세요',
  enableCategory = false,
}: {
  posts: CommunityPost[];
  /** 목록 조회 실패(있으면 빈 상태 대신 오류·재시도를 보인다 — 실패를 '글 없음'으로 위장하지 않는다) */
  postsErr?: unknown;
  onRetryPosts?: () => void;
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
  // 커뮤니티 광고 5칸 — 게시판(enableCategory)에서만, 글 N개마다 한 칸씩 삽입.
  // 2026-09-11: 광고 = **승격된 진짜 게시글**. 아래에서 PostRow/PostCard 를 그대로 쓴다.
  const [ads, setAds] = useState<PromotedPost[]>([]);
  // 조회 실패와 '광고 0개'는 다른 상태다 — 실패했다고 일반 피드까지 죽이지는 않는다(광고만 빠진다).
  const [adsErr, setAdsErr] = useState<unknown>(null);
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
  // 광고 목록·빈도 — 관리자가 바꾸면 `nuri:ads-changed` 로 다시 받는다(AdSlotsAdmin 이 쏜다).
  //   이 탭은 최상위라 언마운트되지 않으므로(App.tsx display 토글) 신호 없이는 부팅 때 받은 값을 계속 쓴다.
  const loadAds = useCallback(() => {
    getActivePromotedPosts()
      .then(({ ads: a, error }) => { setAds(a); setAdsErr(error); })
      .catch((e) => { setAds([]); setAdsErr(e); });
    getAppSetting(COMMUNITY_ADS_EVERY_KEY).then((v) => setAdsEvery(parseAdsEvery(v))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!enableCategory) return;
    loadAds();
    window.addEventListener('nuri:ads-changed', loadAds);
    return () => window.removeEventListener('nuri:ads-changed', loadAds);
  }, [enableCategory, loadAds]);

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
  // HOT 은 별도 블록이 아니라 **한 목록** 안에 선다(#10, 오너 결정 2026-09-05): 광고(컨테이너 첫 행) → 고정 → HOT → 끌올 → 최신.
  // 예전엔 HOT 블록이 목록 컨테이너 밖에 먼저 그려져 '광고 맨 위'·'고정 맨 위' 규칙이 둘 다 깨졌다.
  const listSourceRaw = pinHot ? hotFirst(filtered, hotPosts) : filtered;

  // 실제로 **그려질 자리가 있는** 광고만 쓴다.
  //   ads[0] 은 목록이 비어도 맨 위에 선다(오너 2026-09-05). 하지만 ads[k](k≥1)는 아래 map 의
  //   `i % adsEvery === adsEvery - 1` 자리에만 서므로 비광고 글이 adsEvery*k 개 이상이어야 한다.
  //   ⚠ 자리가 없는 광고까지 목록에서 빼면 그 글은 광고로도 목록으로도 안 나와 **화면에서 사라진다**
  //     (2026-09-11 발견: 글 17개에 슬롯 5칸·adsEvery 4 면 1건 소실. 검색에서도 못 찾는다).
  //   남는 광고는 승격을 포기하고 일반 글로 그냥 둔다 — 광고가 한 칸 덜 붙는 편이 글이 사라지는 것보다 낫다.
  const usableAds = useMemo(() => {
    const k = usableAdCount(ads.length, listSourceRaw.length, adsEvery);
    return k === ads.length ? ads : ads.slice(0, k);
  }, [ads, listSourceRaw, adsEvery]);

  // 광고로 승격된 글이 일반 목록에도 있으면 같은 글이 두 번 보인다 — post.id 기준으로 목록에서 뺀다.
  //   (원본 게시글 데이터는 건드리지 않는다. 여기서 '이 화면의 목록'만 걸러 낸다.)
  //   **usableAds 기준**이어야 한다 — 그리지도 않을 광고를 빼면 위 주석의 소실이 난다.
  const adPostIds = useMemo(() => new Set(usableAds.map((a) => a.post.id)), [usableAds]);

  const listSource = useMemo(
    () => (adPostIds.size ? listSourceRaw.filter((p) => !adPostIds.has(p.id)) : listSourceRaw),
    [listSourceRaw, adPostIds],
  );
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
              // 44px 탭 타깃(오너 승인 2026-09-03): overflow-x-auto 레일 안에서는 .tap-y-44 의 ::before(-6px) 가
              // 세로 스크롤 오버플로를 만들므로, 버튼을 h-11 투명 컨테이너로 두고 안의 span 이 32px 시각 칩을 그린다.
              // 레일은 -my-1.5 로 행 높이 32 유지(레이아웃 변화 0).
              <div className="-my-1.5 flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-none">
                {BOARD_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={cat === c.id}
                    onClick={() => { setCat(c.id); setVisible(15); }}
                    className="shrink-0 inline-flex h-11 items-center"
                  >
                    <span className={[
                      'inline-flex items-center h-8 px-3 rounded-chip border text-2xs font-bold leading-none transition-colors',
                      cat === c.id
                        ? 'border-accent-300 bg-accent-300 text-white'
                        : 'chip-aura',
                    ].join(' ')}>
                      {c.label}
                    </span>
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

      {/* 광고 조회 실패는 **운영자에게만** 알린다.
          · 일반 손님에겐 아무 의미가 없고(할 수 있는 게 없다), 피드는 광고 없이 정상 동작한다.
          · 그렇다고 조용히 삼키면 운영자는 '게재했는데 왜 안 보이지'를 영원히 모른다 —
            종전 구현(.catch(() => {}))이 정확히 그 상태였다. 실패와 '광고 0개'를 여기서 가른다. */}
      {enableCategory && adsErr != null && user?.role === 'admin' && (
        <p className="rounded-input border border-amber-500/40 bg-amber-500/[0.06] px-2.5 py-1.5 text-2xs text-amber-200">
          광고를 불러오지 못했습니다 — 게시글 목록은 정상입니다. 관리자 → 노출 관리 → 광고에서 확인해 주세요.
        </p>
      )}

      {/* 포스트 목록 — 게시판 형태 (조밀하게 많이 보이게). HOT 은 목록 안에서 hot 배지로 식별(별도 블록 없음) */}
      {listSource.length === 0 ? (
        <>
          {/* 글이 없어도 광고 칸은 산다 — 광고는 언제나 **맨 위**(오너 2026-09-05).
              PostRow 는 <li> 라 <ul> 로 감싼다(#25). */}
          {usableAds[0] && (
            <ul className="rounded-aura border card-aura overflow-hidden">
              <PostRow post={usableAds[0].post} promoted adSlot={usableAds[0].slot} mark={authorMarks[usableAds[0].post.userId] ?? ''}
                titlePts={titleOf(usableAds[0].post.userId)} selected={usableAds[0].post.id === selectedId}
                onClick={() => onSelectPost(usableAds[0].post)} />
            </ul>
          )}
          {/* 조회 실패 / 아직 글 없음 / 검색 결과 없음 — 셋은 서로 다른 상태다. 실패를 '글 없음'으로 적으면
              손님은 게시판이 비었다고 믿고 떠난다(문서 §5 '빈 결과·조회 실패를 구분'). */}
          {postsErr != null && posts.length === 0 ? (
            <LoadErrorCard error={postsErr} what="게시글" onRetry={onRetryPosts} />
          ) : (
            <div className="rounded-aura border card-aura"><EmptyState icon={<Icon name="edit" />} title={posts.length === 0 ? emptyText : '검색 결과가 없습니다'} /></div>
          )}
        </>
      ) : view === 'compact' ? (
        <>
          <div className="rounded-aura border card-aura overflow-hidden">
            <ul>
              {/* 첫 광고는 언제나 **맨 위**(오너 2026-09-05 "AD 가 중간에 가 있다"). 예전엔 N번째 글 뒤에 첫 광고가
                  들어가 글이 적으면 리스트 끝에, 많으면 중간에 떴다. 이후 광고는 N개마다 다음 칸(ads[1], ads[2]…).
                  ⚠ 광고도 **같은 PostRow** 다 — 배지 하나만 다르다. 클릭·키보드·상세 진입이 전부 일반 글과 같은 경로다. */}
              {usableAds[0] && (
                <PostRow post={usableAds[0].post} promoted adSlot={usableAds[0].slot} mark={authorMarks[usableAds[0].post.userId] ?? ''}
                  titlePts={titleOf(usableAds[0].post.userId)} selected={usableAds[0].post.id === selectedId}
                  onClick={() => onSelectPost(usableAds[0].post)} />
              )}
              {shown.map((p, i) => {
                const ad = usableAds[Math.floor(i / adsEvery) + 1];
                const showAd = i % adsEvery === adsEvery - 1 && !!ad; // 글 N개마다 다음 광고 한 칸(관리자 설정)
                return (
                  <Fragment key={p.id}>
                    <PostRow post={p} hot={pinHot && hotIds.has(p.id)} mark={authorMarks[p.userId] ?? ''} titlePts={titleOf(p.userId)} selected={p.id === selectedId} onClick={() => onSelectPost(p)} />
                    {showAd && (
                      <PostRow post={ad.post} promoted adSlot={ad.slot} mark={authorMarks[ad.post.userId] ?? ''}
                        titlePts={titleOf(ad.post.userId)} selected={ad.post.id === selectedId}
                        onClick={() => onSelectPost(ad.post)} />
                    )}
                  </Fragment>
                );
              })}
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
            {/* 첫 광고는 언제나 맨 위 — 컴팩트 목록과 같은 규칙. 광고도 **같은 PostCard** 다. */}
            {usableAds[0] && (
              <PostCard post={usableAds[0].post} promoted adSlot={usableAds[0].slot} mark={authorMarks[usableAds[0].post.userId] ?? ''}
                nickToken={authorColors[usableAds[0].post.userId]} titlePts={titleOf(usableAds[0].post.userId)}
                selected={usableAds[0].post.id === selectedId}
                onLike={() => onLike(usableAds[0].post.id)} onClick={() => onSelectPost(usableAds[0].post)} />
            )}
            {shown.map((p, i) => {
              const ad = usableAds[Math.floor(i / adsEvery) + 1];
              const showAd = i % adsEvery === adsEvery - 1 && !!ad;
              return (
                <Fragment key={p.id}>
                  <PostCard post={p} hot={pinHot && hotIds.has(p.id)} mark={authorMarks[p.userId] ?? ''} nickToken={authorColors[p.userId]} titlePts={titleOf(p.userId)} selected={p.id === selectedId} onLike={() => onLike(p.id)} onClick={() => onSelectPost(p)} />
                  {showAd && (
                    <PostCard post={ad.post} promoted adSlot={ad.slot} mark={authorMarks[ad.post.userId] ?? ''}
                      nickToken={authorColors[ad.post.userId]} titlePts={titleOf(ad.post.userId)}
                      selected={ad.post.id === selectedId}
                      onLike={() => onLike(ad.post.id)} onClick={() => onSelectPost(ad.post)} />
                  )}
                </Fragment>
              );
            })}
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

// (2026-09-11) AdRow 폐기 — 광고는 이제 게시글이다. 전용 컴포넌트를 두지 않는다.
//   그게 '클릭 안 되는 AD', '피드에서 혼자 이질적인 AD' 의 근본 원인이었다.
//   광고 렌더는 PostRow/PostCard 의 promoted prop 하나로 끝난다(아래).

// 에펨코리아식 한 줄 행 — 제목 크게(타이포 위계), 메타는 작고 연하게. 바이낸스 표 밀도(py-2).
// (A4) 피드 행 memo — 데이터 props만 비교(인라인 onClick/onLike 무시, 같은 post엔 동작 동일). 긴 피드에서 변경된 행만 재렌더.
// PostRow · PostCard 는 공용 모듈로 옮겼다(2026-09-11) — 관리자 광고 미리보기가 같은 컴포넌트를 쓴다.
//   src/components/features/community/PostRowCard.tsx

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
    <div className="rounded-aura border card-aura">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center gap-2.5 rounded-aura px-3 py-2.5 text-left transition-colors duration-[var(--dur-fast)] hover:bg-surface-high/50">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input tile-grad">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink-primary leading-tight">내 커뮤니티 관리</span>
          <span className="block text-2xs text-ink-muted">내가 운영 {owned.length} · 가입한 그룹 {joined.length}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={['shrink-0 text-ink-muted transition-transform duration-[var(--dur-base)]', open ? 'rotate-180' : ''].join(' ')} aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
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
                      <span className="shrink-0 rounded-badge chip-aura px-1.5 py-0.5 text-2xs font-bold">{GROUP_KIND_LABEL[j.group.kind ?? 'other']}</span>
                      <span className="text-xs font-semibold text-ink-primary truncate">{j.group.name}</span>
                      {j.status === 'pending' && <span className="text-2xs text-ink-muted">대기</span>}
                    </button>
                    {/* 글자만 있어 히트영역이 23x16 이었다. 빗나가면 왼쪽 '그룹 열기'가 눌려 화면이 바뀐다 —
                        오탭의 대가가 큰 자리다. 세로는 tap-y-44, 가로는 실제 패딩으로 넓힌다
                        (.hit 는 왼쪽 버튼과 겹친다). */}
                    <button type="button" onClick={() => leave(j)}
                      className="tap-y-44 shrink-0 -my-1 px-2 py-1 text-2xs text-ink-muted hover:text-danger-light">탈퇴</button>
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
      {/* 44px 탭 타깃(오너 승인 2026-09-03): 버튼 h-11, 레일 -my-2.5 로 원래 24px 행 높이 유지.
          부모 space-y-3 이 자식 margin 을 덮어쓰므로 h-6 래퍼 안에서 상쇄한다. */}
      <div className="h-6">
      <div className="-my-2.5 flex items-center gap-3 overflow-x-auto scrollbar-none -mx-page-x px-page-x">
        {VENUE_FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setKindFilter(f.key)}
            className={['shrink-0 inline-flex h-11 items-center whitespace-nowrap text-xs transition-colors',
              kindFilter === f.key ? 'font-bold text-accent-200' : 'font-semibold text-ink-muted hover:text-ink-primary'].join(' ')}>
            {f.label}
          </button>
        ))}
        {user && (
          <button type="button" onClick={() => setCreateOpen(true)} className="ml-auto inline-flex h-11 shrink-0 items-center whitespace-nowrap text-xs font-bold text-accent-300 hover:text-accent-200">+ 그룹 만들기</button>
        )}
      </div>
      </div>

      {/* 섹션 헤더 — GTO 레인 헤더 문법(ToolsPanel): 현재 필터 라벨 + N개 | 정렬 안내, 2행 설명. 카피 3종 원문 그대로 */}
      <div className="border-b border-border-subtle pb-1.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-bold text-ink-primary">{VENUE_FILTERS.find((f) => f.key === kindFilter)?.label ?? '전체'}</h2>
          <span className="text-2xs font-semibold tabular-nums text-ink-muted">{filtered.length}개</span>
          {/* 정렬 안내 — 실제 정렬(인증 → 유료광고 → 팔로워순)과 일치 */}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-2xs text-ink-muted">
            <span>정렬:</span>
            <span className="text-accent-300 font-semibold">인증</span>
            <span className="text-border-strong">→</span>
            <span className="text-accent-300 font-semibold">유료광고</span>
            <span className="text-border-strong">→</span>
            <span className="text-ink-secondary">팔로워순</span>
          </span>
        </div>
        <p className="mt-0.5 text-2xs text-ink-secondary">홀덤펍·딜러팀·동호회·유튜버 그룹을 선택해 커뮤니티를 이용하세요</p>
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
                    : 'card-aura',
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
  const [purpose, setPurpose] = useState('');
  const [sending, setSending] = useState(false);
  const KINDS: GroupKind[] = ['dealer_team', 'club', 'youtuber', 'other'];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.show('그룹 이름을 입력해 주세요', 'error'); return; }
    // 목적이 비면 운영자가 이름·종류만 보고 판단해야 한다 — 승인 심사가 성립하지 않는다.
    if (purpose.trim().length < 10) { toast.show('개설 목적을 10자 이상 적어 주세요', 'error'); return; }
    setSending(true);
    try {
      await createGroup({ name, kind, region, description, joinApproval, purpose });
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
                  kind === k ? 'bg-accent-300/15 text-accent-200 border-accent-400/45' : 'chip-aura'].join(' ')}>
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
        {/* 개설 목적 — 공개 소개와 **분리**한다. 이건 운영자가 승인을 판단하려고 읽는 글이고,
            소개는 사람들에게 보이는 글이다. 하나로 합치면 심사용 문장이 공개 소개에 섞인다. */}
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">
            개설 목적 <span className="text-danger">*</span>
            <span className="ml-1 text-ink-muted">운영자만 봅니다 · 공개되지 않아요</span>
          </span>
          <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={300} rows={3}
            placeholder="어떤 사람들이 무엇을 하려고 모이는 그룹인지 적어 주세요. 운영자가 이 내용으로 승인 여부를 판단합니다."
            className="input w-full resize-none text-sm" />
          <span className="mt-0.5 block text-right text-2xs tabular-nums text-ink-muted">{purpose.trim().length}/300</span>
        </label>

        {/* 가입 방식 — 예전엔 작은 체크박스 하나라 고른 줄 모르고 지나갔다(오너 지적).
            두 갈래를 나란히 놓아 **반드시 고르는 것**으로 만든다. 기본은 종전대로 승인제. */}
        <div>
          <span className="block text-2xs text-ink-secondary mb-1">멤버 가입 방식 <span className="text-danger">*</span></span>
          <div className="grid grid-cols-2 gap-1.5">
            {([[true, '승인제', '내가 수락해야 가입'], [false, '자동 가입', '누구나 바로 가입']] as const).map(([v, label, desc]) => (
              <button key={String(v)} type="button" onClick={() => setJoinApproval(v)}
                aria-pressed={joinApproval === v}
                className={['rounded-input border px-3 py-2 text-left transition-colors duration-[var(--dur-fast)]',
                  joinApproval === v ? 'border-accent-400/45 bg-accent-300/15' : 'chip-aura'].join(' ')}>
                <span className={['block text-xs font-bold', joinApproval === v ? 'text-accent-200' : 'text-ink-primary'].join(' ')}>{label}</span>
                <span className="block text-2xs text-ink-muted">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="text-2xs text-ink-muted">개설하면 내가 매니저가 되며, 운영자 승인 후 목록에 공개됩니다.</p>
        <button type="submit" disabled={sending || !name.trim() || purpose.trim().length < 10} className="btn-primary w-full disabled:opacity-60">{sending ? '신청 중…' : '개설 신청'}</button>
      </form>
    </Modal>
  );
}

// ── 실시간 댓글 (한 줄 라이브 월) ──────────────────────────────────────────────
// 제목 없이 짧게(최대 140자) 올리는 실시간 보드. Supabase Realtime 구독으로 즉시 수신.
// visible: 이 섹션이 실제로 화면에 떠 있는가. 커뮤니티 탭은 유휴 시점에 **숨긴 채** 프리마운트되므로
//   그냥 마운트에 구독하면 라이브를 한 번도 안 본 사용자까지 live_wall 채널을 연다
//   (2026-09-10 용량 점검: 동접 100 기준 실시간 채널이 그만큼 통째로 늘어난다).
function LiveWallSection({ visible }: { visible: boolean }) {
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
    // 실시간 채널은 **보일 때만** 연다 — 조회 1회는 프리마운트에서 해 두어 재방문이 즉시 뜬다.
    const unsub = visible ? subscribeLiveWall(
      (msg) => setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [msg, ...prev])),
      (id) => setMessages((prev) => prev.filter((x) => x.id !== id)),
    ) : null;
    return () => { active = false; unsub?.(); };
  }, [visible]);

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

      {loading ? (
        // 스켈레톤 — 텍스트 깜빡임 대신 피드 행 형태의 시머 로더.
        // 게이트(200ms) 동안에도 자리는 예약한다(MO-B) — null 을 그리면 늦게 끼어든 스켈레톤이 아래(푸터)를 민다.
        //   showSkel 은 pulse 노출만 정한다: invisible = 높이는 그대로, 시머만 숨김(e2e/skeleton-no-shift.spec.ts).
        <ul className={['space-y-1', showSkel ? '' : 'invisible'].join(' ')} aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-input border card-aura">
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
        <div className="rounded-aura border card-aura"><EmptyState icon={<Icon name="comment" />} title="첫 한 줄을 남겨보세요" /></div>
      ) : (
        <ul className="space-y-1">
          {messages.map((m) => (
            <li key={m.id} className="flex items-start gap-2 px-2.5 py-1.5 rounded-input border card-aura">
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
                  {/* ⚠ 삭제 버튼에 `hit`(::after 44px 확장)을 쓰면 안 된다 — 확장된 히트박스가 **본문 첫 줄 위를 덮어**
                      본문을 읽으려 탭한 손가락이 확인 없이 삭제를 실행한다(되돌리기 없음). 실제 박스를 키우고
                      음수 마진으로 행 높이를 되돌린다: 마진박스 16px = 이름행 높이라 스켈레톤 계약(위 h-4+18px)이 유지된다. */}
                  {canDelete(m) && (
                    <button type="button" onClick={() => remove(m)} aria-label="삭제"
                      className="-my-3.5 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-danger-light">
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
