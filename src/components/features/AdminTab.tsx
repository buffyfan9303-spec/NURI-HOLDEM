import { useState } from 'react';
import DraggableList from './DraggableList';
import VenueDraggableList from './VenueDraggableList';
import UserManagementTab from './UserManagementTab';
import type { Schedule } from '../../api/schedules';
import type { User } from '../../api/auth';
import type { CommunityPost, Venue } from '../../api/community';

interface AdminTabProps {
  schedules: Schedule[];
  venues: Venue[];
  users: User[];
  posts: CommunityPost[];
  onApproveSchedule: (id: string) => void;
  onRejectSchedule: (id: string) => void;
  onUpdateUser: (id: string, patch: Partial<User>) => void;
  onDeletePost: (id: string) => void;
}

type Section = 'pending' | 'reorder' | 'users';
// 노출 순서 하위 항목: 포스터(요강) / 매장
type ReorderTarget = 'posters' | 'venues';

export default function AdminTab({
  schedules, venues, users, posts, onApproveSchedule, onRejectSchedule, onUpdateUser, onDeletePost,
}: AdminTabProps) {
  const [section, setSection] = useState<Section>('pending');
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget>('posters');

  const pending = schedules.filter((s) => !s.approved);

  return (
    <div className="space-y-3">
      {/* 섹션 선택 */}
      <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
        <Pill active={section === 'pending'} onClick={() => setSection('pending')}>
          포스터 승인
          {pending.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-danger text-white text-2xs font-bold tabular-nums">
              {pending.length}
            </span>
          )}
        </Pill>
        <Pill active={section === 'reorder'} onClick={() => setSection('reorder')}>
          노출 순서
        </Pill>
        <Pill active={section === 'users'} onClick={() => setSection('users')}>
          회원 관리
        </Pill>
      </div>

      {section === 'pending' && (
        <PendingApprovalSection
          pending={pending}
          onApprove={onApproveSchedule}
          onReject={onRejectSchedule}
        />
      )}
      {section === 'reorder' && (
        <div className="space-y-3">
          {/* 노출 순서 하위 선택: 포스터 / 매장 */}
          <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
            <SubPill active={reorderTarget === 'posters'} onClick={() => setReorderTarget('posters')}>
              포스터
            </SubPill>
            <SubPill active={reorderTarget === 'venues'} onClick={() => setReorderTarget('venues')}>
              매장
            </SubPill>
          </div>

          {reorderTarget === 'posters'
            ? <DraggableList initialItems={schedules.filter((s) => s.approved)} />
            : <VenueDraggableList initialItems={venues} />}
        </div>
      )}
      {section === 'users' && (
        <UserManagementTab
          users={users}
          posts={posts.map((p) => ({
            id: p.id, userName: p.userName,
            content: p.content, createdAt: p.createdAt,
            category: p.category,
          }))}
          onUpdateUser={onUpdateUser}
          onDeletePost={onDeletePost}
        />
      )}
    </div>
  );
}

// ── 포스터 승인 대기 목록 ─────────────────────────────────────────────────────

function PendingApprovalSection({
  pending, onApprove, onReject,
}: {
  pending: Schedule[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-ink-muted">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30" aria-hidden><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <p className="text-sm">승인 대기 중인 포스터가 없습니다</p>
        <p className="text-2xs">업주가 등록한 포스터가 여기에서 검토됩니다</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {pending.map((s) => (
        <PendingRow key={s.id} schedule={s} onApprove={() => onApprove(s.id)} onReject={() => onReject(s.id)} />
      ))}
    </ul>
  );
}

function PendingRow({
  schedule, onApprove, onReject,
}: { schedule: Schedule; onApprove: () => void; onReject: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const d = new Date(schedule.date);

  return (
    <li className="flex items-center gap-3 p-3 rounded-card bg-surface-low border border-amber-500/30">
      {/* 썸네일 */}
      <div
        className="w-12 h-16 shrink-0 rounded-input overflow-hidden flex items-center justify-center"
        style={schedule.posterUrl
          ? undefined
          : { background: `linear-gradient(135deg, ${schedule.posterColor ?? '#1a1d24'}ee, #0a0c0f)` }}
      >
        {schedule.posterUrl
          ? <img src={schedule.posterUrl} alt={`${schedule.title} 포스터`} className="w-full h-full object-cover" loading="lazy" />
          : <span className="text-2xl opacity-30">♠</span>}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1 py-0.5 text-2xs font-semibold leading-none">
            승인대기
          </span>
          <span className="rounded-badge bg-surface-high text-ink-secondary border border-border-default px-1 py-0.5 text-2xs font-semibold leading-none">
            {schedule.format}
          </span>
        </div>
        <p className="text-sm font-medium text-ink-primary truncate">{schedule.title}</p>
        <p className="text-2xs text-ink-muted mt-0.5 truncate">
          {schedule.pubName || '매장 미지정'} · {d.getMonth() + 1}/{d.getDate()} {schedule.startTime} · 바이인 {schedule.buyIn.amount.toLocaleString()}
        </p>
      </div>

      {/* 액션 */}
      <div className="flex items-center gap-1 shrink-0">
        {rejecting ? (
          <>
            <button type="button" onClick={() => setRejecting(false)} className="btn-ghost text-xs px-2">
              취소
            </button>
            <button type="button" onClick={() => { onReject(); setRejecting(false); }} className="btn-danger text-xs px-2">
              반려 확정
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onApprove}
              className="text-xs font-semibold px-3 py-1.5 rounded-input bg-gold-300 text-ink-inverse hover:bg-gold-200 transition-colors"
            >
              승인
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="text-xs px-2 py-1.5 rounded-input text-ink-muted hover:text-danger-light transition-colors"
            >
              반려
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// 노출 순서 하위 탭(포스터/매장)용 작은 토글 버튼
function SubPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-[6px] transition-all focus:outline-none',
        active ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 inline-flex items-center justify-center gap-0.5 py-2 text-xs font-semibold rounded-[6px] transition-all focus:outline-none',
        active ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
