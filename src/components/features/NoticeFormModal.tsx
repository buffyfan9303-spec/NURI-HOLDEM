// src/components/features/NoticeFormModal.tsx
import { useState, useEffect } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import type { NoticeType, NoticeBoard } from '../../api/marketplace';

export interface NoticeFormData {
  type: NoticeType;
  title: string;
  body: string;
  board: NoticeBoard;
}

const BOARD_OPTIONS: { id: NoticeBoard; label: string }[] = [
  { id: 'all',       label: '전체' },
  { id: 'community', label: '게시판' },
  { id: 'market',    label: '중고장터' },
  { id: 'dealer',    label: '딜러' },
];

interface NoticeFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: NoticeFormData) => Promise<void> | void;
}

const TYPE_OPTIONS: { id: NoticeType; label: string }[] = [
  { id: 'pinned',  label: '일반 공지' },
  { id: 'event',   label: '이벤트' },
  { id: 'caution', label: '주의' },
];

/**
 * NoticeFormModal — 관리자 전용 공지사항 작성 모달
 * 실제 권한 제어는 서버 RLS(notices_admin_all)가 강제한다.
 */
export default function NoticeFormModal({ open, onClose, onSubmit }: NoticeFormModalProps) {
  const toast = useToast();
  const [type,  setType]  = useState<NoticeType>('pinned');
  const [title, setTitle] = useState('');
  const [body,  setBody]  = useState('');
  const [board, setBoard] = useState<NoticeBoard>('all');
  const [saving, setSaving] = useState(false);

  // 모달 열릴 때마다 폼 초기화
  useEffect(() => {
    if (open) { setType('pinned'); setTitle(''); setBody(''); setBoard('all'); setSaving(false); }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.show('공지 제목을 입력해 주세요', 'error');
    setSaving(true);
    try {
      await onSubmit({ type, title: title.trim(), body: body.trim(), board });
      toast.show('공지사항이 등록되었습니다', 'success');
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '공지 등록에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="공지사항 작성" maxWidth="sm" variant="sheet">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* 유형 선택 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">유형</label>
          <div className="flex gap-1.5">
            {TYPE_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setType(o.id)}
                className={[
                  'flex-1 py-2 text-xs font-semibold rounded-input border transition-colors',
                  type === o.id
                    ? 'bg-gold-300/20 border-gold-300 text-gold-300'
                    : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary',
                ].join(' ')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 노출 게시판 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">노출 게시판</label>
          <div className="grid grid-cols-4 gap-1.5">
            {BOARD_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setBoard(o.id)}
                className={[
                  'py-2 text-2xs font-semibold rounded-input border transition-colors',
                  board === o.id
                    ? 'bg-gold-300/20 border-gold-300 text-gold-300'
                    : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary',
                ].join(' ')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            제목 <span className="text-danger ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="공지 제목 입력"
            className="input"
            autoFocus
          />
        </div>

        {/* 본문 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">내용</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="공지 내용을 입력하세요 (선택)"
            className="input resize-none"
          />
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">취소</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-60">
            {saving ? '등록 중…' : '공지 등록'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
