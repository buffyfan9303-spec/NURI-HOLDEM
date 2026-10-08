// src/components/features/community/PostRowCard.tsx
// 커뮤니티 게시글 행/카드 — 한 줄 목록(PostRow)과 피드 카드(PostCard).
//
// 왜 CommunityTab 에서 떼어 냈나(2026-09-11)
//   광고가 '게시글 승격' 으로 바뀌면서, 관리자 화면의 광고 미리보기가 **손님이 실제로 보는 것과
//   같은 컴포넌트**여야 한다는 요구가 생겼다(오너 지시: 관리 화면과 실제 피드가 다른 모양이면 안 된다).
//   미리보기를 따로 그리면 그 순간 표현이 두 벌이 되고, 한쪽만 고쳐지는 사고가 난다 —
//   이 파일이 그 단일 출처다. CommunityTab(손님)과 AdminTab(운영자)이 같은 것을 import 한다.
//
// 광고 표시는 `promoted` prop 하나뿐이다: AD 배지가 붙고 data-* 식별자가 생긴다.
// 그 외 제목·작성자·시간·카테고리·이미지·댓글·조회·첨부·카드 높이·클릭·키보드는 일반 글과 **완전히 같다**.
import { memo } from 'react';
import Icon from '../../atoms/Icon';
import Avatar from '../../atoms/Avatar';
import { MiniCard } from '../../atoms/HandCards';
import { tierCss } from '../../atoms/TierBadge';
import { nickColorVar } from '../../../lib/cosmetics';
import { parseAttachments } from '../../../lib/hand';
import { relativeTime } from '../../../lib/relativeTime';
import { thumbUrl, thumbSrcSet } from '../../../lib/imageUrl';
import { BOARD_FILTER_CATEGORIES, categoryPillClass } from '../../../lib/postCategory';
import { isBumped, type CommunityPost } from '../../../api/community';
import { spotFromEmbed } from './spotShare/embeddedSpot';
import { shareView } from './spotShare/shareView';
import { SpotTableFeed } from './spotShare/SpotTable';

const BOARD_CATEGORIES = BOARD_FILTER_CATEGORIES;

export type PostRowData = { post: CommunityPost; selected?: boolean; mark?: string; titlePts?: number; hot?: boolean; promoted?: boolean; adSlot?: number; nickToken?: string | null };
// UP-18(2026-10-08): nickToken 을 비교에 넣는다 — 빠져 있으면 getNickColors 응답이 늦게 와도 카드가 다시 안 그려져
//   포인트로 산 닉네임 색이 목록 카드에 끝내 안 보였다.
// eslint-disable-next-line react-refresh/only-export-components -- 테스트가 비교 함수를 직접 검증
export const samePostProps = (a: PostRowData, b: PostRowData) =>
  a.post === b.post && a.selected === b.selected && a.mark === b.mark && a.titlePts === b.titlePts && a.hot === b.hot
  && a.promoted === b.promoted && a.adSlot === b.adSlot && a.nickToken === b.nickToken;

