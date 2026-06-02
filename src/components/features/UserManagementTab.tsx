import { useState, useMemo } from 'react';
import { useToast } from '../atoms/Toast';
import type { User, UserStatus } from '../../api/auth';
import { getUserActivity, getActivityLog } from '../../api/community';
import type { PostCategory, UserActivityItem, ActivityLogEntry } from '../../api/community';

// 게시글 관리(모더레이션)용 경량 포스트 타입 — 게시판(카테고리)별 분류 포함
interface ModPost {
  id: string; userName: string; content: string; createdAt: string;
  category?: PostCategory;
}

// 게시판(카테고리) 한글 라벨
const POST_CAT_LABEL: Record<PostCategory, string> = {
  free: '자유', question: '질문', info: '정보', review: '후기', study: '공부',
};

interface UserManagementTabProps {
  users: User[];
  posts: ModPost[];
  onUpdateUser: (id: string, patch: Partial<User>) => void;
  onDeletePost: (id: string) => void;
}

type RoleFilter   = 'all' | 'user' | 'venue_owner' | 'admin';
type StatusFilter = 'all' | UserStatus;

const ROLE_LABEL: Record<string, string> = {
  user: '일반', venue_owner: '업주', admin: '관리자',
};
const STATUS_LABEL: Record<UserStatus, { label: string; cls: string }> = {
  active:    { label: '활성',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  pending:   { label: '승인대기',  cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  suspended: { label: '정지중',   cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  banned:    { label: '영구정지', cls: 'bg-danger/15 text-danger-light border-danger/30' },
  withdrawn: { label: '강제탈퇴', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
};

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600)  return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  return `${Math.floor(diff/86400)}일 전`;
}

export default function UserManagementTab({
  users, posts, onUpdateUser, onDeletePost,
}: UserManagementTabProps) {
  const [section, setSection]       = useState<'users' | 'posts'>('users');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusF]  = useState<StatusFilter>('all');
  const [query, setQuery]           = useState('');

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      const status = u.status ?? 'active';
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (query && !u.name.includes(query) && !u.email.includes(query)) return false;
      return true;
    });
  }, [users, roleFilter, statusFilter, query]);

  const counts = useMemo(() => ({
    pending:   users.filter((u) => u.status === 'pending').length,
    suspended: users.filter((u) => u.status === 'suspended').length,
    banned:    users.filter((u) => u.status === 'banned').length,
  }), [users]);

  return (
    <div className="space-y-3">
      {/* 섹션 토글 */}
      <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
        <SectionPill active={section === 'users'} onClick={() => setSection('users')} label="회원 관리" count={users.length} />
        <SectionPill active={section === 'posts'} onClick={() => setSection('posts')} label="게시글 관리" count={posts.length} />
      </div>

      {section === 'users' ? (
        <>
          {/* 요약 카운트 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <SummaryCard label="승인대기" count={counts.pending}   cls="text-amber-400 border-amber-500/30" />
            <SummaryCard label="정지중"   count={counts.suspended} cls="text-orange-400 border-orange-500/30" />
            <SummaryCard label="영구정지" count={counts.banned}    cls="text-danger-light border-danger/30" />
          </div>

          {/* 검색 */}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·이메일로 검색"
            className="input"
          />

          {/* 역할 필터 */}
          <div className="grid grid-cols-4 gap-1 text-2xs">
            <FilterPill active={roleFilter === 'all'}         onClick={() => setRoleFilter('all')}         label="전체" />
            <FilterPill active={roleFilter === 'user'}        onClick={() => setRoleFilter('user')}        label="일반" />
            <FilterPill active={roleFilter === 'venue_owner'} onClick={() => setRoleFilter('venue_owner')} label="업주" />
            <FilterPill active={roleFilter === 'admin'}       onClick={() => setRoleFilter('admin')}       label="관리자" />
          </div>

          {/* 상태 필터 */}
          <div className="grid grid-cols-5 gap-1 text-2xs">
            <FilterPill active={statusFilter === 'all'}       onClick={() => setStatusF('all')}       label="전체" />
            <FilterPill active={statusFilter === 'active'}    onClick={() => setStatusF('active')}    label="활성" />
            <FilterPill active={statusFilter === 'pending'}   onClick={() => setStatusF('pending')}   label="대기" />
            <FilterPill active={statusFilter === 'suspended'} onClick={() => setStatusF('suspended')} label="정지" />
            <FilterPill active={statusFilter === 'banned'}    onClick={() => setStatusF('banned')}    label="영구" />
          </div>

          {/* 회원 리스트 */}
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-muted">조건에 맞는 회원이 없습니다</p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((u) => <UserRow key={u.id} user={u} onUpdate={onUpdateUser} />)}
            </ul>
          )}
        </>
      ) : (
        <PostModeration posts={posts} onDelete={onDeletePost} />
      )}
    </div>
  );
}

