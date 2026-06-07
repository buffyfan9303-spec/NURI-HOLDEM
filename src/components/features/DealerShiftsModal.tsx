// src/components/features/DealerShiftsModal.tsx — 딜러 로테이션 + 월 급여 명세.
import { useEffect, useMemo, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { getDealerShifts, addDealerShift, removeDealerShift, shiftHours, type DealerShift } from '../../api/dealerShifts';
import { wonToMan } from '../../api/ledger';

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthRange = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const start = `${key}-01`;
  const end = `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  return { start, end };
};

export default function DealerShiftsModal({ open, onClose, venueId, monthKey }: { open: boolean; onClose: () => void; venueId: string; monthKey: string }) {
  const toast = useToast();
  const [month, setMonth] = useState(monthKey);
  const [list, setList] = useState<DealerShift[]>([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [wage, setWage] = useState(0);

  const reload = (mk: string) => { const { start: s, end: e } = monthRange(mk); getDealerShifts(venueId, s, e).then(setList).catch(() => {}); };
  useEffect(() => { if (open) { setMonth(monthKey); reload(monthKey); } /* eslint-disable-next-line */ }, [open, venueId, monthKey]);

  const shiftMonth = (delta: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); const mk = ym(d); setMonth(mk); reload(mk); };

  const add = async () => {
    if (!name.trim() || !date) return toast.show('딜러 이름과 날짜를 입력하세요', 'error');
    try { await addDealerShift({ venueId, dealerName: name, shiftDate: date, startTime: start, endTime: end, hourlyWage: wage }); setName(''); setStart(''); setEnd(''); setWage(0); reload(month); }
    catch (e) { toast.show(e instanceof Error ? e.message : '추가 실패', 'error'); }
  };
  const del = async (id: string) => { try { await removeDealerShift(id); reload(month); } catch { /* noop */ } };

  // 급여 명세: 딜러별 시간·급여 합계
  const payroll = useMemo(() => {
    const m = new Map<string, { hours: number; pay: number; shifts: number }>();
    for (const s of list) {
      const h = shiftHours(s.startTime, s.endTime);
      const e = m.get(s.dealerName) ?? { hours: 0, pay: 0, shifts: 0 };
      e.hours += h; e.pay += h * s.hourlyWage; e.shifts += 1;
      m.set(s.dealerName, e);
    }
    return [...m.entries()].map(([dealer, v]) => ({ dealer, ...v })).sort((a, b) => b.pay - a.pay);
  }, [list]);
  const totalPay = payroll.reduce((a, p) => a + p.pay, 0);

  return (
    <Modal open={open} onClose={onClose} title="딜러 로테이션 · 급여" maxWidth="md" variant="sheet">
      <div className="space-y-3 p-4">
        {/* 월 이동 */}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => shiftMonth(-1)} className="btn-ghost px-3 text-xs">◀ 이전</button>
          <span className="text-sm font-bold text-ink-primary tabular-nums">{month.replace('-', '. ')}</span>
          <button type="button" onClick={() => shiftMonth(1)} className="btn-ghost px-3 text-xs">다음 ▶</button>
        </div>

        {/* 추가 폼 */}
        <div className="space-y-1.5 rounded-input border border-border-subtle bg-surface-low p-2.5">
          <div className="flex gap-1.5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="딜러 이름" className="input min-w-0 flex-1 text-sm" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-36 shrink-0 text-sm" />
          </div>
          <div className="flex gap-1.5">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input flex-1 text-sm" />
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input flex-1 text-sm" />
            <div className="relative w-28 shrink-0">
              <input type="number" inputMode="numeric" value={wage || ''} onChange={(e) => setWage(parseInt(e.target.value, 10) || 0)} placeholder="시급" className="input w-full pr-7 text-sm tabular-nums" />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">원</span>
            </div>
          </div>
          <button type="button" onClick={add} className="btn-primary w-full text-sm">+ 시프트 추가</button>
        </div>

        {/* 급여 명세 */}
        {payroll.length > 0 && (
          <div className="rounded-input border border-gold-400/30 bg-gold-300/[0.05] p-2.5">
            <p className="mb-1 text-2xs font-bold text-gold-300">이번 달 급여 명세 · 합계 {wonToMan(totalPay)}만원</p>
            <ul className="space-y-1">
              {payroll.map((p) => (
                <li key={p.dealer} className="flex items-center justify-between text-2xs">
                  <span className="text-ink-secondary">{p.dealer} <span className="text-ink-muted">{p.shifts}회·{p.hours}h</span></span>
                  <span className="font-bold text-ink-primary tabular-nums">{p.pay.toLocaleString()}원</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 시프트 목록 */}
        {list.length === 0 ? (
          <p className="py-6 text-center text-2xs text-ink-muted">이번 달 등록된 시프트가 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-low px-3 py-2">
                <span className="w-12 shrink-0 text-2xs text-ink-muted tabular-nums">{s.shiftDate.slice(5)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{s.dealerName}</span>
                <span className="shrink-0 text-2xs text-ink-muted tabular-nums">{s.startTime && s.endTime ? `${s.startTime}~${s.endTime} · ${shiftHours(s.startTime, s.endTime)}h` : '-'}</span>
                <button type="button" onClick={() => del(s.id)} aria-label="삭제" className="shrink-0 px-1 text-xs text-ink-muted hover:text-danger-light">✕</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-ink-muted">급여 = 근무 시간 × 시급. 종료가 시작보다 빠르면 익일 근무로 계산됩니다.</p>
      </div>
    </Modal>
  );
}
