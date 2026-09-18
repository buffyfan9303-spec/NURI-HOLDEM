// 공지사항 — 유형 토큰 + 목록 섹션의 **단일 출처**.
//
// 왜 만들었나(2026-09-04 오너: "공지에 아우라 UI 가 적용되지 않았다"):
//   같은 공지 목록이 커뮤니티·장터·딜러·홈 아코디언 4곳에 **서로 다른 변종**으로 복사돼 있었다.
//   그래서 ① 장터만 유형을 보여주고(그것도 '공/이/주' 한글 글자 원형) 나머지 셋은 유형이 안 보였고,
//   ② 행 높이가 32px 이라 바로 아래 게시글 행(--row-h-sm = 44px)보다 12px 낮아 리듬이 깨졌고,
//   ③ 유형 색이 blue-400/amber-400 하드코딩이라 라이트 테마(흰 모달)에서 대비가 무너졌다.
//   스타일만 4곳 고치면 다섯 번째 변종이 생긴다 — 토큰과 행을 여기 한 곳에 두고 4곳이 이걸 쓴다.
//
// 아우라 v6 문법: 톤은 **타일 그라데이션**이 지고 글자는 ink 토큰을 쓴다(CustomerDashboardPage 의 Head/Tile 패턴).
//   색 텍스트를 쓰지 않으므로 라이트/다크 대비 문제가 구조적으로 생기지 않는다.
//   글로우(.ring-aura-glow)는 쓰지 않는다 — 반복 카드이고, 화면당 1곳 규칙의 주인공이 아니다.
import { useId, useMemo, useState } from 'react';
import Icon, { type IconName } from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import type { MarketplaceNotice, NoticeType } from '../../api/marketplace';
import { relativeTime } from '../../lib/relativeTime';

// 내보내지 않는다 — 이 파일은 컴포넌트 파일이라 상수를 export 하면 Fast Refresh 가 깨진다
// (react-refresh/only-export-components). 톤이 필요하면 NoticeTile·NoticeBadge 를 쓴다.
const NOTICE_TONE: Record<NoticeType, { label: string; icon: IconName; tile: string }> = {
  pinned:  { label: '공지',   icon: 'megaphone', tile: '' },                  // tile-grad 기본(violet)
  event:   { label: '이벤트', icon: 'gift',      tile: 'tile-grad-cyan' },
  caution: { label: '주의',   icon: 'alert',     tile: 'tile-grad-amber' },
};

/** 유형 타일 — 목록 행·상세 공통. 색은 여기서만 정해진다. */
export function NoticeTile({ type, size = 24 }: { type: NoticeType; size?: number }) {
  const tone = NOTICE_TONE[type];
  return (
    <span
      className={['flex shrink-0 items-center justify-center rounded-input tile-grad', tone.tile].join(' ')}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon name={tone.icon} size={Math.round(size * 0.58)} />
    </span>
  );
}

/** 유형 배지 — 타일 + 라벨(상세 모달용). */
export function NoticeBadge({ type }: { type: NoticeType }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <NoticeTile type={type} size={20} />
      <span className="text-2xs font-bold text-ink-secondary">{NOTICE_TONE[type].label}</span>
    </span>
  );
}


/**
 * 공지 한 행 — 최소 높이 44px(--row-h-sm)로 게시글 행과 리듬을 맞춘다.
 * 오너 지시(2026-08-27) 유지: 목록은 **제목만**, 본문·작성자는 눌러서 상세에서.
 *
 * 2026-09-09 오너 스크린샷: 긴 제목이 전광판(MarqueeText)으로 흐르다 앞이 잘린 채 찍혔다
 *   ("URI HOLDEM 정식 오픈 —" · "OLDEM 커뮤니티 이용 안내"). 흐르는 글은 어느 순간을 봐도
 *   앞이나 뒤가 없다 — 공지는 '무엇에 대한 공지'가 첫 글자에서 읽혀야 한다.
 *   → 정적 행. 모바일은 2줄 clamp, PC(lg+)는 1줄 말줄임. 전체 제목은 상세 화면과
 *   접근성 이름(aria-label)·title 툴팁에 있다.
 */
