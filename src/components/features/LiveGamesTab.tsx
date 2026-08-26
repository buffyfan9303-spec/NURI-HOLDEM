// src/components/features/LiveGamesTab.tsx
// 라이브 — 진행 중(클락 running) 게임 현황 보드. 클락에서 보이는 정보 전부 공개:
// 레벨/블라인드/앤티·남은시간·생존/엔트리·리바인·얼리·애드온·탈락·총스택·평균스택·등록마감·다음브레이크.
import { useEffect, useMemo, useState } from 'react';
import { getRunningClocks, subscribeRunningClocks, effectiveLevel, type ClockState, type ClockLevel } from '../../api/clock';
import { matchClockSchedule as matchSchedule, msToRegClose } from '../../lib/regStatus';
import { wonToMan } from '../../api/ledger';
import { EmptyState } from '../atoms/Skeleton';
import Icon from '../atoms/Icon';
import { useSkeletonGate } from '../../lib/useSkeletonGate';
import type { Venue } from '../../api/community';
import type { Schedule } from '../../api/schedules';

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(s / 60)}:${pad(s % 60)}`; };
const hms = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`; };

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

// matchSchedule·msToRegClose 는 src/lib/regStatus.ts 로 승격(UX-1) — browse 카드·상세와 단일 소스 공유.

function levelNumberAt(levels: ClockLevel[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index && i < levels.length; i++) if (levels[i].kind === 'level') n++;
  return n;
}
// index 를 받는 이유: DB 의 current_index 가 낡아 있을 수 있어 '실효 인덱스'로 계산해야 한다.
function msToNextBreak(s: ClockState, index: number, remaining: number): number | null {
  const lv = s.config?.levels ?? []; let acc = remaining;
  for (let i = index + 1; i < lv.length; i++) { if (lv[i].kind === 'break') return acc; acc += lv[i].minutes * 60_000; }
  return null;
}

