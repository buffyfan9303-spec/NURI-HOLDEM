import { useEffect, useMemo, useState } from 'react';
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
import { thumbUrl, thumbSrcSet } from '../../lib/imageUrl';
import EmptyState from '../atoms/EmptyState';
import HoldToConfirmButton from '../atoms/HoldToConfirmButton';
import { getComments, logActivity } from '../../api/community';
import { createUndoQueue } from '../../lib/undoableDelete';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';

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
  const [visitedUserIds, setVisitedUserIds] = useState<Set<string>>(new Set()); // 방문 판정 1순위(계정 ID)
  const [ops, setOps] = useState<Record<string, PosterOpsSummary>>({}); // scheduleId → 연결 장부 운영 요약
  const [dateFilter, setDateFilter] = useState<string>(''); // ''=전체 / iso=그 날짜 예약만 관리

  const myPosters = schedules.filter((s) => s.ownerId === user?.id);
  const venueId = user?.venueId || myPosters[0]?.venueId;

  const [resCounts, setResCounts] = useState<Record<string, number>>({}); // scheduleId → 예약 수
  useEffect(() => {
    if (!venueId) return;
    const ids = myPosters.map((p) => p.id);
    const reload = () => {
      getVenueReserverCounts(venueId).then(setReserverCounts).catch(() => {});
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      listVenueCheckins(venueId, t0.toISOString()).then((cs) => {
        setVisitedNames(new Set(cs.map((c) => (c.displayName ?? '').trim().toLowerCase()).filter(Boolean)));
        setVisitedUserIds(new Set(cs.map((c) => c.userId).filter(Boolean)));
      }).catch(() => {});
      getReservationCounts(ids).then(setResCounts).catch(() => {});
    };
    reload();
    return subscribeReservations(reload, ids); // 실시간: 내 포스터 예약만 수신(서버 필터 — 전 매장 수신 방지)
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
      ) : (() => {
        const isoOf = (s: Schedule) => new Date(s.date).toLocaleDateString('en-CA');
        const dk = [...new Set(myPosters.map(isoOf))].sort();
        const cntOf = (k: string) => myPosters.filter((p) => isoOf(p) === k).length;
        const shown = dateFilter ? myPosters.filter((p) => isoOf(p) === dateFilter) : myPosters;
        const dow = ['일', '월', '화', '수', '목', '금', '토'];
        const chip = (on: boolean) => ['shrink-0 rounded-input px-2.5 py-1.5 text-2xs font-bold transition-colors', on ? 'bg-accent-300 text-white' : 'chip-aura'].join(' ');
        return (
          <>
            {/* 날짜 선택 — 예약을 날짜별로 관리(장부 날짜 선택과 동일한 방식) */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 [-webkit-overflow-scrolling:touch]">
              <button type="button" onClick={() => setDateFilter('')} className={chip(dateFilter === '')}>전체 {myPosters.length}</button>
              {dk.map((k) => { const d = new Date(k + 'T00:00:00'); return (
                <button key={k} type="button" onClick={() => setDateFilter(k)} className={chip(dateFilter === k)}>{d.getMonth() + 1}/{d.getDate()}({dow[d.getDay()]}) {cntOf(k)}</button>
              ); })}
              <label className="relative inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-input border border-dashed border-border-default px-2.5 py-1.5 text-2xs font-bold text-ink-secondary hover:border-accent-400/50">
                <Icon name="calendar" size={12} className="shrink-0" />날짜
                <input type="date" value={dateFilter || ''} onChange={(e) => setDateFilter(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="날짜 직접 선택" />
              </label>
            </div>
            <ul className="space-y-2">
              {shown.map((p) => (
                <PosterRow key={p.id} schedule={p} venueId={venueId} reserverCounts={reserverCounts} visitedNames={visitedNames} visitedUserIds={visitedUserIds}
                  onEdit={() => onEdit(p.id)} onDelete={() => onDelete(p.id)}
                  ops={ops[p.id] ?? null}
                  resCount={resCounts[p.id] ?? 0}
                  onLedgerAt={onOpenLedger ? (d) => onOpenLedger(p, d) : undefined}
                  onRanking={onGotoRanking}
                  gameDates={myPosters.filter((q) => q.title.trim() === p.title.trim()).map((q) => ({ id: q.id, date: isoOf(q) })).sort((a, b) => a.date.localeCompare(b.date))} />
              ))}
              {shown.length === 0 && <li className="py-6 text-center text-2xs text-ink-muted">그 날짜에 등록된 게임이 없습니다. 다른 날짜를 선택하세요</li>}
            </ul>
          </>
        );
      })()}
    </div>
  );
}

function PendingApprovalView() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-4 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400" aria-hidden><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
      </div>
      <div>
        <h2 className="text-base font-bold text-amber-400">운영자 승인 대기 중</h2>
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">매장 업주 가입 신청이 접수되었습니다.<br />영업일 기준 1~2일 내 승인 결과를 알려드립니다.</p>
      </div>
      <div className="text-2xs text-ink-muted px-4 py-2 rounded-input bg-surface-high">승인 후 게임 업로드 권한이 활성화됩니다</div>
    </div>
  );
}

