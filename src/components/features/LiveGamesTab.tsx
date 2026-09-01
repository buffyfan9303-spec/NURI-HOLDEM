// src/components/features/LiveGamesTab.tsx
// 라이브 — 진행 중(클락 running) 게임 현황 보드.
// 오너 지시(2026-08-28): 라이브 카드를 APIS 라이브 카드 문법으로 재구성 — 3열 스캔 카드.
//   좌 = 큰 생존/엔트리 + PLAYERS · 중앙 = ●LIVE·매장·지역·♥ / 게임명 / Lv·블라인드·REG
//   우 = 시작시각 / BUY-IN 라벨·금액 / GTD·이용권(골드)
// 상세(리바인·평균스택·다음브레이크 등)는 카드 탭 → 관전 클락에서 그대로 제공(표면 간소화, 기능 보존).
import { useEffect, useMemo, useState } from 'react';
import { getRunningClocks, subscribeRunningClocks, effectiveLevel, type ClockState, type ClockLevel } from '../../api/clock';
import { matchClockSchedule as matchSchedule, msToRegClose } from '../../lib/regStatus';
import { EmptyState } from '../atoms/Skeleton';
import Icon from '../atoms/Icon';
import { useSkeletonGate } from '../../lib/useSkeletonGate';
import { goSubTab } from '../../lib/subTabTransition';

