// src/components/features/NuriPosLedger.tsx
// NURI POS 장부 — 표(table) 형태. 장부 입장 시 세션 설정(담당직원·게임·단가·이벤트·딜러) → 보드.
// 셀 2-Tap 입력(결제수단 + 완납/미수/가게지원). 티켓·지원은 미수 불가. 미수=붉은색.
// 8바인 초과 시 가로 스크롤. 비고 컬럼 수기 입력. 장부 마감=읽기전용 스냅샷+메모. 엑셀 내보내기.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  type LedgerBuyin, type LedgerSession, type LedgerPlayer, type PaymentMethod, type VisitorType,
  cardUnit,
  getLedgerSession, saveLedgerSession, openLedgerSession, closeLedgerSession, reopenLedgerSession,
  getLedgerBuyins, upsertBuyin, cancelBuyin,
  getLedgerPlayers, addLedgerPlayer, updateLedgerPlayer, removeLedgerPlayer,
  subscribeLedger, posHasPassword,
} from '../../api/ledger';
import { exportLedgerXls } from '../../lib/ledgerExport';

const today = () => new Date().toISOString().slice(0, 10);

const METHOD_SHORT: Record<PaymentMethod, string> = { ticket: 'T', cash: '현', transfer: '이', card: '카', support: '지원' };
const VISITOR_LABEL: Record<VisitorType, string> = { new: '신규', regular: '기존', staff: '관계자' };
const VISITOR_CYCLE: (VisitorType | null)[] = [null, 'new', 'regular', 'staff'];

function hhmm(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return ''; }
}

interface SelectedCell { playerName: string; entryNo: number; buyin: LedgerBuyin | null; }

