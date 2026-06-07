// src/components/features/LiveGamesTab.tsx
// 라이브 — 진행 중(클락 running) 게임 현황 보드. 30초 자동 갱신. 카드 탭 → 매장 페이지.
// 남은 인원·평균 스택 등은 매장 정산 정보라 비공개(클락 공개 데이터: 현재 레벨/블라인드/탈락/상태).
import { useEffect, useState } from 'react';
import { getRunningClocks, type ClockState } from '../../api/clock';
import { EmptyState } from '../atoms/Skeleton';
import type { Venue } from '../../api/community';

export default function LiveGamesTab({ venues, onVenue }: { venues: Venue[]; onVenue: (id: string) => void }) {
  const [games, setGames] = useState<ClockState[] | null>(null);
  const load = () => getRunningClocks().then(setGames).catch(() => setGames([]));
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const nameOf = (id: string) => venues.find((v) => v.id === id)?.name ?? '홀덤펍';

  return (
    <main className="px-page-x py-section animate-fade-in">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-primary">진행 중 게임 {games ? <span className="text-gold-300">{games.length}</span> : null}</h2>
            <p className="mt-0.5 text-2xs text-ink-muted">지금 클락이 돌아가는 대회를 실시간 확인 (30초 자동 갱신)</p>
          </div>
          <button type="button" onClick={load} className="btn-ghost shrink-0 px-3 text-xs">새로고침</button>
        </div>

        {games === null ? (
          <p className="py-10 text-center text-2xs text-ink-muted">불러오는 중…</p>
        ) : games.length === 0 ? (
          <EmptyState
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M9 2h6" /></svg>}
            title="진행 중인 게임이 없습니다"
            desc="대회 클락이 시작되면 여기에 실시간으로 표시됩니다."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-card-gap">
            {games.map((g) => {
              const lvls = g.config?.levels ?? [];
              const lv = lvls[g.currentIndex];
              const levelNo = lvls.slice(0, g.currentIndex + 1).filter((l) => l.kind === 'level').length;
              const isBreak = lv?.kind === 'break';
              return (
                <li key={g.venueId}>
                  <button type="button" onClick={() => onVenue(g.venueId)}
                    className="w-full rounded-card border border-gold-400/30 bg-surface-low p-3 text-left transition-colors hover:border-gold-400/60 active:scale-[0.99]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink-primary">{nameOf(g.venueId)}</p>
                        <p className="truncate text-2xs text-ink-muted">{g.title || g.config?.title || '토너먼트'}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-badge bg-emerald-500/15 px-2 py-0.5 text-2xs font-bold text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />LIVE
                      </span>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      {isBreak ? (
                        <p className="text-lg font-extrabold text-gold-300">BREAK</p>
                      ) : lv ? (
                        <div>
                          <p className="text-2xs text-ink-muted">레벨 {levelNo}</p>
                          <p className="text-xl font-extrabold leading-tight text-ink-primary tabular-nums">{lv.sb.toLocaleString()}/{lv.bb.toLocaleString()}{lv.ante > 0 ? <span className="ml-1 text-2xs text-ink-muted">a{lv.ante.toLocaleString()}</span> : null}</p>
                        </div>
                      ) : (
                        <p className="text-2xs text-ink-muted">진행 중</p>
                      )}
                      {g.eliminations > 0 && <p className="text-2xs text-ink-muted">탈락 <b className="text-ink-secondary tabular-nums">{g.eliminations}</b></p>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-center text-[10px] text-ink-muted">남은 인원·평균 스택 등 상세는 매장 정산 정보라 공개되지 않습니다.</p>
      </div>
    </main>
  );
}
