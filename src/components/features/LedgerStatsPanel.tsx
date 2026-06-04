// src/components/features/LedgerStatsPanel.tsx
// 업주 전용 — 기간 통계(오늘/주/월/전체/요일평균, 할인 반영) + POS 설정.
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import type { User } from '../../api/auth';
import { getMyVenueStaff } from '../../api/auth';
import {
  type LedgerBuyin, type LedgerSession, type LedgerPlayer, type PaymentMethod, type VisitorType,
  wonToMan, buyinFinance, getLedgerRange, getLedgerPlayers,
  posHasPassword, setPosCancelPassword,
  getLedgerAccessUserIds, grantLedgerAccess, revokeLedgerAccess,
} from '../../api/ledger';

const todayStr = () => new Date().toLocaleDateString('en-CA');
const shift = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
const METHOD_LABEL: Record<PaymentMethod, string> = { ticket: '티켓', cash: '현금', transfer: '이체', card: '카드', support: '지원' };
const VISITOR_LABEL: Record<VisitorType, string> = { new: '신규방문', regular: '기존손님', staff: '관계자', other: '기타' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

type Period = 'day' | 'week' | 'month' | 'all' | 'dow';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: '하루' }, { id: 'week', label: '일주일' }, { id: 'month', label: '한 달' }, { id: 'all', label: '총괄' }, { id: 'dow', label: '요일별' },
];

export default function LedgerStatsPanel({ venueId, showSettings = true }: { venueId: string; showSettings?: boolean }) {
  return (
    <div className="space-y-4">
      <StatsView venueId={venueId} />
      {showSettings && <PosSettings venueId={venueId} />}
    </div>
  );
}

