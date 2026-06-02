import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import { getMyStaffInvites, respondStaffInvite, type StaffInvite } from '../../api/auth';

/** 로그인 회원에게 도착한 매장 구성원 초대 — 수락/거절 배너 */
export default function StaffInviteBanner() {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) { setInvites([]); return; }
    let active = true;
    getMyStaffInvites().then((i) => { if (active) setInvites(i); }).catch(() => {});
    return () => { active = false; };
  }, [user]);

  if (!user || invites.length === 0) return null;

  const respond = async (id: string, accept: boolean) => {
    setBusy(true);
    try {
      await respondStaffInvite(id, accept);
      setInvites((prev) => prev.filter((x) => x.id !== id));
      toast.show(accept ? '매장 구성원으로 합류했습니다' : '초대를 거절했습니다', accept ? 'success' : 'info');
      if (accept) await refreshProfile();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '처리에 실패했습니다', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 pt-3">
      {invites.map((iv) => (
        <div key={iv.id} className="flex items-center gap-2 p-3 rounded-card bg-gold-300/10 border border-gold-400/40">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFD100" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          <p className="flex-1 min-w-0 text-xs text-ink-primary leading-relaxed">
            <b className="text-gold-300">{iv.venueName}</b>에서 구성원으로 초대했습니다.
          </p>
          <button type="button" disabled={busy} onClick={() => respond(iv.id, true)}
            className="text-2xs font-semibold px-2.5 py-1 rounded-input bg-gold-300 text-ink-inverse hover:bg-gold-200 transition-colors disabled:opacity-60">수락</button>
          <button type="button" disabled={busy} onClick={() => respond(iv.id, false)}
            className="text-2xs px-2 py-1 rounded-input text-ink-muted hover:text-danger-light transition-colors disabled:opacity-60">거절</button>
        </div>
      ))}
    </div>
  );
}