export const PostRow = memo(function PostRow({ post, onClick, hot = false, selected = false, mark = '', promoted = false, adSlot }: { post: CommunityPost; onClick: () => void; hot?: boolean; selected?: boolean; mark?: string; titlePts?: number; /** 광고 슬롯에 승격된 글인가 — 배지 하나만 다르고 나머지는 일반 글과 완전히 같다 */ promoted?: boolean; adSlot?: number }) {
  // 화면 밖 행은 브라우저가 렌더를 통째로 건너뛴다(content-visibility) — cv-row-* 는 index.css
  const catLabel = BOARD_CATEGORIES.find((c) => c.id === (post.category ?? 'free'))?.label ?? '자유';
  const { replay, hand } = parseAttachments(post.content);
  // 스팟 글(목록에 끼워 받은 post_spots)도 핸드 첨부와 같은 ♠ 아이콘 하나로만 알린다 — 한 줄 행은 높이가 곧 밀도다.
  const isSpot = !!post.spotEmbed;
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
      // 광고 행 식별자 — e2e 가 문구가 아니라 이 속성으로 찾는다(문구는 글마다 다르다)
      data-promoted-post-id={promoted ? post.id : undefined}
      data-ad-slot={promoted ? adSlot : undefined}
      className={[
        'cv-row-sm min-h-(--row-h-sm) flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border-subtle last:border-b-0 focus:outline-hidden focus-visible:bg-surface-high/60',
        selected ? 'bg-accent-300/10' : 'hover:bg-surface-high/60 active:bg-surface-high',
      ].join(' ')}
    >
      {/* 끌올(100점)은 카테고리 자리를 뺏지 않는다 — 앞에 한 칸을 더 쓴다.
          돈을 낸 표시를 지우면 '올라가긴 했는데 왜 위에 있는지'가 안 보이고, 카테고리를 지우면
          있던 정보가 사라진다(둘 다 남긴다). */}
      {/* 광고 표시 — 숨기지 않는다. 다만 카테고리 배지를 밀어내지 않게 **앞 칸**을 쓴다(고정·끌올과 같은 규칙). */}
      {promoted && (
        <span className="shrink-0 rounded-badge bg-accent-300 px-1 text-2xs font-extrabold leading-none text-white">AD</span>
      )}
      {post.pinnedAt && (
        <span className="shrink-0 rounded-badge bg-surface-high px-1 text-2xs font-extrabold leading-none text-ink-primary">고정</span>
      )}
      {isBumped(post) && (
        <span className="shrink-0 rounded-badge bg-accent-300/15 px-1 text-2xs font-extrabold leading-none text-accent-200">끌올</span>
      )}
      {hot
        ? <span className="shrink-0 rounded-badge bg-danger/15 px-1 text-2xs font-extrabold leading-none tracking-wide text-danger-light">HOT</span>
        : <span className={['shrink-0 rounded-badge px-1 py-0.5 text-2xs font-semibold leading-none', categoryPillClass(post.category)].join(' ')}>{catLabel}</span>}
      {/* 제목**만** 말줄임(…)한다. 배지·[댓글수]·사진수는 고정이다 —
          예전엔 이 칸 전체가 truncate 라 제목이 길면 뒤의 [댓글수]·사진수까지 같이 잘렸다(훑어보는 정보라 잘리면 목록 기능이 사라진다).
          🔴 2026-10-04 오너: "제목이 오른쪽으로 흘러가는 것 제거, 정적으로만 · 글씨를 줄여 조금 더 길게 · 넘치면 …".
            2026-09-05 의 전광판(MarqueeText, 넘칠 때만 흐름)을 걷고 한 줄 정적 말줄임으로 되돌렸다.
            글씨: 제목 14.875 → 13.6px(0.8rem), 작성자·댓글수 12.75 → 11.69px(text-2xs). 행 높이는 --row-h-sm(44px) 그대로(히트영역).
            잘린 제목은 title(툴팁)로 전체를 준다 — 스크린리더는 잘리지 않은 DOM 글자를 그대로 읽는다. */}
      <span className="flex min-w-0 flex-1 items-center">
        {/* 🔴 2026-09-23 오너 "앞에 빨간 불이 왜 있는지 모르겠고" — 제목 앞 NEW 점(24시간 이내 글)을 뺐다.
            Phase 14 에서 pokergosu 목록 밀도를 따라 넣은 것인데, 정보가 0 인 표시였다:
            ① 목록 기본 정렬이 `created_at desc`(api/community.ts:666) 라 '새 글'은 **항상 위에서부터**다.
               점이 켜지는 집합 = 맨 위 몇 줄이라, 위치가 이미 말한 것을 한 번 더 말했을 뿐이다.
               운영 실측(2026-09-23): 전체 7건 중 3건(42.9%)이 24시간 이내 → 맨 위 3줄 연속 점등.
            ② 색이 danger(빨강) 토큰이었다 — 이 앱에서 빨강은 오류·HOT·비추천이라 '새 글'이 경고로 읽혔다.
            되살리려면 색을 danger 밖으로 빼고 **정렬이 말하지 못하는 것**을 먼저 정의해라(예: 마지막 방문 이후).
            ⚠ ScheduleDetailModal 의 대회 Q&A 안읽음 점은 생김새가 같지만 **다른 기능**이다 — 같이 지우지 마라. */}
        <span data-post-title="" title={post.title || post.content.slice(0, 40)}
          className="block min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-ink-primary">
          {post.title || post.content.slice(0, 40)}
        </span>
        {(replay || hand || isSpot) && (
          <span className="ml-1 shrink-0 text-ink-secondary" aria-label={replay ? '리플레이 첨부' : isSpot && !hand ? 'NURI SPOT' : '핸드 첨부'}>
            <Icon name={replay ? 'cards' : 'spade'} size={12} className="inline align-[-2px]" />
          </span>
        )}
        {imgCount > 0 && (
          <span className="ml-1 shrink-0 text-2xs tabular-nums text-ink-muted" aria-label={`사진 ${imgCount}장`}>
            <Icon name="image" size={12} className="inline align-[-2px]" />{imgCount > 1 ? imgCount : ''}
          </span>
        )}
        {post.commentCount > 0 && <span className="ml-1 shrink-0 text-2xs font-bold tabular-nums text-ink-secondary">[{post.commentCount}]</span>}
      </span>
      {/* max-w+truncate: 작성자가 shrink-0 무제한이면 좁은 2-pane 목록·긴 닉네임에서
          flex-1 제목이 0px까지 뭉개진다 — 닉네임이 대신 말줄임(제목 우선, 에펨식 위계) */}
      <span className="shrink-0 max-w-28 truncate text-2xs text-ink-muted">{mark}{post.userName}</span>
      {/* 칭호 칩 미노출(2026-09-18 오너) — 아래 PostCard 주석 참고. 한 줄 행은 폭이 더 빠듯하다. */}
      <span className="hidden shrink-0 text-2xs tabular-nums text-ink-muted sm:inline">{relativeTime(post.createdAt)}</span>
    </li>
  );
}, samePostProps);

