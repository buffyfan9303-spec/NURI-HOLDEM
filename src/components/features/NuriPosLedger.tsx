// src/components/features/NuriPosLedger.tsx
// NURI POS 장부 — 무상태 2-Tap 결제 입력. 셀 클릭 → 모달 → [결제수단 + 완납/미수] 1탭 결정.
// 미수 셀은 붉은 테두리+뱃지로 격리. 취소는 업주 비밀번호 필요. 실시간 동기화.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '../atoms/Toast';
import {
  type LedgerBuyin, type LedgerSession, type PaymentMethod,
  getLedgerBuyins, getLedgerSession, saveLedgerSession, upsertBuyin, cancelBuyin,
  subscribeLedger, posHasPassword,
} from '../../api/ledger';

const today = () => new Date().toISOString().slice(0, 10);

const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'ticket',   label: '티켓' },
  { key: 'cash',     label: '현금' },
  { key: 'transfer', label: '이체' },
  { key: 'card',     label: '카드' },
];
const METHOD_SHORT: Record<PaymentMethod, string> = { ticket: 'T', cash: '현', transfer: '이', card: '카' };

interface SelectedCell { playerName: string; entryNo: number; buyin: LedgerBuyin | null; }

export default function NuriPosLedger({ venueId, canManage }: { venueId: string; canManage: boolean }) {
  const toast = useToast();
  const [date, setDate]       = useState(today);
  const [session, setSession] = useState<LedgerSession>({ venueId, sessionDate: today(), buyinAmount: 0, targetEntries: 0 });
  const [buyins, setBuyins]   = useState<LedgerBuyin[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPlayer, setNewPlayer] = useState('');
  const [selected, setSelected]   = useState<SelectedCell | null>(null);
  const [hasPw, setHasPw]         = useState(false);

  const mergePlayers = (list: LedgerBuyin[], keep: string[] = []) => {
    const names = [...new Set(list.map((b) => b.playerName))];
    keep.forEach((p) => { if (!names.includes(p)) names.push(p); });
    return names;
  };

  const reloadBuyins = useCallback(() => {
    getLedgerBuyins(venueId, date)
      .then((b) => { setBuyins(b); setPlayers((prev) => mergePlayers(b, prev)); })
      .catch(() => {});
  }, [venueId, date]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getLedgerSession(venueId, date), getLedgerBuyins(venueId, date), posHasPassword(venueId)])
      .then(([s, b, pw]) => { setSession(s); setBuyins(b); setPlayers(mergePlayers(b)); setHasPw(pw); })
      .finally(() => setLoading(false));
  }, [venueId, date]);

  // 실시간 동기화
  useEffect(() => subscribeLedger(venueId, reloadBuyins), [venueId, reloadBuyins]);

  const cellAt = (p: string, e: number) => buyins.find((b) => b.playerName === p && b.entryNo === e) ?? null;
  const maxEntry = (p: string) => buyins.reduce((m, b) => (b.playerName === p && b.entryNo > m ? b.entryNo : m), 0);

  const addPlayer = () => {
    const n = newPlayer.trim();
    if (!n) return;
    if (!players.includes(n)) setPlayers((p) => [...p, n]);
    setNewPlayer('');
  };

  // ── 정산(실시간 연산) ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let ticketPaid = 0, ticketUnpaid = 0, revenue = 0, unpaidAmt = 0, totalBuyins = 0;
    const amt = session.buyinAmount || 0;
    for (const b of buyins) {
      totalBuyins++;
      if (b.paymentMethod === 'ticket') {
        if (b.isUnpaid) ticketUnpaid++; else ticketPaid++;
      } else {
        if (b.isUnpaid) unpaidAmt += amt; else revenue += amt;
      }
    }
    return { ticketPaid, ticketUnpaid, revenue, unpaidAmt, totalBuyins };
  }, [buyins, session.buyinAmount]);

  if (loading) return <p className="py-10 text-center text-xs text-ink-muted">장부 불러오는 중…</p>;

  return (
    <div className="space-y-3 pb-24">
      {/* 날짜 + 세션 설정 */}
      <div className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="input flex-1 text-sm" />
          {date !== today() && <button type="button" onClick={() => setDate(today())} className="btn-ghost text-xs px-3 shrink-0">오늘</button>}
        </div>
        {canManage && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-2xs text-ink-muted mb-0.5">1회 바이인 금액(원)</span>
              <input type="number" inputMode="numeric" value={session.buyinAmount || ''}
                onChange={(e) => setSession((s) => ({ ...s, buyinAmount: parseInt(e.target.value, 10) || 0 }))}
                onBlur={() => saveLedgerSession(session).catch(() => {})}
                placeholder="100000" className="input w-full text-sm tabular-nums" />
            </label>
            <label className="block">
              <span className="block text-2xs text-ink-muted mb-0.5">기준 엔트리(통계용)</span>
              <input type="number" inputMode="numeric" value={session.targetEntries || ''}
                onChange={(e) => setSession((s) => ({ ...s, targetEntries: parseInt(e.target.value, 10) || 0 }))}
                onBlur={() => saveLedgerSession(session).catch(() => {})}
                placeholder="100" className="input w-full text-sm tabular-nums" />
            </label>
          </div>
        )}
        {canManage && !hasPw && (
          <p className="text-2xs text-danger-light">※ 바이인 취소 비밀번호가 설정되지 않았습니다. 아래 "통계/설정"에서 먼저 설정하세요.</p>
        )}
      </div>

      {/* 플레이어 추가 */}
      <div className="flex gap-1.5">
        <input value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayer(); } }}
          placeholder="플레이어 이름 추가 (Enter)" maxLength={20} className="input flex-1 text-sm" />
        <button type="button" onClick={addPlayer} disabled={!newPlayer.trim()} className="btn-primary text-xs px-4 shrink-0 disabled:opacity-50">추가</button>
      </div>

      {/* 장부 보드 */}
      {players.length === 0 ? (
        <p className="py-10 text-center text-xs text-ink-muted">플레이어를 추가하면 바이인을 입력할 수 있습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {players.map((p) => {
            const mx = maxEntry(p);
            const cells = Array.from({ length: mx + 1 }, (_, i) => i + 1); // 1..mx + 다음(+) 칸
            const count = buyins.filter((b) => b.playerName === p).length;
            return (
              <li key={p} className="rounded-input border border-border-subtle bg-surface-low p-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-sm font-bold text-ink-primary truncate flex-1">{p}</span>
                  <span className="text-2xs text-ink-muted shrink-0">{count}회</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cells.map((e) => {
                    const c = cellAt(p, e);
                    if (!c) {
                      // 빈 칸(+)
                      return (
                        <button key={e} type="button"
                          onClick={() => setSelected({ playerName: p, entryNo: e, buyin: null })}
                          className="w-12 h-12 rounded-input border-2 border-dashed border-border-default text-ink-muted hover:border-gold-400 hover:text-gold-300 transition-colors flex items-center justify-center text-lg font-bold">
                          +
                        </button>
                      );
                    }
                    return (
                      <button key={e} type="button"
                        onClick={() => setSelected({ playerName: p, entryNo: e, buyin: c })}
                        className={[
                          'w-12 h-12 rounded-input border-2 flex flex-col items-center justify-center transition-colors',
                          c.isUnpaid
                            ? 'border-danger bg-danger/10 text-danger-light'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                        ].join(' ')}>
                        <span className="text-sm font-extrabold leading-none">{METHOD_SHORT[c.paymentMethod]}</span>
                        <span className="text-[9px] leading-none mt-0.5">{c.isUnpaid ? '미수' : '완납'}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 정산 바 (고정) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-6xl bg-surface-mid/95 backdrop-blur-md border-t border-border-default px-page-x py-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] text-ink-muted">회수 티켓</p>
            <p className="text-sm font-bold text-ink-primary tabular-nums">{stats.ticketPaid}장
              {stats.ticketUnpaid > 0 && <span className="text-danger-light text-2xs ml-1">(미수 {stats.ticketUnpaid})</span>}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-ink-muted">완납 매출</p>
            <p className="text-sm font-bold text-emerald-400 tabular-nums">{stats.revenue.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-ink-muted">당일 미수금</p>
            <p className="text-sm font-bold text-danger-light tabular-nums">{stats.unpaidAmt.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* 2-Tap 결제 모달 */}
      {selected && (
        <PaymentModal
          cell={selected}
          hasPw={hasPw}
          onClose={() => setSelected(null)}
          onPick={async (method, isUnpaid) => {
            try {
              await upsertBuyin({ venueId, sessionDate: date, playerName: selected.playerName, entryNo: selected.entryNo, paymentMethod: method, isUnpaid });
              setSelected(null);
              reloadBuyins();
            } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
          }}
          onCancelBuyin={async (pw) => {
            if (!selected.buyin) return;
            try {
              await cancelBuyin(selected.buyin.id, pw);
              toast.show('바이인을 취소했습니다', 'info');
              setSelected(null);
              reloadBuyins();
            } catch (e) { toast.show(e instanceof Error ? e.message : '취소 실패', 'error'); }
          }}
        />
      )}
    </div>
  );
}

// ── 2-Tap 결제 입력 모달 ──────────────────────────────────────────────────────
function PaymentModal({ cell, hasPw, onClose, onPick, onCancelBuyin }: {
  cell: SelectedCell; hasPw: boolean;
  onClose: () => void;
  onPick: (m: PaymentMethod, isUnpaid: boolean) => void;
  onCancelBuyin: (pw: string) => void;
}) {
  const [cancelMode, setCancelMode] = useState(false);
  const [pw, setPw] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-default" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-sm mx-4 rounded-dialog bg-surface-mid shadow-dialog animate-slide-up overflow-hidden">
        <header className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-primary">
            {cell.playerName} · {cell.entryNo}회차
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
          </button>
        </header>

        <div className="p-3 space-y-2">
          {METHODS.map((m) => (
            <div key={m.key} className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onPick(m.key, false)}
                className="h-12 rounded-input border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-bold text-sm active:scale-95 transition-all hover:bg-emerald-500/20">
                {m.label} 완납
              </button>
              <button type="button" onClick={() => onPick(m.key, true)}
                className="h-12 rounded-input border border-danger/50 bg-danger/10 text-danger-light font-bold text-sm active:scale-95 transition-all hover:bg-danger/20">
                {m.label} 미수
              </button>
            </div>
          ))}

          {/* 기존 셀: 취소(삭제) */}
          {cell.buyin && (
            <div className="pt-1 border-t border-border-subtle">
              {!cancelMode ? (
                <button type="button" onClick={() => setCancelMode(true)}
                  className="w-full h-10 rounded-input border border-border-default text-ink-muted text-xs font-semibold hover:text-danger-light hover:border-danger/40 transition-colors">
                  결제 취소 (내역 삭제)
                </button>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-2xs text-ink-muted">취소하려면 업주 비밀번호를 입력하세요.</p>
                  <div className="flex gap-1.5">
                    <input type="password" inputMode="numeric" value={pw} onChange={(e) => setPw(e.target.value)}
                      placeholder={hasPw ? '취소 비밀번호' : '비밀번호 미설정'} disabled={!hasPw}
                      className="input flex-1 text-sm" autoFocus />
                    <button type="button" onClick={() => onCancelBuyin(pw)} disabled={!hasPw || !pw}
                      className="btn-danger text-xs px-3 shrink-0 disabled:opacity-50">취소 확정</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
