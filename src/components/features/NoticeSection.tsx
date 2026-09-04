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
import Icon, { type IconName } from '../atoms/Icon';
import type { MarketplaceNotice, NoticeType } from '../../api/marketplace';

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

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * 공지 한 줄 — 높이 44px(--row-h-sm)로 게시글 행과 리듬을 맞춘다.
 * 오너 지시(2026-08-27) 유지: 목록은 **제목만** 한 줄, 본문·작성자는 눌러서 상세에서.
 */
export function NoticeRow({ notice, onSelect }: { notice: MarketplaceNotice; onSelect?: (n: MarketplaceNotice) => void }) {
  // 마커는 **정보를 담을 때만** 보여준다. 대부분의 공지는 'pinned' 라 행마다 같은 타일을 반복하면
  // 왼쪽에 보라 기둥만 생기고 알려주는 건 0이다(실측 스크린샷). 기본형은 점, 예외형(이벤트·주의)만
  // 타일 — 자리 폭은 24px 로 고정해 섞여 있어도 제목 시작선이 흔들리지 않는다.
  const body = (
    <>
      {notice.type === 'pinned' ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden>
          <span className="h-1.5 w-1.5 rounded-full bg-accent-400/70" />
        </span>
      ) : (
        <NoticeTile type={notice.type} />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{notice.title}</span>
      <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{relativeTime(notice.createdAt)}</span>
    </>
  );
  const cls = 'flex w-full min-h-[var(--row-h-sm)] items-center gap-2.5 rounded-input px-2.5 py-2 text-left transition-colors';
  return (
    <li>
      {onSelect ? (
        <button type="button" onClick={() => onSelect(notice)}
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
  const rows = limit ? notices.slice(0, limit) : notices;
  return (
    <section className="rounded-aura border card-aura p-3">
      <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad" aria-hidden>
          <Icon name="megaphone" size={14} />
        </span>
        <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
          <h2 className="text-sm font-bold text-ink-primary">공지사항</h2>
          <span className="text-2xs font-semibold tabular-nums text-ink-muted">{notices.length}건</span>
        </div>
        {canWrite && onWrite && (
          <button type="button" onClick={onWrite}
            className="shrink-0 rounded-chip px-2 py-1 text-2xs font-semibold chip-aura">
            + 공지 작성
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-2xs text-ink-muted">{emptyText}</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {rows.map((n) => <NoticeRow key={n.id} notice={n} onSelect={onSelect} />)}
        </ul>
      )}
    </section>
  );
}
