// src/components/features/LedgerStatsPanel.tsx
// 업주 전용 — 기간 통계(오늘/주/월/전체/요일평균, 할인 반영) + POS 설정.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '../atoms/Toast';
import {
  type LedgerBuyin, type LedgerSession, type LedgerPlayer, type PaymentMethod, type VisitorType,
  wonToMan, buyinFinance, getLedgerRange, getLedgerPlayers, getBuyinRequestStats, type BuyinReqStats,
  posHasPassword, setPosCancelPassword, subscribeLedger,
} from '../../api/ledger';
import { toCsv, downloadCsv } from '../../lib/csv';
import Icon from '../atoms/Icon';
import { getMyVenueNotifyMute, setMyVenueNotifyMute } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { listVenueOwners, addVenueOwner, removeVenueOwner, transferVenuePrimary, type VenueOwner } from '../../api/community';
import CustomerAnalytics from './CustomerAnalytics';
import SegmentedTabs from '../atoms/SegmentedTabs';

const todayStr = () => new Date().toLocaleDateString('en-CA');
const shift = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
const METHOD_LABEL: Record<PaymentMethod, string> = { ticket: '티켓', cash: '현금', transfer: '이체', card: '카드', support: '지원' };
const VISITOR_LABEL: Record<VisitorType, string> = { new: '신규방문', regular: '기존손님', staff: '관계자', other: '기타' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

type Period = 'day' | 'week' | 'month' | 'all' | 'dow' | 'ai';
const PERIODS: { id: Period; label: string; ai?: boolean }[] = [
  { id: 'day', label: '당일' }, { id: 'week', label: '일주일' }, { id: 'month', label: '한 달' }, { id: 'all', label: '총괄' }, { id: 'dow', label: '요일별' },
  { id: 'ai', label: '✨ AI 분석', ai: true },
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
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(todayStr);
  const [dowRange, setDowRange] = useState<DowRange>('all'); // 요일별 분석 기간
  const [sessions, setSessions] = useState<LedgerSession[]>([]);
  const [buyins, setBuyins] = useState<LedgerBuyin[]>([]);
  const [players, setPlayers] = useState<LedgerPlayer[]>([]);
  const [excludeTypes, setExcludeTypes] = useState<Set<string>>(new Set()); // 제외할 손님유형 코드(new/regular/staff/other/none)
  const toggleExclude = (code: string) => setExcludeTypes((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const [loading, setLoading] = useState(true);
  const [aiTick, setAiTick] = useState(0); // AI 리포트 새로고침
  const [aiDays, setAiDays] = useState(7); // AI 리포트 분석 기간(일) — 7/30/90
  const [trendMetric, setTrendMetric] = useState<'revenue' | 'entries' | 'players'>('revenue'); // 추세 그래프 지표
  const [trendDetail, setTrendDetail] = useState<string | null>(null); // 추세 막대 클릭 → 그날 상세
  const [reqStats, setReqStats] = useState<BuyinReqStats | null>(null); // 바인 요청 운영지표
  const [liveTick, setLiveTick] = useState(0); // 장부 실시간 변경 반영(당일 통계)

  const range = useMemo<{ from: string; to: string }>(() => {
    const t = todayStr();
    if (period === 'day')   return { from: date, to: date };
    if (period === 'week') return { from: shift(t, -6), to: t };
    if (period === 'ai') return { from: shift(t, -(aiDays - 1)), to: t };
    if (period === 'month') return { from: t.slice(0, 7) + '-01', to: t };
    if (period === 'dow') {
      if (dowRange === 'week')  return { from: shift(t, -6), to: t };
      if (dowRange === 'month') return { from: t.slice(0, 7) + '-01', to: t };
      return { from: '2000-01-01', to: t };
    }
    return { from: '2000-01-01', to: t }; // all
  }, [period, date, dowRange, aiDays]);

  const hasLoaded = useRef(false);
  useEffect(() => {
    // 첫 진입만 로딩 표시 — period 전환 시엔 이전 데이터를 유지하며 부드럽게 갱신(스크롤 점프 방지)
    if (!hasLoaded.current) setLoading(true);
    Promise.all([
      getLedgerRange(venueId, range.from, range.to),
      period === 'day' ? getLedgerPlayers(venueId, date) : Promise.resolve([] as LedgerPlayer[]),
    ]).then(([r, p]) => { setSessions(r.sessions); setBuyins(r.buyins); setPlayers(p); })
      .finally(() => { setLoading(false); hasLoaded.current = true; });
  }, [venueId, range.from, range.to, period, date, aiTick, liveTick]);

  // 바인 요청 운영지표(기간) — 요청수·승인율·평균 대기(분)
  useEffect(() => { getBuyinRequestStats(venueId, range.from, range.to).then(setReqStats).catch(() => setReqStats(null)); }, [venueId, range.from, range.to, liveTick, aiTick]);

  // '당일' 통계를 보는 중 장부(바이인 등) 변경 시 실시간 갱신
  useEffect(() => {
    if (period !== 'day') return;
    return subscribeLedger(venueId, () => setLiveTick((t) => t + 1));
  }, [venueId, period]);

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
    let revenue = 0, unpaid = 0, support = 0, ticket = 0, ticketUnpaid = 0, entries = 0, underEntries = 0, discountCnt = 0;
    let mainEntries = 0, mainRev = 0, sideEntries = 0, sideRev = 0; const sideGames = new Set<string>();
    const revByDate: Record<string, { mainRev: number; sideRev: number; mainE: number; sideE: number; players: Set<string> }> = {}; // 일자별 추세(매출·엔트리·인원)
    const byMethod: Record<PaymentMethod, number> = { ticket: 0, cash: 0, transfer: 0, card: 0, support: 0 };
    const byPlayer: Record<string, number> = {};
    const playerSet = new Set<string>();
    const dates = new Set<string>();
    const dow: Record<number, { entries: number; revenue: number; unpaid: number; buyins: number; target: number; dates: Set<string>; players: Set<string>; sideE: number; sideRev: number }> = {};
    const unpaidByPlayer: Record<string, number> = {};
    for (const b of src) {
      const f = fin(b);
      revenue += f.paid; unpaid += f.unpaid; support += f.support; entries += f.entry;
      if (b.gameSeq > 1) { sideEntries += f.entry; sideRev += f.paid; sideGames.add(bkey(b)); }
      else { mainEntries += f.entry; mainRev += f.paid; }
      const rd = revByDate[b.sessionDate] ?? (revByDate[b.sessionDate] = { mainRev: 0, sideRev: 0, mainE: 0, sideE: 0, players: new Set<string>() });
      if (b.gameSeq > 1) { rd.sideRev += f.paid; rd.sideE += f.entry; } else { rd.mainRev += f.paid; rd.mainE += f.entry; }
      rd.players.add(b.playerName);
      if (f.entry > 0 && f.entry < 1) underEntries++; // 참고용
      if (b.discountIndex > 0 || (b.isSplit && b.discountLevel > 0)) discountCnt++; // 할인 적용된 바인
      ticket += f.ticketPaid + (b.isSplit ? b.ticketCount : 0); ticketUnpaid += f.ticketUnpaid;
      byMethod[b.paymentMethod]++;
      byPlayer[b.playerName] = (byPlayer[b.playerName] ?? 0) + 1;
      if (f.unpaid > 0) unpaidByPlayer[b.playerName] = (unpaidByPlayer[b.playerName] ?? 0) + f.unpaid;
      playerSet.add(b.playerName); dates.add(b.sessionDate);
      const w = new Date(b.sessionDate + 'T00:00:00').getDay();
      if (!dow[w]) dow[w] = { entries: 0, revenue: 0, unpaid: 0, buyins: 0, target: 0, dates: new Set(), players: new Set(), sideE: 0, sideRev: 0 };
      if (!dow[w].dates.has(b.sessionDate)) dow[w].target += (sessionsByDate.get(b.sessionDate) ?? []).reduce((a, s) => a + (s.targetEntries ?? 0), 0); // 날짜별(전 게임) 기준엔트리 1회만 합산
      dow[w].entries += f.entry; dow[w].revenue += f.paid; dow[w].unpaid += f.unpaid;
      dow[w].buyins++; dow[w].dates.add(b.sessionDate); dow[w].players.add(b.playerName);
      if (b.gameSeq > 1) { dow[w].sideE += f.entry; dow[w].sideRev += f.paid; }
    }
    const target = period === 'day' ? (sessionsByDate.get(date) ?? []).reduce((a, s) => a + (s.targetEntries ?? 0), 0) : 0;
    const visitor: Record<VisitorType, number> = { new: 0, regular: 0, staff: 0, other: 0 };
    for (const p of players) {
      if (!p.visitorType) continue;
      if (p.visitorType === 'new' || p.visitorType === 'regular' || p.visitorType === 'staff') visitor[p.visitorType]++;
      else visitor.other++;
    }
    const dayCount = dates.size;
    const cashLike = byMethod.cash + byMethod.transfer + byMethod.card;
    // 객단가 — 미수 포함(받을 돈까지). 관계자 제외는 자동으로 하지 않음(필요하면 위 '바인 제외 관계자' 필터로).
    const grossPerPlayer = playerSet.size ? (revenue + unpaid) / playerSet.size : 0;
    const grossPerEntry = entries > 0 ? (revenue + unpaid) / entries : 0;
    return {
      total: src.length, entries, underEntries, players: playerSet.size, revenue, unpaid, support, ticket, ticketUnpaid,
      unpaid_cnt: src.filter((b) => fin(b).unpaid > 0).length,
      byMethod, ranking: Object.entries(byPlayer).sort((a, b) => b[1] - a[1]),
      unpaidRanking: Object.entries(unpaidByPlayer).sort((a, b) => b[1] - a[1]),
      target, fillRatio: target ? Math.round((entries / target) * 100) : null,
      perPlayer: playerSet.size ? entries / playerSet.size : 0,
      arpGuest: grossPerPlayer, // 1인당 (완납+미수)
      arpEntry: grossPerEntry,  // 엔트리당 (완납+미수)
      mainEntries, mainRev, sideEntries, sideRev, sideGameCount: sideGames.size,
      trend: Object.entries(revByDate).map(([d, v]) => ({ date: d, mainRev: v.mainRev, sideRev: v.sideRev, mainE: v.mainE, sideE: v.sideE, players: v.players.size })).sort((a, b) => (a.date < b.date ? -1 : 1)),
      dayCount, visitor, dow,
      avgEntryPerDay: dayCount ? entries / dayCount : 0,
      avgRevenuePerDay: dayCount ? revenue / dayCount : 0,
      discountCnt, discountRatio: src.length > 0 ? (discountCnt / src.length) * 100 : 0, // 전체 바인 중 할인 적용 비율
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

  // CSV 내보내기 — 요일별이면 요일 요약, 그 외 기간은 일별 요약(엑셀 한글 호환).
  const exportCsv = () => {
    if (period === 'dow') {
      const rows = [0, 1, 2, 3, 4, 5, 6].map((w) => {
        const e = m.dow[w];
        if (!e) return [DOW[w], 0, 0, 0, 0, 0, 0];
        const fill = e.target ? Math.round((e.entries / e.target) * 100) : '';
        return [DOW[w], e.dates.size, Math.round(e.entries * 10) / 10, e.target, fill === '' ? '' : `${fill}%`, Math.round(e.revenue), Math.round(e.unpaid)];
      });
      downloadCsv(`요일별통계_${range.from}_${range.to}`, toCsv(['요일', '영업일수', '엔트리', '기준엔트리', '달성률', '완납매출(원)', '미수(원)'], rows));
      toast.show('요일별 통계 CSV를 내보냈습니다', 'success');
      return;
    }
    const sorted = [...sessions].sort((a, b) => (a.sessionDate === b.sessionDate ? a.gameSeq - b.gameSeq : a.sessionDate < b.sessionDate ? -1 : 1));
    if (!sorted.length) { toast.show('내보낼 데이터가 없습니다', 'info'); return; }
    const rows = sorted.map((s) => {
      let entry = 0, paid = 0, unpaid = 0, ticket = 0; const ps = new Set<string>();
      for (const b of buyins) {
        if (b.sessionDate !== s.sessionDate || b.gameSeq !== s.gameSeq) continue;
        const f = buyinFinance(b, s);
        entry += f.entry; paid += f.paid; unpaid += f.unpaid; ticket += f.ticketPaid + (b.isSplit ? b.ticketCount : 0);
        ps.add(b.playerName);
      }
      const gl = s.gameSeq > 1 ? `사이드${s.gameSeq - 1}` : '메인';
      return [s.sessionDate, DOW[new Date(s.sessionDate + 'T00:00:00').getDay()], gl, s.targetEntries ?? '', Math.round(entry * 10) / 10, Math.round(paid), Math.round(unpaid), ticket, s.voucherIssued ?? 0, ps.size];
    });
    downloadCsv(`장부통계_${range.from}_${range.to}`, toCsv(['날짜', '요일', '게임', '기준엔트리', '엔트리', '완납매출(원)', '미수(원)', '회수티켓', '발행이용권', '플레이어수'], rows));
    toast.show('통계 CSV를 내보냈습니다', 'success');
  };

  return (
    <section className="rounded-card border border-accent-400/30 bg-gradient-to-br from-accent-300/[0.05] to-transparent p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-accent-300">통계</h3>
        <div className="flex items-center gap-1.5">
          {period === 'day' && <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} className="input text-xs py-1 w-auto" />}
          {period !== 'ai' && (
            <button type="button" onClick={exportCsv}
              className="inline-flex items-center gap-1 rounded-input border border-border-default bg-surface-high px-2.5 py-1.5 text-2xs font-bold text-ink-secondary hover:text-accent-300 hover:border-accent-400/40 transition-colors">
              <Icon name="download" size={13} /> CSV
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5 overflow-x-auto scrollbar-none">
        {PERIODS.map((p) => {
          const on = period === p.id;
          return (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)}
              className={['relative flex-1 min-w-[3.6rem] py-1.5 text-xs font-bold rounded-[6px] whitespace-nowrap transition-colors duration-300 focus:outline-none',
                on ? (p.ai ? 'text-white' : 'text-ink-inverse') : (p.ai ? 'text-violet-300' : 'text-ink-secondary hover:text-ink-primary')].join(' ')}>
              {on && <motion.span layoutId="stat-period-pill" aria-hidden
                className={['absolute inset-0 rounded-[6px]', p.ai ? 'bg-gradient-to-r from-violet-500 to-indigo-500 shadow' : 'bg-accent-300'].join(' ')}
                transition={{ type: 'spring', stiffness: 700, damping: 42 }} />}
              <span className="relative">{p.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-center py-6 text-2xs text-ink-muted">불러오는 중…</p>
      ) : period === 'ai' ? (
        <div className="space-y-2">
          <SegmentedTabs grow className="flex w-full"
            items={[{ key: '7', label: '최근 7일' }, { key: '30', label: '30일' }, { key: '90', label: '90일' }]}
            value={String(aiDays)} onChange={(k) => setAiDays(Number(k))} />
          <AiReport m={m} days={aiDays} onRefresh={() => setAiTick((t) => t + 1)} />
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
                        on ? 'bg-danger/15 text-danger-light border-danger/40' : 'bg-surface-base text-ink-secondary border-border-subtle hover:text-ink-primary'].join(' ')}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 주요 지표 — 아이콘 카드 */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="총 엔트리" value={m.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })} icon="users" />
            <StatCard label="할인 바인" value={`${m.discountCnt}건`} sub="할인 적용 바인" icon="down" />
            <StatCard label="할인 비율" value={`${m.discountRatio.toFixed(1)}%`} sub="전체 바인 중 할인" icon="percent" gold />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="완납 매출액" value={`${m.revenue.toLocaleString()} 원`} icon="wallet" emerald />
            <StatCard label="미수 금액" value={`${m.unpaid.toLocaleString()} 원`} icon="alert" danger={m.unpaid > 0} />
            <StatCard label="회수 티켓" value={`${m.ticket} 장`} icon="ticket" gold sub={m.ticketUnpaid > 0 ? `미수 ${m.ticketUnpaid}` : undefined} />
          </div>

          {/* 보조 지표 */}
          <div className="grid grid-cols-4 gap-1.5">
            {period === 'day'
              ? <Mini label="엔트리 비율" value={m.fillRatio !== null ? `${m.fillRatio}%` : '-'} />
              : <Mini label="영업일수" value={`${m.dayCount}일`} />}
            {period !== 'day' && <Mini label="일평균 엔트리" value={m.avgEntryPerDay.toFixed(1)} />}
            <Mini label="플레이어" value={`${m.players}명`} />
            <Mini label="엔트리/인" value={m.perPlayer ? m.perPlayer.toFixed(1) : '0'} />
            <Mini label="객단가/인" value={`${wonToMan(Math.round(m.arpGuest))}만`} hint="미수 포함" />
            <Mini label="객단가/엔트리" value={`${wonToMan(Math.round(m.arpEntry))}만`} hint="미수 포함" />
            {period === 'day'
              ? <Mini label="가게지원" value={`${m.support}건`} />
              : <Mini label="일평균 매출" value={`${m.avgRevenuePerDay.toLocaleString(undefined, { maximumFractionDigits: 0 })}원`} />}
          </div>

          {reqStats && reqStats.total > 0 && (
            <Section icon="users" title="바인 요청 현황" suffix="· 손님 QR 요청">
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-input bg-surface-high border border-border-subtle py-1.5"><p className="text-base font-bold text-ink-primary tabular-nums">{reqStats.total}</p><p className="text-[11px] text-ink-muted">요청</p></div>
                <div className="rounded-input bg-surface-high border border-border-subtle py-1.5"><p className="text-base font-bold text-emerald-400 tabular-nums">{reqStats.approved}</p><p className="text-[11px] text-ink-muted">승인</p></div>
                <div className="rounded-input bg-surface-high border border-border-subtle py-1.5"><p className="text-base font-bold text-accent-300 tabular-nums">{reqStats.approveRate}%</p><p className="text-[11px] text-ink-muted">승인율</p></div>
                <div className="rounded-input bg-surface-high border border-border-subtle py-1.5"><p className="text-base font-bold text-ink-primary tabular-nums">{reqStats.avgWaitMin != null ? reqStats.avgWaitMin + '분' : '—'}</p><p className="text-[11px] text-ink-muted">평균 대기</p></div>
              </div>
            </Section>
          )}

          {m.sideGameCount > 0 && (
            <Section icon="users" title="게임별 구분" suffix="· 메인 / 사이드">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-input bg-surface-high border border-border-subtle py-2 text-center">
                  <p className="text-2xs text-ink-muted">메인</p>
                  <p className="text-sm font-bold text-ink-primary tabular-nums">{m.mainEntries.toLocaleString(undefined, { maximumFractionDigits: 1 })} 엔트리</p>
                  <p className="text-2xs text-emerald-400 tabular-nums">{wonToMan(m.mainRev)}만</p>
                </div>
                <div className="rounded-input bg-accent-300/[0.06] border border-accent-400/30 py-2 text-center">
                  <p className="text-2xs text-accent-300">사이드 · {m.sideGameCount}게임</p>
                  <p className="text-sm font-bold text-ink-primary tabular-nums">{m.sideEntries.toLocaleString(undefined, { maximumFractionDigits: 1 })} 엔트리</p>
                  <p className="text-2xs text-emerald-400 tabular-nums">{wonToMan(m.sideRev)}만</p>
                </div>
              </div>
            </Section>
          )}

          {period !== 'day' && m.trend.length >= 2 && (() => {
            const stacked = trendMetric !== 'players';
            const totals = m.trend.map((d) => trendMetric === 'revenue' ? d.mainRev + d.sideRev : trendMetric === 'entries' ? d.mainE + d.sideE : d.players);
            const max = Math.max(1, ...totals);
            const fmt = (n: number) => trendMetric === 'revenue' ? `${wonToMan(n)}만` : trendMetric === 'entries' ? n.toFixed(n % 1 ? 1 : 0) : `${n}명`;
            return (
              <Section icon="wallet" title="일자별 추세" suffix={trendMetric === 'revenue' ? '· 매출' : trendMetric === 'entries' ? '· 엔트리' : '· 인원'}>
                <SegmentedTabs grow className="flex w-full mb-2"
                  items={[{ key: 'revenue', label: '매출' }, { key: 'entries', label: '엔트리' }, { key: 'players', label: '인원' }]}
                  value={trendMetric} onChange={(k) => setTrendMetric(k as 'revenue' | 'entries' | 'players')} />
                <div className="flex items-end gap-1 overflow-x-auto pb-1">
                  {m.trend.map((d, i) => {
                    const total = totals[i];
                    const side = trendMetric === 'revenue' ? d.sideRev : trendMetric === 'entries' ? d.sideE : 0;
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
                        <span className="text-[8px] text-ink-muted tabular-nums leading-none">{d.date.slice(5).replace('-', '/')}</span>
                      </button>
                    );
                  })}
                </div>
                {stacked && (
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-ink-muted">
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
                        <div><p className="text-[10px] text-ink-muted">엔트리</p><p className="text-sm font-bold text-ink-primary tabular-nums">{f1(d.mainE + d.sideE)}</p><p className="text-[9px] text-ink-muted">메인 {f1(d.mainE)} · 사이드 {f1(d.sideE)}</p></div>
                        <div><p className="text-[10px] text-ink-muted">매출</p><p className="text-sm font-bold text-emerald-400 tabular-nums">{wonToMan(d.mainRev + d.sideRev)}만</p><p className="text-[9px] text-ink-muted">메인 {wonToMan(d.mainRev)} · 사이드 {wonToMan(d.sideRev)}</p></div>
                        <div><p className="text-[10px] text-ink-muted">인원</p><p className="text-sm font-bold text-ink-primary tabular-nums">{d.players}명</p></div>
                      </div>
                    </div>
                  );
                })()}
              </Section>
            );
          })()}

          {clockAgg && (
            <Section icon="clock" title="클락 최종 (보정 포함)" suffix="· 운영자 클락 집계">
              <div className="grid grid-cols-4 gap-1.5">
                <div className="rounded-input bg-surface-high border border-border-subtle py-1.5 text-center">
                  <p className="text-base font-bold text-accent-300 tabular-nums">{clockAgg.entries}</p>
                  <p className="text-[11px] text-ink-muted">엔트리</p>
                </div>
                <div className="rounded-input bg-surface-high border border-border-subtle py-1.5 text-center">
                  <p className="text-base font-bold text-emerald-400 tabular-nums">{clockAgg.alive}</p>
                  <p className="text-[11px] text-ink-muted">생존</p>
                </div>
                <div className="rounded-input bg-surface-high border border-border-subtle py-1.5 text-center">
                  <p className="text-base font-bold text-ink-primary tabular-nums">{clockAgg.eliminations}</p>
                  <p className="text-[11px] text-ink-muted">아웃</p>
                </div>
                <div className="rounded-input bg-surface-high border border-border-subtle py-1.5 text-center">
                  <p className="text-base font-bold text-amber-300 tabular-nums">{clockAgg.earlies}</p>
                  <p className="text-[11px] text-ink-muted">얼리</p>
                </div>
              </div>
              <p className="text-[10px] text-ink-muted mt-1.5 leading-relaxed">
                마감 시 클락에서 손보정된 최종 수치(생존·아웃 포함)입니다. <b className="text-ink-secondary">장부 총 엔트리({m.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })})는 바인 기록 기준</b>이라 다를 수 있어요 — 통계·정산은 장부 기준, 이 값은 운영 참고용입니다.{clockAgg.games > 1 ? ` (게임 ${clockAgg.games}개 합산)` : ''}
              </p>
            </Section>
          )}

          <Section icon="card" title="결제 수단별 바인 수">
            <div className="grid grid-cols-5 gap-1.5">
              {(['ticket', 'cash', 'transfer', 'card', 'support'] as PaymentMethod[]).map((k) => (
                <div key={k} className="rounded-input bg-surface-high border border-border-subtle py-1.5 text-center">
                  <p className="text-base font-bold text-ink-primary tabular-nums">{m.byMethod[k]}</p>
                  <p className="text-[11px] text-ink-muted">{METHOD_LABEL[k]}</p>
                </div>
              ))}
            </div>
          </Section>

          {period === 'day' && (m.visitor.new + m.visitor.regular + m.visitor.staff + m.visitor.other) > 0 && (
            <Section icon="usercheck" title="방문 유형" suffix="(명단 기준)">
              <div className="grid grid-cols-4 gap-1.5">
                {(['new', 'regular', 'staff', 'other'] as VisitorType[]).map((k) => (
                  <div key={k} className="rounded-input bg-surface-high border border-border-subtle py-1.5 text-center">
                    <p className="text-base font-bold text-ink-primary tabular-nums">{m.visitor[k]}</p>
                    <p className="text-[11px] text-ink-muted">{VISITOR_LABEL[k]}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section icon="trophy" title="바인 횟수 순위 (TOP 10)">
            {m.ranking.length === 0 ? (
              <p className="text-2xs text-ink-muted text-center py-2">데이터 없음</p>
            ) : (
              <ul className="space-y-1">
                {m.ranking.slice(0, 10).map(([name, cnt], i) => (
                  <li key={name} className="flex items-center gap-2 px-2 py-2 rounded-input bg-surface-high border border-border-subtle">
                    <span className={['w-5 text-center text-xs font-bold tabular-nums', i === 0 ? 'text-accent-300' : i === 2 ? 'text-amber-600' : 'text-ink-secondary'].join(' ')}>{i + 1}</span>
                    <span className="flex-1 text-xs font-semibold text-ink-primary truncate">{name}</span>
                    <span className="text-xs font-bold text-ink-secondary tabular-nums">{cnt}회</span>
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
                    <span className="flex-1 text-xs font-semibold text-ink-primary truncate">{name}</span>
                    <span className="text-xs font-bold text-danger-light tabular-nums">{amt.toLocaleString()}원</span>
                  </li>
                ))}
                <li className="flex items-center justify-between px-2 pt-1 text-2xs">
                  <span className="text-ink-muted">미수 합계</span>
                  <span className="font-extrabold text-danger-light tabular-nums">{m.unpaid.toLocaleString()}원</span>
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
    const entries = d?.entries ?? 0;
    const revenue = d?.revenue ?? 0;
    const target = d?.target ?? 0;
    return {
      w, days, entries, revenue, unpaid: d?.unpaid ?? 0, buyins: d?.buyins ?? 0, players: d ? d.players.size : 0,
      target, fill: target > 0 ? (entries / target) * 100 : null,
      avgEntry: days ? entries / days : 0,
      avgRevenue: days ? revenue / days : 0,
      perEntry: entries ? revenue / entries : 0,
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
  const totalEntries = rows.reduce((s, r) => s + r.entries, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalTarget  = rows.reduce((s, r) => s + r.target, 0);
  const overallFill  = totalTarget > 0 ? Math.round((totalEntries / totalTarget) * 100) : null;
  const multi = active.length > 1;

  return (
    <div className="space-y-3">
      <p className="text-2xs text-ink-muted">요일별 통계 · {rangeLabel} 기준 · 영업 {totalDays}일 · <b className="text-ink-secondary">핵심: 기준 엔트리 달성률</b></p>

      {/* 요약 — 기준 달성률 핵심 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label="기준 달성률" value={overallFill !== null ? `${overallFill}%` : '기준 미설정'} />
        <Mini label="영업일" value={`${totalDays}일`} />
        <Mini label="총 엔트리" value={totalEntries.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
        <Mini label="총 매출(만)" value={wonToMan(totalRevenue)} />
      </div>

      {/* 최고 / 최저 요일 하이라이트 */}
      <div className="grid grid-cols-2 gap-2">
        <DowHilite tone="emerald" cap="가장 활발한 요일" w={best.w}
          a={`일평균 ${best.avgEntry.toFixed(1)} 엔트리`} b={`${wonToMan(best.avgRevenue)}만/일 · 객단가 ${wonToMan(best.perEntry)}만`} />
        <DowHilite tone="rose" cap="가장 부진한 요일" w={worst.w}
          a={`일평균 ${worst.avgEntry.toFixed(1)} 엔트리`} b={multi ? `${wonToMan(worst.avgRevenue)}만/일 · 객단가 ${wonToMan(worst.perEntry)}만` : '비교할 다른 요일 데이터 필요'} />
      </div>

      {/* 막대 차트 — 엔트리/매출 토글 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-2xs font-semibold text-ink-secondary">요일별 {metric === 'fill' ? '기준 엔트리 달성률' : metric === 'entry' ? '일평균 엔트리' : '일평균 매출'}</p>
          <div className="flex gap-0.5 bg-surface-high rounded-input p-0.5">
            {([['fill', '달성률'], ['entry', '엔트리'], ['revenue', '매출']] as const).map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => setMetric(k)}
                className={['px-2 py-0.5 text-[10px] font-bold rounded-[5px] transition-colors',
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
                  <div className={['h-full rounded-r transition-all duration-300', barColor].join(' ')} style={{ width: `${r.days ? Math.max(pct, 3) : 0}%` }} />
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
      <div className="overflow-x-auto scrollbar-none">
        <table className="w-full text-center border-separate border-spacing-0 min-w-[19rem]">
          <thead><tr className="text-[10px] text-ink-muted">
            <th className="py-1 text-left pl-1">요일</th><th>영업일</th><th>일평균<br/>엔트리</th><th>일평균<br/>매출(만)</th><th>객단가<br/>(만)</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.w} className={['text-xs', r.days === 0 ? 'opacity-40' : ''].join(' ')}>
                <td className="py-1.5 text-left pl-1 font-bold text-accent-300">{DOW[r.w]}</td>
                <td className="text-ink-secondary tabular-nums">{r.days || '-'}</td>
                <td className={['tabular-nums font-bold', r.w === best.w && multi ? 'text-emerald-400' : r.w === worst.w && multi ? 'text-rose-400' : 'text-ink-primary'].join(' ')}>{r.days ? r.avgEntry.toFixed(1) : '-'}</td>
                <td className="text-ink-secondary tabular-nums">{r.days ? wonToMan(r.avgRevenue) : '-'}</td>
                <td className="text-ink-secondary tabular-nums">{r.entries ? wonToMan(r.perEntry) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 인사이트 */}
      <p className="text-[11px] text-ink-secondary bg-surface-low/70 border border-border-subtle rounded-input p-2.5 leading-relaxed">
        💡 {multi
          ? <>{DOW[worst.w]}요일이 일평균 <b className="text-rose-300">{worst.avgEntry.toFixed(1)}</b> 엔트리로 가장 저조합니다(전체 평균 {meanAvg.toFixed(1)}). 반대로 <b className="text-emerald-300">{DOW[best.w]}</b>요일이 {best.avgEntry.toFixed(1)}로 가장 활발합니다. {DOW[worst.w]}요일에 집객 이벤트(얼리버드 칩업·신규 할인·보장 토너먼트)를 배치해 보세요.</>
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
      <p className="text-[10px] text-ink-muted">{cap}</p>
      <p className={['text-lg font-extrabold leading-tight', head].join(' ')}>{DOW[w]}요일</p>
      <p className="text-[11px] text-ink-primary mt-0.5 leading-tight">{a}</p>
      <p className="text-[10px] text-ink-muted mt-0.5 leading-tight">{b}</p>
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
    <div className="rounded-card bg-surface-low border border-border-subtle p-2.5 flex flex-col min-h-[5.25rem]">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[13px] font-medium text-ink-secondary leading-tight">{label}</p>
        <StatIcon name={icon} className="text-ink-muted shrink-0" />
      </div>
      <p className={['mt-auto pt-2 text-lg font-extrabold tabular-nums leading-none', c].join(' ')}>{value}</p>
      {sub && <p className="text-[11px] text-ink-muted mt-1 leading-tight">{sub}</p>}
    </div>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-input bg-surface-high border border-border-subtle py-2 px-1 text-center" title={hint}>
      <p className="text-base font-bold text-ink-primary tabular-nums leading-none">{value}</p>
      <p className="text-[11px] text-ink-muted mt-1 leading-tight">{label}{hint ? <span className="block text-[9px] text-ink-muted/70">{hint}</span> : null}</p>
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

// ── AI 주간 리포트(데이터 기반 인사이트) ───────────────────────────────────────
interface StatsAgg {
  total: number; entries: number; revenue: number; unpaid: number; players: number; ticket: number;
  cardRatio: number; unpaidRatio: number; discountRatio: number; discountCnt: number;
  ranking: [string, number][];
  mainEntries: number; mainRev: number; sideEntries: number; sideRev: number; sideGameCount: number;
  dow: Record<number, { entries: number; revenue: number; unpaid: number; buyins: number; dates: Set<string>; players: Set<string>; sideE: number; sideRev: number }>;
}

function buildAiReport(m: StatsAgg, days = 7): { empty: boolean; sales: string; risk: string; weekday: string; actions: string[] } {
  if (m.total === 0) return { empty: true, sales: '', risk: '', weekday: '', actions: [] };
  const man = (won: number) => wonToMan(won);
  const periodLabel = days <= 7 ? '이번 주' : `최근 ${days}일`;
  const dows = Object.entries(m.dow).map(([w, d]) => ({ w: Number(w), avg: d.dates.size ? d.entries / d.dates.size : 0, rev: d.dates.size ? d.revenue / d.dates.size : 0, sideAvg: d.dates.size ? d.sideE / d.dates.size : 0 }));
  dows.sort((a, b) => b.avg - a.avg);
  const best = dows[0];
  const worst = dows.length ? dows[dows.length - 1] : null;
  const meanAvg = dows.length ? dows.reduce((s, d) => s + d.avg, 0) / dows.length : 0;
  const weak = dows.filter((d) => d.avg < meanAvg).sort((a, b) => a.avg - b.avg).slice(0, 2).map((d) => DOW[d.w]);
  const top = m.ranking.slice(0, 2).map(([n]) => n);

  // 사이드 게임 수익 기여도 — 메인 대비 사이드 매출 비중 진단
  const totalRev = m.mainRev + m.sideRev;
  const sideShare = totalRev > 0 ? (m.sideRev / totalRev) * 100 : 0;
  const sideLine = m.sideGameCount > 0
    ? ` 또한 사이드 게임 ${m.sideGameCount}종이 전체 매출의 약 ${Math.round(sideShare)}%(${man(m.sideRev)}만 원·${m.sideEntries.toFixed(0)} 엔트리)를 책임집니다 — ${sideShare >= 30 ? '사이드가 핵심 수익원이니 라인업을 더 늘려보세요' : sideShare >= 10 ? '사이드가 메인 매출을 잘 보완하고 있습니다' : '사이드 비중이 낮아 시간대·홍보를 조정할 여지가 있습니다'}.`
    : ' 아직 사이드 게임 기록이 없습니다 — 새틀라이트·하이롤러 같은 사이드를 1~2종 추가하면 객단가를 끌어올릴 수 있습니다.';

  // 요일별 진단(안좋은 날)
  let weekday: string;
  if (dows.length <= 1) {
    weekday = '아직 요일별 비교에 충분한 데이터가 없습니다. 며칠 더 운영되면 요일 패턴(약한 요일)을 진단해 드립니다.';
  } else {
    const sideDays = dows.filter((d) => d.sideAvg > 0).sort((a, b) => b.sideAvg - a.sideAvg);
    const sidePat = sideDays.length ? ` 사이드 게임은 ${DOW[sideDays[0].w]}요일에 가장 활발합니다(평균 ${sideDays[0].sideAvg.toFixed(1)} 엔트리) — 그날 사이드 라인업을 강화해 보세요.` : '';
    weekday = `${DOW[worst!.w]}요일이 가장 부진합니다 — 평균 ${worst!.avg.toFixed(1)} 엔트리 · 매출 ${man(worst!.rev)}만 원. ` +
      `반대로 ${DOW[best.w]}요일이 가장 활발(평균 ${best.avg.toFixed(1)} 엔트리)합니다. ` +
      `${weak.length ? weak.join('·') + '요일' : DOW[worst!.w] + '요일'}에 집객 이벤트(얼리버드 칩업·신규 할인·보장 토너먼트)를 배치해 약한 요일을 끌어올리세요.` + sidePat;
  }

  const sales =
    `${best ? `${periodLabel} ${DOW[best.w]}요일(${best.avg.toFixed(1)} 엔트리)의 성과가 가장 두드러집니다. ` : ''}` +
    `전체 매출 ${man(m.revenue)}만 원 중 카드 결제 비율이 ${Math.round(m.cardRatio)}%로 ` +
    `${m.cardRatio >= 60 ? '높아 결제 편의성이 잘 확보되어' : '적정 수준으로 유지되어'} 있습니다. ` +
    `${m.players}명의 플레이어가 참여했습니다.` + sideLine;

  const risk =
    `현재 미수금이 ${man(m.unpaid)}만 원(완납 매출 대비 약 ${Math.round(m.unpaidRatio)}%)으로 ` +
    `${m.unpaidRatio >= 25 ? '주의가 필요한 수치입니다' : '비교적 안정적입니다'}. ` +
    `또한 할인 바인이 전체의 ${m.discountRatio.toFixed(1)}%(${m.discountCnt}건) 발생하여 ` +
    `${m.discountRatio >= 10 ? '마진 하락의 원인이 되고 있으니 참가자 확보 전략이 필요합니다' : '마진에 큰 영향은 없습니다'}.`;

  const actions: string[] = [];
  if (weak.length) actions.push(`매출이 저조한 ${weak.join('·')} 요일에 '얼리버드 칩업' 이벤트를 커뮤니티에 공지해보세요.`);
  if (top.length) actions.push(`상위 바인 유저인 ${top.join(', ')} 님에게 회수된 티켓(${m.ticket}장) 중 일부를 리워드로 제공하여 VIP 이탈을 방지하세요.`);
  if (m.unpaidRatio >= 25) actions.push(`미수금 ${man(m.unpaid)}만 원 회수를 위해 다음 방문 시 정산을 유도하세요.`);
  if (m.sideGameCount > 0 && sideShare >= 30) actions.push(`사이드 매출 비중이 ${Math.round(sideShare)}%로 높습니다 — 인기 사이드(${m.sideGameCount}종)의 시작 시간대를 고정 편성해 단골의 재방문 동선을 만드세요.`);
  else if (m.sideGameCount === 0 && m.total >= 10) actions.push('메인 외 사이드 게임(예: 새틀라이트·하이롤러)을 추가해 체류시간과 객단가를 높여보세요.');
  if (!actions.length) actions.push('현재 운영 지표가 안정적입니다. 단골 고객 대상 리워드로 재방문을 유도해보세요.');

  return { empty: false, sales, risk, weekday, actions };
}

function AiReport({ m, days = 7, onRefresh }: { m: StatsAgg; days?: number; onRefresh: () => void }) {
  const rpt = useMemo(() => buildAiReport(m, days), [m, days]);
  // 리포트 인쇄/PDF 저장 — 새 창에 렌더 후 인쇄(브라우저 'PDF로 저장'). 별도 의존성 없이 지류 양식과 동일 패턴.
  const exportReport = () => {
    if (rpt.empty) return;
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) return;
    // 플레이어명 등 운영자 자유입력이 리포트 본문에 섞이므로 HTML 이스케이프(인쇄창 인젝션 방지).
    const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const card = (t: string, b: string) => `<div class="c"><div class="t">${esc(t)}</div><div class="b">${esc(b)}</div></div>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>NURI AI 주간 리포트</title><style>
*{box-sizing:border-box;margin:0;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif}
body{padding:32px;color:#1a1a1a;max-width:720px;margin:0 auto}
h1{font-size:22px;font-weight:900}.sub{color:#777;font-size:12px;margin:4px 0 20px}
.c{border:1px solid #e3e3e3;border-radius:10px;padding:14px 16px;margin-bottom:12px}
.c .t{font-weight:800;font-size:14px;margin-bottom:6px;color:#6d28d9}.c .b{font-size:13px;line-height:1.7;color:#333;white-space:pre-line}
@media print{body{padding:16px}}
</style></head><body>
<h1>✨ NURI AI 주간 리포트</h1><div class="sub">최근 ${days}일 누적 데이터 기반 인사이트 · nuriholdem.com</div>
${card('매출 및 엔트리 분석', rpt.sales)}
${card('리스크 & 누수 체크', rpt.risk)}
${card('요일별 진단', rpt.weekday)}
${card('AI 운영 액션 플랜', rpt.actions.map((a) => '• ' + a).join('\n'))}
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`);
    w.document.close();
  };
  return (
    <div className="rounded-card border border-violet-500/40 bg-gradient-to-br from-violet-500/[0.12] to-indigo-500/[0.04] p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-violet-200">✨ NURI AI 주간 리포트</h4>
          <p className="text-2xs text-ink-muted mt-0.5">최근 {days}일간의 누적 데이터를 기반으로 분석된 비즈니스 인사이트입니다.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!rpt.empty && <button type="button" onClick={exportReport} className="inline-flex items-center gap-1 text-2xs font-semibold text-ink-secondary bg-surface-high border border-border-default rounded-input px-2.5 py-1.5 hover:text-ink-primary transition-colors">📄 저장</button>}
          <button type="button" onClick={onRefresh}
            className="inline-flex items-center gap-1 text-2xs font-semibold text-violet-200 bg-violet-500/15 border border-violet-500/40 rounded-input px-2.5 py-1.5 hover:bg-violet-500/25 transition-colors">
            ✨ 새로고침
          </button>
        </div>
      </div>
      {rpt.empty ? (
        <p className="text-center py-8 text-2xs text-ink-muted">최근 {days}일간 데이터가 부족합니다.<br />장부를 작성하면 인사이트가 표시됩니다.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ReportCard tone="emerald" title="매출 및 엔트리 분석" body={rpt.sales} />
          <ReportCard tone="rose" title="리스크 & 누수 체크" body={rpt.risk} />
          <ReportCard tone="sky" title="요일별 진단 (안좋은 날)" body={rpt.weekday} />
          <ReportCard tone="amber" title="AI 운영 액션 플랜" bullets={rpt.actions} />
        </div>
      )}
    </div>
  );
}

function ReportCard({ tone, title, body, bullets }: { tone: 'emerald' | 'rose' | 'amber' | 'sky'; title: string; body?: string; bullets?: string[] }) {
  const head = tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : tone === 'sky' ? 'text-sky-300' : 'text-amber-300';
  const mark = tone === 'emerald' ? '📈' : tone === 'rose' ? '⚠️' : tone === 'sky' ? '📅' : '💡';
  return (
    <div className="rounded-input bg-surface-low/80 border border-border-subtle p-3">
      <p className={['flex items-center gap-1 text-xs font-bold mb-1.5', head].join(' ')}><span>{mark}</span>{title}</p>
      {body && <p className="text-2xs text-ink-secondary leading-relaxed">{body}</p>}
      {bullets && (
        <ul className="space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-1.5 text-2xs text-ink-secondary leading-relaxed">
              <span className="text-amber-400 shrink-0">•</span><span>{b}</span>
            </li>
          ))}
        </ul>
      )}
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
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-3">
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
      <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold text-ink-secondary">매장 알림 수신</p>
          <p className="text-[10px] text-ink-muted">매장 공지·직원 호출 알림을 내 알림센터로 받습니다.</p>
        </div>
        <button type="button" role="switch" aria-checked={!mute} onClick={toggleMute}
          className={['relative h-6 w-11 shrink-0 rounded-full transition-colors', !mute ? 'bg-accent-300' : 'bg-surface-float'].join(' ')}>
          <span className={['absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]', !mute ? 'left-[1.4rem]' : 'left-0.5'].join(' ')} />
        </button>
      </div>

      {/* 사장님(공동 업주) 관리 — 업주/운영자만 */}
      {canOwner && <OwnerManageCard venueId={venueId} />}

      <p className="text-[10px] text-ink-muted pt-1 border-t border-border-subtle">통계는 업주만 볼 수 있습니다. 직원의 <span className="text-accent-300 font-semibold">장부·순위 권한과 직책</span>은 「직원 관리」 탭, 매장 페이지 탭 순서·순위 구성은 <span className="text-accent-300 font-semibold">「매장 꾸미기」</span>에서 설정하세요.</p>
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
    try { await addVenueOwner(venueId, nick.trim()); toast.show('공동 사장님을 초대했습니다 — 운영자 승인 후 활성화됩니다', 'success'); setNick(''); load(); }
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
    <div className="border-t border-border-subtle pt-3 space-y-2">
      <p className="text-2xs font-semibold text-ink-secondary">사장님(공동 업주) 관리</p>
      {owners.length > 0 && (
        <ul className="space-y-1">
          {owners.map((o) => (
            <li key={o.userId} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-base px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{o.name ? `${o.name}(${o.nickname})` : o.nickname}</span>
              {o.status === 'pending' && <span className="shrink-0 rounded-badge bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">승인 대기</span>}
              {o.isPrimary
                ? <span className="shrink-0 rounded-badge bg-accent-300/15 px-1.5 py-0.5 text-[9px] font-bold text-accent-300">대표</span>
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
        <input value={nick} onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="추가할 사장님 아이디(닉네임)" className="input min-w-0 flex-1 text-sm" />
        <button type="button" disabled={busy || !nick.trim()} onClick={add} className="btn-primary shrink-0 px-3 text-xs disabled:opacity-50">+ 사장님 추가</button>
      </div>
      <p className="text-[10px] text-ink-muted">초대한 회원은 <b className="text-amber-400">운영자 승인 후</b> 이 매장의 <b className="text-ink-secondary">공동 업주</b>가 되어 장부·포스터·이용권을 함께 관리합니다. 승인된 공동 사장은 <b className="text-accent-300">대표</b>로 교체할 수 있어요.</p>
    </div>
  );
}