// ── 통계 ──────────────────────────────────────────────────────────────────────
function StatsView({ venueId }: { venueId: string }) {
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(todayStr);
  const [sessions, setSessions] = useState<LedgerSession[]>([]);
  const [buyins, setBuyins] = useState<LedgerBuyin[]>([]);
  const [players, setPlayers] = useState<LedgerPlayer[]>([]);
  const [excludeStaff, setExcludeStaff] = useState(false);
  const [loading, setLoading] = useState(true);

  const range = useMemo<{ from: string; to: string }>(() => {
    const t = todayStr();
    if (period === 'day')   return { from: date, to: date };
    if (period === 'week')  return { from: shift(t, -6), to: t };
    if (period === 'month') return { from: t.slice(0, 7) + '-01', to: t };
    return { from: '2000-01-01', to: t }; // all / dow
  }, [period, date]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getLedgerRange(venueId, range.from, range.to),
      period === 'day' ? getLedgerPlayers(venueId, date) : Promise.resolve([] as LedgerPlayer[]),
    ]).then(([r, p]) => { setSessions(r.sessions); setBuyins(r.buyins); setPlayers(p); })
      .finally(() => setLoading(false));
  }, [venueId, range.from, range.to, period, date]);

  const sessionByDate = useMemo(() => {
    const m = new Map<string, LedgerSession>();
    for (const s of sessions) m.set(s.sessionDate, s);
    return m;
  }, [sessions]);
  const staffNames = useMemo(() => new Set(players.filter((p) => p.visitorType === 'staff').map((p) => p.name)), [players]);

  const m = useMemo(() => {
    const src = (excludeStaff && period === 'day') ? buyins.filter((b) => !staffNames.has(b.playerName)) : buyins;
    const fin = (b: LedgerBuyin) => buyinFinance(b, sessionByDate.get(b.sessionDate) ?? { buyinAmount: 0, cardAmount: null, discounts: [] });
    let revenue = 0, unpaid = 0, support = 0, ticket = 0, ticketUnpaid = 0, entries = 0;
    const byMethod: Record<PaymentMethod, number> = { ticket: 0, cash: 0, transfer: 0, card: 0, support: 0 };
    const byPlayer: Record<string, number> = {};
    const playerSet = new Set<string>();
    const dates = new Set<string>();
    const dow: Record<number, { entries: number; revenue: number; dates: Set<string> }> = {};
    for (const b of src) {
      const f = fin(b);
      revenue += f.paid; unpaid += f.unpaid; support += f.support; entries += f.entry;
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
    return {
      total: src.length, entries, players: playerSet.size, revenue, unpaid, support, ticket, ticketUnpaid,
      unpaid_cnt: src.filter((b) => fin(b).unpaid > 0).length,
      byMethod, ranking: Object.entries(byPlayer).sort((a, b) => b[1] - a[1]),
      target, fillRatio: target ? Math.round((entries / target) * 100) : null,
      perPlayer: playerSet.size ? entries / playerSet.size : 0,
      dayCount: dates.size, visitor, dow,
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
            className={['flex-1 min-w-[3.2rem] py-1.5 text-2xs font-bold rounded-[6px] transition-colors',
              period === p.id ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>{p.label}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-center py-6 text-2xs text-ink-muted">불러오는 중…</p>
      ) : period === 'dow' ? (
        <DowTable dow={m.dow} />
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

          <div className="grid grid-cols-3 gap-2">
            <Stat label="총 엔트리" value={m.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
            <Stat label="총 바인 수" value={`${m.total}`} />
            {period === 'day'
              ? <Stat label="엔트리 비율" value={m.fillRatio !== null ? `${m.fillRatio}%` : '-'} sub={m.target ? `기준 ${m.target}` : '기준 미설정'} />
              : <Stat label="영업일수" value={`${m.dayCount}일`} />}
            <Stat label="플레이어" value={`${m.players}명`} />
            <Stat label="엔트리/인" value={m.perPlayer ? m.perPlayer.toFixed(1) : '0'} />
            <Stat label="가게지원" value={`${m.support}건`} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="완납 매출" value={`${wonToMan(m.revenue)}만`} emerald />
            <Stat label="미수금" value={`${wonToMan(m.unpaid)}만`} danger={m.unpaid > 0} />
            <Stat label="회수 티켓" value={`${m.ticket}장`} sub={m.ticketUnpaid > 0 ? `미수 ${m.ticketUnpaid}` : undefined} />
          </div>

          <div>
            <p className="text-2xs font-semibold text-ink-secondary mb-1">결제 수단별 바인 수</p>
            <div className="grid grid-cols-5 gap-1.5">
              {(['ticket', 'cash', 'transfer', 'card', 'support'] as PaymentMethod[]).map((k) => (
                <div key={k} className="rounded-input bg-surface-high border border-border-subtle py-1.5 text-center">
                  <p className="text-sm font-bold text-ink-primary tabular-nums">{m.byMethod[k]}</p>
                  <p className="text-[10px] text-ink-muted">{METHOD_LABEL[k]}</p>
                </div>
              ))}
            </div>
          </div>

          {period === 'day' && (m.visitor.new + m.visitor.regular + m.visitor.staff + m.visitor.other) > 0 && (
            <div>
              <p className="text-2xs font-semibold text-ink-secondary mb-1">방문 유형 (명단 기준)</p>
              <div className="grid grid-cols-4 gap-1.5">
                {(['new', 'regular', 'staff', 'other'] as VisitorType[]).map((k) => (
                  <div key={k} className="rounded-input bg-surface-high border border-border-subtle py-1.5 text-center">
                    <p className="text-sm font-bold text-ink-primary tabular-nums">{m.visitor[k]}</p>
                    <p className="text-[10px] text-ink-muted">{VISITOR_LABEL[k]}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-2xs font-semibold text-ink-secondary mb-1">바인 횟수 순위</p>
            {m.ranking.length === 0 ? (
              <p className="text-2xs text-ink-muted text-center py-2">데이터 없음</p>
            ) : (
              <ul className="space-y-1">
                {m.ranking.slice(0, 20).map(([name, cnt], i) => (
                  <li key={name} className="flex items-center gap-2 px-2 py-1 rounded-input bg-surface-high border border-border-subtle">
                    <span className="w-5 text-center text-2xs font-bold text-gold-300 tabular-nums">{i + 1}</span>
                    <span className="flex-1 text-xs font-semibold text-ink-primary truncate">{name}</span>
                    <span className="text-xs font-bold text-ink-secondary tabular-nums">{cnt}회</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function DowTable({ dow }: { dow: Record<number, { entries: number; revenue: number; dates: Set<string> }> }) {
  const rows = [1, 2, 3, 4, 5, 6, 0].map((w) => {
    const d = dow[w];
    const days = d ? d.dates.size : 0;
    return { w, days, entries: d?.entries ?? 0, revenue: d?.revenue ?? 0, avgEntry: days ? (d!.entries / days) : 0 };
  });
  return (
    <div>
      <p className="text-2xs text-ink-muted mb-1">요일별 평균(전체 기간 기준)</p>
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

function Stat({ label, value, sub, danger, emerald }: { label: string; value: string; sub?: string; danger?: boolean; emerald?: boolean }) {
  const c = danger ? 'text-danger-light' : emerald ? 'text-emerald-400' : 'text-ink-primary';
  return (
    <div className="rounded-input bg-surface-low border border-border-subtle py-2 px-1 text-center">
      <p className={['text-base font-extrabold tabular-nums leading-none', c].join(' ')}>{value}</p>
      <p className="text-[10px] text-ink-muted mt-1">{label}</p>
      {sub && <p className="text-[9px] text-ink-muted">{sub}</p>}
    </div>
  );
}

// ── POS 설정(업주) ────────────────────────────────────────────────────────────
function PosSettings({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [hasPw, setHasPw] = useState(false);
  const [pw, setPw]       = useState('');
  const [pw2, setPw2]     = useState('');
  const [saving, setSaving] = useState(false);
  const [staff, setStaff]   = useState<User[]>([]);
  const [access, setAccess] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([posHasPassword(venueId), getMyVenueStaff(), getLedgerAccessUserIds(venueId)])
      .then(([h, s, a]) => { setHasPw(h); setStaff(s); setAccess(a); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [venueId]);

  const savePw = async () => {
    if (pw.length < 4) return toast.show('비밀번호는 4자리 이상이어야 합니다', 'error');
    if (pw !== pw2)     return toast.show('비밀번호가 일치하지 않습니다', 'error');
    setSaving(true);
    try { await setPosCancelPassword(venueId, pw); setHasPw(true); setPw(''); setPw2(''); toast.show('취소 비밀번호를 설정했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패했습니다', 'error'); }
    finally { setSaving(false); }
  };

  const toggleAccess = async (u: User) => {
    const has = access.includes(u.id);
    try {
      if (has) { await revokeLedgerAccess(venueId, u.id); setAccess((a) => a.filter((x) => x !== u.id)); }
      else     { await grantLedgerAccess(venueId, u.id); setAccess((a) => [...a, u.id]); }
    } catch (e) { toast.show(e instanceof Error ? e.message : '실패했습니다', 'error'); }
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
      <div className="space-y-1.5 pt-1 border-t border-border-subtle">
        <p className="text-2xs font-semibold text-ink-secondary">직원 장부·순위 접근 권한 (선별 부여)</p>
        {loading ? (
          <p className="text-center py-2 text-2xs text-ink-muted">불러오는 중…</p>
        ) : staff.length === 0 ? (
          <p className="text-2xs text-ink-muted">등록된 직원(구성원)이 없습니다. "직원 관리"에서 먼저 초대하세요.</p>
        ) : (
          <ul className="space-y-1">
            {staff.map((u) => {
              const on = access.includes(u.id);
              return (
                <li key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-input bg-surface-high border border-border-subtle">
                  <span className="flex-1 text-xs font-semibold text-ink-primary truncate">{u.name}{u.nickname ? ` · @${u.nickname}` : ''}</span>
                  <button type="button" onClick={() => toggleAccess(u)}
                    className={['text-2xs font-bold px-2.5 py-1 rounded-badge border transition-colors',
                      on ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'bg-surface-float text-ink-muted border-border-default'].join(' ')}>
                    {on ? '권한 있음' : '권한 없음'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[10px] text-ink-muted">통계는 업주만, 장부·순위 입력은 권한을 받은 직원만 가능합니다.</p>
      </div>
    </section>
  );
}