// ── 회원 행 ─────────────────────────────────────────────────────────────────

// 제재 종류 — 사유 입력이 필요한 액션
type SanctionKind =
  | { type: 'suspend'; days: number }
  | { type: 'ban' }
  | { type: 'withdraw' };

// 활동/로그 표시 라벨
const ACT_TYPE_LABEL: Record<string, string> = { post: '글', comment: '댓글', listing: '매물' };
const ACT_TYPE_LABEL2: Record<string, string> = { post: '글', comment: '댓글', listing: '매물', schedule: '포스터', venue: '매장', live: '실시간' };
const ACT_ACTION_LABEL: Record<string, string> = { delete: '삭제', hide: '숨김', suspend: '정지', inactive: '비활성', deactivate: '비활성', restore: '활성화', ad_on: 'AD ON', ad_off: 'AD OFF' };

function UserRow({ user, onUpdate }: { user: User; onUpdate: (id: string, patch: Partial<User>) => void }) {
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  // 사유 입력 단계: 선택된 제재 + 사유 텍스트
  const [pending, setPending] = useState<SanctionKind | null>(null);
  const [reason, setReason]   = useState('');
  // 활동 내역 패널
  const [actOpen, setActOpen]       = useState(false);
  const [activity, setActivity]     = useState<UserActivityItem[]>([]);
  const [logs, setLogs]             = useState<ActivityLogEntry[]>([]);
  const [actLoading, setActLoading] = useState(false);
  const [actLoaded, setActLoaded]   = useState(false);

  const toggleActivity = async () => {
    const next = !actOpen;
    setActOpen(next);
    if (next && !actLoaded) {
      setActLoading(true);
      try {
        const [a, l] = await Promise.all([getUserActivity(user.id), getActivityLog(user.id)]);
        setActivity(a); setLogs(l); setActLoaded(true);
      } catch { toast.show('활동 내역을 불러오지 못했습니다', 'error'); }
      finally { setActLoading(false); }
    }
  };
  const status = user.status ?? 'active';
  const statusStyle = STATUS_LABEL[status];

  const close = () => { setMenuOpen(false); setPending(null); setReason(''); };

  const approve = () => {
    onUpdate(user.id, { status: 'active', approved: true });
    toast.show(`${user.name} 가입 승인`, 'success');
    close();
  };
  const restore = () => {
    onUpdate(user.id, { status: 'active', suspendedUntil: undefined, sanctionReason: undefined });
    toast.show(`${user.name} 제재 해제`, 'success');
    close();
  };
  const reject = () => {
    onUpdate(user.id, { status: 'banned', approved: false });
    toast.show(`${user.name} 가입 거절`, 'error');
    close();
  };

  // 사유 입력 후 제재 확정 — 자동 이메일은 App handleUpdateUser → updateUserStatus 에서 발송
  const confirmSanction = () => {
    if (!pending) return;
    const r = reason.trim();
    if (!r) { toast.show('제재 사유를 입력해 주세요', 'error'); return; }

    if (pending.type === 'suspend') {
      const until = new Date(Date.now() + pending.days * 24 * 60 * 60 * 1000).toISOString();
      onUpdate(user.id, { status: 'suspended', suspendedUntil: until, sanctionReason: r });
      toast.show(`${user.name} ${pending.days}일 정지 — 안내 메일 발송`, 'info');
    } else if (pending.type === 'ban') {
      onUpdate(user.id, { status: 'banned', suspendedUntil: undefined, sanctionReason: r });
      toast.show(`${user.name} 영구 정지 — 안내 메일 발송`, 'error');
    } else {
      onUpdate(user.id, { status: 'withdrawn', suspendedUntil: undefined, sanctionReason: r });
      toast.show(`${user.name} 강제 탈퇴 — 안내 메일 발송`, 'error');
    }
    close();
  };

  const sanctionTitle = !pending ? '' :
    pending.type === 'suspend' ? `${pending.days}일 정지` :
    pending.type === 'ban'     ? '영구 정지' : '강제 탈퇴';

  return (
    <li className="rounded-card border border-border-default bg-surface-low overflow-hidden">
      <div className="flex items-center gap-2 p-2.5">
        <div
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style={{ background: user.avatarColor ?? '#5A6175' }}
        >
          {(user.nickname ?? user.name)[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-ink-primary truncate">
              {user.nickname ?? user.name}
            </span>
            {user.nickname && user.nickname !== user.name && (
              <span className="text-2xs text-ink-muted truncate">({user.name})</span>
            )}
            <span className={[
              'text-2xs px-1.5 py-0.5 rounded-badge font-semibold',
              user.role === 'admin'       ? 'bg-danger/15 text-danger-light' :
              user.role === 'venue_owner' ? 'bg-gold-300/15 text-gold-300'  :
                                            'bg-blue-500/15 text-blue-400',
            ].join(' ')}>
              {ROLE_LABEL[user.role]}
            </span>
            <span className={['text-2xs px-1.5 py-0.5 rounded-badge border font-semibold', statusStyle.cls].join(' ')}>
              {statusStyle.label}
            </span>
          </div>
          <p className="text-2xs text-ink-muted truncate">{user.email}</p>
          {user.joinedAt && (
            <p className="text-2xs text-ink-muted">가입 {relativeTime(user.joinedAt)}</p>
          )}
          {user.suspendedUntil && status === 'suspended' && (
            <p className="text-2xs text-orange-400">
              정지 해제: {new Date(user.suspendedUntil).toLocaleDateString()}
            </p>
          )}
          {user.sanctionReason && (status === 'suspended' || status === 'banned' || status === 'withdrawn') && (
            <p className="text-2xs text-ink-muted truncate">사유: {user.sanctionReason}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={toggleActivity}
            className="btn-ghost text-xs px-2 py-1"
          >
            {actOpen ? '활동닫기' : '활동'}
          </button>
          <button
            type="button"
            onClick={() => menuOpen ? close() : setMenuOpen(true)}
            className="btn-ghost text-xs px-2 py-1"
          >
            {menuOpen ? '닫기' : '관리'}
          </button>
        </div>
      </div>

      {/* 액션 메뉴 */}
      {menuOpen && (
        <div className="px-2.5 py-2 border-t border-border-subtle bg-surface-mid animate-slide-up">
          {pending ? (
            // ── 사유 입력 단계 ──
            <div className="space-y-2">
              <p className="text-2xs font-semibold text-danger-light">
                {user.nickname ?? user.name} — {sanctionTitle} 사유 입력
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={300}
                autoFocus
                placeholder="제재 사유 (회원에게 발송되는 안내 메일에 포함됩니다)"
                className="input resize-none text-xs"
              />
              <div className="flex gap-1.5 justify-end">
                <button type="button" onClick={() => { setPending(null); setReason(''); }}
                  className="btn-ghost text-2xs px-2.5 py-1">뒤로</button>
                <button type="button" onClick={confirmSanction}
                  className="text-2xs font-semibold px-2.5 py-1 rounded-badge border bg-danger/15 text-danger-light hover:bg-danger/25 border-danger/30 transition-colors">
                  {sanctionTitle} 확정 + 메일 발송
                </button>
              </div>
            </div>
          ) : (
            // ── 액션 선택 단계 ──
            <div className="flex flex-wrap gap-1.5">
              {status === 'pending' && (
                <>
                  <ActionBtn onClick={approve} variant="success">가입 승인</ActionBtn>
                  <ActionBtn onClick={reject}  variant="danger">가입 거절</ActionBtn>
                </>
              )}
              {status === 'active' && (
                <>
                  <ActionBtn onClick={() => setPending({ type: 'suspend', days: 1 })}  variant="warn">1일 정지</ActionBtn>
                  <ActionBtn onClick={() => setPending({ type: 'suspend', days: 7 })}  variant="warn">7일 정지</ActionBtn>
                  <ActionBtn onClick={() => setPending({ type: 'suspend', days: 30 })} variant="warn">30일 정지</ActionBtn>
                  <ActionBtn onClick={() => setPending({ type: 'ban' })}      variant="danger">영구 정지</ActionBtn>
                  <ActionBtn onClick={() => setPending({ type: 'withdraw' })} variant="danger">강제 탈퇴</ActionBtn>
                </>
              )}
              {(status === 'suspended' || status === 'banned' || status === 'withdrawn') && (
                <ActionBtn onClick={restore} variant="success">제재 해제</ActionBtn>
              )}
            </div>
          )}
        </div>
      )}

      {/* 활동 내역 패널 */}
      {actOpen && (
        <div className="px-2.5 py-2 border-t border-border-subtle bg-surface-mid space-y-2 animate-slide-up">
          <p className="text-2xs font-semibold text-ink-secondary">최근 활동 (글·댓글·매물)</p>
          {actLoading ? (
            <p className="text-2xs text-ink-muted text-center py-2">불러오는 중…</p>
          ) : activity.length === 0 ? (
            <p className="text-2xs text-ink-muted">활동 내역이 없습니다</p>
          ) : (
            <ul className="space-y-1">
              {activity.map((a) => (
                <li key={`${a.type}-${a.id}`} className="flex items-center gap-1.5 text-2xs">
                  <span className="px-1 py-0.5 rounded-badge bg-surface-high border border-border-default text-ink-muted shrink-0">{ACT_TYPE_LABEL[a.type] ?? a.type}</span>
                  <span className="text-ink-secondary truncate flex-1">{a.summary}</span>
                  <span className="text-ink-muted shrink-0">{relativeTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-2xs font-semibold text-ink-secondary pt-1">삭제·제재 내역</p>
          {actLoading ? null : logs.length === 0 ? (
            <p className="text-2xs text-ink-muted">기록이 없습니다</p>
          ) : (
            <ul className="space-y-1">
              {logs.map((l) => (
                <li key={l.id} className="flex items-center gap-1.5 text-2xs">
                  <span className="px-1 py-0.5 rounded-badge bg-danger/15 text-danger-light border border-danger/30 shrink-0">{ACT_ACTION_LABEL[l.action] ?? l.action}</span>
                  <span className="text-ink-secondary truncate flex-1">{ACT_TYPE_LABEL2[l.targetType] ?? l.targetType}: {l.targetSummary ?? ''}</span>
                  <span className="text-ink-muted shrink-0">{relativeTime(l.createdAt)}{l.actorName ? ` · ${l.actorName}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function ActionBtn({
  onClick, variant, children,
}: { onClick: () => void; variant: 'success' | 'warn' | 'danger'; children: React.ReactNode }) {
  const cls = variant === 'success' ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border-emerald-500/30' :
              variant === 'warn'    ? 'bg-amber-500/15  text-amber-400  hover:bg-amber-500/25  border-amber-500/30'  :
                                      'bg-danger/15      text-danger-light hover:bg-danger/25     border-danger/30';
  return (
    <button type="button" onClick={onClick}
      className={`text-2xs font-semibold px-2.5 py-1 rounded-badge border ${cls} transition-colors`}>
      {children}
    </button>
  );
}

// ── 게시글 관리 ────────────────────────────────────────────────────────────

function PostModeration({
  posts, onDelete,
}: { posts: ModPost[]; onDelete: (id: string) => void }) {
  const toast = useToast();
  // 게시판(카테고리)별 필터 — 게시판별로 골라 삭제 가능
  const [cat, setCat] = useState<'all' | PostCategory>('all');
  const cats: ('all' | PostCategory)[] = ['all', 'free', 'question', 'info', 'review', 'study'];
  const countOf = (c: 'all' | PostCategory) =>
    c === 'all' ? posts.length : posts.filter((p) => (p.category ?? 'free') === c).length;
  const filtered = cat === 'all' ? posts : posts.filter((p) => (p.category ?? 'free') === cat);

  const handleDelete = (id: string) => {
    if (confirm('이 게시글을 삭제하시겠습니까?')) {
      onDelete(id);
      toast.show('게시글이 삭제되었습니다', 'success');
    }
  };

  return (
    <div className="space-y-2">
      {/* 게시판(카테고리)별 필터 */}
      <div className="grid grid-cols-6 gap-1 text-2xs">
        {cats.map((c) => (
          <FilterPill
            key={c}
            active={cat === c}
            onClick={() => setCat(c)}
            label={`${c === 'all' ? '전체' : POST_CAT_LABEL[c]} ${countOf(c)}`}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-muted">관리할 게시글이 없습니다</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((p) => (
            <li key={p.id} className="p-2.5 rounded-card border border-border-default bg-surface-low">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-surface-high border border-border-default text-ink-secondary shrink-0">
                    {POST_CAT_LABEL[p.category ?? 'free']}
                  </span>
                  <span className="text-xs font-semibold text-ink-primary truncate">{p.userName}</span>
                </div>
                <span className="text-2xs text-ink-muted shrink-0">{relativeTime(p.createdAt)}</span>
              </div>
              <p className="text-xs text-ink-secondary line-clamp-2 mt-1">{p.content}</p>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  className="text-2xs font-semibold px-2.5 py-1 rounded-badge border bg-danger/15 text-danger-light hover:bg-danger/25 border-danger/30 transition-colors"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────

function SectionPill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick}
      className={[
        'flex-1 py-2 text-xs font-semibold rounded-[6px] transition-all',
        active ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary',
      ].join(' ')}>
      {label} <span className="text-2xs opacity-70">({count})</span>
    </button>
  );
}

function SummaryCard({ label, count, cls }: { label: string; count: number; cls: string }) {
  return (
    <div className={`rounded-input border bg-surface-high py-2 ${cls}`}>
      <p className="text-lg font-bold tabular-nums">{count}</p>
      <p className="text-2xs">{label}</p>
    </div>
  );
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={[
        'py-1.5 rounded-input font-semibold transition-colors',
        active ? 'bg-gold-300 text-ink-inverse' : 'bg-surface-high text-ink-muted hover:text-ink-secondary',
      ].join(' ')}>
      {label}
    </button>
  );
}
