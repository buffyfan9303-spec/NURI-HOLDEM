// src/components/features/LedgerStatsPanel.tsx
// 업주 전용 — 기간 통계(오늘/주/월/전체/요일평균, 할인 반영) + POS 설정.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../atoms/Toast';
import {
  type LedgerBuyin, type LedgerSession, type LedgerPlayer, type PaymentMethod, type VisitorType,
  wonToMan, buyinFinance, discountAmountOf, ledgerCounts, getLedgerRange, getLedgerPlayers, getBuyinRequestStats, type BuyinReqStats,
  posHasPassword, setPosCancelPassword, subscribeLedger,
} from '../../api/ledger';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { Skeleton } from '../atoms/Skeleton';
import { getMyVenueNotifyMute, setMyVenueNotifyMute } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { listVenueOwners, addVenueOwner, removeVenueOwner, transferVenuePrimary, type VenueOwner } from '../../api/community';
import CustomerAnalytics from './CustomerAnalytics';
import SegmentedTabs from '../atoms/SegmentedTabs';
import SlidingPill from '../atoms/SlidingPill';

const todayStr = () => new Date().toLocaleDateString('en-CA');
const shift = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
const METHOD_LABEL: Record<PaymentMethod, string> = { ticket: '티켓', cash: '현금', transfer: '이체', card: '카드', support: '지원' };
const VISITOR_LABEL: Record<VisitorType, string> = { new: '신규방문', regular: '기존손님', staff: '관계자', other: '기타' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

type Period = 'day' | 'week' | 'month' | 'all' | 'dow' | 'ai';
const PERIODS: { id: Period; label: string; ai?: boolean }[] = [
  { id: 'day', label: '당일' }, { id: 'week', label: '일주일' }, { id: 'month', label: '한 달' }, { id: 'all', label: '총괄' }, { id: 'dow', label: '요일별' },
  { id: 'ai', label: '운영 분석', ai: true },
];

export default function LedgerStatsPanel({ venueId }: { venueId: string }) {
  return (
    <div className="space-y-3">
      <StatsView venueId={venueId} />
      {/* 손님 관리 — 방문 고객 전체 행동 통계(바인·머니인·비율·미수·결제·시간대) */}
      <CustomerAnalytics venueId={venueId} />
    </div>
  );
}

// ── 통계 ──────────────────────────────────────────────────────────────────────
type DowRange = 'week' | 'month' | 'all';
const DOW_RANGE_OPTS: { id: DowRange; label: string }[] = [
  { id: 'week', label: '최근 7일' }, { id: 'month', label: '이번 달' }, { id: 'all', label: '전체' },
];

function StatsView({ venueId }: { venueId: string }) {
  // ⚠ 기간은 값이 **둘**이다(오너 제보 2026-09-06: "당일·일주일·한 달을 옮기면 스크롤이 깜빡이며 내려갔다 올라간다").
  //   tabPeriod = 방금 누른 탭(하이라이트는 즉시 — 응답이 늦으면 그게 더 큰 결함) /
  //   period    = **지금 화면에 그려져 있는 데이터의** 기간.
  //   하나로 두면 클릭 순간 '새 기간의 뼈대 + 옛 기간의 숫자'라는 어디에도 없는 상태가 한 번 그려지고,
  //   ~300ms 뒤 새 데이터로 또 한 번 그려진다. 당일→일주일 기준으로 레이아웃이 두 번 튄다:
  //     ① '바인 제외 · 손님 유형별' 카드가 즉시 사라짐(약 72px 위로)
  //     ② 데이터 도착 후 '일자별 추세'가 나타남(약 250px 아래로)
  //   그 두 번 사이의 짧은 구간이 사용자 눈에는 '깜빡이며 내려갔다 올라감'으로 보인다.
  //   데이터와 기간을 **같은 커밋에서** 바꾸면 튐은 한 번으로 줄고, 그 한 번은 사용자가 기다린 결과다.
  const [tabPeriod, setTabPeriod] = useState<Period>('day');
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(todayStr);
  const [dowRange, setDowRange] = useState<DowRange>('all'); // 요일별 분석 기간
  const [sessions, setSessions] = useState<LedgerSession[]>([]);
  const [buyins, setBuyins] = useState<LedgerBuyin[]>([]);
  const [players, setPlayers] = useState<LedgerPlayer[]>([]);
  const [excludeTypes, setExcludeTypes] = useState<Set<string>>(new Set()); // 제외할 손님유형 코드(new/regular/staff/other/none)
  const toggleExclude = (code: string) => setExcludeTypes((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const [loading, setLoading] = useState(true);
  // 통계는 '0원'과 '못 불러옴'이 시각적으로 같아서 특히 위험하다 — 매출이 0으로 보이면 사장님이 오판한다.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reportTick, setReportTick] = useState(0); // 운영 리포트 새로고침
  const [reportDays, setReportDays] = useState(7); // 운영 리포트 분석 기간(일) — 7/30/90
  const [trendMetric, setTrendMetric] = useState<'revenue' | 'entries' | 'players'>('revenue'); // 추세 그래프 지표
  const [trendDetail, setTrendDetail] = useState<string | null>(null); // 추세 막대 클릭 → 그날 상세
  const [reqStats, setReqStats] = useState<BuyinReqStats | null>(null); // 바인 요청 운영지표
  const [liveTick, setLiveTick] = useState(0); // 장부 실시간 변경 반영(당일 통계)

  const range = useMemo<{ from: string; to: string }>(() => {
    // 무엇을 **가져올지**는 방금 누른 탭이 정한다(period 는 이미 그려진 것의 기간이라 한 박자 늦다)
    const t = todayStr();
    if (tabPeriod === 'day')   return { from: date, to: date };
    if (tabPeriod === 'week') return { from: shift(t, -6), to: t };
    if (tabPeriod === 'ai') return { from: shift(t, -(reportDays - 1)), to: t };
    if (tabPeriod === 'month') return { from: t.slice(0, 7) + '-01', to: t };
    if (tabPeriod === 'dow') {
      if (dowRange === 'week')  return { from: shift(t, -6), to: t };
      if (dowRange === 'month') return { from: t.slice(0, 7) + '-01', to: t };
      return { from: '2000-01-01', to: t };
    }
    return { from: '2000-01-01', to: t }; // all
  }, [tabPeriod, date, dowRange, reportDays]);

  const hasLoaded = useRef(false);
  useEffect(() => {
    // ⚠ 늦게 도착한 이전 기간 응답이 최신 결과를 덮지 않게 한다(2026-09-07 감사).
    //   기간 탭에 디바운스·disabled 가 없어 연타가 가능한데, '총괄'(from 2000-01-01)은 느리고 '당일'은 빠르다 →
    //   총괄 → 당일 순으로 누르면 느린 총괄 응답이 나중에 도착해 **당일 탭 아래 전체 누적 매출·미수**가 그려졌다.
    //   그러면 알약(period)과 굵은 글씨(tabPeriod)까지 서로 다른 탭을 가리키고, 다음 클릭 전까지 자가 복구도 없다.
    //   React 가 다음 실행 전에 반드시 이전 cleanup 을 돌리므로 이 플래그 자체가 세대 가드다.
    //   catch 도 함께 막는다 — 늦게 온 실패가 최신 성공 위에 오류 카드를 띄우는 반대 방향 사고가 남는다.
    let alive = true;
    // 첫 진입만 로딩 표시 — period 전환 시엔 이전 데이터를 유지하며 부드럽게 갱신(스크롤 점프 방지)
    if (!hasLoaded.current) setLoading(true);
    Promise.all([
      getLedgerRange(venueId, range.from, range.to),
      tabPeriod === 'day' ? getLedgerPlayers(venueId, date) : Promise.resolve([] as LedgerPlayer[]),
      // 데이터와 기간을 한 커밋에 — 이 순서가 위 주석의 '두 번 튐'을 한 번으로 만든다.
    ]).then(([r, p]) => { if (!alive) return; setSessions(r.sessions); setBuyins(r.buyins); setPlayers(p); setPeriod(tabPeriod); setLoadError(null); })
      .catch((e) => { if (alive) setLoadError(e); })
      .finally(() => { hasLoaded.current = true; if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [venueId, range.from, range.to, tabPeriod, date, reportTick, liveTick]);

  // 바인 요청 운영지표(기간) — 요청수·승인율·평균 대기(분)
  // 위와 같은 이유로 cleanup 가드를 둔다 — 이쪽은 tabPeriod 를 안 보고 range 만 보므로,
  // 늦게 온 이전 기간의 요청수·승인율이 최신 값을 덮는 형태로 같은 사고가 난다.
  useEffect(() => {
    let alive = true;
    getBuyinRequestStats(venueId, range.from, range.to)
      .then((s) => { if (alive) setReqStats(s); })
      .catch(() => { if (alive) setReqStats(null); });
    return () => { alive = false; };
  }, [venueId, range.from, range.to, liveTick, reportTick]);

  // '당일' 통계를 보는 중 장부(바이인 등) 변경 시 실시간 갱신
  useEffect(() => {
    if (tabPeriod !== 'day') return;
    return subscribeLedger(venueId, () => setLiveTick((t) => t + 1));
  }, [venueId, tabPeriod]);

  // 멀티게임: 바인↔세션 페어링은 (날짜+게임) 키로(사이드 단가 정확). 날짜 합산은 sessionsByDate.
  const sessionByKey = useMemo(() => {
    const m = new Map<string, LedgerSession>();
    for (const s of sessions) m.set(`${s.sessionDate}#${s.gameSeq}`, s);
    return m;
  }, [sessions]);
  const sessionsByDate = useMemo(() => {
    const m = new Map<string, LedgerSession[]>();
    for (const s of sessions) { const a = m.get(s.sessionDate) ?? []; a.push(s); m.set(s.sessionDate, a); }
    return m;
  }, [sessions]);
  const bkey = (b: { sessionDate: string; gameSeq: number }) => `${b.sessionDate}#${b.gameSeq}`;
  // 플레이어명 → 손님유형 코드(new/regular/staff/other/none). 커스텀 텍스트 유형은 '기타', 무유형은 'none'.
  const playerType = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of players) {
      const vt = p.visitorType;
      const code = (vt === 'new' || vt === 'regular' || vt === 'staff' || vt === 'other') ? vt : (vt && vt.trim() ? 'other' : 'none');
      m.set(p.name, code);
    }
    return m;
  }, [players]);

  const m = useMemo(() => {
    const src = (period === 'day' && excludeTypes.size > 0) ? buyins.filter((b) => !excludeTypes.has(playerType.get(b.playerName) ?? 'none')) : buyins;
    const fin = (b: LedgerBuyin) => buyinFinance(b, sessionByKey.get(bkey(b)) ?? { buyinAmount: 0, cardAmount: null, discounts: [] });
    // 2026-09-11: underEntries('1 미만 엔트리' 건수)를 없앴다 — 바인은 언제나 1회라 1 미만이 나올 수 없다.
    let revenue = 0, unpaid = 0, support = 0, ticket = 0, ticketUnpaid = 0, entries = 0, discountCnt = 0, discountWon = 0;
    let grossSum = 0, discSum = 0;
    // ⚠ mainBuyins/sideBuyins 는 **횟수**, entries 는 **금액 엔트리**(소수). 화면 라벨과 반드시 짝을 맞춘다.
    let mainBuyins = 0, mainRev = 0, sideBuyins = 0, sideRev = 0; const sideGames = new Set<string>();
    const revByDate: Record<string, { mainRev: number; sideRev: number; mainB: number; sideB: number; players: Set<string> }> = {}; // 일자별 추세(매출·바이인 횟수·인원)
    const byMethod: Record<PaymentMethod, number> = { ticket: 0, cash: 0, transfer: 0, card: 0, support: 0 };
    const byPlayer: Record<string, number> = {};
    const playerSet = new Set<string>();
    const dates = new Set<string>();
    const dow: Record<number, { entries: number; revenue: number; unpaid: number; buyins: number; target: number; dates: Set<string>; players: Set<string>; sideE: number; sideRev: number }> = {};
    const unpaidByPlayer: Record<string, number> = {};
    for (const b of src) {
      const f = fin(b);
      revenue += f.paid; unpaid += f.unpaid; support += f.support; entries += f.entry;
      if (b.gameSeq > 1) { sideBuyins += 1; sideRev += f.paid; sideGames.add(bkey(b)); }
      else { mainBuyins += 1; mainRev += f.paid; }
      const rd = revByDate[b.sessionDate] ?? (revByDate[b.sessionDate] = { mainRev: 0, sideRev: 0, mainB: 0, sideB: 0, players: new Set<string>() });
      if (b.gameSeq > 1) { rd.sideRev += f.paid; rd.sideB += 1; } else { rd.mainRev += f.paid; rd.mainB += 1; }
      rd.players.add(b.playerName);
      grossSum += f.gross; discSum += f.disc;
      // 할인 이벤트가 적용된 바인(분납 포함 — discountIndex로 일원화).
      // #20: 건수만으론 '얼마를 덜 받았나'를 못 본다 — 그 회차 세션의 프리셋 금액으로 합계도 함께 쌓는다.
      if (b.discountIndex > 0) {
        const dw = discountAmountOf(sessionByKey.get(bkey(b)) ?? { discounts: [] }, b.discountIndex);
        if (dw > 0) { discountCnt++; discountWon += dw; }
      }
      ticket += f.ticketPaid; ticketUnpaid += f.ticketUnpaid;
      byMethod[b.paymentMethod]++;
      byPlayer[b.playerName] = (byPlayer[b.playerName] ?? 0) + 1;
      if (f.unpaid > 0) unpaidByPlayer[b.playerName] = (unpaidByPlayer[b.playerName] ?? 0) + f.unpaid;
      playerSet.add(b.playerName); dates.add(b.sessionDate);
      const w = new Date(b.sessionDate + 'T00:00:00').getDay();
      if (!dow[w]) dow[w] = { entries: 0, revenue: 0, unpaid: 0, buyins: 0, target: 0, dates: new Set(), players: new Set(), sideE: 0, sideRev: 0 };
      if (!dow[w].dates.has(b.sessionDate)) dow[w].target += (sessionsByDate.get(b.sessionDate) ?? []).reduce((a, s) => a + (s.targetEntries ?? 0), 0); // 날짜별(전 게임) 기준엔트리 1회만 합산
      dow[w].entries += f.entry; dow[w].revenue += f.paid; dow[w].unpaid += f.unpaid;
      dow[w].buyins++; dow[w].dates.add(b.sessionDate); dow[w].players.add(b.playerName);
      if (b.gameSeq > 1) { dow[w].sideE += 1; dow[w].sideRev += f.paid; }
    }
    const target = period === 'day' ? (sessionsByDate.get(date) ?? []).reduce((a, s) => a + (s.targetEntries ?? 0), 0) : 0;
    const visitor: Record<VisitorType, number> = { new: 0, regular: 0, staff: 0, other: 0 };
    for (const p of players) {
      if (!p.visitorType) continue;
      if (p.visitorType === 'new' || p.visitorType === 'regular' || p.visitorType === 'staff') visitor[p.visitorType]++;
      else visitor.other++;
    }
    const dayCount = dates.size;
    // 첫 바인·리바인은 장부·정산·클락과 같은 함수로 센다 — 여기서 따로 세면 규칙이 갈린다.
    const cnt = ledgerCounts(src);
    const cashLike = byMethod.cash + byMethod.transfer + byMethod.card;
    // 객단가 — 미수 포함(받을 돈까지). 관계자 제외는 자동으로 하지 않음(필요하면 위 '바인 제외 관계자' 필터로).
    const grossPerPlayer = playerSet.size ? (revenue + unpaid) / playerSet.size : 0;
    // 객단가는 **횟수**로 나눈다. 엔트리로 나누면 revenue ≈ entries × 단가 라서 언제나 단가가 나오는 죽은 지표가 된다.
    const grossPerEntry = cnt.totalBuyins > 0 ? (revenue + unpaid) / cnt.totalBuyins : 0;
    return {
      total: src.length, entries, buyinCount: cnt.totalBuyins, firstBuyins: cnt.firstBuyins, rebuys: cnt.rebuys, grossSum, discSum, players: playerSet.size, revenue, unpaid, support, ticket, ticketUnpaid,
      unpaid_cnt: src.filter((b) => fin(b).unpaid > 0).length,
      byMethod, ranking: Object.entries(byPlayer).sort((a, b) => b[1] - a[1]),
      unpaidRanking: Object.entries(unpaidByPlayer).sort((a, b) => b[1] - a[1]),
      // 기준 엔트리(GTD 목표) 대비는 **금액 엔트리**가 분자다 — 반값 손님은 목표를 0.5 명분만 채운다.
      target, fillRatio: target ? Math.round((entries / target) * 100) : null,
      perPlayer: playerSet.size ? cnt.totalBuyins / playerSet.size : 0,
      arpGuest: grossPerPlayer, // 1인당 (완납+미수)
      arpEntry: grossPerEntry,  // 바이인 1회당 (완납+미수)
      mainBuyins, mainRev, sideBuyins, sideRev, sideGameCount: sideGames.size,
      trend: Object.entries(revByDate).map(([d, v]) => ({ date: d, mainRev: v.mainRev, sideRev: v.sideRev, mainB: v.mainB, sideB: v.sideB, players: v.players.size })).sort((a, b) => (a.date < b.date ? -1 : 1)),
      dayCount, visitor, dow,
      avgBuyinPerDay: dayCount ? cnt.totalBuyins / dayCount : 0,
      avgRevenuePerDay: dayCount ? revenue / dayCount : 0,
      discountCnt, discountWon, discountRatio: src.length > 0 ? (discountCnt / src.length) * 100 : 0, // 전체 바인 중 할인 적용 비율
      cardRatio: cashLike > 0 ? (byMethod.card / cashLike) * 100 : 0,   // 현금성 결제 중 카드 비중
      unpaidRatio: revenue > 0 ? (unpaid / revenue) * 100 : 0,
    };
  }, [buyins, sessionByKey, sessionsByDate, players, excludeTypes, playerType, period, date]);

  // C2: 마감 시 저장된 클락 최종 보정치 합산(통계 보조 — 장부 바인과 별개 기준)
  const clockAgg = useMemo(() => {
    let games = 0, entries = 0, alive = 0, eliminations = 0, rebuys = 0, earlies = 0, addons = 0;
    for (const s of sessions) {
      const snap = s.clockSnapshot;
      if (!snap) continue;
      games++;
      entries += snap.entries || 0; alive += snap.alive || 0; eliminations += snap.eliminations || 0;
      rebuys += snap.rebuys || 0; earlies += snap.earlies || 0; addons += snap.addons || 0;
    }
    return games > 0 ? { games, entries, alive, eliminations, rebuys, earlies, addons } : null;
  }, [sessions]);

  // 불러오기 실패 — 숫자를 0으로 보여주면 사장님이 '오늘 매출 0'으로 오판한다.
  // 빈 통계와 실패는 완전히 다른 상태라, 실패는 실패로 말하고 다시 시도할 수단을 준다.
  if (loadError) {
    return (
      <section className="rounded-card border border-accent-400/30 bg-gradient-to-br from-accent-300/[0.05] to-transparent p-3 space-y-3">
        <h3 className="text-sm font-bold text-accent-300">통계</h3>
        <LoadErrorCard error={loadError} what="통계"
          onRetry={() => { setLoadError(null); setLiveTick((v) => v + 1); }} />
      </section>
    );
  }

  return (
    <section className="rounded-card border border-accent-400/30 bg-gradient-to-br from-accent-300/[0.05] to-transparent p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-accent-300">통계</h3>
        <div className="flex items-center gap-1.5">
          {/* 날짜 입력은 데이터가 아니라 **조작**이다 — 방금 누른 탭을 따라간다(range 가 tabPeriod 기준).
              파일 반출(CSV) 버튼은 오너 지시(2026-09-09)로 뺐다 — 통계는 화면 안에서만 본다. */}
          {tabPeriod === 'day' && <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} className="input text-xs py-1 w-auto" />}
        </div>
      </div>

      <div className="relative flex items-center gap-1 bg-surface-high rounded-input p-0.5 overflow-x-auto scrollbar-none">
            {/* AI 기간은 그라데이션이라 알약을 공용으로 못 쓴다 — 일반 기간에만 슬라이드 */}
            <SlidingPill activeKey={period} className="rounded-[6px] pill-active" />
        {PERIODS.map((p) => {
          const on = tabPeriod === p.id; // 하이라이트는 즉시 — 데이터를 기다리지 않는다
          return (
            <button key={p.id} type="button" data-pill-active={(on && !p.ai) || undefined} onClick={() => setTabPeriod(p.id)}
              className={['relative flex-1 min-w-[3.6rem] py-1.5 t-tab rounded-[6px] whitespace-nowrap transition-colors duration-[var(--dur-fast)] focus:outline-none',
                on ? 'font-bold text-white' : (p.ai ? 'text-violet-300' : 'text-ink-secondary hover:text-ink-primary')].join(' ')}>
              {/* AI 기간(그라데이션)은 자기 배경을 직접 칠한다 — 공용 알약은 숨김 */}
              {on && p.ai && <span aria-hidden className="absolute inset-0 rounded-[6px] bg-gradient-to-r from-violet-500 to-indigo-500 shadow animate-fade-in" />}
              <span className="relative inline-flex items-center justify-center gap-1">{p.ai && <Icon name="sparkles" size={11} className="shrink-0" />}{p.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        // 뼈대 높이를 실제 카드(StatCard min-h-[5.25rem] · Mini ≈ 3.1rem)와 맞춘다 —
        // '불러오는 중…' 한 줄이던 자리에 수백 px 통계가 들어오면서 화면이 아래로 주르륵 밀렸다.
        <div className="space-y-2" aria-busy="true">
          <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[5.25rem]" />)}</div>
          <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[5.25rem]" />)}</div>
          {/* 3.1rem(52.7px) 은 hint 없는 타일 기준이라 실제 첫 줄(객단가 hint 포함 71px)보다 18px 짧았다 —
              데이터가 들어오는 순간 그만큼 아래가 밀렸다. 880px 실측값으로 맞춘다. */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[4.2rem]" />)}</div>
        </div>
      ) : period === 'ai' ? (
        <div className="space-y-2">
          <SegmentedTabs grow className="flex w-full"
            items={[{ key: '7', label: '최근 7일' }, { key: '30', label: '30일' }, { key: '90', label: '90일' }]}
            value={String(reportDays)} onChange={(k) => setReportDays(Number(k))} />
          <OpsReport m={m} days={reportDays} onRefresh={() => setReportTick((t) => t + 1)} />
        </div>
      ) : period === 'dow' ? (
        <div className="space-y-2">
          <SegmentedTabs grow className="flex w-full"
            items={DOW_RANGE_OPTS.map((o) => ({ key: o.id, label: o.label }))}
            value={dowRange} onChange={setDowRange} />
          <DowStats dow={m.dow} rangeLabel={DOW_RANGE_OPTS.find((o) => o.id === dowRange)!.label} />
        </div>
      ) : (
        <>
          {period === 'day' && (
            <div className="rounded-input border border-border-default bg-surface-high px-2.5 py-2">
              <p className="text-xs font-semibold text-ink-secondary mb-1.5">바인 제외 · 손님 유형별 {excludeTypes.size > 0 && <span className="text-danger-light">({excludeTypes.size}개 제외 중)</span>}</p>
              <div className="grid grid-cols-5 gap-1">
                {([['new', '신규'], ['regular', '기존'], ['staff', '관계자'], ['other', '기타'], ['none', '미지정']] as const).map(([code, label]) => {
                  const on = excludeTypes.has(code);
                  return (
                    <button key={code} type="button" onClick={() => toggleExclude(code)}
                      className={['py-1.5 text-xs font-bold rounded-[6px] border transition-colors',
                        on ? 'bg-danger/15 text-danger-light border-danger/40' : 'bg-surface-base text-ink-secondary border-border-default hover:text-ink-primary'].join(' ')}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* '기록이 없어서 0' 과 '실제로 0원' 은 다른 상태다 — 숫자(0도 사실이다)는 그대로 두고 이유만 한 줄 덧붙인다.
              실패는 위쪽 LoadErrorCard 가 따로 말하므로, 여기서 셋이 서로 헷갈리지 않는다. */}
          {m.total === 0 && (
            <p className="flex items-start gap-1.5 rounded-input border border-border-default bg-surface-high px-2.5 py-2 text-2xs leading-relaxed text-ink-secondary">
              <Icon name="info" size={12} className="mt-px shrink-0 text-ink-muted" />
              <span>
                {excludeTypes.size > 0 && buyins.length > 0
                  ? '제외 필터에 걸려 집계할 바인이 남지 않았습니다. 위 ‘바인 제외’에서 유형을 해제해 보세요.'
                  : period === 'day' ? `${date} 장부에 기록된 바인이 없습니다.` : '이 기간 장부에 기록된 바인이 없습니다.'}
                {' '}아래 숫자가 0인 이유이며, 불러오기 실패가 아닙니다.
              </span>
            </p>
          )}

          {/* 주요 지표 — 아이콘 카드 */}
          {/* 2026-09-11: '총 엔트리' 는 소수가 될 수 없다 — 첫 바인·리바인으로 나눠 뜻을 분명히 한다.
              '할인 전 매출' 은 결제수단을 보지 않는 discountWon 을 더해 이용권·지원 할인까지 얹혔었다 →
              정상가 합계(grossSum)를 그대로 쓴다. */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="총 바이인" value={`${m.buyinCount.toLocaleString()}회`} sub={`첫 ${m.firstBuyins} · 리바인 ${m.rebuys}`} icon="users" />
            <StatCard label="할인 바인" value={`${m.discountCnt}건`} sub={`바인 중 ${m.discountRatio.toFixed(1)}%`} icon="down" />
            <StatCard label="총 할인액" value={`${m.discountWon.toLocaleString()} 원`} sub={m.grossSum > 0 ? `정상가 ${wonToMan(m.grossSum)}만원` : '할인 없음'} icon="percent" gold />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="완납 매출액" value={`${m.revenue.toLocaleString()} 원`} icon="wallet" emerald />
            <StatCard label="미수 금액" value={`${m.unpaid.toLocaleString()} 원`} icon="alert" danger={m.unpaid > 0} />
            <StatCard label="회수 티켓" value={`${m.ticket.toLocaleString(undefined, { maximumFractionDigits: 1 })}T`} icon="ticket" gold sub={m.ticketUnpaid > 0 ? `미수 ${m.ticketUnpaid.toLocaleString(undefined, { maximumFractionDigits: 1 })}T` : '1T = 1만원'} />
          </div>

          {/* 보조 지표 */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {period === 'day'
              ? <Mini label="기준 달성률" value={m.fillRatio !== null ? `${m.fillRatio}%` : '-'} />
              : <Mini label="영업일수" value={`${m.dayCount}일`} />}
            {period !== 'day' && <Mini label="일평균 바이인" value={m.avgBuyinPerDay.toFixed(1)} />}
            <Mini label="플레이어" value={`${m.players}명`} />
            <Mini label="바이인/인" value={m.perPlayer ? m.perPlayer.toFixed(1) : '0'} />
            <Mini label="객단가/인" value={`${wonToMan(Math.round(m.arpGuest))}만`} hint="미수 포함" />
            <Mini label="객단가/바이인" value={`${wonToMan(Math.round(m.arpEntry))}만`} hint="미수 포함" />
            {period === 'day'
              ? <Mini label="가게지원" value={`${m.support}건`} />
              : <Mini label="일평균 매출" value={`${m.avgRevenuePerDay.toLocaleString(undefined, { maximumFractionDigits: 0 })}원`} hint="완납 기준" />}
          </div>

          {reqStats && reqStats.total > 0 && (
            <Section icon="users" title="바인 요청 현황" suffix="· 손님 QR 요청">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Mini label="요청" value={`${reqStats.total}`} />
                <Mini label="승인" value={`${reqStats.approved}`} tone="emerald" />
                <Mini label="승인율" value={`${reqStats.approveRate}%`} tone="accent" />
                {/* 대기 기록이 없을 때 ' · ' 를 찍으면 '0분'인지 '아직 없음'인지 구분이 안 됐다 */}
                <Mini label="평균 대기" value={reqStats.avgWaitMin != null ? `${reqStats.avgWaitMin}분` : '-'} />
              </div>
            </Section>
          )}

          {m.sideGameCount > 0 && (
            <Section icon="users" title="게임별 구분" suffix="· 메인 / 사이드">
              <div className="grid grid-cols-2 gap-1.5">
                {/* 두 타일은 같은 지표(엔트리·매출)를 좌우로 비교한다 — 중앙정렬이면 '12'와 '3.5'가 서로 다른 x 에 놓여
                    한눈에 대소를 못 읽는다. 좌측 정렬이라야 같은 폭 타일끼리 값의 시작점이 세로로 맞는다. */}
                <div className="rounded-input bg-surface-high border border-border-default px-2.5 py-2">
                  <p className="text-2xs text-ink-muted">메인</p>
                  <p className="text-sm font-bold text-ink-primary tabular-nums">{m.mainBuyins.toLocaleString()}회</p>
                  <p className="text-2xs text-emerald-400 tabular-nums">완납 {wonToMan(m.mainRev)}만</p>
                </div>
                <div className="rounded-input bg-accent-300/[0.06] border border-accent-400/30 px-2.5 py-2">
                  <p className="text-2xs text-accent-300">사이드 · {m.sideGameCount}게임</p>
                  <p className="text-sm font-bold text-ink-primary tabular-nums">{m.sideBuyins.toLocaleString()}회</p>
                  <p className="text-2xs text-emerald-400 tabular-nums">완납 {wonToMan(m.sideRev)}만</p>
                </div>
              </div>
            </Section>
          )}

          {period !== 'day' && m.trend.length >= 2 && (() => {
            const stacked = trendMetric !== 'players';
            const totals = m.trend.map((d) => trendMetric === 'revenue' ? d.mainRev + d.sideRev : trendMetric === 'entries' ? d.mainB + d.sideB : d.players);
            const max = Math.max(1, ...totals);
            const fmt = (n: number) => trendMetric === 'revenue' ? `${wonToMan(n)}만` : trendMetric === 'entries' ? n.toFixed(n % 1 ? 1 : 0) : `${n}명`;
            return (
              <Section icon="wallet" title="일자별 추세" suffix={trendMetric === 'revenue' ? '· 매출' : trendMetric === 'entries' ? '· 바이인' : '· 인원'}>
                <SegmentedTabs grow className="flex w-full mb-2"
                  items={[{ key: 'revenue', label: '매출' }, { key: 'entries', label: '바이인' }, { key: 'players', label: '인원' }]}
                  value={trendMetric} onChange={(k) => setTrendMetric(k as 'revenue' | 'entries' | 'players')} />
                <div className="flex items-end gap-1 overflow-x-auto pb-1">
                  {m.trend.map((d, i) => {
                    const total = totals[i];
                    const side = trendMetric === 'revenue' ? d.sideRev : trendMetric === 'entries' ? d.sideB : 0;
                    const barPx = total > 0 ? Math.round((total / max) * 88) + 4 : 2;
                    const sidePx = stacked && total > 0 ? Math.round((side / total) * barPx) : 0;
                    return (
                      <button key={d.date} type="button" onClick={() => setTrendDetail(trendDetail === d.date ? null : d.date)}
                        className={['flex flex-col items-center gap-1 shrink-0 w-8 rounded-sm cursor-pointer pt-0.5', trendDetail === d.date ? 'bg-accent-300/15 ring-1 ring-accent-400/50' : 'hover:bg-surface-high/50'].join(' ')}
                        title={`${d.date} · ${fmt(total)}${stacked && side > 0 ? ` (사이드 ${fmt(side)})` : ''}`}>
                        <div className="w-5 rounded-t-sm overflow-hidden flex flex-col-reverse bg-surface-high" style={{ height: barPx }}>
                          <div className="bg-emerald-500 flex-1" />
                          {stacked && <div className="bg-accent-300" style={{ height: sidePx }} />}
                        </div>
                        <span className="text-[10px] text-ink-muted tabular-nums leading-none">{d.date.slice(5).replace('-', '/')}</span>
                      </button>
                    );
                  })}
                </div>
                {stacked && (
                  <div className="flex items-center gap-3 mt-1.5 text-2xs text-ink-muted">
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> 메인</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-accent-300" /> 사이드</span>
                    <span className="text-ink-muted/70">· 막대 탭 = 그날 상세</span>
                  </div>
                )}
                {trendDetail && (() => {
                  const d = m.trend.find((x) => x.date === trendDetail);
                  if (!d) return null;
                  const f1 = (n: number) => n.toFixed(n % 1 ? 1 : 0);
                  return (
                    <div className="mt-2 rounded-input border border-accent-400/30 bg-accent-300/[0.06] p-2.5">
                      <p className="text-2xs font-bold text-accent-300 mb-1.5">{d.date} 상세</p>
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        <div><p className="text-2xs text-ink-muted">바이인</p><p className="text-sm font-bold text-ink-primary tabular-nums">{f1(d.mainB + d.sideB)}</p><p className="text-[10px] text-ink-muted">메인 {f1(d.mainB)} · 사이드 {f1(d.sideB)}</p></div>
                        <div><p className="text-2xs text-ink-muted">매출</p><p className="text-sm font-bold text-emerald-400 tabular-nums">{wonToMan(d.mainRev + d.sideRev)}만</p><p className="text-[10px] text-ink-muted">메인 {wonToMan(d.mainRev)} · 사이드 {wonToMan(d.sideRev)}</p></div>
                        <div><p className="text-2xs text-ink-muted">인원</p><p className="text-sm font-bold text-ink-primary tabular-nums">{d.players}명</p></div>
                      </div>
                    </div>
                  );
                })()}
              </Section>
            );
          })()}

          {clockAgg && (
            <Section icon="clock" title="클락 최종 (보정 포함)" suffix="· 운영자 클락 집계">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Mini label="엔트리" value={`${clockAgg.entries}`} tone="accent" />
                <Mini label="생존" value={`${clockAgg.alive}`} tone="emerald" />
                <Mini label="아웃" value={`${clockAgg.eliminations}`} />
                <Mini label="얼리(칩단위)" value={`${clockAgg.earlies}`} tone="amber" />
              </div>
              <p className="text-2xs text-ink-muted mt-1.5 leading-relaxed">
                마감 시 클락에서 손보정된 최종 수치(생존·아웃 포함)입니다. <b className="text-ink-secondary">장부 총 바이인({m.entries.toLocaleString()}회)은 바인 기록 기준</b>이라 다를 수 있어요. 통계·정산은 장부 기준, 이 값은 운영 참고용입니다. 얼리는 <b className="text-ink-secondary">기준칩 배수 합</b>(더블얼리 1명 = 2)이며, 2026-08-30 이전 마감분은 인원 수로 기록돼 있어 그대로 표시됩니다.{clockAgg.games > 1 ? ` (게임 ${clockAgg.games}개 합산)` : ''}
              </p>
            </Section>
          )}

          <Section icon="card" title="결제 수단별 바인 수">
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {(['ticket', 'cash', 'transfer', 'card', 'support'] as PaymentMethod[]).map((k) => (
                <Mini key={k} label={METHOD_LABEL[k]} value={`${m.byMethod[k]}`} />
              ))}
            </div>
          </Section>

          {period === 'day' && (m.visitor.new + m.visitor.regular + m.visitor.staff + m.visitor.other) > 0 && (
            <Section icon="usercheck" title="방문 유형" suffix="(명단 기준)">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {(['new', 'regular', 'staff', 'other'] as VisitorType[]).map((k) => (
                  <Mini key={k} label={VISITOR_LABEL[k]} value={`${m.visitor[k]}`} />
                ))}
              </div>
            </Section>
          )}

          <Section icon="trophy" title="바인 횟수 순위 (TOP 10)">
            {m.ranking.length === 0 ? (
              <p className="text-2xs text-ink-muted text-center py-2">이 기간 바인 기록 없음</p>
            ) : (
              <ul className="space-y-1">
                {m.ranking.slice(0, 10).map(([name, cnt], i) => (
                  <li key={name} className="flex items-center gap-2 px-2 py-2 rounded-input bg-surface-high border border-border-default">
                    <span className={['w-5 text-center text-xs font-bold tabular-nums', i === 0 ? 'text-accent-300' : i === 2 ? 'text-amber-600' : 'text-ink-secondary'].join(' ')}>{i + 1}</span>
                    {/* 긴 닉네임은 잘리되 title 로 전체를 볼 수 있게 — 잘린 이름만 남으면 누구인지 확인할 길이 없다 */}
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary" title={name}>{name}</span>
                    <span className="w-14 shrink-0 text-right text-xs font-bold text-ink-secondary tabular-nums">{cnt}회</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon="alert" title="미수 내역">
            {m.unpaidRanking.length === 0 ? (
              <p className="text-2xs text-ink-muted text-center py-2">미수 없음</p>
            ) : (
              <ul className="space-y-1">
                {m.unpaidRanking.map(([name, amt]) => (
                  <li key={name} className="flex items-center gap-2 px-2 py-2 rounded-input bg-danger/[0.06] border border-danger/30">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary" title={name}>{name}</span>
                    {/* 합계 행과 같은 폭·같은 우측 정렬 — 금액 자릿수가 세로로 맞아야 큰 미수가 눈에 띈다 */}
                    <span className="w-28 shrink-0 text-right text-xs font-bold text-danger-light tabular-nums">{amt.toLocaleString()}원</span>
                  </li>
                ))}
                <li className="flex items-center gap-2 border border-transparent px-2 pt-1 text-2xs">
                  <span className="min-w-0 flex-1 text-ink-muted">미수 합계</span>
                  <span className="w-28 shrink-0 text-right font-extrabold text-danger-light tabular-nums">{m.unpaid.toLocaleString()}원</span>
                </li>
              </ul>
            )}
          </Section>
        </>
      )}
    </section>
  );
}

type DowRow = {
  w: number; days: number; entries: number; revenue: number; unpaid: number; buyins: number; players: number;
  target: number; fill: number | null;
  avgEntry: number; avgRevenue: number; perEntry: number;
};
function DowStats({ dow, rangeLabel = '전체' }: { dow: Record<number, { entries: number; revenue: number; unpaid: number; buyins: number; target: number; dates: Set<string>; players: Set<string> }>; rangeLabel?: string }) {
  const [metric, setMetric] = useState<'fill' | 'entry' | 'revenue'>('fill');
  const rows: DowRow[] = [1, 2, 3, 4, 5, 6, 0].map((w) => {
    const d = dow[w];
    const days = d ? d.dates.size : 0;
    const entries = d?.entries ?? 0;   // 금액 엔트리 — fill 전용
    const buyins = d?.buyins ?? 0;     // 횟수 — 그 외 전부
    const revenue = d?.revenue ?? 0;
    const target = d?.target ?? 0;
    return {
      w, days, entries, revenue, unpaid: d?.unpaid ?? 0, buyins, players: d ? d.players.size : 0,
      // fill(기준 달성률)만 금액 엔트리로 잰다 — 기준 엔트리가 GTD 목표라서다.
      // 나머지(일평균·객단가)는 횟수 기준. 매출 ÷ 금액엔트리 는 언제나 단가가 나와 아무 정보가 없다.
      target, fill: target > 0 ? (entries / target) * 100 : null,
      avgEntry: days ? buyins / days : 0,
      avgRevenue: days ? revenue / days : 0,
      perEntry: buyins ? revenue / buyins : 0,
    };
  });
  const active = rows.filter((r) => r.days > 0);
  if (active.length === 0) {
    return <p className="text-center py-6 text-2xs text-ink-muted">해당 기간에 장부 데이터가 없습니다.</p>;
  }
  const best  = active.reduce((a, b) => (b.avgEntry > a.avgEntry ? b : a));
  const worst = active.reduce((a, b) => (b.avgEntry < a.avgEntry ? b : a));
  const meanAvg = active.reduce((s, r) => s + r.avgEntry, 0) / active.length;
  const maxAvgEntry = Math.max(...rows.map((r) => r.avgEntry), 0.1);
  const maxAvgRev   = Math.max(...rows.map((r) => r.avgRevenue), 1);
  const totalDays    = rows.reduce((s, r) => s + r.days, 0);
  const totalBuyins  = rows.reduce((s, r) => s + r.buyins, 0);
  const totalEntries = rows.reduce((s, r) => s + r.entries, 0);  // 달성률 분자
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalTarget  = rows.reduce((s, r) => s + r.target, 0);
  const overallFill  = totalTarget > 0 ? Math.round((totalEntries / totalTarget) * 100) : null;
  const multi = active.length > 1;

  return (
    <div className="space-y-3">
      {/* 이 표의 매출·객단가는 전부 완납(실제 수납) 기준이다 — 기간 탭의 '객단가/인'(미수 포함)과 산식이 달라 한 줄로 못박는다. */}
      <p className="text-2xs text-ink-muted">요일별 통계 · {rangeLabel} 기준 · 영업 {totalDays}일 · 매출·객단가는 <b className="text-ink-secondary">완납(실제 수납) 기준</b> · <b className="text-ink-secondary">핵심: 기준 엔트리 달성률</b></p>

      {/* 요약 — 기준 달성률 핵심 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label="기준 달성률" value={overallFill !== null ? `${overallFill}%` : '기준 미설정'} />
        <Mini label="영업일" value={`${totalDays}일`} />
        <Mini label="총 바이인" value={`${totalBuyins.toLocaleString()}회`} />
        <Mini label="총 매출(만)" value={wonToMan(totalRevenue)} hint="완납 기준" />
      </div>

      {/* 최고 / 최저 요일 하이라이트 */}
      <div className="grid grid-cols-2 gap-2">
        <DowHilite tone="emerald" cap="가장 활발한 요일" w={best.w}
          a={`일평균 ${best.avgEntry.toFixed(1)}회`} b={`${wonToMan(best.avgRevenue)}만/일 · 완납 객단가 ${wonToMan(best.perEntry)}만`} />
        <DowHilite tone="rose" cap="가장 부진한 요일" w={worst.w}
          a={`일평균 ${worst.avgEntry.toFixed(1)}회`} b={multi ? `${wonToMan(worst.avgRevenue)}만/일 · 완납 객단가 ${wonToMan(worst.perEntry)}만` : '비교할 다른 요일 데이터 필요'} />
      </div>

      {/* 막대 차트 — 엔트리/매출 토글 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-2xs font-semibold text-ink-secondary">요일별 {metric === 'fill' ? '기준 엔트리 달성률' : metric === 'entry' ? '일평균 바이인' : '일평균 매출'}</p>
          <div className="flex gap-0.5 bg-surface-high rounded-input p-0.5">
            {([['fill', '달성률'], ['entry', '바이인'], ['revenue', '매출']] as const).map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => setMetric(k)}
                className={['px-2 py-0.5 text-2xs font-bold rounded-[5px] transition-colors',
                  metric === k ? 'bg-accent-300 text-white' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>{lbl}</button>
            ))}
          </div>
        </div>
        <ul className="space-y-1">
          {rows.map((r) => {
            const val = metric === 'fill' ? (r.fill ?? 0) : metric === 'entry' ? r.avgEntry : r.avgRevenue;
            const max = metric === 'fill' ? 100 : metric === 'entry' ? maxAvgEntry : maxAvgRev;
            const pct = max > 0 ? Math.min(100, (val / max) * 100) : 0;
            const isBest = multi && r.w === best.w;
            const isWorst = multi && r.w === worst.w && r.days > 0;
            const barColor = r.days === 0 ? 'bg-surface-high' : isBest ? 'bg-emerald-500/75' : isWorst ? 'bg-rose-500/65' : 'bg-accent-300/55';
            return (
              <li key={r.w} className="flex items-center gap-2">
                <span className={['w-4 text-center text-xs font-bold', isBest ? 'text-emerald-400' : isWorst ? 'text-rose-400' : 'text-accent-300'].join(' ')}>{DOW[r.w]}</span>
                <div className="flex-1 h-5 rounded bg-surface-high overflow-hidden">
                  <div className={['h-full rounded-r transition-[width] duration-[var(--dur-panel)]', barColor].join(' ')} style={{ width: `${r.days ? Math.max(pct, 3) : 0}%` }} />
                </div>
                <span className="w-16 text-right text-2xs tabular-nums text-ink-secondary">
                  {r.days ? (metric === 'fill' ? (r.fill !== null ? `${Math.round(r.fill)}%` : '기준없음') : metric === 'entry' ? val.toFixed(1) : `${wonToMan(val)}만`) : '휴무'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 상세 표 */}
      {/* 비교하는 숫자 열은 우측 정렬 + tabular-nums 로 자릿수를 세로로 맞춘다.
          가운데 정렬이면 '3.0' 과 '12.4' 의 일의 자리가 서로 다른 x 에 놓여, 요일 간 대소를 눈으로 못 훑는다.
          머리글도 같은 우측 정렬 — 머리와 값의 정렬이 어긋나면 어느 열인지 매번 다시 확인해야 한다. */}
      <div className="overflow-x-auto scrollbar-none">
        <table className="w-full text-left border-separate border-spacing-0 min-w-[19rem]">
          <thead><tr className="text-2xs text-ink-muted">
            <th scope="col" className="py-1 pl-1 font-normal">요일</th>
            <th scope="col" className="py-1 pr-1 text-right font-normal">영업일</th>
            <th scope="col" className="py-1 pr-1 text-right font-normal"><span className="block">일평균</span>바이인</th>
            <th scope="col" className="py-1 pr-1 text-right font-normal"><span className="block">일평균</span>매출(만)</th>
            <th scope="col" className="py-1 pr-1 text-right font-normal"><span className="block">완납 객단가</span>(만)</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.w} className={['text-xs', r.days === 0 ? 'opacity-40' : ''].join(' ')}>
                <th scope="row" className="py-1.5 pl-1 text-left font-bold text-accent-300">{DOW[r.w]}</th>
                <td className="pr-1 text-right text-ink-secondary tabular-nums">{r.days || '-'}</td>
                <td className={['pr-1 text-right tabular-nums font-bold', r.w === best.w && multi ? 'text-emerald-400' : r.w === worst.w && multi ? 'text-rose-400' : 'text-ink-primary'].join(' ')}>{r.days ? r.avgEntry.toFixed(1) : '-'}</td>
                <td className="pr-1 text-right text-ink-secondary tabular-nums">{r.days ? wonToMan(r.avgRevenue) : '-'}</td>
                <td className="pr-1 text-right text-ink-secondary tabular-nums">{r.buyins ? wonToMan(r.perEntry) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 인사이트 */}
      <p className="text-[11px] text-ink-secondary bg-surface-low/70 border border-border-default rounded-input p-2.5 leading-relaxed">
        <Icon name="lightbulb" size={12} className="mr-0.5 inline-block align-[-1px] shrink-0 text-accent-300" />{multi
          ? <>{DOW[worst.w]}요일이 일평균 <b className="text-rose-300">{worst.avgEntry.toFixed(1)}</b>회로 가장 저조합니다(전체 평균 {meanAvg.toFixed(1)}). 반대로 <b className="text-emerald-300">{DOW[best.w]}</b>요일이 {best.avgEntry.toFixed(1)}로 가장 활발합니다. {DOW[worst.w]}요일에 집객 이벤트(얼리버드 칩업·신규 할인·보장 토너먼트)를 배치해 보세요.</>
          : <>아직 한 요일({DOW[best.w]})만 집계됐습니다. 다른 요일도 운영되면 요일 간 비교·약한 요일 진단을 표시합니다.</>}
      </p>
    </div>
  );
}

function DowHilite({ tone, cap, w, a, b }: { tone: 'emerald' | 'rose'; cap: string; w: number; a: string; b: string }) {
  const ring = tone === 'emerald' ? 'border-emerald-500/40 bg-emerald-500/[0.07]' : 'border-rose-500/40 bg-rose-500/[0.07]';
  const head = tone === 'emerald' ? 'text-emerald-300' : 'text-rose-300';
  return (
    <div className={['rounded-card border p-2.5', ring].join(' ')}>
      <p className="text-2xs text-ink-muted">{cap}</p>
      <p className={['text-lg font-extrabold leading-tight', head].join(' ')}>{DOW[w]}요일</p>
      <p className="text-[11px] text-ink-primary mt-0.5 leading-tight tabular-nums">{a}</p>
      <p className="text-2xs text-ink-muted mt-0.5 leading-tight tabular-nums">{b}</p>
    </div>
  );
}

type IconName = 'users' | 'down' | 'percent' | 'wallet' | 'alert' | 'ticket' | 'card' | 'usercheck' | 'trophy' | 'clock';
const ICON_PATHS: Record<IconName, ReactNode> = {
  users: <><circle cx="9" cy="7" r="3" /><path d="M2 20a7 7 0 0 1 14 0" /><path d="M17 7.5a3 3 0 0 1 0 5" /><path d="M22 20a6 6 0 0 0-4-5.7" /></>,
  down: <><polyline points="3 7 9 13 13 9 21 17" /><polyline points="15 17 21 17 21 11" /></>,
  percent: <><line x1="19" y1="5" x2="5" y2="19" /><circle cx="7.5" cy="7.5" r="2.2" /><circle cx="16.5" cy="16.5" r="2.2" /></>,
  wallet: <><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20" /><circle cx="17" cy="14" r="1" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16.3" x2="12" y2="16.5" /></>,
  ticket: <><path d="M3 9a2 2 0 0 0 0 6v2a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-2a2 2 0 0 0 0-6V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1Z" /><line x1="15" y1="6" x2="15" y2="18" strokeDasharray="2 2" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>,
  usercheck: <><circle cx="9" cy="7" r="3" /><path d="M2 20a7 7 0 0 1 12-5" /><polyline points="15.5 13.5 17.5 15.5 21.5 11.5" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0Z" /><path d="M7 6H4v1.5a3 3 0 0 0 3 3" /><path d="M17 6h3v1.5a3 3 0 0 1-3 3" /><line x1="12" y1="14" x2="12" y2="17" /><line x1="8.5" y1="20" x2="15.5" y2="20" /><line x1="10" y1="17" x2="14" y2="17" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
};
function StatIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>{ICON_PATHS[name]}</svg>;
}

function StatCard({ label, value, sub, icon, danger, emerald, gold }: { label: string; value: string; sub?: string; icon: IconName; danger?: boolean; emerald?: boolean; gold?: boolean }) {
  const c = danger ? 'text-danger-light' : emerald ? 'text-emerald-400' : gold ? 'text-accent-300' : 'text-ink-primary';
  return (
    <div className="flex min-h-[5.25rem] flex-col rounded-aura border card-aura p-2.5">
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-medium leading-tight text-ink-secondary">{label}</p>
        <StatIcon name={icon} className="shrink-0 text-ink-muted" />
      </div>
      <p className={['mt-auto pt-2 text-lg font-extrabold leading-none tabular-nums', c].join(' ')}>{value}</p>
      {/* ⚠ 보조 줄은 **반드시 한 줄**이어야 한다. 자리만 예약하고 줄 수를 안 묶으면, 실제 폭
          (412px 3칸 = 카드 111px)에서 '전체 바인 중 0.0%' 가 두 줄로 접혀 그 카드만 값이 14px 올라간다
          — 로그인 화면 실측에서 잡았다(2026-09-06). 넓은 하네스에서는 안 접혀 안 보이던 결함이다.
          긴 문구는 호출부에서 짧게 쓴다 — truncate 는 잘림 방지 안전망이지 해법이 아니다. */}
      <p className="mt-1 truncate text-[11px] leading-tight tabular-nums text-ink-muted" title={sub || undefined}>{sub || '\u00A0'}</p>
    </div>
  );
}

// 지표 타일 — 통계 화면의 작은 숫자 칸은 전부 이 하나로 모은다.
// (요청/승인·결제수단·방문유형·클락 집계가 각자 py-1.5 인라인 div 를 복사해 쓰고 있었고,
//  그래서 같은 성격의 칸인데 줄마다 높이·여백이 미세하게 달랐다.)
type MiniTone = 'default' | 'emerald' | 'accent' | 'amber';
const MINI_TONE: Record<MiniTone, string> = {
  default: 'text-ink-primary', emerald: 'text-emerald-400', accent: 'text-accent-300', amber: 'text-amber-300',
};
// ⚠ 정렬 규격(2026-09-06 오너 지시 "전부 레이아웃이 엉망 — 어떤건 위로 치우치고 어떤건 중앙이고 어떤건 3줄"):
//  ① **왼쪽 정렬**. 중앙정렬이면 '2일' 과 '1,875,000원' 의 시작점이 타일마다 달라 같은 폭끼리도 세로로 안 맞는다
//     (바로 아래 '게임별 구분' 타일이 이미 같은 이유로 좌측 정렬이다 — 두 규격이 한 화면에 있었다).
//  ② **라벨이 위, 값이 아래**. 종전엔 값이 위·라벨이 아래라 바로 위 StatCard(라벨 위)와 읽는 순서가 거꾸로였다.
//  ③ 값의 y 는 라벨 한 줄 높이로 고정 — hint 유무로 3줄이 되어도 **값 밑변은 행 전체가 같다**.
function Mini({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: MiniTone }) {
  return (
    <div className="rounded-input border border-border-default bg-surface-high px-2 py-2">
      <p className="truncate text-[11px] leading-tight text-ink-muted" title={label}>{label}</p>
      <p className={['mt-1 text-base font-bold leading-none tabular-nums', MINI_TONE[tone]].join(' ')}>{value}</p>
      {hint && <p className="mt-1 text-[10px] leading-tight text-ink-muted/70">{hint}</p>}
    </div>
  );
}

function Section({ icon, title, suffix, children }: { icon: IconName; title: string; suffix?: string; children: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary mb-1.5">
        <StatIcon name={icon} className="text-ink-muted" />
        {title}{suffix && <span className="text-ink-muted font-normal"> {suffix}</span>}
      </p>
      {children}
    </div>
  );
}

// ── 운영 리포트(결정론적 로컬 계산) ──────────────────────────────────────────
//
// ⚠ 외부 AI 를 부르지 않는다. `src/api/aiSurface.test.ts` 가 이 계약을 소스 수준에서 잠근다.
//
// 2026-09-11 정리(오너 지시) — 예전 규칙에는 네 가지 문제가 있었다:
//   ① 표본 가드가 `total === 0` 뿐이라 **바인 1건에도 "○요일이 가장 부진합니다"** 를 단정했다.
//   ② 비용 데이터가 없는데 "마진 하락의 원인" 이라고 말했다 — 장부에 상금·인건비·임대료가 없다.
//   ③ "상위 바인 유저 ○○ 님에게 티켓을 리워드로" — 근거 없는 일률 권고에 **고객 실명까지** 리포트에 실었다.
//   ④ "새틀라이트·하이롤러 같은 사이드를 추가" — 데이터 없이 특정 대회 형식을 추천했다.
//
// 그래서 규칙마다 셋을 강제한다:
//   · 최소 표본 — 못 넘기면 문장을 만들지 않고 '판단할 데이터가 부족합니다'
//   · 비교 기준 — 무엇 대비인지 문장 안에 적는다
//   · 근거 수치 — 제안마다 basis 를 함께 돌려 화면이 '왜 이 제안인지'를 보여준다

/** 어떤 진단이든 이 아래면 문장을 만들지 않는다.
 *  근거: 바인 10건이면 1건이 비율을 10%p 흔든다 — 그 이하에서 '비중이 높다/낮다'는 말은 잡음이다.
 *  영업 3일은 요일 비교에 필요한 최소 관측점(아래 MIN_DOW_REPEAT)과 짝을 이루는 하한이다. */
const MIN_BUYINS = 10;
const MIN_DAYS = 3;
/** 요일 비교는 각 요일이 최소 2번은 돌아야 한 번의 이상치가 결론이 되지 않는다. */
const MIN_DOW_REPEAT = 2;

/** 실행 제안 — 문장과 **그 근거 수치**를 항상 같이 낸다(근거 없이 뜨는 제안을 만들지 않기 위해). */
export interface OpsAction { text: string; basis: string }

export interface OpsReportResult {
  /** 기간에 바인 기록이 아예 없다 */
  empty: boolean;
  /** 기록은 있지만 최소 표본에 못 미쳐 **진단을 만들지 않았다** */
  lowSample: boolean;
  /** 데이터 신뢰도 — 화면이 그대로 보여준다(§리포트 9. 데이터 신뢰도) */
  coverage: { days: number; buyins: number; players: number; dowReady: boolean };
  sales: string; risk: string; weekday: string;
  actions: OpsAction[];
}

interface StatsAgg {
  total: number; entries: number; revenue: number; unpaid: number; players: number; ticket: number;
  cardRatio: number; unpaidRatio: number; discountRatio: number; discountCnt: number; discSum: number;
  ranking: [string, number][];
  mainBuyins: number; mainRev: number; sideBuyins: number; sideRev: number; sideGameCount: number;
  dow: Record<number, { entries: number; revenue: number; unpaid: number; buyins: number; dates: Set<string>; players: Set<string>; sideE: number; sideRev: number }>;
}

function buildOpsReport(m: StatsAgg, days = 7): OpsReportResult {
  const man = (won: number) => wonToMan(won);
  const periodLabel = days <= 7 ? '최근 7일' : `최근 ${days}일`;
  // 영업일 = 실제로 바인이 있었던 날. days 는 '조회 창'이라 휴무일까지 센다 — 표본은 영업일로 재야 한다.
  const openDays = new Set<string>();
  for (const d of Object.values(m.dow)) for (const dt of d.dates) openDays.add(dt);
  const coverageBase = { days: openDays.size, buyins: m.total, players: m.players };

  if (m.total === 0) {
    return { empty: true, lowSample: false, coverage: { ...coverageBase, dowReady: false },
             sales: '', risk: '', weekday: '', actions: [] };
  }

  // 요일 비교 자격 — **각 요일이 2회 이상 돌아간** 요일만 비교 대상이다.
  const dows = Object.entries(m.dow)
    .map(([w, d]) => ({ w: Number(w), n: d.dates.size, avg: d.dates.size ? d.buyins / d.dates.size : 0, rev: d.dates.size ? d.revenue / d.dates.size : 0 }))
    .filter((d) => d.n >= MIN_DOW_REPEAT);
  const dowReady = dows.length >= 2;
  const coverage = { ...coverageBase, dowReady };

  if (m.total < MIN_BUYINS || openDays.size < MIN_DAYS) {
    return {
      empty: false, lowSample: true, coverage,
      sales: `${periodLabel} 바인 ${m.total}회 · 영업 ${openDays.size}일 · 플레이어 ${m.players}명이 기록됐습니다.`,
      risk: '', weekday: '',
      actions: [],
    };
  }

  dows.sort((a, b) => b.avg - a.avg);
  const best = dows[0];
  const worst = dows.length ? dows[dows.length - 1] : null;
  const meanAvg = dows.length ? dows.reduce((s, d) => s + d.avg, 0) / dows.length : 0;

  // ── 매출·참여 — 판단이 아니라 **사실과 비교 기준**만 적는다(비용 데이터가 없어 수익·마진은 말하지 않는다) ──
  const totalRev = m.mainRev + m.sideRev;
  const sideShare = totalRev > 0 ? (m.sideRev / totalRev) * 100 : 0;
  const sideLine = m.sideGameCount > 0
    ? ` 사이드 게임 ${m.sideGameCount}종이 완납 매출의 ${Math.round(sideShare)}%(${man(m.sideRev)}만 원 · ${m.sideBuyins}회)를 차지합니다.`
    : ' 이 기간에 사이드 게임 기록은 없습니다.';
  const sales =
    `${periodLabel} 완납 매출 ${man(m.revenue)}만 원 · 바이인 ${m.total}회 · 플레이어 ${m.players}명(영업 ${openDays.size}일).` +
    ` 결제수단 중 카드 비중은 ${Math.round(m.cardRatio)}%입니다(완납 매출 대비).` + sideLine;

  // ── 위험 — 미수·할인은 **금액과 비교 기준**을 붙여 사실로만 적는다 ──
  //   ⚠ '마진·이익'이라고 부르지 않는다. 장부에 상금·인건비·임대료가 없어 계산할 수 없다.
  const risk =
    `미수금 ${man(m.unpaid)}만 원(완납 매출 대비 ${Math.round(m.unpaidRatio)}%).` +
    ` 할인 바인 ${m.discountCnt}건(전체 바인의 ${m.discountRatio.toFixed(1)}%) · 깎아 준 금액 ${man(m.discSum)}만 원.` +
    ` 상금·인건비·임대료는 장부에 없어 손익은 계산하지 않습니다.`;

  // ── 요일 — 비교 자격을 못 갖추면 단정하지 않는다 ──
  const weekday = dowReady && worst
    ? `${DOW[worst.w]}요일이 일평균 ${worst.avg.toFixed(1)}회로 가장 낮고, ${DOW[best.w]}요일이 ${best.avg.toFixed(1)}회로 가장 높습니다` +
      ` (비교 대상: ${MIN_DOW_REPEAT}회 이상 운영된 ${dows.length}개 요일 · 전체 평균 ${meanAvg.toFixed(1)}회).`
    : `요일을 비교하려면 각 요일이 ${MIN_DOW_REPEAT}번 이상 운영돼야 합니다. 지금은 조건을 만족하는 요일이 ${dows.length}개라 판단할 데이터가 부족합니다.`;

  // ── 실행 제안 — 근거가 있는 것만. 없으면 만들지 않는다 ──
  const actions: OpsAction[] = [];
  if (dowReady && worst && best && worst.avg * 1.5 <= best.avg) {
    actions.push({
      text: `${DOW[worst.w]}요일 집객을 먼저 보세요 — 가장 높은 ${DOW[best.w]}요일과 일평균 차이가 큽니다.`,
      basis: `${DOW[worst.w]} 일평균 ${worst.avg.toFixed(1)}회 vs ${DOW[best.w]} ${best.avg.toFixed(1)}회 · ${periodLabel} · 각 요일 ${MIN_DOW_REPEAT}회 이상 운영분만 비교`,
    });
  }
  if (m.unpaid > 0) {
    actions.push({
      text: '미수금 회수 계획을 세우세요 — 다음 방문 때 정산을 유도할 수 있습니다.',
      basis: `미수 ${man(m.unpaid)}만 원 · 완납 매출 ${man(m.revenue)}만 원 대비 ${Math.round(m.unpaidRatio)}% · ${periodLabel}`,
    });
  }
  if (m.sideGameCount > 0 && sideShare >= 30) {
    actions.push({
      text: `사이드 게임이 매출의 큰 몫을 맡고 있습니다 — 시작 시간대를 고정 편성하면 재방문 동선이 만들어집니다.`,
      basis: `사이드 ${m.sideGameCount}종 · 완납 매출의 ${Math.round(sideShare)}%(${man(m.sideRev)}만 원) · ${periodLabel}`,
    });
  }

  return { empty: false, lowSample: false, coverage, sales, risk, weekday, actions };
}

function OpsReport({ m, days = 7, onRefresh }: { m: StatsAgg; days?: number; onRefresh: () => void }) {
  const rpt = useMemo(() => buildOpsReport(m, days), [m, days]);
  // 리포트 인쇄/PDF 저장 — 새 창에 렌더 후 인쇄(브라우저 'PDF로 저장'). 별도 의존성 없이 지류 양식과 동일 패턴.
  const exportReport = () => {
    if (rpt.empty) return;
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) return;
    // 플레이어명 등 운영자 자유입력이 리포트 본문에 섞이므로 HTML 이스케이프(인쇄창 인젝션 방지).
    const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const card = (t: string, b: string) => `<div class="c"><div class="t">${esc(t)}</div><div class="b">${esc(b)}</div></div>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>NURI 운영 리포트</title><style>
*{box-sizing:border-box;margin:0;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif}
body{padding:32px;color:#1a1a1a;max-width:720px;margin:0 auto}
h1{font-size:22px;font-weight:900}.sub{color:#777;font-size:12px;margin:4px 0 20px}
.c{border:1px solid #e3e3e3;border-radius:10px;padding:14px 16px;margin-bottom:12px}
.c .t{font-weight:800;font-size:14px;margin-bottom:6px;color:#6d28d9}.c .b{font-size:13px;line-height:1.7;color:#333;white-space:pre-line}
@media print{body{padding:16px}}
</style></head><body>
<h1>NURI 운영 리포트</h1><div class="sub">최근 ${days}일 집계 · 개인정보 없는 집계 데이터 · nuriholdem.com</div>
${card('데이터 신뢰도', `집계 기간 ${days}일 중 영업 ${rpt.coverage.days}일 · 바인 ${rpt.coverage.buyins}회 · 플레이어 ${rpt.coverage.players}명`
  + (rpt.lowSample ? ` — 최소 표본(바인 ${MIN_BUYINS}회 · 영업 ${MIN_DAYS}일)에 못 미쳐 진단을 생성하지 않았습니다.` : '')
  + (rpt.coverage.dowReady ? '' : ` 요일 비교는 각 요일 ${MIN_DOW_REPEAT}회 이상 운영이 필요합니다.`))}
${card('매출 및 바이인', rpt.sales)}
${rpt.risk ? card('미수 · 할인', rpt.risk) : ''}
${rpt.weekday ? card('요일 비교', rpt.weekday) : ''}
${rpt.actions.length
  ? card('실행 제안', rpt.actions.map((a) => `• ${a.text}\n  근거: ${a.basis}`).join('\n'))
  : card('실행 제안', '근거가 충분한 제안이 없습니다. 데이터가 더 쌓이면 표시됩니다.')}
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`);
    w.document.close();
  };
  return (
    <div className="rounded-card border border-violet-500/40 bg-gradient-to-br from-violet-500/[0.12] to-indigo-500/[0.04] p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-violet-200"><Icon name="chart" size={14} className="shrink-0" />NURI 운영 리포트</h4>
          {/* '인사이트' 라고 부르지 않는다 — 이건 장부 집계이고, 근거 없는 추천을 만들지 않는 것이 이 리포트의 계약이다. */}
          <p className="text-2xs text-ink-muted mt-0.5">최근 {days}일 장부를 집계했습니다. 제안에는 근거 수치를 함께 표시합니다.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!rpt.empty && <button type="button" onClick={exportReport} className="inline-flex items-center gap-1 text-2xs font-semibold text-ink-secondary bg-surface-high border border-border-default rounded-input px-2.5 py-1.5 hover:text-ink-primary transition-colors"><Icon name="printer" size={12} className="shrink-0" />저장</button>}
          <button type="button" onClick={onRefresh}
            className="inline-flex items-center gap-1 text-2xs font-semibold text-violet-200 bg-violet-500/15 border border-violet-500/40 rounded-input px-2.5 py-1.5 hover:bg-violet-500/25 transition-colors">
            <Icon name="refresh" size={12} className="shrink-0" />새로고침
          </button>
        </div>
      </div>
      {/* ── 데이터 신뢰도 — 무엇을 근거로 말하는지 먼저 밝힌다. 표본이 모자라면 여기서 그렇다고 말한다. ── */}
      <p className="rounded-input border border-border-subtle bg-surface-low/60 px-2.5 py-1.5 text-2xs text-ink-muted break-keep">
        <Icon name="info" size={11} className="mr-1 inline-block align-[-1px] shrink-0" />
        집계 {days}일 중 <b className="text-ink-secondary tabular-nums">영업 {rpt.coverage.days}일</b> ·
        바인 <b className="text-ink-secondary tabular-nums">{rpt.coverage.buyins}회</b> ·
        플레이어 <b className="text-ink-secondary tabular-nums">{rpt.coverage.players}명</b>
        {!rpt.coverage.dowReady && <> · 요일 비교는 각 요일 {MIN_DOW_REPEAT}회 이상 운영이 필요합니다</>}
      </p>
      {rpt.empty ? (
        <p className="text-center py-8 text-2xs text-ink-muted">이 기간에 바인 기록이 없습니다.<br />장부를 작성하면 집계가 표시됩니다.</p>
      ) : rpt.lowSample ? (
        /* 표본 부족 — 가짜 진단을 만들지 않는다. 무엇이 얼마나 더 필요한지만 말한다. */
        <div className="rounded-input border border-amber-400/30 bg-amber-400/[0.06] p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-amber-300"><Icon name="alert" size={13} className="shrink-0" />판단할 데이터가 부족합니다</p>
          <p className="mt-1 text-2xs text-ink-secondary leading-relaxed break-keep">{rpt.sales}</p>
          <p className="mt-1.5 text-2xs text-ink-muted break-keep">
            진단을 만들려면 <b className="text-ink-secondary">바인 {MIN_BUYINS}회 · 영업 {MIN_DAYS}일</b> 이상이 필요합니다.
            그 아래에서는 한두 건이 비율을 통째로 흔들어 결론이 뒤집힙니다.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ReportCard tone="emerald" title="매출 및 바이인" body={rpt.sales} />
          <ReportCard tone="rose" title="미수 · 할인" body={rpt.risk} />
          <ReportCard tone="sky" title="요일 비교" body={rpt.weekday} />
          <ReportCard tone="amber" title="실행 제안" actions={rpt.actions} />
        </div>
      )}
    </div>
  );
}

function ReportCard({ tone, title, body, actions }: { tone: 'emerald' | 'rose' | 'amber' | 'sky'; title: string; body?: string; actions?: OpsAction[] }) {
  const head = tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : tone === 'sky' ? 'text-sky-300' : 'text-amber-300';
  const mark = tone === 'emerald' ? 'trending-up' : tone === 'rose' ? 'alert' : tone === 'sky' ? 'calendar' : 'lightbulb';
  return (
    <div className="rounded-input bg-surface-low/80 border border-border-default p-3">
      <p className={['flex items-center gap-1.5 text-xs font-bold mb-1.5', head].join(' ')}><Icon name={mark} size={13} className="shrink-0" />{title}</p>
      {body && <p className="text-2xs text-ink-secondary leading-relaxed">{body}</p>}
      {actions && (actions.length === 0 ? (
        /* 근거가 약하면 제안 대신 그 사실을 적는다 — 빈 칸을 메우려고 일반론을 만들지 않는다. */
        <p className="text-2xs text-ink-muted leading-relaxed break-keep">근거가 충분한 제안이 없습니다. 데이터가 더 쌓이면 표시됩니다.</p>
      ) : (
        <ul className="space-y-2">
          {actions.map((a, i) => (
            <li key={i} className="flex gap-1.5 text-2xs text-ink-secondary leading-relaxed">
              <span className="text-amber-400 shrink-0" aria-hidden>•</span>
              <span className="min-w-0 break-keep">
                {a.text}
                {/* '왜 이 제안이 나왔는지'를 항상 확인할 수 있게 — 근거 없는 제안은 애초에 만들지 않는다 */}
                <span className="mt-0.5 block text-ink-muted">근거: {a.basis}</span>
              </span>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

// ── 설정(업주) ── 포스 비밀번호 · 알림 수신 ───────────────────────────────────
export function PosSettingsPanel({ venueId }: { venueId: string }) {
  const toast = useToast();
  const { user } = useAuth();
  const canOwner = user?.role === 'admin' || user?.role === 'venue_owner';
  const [hasPw, setHasPw] = useState(false);
  const [pw, setPw]       = useState('');
  const [pw2, setPw2]     = useState('');
  const [saving, setSaving] = useState(false);
  const [mute, setMute] = useState(false); // 매장 알림 수신 거부(본인)

  useEffect(() => {
    posHasPassword(venueId).then(setHasPw).catch(() => {});
    getMyVenueNotifyMute().then(setMute).catch(() => {});
  }, [venueId]);

  const toggleMute = async () => {
    const next = !mute;
    setMute(next);
    try { await setMyVenueNotifyMute(next); toast.show(next ? '매장 알림을 받지 않습니다' : '매장 알림을 받습니다', 'success'); }
    catch (e) { setMute(!next); toast.show(e instanceof Error ? e.message : '변경 실패', 'error'); }
  };

  const savePw = async () => {
    if (pw.length < 4) return toast.show('비밀번호는 4자리 이상이어야 합니다', 'error');
    if (pw !== pw2)     return toast.show('비밀번호가 일치하지 않습니다', 'error');
    setSaving(true);
    try { await setPosCancelPassword(venueId, pw); setHasPw(true); setPw(''); setPw2(''); toast.show('취소 비밀번호를 설정했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패했습니다', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <section className="rounded-aura border card-aura p-3 space-y-3">
      <h3 className="text-sm font-bold text-ink-primary">설정</h3>
      <div className="space-y-1.5">
        <p className="text-2xs font-semibold text-ink-secondary">포스(바인 취소) 비밀번호{hasPw && <span className="text-emerald-400"> · 설정됨</span>}</p>
        <div className="grid grid-cols-2 gap-2">
          <input type="password" inputMode="numeric" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={hasPw ? '새 비밀번호' : '비밀번호'} className="input text-sm" />
          <input type="password" inputMode="numeric" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="비밀번호 확인" className="input text-sm" />
        </div>
        <button type="button" onClick={savePw} disabled={saving || !pw} className="btn-primary text-xs w-full disabled:opacity-50">{hasPw ? '비밀번호 변경' : '비밀번호 설정'}</button>
      </div>

      {/* 알림 수신 — 매장 공지/호출 알림을 본인이 받을지 */}
      <div className="flex items-center gap-2 border-t border-border-default pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold text-ink-secondary">매장 알림 수신</p>
          <p className="text-2xs text-ink-muted">매장 공지·직원 호출 알림을 내 알림센터로 받습니다.</p>
        </div>
        <button type="button" role="switch" aria-checked={!mute} onClick={toggleMute}
          className={['relative h-6 w-11 shrink-0 rounded-full transition-colors', !mute ? 'bg-accent-300' : 'bg-surface-float'].join(' ')}>
          {/* left 는 모션 헌법 §4 가 금지한 레이아웃 속성이다(매 프레임 레이아웃 재계산).
              위치는 left-0.5 로 고정하고 이동만 transform 으로 — 시각 결과는 같고 합성만으로 처리된다. */}
          <span className={['absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', !mute ? 'translate-x-[1.15rem]' : 'translate-x-0'].join(' ')} />
        </button>
      </div>

      {/* 사장님(공동 업주) 관리 — 업주/운영자만 */}
      {canOwner && <OwnerManageCard venueId={venueId} />}

      <p className="text-2xs text-ink-muted pt-1 border-t border-border-default">통계는 업주 전용 · 직원 <span className="text-accent-300 font-semibold">권한·직책</span>은 「직원 관리」, 탭·순위 구성은 <span className="text-accent-300 font-semibold">「매장 꾸미기」</span>에서.</p>
    </section>
  );
}

// ── 사장님(공동 업주) 관리 — 한 매장에 여러 사장 ──────────────────────────────
function OwnerManageCard({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [owners, setOwners] = useState<VenueOwner[]>([]);
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => { listVenueOwners(venueId).then(setOwners).catch(() => {}); };
  useEffect(load, [venueId]);
  const add = async () => {
    if (!nick.trim()) return;
    setBusy(true);
    try { await addVenueOwner(venueId, nick.trim()); toast.show('공동 사장님을 초대했습니다. 운영자 승인 후 활성화됩니다', 'success'); setNick(''); load(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '초대 실패', 'error'); }
    setBusy(false);
  };
  const remove = async (o: VenueOwner) => {
    if (!window.confirm(`${o.nickname} 사장님을 이 매장에서 제외할까요?`)) return;
    try { await removeVenueOwner(venueId, o.userId); toast.show('제외했습니다', 'info'); load(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '제외 실패', 'error'); }
  };
  const makePrimary = async (o: VenueOwner) => {
    if (!window.confirm(`대표 업주를 ${o.nickname} 사장님으로 교체할까요?
교체 후에는 새 대표만 다시 변경할 수 있습니다.`)) return;
    try { await transferVenuePrimary(venueId, o.userId); toast.show('대표 업주를 교체했습니다', 'success'); load(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '교체 실패', 'error'); }
  };
  return (
    <div className="border-t border-border-default pt-3 space-y-2">
      <p className="text-2xs font-semibold text-ink-secondary">사장님(공동 업주) 관리</p>
      {owners.length > 0 && (
        <ul className="space-y-1">
          {owners.map((o) => (
            <li key={o.userId} className="flex items-center gap-2 rounded-input border border-border-default bg-surface-base px-2.5 py-1.5">
              {/* 잘린 이름만 남으면 동명이인 구분이 안 된다 — 다른 목록과 같이 title 로 전체를 남긴다. */}
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary" title={o.name ? `${o.name}(${o.nickname})` : o.nickname}>{o.name ? `${o.name}(${o.nickname})` : o.nickname}</span>
              {o.status === 'pending' && <span className="shrink-0 rounded-badge bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">승인 대기</span>}
              {o.isPrimary
                ? <span className="shrink-0 rounded-badge bg-accent-300/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-300">대표</span>
                : (
                  <>
                    {o.status === 'approved' && <button type="button" onClick={() => makePrimary(o)} className="shrink-0 text-2xs font-semibold text-accent-300 hover:text-accent-200">대표로</button>}
                    <button type="button" onClick={() => remove(o)} className="shrink-0 text-2xs font-semibold text-ink-muted hover:text-danger-light">제외</button>
                  </>
                )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input value={nick} onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; /* 한글 조합 확정 Enter 를 제출로 오인하지 않게 */ if (e.key === 'Enter') add(); }}
          placeholder="아이디(닉네임)" className="input min-w-0 flex-1 text-sm" />
        <button type="button" disabled={busy || !nick.trim()} onClick={add} className="btn-primary shrink-0 px-3 text-xs disabled:opacity-50">+ 사장님 추가</button>
      </div>
      <p className="text-2xs text-ink-muted"><b className="text-amber-400">운영자 승인 후</b> 공동 업주로 활성화 · 장부·포스터·이용권 공동 관리, <b className="text-accent-300">대표</b> 교체 가능.</p>
    </div>
  );
}
