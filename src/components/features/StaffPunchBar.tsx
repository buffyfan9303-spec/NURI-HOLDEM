// src/components/features/StaffPunchBar.tsx — 직원 출근·퇴근 버튼(내 매장 최상단).
// StaffPayroll.tsx 에서 떼어 둔 이유: StaffPayroll(인건비·정산·출근일지·출근 관리)은 지연 청크이고, 이 줄은 직원이 내 매장을 열자마자
//   보여야 한다(최상단). 같은 파일이면 둘 중 하나를 포기해야 한다 — 지연이면 첫 화면에 폴백이, 정적이면 청크 예산이 넘는다.
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { getMyPunchState, punchMyShift, setMyShiftTime, subscribeStaffSchedule, type MyPunchRow } from '../../api/staffSchedule';
import { punchView, PUNCH_EVENT } from '../../lib/staffPunch';
import { msgOf } from '../../lib/dbError';
import { kstToday } from '../../lib/kst';

// ── 직원 출근·퇴근 버튼(내 매장 최상단) ──────────────────────────────────────
// 오너 2026-09-30: "직원들이 보는쪽 … 출근 퇴근 버튼 … 최상단 … 잘못누를 경우도 대비".
// 잘못 누름 대비 네 겹:
//   ① 상태에 안 맞는 버튼은 disabled(punchView — 서버 punch_my_shift 와 같은 규칙).
//   ② 누르면 **한 번 확인**(리드 설계 2026-09-30) — 같은 줄에 '출근 기록 / 취소'가 뜬다(시트 없음, 10초 뒤 저절로 취소).
//      기록 시각은 확인을 누른 순간의 **서버 시각**이다. 그래도 잘못 찍었으면 2분 안에 '방금 … 되돌리기'.
//   ③ 연타·동시 요청: 화면은 요청 중 잠그고(inflight), 서버는 빈 칸일 때만 쓴다 — 두 번째 요청은 첫 기록을 돌려받는다(applied=false).
//   ④ 늦게 안 경우: '시각 고치기' → 출근 관리(오늘·어제 직접 수정) · 그 전 근무는 업주가 근무표에서 고친다(기존 경로).
const UNDO_MS = 120_000;
const CONFIRM_MS = 10_000;
export default function StaffPunchBar({ venueId, active = true, onFix }: { venueId: string; active?: boolean; onFix?: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<MyPunchRow[] | 'missing' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const [last, setLast] = useState<{ kind: 'in' | 'out'; date: string; venueId: string } | null>(null);
  const [arm, setArm] = useState<'in' | 'out' | null>(null); // 확인 대기 중인 버튼
  const inflight = useRef(false);
  const venueRef = useRef(venueId);
  useEffect(() => { venueRef.current = venueId; }, [venueId]);
  // 매장이 바뀌면 앞 매장 상태·되돌리기를 즉시 버린다(늦은 응답은 아래 alive·venueRef 가 막는다).
  useEffect(() => { setRows(null); setErr(null); setLast(null); setArm(null); }, [venueId]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const reload = () => getMyPunchState(venueId)
      .then((r) => { if (alive) { setRows(r); setErr(null); } })
      .catch((e) => { if (alive) setErr(msgOf(e, '출퇴근 상태를 불러오지 못했습니다')); });
    reload();
    const off = subscribeStaffSchedule(venueId, reload); // 업주가 근무표에서 고치면 바로 반영
    const onPunch = (e: Event) => { if ((e as CustomEvent<{ venueId: string }>).detail?.venueId === venueId) reload(); };
    window.addEventListener(PUNCH_EVENT, onPunch);
    return () => { alive = false; off(); window.removeEventListener(PUNCH_EVENT, onPunch); };
  }, [venueId, active, tick]);
  useEffect(() => {
    if (!last) return;
    const t = window.setTimeout(() => setLast(null), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [last]);
  useEffect(() => {
    if (!arm) return;
    const t = window.setTimeout(() => setArm(null), CONFIRM_MS);
    return () => window.clearTimeout(t);
  }, [arm]);
  if (rows === 'missing') return null; // 서버 함수 적용 전 — 아래 '출근 관리' 입력이 종전대로 일한다
  const today = kstToday();
  const v = punchView(Array.isArray(rows) ? rows : [], today, kstToday(Date.now() - 86_400_000));
  const ready = Array.isArray(rows) && !err;
  const announce = () => window.dispatchEvent(new CustomEvent(PUNCH_EVENT, { detail: { venueId } }));
  const punch = async (kind: 'in' | 'out') => {
    if (inflight.current) return; // 연타 — 요청은 하나만 보낸다(서버도 첫 기록만 남긴다)
    inflight.current = true; setBusy(kind); setArm(null);
    const vid = venueId;
    try {
      const r = await punchMyShift(vid, kind);
      if (venueRef.current !== vid) return;
      setRows((prev) => (Array.isArray(prev) ? [...prev.filter((x) => x.date !== r.date), { date: r.date, checkIn: r.checkIn, checkOut: r.checkOut }] : prev));
      announce();
      const label = kind === 'in' ? '출근' : '퇴근';
      const hm = kind === 'in' ? r.checkIn : r.checkOut;
      if (r.applied) { setLast({ kind, date: r.date, venueId: vid }); toast.show(`${label} ${hm} 기록됨`, 'success'); }
      else toast.show(`이미 ${label}이 ${hm}(으)로 기록돼 있어요`, 'info');
    } catch (e) {
      toast.show(msgOf(e, '출퇴근 기록 실패'), 'error');
      setTick((t) => t + 1);
    } finally { inflight.current = false; setBusy(null); }
  };
  const undo = async () => {
    if (!last || inflight.current) return;
    inflight.current = true;
    const u = last;
    try {
      await setMyShiftTime(u.venueId, u.date, u.kind === 'in' ? 'checkIn' : 'checkOut', null);
      setLast(null);
      toast.show(`${u.kind === 'in' ? '출근' : '퇴근'} 기록을 되돌렸어요`, 'info');
      announce();
      setTick((t) => t + 1);
    } catch (e) { toast.show(msgOf(e, '되돌리지 못했습니다'), 'error'); }
    finally { inflight.current = false; }
  };
  const t = v.today;
  const status = err ? err
    : !ready ? '불러오는 중…'
      : v.phase === 'none' ? '오늘 배정된 근무가 없어요 — 업주가 스케줄에 배정하면 버튼이 열립니다'
        : v.phase === 'before' ? '출근 전'
          : v.phase === 'on' ? `근무 중 · ${v.outTarget?.checkIn} 출근${v.outTarget?.date !== today ? ' (어제)' : ''}`
            : `오늘 근무 끝 · ${t?.checkIn}~${t?.checkOut}`;
  const btn = 'flex h-14 flex-1 items-center justify-center gap-2 rounded-card border text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <section data-testid="staff-punch-bar" data-phase={ready ? v.phase : 'loading'} aria-label="출근·퇴근" className="rounded-aura border card-aura p-3 space-y-2.5 lg:flex lg:items-center lg:gap-4 lg:space-y-0">
      <div className="flex min-h-[28px] items-center gap-2 lg:min-w-0 lg:flex-1">
        <h2 className="shrink-0 text-sm font-bold text-ink-primary">오늘 출퇴근 <span className="text-2xs font-semibold text-ink-muted tabular-nums">{today.slice(5)}</span></h2>
        <p data-testid="punch-status" role={err ? 'alert' : 'status'} className={['min-w-0 flex-1 truncate text-xs', err ? 'text-danger-light' : 'text-ink-secondary'].join(' ')}>{status}</p>
        {err && <button type="button" onClick={() => setTick((n) => n + 1)} className="shrink-0 rounded-badge border border-danger/40 px-2.5 py-1 text-2xs font-bold text-danger-light">다시 시도</button>}
      </div>
      {/* PC(업주 화면과 같은 폭)에서는 한 줄: 상태 · 버튼 2개 · 되돌리기 — 버튼이 화면 끝까지 늘어나지 않게 폭을 준다 */}
      <div className="flex gap-2 lg:w-96 lg:shrink-0">
        <button type="button" data-testid="punch-in" aria-pressed={arm === 'in'} disabled={!ready || !v.canIn || busy != null} onClick={() => setArm('in')}
          className={[btn, 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 enabled:hover:bg-emerald-500/25'].join(' ')}>
          {busy === 'in' ? '기록 중…' : '출근'}
        </button>
        <button type="button" data-testid="punch-out" aria-pressed={arm === 'out'} disabled={!ready || !v.canOut || busy != null} onClick={() => setArm('out')}
          className={[btn, 'border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300 enabled:hover:bg-rose-500/25'].join(' ')}>
          {busy === 'out' ? '기록 중…' : '퇴근'}
        </button>
      </div>
      {arm && (
        <div role="alertdialog" aria-label={`${arm === 'in' ? '출근' : '퇴근'} 확인`} data-testid="punch-confirm-row" className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-card border border-accent-400/40 bg-surface-high px-3 py-2 lg:shrink-0">
          <span className="min-w-0 flex-1 text-sm font-bold text-ink-primary">지금 {arm === 'in' ? '출근' : `퇴근${v.outTarget && v.outTarget.date !== today ? '(어제 근무)' : ''}`}으로 기록할까요?</span>
          <button type="button" data-testid="punch-confirm" disabled={busy != null} onClick={() => punch(arm)} className="min-h-[44px] rounded-badge bg-accent-300 px-4 text-sm font-bold text-white disabled:opacity-40">{arm === 'in' ? '출근' : '퇴근'} 기록</button>
          <button type="button" data-testid="punch-cancel" onClick={() => setArm(null)} className="min-h-[44px] rounded-badge border border-border-subtle px-3 text-sm font-bold text-ink-secondary">취소</button>
        </div>
      )}
      {/* 이 줄은 항상 같은 높이로 둔다 — 되돌리기가 나타나고 사라질 때 아래 화면이 밀리지 않게 */}
      {(onFix || last) && (
        <div className="flex min-h-[36px] flex-wrap items-center justify-end gap-x-3 gap-y-1 text-2xs text-ink-muted lg:shrink-0">
          {last && (
            <button type="button" data-testid="punch-undo" onClick={undo} className="min-h-[36px] rounded-badge border border-border-subtle px-3 font-bold text-ink-secondary hover:text-accent-300">
              방금 {last.kind === 'in' ? '출근' : '퇴근'} 되돌리기
            </button>
          )}
          {onFix && (
            <button type="button" data-testid="punch-fix" onClick={onFix} className="min-h-[36px] font-bold hover:text-accent-300">시각 고치기 ›</button>
          )}
        </div>
      )}
    </section>
  );
}
