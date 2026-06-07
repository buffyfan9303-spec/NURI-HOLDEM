// src/components/features/LiveGamesTab.tsx
// 라이브 — 진행 중(클락 running) 게임 현황 보드. 클락에서 보이는 정보 전부 공개:
// 레벨/블라인드/앤티·남은시간·생존/엔트리·리바인·얼리·애드온·탈락·총스택·평균스택·등록마감·다음브레이크.
import { useEffect, useState } from 'react';
import { getRunningClocks, subscribeRunningClocks, type ClockState, type ClockLevel } from '../../api/clock';
import { EmptyState } from '../atoms/Skeleton';
import type { Venue } from '../../api/community';

const now = () => Date.now();
const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(s / 60)}:${pad(s % 60)}`; };
const hms = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`; };
const remainingOf = (s: ClockState) => (s.running && s.endsAt ? new Date(s.endsAt).getTime() - now() : s.remainingMs);

function levelNumberAt(levels: ClockLevel[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index && i < levels.length; i++) if (levels[i].kind === 'level') n++;
  return n;
}
function msToNextBreak(s: ClockState, remaining: number): number | null {
  const lv = s.config?.levels ?? []; let acc = remaining;
  for (let i = s.currentIndex + 1; i < lv.length; i++) { if (lv[i].kind === 'break') return acc; acc += lv[i].minutes * 60_000; }
  return null;
}
function msToRegClose(s: ClockState, remaining: number): number | null {
  const lv = s.config?.levels ?? []; const target = s.config?.regCloseLevel ?? 0;
  let acc = remaining, num = 0;
  for (let i = 0; i <= s.currentIndex; i++) if (lv[i]?.kind === 'level') num++;
  if (num >= target) return 0;
  for (let i = s.currentIndex + 1; i < lv.length; i++) { if (lv[i].kind === 'level') { num++; if (num >= target) return acc; } acc += lv[i].minutes * 60_000; }
  return null;
}

export default function LiveGamesTab({ venues, onVenue }: { venues: Venue[]; onVenue: (id: string) => void }) {
  const [games, setGames] = useState<ClockState[] | null>(null);
  const [, setTick] = useState(0);
  const load = () => getRunningClocks().then(setGames).catch(() => setGames([]));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  useEffect(() => subscribeRunningClocks(load), []); // 실시간: 레벨 전환·통계 즉시 반영
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  const nameOf = (id: string) => venues.find((v) => v.id === id)?.name ?? '홀덤펍';

  return (
    <main className="px-page-x py-section animate-fade-in">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-primary">진행 중 게임 {games ? <span className="text-gold-300">{games.length}</span> : null}</h2>
            <p className="mt-0.5 text-2xs text-ink-muted">지금 클락이 돌아가는 대회를 실시간 확인 · 블라인드·남은인원·평균스택까지</p>
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
            {games.map((g) => <LiveCard key={g.venueId} g={g} name={nameOf(g.venueId)} onClick={() => onVenue(g.venueId)} />)}
          </ul>
        )}
        <p className="text-center text-[10px] text-ink-muted">운영 중 클락의 공개 정보입니다 · 30초 자동 갱신.</p>
      </div>
    </main>
  );
}

function LiveCard({ g, name, onClick }: { g: ClockState; name: string; onClick: () => void }) {
  const lvls = g.config?.levels ?? [];
  const lv = lvls[g.currentIndex];
  const levelNo = levelNumberAt(lvls, g.currentIndex);
  const isBreak = lv?.kind === 'break';
  const remaining = remainingOf(g);
  const nextBreak = msToNextBreak(g, remaining);
  const regClose = msToRegClose(g, remaining);
  const isAddon = !!g.config?.isAddon;
  const ls = g.liveStats ?? {
    entries: g.adjEntries, rebuys: g.adjRebuys, earlies: g.adjEarlies, addons: g.adjAddons,
    alive: Math.max(0, g.adjEntries - g.eliminations), eliminations: g.eliminations, totalStack: 0, avgStack: 0,
  };
  const urgent = g.running && remaining <= 60_000 && !isBreak;

  return (
    <li>
      <button type="button" onClick={onClick}
        className="w-full rounded-card border border-gold-400/30 bg-surface-low p-3 text-left transition-colors hover:border-gold-400/60 active:scale-[0.99]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-primary">{name}</p>
            <p className="truncate text-2xs text-ink-muted">{g.title || g.config?.title || '토너먼트'}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-badge px-2 py-0.5 text-2xs font-bold ${g.running ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${g.running ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />{g.running ? 'LIVE' : '일시정지'}
          </span>
        </div>

        {/* 레벨 · 블라인드 · 남은 시간 */}
        <div className="mt-2 flex items-center justify-between gap-3 rounded-input bg-surface-base/60 px-3 py-2">
          <div className="min-w-0">
            <p className="text-2xs text-ink-muted">{isBreak ? '브레이크' : `레벨 ${levelNo}`}</p>
            {isBreak ? (
              <p className="text-lg font-extrabold leading-tight text-sky-300">BREAK</p>
            ) : (
              <p className="text-lg font-extrabold leading-tight text-ink-primary tabular-nums">
                {lv ? <>{lv.sb.toLocaleString()}/{lv.bb.toLocaleString()}{lv.ante > 0 && <span className="ml-1 text-2xs text-ink-muted">a{lv.ante.toLocaleString()}</span>}</> : '-'}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xs text-ink-muted">남은 시간</p>
            <p className={`text-2xl font-extrabold leading-none tabular-nums ${urgent ? 'text-rose-400' : 'text-gold-300'}`}>{mmss(Math.max(0, remaining))}</p>
          </div>
        </div>

        {/* 인원·리바인·얼리·애드온/탈락 */}
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <Cell label="생존" value={`${ls.alive}`} sub={`/${ls.entries}`} accent />
          <Cell label="리바인" value={`${ls.rebuys}`} />
          <Cell label="얼리" value={`${ls.earlies}`} />
          <Cell label={isAddon ? '애드온' : '탈락'} value={`${isAddon ? ls.addons : ls.eliminations}`} />
        </div>

        {/* 총 스택 · 평균 스택 */}
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <Cell label="총 스택" value={ls.totalStack ? ls.totalStack.toLocaleString() : '-'} wide />
          <Cell label="평균 스택" value={ls.avgStack ? ls.avgStack.toLocaleString() : '-'} wide accent />
        </div>

        {/* 등록마감 · 다음 브레이크 */}
        <div className="mt-1.5 flex items-center justify-between gap-2 text-2xs">
          <span className="text-ink-muted">등록마감 <b className={regClose === 0 ? 'text-rose-300' : 'text-ink-secondary'}>{regClose === null ? '—' : regClose === 0 ? '마감' : hms(regClose)}</b></span>
          <span className="text-ink-muted">다음 브레이크 <b className="text-ink-secondary">{nextBreak === null ? '—' : hms(nextBreak)}</b></span>
        </div>
      </button>
    </li>
  );
}

function Cell({ label, value, sub, accent, wide }: { label: string; value: string; sub?: string; accent?: boolean; wide?: boolean }) {
  return (
    <div className="rounded-input bg-surface-base/60 px-2 py-1.5 text-center">
      <p className={`font-extrabold leading-none tabular-nums ${wide ? 'text-base' : 'text-sm'} ${accent ? 'text-gold-300' : 'text-ink-primary'}`}>
        {value}{sub && <span className="text-2xs font-normal text-ink-muted">{sub}</span>}
      </p>
      <p className="mt-0.5 text-[10px] text-ink-muted">{label}</p>
    </div>
  );
}