export default function NuriPosLedger({ venueId, canManage, venueName = 'NURI POS' }: {
  venueId: string; canManage: boolean; venueName?: string;
}) {
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const operatorOk = isAdmin || !!user?.approved; // 담당직원: 승인된 계정만 운영
  const operatorName = user?.name ?? user?.nickname ?? '담당직원';

  const [date, setDate]       = useState(today);
  const [session, setSession] = useState<LedgerSession>({ venueId, sessionDate: today(), buyinAmount: 0, cardAmount: null, targetEntries: 0, closed: false });
  const [buyins, setBuyins]   = useState<LedgerBuyin[]>([]);
  const [players, setPlayers] = useState<LedgerPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPw, setHasPw]     = useState(false);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [query, setQuery]     = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<VisitorType | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [editOpen, setEditOpen]   = useState(false);

  const reload = useCallback(() => {
    Promise.all([getLedgerBuyins(venueId, date), getLedgerPlayers(venueId, date)])
      .then(([b, p]) => { setBuyins(b); setPlayers(p); }).catch(() => {});
  }, [venueId, date]);
  const reloadSession = useCallback(() => { getLedgerSession(venueId, date).then(setSession).catch(() => {}); }, [venueId, date]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getLedgerSession(venueId, date), getLedgerBuyins(venueId, date), getLedgerPlayers(venueId, date), posHasPassword(venueId)])
      .then(([s, b, p, pw]) => { setSession(s); setBuyins(b); setPlayers(p); setHasPw(pw); })
      .finally(() => setLoading(false));
  }, [venueId, date]);

  useEffect(() => subscribeLedger(venueId, reload), [venueId, reload]);

  const closed = session.closed;
  const showSetup = !session.openedAt && !closed && buyins.length === 0 && players.length === 0;

  const cellAt = (name: string, e: number) => buyins.find((b) => b.playerName === name && b.entryNo === e) ?? null;
  const countOf = (name: string) => buyins.filter((b) => b.playerName === name).length;
  const maxEntryOf = (name: string) => buyins.reduce((m, b) => (b.playerName === name && b.entryNo > m ? b.entryNo : m), 0);
  const globalMax = buyins.reduce((m, b) => Math.max(m, b.entryNo), 0);
  const colCount = Math.max(8, globalMax + 1);

  const rows = useMemo(() => {
    const rosterNames = players.map((p) => p.name);
    const buyinOnly = [...new Set(buyins.map((b) => b.playerName))].filter((n) => !rosterNames.includes(n));
    const base: { name: string; player: LedgerPlayer | null }[] = [
      ...players.map((p) => ({ name: p.name, player: p as LedgerPlayer | null })),
      ...buyinOnly.map((n) => ({ name: n, player: null as LedgerPlayer | null })),
    ];
    const q = query.trim().toLowerCase();
    return q ? base.filter((r) => r.name.toLowerCase().includes(q)) : base;
  }, [players, buyins, query]);

  const stats = useMemo(() => {
    let totalBuyins = 0, ticket = 0, revenue = 0, unpaid = 0, support = 0;
    for (const b of buyins) {
      totalBuyins++;
      if (b.paymentMethod === 'support') support++;
      else if (b.paymentMethod === 'ticket') ticket++;
      else {
        const unit = b.paymentMethod === 'card' ? cardUnit(session) : session.buyinAmount;
        if (b.isUnpaid) unpaid += unit; else revenue += unit;
      }
    }
    return { totalBuyins, ticket, revenue, unpaid, support };
  }, [buyins, session]);

  // ── 액션 ──────────────────────────────────────────────────────────────────
  const handleOpen = async (s: LedgerSession) => {
    try { await openLedgerSession(s); await reloadSession(); toast.show('장부를 시작했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '시작 실패', 'error'); }
  };
  const handleEditSave = async (s: LedgerSession) => {
    try { await saveLedgerSession(s); setSession((prev) => ({ ...prev, ...s })); setEditOpen(false); toast.show('세션 정보를 저장했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
  };
  const handleClose = async (memo: string) => {
    try { await closeLedgerSession(venueId, date, memo); await reloadSession(); setCloseOpen(false); toast.show('장부를 마감했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '마감 실패', 'error'); }
  };
  const handleReopen = async () => {
    try { await reopenLedgerSession(venueId, date); await reloadSession(); toast.show('마감을 해제했습니다', 'info'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '해제 실패', 'error'); }
  };
  const addPlayer = async () => {
    const n = newName.trim();
    if (!n) return;
    try {
      await addLedgerPlayer({ venueId, sessionDate: date, name: n, visitorType: newType, sortOrder: players.length });
      setNewName(''); setNewType(null); setAddOpen(false); reload();
    } catch (e) { toast.show(e instanceof Error ? e.message : '추가 실패', 'error'); }
  };
  const cycleType = async (p: LedgerPlayer) => {
    const idx = VISITOR_CYCLE.indexOf(p.visitorType);
    const next = VISITOR_CYCLE[(idx + 1) % VISITOR_CYCLE.length];
    try { await updateLedgerPlayer(p.id, { visitorType: next }); reload(); } catch { /* noop */ }
  };
  const saveNote = async (p: LedgerPlayer, note: string) => {
    if ((p.note ?? '') === note) return;
    try { await updateLedgerPlayer(p.id, { note: note || null }); } catch { /* noop */ }
  };
  const removePlayer = async (p: LedgerPlayer) => {
    if (countOf(p.name) > 0) { toast.show('바인 기록이 있는 플레이어는 삭제할 수 없습니다', 'error'); return; }
    try { await removeLedgerPlayer(p.id); reload(); } catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); }
  };

  if (loading) return <p className="py-10 text-center text-xs text-ink-muted">장부 불러오는 중…</p>;

  // ── 세션 설정(장부 입장 게이트) ────────────────────────────────────────────
  if (showSetup) {
    return (
      <div className="space-y-3">
        <DateBar date={date} setDate={setDate} />
        {!operatorOk ? (
          <div className="rounded-card border border-danger/40 bg-danger/10 p-4 text-center">
            <p className="text-sm font-bold text-danger-light">승인된 계정만 장부를 운영할 수 있습니다.</p>
            <p className="text-2xs text-ink-muted mt-1">업주 승인 완료 후 이용하세요.</p>
          </div>
        ) : (
          <SessionForm
            base={session} mode="open" operatorName={operatorName}
            onSubmit={handleOpen}
          />
        )}
      </div>
    );
  }

  // ── 보드 ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-28">
      <DateBar date={date} setDate={setDate} />

      {/* 세션 요약 */}
      <div className="rounded-card border border-border-default bg-surface-low p-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-ink-primary">{session.title || '세션'}</span>
        <span className="text-2xs text-ink-muted">현금 {session.buyinAmount.toLocaleString()}원
          {session.cardAmount && session.cardAmount > 0 ? ` · 카드 ${session.cardAmount.toLocaleString()}원` : ' · 카드=현금'}</span>
        {session.openedAt && <span className="text-2xs text-ink-muted">· 담당 {operatorName}</span>}
        <span className="flex-1" />
        {!closed && <button type="button" onClick={() => setEditOpen(true)} className="btn-ghost text-2xs px-2.5 py-1">세션 정보 수정</button>}
      </div>

      {closed && (
        <div className="rounded-card border border-gold-400/40 bg-gold-300/10 p-2.5 flex items-center gap-2">
          <span className="text-xs font-bold text-gold-300">마감됨 (읽기전용){session.closedAt ? ` · ${hhmm(session.closedAt)}` : ''}</span>
          {session.closeMemo && <span className="text-2xs text-ink-secondary truncate">메모: {session.closeMemo}</span>}
          <span className="flex-1" />
          {canManage && <button type="button" onClick={handleReopen} className="btn-ghost text-2xs px-2.5 py-1">마감 해제</button>}
        </div>
      )}

      {/* 검색 + 유저 추가 */}
      {!closed && (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="플레이어 검색"
                className="input w-full text-sm pl-8" />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="9" cy="9" r="6" /><line x1="14" y1="14" x2="18" y2="18" strokeLinecap="round" />
              </svg>
            </div>
            <button type="button" onClick={() => setAddOpen((v) => !v)} className="btn-primary text-xs px-3 shrink-0">+ 유저 추가</button>
          </div>

          {addOpen && (
            <div className="rounded-input border border-border-default bg-surface-low p-2 space-y-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayer(); } }}
                placeholder="닉네임 또는 이름" maxLength={20} className="input w-full text-sm" autoFocus />
              <div className="flex items-center gap-1.5">
                <span className="text-2xs text-ink-muted">유형(선택):</span>
                {(['new', 'regular', 'staff'] as VisitorType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setNewType((cur) => (cur === t ? null : t))}
                    className={['text-2xs font-bold px-2 py-1 rounded-badge border transition-colors',
                      newType === t ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'bg-surface-float text-ink-muted border-border-default'].join(' ')}>
                    {VISITOR_LABEL[t]}
                  </button>
                ))}
                <span className="flex-1" />
                <button type="button" onClick={addPlayer} disabled={!newName.trim()} className="btn-primary text-xs px-4 disabled:opacity-50">추가</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 표 보드 */}
      {rows.length === 0 ? (
        <p className="py-10 text-center text-xs text-ink-muted">{query ? '검색 결과가 없습니다.' : '유저를 추가하면 바인을 입력할 수 있습니다.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border-subtle">
          <table className="border-separate border-spacing-0 text-center">
            <thead>
              <tr className="bg-surface-high">
                <th className="sticky left-0 z-20 bg-surface-high w-9 px-1 py-1.5 text-[10px] text-ink-muted border-b border-border-subtle">No</th>
                <th className="sticky left-9 z-20 bg-surface-high min-w-[7.5rem] px-2 py-1.5 text-[10px] text-ink-muted border-b border-l border-border-subtle text-left">플레이어</th>
                {Array.from({ length: colCount }, (_, i) => (
                  <th key={i} className="w-[3.9rem] px-0.5 py-1.5 text-[10px] text-ink-muted border-b border-l border-border-subtle">{i + 1}바인</th>
                ))}
                <th className="min-w-[8rem] px-2 py-1.5 text-[10px] text-ink-muted border-b border-l border-border-subtle text-left">비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const cnt = countOf(r.name);
                const mx = maxEntryOf(r.name);
                return (
                  <tr key={r.name} className="even:bg-surface-base/40">
                    <td className="sticky left-0 z-10 bg-surface-low w-9 px-1 py-1 text-[10px] text-ink-muted border-b border-border-subtle tabular-nums">{ri + 1}</td>
                    <td className="sticky left-9 z-10 bg-surface-low min-w-[7.5rem] px-2 py-1 border-b border-l border-border-subtle text-left">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-ink-primary truncate max-w-[5rem]" title={r.name}>{r.name}</span>
                        <span className="text-[9px] text-ink-muted shrink-0">{cnt}회</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {r.player ? (
                          <button type="button" onClick={() => !closed && cycleType(r.player as LedgerPlayer)} disabled={closed}
                            title="클릭 시 유형 변경(신규→기존→관계자→없음)"
                            className={['text-[9px] font-bold px-1.5 py-0.5 rounded-badge border transition-colors',
                              r.player.visitorType ? 'bg-gold-300/15 text-gold-300 border-gold-400/40' : 'bg-surface-float text-ink-muted border-border-default'].join(' ')}>
                            {r.player.visitorType ? VISITOR_LABEL[r.player.visitorType] : '유형'}
                          </button>
                        ) : <span className="text-[9px] text-ink-muted">—</span>}
                        {r.player && !closed && cnt === 0 && (
                          <button type="button" onClick={() => removePlayer(r.player as LedgerPlayer)} title="삭제"
                            className="text-[9px] text-ink-muted hover:text-danger-light px-1">✕</button>
                        )}
                      </div>
                    </td>

                    {Array.from({ length: colCount }, (_, i) => {
                      const e = i + 1;
                      const c = cellAt(r.name, e);
                      const cls = 'w-[3.9rem] h-[2.6rem] px-0.5 py-0.5 border-b border-l border-border-subtle align-middle';
                      if (c) {
                        const tone = c.paymentMethod === 'support'
                          ? 'border-indigo-400/50 bg-indigo-500/10 text-indigo-300'
                          : c.isUnpaid ? 'border-danger bg-danger/10 text-danger-light'
                          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
                        return (
                          <td key={e} className={cls}>
                            <button type="button" disabled={closed}
                              onClick={() => !closed && setSelected({ playerName: r.name, entryNo: e, buyin: c })}
                              className={['w-full h-full rounded-input border-2 flex flex-col items-center justify-center leading-none', tone, closed ? 'cursor-default' : ''].join(' ')}>
                              <span className="text-[11px] font-extrabold">{METHOD_SHORT[c.paymentMethod]}{c.isUnpaid ? '·미' : ''}</span>
                              <span className="text-[8px] opacity-80 mt-0.5">{hhmm(c.buyinAt)}</span>
                            </button>
                          </td>
                        );
                      }
                      if (!closed && e <= mx + 1) {
                        return (
                          <td key={e} className={cls}>
                            <button type="button" onClick={() => setSelected({ playerName: r.name, entryNo: e, buyin: null })}
                              className="w-full h-full rounded-input border-2 border-dashed border-border-default text-ink-muted hover:border-gold-400 hover:text-gold-300 transition-colors flex items-center justify-center text-base font-bold">+</button>
                          </td>
                        );
                      }
                      return <td key={e} className={cls}><div className="w-full h-full rounded-input bg-surface-base/30" /></td>;
                    })}

                    <td className="min-w-[8rem] px-1 py-1 border-b border-l border-border-subtle">
                      {r.player ? (
                        <input defaultValue={r.player.note ?? ''} disabled={closed} maxLength={60}
                          onBlur={(e) => saveNote(r.player as LedgerPlayer, e.target.value.trim())}
                          placeholder="비고" className="w-full bg-transparent text-2xs text-ink-secondary placeholder:text-ink-muted/60 outline-none disabled:opacity-70" />
                      ) : <span className="text-2xs text-ink-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 정산 바 (고정) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-6xl bg-surface-mid/95 backdrop-blur-md border-t border-border-default px-page-x py-2">
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-4 gap-2 flex-1 text-center">
            <Metric label="총 엔트리" value={`${stats.totalBuyins}`} />
            <Metric label="회수 티켓" value={`${stats.ticket}장`} />
            <Metric label="완납 매출" value={stats.revenue.toLocaleString()} tone="emerald" />
            <Metric label="미수금" value={stats.unpaid.toLocaleString()} tone="danger" />
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button type="button" onClick={() => exportLedgerXls({ venueName, session, players, buyins })}
              className="btn-ghost text-2xs px-3 py-1">엑셀</button>
            {!closed
              ? <button type="button" onClick={() => setCloseOpen(true)} className="btn-primary text-2xs px-3 py-1">장부 마감</button>
              : <span className="text-2xs text-gold-300 text-center font-bold px-3 py-1">마감됨</span>}
          </div>
        </div>
        {stats.support > 0 && <p className="text-[10px] text-indigo-300 text-center mt-0.5">가게지원 {stats.support}건</p>}
      </div>

      {/* 2-Tap 결제 모달 */}
      {selected && (
        <PaymentModal
          cell={selected} hasPw={hasPw}
          onClose={() => setSelected(null)}
          onPick={async (method, isUnpaid) => {
            try {
              await upsertBuyin({ venueId, sessionDate: date, playerName: selected.playerName, entryNo: selected.entryNo, paymentMethod: method, isUnpaid });
              setSelected(null); reload();
            } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
          }}
          onCancelBuyin={async (pw) => {
            if (!selected.buyin) return;
            try { await cancelBuyin(selected.buyin.id, pw); toast.show('바인을 취소했습니다', 'info'); setSelected(null); reload(); }
            catch (e) { toast.show(e instanceof Error ? e.message : '취소 실패', 'error'); }
          }}
        />
      )}

      {/* 세션 정보 수정 */}
      {editOpen && (
        <Overlay onClose={() => setEditOpen(false)} title="세션 정보 수정">
          <SessionForm base={session} mode="edit" operatorName={operatorName} onSubmit={handleEditSave} onCancel={() => setEditOpen(false)} embedded />
        </Overlay>
      )}

      {/* 장부 마감 */}
      {closeOpen && (
        <CloseModal stats={stats} onClose={() => setCloseOpen(false)} onConfirm={handleClose} />
      )}
    </div>
  );
}

// ── 날짜 바 ───────────────────────────────────────────────────────────────────
function DateBar({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="input flex-1 text-sm" />
      {date !== today() && <button type="button" onClick={() => setDate(today())} className="btn-ghost text-xs px-3 shrink-0">오늘</button>}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'danger' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'danger' ? 'text-danger-light' : 'text-ink-primary';
  return (
    <div>
      <p className="text-[10px] text-ink-muted leading-none">{label}</p>
      <p className={['text-sm font-bold tabular-nums leading-tight mt-0.5', c].join(' ')}>{value}</p>
    </div>
  );
}

// ── 세션 설정 폼 (입장/수정 공용) ─────────────────────────────────────────────
function SessionForm({ base, mode, operatorName, onSubmit, onCancel, embedded }: {
  base: LedgerSession; mode: 'open' | 'edit'; operatorName: string;
  onSubmit: (s: LedgerSession) => void; onCancel?: () => void; embedded?: boolean;
}) {
  const [title, setTitle]     = useState(base.title ?? '');
  const [cash, setCash]       = useState<number>(base.buyinAmount || 0);
  const [card, setCard]       = useState<number>(base.cardAmount ?? 0);
  const [target, setTarget]   = useState<number>(base.targetEntries || 0);
  const [event, setEvent]     = useState(base.eventMemo ?? '');
  const [dealers, setDealers] = useState(base.dealers ?? '');

  const submit = () => {
    if (cash <= 0) return;
    onSubmit({
      ...base, title: title.trim() || undefined,
      buyinAmount: cash, cardAmount: card > 0 ? card : null,
      targetEntries: target, eventMemo: event.trim() || undefined, dealers: dealers.trim() || undefined,
    });
  };

  return (
    <div className={embedded ? 'space-y-3' : 'rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent p-4 space-y-3'}>
      {mode === 'open' && (
        <div>
          <h3 className="text-base font-bold text-gold-300">장부 시작 설정</h3>
          <p className="text-2xs text-ink-muted mt-0.5">담당직원: <b className="text-ink-secondary">{operatorName}</b> · 아래 정보를 입력 후 장부에 입장합니다.</p>
        </div>
      )}

      <Field label="금일 게임 내용">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 데일리 딥스택" maxLength={40} className="input w-full text-sm" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="현금단가(원) *">
          <input type="number" inputMode="numeric" value={cash || ''} onChange={(e) => setCash(parseInt(e.target.value, 10) || 0)} placeholder="100000" className="input w-full text-sm tabular-nums" />
        </Field>
        <Field label="카드단가(원) · 선택">
          <input type="number" inputMode="numeric" value={card || ''} onChange={(e) => setCard(parseInt(e.target.value, 10) || 0)} placeholder="미입력=현금단가" className="input w-full text-sm tabular-nums" />
        </Field>
      </div>

      <Field label="기준 엔트리(통계용) · 선택">
        <input type="number" inputMode="numeric" value={target || ''} onChange={(e) => setTarget(parseInt(e.target.value, 10) || 0)} placeholder="100" className="input w-full text-sm tabular-nums" />
      </Field>

      <Field label="이벤트 · 비고 · 선택">
        <textarea value={event} onChange={(e) => setEvent(e.target.value)} rows={2} placeholder="예) 1만원 추가 = 1스택 추가" maxLength={200} className="input w-full text-sm resize-none" />
      </Field>

      <Field label="금일 딜러 명단 · 선택">
        <textarea value={dealers} onChange={(e) => setDealers(e.target.value)} rows={2} placeholder="한 줄에 한 명" maxLength={300} className="input w-full text-sm resize-none" />
      </Field>

      <div className="flex gap-2 pt-1">
        {onCancel && <button type="button" onClick={onCancel} className="btn-ghost text-sm flex-1">취소</button>}
        <button type="button" onClick={submit} disabled={cash <= 0} className="btn-primary text-sm flex-1 disabled:opacity-50">
          {mode === 'open' ? '장부 시작' : '저장'}
        </button>
      </div>
      {cash <= 0 && <p className="text-2xs text-danger-light">현금단가를 입력하세요.</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-2xs text-ink-muted mb-0.5">{label}</span>
      {children}
    </label>
  );
}

// ── 오버레이(모달 셸) ─────────────────────────────────────────────────────────
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-default" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md mx-4 max-h-[88vh] overflow-y-auto rounded-dialog bg-surface-mid shadow-dialog animate-slide-up">
        <header className="sticky top-0 px-4 py-3 border-b border-border-subtle bg-surface-mid flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-primary">{title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
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
  const dualMethods: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: '현금' }, { key: 'transfer', label: '이체' }, { key: 'card', label: '카드' },
  ];

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
          <h2 className="text-sm font-bold text-ink-primary">{cell.playerName} · {cell.entryNo}바인</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
          </button>
        </header>

        <div className="p-3 space-y-2">
          {/* 티켓: 완납만 */}
          <button type="button" onClick={() => onPick('ticket', false)}
            className="w-full h-12 rounded-input border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-bold text-sm active:scale-95 transition-all hover:bg-emerald-500/20">
            티켓 (완납)
          </button>

          {/* 현금/이체/카드: 완납·미수 */}
          {dualMethods.map((m) => (
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

          {/* 가게지원 */}
          <button type="button" onClick={() => onPick('support', false)}
            className="w-full h-12 rounded-input border border-indigo-400/50 bg-indigo-500/10 text-indigo-300 font-bold text-sm active:scale-95 transition-all hover:bg-indigo-500/20">
            가게지원
          </button>

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
                      placeholder={hasPw ? '취소 비밀번호' : '비밀번호 미설정'} disabled={!hasPw} className="input flex-1 text-sm" autoFocus />
                    <button type="button" onClick={() => onCancelBuyin(pw)} disabled={!hasPw || !pw} className="btn-danger text-xs px-3 shrink-0 disabled:opacity-50">취소 확정</button>
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

// ── 장부 마감 모달 ────────────────────────────────────────────────────────────
function CloseModal({ stats, onClose, onConfirm }: {
  stats: { totalBuyins: number; ticket: number; revenue: number; unpaid: number; support: number };
  onClose: () => void; onConfirm: (memo: string) => void;
}) {
  const [memo, setMemo] = useState('');
  return (
    <Overlay title="장부 마감" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <SummaryStat label="총 엔트리" value={`${stats.totalBuyins}`} />
          <SummaryStat label="회수 티켓" value={`${stats.ticket}장`} />
          <SummaryStat label="완납 매출" value={`${stats.revenue.toLocaleString()}원`} tone="emerald" />
          <SummaryStat label="당일 미수금" value={`${stats.unpaid.toLocaleString()}원`} tone="danger" />
          <SummaryStat label="가게지원" value={`${stats.support}건`} />
        </div>
        <label className="block">
          <span className="block text-2xs text-ink-muted mb-0.5">마감 메모(수기 비고) · 선택</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={300}
            placeholder="예) 미수 3건은 내일 정산 예정" className="input w-full text-sm resize-none" />
        </label>
        <p className="text-2xs text-danger-light">마감하면 해당 날짜 장부는 읽기전용으로 잠깁니다. (업주만 해제 가능)</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost text-sm flex-1">취소</button>
          <button type="button" onClick={() => onConfirm(memo)} className="btn-primary text-sm flex-1">마감 확정</button>
        </div>
      </div>
    </Overlay>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'danger' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'danger' ? 'text-danger-light' : 'text-ink-primary';
  return (
    <div className="rounded-input bg-surface-low border border-border-subtle py-2 text-center">
      <p className={['text-base font-extrabold tabular-nums', c].join(' ')}>{value}</p>
      <p className="text-[10px] text-ink-muted mt-0.5">{label}</p>
    </div>
  );
}
