import { useEffect, useState } from 'react';
import type { Schedule } from '../../api/schedules';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import {
  getReservations, deleteReservation, updateReservationName, getVenueReserverCounts,
  getCustomerActivity, type Reservation, type CustomerActivity,
} from '../../api/reservations';

interface MyPostersTabProps {
  schedules: Schedule[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/** 게임 관리 — 승인 업주가 본인 포스터(게임)와 예약을 관리. */
export default function MyPostersTab({ schedules, onCreate, onEdit, onDelete }: MyPostersTabProps) {
  const { user, isApprovedOwner } = useAuth();
  const [reserverCounts, setReserverCounts] = useState<Record<string, number>>({});

  const myPosters = schedules.filter((s) => s.ownerId === user?.id);
  const venueId = user?.venueId || myPosters[0]?.venueId;

  useEffect(() => {
    if (venueId) getVenueReserverCounts(venueId).then(setReserverCounts).catch(() => {});
  }, [venueId]);

  if (user?.role === 'venue_owner' && !isApprovedOwner) return <PendingApprovalView />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">게임 관리</h2>
          <p className="text-2xs text-ink-muted mt-0.5">게임(포스터)별 예약을 관리하세요. 게임을 누르면 예약 리스트가 펼쳐집니다 ({myPosters.length}개)</p>
        </div>
        <button type="button" onClick={onCreate} className="btn-primary text-xs whitespace-nowrap shrink-0">+ 새 게임</button>
      </div>

      {myPosters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-ink-muted">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30" aria-hidden><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/></svg>
          <p className="text-xs">등록된 게임이 없습니다</p>
          <button type="button" onClick={onCreate} className="mt-2 btn-ghost text-xs">첫 게임 등록하기</button>
        </div>
      ) : (
        <ul className="space-y-2">
          {myPosters.map((p) => (
            <PosterRow key={p.id} schedule={p} venueId={venueId} reserverCounts={reserverCounts}
              onEdit={() => onEdit(p.id)} onDelete={() => onDelete(p.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PendingApprovalView() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-4 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
      </div>
      <div>
        <h2 className="text-base font-semibold text-amber-400">관리자 승인 대기 중</h2>
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">매장 업주 가입 신청이 접수되었습니다.<br />영업일 기준 1~2일 내 승인 결과를 알려드립니다.</p>
      </div>
      <div className="text-2xs text-ink-muted px-4 py-2 rounded-input bg-surface-high">승인 후 게임 업로드 권한이 활성화됩니다</div>
    </div>
  );
}

// ── 단일 게임 행 + 예약 관리 패널 ─────────────────────────────────────────────
function PosterRow({ schedule, venueId, reserverCounts, onEdit, onDelete }: {
  schedule: Schedule; venueId?: string; reserverCounts: Record<string, number>;
  onEdit: () => void; onDelete: () => void;
}) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const d = new Date(schedule.date);

  const loadRes = () => { getReservations(schedule.id).then(setReservations).catch(() => setReservations([])); };
  const toggle = () => { const next = !open; setOpen(next); if (next && reservations === null) loadRes(); };
  const onDel = async (r: Reservation) => { try { await deleteReservation(r.id); setReservations((arr) => (arr ?? []).filter((x) => x.id !== r.id)); } catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); } };
  const onRename = async (r: Reservation) => {
    const n = window.prompt('예약자 이름 수정', r.displayName); if (n === null) return;
    try { await updateReservationName(r.id, n); setReservations((arr) => (arr ?? []).map((x) => (x.id === r.id ? { ...x, displayName: n.trim() } : x))); } catch (e) { toast.show(e instanceof Error ? e.message : '수정 실패', 'error'); }
  };

  return (
    <li className="rounded-card bg-surface-low border border-border-default overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={toggle} className="w-12 h-16 shrink-0 rounded-input overflow-hidden flex items-center justify-center"
          style={schedule.posterUrl ? undefined : { background: `linear-gradient(135deg, ${schedule.posterColor ?? '#1a1d24'}ee, #0a0c0f)` }}>
          {schedule.posterUrl ? <img src={schedule.posterUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <span className="text-2xl opacity-30">♠</span>}
        </button>
        <button type="button" onClick={toggle} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1 mb-0.5">
            {schedule.isPremium && <span className="rounded-badge bg-gold-300 px-1 py-0.5 text-2xs font-bold text-ink-inverse leading-none">TOP</span>}
            {!schedule.approved && <span className="rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1 py-0.5 text-2xs font-semibold leading-none">승인대기</span>}
            <span className="rounded-badge bg-surface-high text-ink-secondary border border-border-default px-1 py-0.5 text-2xs font-semibold leading-none">{schedule.format}</span>
          </div>
          <p className="text-sm font-medium text-ink-primary truncate">{schedule.title}</p>
          <p className="text-2xs text-ink-muted mt-0.5">{d.getMonth() + 1}/{d.getDate()} {schedule.startTime} · 바이인 {schedule.buyIn.amount.toLocaleString()} · {open ? '▲ 예약 닫기' : '▼ 예약 보기'}</p>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {/* 예약관리(왼쪽) */}
          <button type="button" onClick={toggle} className="btn-ghost text-xs px-2 text-gold-300">예약관리{reservations ? `(${reservations.length})` : ''}</button>
          {confirming ? (
            <>
              <button type="button" onClick={() => setConfirming(false)} className="btn-ghost text-xs px-2">취소</button>
              <button type="button" onClick={() => { onDelete(); setConfirming(false); }} className="btn-danger text-xs px-2">삭제</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onEdit} className="btn-ghost text-xs px-2">수정</button>
              <button type="button" onClick={() => setConfirming(true)} className="btn-ghost text-xs px-2 hover:text-danger-light">삭제</button>
            </>
          )}
        </div>
      </div>

      {/* 예약 리스트(펼침) */}
      {open && (
        <div className="border-t border-border-subtle bg-surface-base/40 p-3 space-y-1.5">
          {reservations === null ? (
            <p className="text-2xs text-ink-muted text-center py-2">불러오는 중…</p>
          ) : reservations.length === 0 ? (
            <p className="text-2xs text-ink-muted text-center py-2">아직 예약자가 없습니다.</p>
          ) : (
            <>
              <p className="text-2xs text-ink-muted">예약 {reservations.length}명</p>
              {reservations.map((r, i) => (
                <ReservationItem key={r.id || i} idx={i + 1} res={r} venueId={venueId}
                  regular={(reserverCounts[r.displayName] ?? 0) >= 5}
                  reserveCount={reserverCounts[r.displayName] ?? 0}
                  onDelete={() => onDel(r)} onRename={() => onRename(r)} />
              ))}
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ── 예약자 1명 + (단골 5회+) 고객 활동내역 ────────────────────────────────────
function ReservationItem({ idx, res, venueId, regular, reserveCount, onDelete, onRename }: {
  idx: number; res: Reservation; venueId?: string; regular: boolean; reserveCount: number;
  onDelete: () => void; onRename: () => void;
}) {
  const [showCustomer, setShowCustomer] = useState(false);
  const [act, setAct] = useState<CustomerActivity | null>(null);
  const openCustomer = () => {
    const next = !showCustomer; setShowCustomer(next);
    if (next && !act && venueId) getCustomerActivity(venueId, res.displayName).then(setAct).catch(() => {});
  };
  return (
    <div className="rounded-input border border-border-subtle bg-surface-low">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="w-5 text-center text-2xs font-bold text-gold-300 tabular-nums">{idx}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-primary truncate">{res.displayName}
            {regular && <span className="ml-1.5 text-2xs font-bold text-gold-300 bg-gold-300/15 px-1.5 py-0.5 rounded-badge">단골 {reserveCount}회</span>}
          </p>
        </div>
        {regular && <button type="button" onClick={openCustomer} className="btn-ghost text-2xs px-2 text-sky-300">{showCustomer ? '닫기' : '고객정보'}</button>}
        <button type="button" onClick={onRename} className="text-ink-muted hover:text-gold-300 text-2xs px-1">수정</button>
        <button type="button" onClick={onDelete} className="text-ink-muted hover:text-danger-light text-2xs px-1">삭제</button>
      </div>
      {showCustomer && (
        <div className="border-t border-border-subtle px-2.5 py-2">
          {!act ? <p className="text-2xs text-ink-muted text-center py-1">불러오는 중…</p> : (
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <Cell label="바이인" value={`${act.buyins}회`} />
              <Cell label="방문" value={`${act.visits}회`} />
              <Cell label="머니인" value={`${act.moneyIn}회`} />
              <Cell label="예약" value={`${act.reservations}회`} />
              <Cell label="누적금액" value={`${act.amount.toLocaleString()}`} gold />
              <Cell label="객단가" value={act.buyins ? `${Math.round(act.amount / act.buyins).toLocaleString()}` : '-'} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function Cell({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded bg-surface-base border border-border-subtle py-1.5">
      <p className={['text-sm font-bold tabular-nums leading-none', gold ? 'text-gold-300' : 'text-ink-primary'].join(' ')}>{value}</p>
      <p className="text-[10px] text-ink-muted mt-0.5">{label}</p>
    </div>
  );
}
