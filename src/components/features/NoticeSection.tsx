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
import { useMemo, useState } from 'react';
import Icon, { type IconName } from '../atoms/Icon';
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
      <span title={notice.title}
        className="min-w-0 flex-1 break-words text-sm font-semibold text-ink-primary line-clamp-1">
        {notice.title}
      </span>
      <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{when}</span>
    </>
  );
  const cls = 'flex w-full min-h-[var(--row-h-sm)] items-center gap-2.5 rounded-input px-2.5 py-2 text-left transition-colors';
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
 * 공지 섹션 통본 — 커뮤니티·장터·딜러가 이걸 쓴다.
 * 헤더는 CustomerDashboardPage 의 Head 문법(타일 + h2 text-sm + 카운트 + 헤어라인).
 */
export default function NoticeSection({
  notices, onSelect, canWrite, onWrite, limit, emptyText = '등록된 공지가 없습니다',
}: {
  notices: MarketplaceNotice[];
  onSelect?: (n: MarketplaceNotice) => void;
  canWrite?: boolean;
  onWrite?: () => void;
  limit?: number;
  emptyText?: string;
}) {
  // 2026-09-10 오너 지시: 공지 칸이 화면을 먹는다 — **가장 중요한 1건만** 펼쳐 두고 나머지는 접는다.
  //   기능·데이터는 그대로다(접힌 것은 한 번 눌러 전부 볼 수 있다 — 삭제가 아니라 접기).
  //   중요도 = 주의 > 이벤트 > 공지, 같은 유형이면 최신순. 서버 정렬을 바꾸지 않고 여기서만 고른다.
  const [open, setOpen] = useState(false);
  const PRIORITY: Record<NoticeType, number> = { caution: 0, event: 1, pinned: 2 };
  const ranked = useMemo(
    () => [...notices].sort((a, b) =>
      (PRIORITY[a.type] - PRIORITY[b.type]) || (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notices],
  );
  const rows = limit ? ranked.slice(0, limit) : ranked;
  // 타일이 하나라도 섞여 있을 때만 pinned 행이 자리를 비운다(전부 pinned 면 왼쪽 여백 0).
  const reserveMarker = rows.some((r) => r.type !== 'pinned');
  return (
    <section className="rounded-aura border card-aura p-3">
      <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad" aria-hidden>
          <Icon name="megaphone" size={14} />
        </span>
        <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
          <h2 className="text-sm font-bold text-ink-primary">공지사항</h2>
          {/* ⚠ limit 로 잘릴 때 전체 개수만 적으면 거짓이 된다 — 더보기도 스크롤도 없어서
              잘린 공지에 도달할 방법이 아예 없기 때문이다(딜러가 limit={5}).
              잘렸을 때만 '표시/전체' 로 적어 숨은 것이 있음을 드러낸다. */}
          <span className="text-2xs font-semibold tabular-nums text-ink-muted">
            {rows.length < notices.length ? `${rows.length}/${notices.length}건` : `${notices.length}건`}
          </span>
        </div>
        {canWrite && onWrite && (
          <button type="button" onClick={onWrite}
            className="shrink-0 rounded-chip px-2 py-1 text-2xs font-semibold chip-aura">
            + 공지 작성
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-2xs text-ink-muted">{emptyText}</p>
      ) : (
        <>
          <ul className="mt-1 space-y-0.5">
            {(open ? rows : rows.slice(0, 1)).map((n) => (
              <NoticeRow key={n.id} notice={n} onSelect={onSelect} reserveMarker={reserveMarker} />
            ))}
          </ul>
          {rows.length > 1 && (
            <button type="button" onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-0.5 flex w-full items-center justify-center gap-1 rounded-input py-1.5 text-2xs font-semibold text-ink-secondary transition-colors hover:bg-surface-high/50">
              {/* ⚠ 회전(transform) 대신 아이콘을 바꾼다 — 이 섹션은 'transform 애니메이션 0개'가
                  계약이다(e2e/notice-static: 전광판 재발 방지). 회전 트랜지션도 그 계수에 잡힌다. */}
              {open ? '접기' : `나머지 ${rows.length - 1}건 더 보기`}
              <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
            </button>
          )}
        </>
      )}
    </section>
  );
}
