// src/components/features/LiveGamesTab.tsx
// 라이브 — 진행 중(클락 running) 게임 현황 보드. 클락에서 보이는 정보 전부 공개:
// 레벨/블라인드/앤티·남은시간·생존/엔트리·리바인·얼리·애드온·탈락·총스택·평균스택·등록마감·다음브레이크.
import { useEffect, useState } from 'react';
import { getRunningClocks, subscribeRunningClocks, type ClockState, type ClockLevel } from '../../api/clock';
import { wonToMan } from '../../api/ledger';
import { EmptyState } from '../atoms/Skeleton';
import type { Venue } from '../../api/community';
import type { Schedule } from '../../api/schedules';

const now = () => Date.now();
const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(s / 60)}:${pad(s % 60)}`; };
const hms = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`; };
const remainingOf = (s: ClockState) => (s.running && s.endsAt ? new Date(s.endsAt).getTime() - now() : s.remainingMs);

/** 라이브 클락 → 연결 포스터 매칭(공개 데이터만): 같은 매장·같은 날짜의 스케줄(여럿이면 제목 일치 우선). 없으면 null → 매장 폴백. */
function matchSchedule(g: ClockState, schedules: Schedule[]): Schedule | null {
  if (!g.sessionDate) return null;
  const sameDay = schedules.filter((s) => s.venueId === g.venueId && s.date === g.sessionDate);
  if (sameDay.length === 0) return null;
  if (sameDay.length === 1) return sameDay[0];
  const t = (g.title || g.config?.title || '').trim();
  return sameDay.find((s) => (s.title ?? '').trim() === t) ?? sameDay[0];
}

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

