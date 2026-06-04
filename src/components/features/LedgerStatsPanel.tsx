// src/components/features/LedgerStatsPanel.tsx
// 업주 전용 — 기간 통계(오늘/주/월/전체/요일평균, 할인 반영) + POS 설정.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useToast } from '../atoms/Toast';
import {
  type LedgerBuyin, type LedgerSession, type LedgerPlayer, type PaymentMethod, type VisitorType,
  wonToMan, buyinFinance, getLedgerRange, getLedgerPlayers,
  posHasPassword, setPosCancelPassword,
} from '../../api/ledger';

const todayStr = () => new Date().toLocaleDateString('en-CA');
const shift = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
const METHOD_LABEL: Record<PaymentMethod, string> = { ticket: '티켓', cash: '현금', transfer: '이체', card: '카드', support: '지원' };
const VISITOR_LABEL: Record<VisitorType, string> = { new: '신규방문', regular: '기존손님', staff: '관계자', other: '기타' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

type Period = 'day' | 'week' | 'month' | 'all' | 'dow' | 'ai';
const PERIODS: { id: Period; label: string; ai?: boolean }[] = [
  { id: 'day', label: '하루' }, { id: 'week', label: '일주일' }, { id: 'month', label: '한 달' }, { id: 'all', label: '총괄' }, { id: 'dow', label: '요일별' },
  { id: 'ai', label: '✨ AI 분석', ai: true },
];

export default function LedgerStatsPanel({ venueId }: { venueId: string }) {
  return <StatsView venueId={venueId} />;
}

// ── 통계 ──────────────────────────────────────────────────────────────────────
type DowRange = 'week' | 'month' | 'all';
const DOW_RANGE_OPTS: { id: DowRange; label: string }[] = [
  { id: 'week', label: '최근 7일' }, { id: 'month', label: '이번 달' }, { id: 'all', label: '전체' },
];

function StatsView({ venueId }: { venueId: string }) {
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(todayStr);
  const [dowRange, setDowRange] = useState<DowRange>('all'); // 요일별 분석 기간
  const [sessions, setSessions] = useState<LedgerSession[]>([]);
  const [buyins, setBuyins] = useState<LedgerBuyin[]>([]);
  const [players, setPlayers] = useState<LedgerPlayer[]>([]);
  const [excludeStaff, setExcludeStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiTick, setAiTick] = useState(0); // AI 리포트 새로고침

  const range = useMemo<{ from: string; to: string }>(() => {
    const t = todayStr();
    if (period === 'day')   return { from: date, to: date };
    if (period === 'week' || period === 'ai') return { from: shift(t, -6), to: t };
    if (period === 'month') return { from: t.slice(0, 7) + '-01', to: t };
    if (period === 'dow') {
      if (dowRange === 'week')  return { from: shift(t, -6), to: t };
      if (dowRange === 'month') return { from: t.slice(0, 7) + '-01', to: t };
      return { from: '2000-01-01', to: t };
    }
    return { from: '2000-01-01', to: t }; // all
  }, [period, date, dowRange]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getLedgerRange(venueId, range.from, range.to),
      period === 'day' ? getLedgerPlayers(venueId, date) : Promise.resolve([] as LedgerPlayer[]),
    ]).then(([r, p]) => { setSessions(r.sessions); setBuyins(r.buyins); setPlayers(p); })
      .finally(() => setLoading(false));
  }, [venueId, range.from, range.to, period, date, aiTick]);

  const sessionByDate = useMemo(() => {
    const m = new Map<string, LedgerSession>();
    for (const s of sessions) m.set(s.sessionDate, s);
    return m;
  }, [sessions]);
  const staffNames = useMemo(() => new Set(players.filter((p) => p.visitorType === 'staff').map((p) => p.name)), [players]);

  const m = useMemo(() => {
    const src = (excludeStaff && period === 'day') ? buyins.filter((b) => !staffNames.has(b.playerName)) : buyins;
    const fin = (b: LedgerBuyin) => buyinFinance(b, sessionByDate.get(b.sessionDate) ?? { buyinAmount: 0, cardAmount: null, discounts: [] });
    let revenue = 0, unpaid = 0, support = 0, ticket = 0, ticketUnpaid = 0, entries = 0, underEntries = 0;
    const byMethod: Record<PaymentMethod, number> = { ticket: 0, cash: 0, transfer: 0, card: 0, support: 0 };
    const byPlayer: Record<string, number> = {};
    const playerSet = new Set<string>();
    const dates = new Set<string>();
    const dow: Record<number, { entries: number; revenue: number; dates: Set<string> }> = {};
    for (const b of src) {
      const f = fin(b);
      revenue += f.paid; unpaid += f.unpaid; support += f.support; entries += f.entry;
      if (f.entry > 0 && f.entry < 1) underEntries++; // 할인으로 1개 미달인 엔트리
      ticket += f.ticketPaid + (b.isSplit ? b.ticketCount : 0); ticketUnpaid += f.ticketUnpaid;
      byMethod[b.paymentMethod]++;
      byPlayer[b.playerName] = (byPlayer[b.playerName] ?? 0) + 1;
      playerSet.add(b.playerName); dates.add(b.sessionDate);
      const w = new Date(b.sessionDate + 'T00:00:00').getDay();
      if (!dow[w]) dow[w] = { entries: 0, revenue: 0, dates: new Set() };
      dow[w].entries += f.entry; dow[w].revenue += f.paid; dow[w].dates.add(b.sessionDate);
    }
    const target = (period === 'day' ? sessionByDate.get(date)?.targetEntries : 0) ?? 0;
    const visitor: Record<VisitorType, number> = { new: 0, regular: 0, staff: 0, other: 0 };
    for (const p of players) {
      if (!p.visitorType) continue;
      if (p.visitorType === 'new' || p.visitorType === 'regular' || p.visitorType === 'staff') visitor[p.visitorType]++;
      else visitor.other++;
    }
    const dayCount = dates.size;
    const cashLike = byMethod.cash + byMethod.transfer + byMethod.card;
    return {
      total: src.length, entries, underEntries, players: playerSet.size, revenue, unpaid, support, ticket, ticketUnpaid,
      unpaid_cnt: src.filter((b) => fin(b).unpaid > 0).length,
      byMethod, ranking: Object.entries(byPlayer).sort((a, b) => b[1] - a[1]),
      target, fillRatio: target ? Math.round((entries / target) * 100) : null,
      perPlayer: playerSet.size ? entries / playerSet.size : 0,
      dayCount, visitor, dow,
      avgEntryPerDay: dayCount ? entries / dayCount : 0,
      avgRevenuePerDay: dayCount ? revenue / dayCount : 0,
      discountRatio: entries > 0 ? (underEntries / entries) * 100 : 0, // 총 엔트리 대비 미달(할인) 비율
      cardRatio: cashLike > 0 ? (byMethod.card / cashLike) * 100 : 0,   // 현금성 결제 중 카드 비중
      unpaidRatio: revenue > 0 ? (unpaid / revenue) * 100 : 0,
    };
  }, [buyins, sessionByDate, players, excludeStaff, staffNames, period, date]);

  return (
    <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-gold-300">통계</h3>
        {period === 'day' && <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} className="input text-xs py-1 w-auto" />}
      </div>

      <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5 overflow-x-auto scrollbar-none">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" onClick={() => setPeriod(p.id)}
            className={['flex-1 min-w-[3.4rem] py-1.5 text-2xs font-bold rounded-[6px] transition-colors whitespace-nowrap',
              period === p.id
                ? (p.ai ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow' : 'bg-gold-300 text-ink-inverse')
                : (p.ai ? 'text-violet-300 hover:text-violet-200' : 'text-ink-secondary hover:text-ink-primary')].join(' ')}>{p.label}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-center py-6 text-2xs text-ink-muted">불러오는 중…</p>
      ) : period === 'ai' ? (
        <AiReport m={m} onRefresh={() => setAiTick((t) => t + 1)} />
      ) : period === 'dow' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
            {DOW_RANGE_OPTS.map((o) => (
              <button key={o.id} type="button" onClick={() => setDowRange(o.id)}
                className={['flex-1 py-1.5 text-2xs font-bold rounded-[6px] transition-colors',
                  dowRange === o.id ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>{o.label}</button>
            ))}
          </div>
          <DowTable dow={m.dow} rangeLabel={DOW_RANGE_OPTS.find((o) => o.id === dowRange)!.label} />
        </div>
      ) : (
        <>
          {period === 'day' && (
            <button type="button" onClick={() => setExcludeStaff((v) => !v)}
              className={['w-full flex items-center justify-between px-3 py-2 rounded-input border transition-colors',
                excludeStaff ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'bg-surface-high text-ink-secondary border-border-default'].join(' ')}>
              <span className="text-2xs font-semibold">관계자 바이인 제외</span>
              <span className="text-2xs font-bold">{excludeStaff ? 'ON' : 'OFF'}</span>
            </button>
          )}

          {/* 주요 지표 — 아이콘 카드 */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="총 엔트리" value={m.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })} icon="users" />
            <StatCard label="미달 엔트리" value={`${m.underEntries}개`} sub="할인(1개 미만)" icon="down" />
            <StatCard label="할인 비율" value={`${m.discountRatio.toFixed(1)}%`} sub="총 엔트리 대비 미달 비율" icon="percent" gold />
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
            {period === 'day'
              ? <Mini label="가게지원" value={`${m.support}건`} />
              : <Mini label="일평균 매출" value={`${m.avgRevenuePerDay.toLocaleString(undefined, { maximumFractionDigits: 0 })}원`} />}
          </div>

          <Section icon="card" title="결제 수단별 바인 수">
            <div className="grid grid-cols-5 gap-1.5">
              {(['ticket', 'cash', 'transfer', 'card', 'support'] as PaymentMethod[]).map((k) => (
                <div key={k} className="rounded-input bg-surface-high border border-border-subtle py-1.5 text-center">
                  <p className="text-sm font-bold text-ink-primary tabular-nums">{m.byMethod[k]}</p>
                  <p className="text-[10px] text-ink-muted">{METHOD_LABEL[k]}</p>
                </div>
              ))}
            </div>
          </Section>

          {period === 'day' && (m.visitor.new + m.visitor.regular + m.visitor.staff + m.visitor.other) > 0 && (
            <Section icon="usercheck" title="방문 유형" suffix="(명단 기준)">
              <div className="grid grid-cols-4 gap-1.5">
                {(['new', 'regular', 'staff', 'other'] as VisitorType[]).map((k) => (
                  <div key={k} className="rounded-input bg-surface-high border border-border-subtle py-1.5 text-center">
                    <p className="text-sm font-bold text-ink-primary tabular-nums">{m.visitor[k]}</p>
                    <p className="text-[10px] text-ink-muted">{VISITOR_LABEL[k]}</p>
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
                    <span className={['w-5 text-center text-xs font-bold tabular-nums', i === 0 ? 'text-gold-300' : i === 2 ? 'text-amber-600' : 'text-ink-secondary'].join(' ')}>{i + 1}</span>
                    <span className="flex-1 text-xs font-semibold text-ink-primary truncate">{name}</span>
                    <span className="text-xs font-bold text-ink-secondary tabular-nums">{cnt}회</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </section>
  );
}

function DowTable({ dow, rangeLabel = '전체' }: { dow: Record<number, { entries: number; revenue: number; dates: Set<string> }>; rangeLabel?: string }) {
  const rows = [1, 2, 3, 4, 5, 6, 0].map((w) => {
    const d = dow[w];
    const days = d ? d.dates.size : 0;
    return { w, days, entries: d?.entries ?? 0, revenue: d?.revenue ?? 0, avgEntry: days ? (d!.entries / days) : 0 };
  });
  return (
    <div>
      <p className="text-2xs text-ink-muted mb-1">요일별 평균 · {rangeLabel} 기준</p>
      <table className="w-full text-center border-separate border-spacing-0">
        <thead><tr className="text-[10px] text-ink-muted">
          <th className="py-1">요일</th><th>영업일</th><th>총 엔트리</th><th>일평균 엔트리</th><th>매출</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.w} className="text-xs">
              <td className="py-1 font-bold text-gold-300">{DOW[r.w]}</td>
              <td className="text-ink-secondary tabular-nums">{r.days}</td>
              <td className="text-ink-primary tabular-nums">{r.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              <td className="text-emerald-400 tabular-nums font-bold">{r.avgEntry.toFixed(1)}</td>
              <td className="text-ink-secondary tabular-nums">{wonToMan(r.revenue)}만</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type IconName = 'users' | 'down' | 'percent' | 'wallet' | 'alert' | 'ticket' | 'card' | 'usercheck' | 'trophy';
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
};
function StatIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>{ICON_PATHS[name]}</svg>;
}

function StatCard({ label, value, sub, icon, danger, emerald, gold }: { label: string; value: string; sub?: string; icon: IconName; danger?: boolean; emerald?: boolean; gold?: boolean }) {
  const c = danger ? 'text-danger-light' : emerald ? 'text-emerald-400' : gold ? 'text-gold-300' : 'text-ink-primary';
  return (
    <div className="rounded-card bg-surface-low border border-border-subtle p-2.5 flex flex-col min-h-[5.25rem]">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[11px] text-ink-secondary leading-tight">{label}</p>
        <StatIcon name={icon} className="text-ink-muted shrink-0" />
      </div>
      <p className={['mt-auto pt-2 text-lg font-extrabold tabular-nums leading-none', c].join(' ')}>{value}</p>
      {sub && <p className="text-[9px] text-ink-muted mt-1 leading-tight">{sub}</p>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-input bg-surface-high border border-border-subtle py-1.5 px-1 text-center">
      <p className="text-sm font-bold text-ink-primary tabular-nums leading-none">{value}</p>
      <p className="text-[9px] text-ink-muted mt-1">{label}</p>
    </div>
  );
}

function Section({ icon, title, suffix, children }: { icon: IconName; title: string; suffix?: string; children: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-2xs font-semibold text-ink-secondary mb-1.5">
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
  cardRatio: number; unpaidRatio: number; discountRatio: number;
  ranking: [string, number][];
  dow: Record<number, { entries: number; revenue: number; dates: Set<string> }>;
}

function buildAiReport(m: StatsAgg): { empty: boolean; sales: string; risk: string; actions: string[] } {
  if (m.total === 0) return { empty: true, sales: '', risk: '', actions: [] };
  const man = (won: number) => wonToMan(won);
  const dows = Object.entries(m.dow).map(([w, d]) => ({ w: Number(w), avg: d.dates.size ? d.entries / d.dates.size : 0 }));
  dows.sort((a, b) => b.avg - a.avg);
  const best = dows[0];
  const meanAvg = dows.length ? dows.reduce((s, d) => s + d.avg, 0) / dows.length : 0;
  const weak = dows.filter((d) => d.avg < meanAvg).sort((a, b) => a.avg - b.avg).slice(0, 2).map((d) => DOW[d.w]);
  const top = m.ranking.slice(0, 2).map(([n]) => n);

  const sales =
    `${best ? `이번 주 ${DOW[best.w]}요일(${best.avg.toFixed(1)} 엔트리)의 성과가 가장 두드러집니다. ` : ''}` +
    `전체 매출 ${man(m.revenue)}만 원 중 카드 결제 비율이 ${Math.round(m.cardRatio)}%로 ` +
    `${m.cardRatio >= 60 ? '높아 결제 편의성이 잘 확보되어' : '적정 수준으로 유지되어'} 있습니다. ` +
    `${m.players}명의 플레이어가 참여했습니다.`;

  const risk =
    `현재 미수금이 ${man(m.unpaid)}만 원(완납 매출 대비 약 ${Math.round(m.unpaidRatio)}%)으로 ` +
    `${m.unpaidRatio >= 25 ? '주의가 필요한 수치입니다' : '비교적 안정적입니다'}. ` +
    `또한 미달 엔트리 할인이 ${m.discountRatio.toFixed(1)}% 발생하여 ` +
    `${m.discountRatio >= 10 ? '마진 하락의 원인이 되고 있으니 참가자 확보 전략이 필요합니다' : '마진에 큰 영향은 없습니다'}.`;

  const actions: string[] = [];
  if (weak.length) actions.push(`매출이 저조한 ${weak.join('·')} 요일에 '얼리버드 칩업' 이벤트를 커뮤니티에 공지해보세요.`);
  if (top.length) actions.push(`상위 바인 유저인 ${top.join(', ')} 님에게 회수된 티켓(${m.ticket}장) 중 일부를 리워드로 제공하여 VIP 이탈을 방지하세요.`);
  if (m.unpaidRatio >= 25) actions.push(`미수금 ${man(m.unpaid)}만 원 회수를 위해 다음 방문 시 정산을 유도하세요.`);
  if (!actions.length) actions.push('현재 운영 지표가 안정적입니다. 단골 고객 대상 리워드로 재방문을 유도해보세요.');

  return { empty: false, sales, risk, actions };
}

function AiReport({ m, onRefresh }: { m: StatsAgg; onRefresh: () => void }) {
  const rpt = useMemo(() => buildAiReport(m), [m]);
  return (
    <div className="rounded-card border border-violet-500/40 bg-gradient-to-br from-violet-500/[0.12] to-indigo-500/[0.04] p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-violet-200">✨ NURI AI 주간 리포트</h4>
          <p className="text-2xs text-ink-muted mt-0.5">최근 7일간의 누적 데이터를 기반으로 분석된 비즈니스 인사이트입니다.</p>
        </div>
        <button type="button" onClick={onRefresh}
          className="shrink-0 inline-flex items-center gap-1 text-2xs font-semibold text-violet-200 bg-violet-500/15 border border-violet-500/40 rounded-input px-2.5 py-1.5 hover:bg-violet-500/25 transition-colors">
          ✨ 새로고침
        </button>
      </div>
      {rpt.empty ? (
        <p className="text-center py-8 text-2xs text-ink-muted">최근 7일간 데이터가 부족합니다.<br />장부를 작성하면 인사이트가 표시됩니다.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <ReportCard tone="emerald" title="매출 및 엔트리 분석" body={rpt.sales} />
          <ReportCard tone="rose" title="리스크 & 누수 체크" body={rpt.risk} />
          <ReportCard tone="amber" title="AI 운영 액션 플랜" bullets={rpt.actions} />
        </div>
      )}
    </div>
  );
}

function ReportCard({ tone, title, body, bullets }: { tone: 'emerald' | 'rose' | 'amber'; title: string; body?: string; bullets?: string[] }) {
  const head = tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : 'text-amber-300';
  const mark = tone === 'emerald' ? '📈' : tone === 'rose' ? '⚠️' : '💡';
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

// ── POS 설정(업주) ── 직원관리 옆 별도 탭에서 렌더 ─────────────────────────────
export function PosSettingsPanel({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [hasPw, setHasPw] = useState(false);
  const [pw, setPw]       = useState('');
  const [pw2, setPw2]     = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    posHasPassword(venueId).then(setHasPw).catch(() => {});
  }, [venueId]);

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
      <h3 className="text-sm font-bold text-ink-primary">POS 설정</h3>
      <div className="space-y-1.5">
        <p className="text-2xs font-semibold text-ink-secondary">바이인 취소 비밀번호 {hasPw && <span className="text-emerald-400">· 설정됨</span>}</p>
        <div className="grid grid-cols-2 gap-2">
          <input type="password" inputMode="numeric" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={hasPw ? '새 비밀번호' : '비밀번호'} className="input text-sm" />
          <input type="password" inputMode="numeric" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="비밀번호 확인" className="input text-sm" />
        </div>
        <button type="button" onClick={savePw} disabled={saving || !pw} className="btn-primary text-xs w-full disabled:opacity-50">{hasPw ? '비밀번호 변경' : '비밀번호 설정'}</button>
      </div>
      <p className="text-[10px] text-ink-muted pt-1 border-t border-border-subtle">통계는 업주만 볼 수 있습니다. 직원의 <span className="text-gold-300 font-semibold">장부·순위 권한과 직책</span>은 「직원 관리」 탭에서 설정하세요.</p>
    </section>
  );
}