// ── 단일 게임 행 + 예약 관리 패널 ─────────────────────────────────────────────
function PosterRow({ schedule, venueId, reserverCounts, visitedNames, visitedUserIds, onEdit, onDelete, ops, resCount, onLedgerAt, onRanking, gameDates }: {
  schedule: Schedule; venueId?: string; reserverCounts: Record<string, number>; visitedNames?: Set<string>; visitedUserIds?: Set<string>;
  onEdit: () => void; onDelete: () => void;
  ops?: PosterOpsSummary | null; resCount?: number; onLedgerAt?: (date: string | null) => void; onRanking?: (date: string) => void;
  gameDates?: { id: string; date: string }[]; // 같은 제목(같은 게임)의 날짜별 스케줄 — 예약을 날짜별로 전환
}) {
  const ledgerDate = ops?.date ?? null;
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  // 삭제 경고에 쓸 문의(Q&A) 수 — comments.schedule_id 는 ON DELETE CASCADE 라 포스터와 함께 영구 소멸한다.
  // 목록 전체에 미리 조회하면 낭비라, 확인 단계에 들어가는 순간에만 한 번 가져온다.
  const [qnaCount, setQnaCount] = useState<number | null>(null);
  const askDelete = () => {
    setConfirming(true);
    // 문의 수도 같다 — 실패를 0 으로 적으면 '문의 0건이 삭제됩니다'가 거짓이 된다.
    // ⚠ 실패(-1)일 때도 다시 읽어야 한다. `=== null` 만 보면 확인창의 '다시 확인'이
    //   실제로는 아무것도 다시 읽지 않는 장식 버튼이 된다.
    if (qnaCount === null || qnaCount < 0) {
      setQnaCount(null);
      getComments({ scheduleId: schedule.id }).then((cs) => setQnaCount(cs.length)).catch(() => setQnaCount(-1));
    }
    // 확인창의 '예약자 N명'은 **삭제 대상 포스터(schedule.id)** 의 예약이어야 한다.
    // 날짜 칩으로 같은 게임의 다른 날짜를 보던 중이었다면 화면의 수는 지워지지 않는 날짜의 것이다 —
    // 9/10 '0명'을 보고 9/5 포스터를 지우면 9/5 예약자가 CASCADE 로 통째로 사라진다.
    // 그래서 아직 모르거나(패널 미개봉·실패) 다른 날짜를 보고 있으면 schedule.id 로 다시 읽는다.
    if (reservations === null || resSchedId !== schedule.id) {
      setResSchedId(schedule.id); setReservations(null); loadRes(schedule.id);
    }
  };
  const [open, setOpen] = useState(false);
  // 연결 장부 펼침 — 한 포스터에 여러 장부(멀티데이·사이드) 최신순
  const [ledgersOpen, setLedgersOpen] = useState(false);
  const [ledgers, setLedgers] = useState<ScheduleLedgerItem[] | null>(null);
  // 예약관리 날짜 — 같은 게임(같은 제목)의 다른 날짜로 전환해 예약을 본다(기본=이 포스터 날짜)
  const [resSchedId, setResSchedId] = useState(schedule.id);
  const toggleLedgers = () => {
    if (!ledgerDate) { onLedgerAt?.(null); return; } // 연결 장부 없음 -> 바로 새 등록
    const next = !ledgersOpen; setLedgersOpen(next);
    if (next && ledgers === null && venueId) getScheduleLedgers(venueId, schedule.id).then(setLedgers).catch(() => setLedgers([]));
  };
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const d = new Date(schedule.date);

  // ⚠ 실패를 [] 로 삼키면 '예약 없음'과 구분이 안 된다. 그 값이 아래 **되돌릴 수 없는 삭제 확인창**의
  //   '예약자 N명'을 만들기 때문에, 조회 실패가 곧 '0명이 삭제됩니다'라는 거짓 승인으로 이어졌다
  //   (2026-09-05 전수 조사). 실패는 값으로 남겨 확인창이 '모른다'고 말할 수 있게 한다.
  //   ⚠ 실패에 [] 를 적으면 안 되는 이유가 하나 더 있다: 이 화면의 모든 '다시 읽기' 조건이
  //   `reservations === null` 이라, [] 를 적는 순간 재시도 경로가 통째로 죽는다(확인창의 '다시 확인'도,
  //   패널을 접었다 펴는 것도 아무것도 다시 읽지 않는 막다른 길이 됐다). 실패는 null 로 되돌린다.
  const [resErr, setResErr] = useState<unknown>(null);
  const loadRes = (sid: string = resSchedId) => {
    setResErr(null);
    getReservations(sid).then((rs) => { setResErr(null); setReservations(rs); })
      .catch((e) => { setReservations(null); setResErr(e); });
  };
  const toggle = () => { const next = !open; setOpen(next); if (next && reservations === null) loadRes(); };
  // 예약 삭제 유예 큐 — RLS sr_insert 의 with check 가 user_id = auth.uid() 하나뿐이라
  // 업주도 운영자도 손님 예약을 대신 INSERT 할 수 없다(= 지우면 앱으로는 절대 복구 불가).
  // 그래서 '지운 뒤 되살리기'가 아니라 '5초 동안 서버로 안 보내기'로 실행취소를 만든다.
  const resDeleteQ = useMemo(() => createUndoQueue(5000), []);
  const onDel = (r: Reservation) => {
    setReservations((arr) => (arr ?? []).filter((x) => x.id !== r.id));
    resDeleteQ.schedule(r.id, () => {
      deleteReservation(r.id)
        // 예약 삭제는 여태 아무 흔적도 안 남아 '누가 지웠는지' 추적이 불가능했다
        .then(() => logActivity({ action: 'delete', targetType: 'reservation', targetId: r.id, targetSummary: `${schedule.title} / ${r.displayName}` }))
        .catch((e) => { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); loadRes(); });
    });
    toast.show(`‘${r.displayName}’ 예약 삭제됨`, 'info', {
      durationMs: 5000, // 유예 시간과 일치 — 더 길면 이미 삭제된 뒤에도 되돌리기가 눌러지는 것처럼 보인다
      action: { label: '되돌리기', onClick: () => {
        if (!resDeleteQ.cancel(r.id)) { toast.show('이미 삭제되어 되돌릴 수 없습니다', 'error'); return; }
        // getReservations 가 created_at 오름차순이라 같은 기준으로 되끼운다(번호가 뒤섞이지 않게)
        setReservations((arr) => ((arr ?? []).some((x) => x.id === r.id) ? arr : [...(arr ?? []), r].sort((a, b) => a.createdAt.localeCompare(b.createdAt))));
        toast.show('삭제를 취소했습니다', 'success');
      } },
    });
  };
  const onRename = async (r: Reservation) => {
    const n = window.prompt('예약자 이름 수정', r.displayName); if (n === null) return;
    try { await updateReservationName(r.id, n); setReservations((arr) => (arr ?? []).map((x) => (x.id === r.id ? { ...x, displayName: n.trim() } : x))); } catch (e) { toast.show(e instanceof Error ? e.message : '수정 실패', 'error'); }
  };

  return (
    <li className="rounded-aura border card-aura overflow-hidden">
      <div className="flex items-start sm:items-center gap-3 p-3">
        <div aria-hidden className="w-12 h-16 shrink-0 rounded-input overflow-hidden flex items-center justify-center"
          style={schedule.posterUrl ? undefined : { background: `linear-gradient(135deg, ${schedule.posterColor ?? '#1a1d24'}ee, #0a0c0f)` }}>
          {/* 💰 목록 썸네일 — 원본 대신 폭 맞춤 webp 변환본 */}
          {schedule.posterUrl ? <img src={thumbUrl(schedule.posterUrl, 200)} srcSet={thumbSrcSet(schedule.posterUrl, 200)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : <span className="text-2xl opacity-30">♠</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            {schedule.isPremium && <span className="rounded-badge bg-accent-300 px-1 py-0.5 text-2xs font-bold text-white leading-none">TOP</span>}
            {!schedule.approved && <span className="rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1 py-0.5 text-2xs font-semibold leading-none">승인대기</span>}
            <span className="rounded-badge bg-surface-high text-ink-secondary border border-border-default px-1 py-0.5 text-2xs font-semibold leading-none">{schedule.format}</span>
          </div>
          <p className="text-sm font-medium text-ink-primary truncate">{schedule.title}</p>
          <p className="text-2xs text-ink-muted mt-0.5">{d.getMonth() + 1}/{d.getDate()} {schedule.startTime} · 바이인 {schedule.buyIn.amount.toLocaleString()}</p>
          {/* 운영 현황 미니칩 — 예약·바인·매출(연결 장부 기준). 게임관리가 곧 운영 현황판 */}
          {(ops || (resCount ?? 0) > 0 || (schedule.viewCount ?? 0) > 0) && (
            <span className="mt-1 flex flex-wrap items-center gap-1 text-2xs font-semibold tabular-nums">
              {(schedule.viewCount ?? 0) > 0 && (
                <span className="rounded-badge bg-surface-high px-1.5 py-0.5 text-ink-secondary">조회 {schedule.viewCount}</span>
              )}
              {(resCount ?? 0) > 0 && (
                <span className="rounded-badge bg-surface-high px-1.5 py-0.5 text-ink-secondary">예약 {resCount}</span>
              )}
              {ops && (
                <>
                  <span className="rounded-badge bg-surface-high px-1.5 py-0.5 text-ink-secondary">바인 {ops.buyinCount}</span>
                  <span className="rounded-badge bg-accent-300/15 px-1.5 py-0.5 text-accent-300">매출 {ops.revenueMan.toLocaleString()}만</span>
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
          <button type="button" onClick={toggle} className="btn-ghost text-xs px-2 text-accent-300">예약관리{reservations ? `(${reservations.length})` : ''} {open ? '▲' : '▼'}</button>
          {onLedgerAt && (
            <button type="button" onClick={toggleLedgers}
              title={ledgerDate ? '연결된 장부 목록 보기' : '이 게임으로 장부 등록'}
              className={['btn-ghost text-xs px-2', ledgerDate ? 'text-emerald-400' : 'text-ink-secondary'].join(' ')}>
              장부{ledgerDate ? (ledgersOpen ? ' ▲' : ' ▼') : ' +'}
            </button>
          )}
          {ops?.closed && !ops.hasRankings && onRanking && (
            <button type="button" onClick={() => onRanking(ops.date)}
              title="장부는 마감됐는데 순위가 아직 없어요. 입력하면 랭킹·아카이브에 바로 반영됩니다"
              className="rounded-badge border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-2xs font-bold text-amber-400 active:opacity-80">
              순위 미입력
            </button>
          )}
          <button type="button" onClick={onEdit} className="btn-ghost text-xs px-2 text-accent-300">수정</button>
          {/* 확인 단계를 이 자리에 겹치지 않는 이유: 예전엔 같은 좌표에 라벨까지 같은 '삭제'가 나타나
              더블클릭 한 번이면 사용자가 아무것도 인지하지 못한 채 확인을 통과했다.
              여기는 경고 바 여닫기만 하고, 실제 실행은 아래 경고 바(다른 위치 + 꾹 누르기)에만 둔다. */}
          <button type="button" onClick={() => (confirming ? setConfirming(false) : askDelete())}
            className={['btn-ghost text-xs px-2', confirming ? 'text-danger-light' : 'hover:text-danger-light'].join(' ')}>
            {confirming ? '삭제 취소' : '삭제'}
          </button>
        </div>
      </div>

      {/* 삭제 확인 — 액션 버튼과 '다른 자리'에 펼쳐지는 풀폭 경고 바.
          같은 칸/같은 좌표에 확인 버튼을 두면 더블탭·더블클릭 한 번으로 확인 단계가 무의미해지기 때문.
          문구의 숫자는 라이브 FK 실측 기준이다:
            schedule_reservations.schedule_id → CASCADE(영구 삭제)
            comments.schedule_id             → CASCADE(영구 삭제)
            ledger_sessions.schedule_id      → SET NULL(장부는 남고 연결만 끊김) */}
      {confirming && (
        <div className="border-t border-danger/30 bg-danger/10 px-3 py-2.5 space-y-2">
          <p className="flex items-center gap-1 text-xs font-bold text-danger-light"><Icon name="alert" size={13} className="shrink-0" />‘{schedule.title}’ 게임을 삭제합니다 — 되돌릴 수 없습니다</p>
          <ul className="space-y-0.5 text-2xs leading-relaxed text-ink-secondary">
            {/* 되돌릴 수 없는 행위의 확인창은 **모르는 숫자를 말하지 않는다**.
                예전엔 조회 실패가 그대로 '0명'이 되어, 실제 예약자가 있는 포스터를 '아무도 없다'고
                안심시키며 지우게 했다(CASCADE 로 예약 영구 소멸). */}
            <li>· 예약자 <b className="text-ink-primary tabular-nums">
              {resErr != null ? '?' : reservations === null ? '…' : `${reservations.length}명`}
            </b>{resErr != null ? ' — 확인하지 못했습니다' : reservations === null ? ' — 확인하는 중입니다' : '이 함께 영구 삭제됩니다 (손님에게 알림은 가지 않습니다)'}</li>
            <li>· 포스터 문의(Q&amp;A) <b className="text-ink-primary tabular-nums">
              {qnaCount === null ? '…' : qnaCount < 0 ? '?' : `${qnaCount}건`}
            </b>{qnaCount != null && qnaCount < 0 ? ' — 확인하지 못했습니다' : '이 함께 영구 삭제됩니다'}</li>
            <li>{ledgerDate ? '· 연결된 장부와 매출은 지워지지 않습니다. 이 게임과의 연결만 끊깁니다' : '· 연결된 장부는 없습니다'}</li>
          </ul>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setConfirming(false)}
              className="flex-1 rounded-input border border-border-default py-2 text-xs font-semibold text-ink-secondary active:opacity-80">취소</button>
            {/* 무엇이 지워지는지 모르는 채로는 지우지 못하게 한다 — 다시 시도할 길을 준다 */}
            {resErr != null || reservations === null || qnaCount === null || qnaCount < 0 ? (
              <button type="button" onClick={askDelete}
                className="flex-1 rounded-input border border-border-default py-2 text-xs font-bold text-ink-secondary">
                다시 확인
              </button>
            ) : (
              <HoldToConfirmButton onConfirm={() => { onDelete(); setConfirming(false); }} holdingLabel="삭제하는 중…"
                className="flex-1 rounded-input border border-danger/50 bg-danger/20 py-2 text-xs font-bold text-danger-light">
                꾹 눌러 삭제
              </HoldToConfirmButton>
            )}
          </div>
        </div>
      )}

      {/* 모바일 전용 하단 액션 바 — 가로 균등(아래로 쌓이지 않게). 순위 미입력은 풀폭 경고로 위에 */}
      <div className="sm:hidden border-t border-border-subtle">
        {ops?.closed && !ops.hasRankings && onRanking && (
          <button type="button" onClick={() => onRanking(ops.date)}
            className="flex w-full items-center justify-center gap-1 border-b border-border-subtle bg-amber-500/10 py-2 text-2xs font-bold text-amber-400 active:opacity-80">
            <Icon name="alert" size={12} className="shrink-0" />순위 미입력 — 지금 입력하기
          </button>
        )}
        <div className="flex items-stretch divide-x divide-border-subtle">
          <button type="button" onClick={toggle} className="flex-1 py-2.5 text-xs font-semibold text-accent-300 active:bg-surface-high/60">예약 {reservations ? reservations.length : (resCount ?? 0) || ''}{open ? ' ▲' : ' ▼'}</button>
          {onLedgerAt && (
            <button type="button" onClick={toggleLedgers}
              className={['flex-1 py-2.5 text-xs font-semibold active:bg-surface-high/60', ledgerDate ? 'text-emerald-400' : 'text-ink-secondary'].join(' ')}>
              장부{ledgerDate ? (ledgersOpen ? ' ▲' : ' ▼') : ' +'}
            </button>
          )}
          <button type="button" onClick={onEdit} className="flex-1 py-2.5 text-xs font-semibold text-accent-300 active:bg-surface-high/60">수정</button>
          {/* 칸 수가 4개 그대로라 마지막 칸의 좌표가 픽셀 단위로 같았다 — 더블탭 1회로 확인이 통과됐다.
              그래서 이 칸은 토글만 하고, 실행 버튼은 위 경고 바로 올린다. */}
          <button type="button" onClick={() => (confirming ? setConfirming(false) : askDelete())}
            className={['flex-1 py-2.5 text-xs font-semibold active:bg-surface-high/60', confirming ? 'text-danger-light' : 'text-ink-muted hover:text-danger-light'].join(' ')}>
            {confirming ? '삭제 취소' : '삭제'}
          </button>
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
                className="w-full rounded-input border border-dashed border-border-default px-2.5 py-2 text-2xs font-semibold text-accent-300 active:opacity-80">
                + 이 포스터로 새 장부 (다른 날짜는 장부에서 날짜 변경)
              </button>
            </>
          )}
        </div>
      )}

      {/* 예약 리스트(펼침) */}
      {open && (
        <div className="border-t border-border-subtle bg-surface-base/40 p-3 space-y-1.5">
          {gameDates && gameDates.length > 1 && (
            <div className="mb-1 flex flex-wrap gap-1 border-b border-border-subtle pb-1.5">
              <span className="mb-0.5 w-full text-2xs text-ink-muted">같은 게임 · 날짜별 예약</span>
              {gameDates.map((g) => {
                const [, mm, dd] = g.date.split('-');
                const on = g.id === resSchedId;
                return (
                  <button key={g.id} type="button"
                    onClick={() => { setResSchedId(g.id); setReservations(null); loadRes(g.id); }}
                    className={['rounded-input px-2 py-1 text-2xs font-bold transition-colors', on ? 'bg-accent-300 text-white' : 'bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
                    {+mm}/{+dd}
                  </button>
                );
              })}
            </div>
          )}
          {/* 실패 → 확인 중 → 빈 상태 → 목록. ⚠ 실패가 먼저다 — 뒤에 두면 조회 실패가
              '아직 예약자가 없습니다'로 위장되고, 업주는 좌석을 준비하지 않는다. */}
          {resErr != null ? (
            <LoadErrorCard error={resErr} what="예약 명단" onRetry={() => loadRes()} compact />
          ) : reservations === null ? (
            <p className="text-2xs text-ink-muted text-center py-2">불러오는 중…</p>
          ) : reservations.length === 0 ? (
            <p className="text-2xs text-ink-muted text-center py-2">아직 예약자가 없습니다.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-2xs text-ink-muted">예약 {reservations.length}명</p>
                <button type="button" onClick={() => exportReservationsCsv(schedule, reservations)} className="btn-ghost text-2xs px-2 text-accent-300">CSV 내보내기</button>
              </div>
              {reservations.map((r, i) => (
                <ReservationItem key={r.id || i} idx={i + 1} res={r} venueId={venueId}
                  visited={((!!r.userId && visitedUserIds?.has(r.userId)) || visitedNames?.has((r.displayName ?? '').trim().toLowerCase())) ?? false}
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
  // '수정' 바로 옆 20px짜리 삭제라 오탭이 잦다 — 실행은 아래 넓은 확인 스트립에서만 한다
  const [ask, setAsk] = useState(false);
  const [act, setAct] = useState<CustomerActivity | null>(null);
  const openCustomer = () => {
    const next = !showCustomer; setShowCustomer(next);
    if (next && !act && venueId) getCustomerActivity(venueId, res.displayName).then(setAct).catch(() => {});
  };
  return (
    <div className="rounded-input border border-border-subtle bg-surface-low">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="w-5 text-center text-2xs font-bold text-accent-300 tabular-nums">{idx}</span>
        <div className="flex-1 min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-primary">
            <span className="min-w-0 truncate">{res.displayName}</span>
            {visited && <span className="shrink-0 rounded-badge bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">✓ 방문</span>}
            {regular && <span className="shrink-0 text-2xs font-bold text-accent-300 bg-accent-300/15 px-1.5 py-0.5 rounded-badge">단골 {reserveCount}회</span>}
          </p>
          {/* 예약 접수 일시 — 업주 전용 화면이라 노출 OK */}
          <p className="text-2xs text-ink-muted tabular-nums mt-0.5">
            {new Date(res.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 예약
          </p>
        </div>
        {regular && <button type="button" onClick={openCustomer} className="btn-ghost text-2xs px-2 text-sky-300">{showCustomer ? '닫기' : '고객정보'}</button>}
        <button type="button" onClick={onRename} className="text-ink-muted hover:text-accent-300 text-2xs px-1">수정</button>
        <button type="button" onClick={() => setAsk((v) => !v)} aria-expanded={ask}
          className={['text-2xs px-1', ask ? 'text-danger-light' : 'text-ink-muted hover:text-danger-light'].join(' ')}>{ask ? '닫기' : '삭제'}</button>
      </div>
      {/* 예약자 삭제 확인 — 버튼과 다른 줄(다른 좌표)에 펼친다. 삭제해도 손님에게 알림이 가지 않으므로 그 사실을 적는다. */}
      {ask && (
        <div className="flex items-center gap-2 border-t border-danger/30 bg-danger/10 px-2.5 py-2">
          <p className="flex-1 min-w-0 text-2xs leading-relaxed text-ink-secondary"><b className="text-danger-light">{res.displayName}</b> 님의 예약을 삭제합니다. 손님에게 알림은 가지 않습니다</p>
          <button type="button" onClick={() => setAsk(false)} className="shrink-0 rounded-input border border-border-default px-2 py-1 text-2xs font-semibold text-ink-secondary active:opacity-80">취소</button>
          <button type="button" onClick={() => { setAsk(false); onDelete(); }} className="shrink-0 rounded-input border border-danger/50 bg-danger/20 px-2 py-1 text-2xs font-bold text-danger-light active:opacity-80">삭제</button>
        </div>
      )}
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
      <p className={['text-sm font-bold tabular-nums leading-none', gold ? 'text-accent-300' : 'text-ink-primary'].join(' ')}>{value}</p>
      <p className="text-2xs text-ink-muted mt-0.5">{label}</p>
    </div>
  );
}
