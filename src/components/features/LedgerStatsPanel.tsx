// src/components/features/LedgerStatsPanel.tsx
// 업주 전용 — 당일 통계 + POS 설정(취소 비밀번호 / 직원 장부권한).
// 관계자 바이인 제외 토글, 가게지원 집계, 카드단가 반영 매출. (기간별·요일평균은 추후 확장)
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import type { User } from '../../api/auth';
import { getMyVenueStaff } from '../../api/auth';
import {
  type LedgerBuyin, type LedgerSession, type LedgerPlayer, type PaymentMethod, type VisitorType,
  cardUnit, wonToMan,
  getLedgerBuyins, getLedgerSession, getLedgerPlayers,
  posHasPassword, setPosCancelPassword,
  getLedgerAccessUserIds, grantLedgerAccess, revokeLedgerAccess,
} from '../../api/ledger';

const today = () => new Date().toLocaleDateString('en-CA'); // 로컬 날짜 — UTC 자정 넘김 방지
const METHOD_LABEL: Record<PaymentMethod, string> = { ticket: '티켓', cash: '현금', transfer: '이체', card: '카드', support: '지원' };
const VISITOR_LABEL: Record<VisitorType, string> = { new: '신규방문', regular: '기존손님', staff: '관계자', other: '기타' };

export default function LedgerStatsPanel({ venueId, showSettings = true }: { venueId: string; showSettings?: boolean }) {
  return (
    <div className="space-y-4">
      <DayStats venueId={venueId} />
      {showSettings && <PosSettings venueId={venueId} />}
    </div>
  );
}

