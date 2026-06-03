import { useState, useEffect } from 'react';
import DraggableList from './DraggableList';
import VenueManagement from './VenueManagement';
import ReportQueue from './ReportQueue';
import UserManagementTab from './UserManagementTab';
import type { Schedule } from '../../api/schedules';
import type { User } from '../../api/auth';
import type { CommunityPost, Venue, AdminStats } from '../../api/community';
import { getAdminStats, adminCreateVenue } from '../../api/community';
import { useToast } from '../atoms/Toast';

interface AdminTabProps {
  schedules: Schedule[];
  venues: Venue[];
  users: User[];
  posts: CommunityPost[];
  onApproveSchedule: (id: string) => void;
  onRejectSchedule: (id: string) => void;
  onUpdateUser: (id: string, patch: Partial<User>) => void;
  onDeletePost: (id: string) => void;
  /** 매장 생성 후 목록 새로고침 */
  onReloadVenues?: () => void;
}

type Section = 'pending' | 'reorder' | 'users' | 'venues' | 'reports';
// 노출 순서 하위 항목: 포스터(요강) / 매장
type ReorderTarget = 'posters' | 'venues';

export default function AdminTab({
  schedules, venues, users, posts, onApproveSchedule, onRejectSchedule, onUpdateUser, onDeletePost, onReloadVenues,
}: AdminTabProps) {
  const [section, setSection] = useState<Section>('pending');
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget>('posters');

  const pending = schedules.filter((s) => !s.approved);

  return (
    <div className="space-y-3">
      <StatsPanel />
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
          게시물 관리
        </Pill>
        <Pill active={section === 'users'} onClick={() => setSection('users')}>
          회원 관리
        </Pill>
        <Pill active={section === 'venues'} onClick={() => setSection('venues')}>
          매장
        </Pill>
        <Pill active={section === 'reports'} onClick={() => setSection('reports')}>
          신고
        </Pill>
      </div>

      {section === 'venues' && (
        <VenueCreateCard venues={venues} users={users} onCreated={() => onReloadVenues?.()} />
      )}

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
            : <VenueManagement />}
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
      {section === 'reports' && <ReportQueue />}
    </div>
  );
}

// ── 홀덤펍 생성 + 관리 업주 임명 ─────────────────────────────────────────────

function VenueCreateCard({ venues, users, onCreated }: { venues: Venue[]; users: User[]; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [busy, setBusy] = useState(false);

  // 업주로 임명 가능한 후보 — 관리자 제외
  const candidates = users.filter((u) => u.role !== 'admin');

  const submit = async () => {
    if (!name.trim() || !region.trim()) { toast.show('매장명과 지역은 필수입니다', 'error'); return; }
    setBusy(true);
    try {
      await adminCreateVenue({ name, region, address, ownerId: ownerId || undefined });
      toast.show('홀덤펍을 생성했습니다', 'success');
      setName(''); setRegion(''); setAddress(''); setOwnerId('');
      onCreated();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '생성에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent p-3 space-y-2">
        <h3 className="text-sm font-bold text-gold-300">홀덤펍 생성 + 관리 업주 임명</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-2xs text-ink-secondary mb-1">매장명 <span className="text-danger">*</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="예: 강남 로얄 홀덤" className="input w-full text-sm" />
          </label>
          <label className="block">
            <span className="block text-2xs text-ink-secondary mb-1">지역 <span className="text-danger">*</span></span>
            <input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={20} placeholder="예: 강남" className="input w-full text-sm" />
          </label>
        </div>
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">주소 (선택)</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={80} placeholder="도로명 주소" className="input w-full text-sm" />
        </label>
        <label className="block">
          <span className="block text-2xs text-ink-secondary mb-1">관리 업주 임명 (선택)</span>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input w-full text-sm">
            <option value="">미지정 (나중에 임명)</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.nickname ?? u.name} · {u.email}</option>
            ))}
          </select>
          <span className="block text-[10px] text-ink-muted mt-1">임명 시 해당 회원이 업주(인증)로 전환되어 이 매장을 관리합니다.</span>
        </label>
        <div className="flex justify-end">
          <button type="button" onClick={submit} disabled={busy} className="btn-primary px-4 text-xs disabled:opacity-60">매장 생성</button>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-ink-secondary mb-1.5">등록된 홀덤펍 ({venues.length})</h3>
        <ul className="space-y-1.5">
          {venues.map((v) => {
            const owner = users.find((u) => u.id === v.ownerId);
            return (
              <li key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-input bg-surface-high border border-border-subtle">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-primary truncate">{v.name}</p>
                  <p className="text-2xs text-ink-muted">{v.region} · 업주: {owner ? (owner.nickname ?? owner.name) : '미지정'}</p>
                </div>
                {v.verificationStatus === 'verified' && (
                  <span className="shrink-0 text-2xs font-bold text-gold-300 bg-gold-300/15 px-1.5 py-0.5 rounded-badge">인증</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

// ── 관리자 통계 패널 ─────────────────────────────────────────────────────────

function StatsPanel() {
  const [s, setS] = useState<AdminStats | null>(null);
  useEffect(() => {
    let active = true;
    getAdminStats().then((x) => { if (active) setS(x); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!s) return null;
  const cards = [
    { label: '전체 회원', v: s.users },        { label: '업주', v: s.owners },            { label: '승인대기 업주', v: s.pendingOwners },
    { label: '제재 회원', v: s.suspended },     { label: '게시글', v: s.posts },           { label: '매물', v: s.listings },
    { label: '포스터', v: s.schedules },        { label: '승인대기 포스터', v: s.pendingSchedules }, { label: '7일 신규가입', v: s.signups7d },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c) => (
        <div key={c.label} className="rounded-input border border-border-default bg-surface-low py-2 text-center">
          <p className="text-lg font-bold text-ink-primary tabular-nums leading-none">{c.v.toLocaleString()}</p>
          <p className="text-2xs text-ink-muted mt-1">{c.label}</p>
        </div>
      ))}
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