/** 스팟 카드의 콘텐츠 박스 추정 높이(px) — 390px 실측으로 맞춘다.
 *  2026-10-02 검토 보완(타원 둘레 배치 · 피드 테이블 높이 150~175 시작): 390 카드 325(대부분) − 패딩·보더 23 ≈ 303 · 320·360 은 311~353.
 *  (구현 1차는 정사각 테이블이라 457 − 23 = 434 였다.) */
const SPOT_CARD_CIS = 303;

export const PostCard = memo(function PostCard({ post, onLike, onClick, hot = false, selected = false, mark = '', nickToken, promoted = false, adSlot }: { post: CommunityPost; onLike: () => void; onClick: () => void; hot?: boolean; selected?: boolean; mark?: string; /** 작성자가 장착한 닉네임 색의 등급 토큰명(--tier-<token>) */ nickToken?: string | null; titlePts?: number; /** 광고 슬롯에 승격된 글인가 — 배지 하나만 다르고 카드 높이·레이아웃은 일반 글과 같다 */ promoted?: boolean; adSlot?: number }) {
  // Nightingale 카드 문법(§20.1) — 헤더(이름/시간 2줄 스택)·제목·본문 2줄 클램프·미디어·반응 푸터 순서 고정.
  // 미디어는 첫 장만 44px 썸네일(88px=레티나 2x 요청)로, 2장 이상은 장수 배지 — 목록에서 원본을 내려받지 않는다.
  const imgs = post.images ?? [];
  const catLabel = BOARD_CATEGORIES.find((c) => c.id === (post.category ?? 'free'))?.label ?? '자유';
  // 핸드/리플레이 첨부 파싱(검증 #12) — 기존 lib/hand 파서 재사용, 실패 시 조용히 원문 표시로 폴백
  let att: ReturnType<typeof parseAttachments>;
  try { att = parseAttachments(post.content); }
  catch { att = { text: post.content, hand: null, replay: null }; }
  // 🔴 2026-10-01 오너 "공유해서 서로서로 보기 좋아야" → 시안 A: 스팟 글은 본문 발췌(=요약 한 줄) 대신 테이블 그림을 보인다.
  //   데이터는 목록 쿼리에 끼워 받은 것(api/community.ts POST_LIST_SELECT) — 글마다 따로 부르지 않는다.
  const embedded = spotFromEmbed(post.spotEmbed);
  const spotV = embedded ? shareView(embedded.spot, embedded.revealVillain && embedded.revealResult) : null;
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
      // 광고 카드 식별자 — e2e 가 문구가 아니라 이 속성으로 찾는다(문구는 글마다 다르다)
      data-promoted-post-id={promoted ? post.id : undefined}
      data-ad-slot={promoted ? adSlot : undefined}
      // 오너 레퍼런스(2026-08-27): 피드는 독립 라운드 카드 스택 — 행 구분선 대신 카드 보더.
      // 오너 리포트(2026-08-28) '밋밋한 단색 배경에 경계선도 없이' →
      // 앵커 카드(ScheduleCard)의 정본 카드 문법을 그대로 가져온다:
      //   card-elev(정적 수직 광원+상단 하이라이트) + border-border-default + shadow-card(헤어라인 링) + bg-surface-low.
      // 실측(다크, surface-base 대비): border-subtle 1.29:1 → border-default 2.06:1, hover strong 3.37:1.
      // card-elev 는 background-image 라 hover 의 background-color 변화와 충돌하지 않는다.
      // 스팟 카드는 일반 글(124px)보다 훨씬 크다 — 화면 밖 추정 높이를 실측값으로 바꿔야 스크롤바가 안 튄다(index.css cv-row-lg 주석).
      style={spotV ? { containIntrinsicSize: `auto ${SPOT_CARD_CIS}px` } : undefined}
      className={[
        // v2 아우라 카드(2026-09-02): card-elev+단색 → card-aura(반투명 면·6% 헤어라인·상단 하이라이트). 선택 상태는 바이올렛 틴트가 덮는다.
        'cv-row-lg min-h-(--row-h-lg) card-aura py-2.5 px-3 rounded-aura border cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-focus/60',
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
                {/* 광고 표시 — 숨기지 않는다. 카테고리 pill(오른쪽)은 그대로 두고 이 줄 맨 앞을 쓴다.
                    별도 glow·애니메이션은 붙이지 않는다: 카드 높이가 일반 글과 같아야 CLS 가 안 생긴다. */}
                {promoted && (
                  <span className="shrink-0 inline-flex items-center rounded-badge bg-accent-300 px-1 font-extrabold leading-none text-white">AD</span>
                )}
                {post.pinnedAt && (
                  <span className="shrink-0 inline-flex items-center rounded-badge bg-surface-high px-1 font-extrabold leading-none text-ink-primary">고정</span>
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
                {/* 🔴 2026-09-18 오너: "우측에 뉴비, 홀덤입문 이런 부분 전량 미노출로 변경 아이디만 보이게".
                    목록에서 칭호 칩이 닉네임 옆 폭을 먹어 **정작 글이 안 보였다**.
                    컴포넌트(atoms/TitleChip)와 그 대비 계약(e2e/design-tokens '칭호 칩')은 **남겨 둔다** —
                    프로필 등 밀도가 낮은 자리에서 다시 쓸 수 있고, 지우면 그 대비 근거도 같이 사라진다.
                    장착 마크(mark)와 닉네임 색은 그대로다 — 오너가 "이모티콘은 보여도 됨" 이라고 했다. */}
                {post.userRole === 'venue_owner' && <span className="shrink-0">· 매장</span>}
                {post.userRole === 'admin' && <span className="shrink-0">· 관리자</span>}
              </p>
            </div>
            {/* 카테고리 pill — CATEGORY_TINTS 고정 팔레트 */}
            <span className={['mt-px shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-semibold leading-none', categoryPillClass(post.category)].join(' ')}>{catLabel}</span>
          </div>
          {/* 제목 — 한 줄 목록(PostRow)과 같은 위계(13.6px). 카드에서 제일 먼저 읽히는 줄.
              PostRow 와 같은 규칙(2026-10-04 오너): 흐르지 않고 한 줄 정적 말줄임 · 전체는 title 로 */}
          {post.title && (
            <span data-post-title="" title={post.title} className="mt-1 block truncate text-sm font-semibold leading-tight text-ink-primary">{post.title}</span>
          )}
          {spotV && <SpotTableFeed v={spotV} />}
          {/* 본문 발췌 — 2줄 클램프 */}
          {/* §T1: 13px 은 사다리 밖 — 본문 미리보기 = t-desc(12.75/19.13). */}
          {!spotV && <p className="t-desc text-ink-secondary line-clamp-2 mt-1 wrap-break-word">
            {(att.hand || att.replay) && (
              <span className="mr-1 inline-flex items-center gap-0.5 rounded-badge bg-accent-300/15 px-1 align-middle font-bold leading-none text-accent-300">
                <Icon name={att.replay ? 'cards' : 'spade'} size={10} className="shrink-0" />
                {att.replay ? '리플레이' : '핸드'}
              </span>
            )}
            {att.text || (att.replay ? '핸드 리플레이를 공유했습니다' : att.hand ? '핸드를 공유했습니다' : '')}
          </p>}
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
            <button
              type="button"
              aria-pressed={!!post.liked}
              aria-label={`좋아요 ${post.likeCount}`}
              onClick={(e) => { e.stopPropagation(); onLike(); }}
              className={`hit inline-flex items-center gap-1 transition-colors ${post.liked ? 'text-danger-light' : 'hover:text-danger-light'}`}
            >
              <Icon name={post.liked ? 'heart-fill' : 'heart'} size={13} strokeWidth={2.2} className="shrink-0" />
              <span className="tabular-nums">{post.likeCount}</span>
            </button>
            <span className="inline-flex items-center gap-1" aria-label={`댓글 ${post.commentCount}`}>
              <Icon name="comment" size={13} strokeWidth={2.2} className="shrink-0" />
              <span className="tabular-nums">{post.commentCount}</span>
            </span>
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