export default function LiveGamesTab({ venues, schedules, onVenue, onSchedule, onDisplay, active = true, myGames }: { venues: Venue[]; schedules: Schedule[]; onVenue: (id: string) => void; onSchedule: (s: Schedule) => void; onDisplay: (venueId: string, gameSeq: number) => void; active?: boolean; myGames?: { venueId: string; venueName: string; gameSeq: number | null }[] }) {
  const [games, setGames] = useState<ClockState[] | null>(null);
  const showSkel = useSkeletonGate(games === null); // MO-6C: 200ms 내 도착하면 스켈레톤 생략
  const [sortBy, setSortBy] = useState<'default' | 'players' | 'time' | 'distance'>('default'); // 진행 게임 정렬
  const [geo, setGeo] = useState<[number, number] | null>(null); // 손님 위치(거리순 정렬, 위치 권한 시)
  // 실패로 목록을 비우면 순간 끊김 한 번에 '진행 중인 대회 없음'이 된다 —
  // 손님 화면에서 그건 사실이 아닌 정보라, 이미 받은 것이 있으면 그대로 유지한다.
  const load = () => getRunningClocks().then(setGames).catch(() => setGames((cur) => cur ?? []));
  // 폴링·1초 틱은 라이브 탭이 보일 때만 — 숨김 시 멈춰 백그라운드 끊김 방지(재진입 시 즉시 갱신). 실시간 구독은 이벤트 기반이라 상시 유지.
  useEffect(() => { if (!active) return; load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [active]);
  useEffect(() => subscribeRunningClocks(load), []); // 실시간: 레벨 전환·통계 즉시 반영

  // [DS] MO-9B①: venues.find 선형 탐색 제거 — Map 조회(O(게임수×매장수) → O(게임수))
  const venueById = useMemo(() => new Map(venues.map((v) => [v.id, v])), [venues]);
  const nameOf = (id: string) => venueById.get(id)?.name ?? '홀덤펍';

  // [DS] MO-9B②: 파생(Set/filter/sort)을 useMemo 로 — 시간 틱·무관 리렌더에서 재계산하지 않는다
  // 오늘 곧 시작 — 오늘 예정(승인)인데 아직 클락이 안 돌아가는 게임(손님에게 미리 노출)
  const upcoming = useMemo(() => {
    const liveSchedIds = new Set<string>();
    for (const g of games ?? []) { const s = matchSchedule(g, schedules); if (s) liveSchedIds.add(s.id); }
    const today = new Date().toLocaleDateString('en-CA');
    return schedules
      .filter((s) => s.approved && s.date === today && !liveSchedIds.has(s.id))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [games, schedules]);

  // 정렬 — 기본(클락 순) / 남은인원 많은 순 / 시작 시간 빠른 순 / 거리순(지역 근사)
  const sortedGames = useMemo(() => {
    if (!games) return games;
    const aliveOf = (g: ClockState) => g.liveStats?.alive ?? Math.max(0, g.adjEntries - g.eliminations);
    const startOf = (g: ClockState) => matchSchedule(g, schedules)?.startTime || '99:99';
    const regionOf = (g: ClockState) => venueById.get(g.venueId)?.region || matchSchedule(g, schedules)?.region || '';
    const distOf = (g: ClockState) => { if (!geo) return Infinity; const c = centroidOf(regionOf(g)); return c ? haversine(geo, c) : Infinity; };
    return [...games].sort((a, b) =>
      sortBy === 'players' ? aliveOf(b) - aliveOf(a)
        : sortBy === 'time' ? startOf(a).localeCompare(startOf(b))
          : sortBy === 'distance' ? distOf(a) - distOf(b)
            : 0);
  }, [games, schedules, sortBy, geo, venueById]);
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
                    className={['h-7 rounded-[5px] px-2 text-2xs font-bold transition-colors', sortBy === k ? 'bg-accent-300 text-white' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>{l}</button>
                ))}
              </div>
            )}
            <button type="button" onClick={load} className="btn-ghost px-3 text-xs">새로고침</button>
          </div>
        </div>

        {/* 🎯 내 토너 — 바인 승인 후 참가자 시점이 어디에도 없던 격차. 승인된 내 게임이
            진행 중이면 블라인드·평균스택 + 스택 자가입력 → BB·평균 대비 %를 맨 위에. */}
        {myGames && myGames.length > 0 && (games ?? []).length > 0 && (
          <div className="space-y-card-gap">
            {myGames.map((m) => {
              const g = (games ?? []).find((x) => x.venueId === m.venueId && (m.gameSeq == null || x.gameSeq === m.gameSeq));
              if (!g) return null;
              return <MyTournamentCard key={`${m.venueId}:${m.gameSeq ?? 0}`} g={g} venueName={m.venueName}
                onDisplay={() => onDisplay(g.venueId, g.gameSeq ?? 1)} />;
            })}
          </div>
        )}

        {games === null ? (
          showSkel ? (
            // [DS] MO-6: 실제 LiveCard 골격 복제(헤더 2행 + 스탯 박스 + 하단 행) — h-40 임의값 대체
            <div className="space-y-card-gap" aria-hidden aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-card border border-border-subtle bg-surface-low p-3">
                  <div className="skeleton h-5 w-1/2" />
                  <div className="skeleton mt-1 h-4 w-2/3" />
                  <div className="skeleton mt-2 h-[72px]" />
                  <div className="skeleton mt-2 h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : null
        ) : games.length === 0 ? (
          <EmptyState
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M9 2h6" /></svg>}
            title="진행 중인 게임이 없습니다"
            desc="대회 클락이 시작되면 여기에 실시간으로 표시됩니다."
            action={
              // 빈 화면은 막다른 길이 아니라 다음 행동의 출발점(Phase 13-2)
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'browse' }))}
                className="btn-primary inline-flex h-10 items-center gap-1.5 px-4 text-sm font-bold"><Icon name="calendar" size={15} className="shrink-0" />대회 일정 보기</button>
            }
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
                      <LiveCard g={g} name={g.gameSeq > 1 ? `${nameOf(g.venueId)} · ${gl(g)}` : nameOf(g.venueId)} sched={sched} active={active}
                        onPoster={() => sched && onSchedule(sched)} onVenue={() => onVenue(g.venueId)} onDisplay={() => onDisplay(g.venueId, g.gameSeq)} />
                    </ul>
                  );
                }
                return (
                  <div key={grp.venueId} className="rounded-card border border-accent-400/25 bg-accent-300/[0.03] p-2 space-y-2">
                    <p className="flex items-center gap-1.5 px-1 text-sm font-bold text-ink-primary"><Icon name="home" size={14} className="shrink-0 text-accent-300" /><span className="min-w-0 truncate">{nameOf(grp.venueId)}</span> <span className="shrink-0 text-2xs font-normal text-accent-300">· {grp.games.length}게임 동시 진행</span></p>
                    <ul className="grid grid-cols-1 gap-card-gap">
                      {grp.games.map((g) => {
                        const sched = matchSchedule(g, schedules);
                        return <LiveCard key={`${g.venueId}#${g.gameSeq}`} g={g} name={gl(g)} sched={sched} active={active}
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
          <div className="reveal space-y-1.5 pt-1">
            <p className="flex items-center gap-1 px-1 text-2xs font-bold text-ink-muted"><Icon name="clock" size={12} className="shrink-0" />오늘 곧 시작 <span className="text-accent-300">{upcoming.length}</span> <span className="font-normal">— 아직 클락 전</span></p>
            <ul className="grid grid-cols-1 gap-1.5">
              {upcoming.map((s) => (
                <li key={s.id}>
                  {/* Luma 시간 우선 행 문법 — 시간(무채·tabular)이 행의 앵커, 제목이 그다음 */}
                  <button type="button" onClick={() => onSchedule(s)}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-card border border-border-subtle bg-surface-low px-3 py-2 text-left transition-colors hover:border-accent-400/40 active:scale-[0.99]">
                    <span className="text-2xs font-bold tabular-nums text-ink-secondary">{s.startTime || '예정'}</span>
                    <span className="truncate text-xs font-semibold text-ink-primary">{s.title}</span>
                    <span className="max-w-[40%] justify-self-end truncate text-2xs text-ink-muted">{nameOf(s.venueId)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-center text-2xs text-ink-muted">운영 중 클락의 공개 정보입니다 · 30초 자동 갱신.</p>
      </div>
    </main>
  );
}

function LiveCard({ g, name, sched, active = true, onPoster, onVenue, onDisplay }: { g: ClockState; name: string; sched: Schedule | null; active?: boolean; onPoster: () => void; onVenue: () => void; onDisplay: () => void }) {
  // [DS] MO-9B③: 1초 틱을 카운트다운을 실제로 그리는 말단 카드로 격리 —
  // 예전엔 부모가 초마다 setTick 으로 탭 전체(정렬·파생 포함)를 리렌더했다.
  // 멈춘 클락(running=false)의 remaining 은 정적이라 틱 자체를 끈다.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || !g.running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [active, g.running]);
  const lvls = g.config?.levels ?? [];
  // 공개 카드도 손님 기기다 — 쓰기 권한이 없으므로 표시만 보정한다(DB 전진은 운영자 화면 책임).
  const eff = effectiveLevel(g);
  const lv = lvls[eff.index];
  const levelNo = levelNumberAt(lvls, eff.index);
  const isBreak = lv?.kind === 'break';
  const remaining = eff.remainingMs;
  const nextBreak = msToNextBreak(g, eff.index, remaining);
  const regClose = msToRegClose(g, eff.index, remaining);
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
        <div className="min-w-0">
          {/* Luma 시간 우선 행 — 시간·상태(정적 컬러 텍스트)가 위, 매장·대회명(bold)이 아래.
              손님의 실질 질문 '지금 가면 낄 수 있나'의 답(등록가능/마감)도 이 시간 행에 편입. */}
          <p className="flex min-w-0 items-center gap-1.5 text-2xs font-bold leading-none">
            {sched?.startTime && <span className="shrink-0 tabular-nums text-ink-muted">{sched.startTime}</span>}
            <span className={`shrink-0 ${g.running ? 'text-emerald-400' : 'text-amber-400'}`}>{g.running ? 'LIVE' : '일시정지'}</span>
            {regClose !== null && (regClose === 0
              ? <span className="shrink-0 font-semibold text-ink-muted">· 등록마감</span>
              : <span className="shrink-0 font-semibold text-emerald-400">· 등록가능</span>)}
          </p>
          <p className="mt-1 truncate text-sm font-bold text-ink-primary">{name}</p>
          <p className="truncate text-2xs text-ink-muted">{g.title || g.config?.title || '토너먼트'}</p>
          {sched && <p className="mt-0.5 flex items-center gap-1 text-2xs font-semibold text-accent-300/90"><Icon name="image" size={12} className="shrink-0" /><span className="truncate">탭하면 대회 포스터로 이동</span></p>}
        </div>

        {/* 레벨 · 블라인드 · 남은 시간 — FotMob식 고정 그리드: 오른쪽 타이머 칸은 tabular mm:ss 로
            폭이 상수라, 블라인드 자리수가 바뀌어도 초당 갱신되는 이웃 칸이 밀리지 않는다 */}
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-input bg-surface-base/60 px-3 py-2">
          <div className="min-w-0">
            <p className="text-2xs text-ink-muted">{isBreak ? '브레이크' : `레벨 ${levelNo}`}</p>
            {isBreak ? (
              <>
                <p className="text-lg font-extrabold leading-tight text-sky-300">BREAK</p>
                {g.running && remaining <= 60_000 && <p className="text-2xs font-bold text-amber-300">곧 재개</p>}
              </>
            ) : (
              <p className="truncate text-lg font-extrabold leading-tight text-ink-primary tabular-nums">
                {lv ? <>{lv.sb.toLocaleString()}/{lv.bb.toLocaleString()}{lv.ante > 0 && <span className="ml-1 text-2xs text-ink-muted">a{lv.ante.toLocaleString()}</span>}</> : '-'}
              </p>
            )}
          </div>
          <div className="text-right">
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

        {/* 등록마감 · 다음 브레이크 — 반반 고정 그리드: 초당 줄어드는 hh:mm:ss 가 이웃을 밀지 않는다 */}
        <div className="mt-1.5 grid grid-cols-2 items-center gap-2 text-2xs">
          <span className="text-ink-muted">등록마감 <b className={`num tabular-nums ${regClose === 0 ? 'text-rose-300' : 'text-ink-secondary'}`}>{regClose === null ? '—' : regClose === 0 ? '마감' : hms(regClose)}</b></span>
          <span className="text-right text-ink-muted">다음 브레이크 <b className="num tabular-nums text-ink-secondary">{nextBreak === null ? '—' : hms(nextBreak)}</b></span>
        </div>
      </button>
      <div className="mt-1 flex gap-1">
        <button type="button" onClick={onDisplay} title="매장 TV·빔프로젝터용 큰 화면(관전 모드)"
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-input border border-accent-400/40 py-1.5 text-2xs font-bold text-accent-300 transition-colors hover:bg-accent-300/10 active:scale-[0.99]"><Icon name="eye" size={13} className="shrink-0" />큰 화면(관전)</button>
        {sched && (
          <button type="button" onClick={onVenue}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-input border border-border-subtle py-1.5 text-2xs font-semibold text-ink-muted transition-colors hover:border-accent-400/40 hover:text-accent-300"><Icon name="map-pin" size={13} className="shrink-0" />매장 페이지</button>
        )}
      </div>
    </li>
  );
}

function Cell({ label, value, sub, accent, wide }: { label: string; value: string; sub?: string; accent?: boolean; wide?: boolean }) {
  // FotMob식 대칭 칸: 등분 그리드 안에서 각 칸 중앙 고정 + tabular-nums —
  // 초당 갱신으로 자리수가 변해도 칸 폭(그리드 트랙)이 불변이라 이웃이 밀리지 않는다.
  return (
    <div className="min-w-0 rounded-input bg-surface-base/60 px-1 py-1.5 text-center">
      <p className={`truncate font-extrabold leading-none tabular-nums ${wide ? 'text-base' : 'text-sm'} ${accent ? 'text-accent-300' : 'text-ink-primary'}`}>
        {value}{sub && <span className="ml-1 text-2xs font-normal text-ink-muted">{sub}</span>}
      </p>
      <p className="mt-0.5 truncate text-2xs text-ink-muted">{label}</p>
    </div>
  );
}

// ── 🎯 내 토너 카드 — 참가자 시점(스택은 자가입력, 서버 스키마 무변경) ─────────
function MyTournamentCard({ g, venueName, onDisplay }: { g: ClockState; venueName: string; onDisplay: () => void }) {
  const lvls = g.config?.levels ?? [];
  const eff = effectiveLevel(g);
  const lv = lvls[eff.index];
  // 브레이크 중엔 직전 플레이 레벨의 BB 로 환산(클락 AVG BB 병기와 동일 규칙)
  let bb = 0;
  for (let i = eff.index; i >= 0; i--) { const l = lvls[i]; if (l && l.kind === 'level' && l.bb > 0) { bb = l.bb; break; } }
  const ls = g.liveStats;
  const avg = ls?.avgStack ?? 0;
  // 스택은 게임·날짜 단위로 기억 — 토너 중 앱을 들락여도 유지, 다음 날엔 초기화
  const storeKey = `nuri:mystack:${g.venueId}:${g.gameSeq ?? 1}:${new Date().toLocaleDateString('en-CA')}`;
  const [stack, setStack] = useState<number>(() => { try { return Number(localStorage.getItem(storeKey)) || 0; } catch { return 0; } });
  const update = (n: number) => { setStack(n); try { localStorage.setItem(storeKey, String(n)); } catch { /* noop */ } };
  const myBB = bb > 0 && stack > 0 ? Math.round((stack / bb) * 10) / 10 : null;
  const vsAvg = avg > 0 && stack > 0 ? Math.round((stack / avg) * 100) : null;
  const tone = vsAvg == null ? '' : vsAvg >= 100 ? 'text-emerald-400' : vsAvg >= 50 ? 'text-amber-300' : 'text-rose-400';
  return (
    <section className="rounded-card border border-accent-300/60 bg-gradient-to-br from-accent-300/[0.12] to-transparent p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-bold text-accent-300"><Icon name="target" size={14} className="shrink-0" /><span className="truncate">내 토너 · <span className="text-ink-primary">{venueName}</span></span></p>
        <button type="button" onClick={onDisplay} className="btn-ghost shrink-0 px-2.5 py-1 text-2xs">관전 화면</button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-input bg-surface-base/60 px-1 py-1.5">
          <p className="text-2xs text-ink-muted">현재 블라인드</p>
          <p className="text-xs font-extrabold tabular-nums text-ink-primary">{lv && lv.kind === 'level' ? `${lv.sb.toLocaleString()}/${lv.bb.toLocaleString()}` : '휴식'}</p>
        </div>
        <div className="rounded-input bg-surface-base/60 px-1 py-1.5">
          <p className="text-2xs text-ink-muted">평균 스택</p>
          <p className="text-xs font-extrabold tabular-nums text-ink-primary">{avg > 0 ? avg.toLocaleString() : '-'}</p>
        </div>
        <div className="rounded-input bg-surface-base/60 px-1 py-1.5">
          <p className="text-2xs text-ink-muted">생존 / 엔트리</p>
          <p className="text-xs font-extrabold tabular-nums text-ink-primary">{ls ? `${ls.alive} / ${ls.entries}` : '-'}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input type="number" inputMode="numeric" value={stack || ''} placeholder="내 스택 입력"
          onChange={(e) => update(Math.max(0, Number(e.target.value) || 0))}
          className="input h-10 min-w-0 flex-1 text-sm tabular-nums" aria-label="내 스택" />
        <div className="shrink-0 text-right">
          {myBB != null ? (
            <>
              <p className={['text-sm font-extrabold tabular-nums leading-tight', tone].join(' ')}>{myBB}BB</p>
              {vsAvg != null && <p className={['text-2xs font-bold tabular-nums leading-tight', tone].join(' ')}>평균 대비 {vsAvg}%</p>}
            </>
          ) : (
            <p className="text-2xs text-ink-muted">스택을 넣으면<br />BB·평균 대비 표시</p>
          )}
        </div>
      </div>
    </section>
  );
}
