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

// 지역 중심좌표(근사) — 정확한 주소 좌표가 없어 지역 단위로 "가까운 순" 근사. GPS와 함께 사용.
const REGION_GEO: Record<string, [number, number]> = {
  서울: [37.566, 126.978], 경기: [37.41, 127.52], 인천: [37.456, 126.705], 부산: [35.18, 129.075],
  대구: [35.87, 128.60], 대전: [36.35, 127.385], 광주: [35.16, 126.85], 울산: [35.54, 129.31],
  세종: [36.48, 127.29], 강원: [37.86, 128.31], 충북: [36.80, 127.70], 충남: [36.62, 126.85],
  전북: [35.72, 127.15], 전남: [34.86, 126.99], 경북: [36.30, 128.80], 경남: [35.24, 128.69], 제주: [33.49, 126.50],
};
const centroidOf = (region?: string): [number, number] | null => {
  if (!region) return null;
  for (const k of Object.keys(REGION_GEO)) if (region.includes(k)) return REGION_GEO[k];
  return null;
};
const haversine = (a: [number, number], b: [number, number]): number => {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

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

export default function LiveGamesTab({ venues, schedules, onVenue, onSchedule, onDisplay, active = true }: { venues: Venue[]; schedules: Schedule[]; onVenue: (id: string) => void; onSchedule: (s: Schedule) => void; onDisplay: (venueId: string, gameSeq: number) => void; active?: boolean }) {
  const [games, setGames] = useState<ClockState[] | null>(null);
  const [, setTick] = useState(0);
  const [sortBy, setSortBy] = useState<'default' | 'players' | 'time' | 'distance'>('default'); // 진행 게임 정렬
  const [geo, setGeo] = useState<[number, number] | null>(null); // 손님 위치(거리순 정렬, 위치 권한 시)
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

  // 정렬 — 기본(클락 순) / 남은인원 많은 순 / 시작 시간 빠른 순 / 거리순(지역 근사)
  const aliveOf = (g: ClockState) => g.liveStats?.alive ?? Math.max(0, g.adjEntries - g.eliminations);
  const startOf = (g: ClockState) => matchSchedule(g, schedules)?.startTime || '99:99';
  const regionOf = (g: ClockState) => venues.find((v) => v.id === g.venueId)?.region || matchSchedule(g, schedules)?.region || '';
  const distOf = (g: ClockState) => { if (!geo) return Infinity; const c = centroidOf(regionOf(g)); return c ? haversine(geo, c) : Infinity; };
  const sortedGames = games ? [...games].sort((a, b) =>
    sortBy === 'players' ? aliveOf(b) - aliveOf(a)
      : sortBy === 'time' ? startOf(a).localeCompare(startOf(b))
        : sortBy === 'distance' ? distOf(a) - distOf(b)
          : 0) : games;
  // 거리순 선택 시 위치 권한 요청(최초 1회) — 좌표 도착하면 재정렬, 거부/미지원 시 기본으로 복귀
  const pickSort = (k: 'default' | 'players' | 'time' | 'distance') => {
    if (k === 'distance' && !geo) {
      if (!navigator.geolocation) { setSortBy('default'); return; }
      setSortBy('distance');
      navigator.geolocation.getCurrentPosition(
        (pos) => setGeo([pos.coords.latitude, pos.coords.longitude]),
        () => setSortBy('default'),
        { timeout: 8000, maximumAge: 300000 },
      );
      return;
    }
    setSortBy(k);
  };

  return (
    <main className="px-page-x pt-3 pb-section">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-primary">진행 중 게임 {games ? <span className="text-accent-300">{games.length}</span> : null}</h2>
            <p className="mt-0.5 text-2xs text-ink-muted">지금 클락이 돌아가는 대회를 실시간 확인 · 블라인드·남은인원·평균스택까지</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {games && games.length > 1 && (
              <div className="flex items-center gap-0.5 rounded-input bg-surface-high p-0.5">
                {([['default', '기본'], ['players', '인원'], ['time', '시간'], ['distance', '거리']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => pickSort(k)} title={k === 'players' ? '남은 인원 많은 순' : k === 'time' ? '시작 시간 빠른 순' : k === 'distance' ? '내 위치 기준 가까운 지역 먼저(위치 권한 필요)' : '기본 순'}
                    className={['rounded-[5px] px-1.5 py-1 text-2xs font-bold transition-colors', sortBy === k ? 'bg-accent-300 text-white' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>{l}</button>
                ))}
              </div>
            )}
            <button type="button" onClick={load} className="btn-ghost px-3 text-xs">새로고침</button>
          </div>
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
              for (const g of sortedGames ?? []) {
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
                        onPoster={() => sched && onSchedule(sched)} onVenue={() => onVenue(g.venueId)} onDisplay={() => onDisplay(g.venueId, g.gameSeq)} />
                    </ul>
                  );
                }
                return (
                  <div key={grp.venueId} className="rounded-card border border-accent-400/25 bg-accent-300/[0.03] p-2 space-y-2">
                    <p className="px-1 text-sm font-bold text-ink-primary">🏠 {nameOf(grp.venueId)} <span className="text-2xs font-normal text-accent-300">· {grp.games.length}게임 동시 진행</span></p>
                    <ul className="grid grid-cols-1 gap-card-gap">
                      {grp.games.map((g) => {
                        const sched = matchSchedule(g, schedules);
                        return <LiveCard key={`${g.venueId}#${g.gameSeq}`} g={g} name={gl(g)} sched={sched}
                          onPoster={() => sched && onSchedule(sched)} onVenue={() => onVenue(g.venueId)} onDisplay={() => onDisplay(g.venueId, g.gameSeq)} />;
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
            <p className="px-1 text-2xs font-bold text-ink-muted">⏳ 오늘 곧 시작 <span className="text-accent-300">{upcoming.length}</span> <span className="font-normal">— 아직 클락 전</span></p>
            <ul className="grid grid-cols-1 gap-1.5">
              {upcoming.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onSchedule(s)}
                    className="flex w-full items-center gap-2 rounded-card border border-border-subtle bg-surface-low px-3 py-2 text-left transition-colors hover:border-accent-400/40 active:scale-[0.99]">
                    <span className="shrink-0 rounded-badge bg-surface-high px-1.5 py-0.5 text-2xs font-bold tabular-nums text-accent-300">{s.startTime || '예정'}</span>
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

function LiveCard({ g, name, sched, onPoster, onVenue, onDisplay }: { g: ClockState; name: string; sched: Schedule | null; onPoster: () => void; onVenue: () => void; onDisplay: () => void }) {
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
        className="w-full rounded-card border border-accent-400/30 bg-surface-low p-3 text-left transition-colors hover:border-accent-400/60 active:scale-[0.99]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-primary">{name}</p>
            <p className="truncate text-2xs text-ink-muted">{g.title || g.config?.title || '토너먼트'}</p>
            {sched && <p className="truncate text-2xs font-semibold text-accent-300/90 mt-0.5">📋 탭하면 대회 포스터로 이동</p>}
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
            <p className={`text-2xl font-extrabold leading-none tabular-nums ${urgent ? 'text-rose-400' : 'text-accent-300'}`}>{mmss(Math.max(0, remaining))}</p>
          </div>
        </div>

        {/* 바인 금액 · 스타팅/리바인 스택 · 얼리 추가 스택 */}
        {(ls.buyInAmount || g.config?.startStack || g.config?.rebuyStack) ? (
          <div className="mt-2 rounded-input bg-surface-base/60 px-3 py-1.5 text-2xs text-ink-secondary space-y-0.5">
            <p>
              {ls.buyInAmount ? <>바인 <b className="text-accent-300">{wonToMan(ls.buyInAmount)}만</b> · </> : null}
              스타팅 <b className="text-accent-300 tabular-nums">{(g.config?.startStack ?? 0).toLocaleString()}</b> · 리바인 <b className="text-accent-300 tabular-nums">{(g.config?.rebuyStack ?? 0).toLocaleString()}</b>
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
      <div className="mt-1 flex gap-1">
        <button type="button" onClick={onDisplay} title="매장 TV·빔프로젝터용 큰 화면(관전 모드)"
          className="flex-1 rounded-input border border-accent-400/40 py-1.5 text-2xs font-bold text-accent-300 transition-colors hover:bg-accent-300/10 active:scale-[0.99]">📺 큰 화면(관전)</button>
        {sched && (
          <button type="button" onClick={onVenue}
            className="flex-1 rounded-input border border-border-subtle py-1.5 text-2xs font-semibold text-ink-muted transition-colors hover:border-accent-400/40 hover:text-accent-300">🏪 매장 페이지</button>
        )}
      </div>
    </li>
  );
}

function Cell({ label, value, sub, accent, wide }: { label: string; value: string; sub?: string; accent?: boolean; wide?: boolean }) {
  return (
    <div className="rounded-input bg-surface-base/60 px-2 py-1.5 text-center">
      <p className={`font-extrabold leading-none tabular-nums ${wide ? 'text-base' : 'text-sm'} ${accent ? 'text-accent-300' : 'text-ink-primary'}`}>
        {value}{sub && <span className="text-2xs font-normal text-ink-muted">{sub}</span>}
      </p>
      <p className="mt-0.5 text-[10px] text-ink-muted">{label}</p>
    </div>
  );
}
