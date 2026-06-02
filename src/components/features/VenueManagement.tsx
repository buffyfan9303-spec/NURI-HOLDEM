// src/components/features/VenueManagement.tsx
// 관리자 '게시물 관리' > 매장 관리: 활성/비활성/정지/숨김 + AD 토글 + 삭제.
//  - 모든 상태는 '활성화'로 되돌릴 수 있음(숨김/정지/비활성 → 활성).
//  - 삭제/제재는 activity_log 에 기록.
import { useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAllVenues, updateVenueStatus, setVenueAd, deleteVenue, logActivity, setVenueVerification,
} from '../../api/community';
import type { Venue, VenueStatus, VenueVerificationStatus } from '../../api/community';

const STATUS_LABEL: Record<VenueStatus, { label: string; cls: string }> = {
  active:    { label: '활성',   cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  inactive:  { label: '비활성', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  suspended: { label: '정지',   cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  hidden:    { label: '숨김',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
};

export default function VenueManagement() {
  const toast = useToast();
  const { user } = useAuth();
  const [venues, setVenues]   = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState('');

  useEffect(() => {
    let active = true;
    getAllVenues()
      .then((v) => { if (active) setVenues(v); })
      .catch(() => { if (active) toast.show('매장 목록을 불러오지 못했습니다', 'error'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = venues.filter((v) => !query || v.name.includes(query) || v.region.includes(query));

  const changeStatus = async (v: Venue, status: VenueStatus, actionLabel: string) => {
    try {
      await updateVenueStatus(v.id, status);
      await logActivity({
        action: status === 'active' ? 'restore' : status,
        targetType: 'venue', targetId: v.id, targetOwnerId: v.ownerId,
        targetSummary: v.name, actorName: user?.name,
      });
      setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, status } : x)));
      toast.show(`${v.name} ${actionLabel}`, 'info');
    } catch { toast.show('변경에 실패했습니다', 'error'); }
  };

  const toggleAd = async (v: Venue) => {
    const next = !v.isPaidAd;
    try {
      await setVenueAd(v.id, next);
      setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, isPaidAd: next } : x)));
      toast.show(`${v.name} AD ${next ? 'ON' : 'OFF'}`, 'info');
    } catch { toast.show('변경에 실패했습니다', 'error'); }
  };

  const setVerify = async (v: Venue, status: VenueVerificationStatus) => {
    try {
      await setVenueVerification(v.id, status);
      setVenues((prev) => prev.map((x) => (x.id === v.id ? { ...x, verificationStatus: status } : x)));
      toast.show(`${v.name} 인증 ${status === 'verified' ? '승인' : '해제'}`, 'info');
    } catch { toast.show('변경에 실패했습니다', 'error'); }
  };

  const remove = async (v: Venue) => {
    if (!confirm(`'${v.name}' 매장을 완전히 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteVenue(v.id);
      await logActivity({
        action: 'delete', targetType: 'venue', targetId: v.id, targetOwnerId: v.ownerId,
        targetSummary: v.name, actorName: user?.name,
      });
      setVenues((prev) => prev.filter((x) => x.id !== v.id));
      toast.show(`${v.name} 삭제됨`, 'error');
    } catch { toast.show('삭제에 실패했습니다', 'error'); }
  };

  if (loading) return <p className="py-8 text-center text-xs text-ink-muted">불러오는 중…</p>;

  return (
    <div className="space-y-2">
      <input
        type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="매장명·지역 검색" className="input"
      />
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-muted">매장이 없습니다</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((v) => {
            const st = STATUS_LABEL[v.status ?? 'active'];
            return (
              <li key={v.id} className="rounded-card border border-border-default bg-surface-low p-2.5 space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-ink-primary truncate">{v.name}</span>
                  <span className={['text-2xs px-1.5 py-0.5 rounded-badge border font-semibold', st.cls].join(' ')}>{st.label}</span>
                  {v.isPaidAd && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-gold-300 text-ink-inverse font-bold">AD</span>}
                  {v.verificationStatus === 'verified' && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-gold-300/15 text-gold-300 border border-gold-400/40 font-bold">인증</span>}
                  {v.verificationStatus === 'pending' && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">인증 심사중</span>}
                  {!v.approved && <span className="text-2xs px-1.5 py-0.5 rounded-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold">미승인</span>}
                  <span className="text-2xs text-ink-muted ml-auto truncate">{v.region}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {v.status !== 'active'    && <Btn onClick={() => changeStatus(v, 'active', '활성화')}    variant="success">활성화</Btn>}
                  {v.status !== 'hidden'    && <Btn onClick={() => changeStatus(v, 'hidden', '숨김')}      variant="warn">숨김</Btn>}
                  {v.status !== 'suspended' && <Btn onClick={() => changeStatus(v, 'suspended', '정지')}   variant="warn">정지</Btn>}
                  {v.status !== 'inactive'  && <Btn onClick={() => changeStatus(v, 'inactive', '비활성')}  variant="muted">비활성</Btn>}
                  <Btn onClick={() => toggleAd(v)} variant={v.isPaidAd ? 'muted' : 'gold'}>{v.isPaidAd ? 'AD 끄기' : 'AD 켜기'}</Btn>
                  {v.verificationStatus !== 'verified'
                    ? <Btn onClick={() => setVerify(v, 'verified')} variant="gold">인증 승인</Btn>
                    : <Btn onClick={() => setVerify(v, 'unverified')} variant="muted">인증 해제</Btn>}
                  <Btn onClick={() => remove(v)} variant="danger">삭제</Btn>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Btn({ onClick, variant, children }: {
  onClick: () => void;
  variant: 'success' | 'warn' | 'danger' | 'muted' | 'gold';
  children: React.ReactNode;
}) {
  const cls = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25',
    warn:    'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25',
    danger:  'bg-danger/15 text-danger-light border-danger/30 hover:bg-danger/25',
    muted:   'bg-surface-high text-ink-muted border-border-default hover:text-ink-secondary',
    gold:    'bg-gold-300/15 text-gold-300 border-gold-400/30 hover:bg-gold-300/25',
  }[variant];
  return (
    <button type="button" onClick={onClick} className={`text-2xs font-semibold px-2 py-1 rounded-badge border transition-colors ${cls}`}>
      {children}
    </button>
  );
}
