// src/components/features/AnnouncePanel.tsx
// 운영자 마케팅 푸시 — 우리 매장을 팔로우한 손님에게 커스텀 알림(푸시) 발송. 하루 3회 제한.
import { useEffect, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { getVenueAnnounceStatus, sendVenueAnnouncement, type AnnounceStatus } from '../../api/announcements';

export default function AnnouncePanel({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [status, setStatus] = useState<AnnounceStatus>({ followers: 0, sentToday: 0 });
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => getVenueAnnounceStatus(venueId).then(setStatus).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [venueId]);
  const remaining = Math.max(0, 3 - status.sentToday);

  const send = async () => {
    if (busy) return;
    if (!title.trim() || !message.trim()) { toast.show('제목과 내용을 입력하세요', 'error'); return; }
    if (!window.confirm(`팔로워 ${status.followers}명에게 푸시 알림을 보낼까요?`)) return;
    setBusy(true);
    try {
      const n = await sendVenueAnnouncement(venueId, title.trim(), message.trim());
      toast.show(`${n}명에게 발송했어요`, 'success');
      setTitle(''); setMessage(''); load();
    } catch (e) { toast.show(e instanceof Error ? e.message : '발송 실패', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-primary">📢 팔로워에게 알림 보내기</h3>
        <span className="text-2xs text-ink-muted">팔로워 <b className="text-gold-300">{status.followers}</b> · 오늘 {status.sentToday}/3</span>
      </div>
      <p className="text-2xs leading-relaxed text-ink-muted">우리 매장을 팔로우한 손님에게 푸시 알림을 보냅니다. 새 대회 등록·D-1 리마인더는 자동 발송돼요. 하루 3회까지.</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="제목 (예: 오늘 8시 GTD 500!)" className="input w-full text-sm" />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} rows={2} placeholder="내용 (예: 마감 임박! 지금 예약하세요 🔥)" className="input w-full resize-none text-sm" />
      <button type="button" onClick={send} disabled={busy || remaining === 0 || status.followers === 0}
        className="btn-primary w-full text-sm disabled:opacity-50">
        {status.followers === 0 ? '아직 팔로워가 없어요' : remaining === 0 ? '오늘 발송 한도 소진(3/3)' : busy ? '발송 중…' : `📤 ${status.followers}명에게 발송 · ${remaining}회 남음`}
      </button>
    </section>
  );
}
