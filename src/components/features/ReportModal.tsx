// src/components/features/ReportModal.tsx — 신고 사유 선택 모달(재사용)
import { useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { submitReport, type ReportTargetType } from '../../api/reports';

const REASONS = [
  '욕설/비방',
  '불법 환전·사행성',
  '음란/불쾌',
  '스팸/도배',
  '사기/허위',
  '기타',
];

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  target: { type: ReportTargetType; id?: string; ownerId?: string; summary?: string } | null;
}

export default function ReportModal({ open, onClose, target }: ReportModalProps) {
  const toast = useToast();
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user)   return toast.show('로그인이 필요합니다', 'error');
    if (!reason) return toast.show('신고 사유를 선택해 주세요', 'error');
    if (!target) return;
    setSaving(true);
    try {
      await submitReport({
        targetType: target.type, targetId: target.id, targetOwnerId: target.ownerId,
        targetSummary: target.summary, reporterName: user.nickname ?? user.name,
        reason: detail.trim() ? `${reason} — ${detail.trim()}` : reason,
      });
      toast.show('신고가 접수되었습니다. 운영자가 검토합니다.', 'success');
      setReason(''); setDetail('');
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '신고 접수에 실패했습니다', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="신고하기" maxWidth="sm" variant="sheet">
      <div className="p-4 space-y-3">
        <p className="text-xs text-ink-secondary">신고 사유를 선택해 주세요. 허위 신고 시 제재될 수 있습니다.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)}
              className={['min-h-[44px] px-2 text-xs font-semibold rounded-input border transition-colors',
                reason === r ? 'bg-accent-300/20 border-accent-300 text-accent-300' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
              {r}
            </button>
          ))}
        </div>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} maxLength={300}
          placeholder="상세 내용(선택)" className="input resize-none text-sm" />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">취소</button>
          <button type="button" onClick={submit} disabled={saving || !reason}
            className="btn-danger flex-1 disabled:opacity-60">{saving ? '접수 중…' : '신고 접수'}</button>
        </div>
      </div>
    </Modal>
  );
}