export function NoticeRow({ notice, onSelect, reserveMarker }: {
  notice: MarketplaceNotice;
  onSelect?: (n: MarketplaceNotice) => void;
  /** 이 목록에 이벤트·주의(타일)가 섞여 있는가. 섞여 있을 때만 pinned 행이 24px 를 비워
   *  제목 시작선을 맞춘다. 전부 pinned 인 목록(대부분)은 그 자리를 아예 쓰지 않는다. */
  reserveMarker?: boolean;
}) {
  // 마커는 **정보를 담을 때만** 보여준다. 대부분의 공지는 'pinned' 인데, 예전엔 그 행마다 점을
  // 찍어 왼쪽에 점 기둥만 생기고 알려주는 건 0이었다(오너 지시 2026-09-05 "점 제외").
  // → pinned 는 마커 없음. 예외형(이벤트·주의)만 타일. 섞인 목록에서만 24px 를 비워 시작선을 맞춘다.
  // 375px 실측: 점+gap 을 걷어내 제목 칸이 223px → 257px(가장 긴 공지 가시율 59% → 68%).
  const when = relativeTime(notice.createdAt, { dateAfterDays: 7 });
  const body = (
    <>
      {notice.type === 'pinned'
        ? (reserveMarker ? <span className="h-6 w-6 shrink-0" aria-hidden /> : null)
        : <NoticeTile type={notice.type} />}
      {/* 정적 제목 — **어디서나 한 줄** 말줄임(2026-09-10 오너: "공지사항이 한 줄 이상 되지 않게").
          예전 모바일 2줄 clamp 는 긴 제목마다 행이 두 배가 돼 3건이면 공지 칸이 화면을 먹었다.
          전체 제목은 접근성 이름(aria-label)·title 툴팁·상세 화면에 그대로 있다. 애니메이션·translate 없음. */}
      {/* truncate(nowrap) 가 아니라 line-clamp-1 이다 — 보이는 결과는 같지만 nowrap 은 scrollWidth 를
          한 줄 전체 길이로 부풀려 '제목이 가로로 넘치는가' 가드를 무의미하게 만든다(2026-09-10 실측 652px). */}
      {/* 🔴 2026-09-18 전수 점검: 루트 글자 **200% 확대에서 이 제목이 폭 0~4px 로 찌부러져
          완전히 안 보였다**(날짜 배지만 남아 빈 줄처럼 보임). 원인은 이 span 만 `min-w-0 flex-1` 이고
          형제(마커·날짜·펼치기·작성 버튼)는 전부 `shrink-0` 이라, 글자가 커지면 **줄어들 수 있는 것이
          제목뿐**이라서다. 공지 목록에서 제목은 유일한 내용이다 — 그게 0이 되면 이 줄은 의미가 없다.
        ⚠ 최소 폭을 **rem** 으로 준다. px 로 주면 글자만 커질 때 따라 크지 않아 같은 일이 다시 난다.
        ⚠ 부모 줄을 flex-wrap 으로 열어 둔다 — 그래야 폭이 모자랄 때 **날짜가 아랫줄로 내려가고**
          제목이 자리를 지킨다. 들어갈 땐 안 감싸므로 100% 화면은 종전 그대로 한 줄이다
          (오너 2026-09-10 "공지사항이 한 줄 이상 되지 않게" 는 100% 기준 요구였다.
           글자를 2배로 키운 화면에서 '한 줄'을 지키는 유일한 방법은 글자를 지우는 것뿐이고,
           그건 요구를 지킨 게 아니라 기능을 없앤 것이다). */}
      <span title={notice.title}
        className="min-w-[6rem] flex-1 break-words text-sm font-semibold text-ink-primary line-clamp-1">
        {notice.title}
      </span>
      <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{when}</span>
    </>
  );
  const cls = 'flex w-full min-h-[var(--row-h-sm)] flex-wrap items-center gap-2.5 rounded-input px-2.5 py-2 text-left transition-colors';
  return (
    <li>
      {onSelect ? (
        // aria-label: 시각적으로 잘린 제목과 무관하게 접근성 이름은 항상 전체 제목 + 시각이다.
        <button type="button" onClick={() => onSelect(notice)} aria-label={`${notice.title} · ${when}`}
          className={`${cls} hover:bg-surface-high/50 focus-visible:bg-surface-high/50 focus:outline-none`}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/**
 * 공지 섹션 통본 — 커뮤니티·장터·딜러가 이걸 쓴다(홈 아코디언은 NoticeRow 만 쓴다).
 *
 * N07(2026-09-13): **접힌 한 줄 요약 바**. 예전 '큰 카드 헤더(타일+h2+카운트) + 공지 행 + 더 보기 행' 3단 구조를
 *   `공지 · 대표 제목 한 줄 … · 전체 N건` 하나의 낮은 바(최소 44px, 글자 확대 시 늘어남)로 압축한다.
 *   · 큰 타일·card-aura 그림자·LED 없이 작은 라벨 + 약한 surface. 공지가 일반 글보다 화려하지 않다.
 *   · 대표 제목(NoticeRow 의 button) 클릭 = 그 공지 상세, 펼치기(형제 button) 클릭 = 전체 목록. 중첩 button 없음.
 *   · 펼친 목록은 limit 없이 **전부** — 예전 딜러 limit={5} 는 '5/7건' 이라 적고 나머지에 닿을 길이 없었다.
 *   · sortOrder 1차 키 정렬은 그대로(관리자 ▲▼). 조회 실패는 error 프롭으로 받아 '없음' 과 갈라 그린다.
 *   · 정적 — 전광판·회전 transform 없음(e2e/notice-static). 약관·필수 경고 모달은 이 컴포넌트와 무관하다.
 */
export default function NoticeSection({
  notices, onSelect, canWrite, onWrite, emptyText = '등록된 공지가 없습니다', error = null, onRetry,
}: {
  notices: MarketplaceNotice[];
  onSelect?: (n: MarketplaceNotice) => void;
  canWrite?: boolean;
  onWrite?: () => void;
  emptyText?: string;
  /** 공지 조회 실패 — 있으면 '없음' 대신 재시도 카드를 그린다(패턴 A: `.catch(() => setX([]))` 금지) */
  error?: unknown; onRetry?: () => void;
}) {
  // 2026-09-10 오너 지시: 공지 칸이 화면을 먹는다 — **가장 중요한 1건만** 펼쳐 두고 나머지는 접는다.
  //   기능·데이터는 그대로다(접힌 것은 한 번 눌러 전부 볼 수 있다 — 삭제가 아니라 접기).
  //   중요도 = 주의 > 이벤트 > 공지, 같은 유형이면 최신순. 서버 정렬을 바꾸지 않고 여기서만 고른다.
  const [open, setOpen] = useState(false);
  const listId = useId();
  const PRIORITY: Record<NoticeType, number> = { caution: 0, event: 1, pinned: 2 };
  const ranked = useMemo(
    () => [...notices].sort((a, b) =>
      // 관리자 ▲▼(sort_order)가 1차 키. 이게 없으면 운영자가 정한 순서를 유형 우선순위가 덮어써서
      // 관리자 화면과 손님 화면이 서로 다른 순서를 보여준다(접힘 상태에선 보이는 1건 자체가 달라진다).
      ((b.sortOrder ?? 0) - (a.sortOrder ?? 0))
      || (PRIORITY[a.type] - PRIORITY[b.type]) || (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notices],
  );
  const top = ranked[0];
  const rest = ranked.slice(1);
  // 타일이 하나라도 섞여 있을 때만 pinned 행이 자리를 비운다(전부 pinned 면 왼쪽 여백 0).
  const reserveMarker = ranked.some((r) => r.type !== 'pinned');
  const writeBtn = canWrite && onWrite ? (
    <button type="button" onClick={onWrite} className="shrink-0 rounded-chip px-2 py-1 text-2xs font-semibold chip-aura">
      + 공지 작성
    </button>
  ) : null;
  return (
    <section data-notice-bar className="rounded-input border border-border-subtle bg-surface-low/60">
      {/* 제목은 스크린리더·기존 탐색 계약(e2e 가 heading '공지사항' 으로 섹션을 찾는다)을 위해 남기되 화면에선 작은 라벨만 */}
      <h2 className="sr-only">공지사항</h2>
      {error != null ? (
        <div className="p-2"><LoadErrorCard what="공지" error={error} onRetry={onRetry} compact /></div>
      ) : !top ? (
        // 공지 없음 — 큰 빈 상자를 만들지 않는다. 관리자 작성 진입만 한 줄에.
        <div className="flex min-h-[var(--row-h-sm)] items-center gap-2 px-2.5">
          <span className="text-2xs font-bold text-ink-secondary">공지</span>
          <span className="min-w-0 flex-1 text-2xs text-ink-muted">{emptyText}</span>
          {writeBtn}
        </div>
      ) : (
        <>
          <div className="flex min-h-[var(--row-h-sm)] items-center gap-1 pl-2.5 pr-1">
            <span className="inline-flex shrink-0 items-center gap-1 text-2xs font-bold text-ink-secondary" aria-hidden>
              <Icon name="megaphone" size={12} className="shrink-0" />공지
            </span>
            {/* 대표 1건 — NoticeRow 가 자기 <li><button> 을 그린다(접근성 이름 = 전체 제목 + 시각). */}
            <ul className="min-w-0 flex-1">
              <NoticeRow key={top.id} notice={top} onSelect={onSelect} reserveMarker={reserveMarker} />
            </ul>
            {rest.length > 0 && (
              <button type="button" onClick={() => setOpen((v) => !v)}
                aria-expanded={open} aria-controls={listId} aria-label={open ? '공지 목록 접기' : `공지 전체 ${ranked.length}건 펼치기`}
                className="inline-flex h-11 shrink-0 items-center gap-0.5 rounded-input px-2 text-2xs font-semibold tabular-nums text-ink-secondary transition-colors hover:bg-surface-high/50">
                {/* ⚠ 회전(transform) 대신 아이콘을 바꾼다 — 이 섹션은 'transform 애니메이션 0개'가
                    계약이다(e2e/notice-static: 전광판 재발 방지). 회전 트랜지션도 그 계수에 잡힌다. */}
                {/* ⚠ 360 에서 이 라벨(71.7px)이 제목 칸을 101.5px 까지 밀어 "🛒 중고장터…" 4자만 남겼다
                    (실측 2026-09-18 · 필요 폭 ~230). 좁은 폭에서는 **숫자만** 남긴다 —
                    버튼의 aria-label 이 "공지 전체 N건 펼치기" 를 그대로 말하므로 정보는 안 사라진다. */}
                {open ? '접기' : (<><span className="hidden min-[400px]:inline">전체 </span>{ranked.length}<span className="hidden min-[400px]:inline">건</span></>)}
                <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
              </button>
            )}
            {writeBtn}
          </div>
          {/* 펼친 목록 — 나머지 전부(대표 1건은 위 바에 이미 있다). id 는 펼치기 버튼의 aria-controls. */}
          {open && rest.length > 0 && (
            <ul id={listId} className="space-y-0.5 border-t border-border-subtle px-1 py-1">
              {rest.map((n) => (
                <NoticeRow key={n.id} notice={n} onSelect={onSelect} reserveMarker={reserveMarker} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
