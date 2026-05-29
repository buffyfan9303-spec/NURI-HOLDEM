import { useState } from 'react';
import type { Schedule } from '../../api/schedules';
import { useAuth } from '../../contexts/AuthContext';

interface MyPostersTabProps {
  schedules: Schedule[];
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * MyPostersTab — 승인된 매장 업주가 본인이 업로드한 포스터만 관리.
 * 비승인 업주는 안내 화면을 봄.
 */
export default function MyPostersTab({ schedules, onCreate, onEdit, onDelete }: MyPostersTabProps) {
  const { user, isApprovedOwner } = useAuth();

  // 승인 대기 중인 업주
  if (user?.role === 'venue_owner' && !isApprovedOwner) {
    return <PendingApprovalView />;
  }

  // 본인이 업로드한 포스터만
  const myPosters = schedules.filter((s) => s.ownerId === user?.id);

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">내 포스터 관리</h2>
          <p className="text-2xs text-ink-muted mt-0.5">
            본인이 업로드한 포스터만 수정·삭제할 수 있습니다 ({myPosters.length}개)
          </p>
        </div>
        <button type="button" onClick={onCreate} className="btn-primary text-xs whitespace-nowrap shrink-0">
          + 새 포스터
        </button>
      </div>

      {/* 목록 */}
      {myPosters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-ink-muted">
          <span className="text-4xl opacity-30" aria-hidden>📋</span>
          <p className="text-xs">등록된 포스터가 없습니다</p>
          <button type="button" onClick={onCreate} className="mt-2 btn-ghost text-xs">
            첫 포스터 등록하기
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {myPosters.map((p) => (
            <PosterRow
              key={p.id}
              schedule={p}
              onEdit={() => onEdit(p.id)}
              onDelete={() => onDelete(p.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 승인 대기 안내 ──────────────────────────────────────────────────────────

function PendingApprovalView() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-4 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <div>
        <h2 className="text-base font-semibold text-amber-400">관리자 승인 대기 중</h2>
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">
          매장 업주 가입 신청이 접수되었습니다.<br />
          영업일 기준 1~2일 내 승인 결과를 알려드립니다.
        </p>
      </div>
      <div className="text-2xs text-ink-muted px-4 py-2 rounded-input bg-surface-high">
        승인 후 포스터 업로드 권한이 활성화됩니다
      </div>
    </div>
  );
}

// ── 단일 포스터 행 ─────────────────────────────────────────────────────────

function PosterRow({
  schedule, onEdit, onDelete,
}: { schedule: Schedule; onEdit: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const d = new Date(schedule.date);

  return (
    <li className="flex items-center gap-3 p-3 rounded-card bg-surface-low border border-border-default">
      {/* 썸네일 — 업로드된 포스터 이미지가 있으면 표시, 없으면 색상 폴백 */}
      <div
        className="w-12 h-16 shrink-0 rounded-input overflow-hidden flex items-center justify-center"
        style={schedule.posterUrl
          ? undefined
          : { background: `linear-gradient(135deg, ${schedule.posterColor ?? '#1a1d24'}ee, #0a0c0f)` }}
      >
        {schedule.posterUrl ? (
          <img src={schedule.posterUrl} alt={`${schedule.title} 포스터`} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-2xl opacity-30">♠</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          {schedule.isPremium && (
            <span className="rounded-badge bg-gold-300 px-1 py-0.5 text-2xs font-bold text-ink-inverse leading-none">
              TOP
            </span>
          )}
          {!schedule.approved && (
            <span className="rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1 py-0.5 text-2xs font-semibold leading-none">
              승인대기
            </span>
          )}
          <span className="rounded-badge bg-surface-high text-ink-secondary border border-border-default px-1 py-0.5 text-2xs font-semibold leading-none">
            {schedule.format}
          </span>
        </div>
        <p className="text-sm font-medium text-ink-primary truncate">{schedule.title}</p>
        <p className="text-2xs text-ink-muted mt-0.5">
          {d.getMonth() + 1}/{d.getDate()} {schedule.startTime} · 바이인 {schedule.buyIn.amount.toLocaleString()}
        </p>
      </div>

      {/* 액션 */}
      <div className="flex items-center gap-1 shrink-0">
        {confirming ? (
          <>
            <button type="button" onClick={() => setConfirming(false)} className="btn-ghost text-xs px-2">
              취소
            </button>
            <button
              type="button"
              onClick={() => { onDelete(); setConfirming(false); }}
              className="btn-danger text-xs px-2"
            >
              삭제
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onEdit} className="btn-ghost text-xs px-2" aria-label="수정">
              ✎
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn-ghost text-xs px-2 hover:text-danger-light"
              aria-label="삭제"
            >
              🗑
            </button>
          </>
        )}
      </div>
    </li>
  );
}
