import { useEffect, useState } from 'react';
import type { Schedule } from '../../api/schedules';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import {
  getReservations, deleteReservation, updateReservationName, getVenueReserverCounts, subscribeReservations,
  getReservationCounts, getCustomerActivity, type Reservation, type CustomerActivity,
} from '../../api/reservations';
import { getPosterOpsSummaries, getScheduleLedgers, type PosterOpsSummary, type ScheduleLedgerItem } from '../../api/ledger';
import { listVenueCheckins } from '../../api/checkins';
import { toCsv, downloadCsv } from '../../lib/csv';
import EmptyState from '../atoms/EmptyState';

// 예약 명단 CSV 내보내기 (엑셀 한글 호환)
function exportReservationsCsv(schedule: Schedule, reservations: Reservation[]) {
  const csv = toCsv(
    ['번호', '예약자', '예약시각'],
    reservations.map((r, i) => [i + 1, r.displayName, new Date(r.createdAt).toLocaleString('ko-KR')]),
  );
  const d = new Date(schedule.date);
  downloadCsv(`${schedule.title}_${d.getMonth() + 1}월${d.getDate()}일_예약명단`, csv);
}

interface MyPostersTabProps {
  schedules: Schedule[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  /** '장부' 버튼 — 연결 장부가 있으면 그 날짜(existingDate)로, 없으면 새 등록(프리필) */
  onOpenLedger?: (s: Schedule, existingDate: string | null) => void;
  /** '순위 미입력' 뱃지 클릭 — 해당 날짜의 순위 입력 화면으로 */
  onGotoRanking?: (date: string) => void;
}

/** 게임 관리 — 승인 업주가 본인 포스터(게임)와 예약을 관리. */
export default function MyPostersTab({ schedules, onCreate, onEdit, onDelete, onOpenLedger, onGotoRanking }: MyPostersTabProps) {
  const { user, isApprovedOwner } = useAuth();
  const [reserverCounts, setReserverCounts] = useState<Record<string, number>>({});
  const [visitedNames, setVisitedNames] = useState<Set<string>>(new Set());
  const [ops, setOps] = useState<Record<string, PosterOpsSummary>>({}); // scheduleId → 연결 장부 운영 요약

  const myPosters = schedules.filter((s) => s.ownerId === user?.id);
  const venueId = user?.venueId || myPosters[0]?.venueId;

  const [resCounts, setResCounts] = useState<Record<string, number>>({}); // scheduleId → 예약 수
  useEffect(() => {
    if (!venueId) return;
    const ids = myPosters.map((p) => p.id);
    const reload = () => {
      getVenueReserverCounts(venueId).then(setReserverCounts).catch(() => {});
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      listVenueCheckins(venueId, t0.toISOString()).then((cs) => setVisitedNames(new Set(cs.map((c) => (c.displayName ?? '').trim().toLowerCase()).filter(Boolean)))).catch(() => {});
      getReservationCounts(ids).then(setResCounts).catch(() => {});
    };
    reload();
    return subscribeReservations(reload); // 실시간: 신규/취소 예약 자동 반영
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, myPosters.length]);

  // 포스터 ↔ 장부 운영 요약 — '장부' 버튼 분기 + 바인·매출 미니칩 + 순위 미입력 뱃지
  useEffect(() => {
    if (!venueId || !onOpenLedger) return;
    getPosterOpsSummaries(venueId).then(setOps).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  if (user?.role === 'venue_owner' && !isApprovedOwner) return <PendingApprovalView />;

  // 제목·"+ 새 게임" 액션은 VenueManageTab의 공용 SectionHeader가 렌더(섹션 간 규격 통일)
  return (
    <div className="space-y-3">
      {myPosters.length === 0 ? (
        <EmptyState
          title="등록된 게임이 없습니다"
          hint="포스터를 올리면 일정 탐색에 노출되고 예약을 받을 수 있어요"
          action={<button type="button" onClick={onCreate} className="btn-primary px-4 py-2 text-xs">+ 첫 게임 등록하기</button>}
        />
      ) : (
        <ul className="space-y-2">
          {myPosters.map((p) => (
            <PosterRow key={p.id} schedule={p} venueId={venueId} reserverCounts={reserverCounts} visitedNames={visitedNames}
              onEdit={() => onEdit(p.id)} onDelete={() => onDelete(p.id)}
              ops={ops[p.id] ?? null}
              resCount={resCounts[p.id] ?? 0}
              onLedgerAt={onOpenLedger ? (d) => onOpenLedger(p, d) : undefined}
              onRanking={onGotoRanking} />
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
        <h2 className="text-base font-semibold text-amber-400">운영자 승인 대기 중</h2>
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">매장 업주 가입 신청이 접수되었습니다.<br />영업일 기준 1~2일 내 승인 결과를 알려드립니다.</p>
      </div>
      <div className="text-2xs text-ink-muted px-4 py-2 rounded-input bg-surface-high">승인 후 게임 업로드 권한이 활성화됩니다</div>
    </div>
  );
}

// ── 단일 게임 행 + 예약 관리 패널 ─────────────────────────────────────────────
function PosterRow({ schedule, venueId, reserverCounts, visitedNames, onEdit, onDelete, ops, resCount, onLedgerAt, onRanking }: {
  schedule: Schedule; venueId?: string; reserverCounts: Record<string, number>; visitedNames?: Set<string>;
  onEdit: () => void; onDelete: () => void;
  ops?: PosterOpsSummary | null; resCount?: number; onLedgerAt?: (date: string | null) => void; onRanking?: (date: string) => void;
}) {
  const ledgerDate = ops?.date ?? null;
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);
  // 연결 장부 펼침 — 한 포스터에 여러 장부(멀티데이·사이드) 최신순
  const [ledgersOpen, setLedgersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // ⋯ 더보기(수정·삭제) 숨김 메뉴
  const [ledgers, setLedgers] = useState<ScheduleLedgerItem[] | null>(null);
  const toggleLedgers = () => {
    if (!ledgerDate) { onLedgerAt?.(null); return; } // 연결 장부 없음 -> 바로 새 등록
    const next = !ledgersOpen; setLedgersOpen(next);
    if (next && ledgers === null && venueId) getScheduleLedgers(venueId, schedule.id).then(setLedgers).catch(() => setLedgers([]));
  };
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
      <div className="flex items-start sm:items-center gap-3 p-3">
        <div aria-hidden className="w-12 h-16 shrink-0 rounded-input overflow-hidden flex items-center justify-center"
          style={schedule.posterUrl ? undefined : { background: `linear-gradient(135deg, ${schedule.posterColor ?? '#1a1d24'}ee, #0a0c0f)` }}>
          {schedule.posterUrl ? <img src={schedule.posterUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <span className="text-2xl opacity-30">♠</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            {schedule.isPremium && <span className="rounded-badge bg-gold-300 px-1 py-0.5 text-2xs font-bold text-ink-inverse leading-none">TOP</span>}
            {!schedule.approved && <span className="rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1 py-0.5 text-2xs font-semibold leading-none">승인대기</span>}
            <span className="rounded-badge bg-surface-high text-ink-secondary border border-border-default px-1 py-0.5 text-2xs font-semibold leading-none">{schedule.format}</span>
          </div>
          <p className="text-sm font-medium text-ink-primary truncate">{schedule.title}</p>
          <p className="text-2xs text-ink-muted mt-0.5">{d.getMonth() + 1}/{d.getDate()} {schedule.startTime} · 바이인 {schedule.buyIn.amount.toLocaleString()}</p>
          {/* 운영 현황 미니칩 — 예약·바인·매출(연결 장부 기준). 게임관리가 곧 운영 현황판 */}
          {(ops || (resCount ?? 0) > 0) && (
            <span className="mt-1 flex flex-wrap items-center gap-1 text-2xs font-semibold tabular-nums">
              {(resCount ?? 0) > 0 && (
                <span className="rounded-badge bg-surface-high px-1.5 py-0.5 text-ink-secondary">예약 {resCount}</span>
              )}
              {ops && (
                <>
                  <span className="rounded-badge bg-surface-high px-1.5 py-0.5 text-ink-secondary">바인 {ops.buyinCount}</span>
                  <span className="rounded-badge bg-gold-300/15 px-1.5 py-0.5 text-gold-300">매출 {ops.revenueMan.toLocaleString()}만</span>
                  {ops.closed && ops.hasRankings && (
                    <span className="rounded-badge bg-surface-high px-1.5 py-0.5 text-ink-muted">마감 · 순위 ✓</span>
                  )}
                </>
              )}
            </span>
          )}
        </div>
        {/* PC: 우측 인라인 액션(기존). 모바일은 아래 하단 바로 분리 — 줄바꿈/세로 쌓임 방지 */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          <button type="button" onClick={toggle} className="btn-ghost text-xs px-2 text-gold-300">예약관리{reservations ? `(${reservations.length})` : ''} {open ? '▲' : '▼'}</button>
          {onLedgerAt && (
            <button type="button" onClick={toggleLedgers}
              title={ledgerDate ? '연결된 장부 목록 보기' : '이 게임으로 장부 등록'}
              className={['btn-ghost text-xs px-2', ledgerDate ? 'text-emerald-400' : 'text-ink-secondary'].join(' ')}>
              장부{ledgerDate ? (ledgersOpen ? ' ▲' : ' ▼') : ' +'}
            </button>
          )}
          {ops?.closed && !ops.hasRankings && onRanking && (
            <button type="button" onClick={() => onRanking(ops.date)}
              title="장부는 마감됐는데 순위가 아직 없어요 — 입력하면 랭킹·아카이브에 바로 반영됩니다"
              className="rounded-badge border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-2xs font-bold text-amber-400 active:opacity-80">
              순위 미입력
            </button>
          )}
          {confirming ? (
            <>
              <button type="button" onClick={() => setConfirming(false)} className="btn-ghost text-xs px-2">취소</button>
              <button type="button" onClick={() => { onDelete(); setConfirming(false); }} className="btn-danger text-xs px-2">삭제</button>
            </>
          ) : menuOpen ? (
            <>
              <button type="button" onClick={() => { onEdit(); setMenuOpen(false); }} className="btn-ghost text-xs px-2 text-gold-300">수정</button>
              <button type="button" onClick={() => setConfirming(true)} className="btn-ghost text-xs px-2 hover:text-danger-light">삭제</button>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기" className="btn-ghost text-xs px-1.5">✕</button>
            </>
          ) : (
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="더보기(수정·삭제)" title="수정·삭제" className="btn-ghost text-base leading-none px-2">⋯</button>
          )}
        </div>
      </div>

      {/* 모바일 전용 하단 액션 바 — 가로 균등(아래로 쌓이지 않게). 순위 미입력은 풀폭 경고로 위에 */}
      <div className="sm:hidden border-t border-border-subtle">
        {ops?.closed && !ops.hasRankings && onRanking && (
          <button type="button" onClick={() => onRanking(ops.date)}
            className="flex w-full items-center justify-center gap-1 border-b border-border-subtle bg-amber-500/10 py-2 text-2xs font-bold text-amber-400 active:opacity-80">
            ⚠ 순위 미입력 — 지금 입력하기
          </button>
        )}
        <div className="flex items-stretch divide-x divide-border-subtle">
          <button type="button" onClick={toggle} className="flex-1 py-2.5 text-xs font-semibold text-gold-300 active:bg-surface-high/60">예약 {reservations ? reservations.length : (resCount ?? 0) || ''}{open ? ' ▲' : ' ▼'}</button>
          {onLedgerAt && (
            <button type="button" onClick={toggleLedgers}
              className={['flex-1 py-2.5 text-xs font-semibold active:bg-surface-high/60', ledgerDate ? 'text-emerald-400' : 'text-ink-secondary'].join(' ')}>
              장부{ledgerDate ? (ledgersOpen ? ' ▲' : ' ▼') : ' +'}
            </button>
          )}
          {confirming ? (
            <>
              <button type="button" onClick={() => setConfirming(false)} className="flex-1 py-2.5 text-xs font-semibold text-ink-secondary active:bg-surface-high/60">취소</button>
              <button type="button" onClick={() => { onDelete(); setConfirming(false); }} className="flex-1 py-2.5 text-xs font-bold text-danger-light active:bg-danger/10">삭제 확인</button>
            </>
          ) : menuOpen ? (
            <>
              <button type="button" onClick={() => { onEdit(); setMenuOpen(false); }} className="flex-1 py-2.5 text-xs font-semibold text-gold-300 active:bg-surface-high/60">수정</button>
              <button type="button" onClick={() => setConfirming(true)} className="flex-1 py-2.5 text-xs font-semibold text-ink-muted active:bg-surface-high/60 hover:text-danger-light">삭제</button>
              <button type="button" onClick={() => setMenuOpen(false)} className="flex-1 py-2.5 text-xs font-semibold text-ink-secondary active:bg-surface-high/60">닫기</button>
            </>
          ) : (
            <button type="button" onClick={() => setMenuOpen(true)} className="flex-1 py-2.5 text-sm font-semibold leading-none text-ink-secondary active:bg-surface-high/60">⋯ 더보기</button>
          )}
        </div>
      </div>

      {/* 연결 장부 리스트(펼침) — 최신순, 클릭=그 날짜 장부 열기 */}
      {ledgersOpen && onLedgerAt && (
        <div className="border-t border-border-subtle bg-surface-base/40 p-2 space-y-1">
          {ledgers === null ? (
            <p className="text-2xs text-ink-muted text-center py-1.5">불러오는 중…</p>
          ) : (
            <>
              {ledgers.map((l) => (
                <button key={l.date} type="button" onClick={() => onLedgerAt(l.date)}
                  className="w-full flex items-center gap-2 rounded-input border border-border-subtle bg-surface-low px-2.5 py-2 text-left active:opacity-80">
                  <span className="text-xs font-bold text-ink-primary tabular-nums">{l.date}</span>
                  <span className="flex-1 min-w-0 text-2xs text-ink-secondary truncate">{l.title || schedule.title}</span>
                  <span className={['text-2xs font-bold shrink-0', l.closed ? 'text-ink-muted' : 'text-emerald-400'].join(' ')}>{l.closed ? '마감' : '진행중'}</span>
                </button>
              ))}
              <button type="button" onClick={() => onLedgerAt(null)}
                className="w-full rounded-input border border-dashed border-border-default px-2.5 py-2 text-2xs font-semibold text-gold-300 active:opacity-80">
                + 이 포스터로 새 장부 (다른 날짜는 장부에서 날짜 변경)
              </button>
            </>
          )}
        </div>
      )}

      {/* 예약 리스트(펼침) */}
      {open && (
        <div className="border-t border-border-subtle bg-surface-base/40 p-3 space-y-1.5">
          {reservations === null ? (
            <p className="text-2xs text-ink-muted text-center py-2">불러오는 중…</p>
          ) : reservations.length === 0 ? (
            <p className="text-2xs text-ink-muted text-center py-2">아직 예약자가 없습니다.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-2xs text-ink-muted">예약 {reservations.length}명</p>
                <button type="button" onClick={() => exportReservationsCsv(schedule, reservations)} className="btn-ghost text-2xs px-2 text-gold-300">CSV 내보내기</button>
              </div>
              {reservations.map((r, i) => (
                <ReservationItem key={r.id || i} idx={i + 1} res={r} venueId={venueId}
                  visited={visitedNames?.has((r.displayName ?? '').trim().toLowerCase()) ?? false}
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
function ReservationItem({ idx, res, venueId, visited, regular, reserveCount, onDelete, onRename }: {
  visited?: boolean;
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
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-primary">
            <span className="min-w-0 truncate">{res.displayName}</span>
            {visited && <span className="shrink-0 rounded-badge bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">✓ 방문</span>}
            {regular && <span className="shrink-0 text-2xs font-bold text-gold-300 bg-gold-300/15 px-1.5 py-0.5 rounded-badge">단골 {reserveCount}회</span>}
          </p>
          {/* 예약 접수 일시 — 업주 전용 화면이라 노출 OK */}
          <p className="text-[10px] text-ink-muted tabular-nums mt-0.5">
            {new Date(res.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 예약
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
