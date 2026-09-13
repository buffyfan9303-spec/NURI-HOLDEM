import Modal from '../atoms/Modal';
import type { MarketplaceNotice } from '../../api/marketplace';
import Icon from '../atoms/Icon';
import { NoticeBadge } from './NoticeSection';
import { parseNoticeBody } from '../../lib/noticeBody';

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

        {/* 메타 → 본문 경계: UI-03 아우라 구분선(독서 경계 공통 유틸 .divider-aura). 장식일 뿐 위계는 제목·간격이 전한다. */}
        <hr className="divider-aura mt-4" aria-hidden="true" />
        {/* 본문 — 공지는 핸드·이미지가 거의 없는 순수 텍스트라 가독성이 전부다.
            text-sm/ink-secondary(작고 어두움) → text-base/ink-primary. 한글 장문이라 줄간격은 1.75.
            UI-01(2026-09-13): 줄 높이를 더 키우지 않고 **문단과 번호 항목을 나눈다**(lib/noticeBody — 원문은 그대로).
            간격: 문단 1em · 항목 사이 0.85em · 번호 목록과 앞뒤 문단 1.25em. 문장 안 개행은 pre-wrap 으로 보존.
            긴 URL·영문은 break-words(overflow-wrap) 로만 막는다 — 전역 break-all 을 쓰지 않는다. */}
        <div className="mt-4">
          {notice.body ? (
            <div data-notice-body
              className="break-words text-base leading-[1.75] text-ink-primary [&>*+*]:mt-[1em] [&>*+ol]:mt-[1.25em] [&>ol+*]:mt-[1.25em]">
              {parseNoticeBody(notice.body).map((b, i) => b.kind === 'p' ? (
                <p key={i} className="whitespace-pre-wrap">{b.lines.join('\n')}</p>
              ) : (
                <ol key={i} className="list-none space-y-[0.85em] pl-0">
                  {b.items.map((it, j) => (
                    <li key={j} className="flex gap-2">
                      {/* 원문 번호 그대로 — 자동 번호에 맡기면 '3.' 이 '3)' 로 바뀌거나 건너뛴 번호가 메워진다 */}
                      {/* 번호 뒤 공백을 텍스트로 둔다 — 복사·스크린리더·textContent 가 원문처럼 '1) 내용' 으로 읽힌다(flex 라 시각 폭은 gap 이 준다) */}
                      <span className="shrink-0 tabular-nums">{it.marker}{' '}</span>
                      <span className="min-w-0 flex-1 whitespace-pre-wrap">{it.lines.join('\n')}</span>
                    </li>
                  ))}
                </ol>
              ))}
            </div>
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
