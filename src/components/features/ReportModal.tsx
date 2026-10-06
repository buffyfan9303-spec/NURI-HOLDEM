// src/components/features/ReportModal.tsx — 신고 사유 선택 모달(재사용)
import { useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { submitReport, RIGHTS_REASON, RIGHTS_MIN_DETAIL, type ReportTargetType } from '../../api/reports';
import { msgOf } from '../../lib/dbError';

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
  // 권리침해 삭제 요청(정보통신망법 §44의2 · 약관 제5조⑦)은 게시글에서만 — 소명이 필수이고, 처리는 관리자 임시조치(30일)다.
  const reasons = target?.type === 'post' ? [...REASONS, RIGHTS_REASON] : REASONS;
  const rights = reason === RIGHTS_REASON;

  const submit = async () => {
    if (!user)   return toast.show('로그인이 필요합니다', 'error');
    if (!reason) return toast.show('신고 사유를 선택해 주세요', 'error');
    if (rights && detail.trim().length < RIGHTS_MIN_DETAIL) return toast.show(`침해 사실을 ${RIGHTS_MIN_DETAIL}자 이상 소명해 주세요`, 'error');
    if (!target) return;
    setSaving(true);
    try {
      await submitReport({
        targetType: target.type, targetId: target.id, targetOwnerId: target.ownerId,
        targetSummary: target.summary, reporterName: user.nickname ?? user.name,
        reason: detail.trim() ? `${reason} — ${detail.trim()}` : reason,
      });
      toast.show('신고가 접수되었습니다. 관리자가 검토합니다.', 'success');
      setReason(''); setDetail('');
      onClose();
    } catch (err) {
      toast.show(msgOf(err, '신고 접수에 실패했습니다'), 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="신고하기" maxWidth="sm" variant="sheet">
      <div className="p-4 space-y-3">
        <p className="text-xs text-ink-secondary">신고 사유를 선택해 주세요. 허위 신고 시 제재될 수 있습니다.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {reasons.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r}
              data-testid={r === RIGHTS_REASON ? 'report-reason-rights' : undefined}
              className={['min-h-[44px] px-2 text-xs font-semibold rounded-input border transition-colors', r === RIGHTS_REASON ? 'col-span-2' : '',
                reason === r ? 'chip-on' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
              {r}
            </button>
          ))}
        </div>
        {rights && (
          <p className="text-2xs leading-relaxed text-ink-secondary" data-testid="report-rights-guide">
            권리를 침해받은 본인(또는 대리인)이 침해 사실을 소명하면 삭제를 요청할 수 있습니다(정보통신망법 제44조의2).
            검토 후 게시물을 최대 30일 임시조치(가림)하면 요청하신 분과 작성자에게 알림으로 알려 드립니다.
            반박 내용 게재 요청은 고객센터(ace@nuriholdem.com)로 보내 주세요.
          </p>
        )}
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={rights ? 5 : 3} maxLength={rights ? 1000 : 300}
          aria-label={rights ? '침해 사실 소명' : '상세 내용'}
          placeholder={rights ? `어떤 권리가 어떻게 침해되었는지 적어 주세요(필수, ${RIGHTS_MIN_DETAIL}자 이상)` : '상세 내용(선택)'}
          className="input resize-none text-sm" />
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">취소</button>
          <button type="button" onClick={submit} disabled={saving || !reason || (rights && detail.trim().length < RIGHTS_MIN_DETAIL)}
            className="btn-danger flex-1 disabled:opacity-60">{saving ? '접수 중…' : '신고 접수'}</button>
        </div>
      </div>
    </Modal>
  );
}
