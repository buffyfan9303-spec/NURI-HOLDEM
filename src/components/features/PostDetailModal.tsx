import { useState } from 'react';
import Modal from '../atoms/Modal';
import { useAuth } from '../../contexts/AuthContext';
import type { CommunityPost } from '../../api/community';

interface PostDetailModalProps {
  post: CommunityPost | null;
  open: boolean;
  onClose: () => void;
  onLike: (postId: string) => void;
  /** 관리자 또는 작성자 삭제 */
  onDelete?: (postId: string) => void;
}

interface PostReply {
  id: string;
  author: string;
  authorColor: string;
  content: string;
  time: string;
  isAdmin?: boolean;
  isOwner?: boolean;
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

export default function PostDetailModal({
  post, open, onClose, onLike, onDelete,
}: PostDetailModalProps) {
  const { user } = useAuth();
  const [replies, setReplies] = useState<PostReply[]>([]);
  const [draft, setDraft] = useState('');

  if (!post) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !user) return;
    setReplies((prev) => [
      {
        id: `r${Date.now()}`,
        author: user.name,
        authorColor: user.avatarColor ?? '#5A6175',
        content: draft.trim(),
        time: '방금 전',
        isAdmin: user.role === 'admin',
        isOwner: user.role === 'venue_owner',
      },
      ...prev,
    ]);
    setDraft('');
  };

  return (
    <Modal open={open} onClose={onClose} title="게시글" maxWidth="lg" variant="sheet">
      <article className="p-4 space-y-4">
        {/* ── 작성자 정보 ─────────────────────────────────── */}
        <header className="flex items-center gap-2 pb-3 border-b border-border-subtle">
          <div
            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white"
            style={{ background: post.userColor ?? '#5A6175' }}
          >
            {post.userName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-ink-primary truncate">{post.userName}</span>
              {post.userRole === 'venue_owner' && (
                <span className="text-2xs font-bold text-gold-300 bg-gold-300/15 px-1.5 py-0.5 rounded-badge">업주</span>
              )}
              {post.userRole === 'admin' && (
                <span className="text-2xs font-bold text-danger-light bg-danger/15 px-1.5 py-0.5 rounded-badge">운영자</span>
              )}
            </div>
            <p className="text-2xs text-ink-muted mt-0.5 tabular-nums">
              {formatFullDate(post.createdAt)}
            </p>
          </div>
          {onDelete && (user?.role === 'admin' || user?.id === post.userId) && (
            <button
              type="button"
              onClick={() => { if (confirm('이 게시글을 삭제하시겠습니까?')) onDelete(post.id); }}
              className="shrink-0 text-2xs font-semibold px-2 py-1 rounded-badge border bg-danger/15 text-danger-light border-danger/30 hover:bg-danger/25 transition-colors"
            >
              삭제
            </button>
          )}
        </header>

        {/* ── 본문 ───────────────────────────────────────── */}
        <div className="text-base text-ink-primary leading-relaxed whitespace-pre-wrap break-words py-2">
          {post.content}
        </div>

        {/* ── 통계 + 액션 ─────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
          <div className="flex items-center gap-3 text-ink-muted">
            <button
              type="button"
              onClick={() => onLike(post.id)}
              className="inline-flex items-center gap-1 hover:text-danger transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M6.5 11.5L1.5 6.5C0.5 5.5 0.5 3.5 1.5 2.5C2.5 1.5 4.5 1.5 5.5 2.5L6.5 3.5L7.5 2.5C8.5 1.5 10.5 1.5 11.5 2.5C12.5 3.5 12.5 5.5 11.5 6.5L6.5 11.5Z" strokeLinejoin="round" />
              </svg>
              좋아요 {post.likeCount}
            </button>
            <span>댓글 {post.commentCount + replies.length}</span>
          </div>
          <button type="button" className="text-ink-muted hover:text-gold-300">공유</button>
        </div>

        {/* ── 댓글 입력 ───────────────────────────────────── */}
        {user ? (
          <form onSubmit={submit} className="flex gap-2">
            <div
              className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: user.avatarColor ?? '#5A6175' }}
            >
              {user.name[0]}
            </div>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="댓글을 입력하세요..."
              className="input flex-1 text-sm"
            />
            <button type="submit" className="btn-primary text-xs" disabled={!draft.trim()}>
              등록
            </button>
          </form>
        ) : (
          <div className="text-center p-2 rounded-input bg-surface-high text-2xs text-ink-muted">
            로그인 후 댓글을 작성할 수 있습니다
          </div>
        )}

        {/* ── 댓글 목록 ───────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink-primary">댓글 {replies.length}</h3>
          {replies.length === 0 ? (
            <p className="text-center py-4 text-2xs text-ink-muted">첫 댓글을 남겨보세요</p>
          ) : (
            <ul className="space-y-3">
              {replies.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <div
                    className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-2xs font-bold text-white"
                    style={{ background: r.authorColor }}
                  >
                    {r.author[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-ink-primary">{r.author}</span>
                      {r.isOwner && (
                        <span className="text-2xs font-bold text-gold-300 bg-gold-300/15 px-1 rounded-badge">업주</span>
                      )}
                      {r.isAdmin && (
                        <span className="text-2xs font-bold text-danger-light bg-danger/15 px-1 rounded-badge">운영자</span>
                      )}
                      <span className="text-2xs text-ink-muted">· {r.time}</span>
                    </div>
                    <p className="text-sm text-ink-primary leading-relaxed">{r.content}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </Modal>
  );
}
