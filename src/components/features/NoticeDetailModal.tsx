import Modal from '../atoms/Modal';
import type { MarketplaceNotice, NoticeType } from '../../api/marketplace';

interface NoticeDetailModalProps {
  notice: MarketplaceNotice | null;
  open: boolean;
  onClose: () => void;
}

const TYPE_STYLE: Record<NoticeType, { label: string; cls: string }> = {
  pinned:  { label: '공지',   cls: 'bg-gold-300/15 text-gold-300 border-gold-400/40' },
  event:   { label: '이벤트', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/40' },
  caution: { label: '주의',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40' },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day   = d.getDate().toString().padStart(2, '0');
  const hour  = d.getHours().toString().padStart(2, '0');
  const min   = d.getMinutes().toString().padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day} ${hour}:${min}`;
}

export default function NoticeDetailModal({ notice, open, onClose }: NoticeDetailModalProps) {
  if (!notice) return null;

  const style = TYPE_STYLE[notice.type];

  return (
    <Modal open={open} onClose={onClose} title="공지사항" maxWidth="md" variant="sheet">
      <div className="p-4 space-y-4">
        {/* 유형 배지 */}
        <span className={[
          'inline-flex items-center gap-1 px-2 py-1 rounded-badge border text-xs font-bold',
          style.cls,
        ].join(' ')}>
          {style.label}
        </span>

        {/* 제목 */}
        <h2 className="text-lg font-bold text-ink-primary leading-snug">
          {notice.title}
        </h2>

        {/* 메타 */}
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span>작성자: <span className="text-ink-secondary">{notice.authorName}</span></span>
          <span className="text-border-strong">·</span>
          <span className="tabular-nums">{formatDateTime(notice.createdAt)}</span>
        </div>

        <div className="border-t border-border-subtle" />

        {/* 본문 */}
        {notice.body ? (
          <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
            {notice.body}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">본문 내용이 없습니다.</p>
        )}

        {/* 액션 */}
        <div className="pt-2">
          <button type="button" onClick={onClose} className="btn-primary w-full">
            확인
          </button>
        </div>
      </div>
    </Modal>
  );
}
