// src/components/features/LiveGamesTab.tsx
// 라이브 — 진행 중(클락 running) 게임 현황 보드.
// 오너 지시(2026-08-28): 라이브 카드를 APIS 라이브 카드 문법으로 재구성 — 3열 스캔 카드.
//   좌 = 큰 생존/엔트리 + PLAYERS · 중앙 = ●LIVE·매장·지역·♥ / 게임명 / Lv·블라인드·REG
//   우 = 시작시각 / GTD·상금(골드) / 참가비 라벨·금액 / 이용권 — 일정 목록 카드(ScheduleCard ③열)와 같은 순서·어휘·정본
// 상세(리바인·평균스택·다음브레이크 등)는 카드 탭 → 관전 클락에서 그대로 제공(표면 간소화, 기능 보존).
import { useEffect, useMemo, useState } from 'react';
import { getRunningClocks, subscribeRunningClocks, effectiveLevel, type ClockState } from '../../api/clock';
import { matchClockSchedule as matchSchedule, msToRegClose } from '../../lib/regStatus';
import { levelNumberAt } from '../../lib/clockLevel';
import { EmptyState } from '../atoms/Skeleton';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { useSkeletonGate } from '../../lib/useSkeletonGate';
import { goSubTab } from '../../lib/subTabTransition';
import { writeSnap } from '../../lib/snapshot';
import { stackZone } from '../../lib/stackZone';
import type { PushJump } from './tools/WrongNote';

/** 진행 게임 정렬 칩 — 진열 순서가 곧 하위 탭 전환 방향(forward/back)의 기준이다. */
const LIVE_SORT_ORDER = ['default', 'players', 'time', 'distance'] as const;
const LIVE_SORT_LABEL: Record<(typeof LIVE_SORT_ORDER)[number], string> = {
  default: '기본', players: '인원', time: '시간', distance: '거리',
};
import { type Venue } from '../../api/community';
import { useFavoriteVenues } from '../../lib/useFavoriteVenues';
import { promptLogin } from '../../lib/requireLogin';
import type { Schedule } from '../../api/schedules';
// 참가비·상금 문자열과 '오늘 곧 시작' 줄은 일정 목록 카드의 정본을 그대로 쓴다(두 벌 계산·두 문법 금지, 2026-09-18).
import ScheduleCard, { buyInText, prizeText } from './ScheduleCard';

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