// ── 당일(선택일) 통계 ─────────────────────────────────────────────────────────
function DayStats({ venueId }: { venueId: string }) {
  const [date, setDate]       = useState(today);
  const [buyins, setBuyins]   = useState<LedgerBuyin[]>([]);
  const [session, setSession] = useState<LedgerSession | null>(null);
  const [players, setPlayers] = useState<LedgerPlayer[]>([]);
  const [excludeStaff, setExcludeStaff] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getLedgerBuyins(venueId, date), getLedgerSession(venueId, date), getLedgerPlayers(venueId, date)])
      .then(([b, s, p]) => { setBuyins(b); setSession(s); setPlayers(p); })
      .finally(() => setLoading(false));
  }, [venueId, date]);

  const staffNames = useMemo(() => new Set(players.filter((p) => p.visitorType === 'staff').map((p) => p.name)), [players]);

  const m = useMemo(() => {
    const src = excludeStaff ? buyins.filter((b) => !staffNames.has(b.playerName)) : buyins;
    const total = src.length;
    const playerSet = new Set(src.map((b) => b.playerName));
    const unpaid = src.filter((b) => b.isUnpaid).length;
    const byMethod: Record<PaymentMethod, number> = { ticket: 0, cash: 0, transfer: 0, card: 0, support: 0 };
    const byPlayer: Record<string, number> = {};
    const unitOf = (b: LedgerBuyin) => (b.paymentMethod === 'card'
      ? cardUnit({ buyinAmount: session?.buyinAmount ?? 0, cardAmount: session?.cardAmount ?? null })
      : (session?.buyinAmount ?? 0));
    let revenue = 0, unpaidAmt = 0, support = 0;
    for (const b of src) {
      byMethod[b.paymentMethod]++;
      byPlayer[b.playerName] = (byPlayer[b.playerName] ?? 0) + 1;
      if (b.isSplit) { revenue += b.cashAmount + b.cardAmount + b.transferAmount; unpaidAmt += b.unpaidAmount; continue; }
      if (b.paymentMethod === 'support') support++;
      else if (b.paymentMethod !== 'ticket') { if (b.isUnpaid) unpaidAmt += unitOf(b); else revenue += unitOf(b); }
    }
    const target = session?.targetEntries ?? 0;
    const visitor: Record<VisitorType, number> = { new: 0, regular: 0, staff: 0, other: 0 };
    for (const p of players) {
      if (!p.visitorType) continue;
      if (p.visitorType === 'new' || p.visitorType === 'regular' || p.visitorType === 'staff') visitor[p.visitorType]++;
      else visitor.other++;  // 기타 + 직접입력(커스텀)
    }
    return {
      total, players: playerSet.size, unpaid,
      unpaidRatio: total ? Math.round((unpaid / total) * 100) : 0,
      fillRatio: target ? Math.round((total / target) * 100) : null,
      perPlayer: playerSet.size ? (total / playerSet.size) : 0,
      byMethod, ranking: Object.entries(byPlayer).sort((a, b) => b[1] - a[1]),
      target, revenue, unpaidAmt, support, visitor,
    };
  }, [buyins, session, players, excludeStaff, staffNames]);

  return (
    <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gold-300">통계 (당일)</h3>
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="input text-xs py-1 w-auto" />
      </div>

      {loading ? (
        <p className="text-center py-6 text-2xs text-ink-muted">불러오는 중…</p>
      ) : (
        <>
          {/* 관계자 제외 토글 */}
          <button type="button" onClick={() => setExcludeStaff((v) => !v)}
            className={['w-full flex items-center justify-between px-3 py-2 rounded-input border transition-colors',
              excludeStaff ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'bg-surface-high text-ink-secondary border-border-default'].join(' ')}>
            <span className="text-2xs font-semibold">관계자 바이인 제외</span>
            <span className="text-2xs font-bold">{excludeStaff ? 'ON' : 'OFF'}</span>
          </button>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="총 바인 수" value={`${m.total}`} />
            <Stat label="엔트리 비율" value={m.fillRatio !== null ? `${m.fillRatio}%` : '-'} sub={m.target ? `기준 ${m.target}` : '기준 미설정'} />
            <Stat label="미수 비율" value={`${m.unpaidRatio}%`} sub={`${m.unpaid}건`} danger={m.unpaidRatio > 0} />
            <Stat label="플레이어" value={`${m.players}명`} />
            <Stat label="플레이어당 바인" value={m.perPlayer ? m.perPlayer.toFixed(1) : '0'} />
            <Stat label="가게지원" value={`${m.support}건`} />
          </div>

          {/* 금액 */}
          <div className="grid grid-cols-2 gap-2">
            <Stat label="완납 매출" value={`${wonToMan(m.revenue)}만원`} emerald />
            <Stat label="당일 미수금" value={`${wonToMan(m.unpaidAmt)}만원`} danger={m.unpaidAmt > 0} />
          </div>

          {/* 결제수단별 */}
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

          {/* 방문 유형 */}
          {(m.visitor.new + m.visitor.regular + m.visitor.staff + m.visitor.other) > 0 && (
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

          {/* 바인 횟수 리스트 */}
          <div>
            <p className="text-2xs font-semibold text-ink-secondary mb-1">바인 횟수 순위</p>
            {m.ranking.length === 0 ? (
              <p className="text-2xs text-ink-muted text-center py-2">데이터 없음</p>
            ) : (
              <ul className="space-y-1">
                {m.ranking.map(([name, cnt], i) => (
                  <li key={name} className="flex items-center gap-2 px-2 py-1 rounded-input bg-surface-high border border-border-subtle">
                    <span className="w-5 text-center text-2xs font-bold text-gold-300 tabular-nums">{i + 1}</span>
                    <span className="flex-1 text-xs font-semibold text-ink-primary truncate">{name}</span>
                    <span className="text-xs font-bold text-ink-secondary tabular-nums">{cnt}회</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[10px] text-ink-muted">※ 요일별 평균 대비·기간별 통계는 다음 단계에서 추가됩니다.</p>
        </>
      )}
    </section>
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

      {/* 취소 비밀번호 */}
      <div className="space-y-1.5">
        <p className="text-2xs font-semibold text-ink-secondary">바이인 취소 비밀번호 {hasPw && <span className="text-emerald-400">· 설정됨</span>}</p>
        <div className="grid grid-cols-2 gap-2">
          <input type="password" inputMode="numeric" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={hasPw ? '새 비밀번호' : '비밀번호'} className="input text-sm" />
          <input type="password" inputMode="numeric" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="비밀번호 확인" className="input text-sm" />
        </div>
        <button type="button" onClick={savePw} disabled={saving || !pw} className="btn-primary text-xs w-full disabled:opacity-50">{hasPw ? '비밀번호 변경' : '비밀번호 설정'}</button>
      </div>

      {/* 직원 장부 권한 */}
      <div className="space-y-1.5 pt-1 border-t border-border-subtle">
        <p className="text-2xs font-semibold text-ink-secondary">직원 장부 접근 권한 (선별 부여)</p>
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
        <p className="text-[10px] text-ink-muted">통계는 업주(운영자)만 볼 수 있고, 장부 입력은 권한을 받은 직원만 가능합니다.</p>
      </div>
    </section>
  );
}
