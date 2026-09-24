// src/components/features/BrowseSideRail.tsx — PC 우측 위젯 레일(일정 탐색). 2026-09-24 App.tsx 에서 옮겼다(번들 여유 D:
// 모바일에선 hidden 이고 첫 화면(홈)에 없으므로 shellDeferred 청크로 받는다). 동작·마크업은 옮기기 전과 같다.
import { memo } from 'react';
import Icon from '../atoms/Icon';
import { useBlocks } from '../../contexts/BlockContext';
import type { Schedule } from '../../api/schedules';
import type { CommunityPost } from '../../api/community';

// ── PC 우측 위젯 레일(일정탐색) — 곧 시작·HOT 게시글 (주간 머니인 킹은 2026-09-05 제거) ─────
const BrowseSideRail = memo(function BrowseSideRail({ posts, schedules, onSelectPost, onSelectSchedule }: {
  posts: CommunityPost[];
  schedules: Schedule[];
  onSelectPost: (p: CommunityPost) => void;
  onSelectSchedule: (s: Schedule) => void;
}) {
  const today = new Date().toLocaleDateString('en-CA');
  const { isBlocked } = useBlocks();
  const hot = [...posts]
    .filter((p) => !isBlocked(p.userId) && !p.blinded && (p.viewCount ?? 0) > 0 && Date.now() - new Date(p.createdAt).getTime() < 6 * 3600 * 1000)
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, 3);
  // 곧 시작 — 오늘 이후 가장 가까운 대회 3개(날짜→시간 순)
  const upcoming = [...schedules]
    .filter((s) => s.approved && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    .slice(0, 3);
  const dday = (date: string) => {
    const diff = Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
    return diff === 0 ? '오늘' : diff === 1 ? '내일' : `D-${diff}`;
  };

  // sticky 요소에 reveal을 걸면 view() 진행도가 고정될 수 있어 내부 섹션에 개별 적용
  return (
    <aside className="sticky top-[calc(var(--stack-top,6.0625rem)+0.75rem)] hidden w-72 shrink-0 space-y-3 xl:block">
      {/* 곧 시작하는 대회 — 시간 임박 순 3개 */}
      {upcoming.length > 0 && (
        <section className="reveal overflow-hidden rounded-card border border-border-subtle bg-surface-low">
          <header className="flex items-center gap-1 border-b border-border-subtle px-3 py-2 text-xs font-bold text-ink-secondary"><Icon name="alarm" size={13} className="shrink-0" />곧 시작</header>
          <ul>
            {upcoming.map((s) => (
              <li key={s.id} className="border-b border-border-subtle last:border-b-0">
                <button type="button" onClick={() => onSelectSchedule(s)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-high/70">
                  <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums', s.date === today ? 'bg-accent-300/15 text-accent-300' : 'bg-surface-high text-ink-muted'].join(' ')}>{dday(s.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-primary">{s.title}</span>
                    <span className="block truncate text-xs text-ink-muted">{s.pubName} · {s.startTime}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* HOT 게시글 */}
      {hot.length > 0 && (
        <section className="reveal rounded-card border border-danger/25 bg-surface-low overflow-hidden">
          <header className="flex items-center gap-1 border-b border-border-subtle px-3 py-2 text-xs font-bold text-danger-light"><Icon name="flame" size={13} className="shrink-0" />지금 HOT</header>
          <ul>
            {hot.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onSelectPost(p)}
                  className="flex w-full items-center gap-2 border-b border-border-subtle px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface-high/60">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{p.title || p.content.slice(0, 30)}</span>
                  <span className="flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-ink-muted"><Icon name="eye" size={12} />{p.viewCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 광고 자리 — 비어 있을 땐 문의 안내(수익 슬롯) */}
      <section className="reveal rounded-card border border-dashed border-border-default bg-surface-low/60 px-3 py-3 text-center">
        <p className="flex items-center gap-1 text-xs font-bold text-ink-secondary"><Icon name="megaphone" size={13} className="shrink-0" />광고 자리</p>
        <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">이 자리에 매장·브랜드 광고를 게재할 수 있습니다.<br />내 매장 → 포스터 상단 고정 카드에서 문의하세요.</p>
      </section>
    </aside>
  );
});

export default BrowseSideRail;