export default function LiveGamesTab({ venues, schedules, onVenue, onSchedule, active = true }: { venues: Venue[]; schedules: Schedule[]; onVenue: (id: string) => void; onSchedule: (s: Schedule) => void; active?: boolean }) {
  const [games, setGames] = useState<ClockState[] | null>(null);
  const [, setTick] = useState(0);
  const load = () => getRunningClocks().then(setGames).catch(() => setGames([]));
  // 폴링·1초 틱은 라이브 탭이 보일 때만 — 숨김 시 멈춰 백그라운드 끊김 방지(재진입 시 즉시 갱신). 실시간 구독은 이벤트 기반이라 상시 유지.
  useEffect(() => { if (!active) return; load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => subscribeRunningClocks(load), []); // 실시간: 레벨 전환·통계 즉시 반영
  useEffect(() => { if (!active) return; const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, [active]);

  const nameOf = (id: string) => venues.find((v) => v.id === id)?.name ?? '홀덤펍';

  // 오늘 곧 시작 — 오늘 예정(승인)인데 아직 클락이 안 돌아가는 게임(손님에게 미리 노출)
  const today = new Date().toLocaleDateString('en-CA');
  const liveSchedIds = new Set<string>();
  for (const g of games ?? []) { const s = matchSchedule(g, schedules); if (s) liveSchedIds.add(s.id); }
  const upcoming = schedules
    .filter((s) => s.approved && s.date === today && !liveSchedIds.has(s.id))
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

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
          <div className="space-y-card-gap">
            {(() => {
              // 같은 매장의 여러 게임(메인+사이드)을 한 묶음으로
              const groups: { venueId: string; games: ClockState[] }[] = [];
              for (const g of games) {
                const grp = groups.find((x) => x.venueId === g.venueId);
                if (grp) grp.games.push(g); else groups.push({ venueId: g.venueId, games: [g] });
              }
              const gl = (g: ClockState) => (g.gameSeq > 1 ? `사이드${g.gameSeq - 1}` : '메인');
              return groups.map((grp) => {
                if (grp.games.length === 1) {
                  const g = grp.games[0]; const sched = matchSchedule(g, schedules);
                  return (
                    <ul key={grp.venueId} className="grid grid-cols-1 gap-card-gap">
                      <LiveCard g={g} name={g.gameSeq > 1 ? `${nameOf(g.venueId)} · ${gl(g)}` : nameOf(g.venueId)} sched={sched}
                        onPoster={() => sched && onSchedule(sched)} onVenue={() => onVenue(g.venueId)} />
                    </ul>
                  );
                }
                return (
                  <div key={grp.venueId} className="rounded-card border border-gold-400/25 bg-gold-300/[0.03] p-2 space-y-2">
                    <p className="px-1 text-sm font-bold text-ink-primary">🏠 {nameOf(grp.venueId)} <span className="text-2xs font-normal text-gold-300">· {grp.games.length}게임 동시 진행</span></p>
                    <ul className="grid grid-cols-1 gap-card-gap">
                      {grp.games.map((g) => {
                        const sched = matchSchedule(g, schedules);
                        return <LiveCard key={`${g.venueId}#${g.gameSeq}`} g={g} name={gl(g)} sched={sched}
                          onPoster={() => sched && onSchedule(sched)} onVenue={() => onVenue(g.venueId)} />;
                      })}
                    </ul>
                  </div>
                );
              });
            })()}
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="px-1 text-2xs font-bold text-ink-muted">⏳ 오늘 곧 시작 <span className="text-gold-300">{upcoming.length}</span> <span className="font-normal">— 아직 클락 전</span></p>
            <ul className="grid grid-cols-1 gap-1.5">
              {upcoming.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onSchedule(s)}
                    className="flex w-full items-center gap-2 rounded-card border border-border-subtle bg-surface-low px-3 py-2 text-left transition-colors hover:border-gold-400/40 active:scale-[0.99]">
                    <span className="shrink-0 rounded-badge bg-surface-high px-1.5 py-0.5 text-2xs font-bold tabular-nums text-gold-300">{s.startTime || '예정'}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{s.title}</span>
                    <span className="shrink-0 max-w-[40%] truncate text-2xs text-ink-muted">{nameOf(s.venueId)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-center text-[10px] text-ink-muted">운영 중 클락의 공개 정보입니다 · 30초 자동 갱신.</p>
      </div>
    </main>
  );
}

function LiveCard({ g, name, sched, onPoster, onVenue }: { g: ClockState; name: string; sched: Schedule | null; onPoster: () => void; onVenue: () => void }) {
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
    buyInAmount: null,
  };
  const urgent = g.running && remaining <= 60_000 && !isBreak;

  return (
    <li>
      <button type="button" onClick={sched ? onPoster : onVenue}
        className="w-full rounded-card border border-gold-400/30 bg-surface-low p-3 text-left transition-colors hover:border-gold-400/60 active:scale-[0.99]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-primary">{name}</p>
            <p className="truncate text-2xs text-ink-muted">{g.title || g.config?.title || '토너먼트'}</p>
            {sched && <p className="truncate text-2xs font-semibold text-gold-300/90 mt-0.5">📋 탭하면 대회 포스터로 이동</p>}
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
              <>
                <p className="text-lg font-extrabold leading-tight text-sky-300">BREAK</p>
                {g.running && remaining <= 60_000 && <p className="text-2xs font-bold text-amber-300 animate-pulse">⏰ 곧 재개</p>}
              </>
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

        {/* 바인 금액 · 스타팅/리바인 스택 · 얼리 추가 스택 */}
        {(ls.buyInAmount || g.config?.startStack || g.config?.rebuyStack) ? (
          <div className="mt-2 rounded-input bg-surface-base/60 px-3 py-1.5 text-2xs text-ink-secondary space-y-0.5">
            <p>
              {ls.buyInAmount ? <>바인 <b className="text-gold-300">{wonToMan(ls.buyInAmount)}만</b> · </> : null}
              스타팅 <b className="text-gold-300 tabular-nums">{(g.config?.startStack ?? 0).toLocaleString()}</b> · 리바인 <b className="text-gold-300 tabular-nums">{(g.config?.rebuyStack ?? 0).toLocaleString()}</b>
            </p>
            {((g.config?.earlyBonus ?? 0) > 0 || (g.config?.doubleEarlyBonus ?? 0) > 0) && (
              <p className="text-amber-300">
                얼리 추가{(g.config?.doubleEarlyBonus ?? 0) > 0 && <> · 더블 <b className="tabular-nums">+{(g.config!.doubleEarlyBonus).toLocaleString()}</b></>}{(g.config?.earlyBonus ?? 0) > 0 && <> · 1얼리 <b className="tabular-nums">+{(g.config!.earlyBonus).toLocaleString()}</b></>}
              </p>
            )}
          </div>
        ) : null}

        {/* 엔트리(생존 부가)·리바인·얼리·애드온/탈락 */}
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <Cell label="엔트리" value={`${ls.entries}`} sub={`생존 ${ls.alive}`} accent />
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
      {sched && (
        <button type="button" onClick={onVenue}
          className="mt-1 w-full rounded-input border border-border-subtle py-1.5 text-2xs font-semibold text-ink-muted transition-colors hover:border-gold-400/40 hover:text-gold-300">🏪 매장 페이지 보기</button>
      )}
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
