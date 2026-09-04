import Modal from '../atoms/Modal';
import type { MarketplaceNotice } from '../../api/marketplace';
import Icon from '../atoms/Icon';
import { NoticeBadge } from './NoticeSection';

interface NoticeDetailModalProps {
  notice: MarketplaceNotice | null;
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;       // 운영자면 수정·삭제 노출(서버 RLS가 최종 강제)
  onEdit?: () => void;
  onDelete?: () => void;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day   = d.getDate().toString().padStart(2, '0');
  const hour  = d.getHours().toString().padStart(2, '0');
  const min   = d.getMinutes().toString().padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day} ${hour}:${min}`;
}

export default function NoticeDetailModal({ notice, open, onClose, isAdmin, onEdit, onDelete }: NoticeDetailModalProps) {
  if (!notice) return null;

  return (
    <Modal open={open} onClose={onClose} title="공지사항" maxWidth="md" variant="sheet" dragToClose>
      {/* 여백은 균등(space-y-4)이 아니라 **위계**로 준다 — 배지·제목·메타는 한 덩어리로 붙이고,
          본문 앞에만 크게 띄운다. 예전엔 전부 16px 균등이라 무엇이 무엇에 속하는지 안 보였다. */}
      <div className="p-4">
        <NoticeBadge type={notice.type} />

        {/* 제목 — 게시글 상세(PostDetailModal)와 같은 배율. 공지는 게시글보다 **더** 정확히 읽혀야 하는 글인데
            예전엔 text-lg 로 더 작았다. 본문이 16px 이므로 1.25/1.5 배로 벌린다. */}
        <h2 className="mt-2 text-xl font-bold leading-tight tracking-tight text-ink-primary break-words sm:text-2xl">
          {notice.title}
        </h2>

        {/* 메타 — 제목에 딸린 정보라 바짝 붙인다 */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-muted">
          <span>{notice.authorName}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{formatDateTime(notice.createdAt)}</span>
        </div>

        {/* 본문 — 공지는 핸드·이미지가 거의 없는 순수 텍스트라 가독성이 전부다.
            text-sm/ink-secondary(작고 어두움) → text-base/ink-primary. 한글 장문이라 줄간격은 1.75.
            줄간격은 애니메이트 속성이 아니라 모션 헌법과 무관하다. */}
        <div className="mt-4 border-t border-border-subtle pt-4">
          {notice.body ? (
            <p className="whitespace-pre-wrap break-words text-base leading-[1.75] text-ink-primary">
              {notice.body}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">본문 내용이 없습니다.</p>
          )}
        </div>

        {/* 액션 */}
        <div className="mt-6 space-y-2">
          {isAdmin && (onEdit || onDelete) && (
            <div className="flex gap-2">
              {onEdit && <button type="button" onClick={onEdit} className="btn-ghost inline-flex flex-1 items-center justify-center gap-1.5 text-accent-300"><Icon name="edit" size={14} className="shrink-0" />수정</button>}
              {onDelete && <button type="button" onClick={() => { if (window.confirm('이 공지사항을 삭제할까요?')) onDelete(); }} className="btn-ghost inline-flex flex-1 items-center justify-center gap-1.5 hover:text-danger-light"><Icon name="trash" size={14} className="shrink-0" />삭제</button>}
            </div>
          )}
          <button type="button" onClick={onClose} className="btn-primary w-full">
            확인
          </button>
        </div>
      </div>
    </Modal>
  );
}
