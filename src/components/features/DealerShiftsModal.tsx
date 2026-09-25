// src/components/features/DealerShiftsModal.tsx — 딜러 로테이션 + 월 급여 명세.
import { useEffect, useMemo, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { getDealerShifts, addDealerShift, removeDealerShift, shiftHours, type DealerShift } from '../../api/dealerShifts';
import { wonToMan } from '../../api/ledger';
import Icon from '../atoms/Icon';
import { msgOf } from '../../lib/dbError';

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
  // F6 후속(2026-09-13): getDealerShifts 가 실패를 던지게 되면서 옛 `.catch(() => {})` 가 실제로 실행되는 코드가 됐다 —
  //   실패하면 목록이 갱신되지 않은 채 조용히 남는다. StaffPayroll 의 dealerErr 와 같은 관용구로 실패를 말한다.
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const reload = (mk: string) => {
    const { start: s, end: e } = monthRange(mk);
    getDealerShifts(venueId, s, e)
      .then((l) => { setList(l); setLoadErr(null); })
      .catch((err) => setLoadErr(msgOf(err, '딜러 근무 기록을 불러오지 못했습니다')));
  };
  useEffect(() => { if (open) { setMonth(monthKey); reload(monthKey); } }, [open, venueId, monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const shiftMonth = (delta: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); const mk = ym(d); setMonth(mk); reload(mk); };

  // ⚠ 연타 가드. `dealer_shifts` 에는 (매장·딜러·날짜·시작시각) 유니크가 없고 급여는 **행 단위 합산**이라
  //   더블클릭 한 번이 그 시프트 급여(예: 8h × 15,000 = 12만)만큼 인건비를 부풀린다. 삭제는 한 줄씩이라
  //   눈치채기 전까지 계속 남는다. 서버 유니크는 마이그레이션이 필요하고, 화면 가드는 지금 닫을 수 있다.
  const [adding, setAdding] = useState(false);
  const add = async () => {
    if (adding) return;
    if (!name.trim() || !date) return toast.show('딜러 이름과 날짜를 입력하세요', 'error');
    setAdding(true);
    try { await addDealerShift({ venueId, dealerName: name, shiftDate: date, startTime: start, endTime: end, hourlyWage: wage }); setName(''); setStart(''); setEnd(''); setWage(0); reload(month); }
    // ⚠ `e instanceof Error ? e.message` 를 쓰지 않는다 — PostgrestError 는 extends Error 라 'permission denied for table …' 원문이 그대로 토스트됐다(독립 검증 C).
    catch (e) { toast.show(msgOf(e, '추가 실패'), 'error'); }
    finally { setAdding(false); }
  };
  const del = async (id: string) => { try { await removeDealerShift(id); reload(month); } catch (e) { toast.show(msgOf(e, '삭제 실패'), 'error'); } };

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
          <button type="button" onClick={() => shiftMonth(-1)} className="btn-ghost inline-flex items-center gap-1 px-3 text-xs"><Icon name="chevron-left" size={13} className="shrink-0" />이전</button>
          <span className="text-sm font-bold text-ink-primary tabular-nums">{month.replace('-', '. ')}</span>
          <button type="button" onClick={() => shiftMonth(1)} className="btn-ghost inline-flex items-center gap-1 px-3 text-xs">다음<Icon name="chevron-right" size={13} className="shrink-0" /></button>
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
          <button type="button" onClick={add} disabled={adding} className="btn-primary w-full text-sm disabled:opacity-60">{adding ? '추가 중…' : '+ 시프트 추가'}</button>
        </div>

        {/* 급여 명세 */}
        {!loadErr && payroll.length > 0 && (
          <div className="rounded-input border border-accent-400/30 bg-accent-300/[0.05] p-2.5">
            <p className="mb-1 text-2xs font-bold text-accent-300">이번 달 급여 명세 · 합계 {wonToMan(totalPay)}만원</p>
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
        {loadErr ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-2xs text-danger-light">
            <span className="min-w-0 flex-1">{loadErr} — 아래 목록은 이번 달 기록의 전부가 아닐 수 있습니다.</span>
            <button type="button" onClick={() => reload(month)}
              className="shrink-0 rounded-badge border border-danger/40 px-2.5 py-1 text-2xs font-bold text-danger-light hover:bg-danger/15 transition-colors">다시 시도</button>
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-2xs text-ink-muted">이번 달 등록된 시프트가 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-low px-3 py-2">
                <span className="w-12 shrink-0 text-2xs text-ink-muted tabular-nums">{s.shiftDate.slice(5)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{s.dealerName}</span>
                <span className="shrink-0 text-2xs text-ink-muted tabular-nums">{s.startTime && s.endTime ? `${s.startTime}~${s.endTime} · ${shiftHours(s.startTime, s.endTime)}h` : '-'}</span>
                <button type="button" onClick={() => del(s.id)} aria-label="삭제" className="-my-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs text-ink-muted transition-colors hover:bg-surface-float hover:text-danger-light">✕</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-2xs text-ink-muted">급여 = 근무 시간 × 시급. 종료가 시작보다 빠르면 익일 근무로 계산됩니다.</p>
      </div>
    </Modal>
  );
}
