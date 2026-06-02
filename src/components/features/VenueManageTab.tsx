import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import type { User } from '../../api/auth';
import { getMyVenueStaff, manageStaff } from '../../api/auth';
import { getVenueRankings, saveVenueRankings, maskRealName } from '../../api/rankings';

/** 업주/직원 전용 "매장 관리" 탭 — 순위 입력 + (업주) 직원 관리 */
export default function VenueManageTab() {
  const { user } = useAuth();
  const isOwner = user?.role === 'venue_owner';
  const [section, setSection] = useState<'ranking' | 'staff'>('ranking');

  if (!user || !user.venueId) {
    return (
      <div className="py-16 text-center text-sm text-ink-muted">
        소속된 매장이 없습니다. 매장 승인 또는 직원 승인 후 이용할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isOwner && (
        <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
          <TabBtn active={section === 'ranking'} onClick={() => setSection('ranking')}>순위 입력</TabBtn>
          <TabBtn active={section === 'staff'} onClick={() => setSection('staff')}>직원 관리</TabBtn>
        </div>
      )}

      {section === 'ranking' || !isOwner
        ? <RankingEditor venueId={user.venueId} canEdit={user.approved === true} />
        : <StaffManager />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={['flex-1 py-2 text-xs font-semibold rounded-[6px] transition-all focus:outline-none',
        active ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
      {children}
    </button>
  );
}

// ── 일일 순위 입력 ────────────────────────────────────────────────────────────
interface Row { nickname: string; realName: string; }

function RankingEditor({ venueId, canEdit }: { venueId: string; canEdit: boolean }) {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([{ nickname: '', realName: '' }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    getVenueRankings(venueId, date)
      .then(({ entries }) =>
        setRows(entries.length
          ? entries.map((e) => ({ nickname: e.nickname, realName: e.realName }))
          : [{ nickname: '', realName: '' }]))
      .catch(() => setRows([{ nickname: '', realName: '' }]))
      .finally(() => setLoading(false));
  }, [venueId, date]);

  const update = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const addRow = () => setRows((r) => [...r, { nickname: '', realName: '' }]);
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  const save = async () => {
    const clean = rows.filter((r) => r.nickname.trim() || r.realName.trim());
    if (clean.length === 0) return toast.show('순위를 한 명 이상 입력해 주세요', 'error');
    if (clean.some((r) => !r.nickname.trim() || !r.realName.trim()))
      return toast.show('각 줄에 닉네임과 실명을 모두 입력해 주세요', 'error');
    setSaving(true);
    try {
      await saveVenueRankings(venueId, date, clean);
      toast.show('순위를 저장했습니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="py-16 text-center text-sm text-ink-muted">
        매장(직원) 승인 완료 후 순위를 입력할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 날짜 */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value || today)}
          className="input flex-1 text-sm"
        />
        {date !== today && (
          <button type="button" onClick={() => setDate(today)} className="btn-ghost text-xs px-3 shrink-0">오늘</button>
        )}
      </div>

      <p className="text-2xs text-ink-muted">
        닉네임과 실명을 입력하면 손님에게는 <span className="text-gold-300 font-semibold">도토리(나*리)</span> 처럼 표시됩니다(실명 가운데 가림).
      </p>

      {loading ? (
        <p className="text-center py-8 text-2xs text-ink-muted">불러오는 중...</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="w-6 shrink-0 text-center text-sm font-bold text-gold-300 tabular-nums">{i + 1}</span>
              <input
                type="text" value={row.nickname} maxLength={30}
                onChange={(e) => update(i, 'nickname', e.target.value)}
                placeholder="닉네임"
                className="input flex-1 text-sm py-2"
              />
              <input
                type="text" value={row.realName} maxLength={20}
                onChange={(e) => update(i, 'realName', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && i === rows.length - 1) addRow(); }}
                placeholder="실명"
                className="input w-24 text-sm py-2"
              />
              <button
                type="button" onClick={() => removeRow(i)} aria-label="줄 삭제"
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-input text-ink-muted hover:text-danger-light transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={addRow}
        className="w-full py-2 rounded-input border border-dashed border-border-default text-xs font-semibold text-ink-secondary hover:text-ink-primary hover:border-gold-400/50 transition-colors">
        + 줄 추가
      </button>

      {/* 미리보기 */}
      {rows.some((r) => r.nickname.trim() || r.realName.trim()) && (
        <div className="rounded-input bg-surface-high border border-border-subtle p-3">
          <p className="text-2xs font-semibold text-ink-muted mb-1.5">미리보기 (손님 화면)</p>
          <div className="flex flex-wrap gap-1.5">
            {rows.filter((r) => r.nickname.trim() || r.realName.trim()).map((r, i) => (
              <span key={i} className="text-2xs px-2 py-0.5 rounded-badge bg-surface-float text-ink-primary">
                {i + 1}. {r.nickname.trim() || '닉네임'}{r.realName.trim() ? `(${maskRealName(r.realName)})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <button type="button" onClick={save} disabled={saving} className="btn-primary w-full disabled:opacity-60">
        {saving ? '저장 중…' : `${date === today ? '오늘' : date} 순위 저장`}
      </button>
    </div>
  );
}

// ── 직원 관리(업주) ───────────────────────────────────────────────────────────
function StaffManager() {
  const toast = useToast();
  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    getMyVenueStaff().then(setStaff).catch(() => {}).finally(() => setLoading(false));
  }, [tick]);

  const act = async (s: User, action: 'approve' | 'reject' | 'remove') => {
    if (action === 'remove' && !confirm(`${s.name} 직원을 삭제하시겠습니까? (일반 회원으로 전환)`)) return;
    try {
      await manageStaff(s.id, action);
      toast.show('처리되었습니다', 'success');
      setTick((t) => t + 1);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '처리에 실패했습니다', 'error');
    }
  };

  if (loading) return <p className="text-center py-10 text-2xs text-ink-muted">불러오는 중...</p>;
  if (staff.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-ink-muted">
        등록된 직원이 없습니다.
        <p className="text-2xs mt-1">직원이 "가게 직원"으로 가입하고 우리 매장을 선택하면 여기에 표시됩니다.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {staff.map((s) => (
        <li key={s.id} className="flex items-center gap-3 p-3 rounded-card bg-surface-low border border-border-subtle">
          <div className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: s.avatarColor ?? '#5A6175' }}>
            {s.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-ink-primary truncate">{s.name}</span>
              <span className={['text-2xs font-bold px-1 rounded-badge leading-none',
                s.approved ? 'text-emerald-400 bg-emerald-500/15' : 'text-amber-400 bg-amber-500/15'].join(' ')}>
                {s.approved ? '승인됨' : '대기중'}
              </span>
            </div>
            <p className="text-2xs text-ink-muted truncate">{s.email}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {s.approved ? (
              <button type="button" onClick={() => act(s, 'reject')} className="btn-ghost text-2xs px-2 py-1">보류</button>
            ) : (
              <button type="button" onClick={() => act(s, 'approve')}
                className="text-2xs font-semibold px-2.5 py-1 rounded-input bg-gold-300 text-ink-inverse hover:bg-gold-200 transition-colors">승인</button>
            )}
            <button type="button" onClick={() => act(s, 'remove')}
              className="text-2xs px-2 py-1 rounded-input text-ink-muted hover:text-danger-light transition-colors">삭제</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