/** 진행 게임 정렬 칩 — 진열 순서가 곧 하위 탭 전환 방향(forward/back)의 기준이다. */
const LIVE_SORT_ORDER = ['default', 'players', 'time', 'distance'] as const;
const LIVE_SORT_LABEL: Record<(typeof LIVE_SORT_ORDER)[number], string> = {
  default: '기본', players: '인원', time: '시간', distance: '거리',
};
import { getMyFollowedVenueIds, type Venue } from '../../api/community';
import type { Schedule } from '../../api/schedules';

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
// 레지마감 잔여 ms → '몇 분' 라벨(오너 지정 1급 정보 — 분 단위 표기)
function regMinLabel(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60 > 0 ? `${min % 60}분` : ''}`.trim() : `${min}분`;
}

// ── 축약 표기(APIS 문법) ─────────────────────────────────────────────────────
// 규칙 하나만 지킨다: **축약이 값을 바꾸면 축약하지 않는다.** 카드가 좁다고 참가비 55,000 을
// '5만'으로 반올림해 보여주면 그건 압축이 아니라 오정보다(§28 — 참가비·GTD 는 가격 고지).
// 소수 2자리까지 되돌려 원값과 일치할 때만 축약하고, 아니면 전체 숫자를 그대로 쓴다.
function unitOrNull(n: number, div: number): string | null {
  const r = Math.round((n / div) * 100) / 100;
  return Math.abs(r * div - n) < 0.5 ? String(r) : null;
}
/** 금액 축약 — 50000→'5만' · 55000→'5.5만' · 60,000,000→'6000만' · 100,000,000→'1억' · 나머지는 원 숫자 */
function wonShort(n: number): string {
  if (n >= 100_000_000) { const s = unitOrNull(n, 100_000_000); if (s) return `${s}억`; }
  if (n >= 10_000) { const s = unitOrNull(n, 10_000); if (s) return `${s}만`; }
  return n.toLocaleString();
}
/** 블라인드 축약 — 1000→'1K' · 1500→'1.5K' · 150000→'150K' · 1,000,000→'1M' */
function blindShort(n: number): string {
  if (n >= 1_000_000) { const s = unitOrNull(n, 1_000_000); if (s) return `${s}M`; }
  if (n >= 1_000) { const s = unitOrNull(n, 1_000); if (s) return `${s}K`; }
  return n.toLocaleString();
}
/** 평균 스택 축약 — 45,200→'45K' · 316,400→'316K' · 1,234,567→'1.2M'.
 *  평균은 '가격'이 아니라 추정 지표라 반올림해도 오정보가 아니다(§28 대상 아님) — 그래서 폭을 3~4자로 묶는다. */
function stackShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}
/** 지역 라벨 — '서울 강남구' → '서울'(카드 폭 보호, 전체 값은 title 로 유지) */
function regionShort(r?: string | null): string {
  const head = String(r ?? '').trim().split(/\s+/)[0];
  return head || '';
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

  // ♥ 즐겨찾기(매장 팔로우) — APIS 카드의 하트 자리. 표시 전용이라 1회 조회로 충분하고,
  // 비로그인은 빈 배열이라 그냥 아무 카드에도 하트가 안 붙는다(에러 표면 없음).
  const [favIds, setFavIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    getMyFollowedVenueIds().then((ids) => { if (alive) setFavIds(new Set(ids)); }).catch(() => { /* 표시 보조 — 실패는 무시 */ });
    return () => { alive = false; };
  }, []);

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
    <main className="hero-aurora px-page-x pt-3 pb-section">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-fluid-lg font-bold text-ink-primary text-grad-violet">진행 중 게임 {games ? <span className="text-accent-300 text-grad-keep">{games.length}</span> : null}</h2>
            <p className="mt-0.5 t-desc text-ink-muted">지금 클락이 돌아가는 대회 · 블라인드와 레지마감을 한눈에 — 탭하면 상세</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {games && games.length > 1 && (
              <div data-live-sortbar="" className="flex items-center gap-0.5 rounded-input bg-surface-high p-0.5">
                {LIVE_SORT_ORDER.map((k) => (
                  <button key={k} type="button" onClick={() => goSubTab('live-sort', LIVE_SORT_ORDER, sortBy, k, () => pickSort(k))} title={k === 'players' ? '남은 인원 많은 순' : k === 'time' ? '시작 시간 빠른 순' : k === 'distance' ? '내 위치 기준 가까운 지역 먼저(위치 권한 필요)' : '기본 순'}
                    className={['h-7 rounded-[5px] px-2 text-2xs font-bold transition-colors', sortBy === k ? 'bg-accent-300 text-white' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>{LIVE_SORT_LABEL[k]}</button>
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

        {/* 진행 게임 목록 — 정렬 전환의 본문(방향성 푸시 대상). 위 헤더·정렬 바는 제자리. */}
        <div data-live-panel="">
        {games === null ? (
          showSkel ? (
            // [DS] MO-6: LiveCard 3열 골격 복제 — 같은 패딩·같은 min-h(3.5rem)라 도착해도 높이가 안 변한다(CLS 0).
            <div className="space-y-card-gap" aria-hidden aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-aura border card-aura px-3.5 py-2.5">
                  <div className="flex min-h-[4.25rem] items-stretch gap-2">
                    <div className="flex w-[3.2rem] shrink-0 flex-col items-center justify-center gap-1.5">
                      <div className="skeleton h-5 w-10" />
                      <div className="skeleton h-2.5 w-12" />
                      <div className="skeleton h-2.5 w-11" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                      <div className="skeleton h-3.5" style={{ width: `${[78, 62, 84, 70][i]}%` }} />
                      <div className="skeleton h-3" style={{ width: `${[58, 80, 50, 66][i]}%` }} />
                      <div className="skeleton h-[1.125rem]" style={{ width: `${[70, 56, 74, 62][i]}%` }} />
                    </div>
                    <div className="flex w-16 shrink-0 flex-col items-end justify-center gap-1">
                      <div className="skeleton h-2.5 w-14" />
                      <div className="skeleton h-2.5 w-11" />
                      <div className="skeleton h-4 w-9" />
                      <div className="skeleton h-2.5 w-14" />
                    </div>
                  </div>
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
                        region={venueById.get(g.venueId)?.region || sched?.region} fav={favIds.has(g.venueId)}
                        onPoster={() => sched && onSchedule(sched)} onVenue={() => onVenue(g.venueId)} onDisplay={() => onDisplay(g.venueId, g.gameSeq)} />
                    </ul>
                  );
                }
                // 묶음 헤더가 매장 정체성(이름·지역·♥)을 이미 말하므로, 안쪽 카드는 '메인/사이드N'만 반복하지 않는다.
                const grpRegion = regionShort(venueById.get(grp.venueId)?.region);
                return (
                  <div key={grp.venueId} className="rounded-aura border border-accent-400/25 bg-accent-300/[0.03] p-2 space-y-2">
                    <p className="flex items-center gap-1.5 px-1 text-sm font-bold text-ink-primary"><Icon name="home" size={14} className="shrink-0 text-accent-300" /><span className="min-w-0 truncate">{nameOf(grp.venueId)}</span>
                      {grpRegion && <span className="shrink-0 text-2xs font-normal text-ink-muted" title={venueById.get(grp.venueId)?.region}>{grpRegion}</span>}
                      {favIds.has(grp.venueId) && <><Icon name="heart-fill" size={12} className="shrink-0 text-danger" /><span className="sr-only">즐겨찾기</span></>}
                      <span className="shrink-0 text-2xs font-normal text-accent-300">· {grp.games.length}게임 동시 진행</span></p>
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
        </div>
        {upcoming.length > 0 && (
          <div className="reveal space-y-1.5 pt-1">
            <p className="flex items-center gap-1 px-1 text-2xs font-bold text-ink-muted"><Icon name="clock" size={12} className="shrink-0" />오늘 곧 시작 <span className="text-accent-300">{upcoming.length}</span> <span className="font-normal">— 아직 클락 전</span></p>
            <ul className="grid grid-cols-1 gap-1.5">
              {upcoming.map((s) => (
                <li key={s.id}>
                  {/* Luma 시간 우선 행 문법 — 시간(무채·tabular)이 행의 앵커, 제목이 그다음 */}
                  {/* 매장명 칼럼은 fit-content(40%) — auto 트랙 안의 max-w-[40%]는 트랙 자기 폭 기준으로
                      순환 해석돼 매장명이 '로…'(23px)로 뭉개졌다(PC 점검 2026-08-28). 트랙 정의로 상한을 옮긴다. */}
                  <button type="button" onClick={() => onSchedule(s)}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)_fit-content(40%)] items-center gap-2 rounded-aura border card-aura px-3 py-2 text-left transition-colors hover:border-accent-400/40 active:scale-[0.99]">
                    <span className="text-2xs font-bold tabular-nums text-ink-secondary">{s.startTime || '예정'}</span>
                    <span className="truncate text-xs font-semibold text-ink-primary">{s.title}</span>
                    <span className="min-w-0 justify-self-end truncate text-2xs text-ink-muted">{nameOf(s.venueId)}</span>
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

function LiveCard({ g, name, sched, region, fav = false, active = true, onPoster, onVenue, onDisplay }: { g: ClockState; name: string; sched: Schedule | null; region?: string; fav?: boolean; active?: boolean; onPoster: () => void; onVenue: () => void; onDisplay: () => void }) {
  // APIS 라이브 카드 문법(오너 지시 2026-08-28) — 3열 스캔:
  //   [생존/엔트리 · PLAYERS] │ [●LIVE 매장 지역 ♥ / 게임명 / Lv·블라인드·타이머·REG] │ [시작 / BUY-IN / 금액 / GTD]
  // 카드 전체 탭 = 관전 클락(onDisplay) 유지. 1초 틱은 running 카드만(MO-9 LiveCard 격리 문법).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active || !g.running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1_000);
    return () => clearInterval(t);
  }, [active, g.running]);
  const lvls = g.config?.levels ?? [];
  // 공개 카드도 손님 기기다 — 쓰기 권한이 없으므로 표시만 보정한다(DB 전진은 운영자 화면 책임).
  const eff = effectiveLevel(g);
  const lv = lvls[eff.index];
  const levelNo = levelNumberAt(lvls, eff.index);
  const isBreak = lv?.kind === 'break';
  const ls = g.liveStats;
  const alive = ls?.alive ?? Math.max(0, g.adjEntries - g.eliminations);
  const entries = ls?.entries ?? g.adjEntries;
  // 장부 미연동이면 '0/0'은 정보가 아니라 오정보다 — 좌측 열을 통째로 생략한다(기존 규약 유지).
  const hasPlayers = !!ls || entries > 0;
  const remain = Math.max(0, eff.remainingMs);
  const mm = String(Math.floor(remain / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((remain % 60_000) / 1000)).padStart(2, '0');

  // REG 배지 — APIS 는 '마감 레벨'을 말하고 우리는 '남은 분'을 말해 왔다. 둘 다 산다:
  //   1시간 밖이면 구조적 사실(REG ~ Lv8), 1시간 안이면 행동 가능한 사실(REG 45분)로 자동 전환.
  //   두 문자열의 폭이 비슷해 카드 폭이 흔들리지 않는다.
  const regLevel = g.config?.regCloseLevel ?? 0;
  // regCloseLevel 0 = '설정 안 함'인데 msToRegClose 는 이를 0(이미 마감)으로 돌려준다 —
  // 미설정 클락에 CLOSED 를 박으면 등록 가능한 대회를 마감으로 오인시킨다. 미설정은 배지 생략.
  const regMs = regLevel > 0 ? msToRegClose(g, eff.index, eff.remainingMs) : null;
  const regClosed = regMs === 0;
  const regUrgent = regMs !== null && regMs > 0 && regMs <= 5 * 60_000;
  const regText = regLevel <= 0 ? null
    : regClosed ? 'CLOSED'
      : regMs !== null && regMs < 60 * 60_000 ? `REG ${regMinLabel(regMs)}`
        : `REG ~ Lv${regLevel}`;

  // 우측 열 — 시작시각·참가비·부가(§28: 참가비·GTD·이용권은 가격 정보라 표시 유지)
  const startTime = sched?.startTime || '';
  const buyIn = ls?.buyInAmount ?? sched?.buyIn?.amount ?? 0; // 라이브 장부값 우선, 없으면 포스터값
  const pool = sched?.prizePool ?? 0;
  const pct = sched?.prizePercent ?? 0;
  const extras: string[] = [];
  if (sched?.guaranteed && pool > 0) extras.push(`GTD ${wonShort(pool)}`);
  else if (pct > 0) extras.push(`프라이즈 ${pct}%`);
  const seat = sched?.seats?.[0];
  if (seat) extras.push(`${seat.label} ${seat.count}석${(sched?.seats?.length ?? 0) > 1 ? ' 외' : ''}`);
  const hasRight = !!startTime || buyIn > 0 || extras.length > 0;
  const regionLabel = regionShort(region);

  void onPoster; void onVenue; // 카드 탭이 관전으로 단일화 — 이동 경로는 관전·커뮤니티에 있음

  return (
    <li>
      <button type="button" onClick={onDisplay} title="탭하면 관전 클락(블라인드·엔트리·스택 전체)"
        className="card-elev block w-full rounded-aura border border-accent-400/30 bg-surface-low px-3.5 py-2.5 text-left transition-colors hover:border-accent-400/60 active:scale-[0.99]">
        {/* min-h 고정 = 열 조합(집계 없음·포스터 없음)이 달라도 카드 높이가 같다 → 스켈레톤과 동조(CLS 0).
            좌/우 열은 고정 폭 + overflow-hidden — 긴 값이 중앙 열의 폭을 갉아먹지 못하게 막는다. */}
        <div className="flex min-h-[4.25rem] items-stretch gap-2">
          {/* ── 좌: 필드 현황(생존/엔트리 · 평균 스택) — 세로 중앙 ── */}
          {hasPlayers && (
            <div className="flex w-[3.2rem] min-w-0 shrink-0 flex-col items-center justify-center overflow-hidden">
              <p className="text-xl font-extrabold leading-none tabular-nums text-ink-primary">
                <span className="sr-only">생존 </span>{alive}<span aria-hidden>/</span><span className="sr-only">, 엔트리 </span>{entries}
              </p>
              <p className="mt-1.5 text-2xs font-bold leading-none tracking-wide text-ink-muted">PLAYERS</p>
              {/* 평균 스택 — 기존 카드의 값. 같은 '필드 통계'라 이 열에 붙이면 폭·높이 추가 비용이 0이다 */}
              {ls && ls.avgStack > 0 && <p className="mt-1 max-w-full truncate text-2xs leading-none tabular-nums text-ink-muted">평균 {stackShort(ls.avgStack)}</p>}
            </div>
          )}

          {/* ── 중앙: 정체성 / 게임명·타이머 / 레벨·블라인드·REG ── */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <p className="flex min-w-0 items-center gap-1.5 leading-none">
              {/* ● 점은 bg-current — 라이트 테마 딥 톤 보정을 그대로 물려받는다(고정 bg-emerald-400 은 흰 배경서 2.2:1) */}
              <span className={`inline-flex shrink-0 items-center gap-1 text-2xs font-bold leading-none ${g.running ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-400'}`}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />{g.running ? 'LIVE' : '일시정지'}
              </span>
              <span className="min-w-0 truncate text-sm font-bold leading-none text-ink-primary">{name}</span>
              {regionLabel && <span className="shrink-0 text-2xs font-normal leading-none text-ink-muted" title={region}>{regionLabel}</span>}
              {fav && <><Icon name="heart-fill" size={12} className="shrink-0 text-danger" /><span className="sr-only">즐겨찾기</span></>}
              {/* 탭 어포던스 — 모바일엔 hover 가 없어 '누를 수 있다'를 말해 줄 표식이 하나는 있어야 한다.
                  1행은 매장명이 truncate 로 흡수하므로 폭 부담이 가장 적은 자리다. */}
              <Icon name="eye" size={12} className="ml-auto shrink-0 text-accent-300" /><span className="sr-only">관전</span>
            </p>
            <p className="flex min-w-0 items-center gap-1.5 leading-none">
              <span className="min-w-0 truncate text-xs font-semibold leading-none text-ink-secondary">{g.title || g.config?.title || '토너먼트'}</span>
              {/* 미니 클락의 심장(오너 2026-08-28) — 현재 레벨 잔여. 3행(레벨·블라인드·REG)은 오너 지정 문법이라
                  건드리지 않고, 폭 여유가 가장 큰 게임명 줄 끝에 둔다. 라벨 없이 읽히는 게 클락 관습이라 aria 로만 보강. */}
              <span className={`ml-auto shrink-0 text-2xs font-bold leading-none tabular-nums ${g.running ? 'text-accent-200' : 'text-amber-400'}`}
                aria-label={`${isBreak ? '재개' : '레벨 종료'}까지 ${mm}분 ${ss}초`}>{mm}:{ss}</span>
            </p>
            <p className="flex min-w-0 items-center gap-1 overflow-hidden leading-none">
              {isBreak ? (
                <span className="shrink-0 text-2xs font-bold leading-none text-sky-300">BREAK</span>
              ) : lv ? (
                <>
                  <span className="shrink-0 text-2xs font-semibold leading-none tabular-nums text-ink-muted">Lv{levelNo}</span>
                  {/* 블라인드+앤티를 한 묶음으로 — 행의 gap 하나를 줄여 sb/bb 가 잘리는 폭을 되찾는다 */}
                  <span className="flex min-w-0 shrink items-center">
                    <span className="min-w-0 shrink truncate text-2xs font-bold leading-none tabular-nums text-ink-primary">{blindShort(lv.sb)}/{blindShort(lv.bb)}</span>
                    {/* 앤티는 좁을 때 가장 먼저 양보한다 — sb/bb 와 REG 배지를 지키는 게 우선(전값은 관전 클락에).
                        간격을 gap 이 아니라 선행 공백으로 두는 이유: gap 은 앤티가 0폭으로 접혀도 남아서
                        정작 지키려던 sb/bb 의 폭을 계속 갉아먹는다. */}
                    {lv.ante > 0 && <span className="min-w-0 truncate text-2xs leading-none tabular-nums text-ink-muted [flex-shrink:100]">{` (${blindShort(lv.ante)})`}</span>}
                  </span>
                </>
              ) : null}
              {regText && (
                <span className={['ml-auto shrink-0 rounded-badge border px-1 py-0.5 text-2xs font-bold leading-none tabular-nums',
                  regClosed ? 'border-border-default bg-surface-float text-ink-secondary'
                    : regUrgent ? 'border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                      : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'].join(' ')}>{regText}</span>
              )}
            </p>
          </div>

          {/* ── 우: 시작시각 / BUY-IN / 부가(골드) ── */}
          {hasRight && (
            <div className="flex w-16 min-w-0 shrink-0 flex-col items-end justify-center gap-1 overflow-hidden text-right">
              {startTime && <p className="max-w-full truncate text-2xs leading-none tabular-nums text-ink-muted">시작 {startTime}</p>}
              {buyIn > 0 && (
                <>
                  <p className="text-2xs font-bold leading-none tracking-wide text-ink-muted">BUY-IN</p>
                  <p className="max-w-full truncate text-base font-extrabold leading-none tabular-nums text-ink-primary">{wonShort(buyIn)}</p>
                </>
              )}
              {extras.length > 0 && (
                <p className="max-w-full truncate text-2xs font-bold leading-none tabular-nums text-gold-400 dark:text-gold-300" title={extras.join(' · ')}>{extras.join(' · ')}</p>
              )}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

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
    <section className="rounded-aura border border-accent-300/60 bg-gradient-to-br from-accent-300/[0.12] to-transparent p-3">
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