// levelNumberAt 은 src/lib/clockLevel.ts 하나뿐이다 — 이 파일의 로컬 복제본이 msToRegClose 와
// 같은 부류(2026-09-13)라 통합했다.
// 레지마감 잔여 ms → '몇 분' 라벨(오너 지정 1급 정보 — 분 단위 표기)
function regMinLabel(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60 > 0 ? `${min % 60}분` : ''}`.trim() : `${min}분`;
}

// ── 축약 표기(APIS 문법) ─────────────────────────────────────────────────────
// 규칙 하나만 지킨다: **축약이 값을 바꾸면 축약하지 않는다.** 블라인드 1,500 을 '1.5K' 로 적는 것은 압축이지만
// 참가비 55,000 을 '5만' 으로 반올림하면 오정보다(§28 — 참가비·GTD 는 가격 고지).
// 소수 2자리까지 되돌려 원값과 일치할 때만 축약하고, 아니면 전체 숫자를 그대로 쓴다.
// ⚠ 참가비·상금 문자열은 여기서 만들지 않는다 — ScheduleCard 의 buyInText('10T')·prizeText('GTD 1,000만') 가 정본이다.
//   같은 대회가 일정 목록에서는 '10T', 라이브에서는 '10만' 으로 보이던 것을 2026-09-18 에 없앴다(예전 wonShort).
function unitOrNull(n: number, div: number): string | null {
  const r = Math.round((n / div) * 100) / 100;
  return Math.abs(r * div - n) < 0.5 ? String(r) : null;
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
  // 첫 로드부터 실패하면(games 가 아직 null) 빈 상태로 위장하지 않고 LoadErrorCard 로 '못 불러옴'을 말한다 —
  // api/clock.ts 가 일부러 throw 하는 것을 여기서 `[]` 로 되받으면 '대회 일정 보기' 유도까지 붙은 거짓 화면이 된다(STATE-01).
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const load = () => getRunningClocks().then((g) => { setGames(g); setLoadErr(null); }).catch((e) => setLoadErr(e));
  // 폴링·1초 틱은 라이브 탭이 보일 때만 — 숨김 시 멈춰 백그라운드 끊김 방지(재진입 시 즉시 갱신). 실시간 구독은 이벤트 기반이라 상시 유지.
  useEffect(() => { if (!active) return; load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [active]);
  // 실시간 구독도 **보일 때만** — 라이브 탭은 유휴 시점에 숨긴 채 프리마운트되므로 상시 구독하면
  // 라이브를 한 번도 안 본 사용자까지 clock_states 채널을 연다(2026-09-10 용량 점검).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!active) return; return subscribeRunningClocks(load); }, [active]); // 레벨 전환·통계 즉시 반영

  // ♥ 즐겨찾기(매장 팔로우) — APIS 카드의 하트 자리. 비로그인은 빈 집합이라 아무 카드에도 하트가 안 붙는다(에러 표면 없음).
  // ⚠ '1회 조회' 였다(연결 감사 E, 2026-09-17): 이 탭은 keep-alive 라 마운트가 한 번뿐이고, 매장 페이지에서
  //   팔로우하고 돌아와도 하트가 영원히 안 붙었다. 탭이 **보이게 될 때마다** 다시 읽어야 한다.
  // 🔴 2026-09-20 — 그 조리법을 `lib/useFavoriteVenues.ts` 로 옮겼다. 여기서 직접 구현하지 않는다.
  //   같은 날 일정 카드의 ♥ 를 살리면서 홈·일정탐색도 같은 집합이 필요해졌는데, 탭마다 각자 구현하면
  //   그중 하나는 반드시 위 '1회 조회' 함정을 다시 밟는다. **읽기만 하던 것이 이제 토글도 한다.**
  const { ids: favIds, toggle: toggleFav } = useFavoriteVenues(active, promptLogin);

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

  // 내 토너: 승인된 내 게임 중 지금 진행 중인 것만, venue:gameSeq 로 중복 제거(리엔트리 중복 카드·중복 key 방지)
  const myLive = (() => {
    const seen = new Set<string>(); const out: { m: NonNullable<typeof myGames>[number]; g: ClockState }[] = [];
    for (const m of myGames ?? []) {
      const g = (games ?? []).find((x) => x.venueId === m.venueId && (m.gameSeq == null || x.gameSeq === m.gameSeq));
      if (!g) continue;
      const k = `${g.venueId}:${g.gameSeq ?? 0}`; if (seen.has(k)) continue; seen.add(k); out.push({ m, g });
    }
    return out;
  })();
  return (
    <main className="hero-aurora px-page-x pt-3 pb-section">
      {/* `data-main-enter-ready` — M1 cohort 준비 신호. 이 루트가 붙으면 머리줄·목록·패널이 같은 커밋에 있다.
          ⚠ 표식은 이 안의 블록들에만 있다. 이 컨테이너 자체를 움직이지 않는 이유는 `tabEnter.ts` 머리말 참고. */}
      <div data-main-enter-ready className="mx-auto w-full max-w-3xl space-y-3">
        {/* items-start — 320~390px 에서는 설명 문구가 2줄이 되어 왼쪽 묶음이 62.8px, 버튼 그룹이 40.8px 가 된다.
            items-center 이면 버튼이 제목보다 11.0px 아래로 내려가 제목과 어긋난다(실측 375: 11.0 · 320: 10.83).
            1280 은 설명이 1줄이라 렌더가 변하지 않는다. */}
        <div data-main-enter className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-fluid-lg font-bold text-ink-primary text-grad-violet">진행 중 게임 {games ? <span className="text-accent-200 text-grad-keep">{games.length}</span> : null}</h2>
            {/* 2026-09-18 오너 지시로 설명줄 제거 — 제목 '진행 중 게임'이 이미 화면의 정체를 말하고, '블라인드·레지마감을 한눈에'는 바로 아래 카드 목록에 */}
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
            {/* 🔴 2026-09-20 오너 지시("버튼 안 글씨 위아래 공백이 너무 커서 버튼이 쓸데없이 커진다").
                전수 측정에서 **글자만 있는 버튼 중 유일하게 실결함**으로 남은 자리다
                (커뮤니티 서브탭·필터칩은 44px 가 투명 히트박스이고 보이는 알약은 32px — 오탐이었다).
                원인: `text-xs` 로 글자만 줄이고 `.btn` 의 바닥값 `min-h-[2.4rem]`(40.8px)은 그대로 둬서
                  글자(12.75px) 대비 위아래 여백이 과했다. 크기 사다리에 `text-xs` 짝인 `.btn-sm`
                  (`min-h-[2rem]`=34px · `leading-[1.0625rem]`)이 이미 있는데 안 쓰고 있었다.
                  → `btn-sm` 을 쓴다. `text-xs` 는 `btn-sm` 이 이미 포함하므로 뺀다(두 벌 방지).
                  `px-3` 은 유틸이라 `btn-sm` 의 `px-2.5` 를 이기고 기존 가로 폭이 유지된다.
                🔴 `.hit` 을 같이 붙인다 — 이건 **줄이는 김에 얹는 것이 아니라 고치는 것**이다.
                  종전 40.8px 는 애초에 터치 최소치 44px 에 **미달**이었다. `.hit::after` 가
                  보이는 상자는 그대로 두고 터치만 44px 로 넓힌다(34 → 유효 44).
                ⚠ `.hit` 함정 ②(오버행이 옆을 덮는다): 세로 오버행 (44−34)/2 = **5px**.
                  가로는 이 버튼 폭이 44px 를 넘어 오버행 0 이다. 적용 후 `elementFromPoint` 로
                  그 좌표가 정말 이 버튼을 돌려주는지 실측했다(아래 커밋 메시지에 수치). */}
            <button type="button" onClick={load} className="btn-ghost btn-sm hit px-3">새로고침</button>
          </div>
        </div>

        {/* 🎯 내 토너 — 바인 승인 후 참가자 시점이 어디에도 없던 격차. 승인된 내 게임이
            진행 중이면 블라인드·평균스택 + 스택 자가입력 → BB·평균 대비 %를 맨 위에. */}
        {myLive.length > 0 && (
          <div data-main-enter className="space-y-card-gap">
            {/* v6.5: 실제로 뛰는 내 게임이 정확히 1장일 때만 글로우(주인공이 둘이면 아무도 빛나지 않는다 — CLAUDE.md 글로우 배치 규칙) */}
            {myLive.map(({ m, g }) => (
              <MyTournamentCard key={`${g.venueId}:${g.gameSeq ?? 0}`} g={g} venueName={m.venueName} hero={myLive.length === 1}
                onDisplay={() => onDisplay(g.venueId, g.gameSeq ?? 1)}
                onPoster={(() => { const sched = matchSchedule(g, schedules); return sched ? () => onSchedule(sched) : undefined; })()}
                onVenue={() => onVenue(g.venueId)} />
            ))}
          </div>
        )}

        {/* 진행 게임 목록 — 정렬 전환의 본문(방향성 푸시 대상). 위 헤더·정렬 바는 제자리. */}
        <div data-main-enter data-live-panel="">
        {games === null ? (
          loadErr != null ? (
            <LoadErrorCard error={loadErr} what="진행 중인 게임" onRetry={load} />
          ) : (
            // [DS] MO-6: LiveCard 3열 골격 복제 — 같은 패딩·같은 min-h(3.5rem)라 도착해도 높이가 안 변한다(CLS 0).
            // 게이트(200ms) 동안에도 자리는 예약한다(MO-B) — null 을 그리면 늦게 끼어든 스켈레톤이 아래(오늘 곧 시작·푸터)를 민다.
            //   showSkel 은 pulse 노출만 정한다: invisible = 높이는 그대로, 시머만 숨김(e2e/skeleton-no-shift.spec.ts).
            <div className={['space-y-card-gap', showSkel ? '' : 'invisible'].join(' ')} aria-hidden aria-busy="true">
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
          )
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
            <p className="flex items-center gap-1 px-1 text-2xs font-bold text-ink-muted"><Icon name="clock" size={12} className="shrink-0" />오늘 곧 시작 <span className="text-accent-300">{upcoming.length}</span> <span className="whitespace-nowrap font-normal">아직 클락 전</span></p>
            {/* 일정 목록 카드(ScheduleCard list) 그 자체 — 같은 대회가 일정 탭과 여기서 다른 줄 문법으로 보이지 않게(2026-09-18).
                예전의 자체 3열(시각·제목·매장명)에는 참가비·GTD·등록 마감이 없었다 — '갈까?' 를 정하는 값이 빠진 줄이었고
                320px 에서는 제목이 잘렸다(실측 134/190). 컨테이너 클래스는 App 의 일정 목록과 같다. */}
            <div className="divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura">
              {upcoming.map((s) => (
                <ScheduleCard key={s.id} mode="list" schedule={s} venue={venueById.get(s.venueId)} onSelect={onSchedule} onVenueClick={onVenue}
                  favorited={favIds.has(s.venueId)} onToggleFavorite={toggleFav} />
              ))}
            </div>
          </div>
        )}
        <p className="text-center text-2xs text-ink-muted">운영 중 클락의 공개 정보입니다 · 30초 자동 갱신.</p>
      </div>
    </main>
  );
}

function LiveCard({ g, name, sched, region, fav = false, active = true, onPoster, onVenue, onDisplay }: { g: ClockState; name: string; sched: Schedule | null; region?: string; fav?: boolean; active?: boolean; onPoster: () => void; onVenue: () => void; onDisplay: () => void }) {
  // APIS 라이브 카드 문법(오너 지시 2026-08-28) — 3열 스캔:
  //   [생존/엔트리 · PLAYERS] │ [●LIVE 매장 지역 ♥ / 게임명 / Lv·블라인드·타이머·REG] │ [시작 / 참가비 / 금액 / GTD·이용권]
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
  // 현재 레벨 진행률(0~100) — 아우라 데이터 링. 레벨 길이를 모르면(0) 링은 비워 둔다.
  const levelMs = (lv?.minutes ?? 0) * 60_000;
  const progress = levelMs > 0 ? Math.min(100, Math.max(0, 100 - (remain / levelMs) * 100)) : 0;

  // 등록 마감 배지 — 1시간 밖이면 구조적 사실(레벨), 1시간 안이면 행동 가능한 사실(남은 분)로 자동 전환.
  //
  // 🔴 2026-09-18 오너 결정: 표기를 **일정 목록 쪽으로 통일**한다.
  //   종전에는 라이브가 `REG ~ Lv12` · `REG 45분` · `CLOSED`, 일정 목록이 `등록 마감 14레벨` 이었다 —
  //   **같은 대회의 같은 정보인데 화면마다 다른 말**이었고, 그게 오너가 반복해서 지적한 연동성 결함이다.
  //   라이브 쪽 영문 표기는 2026-08-28 에 오너가 지정한 것이라 임의로 바꾸지 않고 결정을 받았다.
  // ⚠ 'CLOSED' → '등록 마감' 으로 바뀌면서 **접두어 없는 상태 문구**가 됐다. 그래서 진행형('등록 마감 12레벨')과
  //   완료형('등록 마감')이 같은 낱말로 시작하는데, 색(danger)과 문장 길이로 구분된다 —
  //   색만으로 구분하지 않도록 완료형은 '등록 마감됨' 으로 적는다(색각 이상·흑백 인쇄).
  // ⚠ 글자가 길어져 좁은 폭에서 카드가 흔들릴 수 있다 — 이 배지는 `whitespace-nowrap` 이 아니라
  //   줄바꿈 가능한 자리에 있다(아래 렌더부). 폭 실측은 커밋 메시지에 남긴다.
  const regLevel = g.config?.regCloseLevel ?? 0;
  // regCloseLevel 0 = '설정 안 함'인데 msToRegClose 는 이를 0(이미 마감)으로 돌려준다 —
  // 미설정 클락에 마감을 박으면 등록 가능한 대회를 마감으로 오인시킨다. 미설정은 배지 생략.
  const regMs = regLevel > 0 ? msToRegClose(g, eff.index, eff.remainingMs) : null;
  const regClosed = regMs === 0;
  const regUrgent = regMs !== null && regMs > 0 && regMs <= 5 * 60_000;
  const regText = regLevel <= 0 ? null
    : regClosed ? '등록 마감됨'
      : regMs !== null && regMs < 60 * 60_000 ? `등록 마감 ${regMinLabel(regMs)}`
        : `등록 마감 ${regLevel}레벨`;

  // 우측 열 — 시작시각·참가비·부가(§28: 참가비·GTD·이용권은 가격 정보라 표시 유지)
  const startTime = sched?.startTime || '';
  const buyIn = ls?.buyInAmount ?? sched?.buyIn?.amount ?? 0; // 라이브 장부값 우선, 없으면 포스터값
  // 상금 문자열은 일정 목록 카드와 같은 정본(prizeText) — 'GTD 1,000만' · '예상 상금 50%'. 반올림 없음.
  const prize = sched ? prizeText(sched) : null;
  const seat = sched?.seats?.[0];
  const seatText = seat ? `${seat.label} ${seat.count}석${(sched?.seats?.length ?? 0) > 1 ? ' 외' : ''}` : null;
  const hasRight = !!startTime || buyIn > 0 || !!prize || !!seatText;
  const regionLabel = regionShort(region);

  // 카드 전체 탭 = **포스터**(오너 2026-09-08 "라이브인 것을 누르면 포스터로 들어가게").
  // 포스터 없이 라이브 장부만 쓰는 매장이면 갈 포스터가 없으므로 그 매장 커뮤니티 홈으로 보낸다.
  // 관전 클락은 사라지지 않는다 — 1행 끝 눈 아이콘이 그 전용 버튼이 된다(아래).
  const openPrimary = sched ? onPoster : onVenue;

  return (
    // relative + 전면 버튼: 카드에 '주 동작(포스터)'과 '부 동작(관전)' 두 개가 필요한데
    // 버튼 안에 버튼을 넣을 수 없다. 주 동작을 카드 전면(absolute inset-0)에 깔고,
    // 내용층은 pointer-events-none 으로 통과시키되 관전 버튼만 다시 auto 로 살린다.
    <li className="relative transition-transform active:scale-[0.99]">
      <button type="button" onClick={openPrimary}
        aria-label={sched ? `${name} 포스터 열기` : `${name} 매장 커뮤니티 열기`}
        title={sched ? '탭하면 대회 포스터(참가비·구조·문의)' : '이 매장은 포스터가 없어 매장 커뮤니티로 이동합니다'}
        className="card-elev absolute inset-0 z-0 rounded-aura border border-accent-400/30 bg-surface-low transition-colors hover:border-accent-400/60" />
      <div className="pointer-events-none relative z-10 px-3.5 py-2.5 text-left">
        {/* min-h 고정 = 열 조합(집계 없음·포스터 없음)이 달라도 카드 높이가 같다 → 스켈레톤과 동조(CLS 0).
            ⚠ 2026-09-18 실측으로 뒤집은 것: 우측 열이 **고정 68px + overflow-hidden** 이라 참가비 '1,234,567' 이
              '1,234…' 로, 'GTD 1000만 · 5만 이용권 3석 외' 가 'GTD 1000…' 으로 **모든 폭(1440 포함)에서** 잘렸다.
              이름은 줄여도 금액·상금은 못 줄인다(§5) — 우측 열은 내용이 폭을 정하고 중앙 열이 대신 양보한다.
            ⚠ 200% 확대: rem 고정 열이 카드 밖으로 밀려 '시작 18'·'BUY'·'10' 이 잘렸다(실측 320: 행 157/281).
              flex-wrap + 중앙 열 basis(4.5rem) — 폭이 모자라면 중앙 열이 **스스로 아래 줄로** 내려가고 좌/우 열은 첫 줄에 남는다
              (ScheduleCard ListCard 와 같은 조리법). 100% 에서는 320px 까지 3열이 그대로다 — basis 를 5rem 으로 두면
              320px 에서 '1,234,567원'(우측 104px) 카드와 묶음 카드의 중앙 열(82px)이 줄을 내렸다(실측 h 171). */}
        <div className="flex min-h-[4.25rem] flex-wrap items-stretch gap-x-2 gap-y-1">
          {/* ── 좌: 필드 현황(생존/엔트리 · 평균 스택) — 세로 중앙 ── */}
          {hasPlayers && (
            <div data-live-players className="flex shrink-0 flex-col items-center justify-center">
              {/* 생존 / 엔트리 — **한 줄**(오너 2026-09-16 "라이브에 플레이어 수가 7하고 9가 다른 줄이야").
                  ⚠ 예전엔 두 줄이었고 그 근거는 "한 줄 '87/213' 은 이 열(**54px 고정**)에 57px 로 들어가 양옆이 잘렸다"
                    였다(오너 2026-09-08). 그런데 **그 고정폭은 이미 없어졌다** — 같은 주석이 아래에서
                    "폭을 고정하지 않고 내용이 정하게 바꿨다" 고 적고 있다. 두 줄만 그때의 잔재로 남아 있었다.
                  실측(2026-09-16 · 라이브 375px · 실제 폰트로 측정):
                    열 폭을 정하는 것은 숫자가 아니라 **`PLAYERS` 라벨(53.2px)** 이다.
                    한 줄 합본 폭 — `7/9` **26.2px**(라벨 안, 여유 27px) · `87/213` 55.7px(+2.5px).
                    즉 현실적인 값에서 **열 폭이 사실상 안 변한다.**
                  위계는 그대로 둔다: 생존이 크고 엔트리는 그 분모라 작다. 글자 크기 사다리는 만들지 않는다. */}
              <p className="flex items-baseline justify-center leading-none tabular-nums">
                <span className="text-xl font-extrabold text-ink-primary">
                  <span className="sr-only">생존 </span>{alive}
                </span>
                <span className="text-2xs font-bold text-ink-muted">
                  <span aria-hidden>/</span><span className="sr-only">, 엔트리 </span>{entries}
                </span>
              </p>
              {/* 아우라 마이크로 라벨(실제 데이터 라벨에만) — 시안 'RECOVERY SCORE' 문법: 틸·대문자·자간. 라틴 라벨이라 자간이 산다.
                  ⚠ 이 라벨이 열의 폭을 정한다. 예전엔 열이 54px 고정이라 라벨(11px·0.1em → 57px)이 양옆으로
                    잘렸고(오너 2026-09-08 보고), 라벨을 10px 로 줄여 51px 로 맞췄었다. 그런데 그 51 은
                    **내 기기 폰트의 숫자**였다 — 같은 코드가 CI(리눅스)에서는 60px 로 나와 그대로 잘렸다.
                    그래서 폭을 고정하지 않고 내용이 정하게 바꿨다(위 div). 10px 는 그대로 두는데,
                    이제는 '안 잘리게 하려고' 가 아니라 숫자보다 라벨이 작아야 위계가 맞아서다. */}
              <p className="t-micro mt-1.5 text-[0.625rem] leading-none">PLAYERS</p>
              {/* 평균 스택 — 기존 카드의 값. 같은 '필드 통계'라 이 열에 붙이면 폭·높이 추가 비용이 0이다 */}
              {ls && ls.avgStack > 0 && <p className="mt-1 max-w-full truncate text-2xs leading-none tabular-nums text-ink-muted">평균 {stackShort(ls.avgStack)}</p>}
            </div>
          )}

          {/* ── 중앙: 정체성 / 게임명·타이머 / 레벨·블라인드·REG ── */}
          <div className="flex min-w-0 flex-[1_1_4.5rem] flex-col justify-center gap-1.5">
            <p className="flex min-w-0 items-center gap-1.5 leading-none">
              {/* ● 점은 bg-current — 라이트 테마 딥 톤 보정을 그대로 물려받는다(고정 bg-emerald-400 은 흰 배경서 2.2:1) */}
              <span className={`inline-flex shrink-0 items-center gap-1 text-2xs font-bold leading-none ${g.running ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-400'}`}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />{g.running ? 'LIVE' : '일시정지'}
              </span>
              <span className="min-w-0 truncate text-sm font-bold leading-none text-ink-primary">{name}</span>
              {regionLabel && <span className="shrink-0 text-2xs font-normal leading-none text-ink-muted" title={region}>{regionLabel}</span>}
              {fav && <><Icon name="heart-fill" size={12} className="shrink-0 text-danger" /><span className="sr-only">즐겨찾기</span></>}
              {/* 관전 클락 전용 버튼 — 카드 탭이 포스터로 바뀌면서(2026-09-08) 관전이 갈 곳을 잃었다.
                  그 자리를 그대로 물려받는다: 1행은 매장명이 truncate 로 흡수해 폭 부담이 가장 적다.
                  아이콘 자체는 12px 라 히트영역을 ::before 로 28×28 까지 넓힌다(WCAG 2.5.8 AA=24).
                  훔쳐 오는 8px 는 카드 배경(포스터 탭)뿐이라 안전하다 — 명시 컨트롤이 배경보다 우선이다. */}
              <button type="button" onClick={onDisplay} aria-label={`${name} 관전 클락 열기`}
                title="관전 클락(블라인드·엔트리·평균 스택 전체)"
                className="pointer-events-auto relative ml-auto shrink-0 text-accent-300 before:absolute before:-inset-2 before:content-['']">
                <Icon name="eye" size={12} /><span className="sr-only">관전</span>
              </button>
            </p>
            <p className="flex min-w-0 items-center gap-1.5 leading-none">
              <span className="min-w-0 truncate text-xs font-semibold leading-none text-ink-secondary">{g.title || g.config?.title || '대회'}</span>
              {/* 미니 클락의 심장(오너 2026-08-28) — 현재 레벨 잔여. 3행(레벨·블라인드·REG)은 오너 지정 문법이라
                  건드리지 않고, 폭 여유가 가장 큰 게임명 줄 끝에 둔다. 라벨 없이 읽히는 게 클락 관습이라 aria 로만 보강. */}
              <span className="ml-auto flex shrink-0 items-center gap-1" aria-label={`${isBreak ? '재개' : '레벨 종료'}까지 ${mm}분 ${ss}초`}>
                {/* 레벨 진행 링 — 아우라 데이터 링(시안 'RECOVERY SCORE' 문법). 1초 틱마다 stroke-dashoffset 만 바뀐다:
                    14px SVG 페인트라 값싸고, 정속 진행이라 linear(헌법 §1 '일정 속도 = linear'). pathLength=100 → 오프셋 = 남은 % */}
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0 -rotate-90">
                  <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2" className="stroke-border-default" />
                  <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2" strokeLinecap="round" pathLength={100}
                    strokeDasharray={100} strokeDashoffset={100 - progress}
                    className={g.running ? 'stroke-aura-300 ring-glow' : 'stroke-amber-400'} style={{ transition: 'stroke-dashoffset 1s linear' }} />
                </svg>
                <span className={`text-2xs font-bold leading-none tabular-nums ${g.running ? 'text-accent-200' : 'text-amber-400'}`}>{mm}:{ss}</span>
              </span>
            </p>
            {/* ⚠ overflow-hidden + 배지 ml-auto 조합이라 좁아지면 **블라인드 값이 0px 로 접히고**
                배지가 잘린다(실측 2026-09-18 · 390·200%: 폭 109.5 / scrollWidth 166, 배지 110.5 중 57 잘림).
                줄바꿈을 허용해 값과 배지가 둘 다 살아남게 한다 — 이 줄은 '지금 얼마짜리 판인가' 라
                잘라서는 안 되는 정보다(§5: 이름은 줄여도 금액·마감은 안 자른다). */}
            <p className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 leading-none">
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

          {/* ── 우: 시작시각 / 상금(골드) / 참가비 라벨·금액 / 이용권 — ScheduleCard ③열과 **같은 순서·같은 라벨·같은 정본** ──
              ml-auto: 중앙 열이 아래 줄로 내려간 첫 줄에서도 이 열이 오른쪽 끝에 붙는다(3열일 땐 남는 폭이 없어 무효).
              값 줄에는 truncate 를 걸지 않는다 — 공백 자리에서 줄바꿈(break-keep)할 뿐 글자를 지우지 않는다.
              상금·이용권 줄만 6rem 상한 — 이 줄의 max-content 가 곧 열 폭이라, 상한이 없으면 긴 이용권 라벨이 320px 에서
              중앙 열을 basis 아래로 밀어 줄을 내린다. 4.5rem 으로 좁히면 '5만 이용권 3석 외'(82px)가 두 줄이 되어 카드만 커진다(실측 122px).
              금액 줄은 상한 없음(못 자른다 — '1,234,567원' 104px 도 그대로).
              max-w-full: 320px·200% 에서 열이 행(157px)보다 넓어져 11px 삐져나왔다 — 행 폭을 상한으로 두면 이용권 줄이 접힌다.
              (금액 한 줄이 행보다 넓은 극단(320·200%·'1,234,567원' 208px)은 숫자를 쪼갤 수 없어 그대로 둔다.) */}
          {hasRight && (
            <div className="ml-auto flex max-w-full shrink-0 flex-col items-end justify-center gap-1 text-right">
              {/* 🔴 순서는 일정 목록(ScheduleCard ③열)과 **같아야 한다** — 상금(GTD) 위, 참가비 아래.
                  오너 지시(2026-09-18 3차) "GTD를 위로 올리고 10T를 밑으로" 는 값에 대한 결정이지
                  한 화면에 대한 결정이 아니다. 같은 두 값이 화면마다 순서가 다르면 그게 곧
                  오너가 반복해서 지적한 '연동성' 결함이다.
                ⚠ '참가비' 라벨은 금액 **바로 위**에 붙여 둔다. 맨 위로 올리면 그 라벨이 GTD 를
                  가리키는 것처럼 읽혀 '참가비 300만' 으로 오독된다(§28 이 막으려는 사고). */}
              {startTime && <p className="text-2xs leading-none tabular-nums text-ink-muted">시작 {startTime}</p>}
              {prize && <p className="max-w-[6rem] break-keep text-2xs font-bold leading-tight tabular-nums text-gold-400 dark:text-gold-300">{prize}</p>}
              {buyIn > 0 && (
                <>
                  <p className="text-2xs font-bold leading-none tracking-wide text-ink-muted">참가비</p>
                  <p className="text-base font-extrabold leading-none tabular-nums text-ink-primary">{buyInText(buyIn)}</p>
                </>
              )}
              {seatText && <p className="max-w-[6rem] break-keep text-2xs leading-tight tabular-nums text-ink-muted">{seatText}</p>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function MyTournamentCard({ g, venueName, onDisplay, onPoster, onVenue, hero = false }: { g: ClockState; venueName: string; onDisplay: () => void; onPoster?: () => void; onVenue: () => void; hero?: boolean }) {
  const lvls = g.config?.levels ?? [];
  const eff = effectiveLevel(g);
  const lv = lvls[eff.index];
  // 브레이크 중엔 직전 플레이 레벨의 BB 로 환산(클락 AVG BB 병기와 동일 규칙)
  // ref = 그 플레이 레벨 객체 — 브레이크 레벨은 sb·bb·ante 가 전부 0 이라 M·앤티 판정도 이걸 기준으로 한다.
  let bb = 0;
  let ref: typeof lv | undefined;
  for (let i = eff.index; i >= 0; i--) { const l = lvls[i]; if (l && l.kind === 'level' && l.bb > 0) { bb = l.bb; ref = l; break; } }
  const ls = g.liveStats;
  const avg = ls?.avgStack ?? 0;
  // 스택은 게임·날짜 단위로 기억 — 토너 중 앱을 들락여도 유지, 다음 날엔 초기화
  const storeKey = `nuri:mystack:${g.venueId}:${g.gameSeq ?? 1}:${new Date().toLocaleDateString('en-CA')}`;
  const [stack, setStack] = useState<number>(() => { try { return Number(localStorage.getItem(storeKey)) || 0; } catch { return 0; } });
  const update = (n: number) => { setStack(n); try { localStorage.setItem(storeKey, String(n)); } catch { /* noop */ } };
  const myBB = bb > 0 && stack > 0 ? Math.round((stack / bb) * 10) / 10 : null;
  const vsAvg = avg > 0 && stack > 0 ? Math.round((stack / avg) * 100) : null;
  // 내 bb 구간 → 차트 딥링크(GKR 잔여분, 2026-09-03). ref 가 없으면 bb=0 → myBB=null → zone=null 이라 cost 는 쓰이지 않는다.
  // 클락 기본 구조가 BB 앤티(ante=bb)라 한 바퀴 비용 = sb+bb+ante (StackCalcs 의 인원 곱은 개별 앤티 가정 — 여기선 쓰지 않는다).
  const cost = ref ? ref.sb + ref.bb + ref.ante : 0;
  const zone = myBB != null ? stackZone(myBB, cost > 0 ? stack / cost : 0) : null;
  const goZone = () => {
    if (!zone) return;
    // 스택·앤티 스냅샷은 도구가 실제로 열리는 시점(PushFoldChart 렌더)에만 소비된다.
    if (zone.tool === 'pushfold') writeSnap('tool:pushfold', { stack: zone.stack, ante: (ref?.ante ?? 0) > 0 } satisfies PushJump);
    // 탭 전환 → 도구 열기 시퀀스는 App 의 nuri:open-tool 리스너가 맡는다(항상 마운트 · e2e 도 같은 계약으로 검증).
    window.dispatchEvent(new CustomEvent('nuri:open-tool', { detail: zone.tool }));
  };
  const tone = vsAvg == null ? '' : vsAvg >= 100 ? 'text-emerald-400' : vsAvg >= 50 ? 'text-amber-300' : 'text-rose-400';
  return (
    <section className={['rounded-aura border bg-gradient-to-br from-accent-300/[0.12] to-transparent p-3',
      // hero: 링 헤어라인이 테두리를 대신하므로 accent 테두리는 절반으로(3중선 방지)
      hero ? 'border-accent-300/30 ring-aura ring-aura-glow' : 'border-accent-300/60'].join(' ')}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-bold text-accent-300"><Icon name="target" size={14} className="shrink-0" /><span className="truncate">내 토너 · <span className="text-ink-primary">{venueName}</span></span></p>
        {/* 일반 라이브 카드는 포스터·매장·관전 세 길을 다 갖는데 이 카드는 관전뿐이었다(연결 감사 G).
            헤더 폭은 매장명이 truncate 로 흡수하므로 짧은 라벨 셋이 한 줄에 선다(375·320 실측은 계약 파일 머리 참조). */}
        <div className="flex shrink-0 items-center gap-1">
          {onPoster && <button type="button" onClick={onPoster} data-testid="my-tour-poster" className="btn-ghost whitespace-nowrap px-2 py-1 text-2xs">포스터</button>}
          <button type="button" onClick={onVenue} data-testid="my-tour-venue" className="btn-ghost whitespace-nowrap px-2 py-1 text-2xs">매장</button>
          <button type="button" onClick={onDisplay} className="btn-ghost shrink-0 whitespace-nowrap px-2.5 py-1 text-2xs">관전 화면</button>
        </div>
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
      {/* 구간별 차트 한 줄 — 높이 고정(h-7)이라 스택 입력 전후 레이아웃 점프 0 */}
      {zone ? (
        <button type="button" onClick={goZone} data-testid="live-stack-hint"
          className="mt-2 flex h-7 w-full items-center justify-between rounded-input bg-surface-base/60 px-2 text-2xs font-bold text-accent-300">
          <span className="truncate">{zone.label}</span>
          <Icon name="chevron-right" size={14} className="shrink-0" />
        </button>
      ) : (
        <p className="mt-2 flex h-7 items-center px-2 text-2xs text-ink-muted" data-testid="live-stack-hint">스택을 입력하면 구간별 차트를 추천해요</p>
      )}
    </section>
  );
}
