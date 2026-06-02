import { useState } from 'react';
import type { Comment } from '../../api/community';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../atoms/Avatar';

interface CommentThreadProps {
  comments: Comment[];
  onSubmit: (content: string, parentId?: string) => void;
  /** 관리자(또는 본인) 댓글 삭제 콜백 — 전달되지 않으면 삭제 버튼 미노출 */
  onDelete?: (commentId: string) => void;
  /** 이 영역(예: 본인 매장 커뮤니티)에서 모든 댓글을 관리(삭제)할 수 있는 권한자 — 업주 등 */
  moderator?: boolean;
  emptyText?: string;
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return '방금 전';
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function CommentItem({
  comment,
  replies,
  onReply,
  onDelete,
  canDelete,
}: {
  comment: Comment;
  replies: Comment[];
  onReply: (parentId: string, content: string) => void;
  onDelete?: (commentId: string) => void;
  /** (commentId) => 이 댓글을 삭제할 권한이 있는지 */
  canDelete: (comment: Comment) => boolean;
}) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyContent, setReplyContent] = useState('');

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    onReply(comment.id, replyContent.trim());
    setReplyContent('');
    setShowReplyBox(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Avatar name={comment.userName} src={comment.userAvatar} color={comment.isOwner ? '#FFD100' : '#5A6175'} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-semibold text-ink-primary">{comment.userName}</span>
            {comment.isOwner && (
              <span className="text-2xs font-bold text-gold-300 bg-gold-300/15 px-1.5 py-0.5 rounded-badge">매장 답글</span>
            )}
            {comment.userRole === 'admin' && (
              <span className="text-2xs font-bold text-danger-light bg-danger/15 px-1.5 py-0.5 rounded-badge">운영자</span>
            )}
            <span className="text-2xs text-ink-muted">· {relativeTime(comment.createdAt)}</span>
          </div>
          <p className="text-sm text-ink-primary leading-relaxed whitespace-pre-wrap break-words">
            {comment.content}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowReplyBox((v) => !v)}
              className="text-2xs text-ink-muted hover:text-gold-300 transition-colors"
            >
              {showReplyBox ? '취소' : '답글'}
            </button>
            {/* 관리자(또는 본인)에게만 삭제 버튼 노출 */}
            {onDelete && canDelete(comment) && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('이 댓글을 삭제하시겠습니까?')) onDelete(comment.id);
                }}
                className="text-2xs text-ink-muted hover:text-danger-light transition-colors"
              >
                삭제
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 답글 입력창 */}
      {showReplyBox && (
        <form onSubmit={submitReply} className="ml-10 flex gap-2 animate-slide-up">
          <input
            type="text"
            autoFocus
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder={`@${comment.userName} 에게 답글...`}
            className="input flex-1"
          />
          <button type="submit" className="btn-primary px-3 shrink-0">등록</button>
        </form>
      )}

      {/* 답글 목록 */}
      {replies.length > 0 && (
        <div className="ml-10 space-y-3 border-l-2 border-border-subtle pl-3">
          {replies.map((r) => (
            <CommentItem key={r.id} comment={r} replies={[]} onReply={onReply} onDelete={onDelete} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommentThread({ comments, onSubmit, onDelete, moderator = false, emptyText = '아직 댓글이 없습니다.' }: CommentThreadProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');

  // 관리자/모더레이터(본인 매장 업주)는 모든 댓글, 일반 사용자는 본인 댓글만 삭제 (서버 RLS와 동일)
  const canDelete = (c: Comment) => moderator || user?.role === 'admin' || user?.id === c.userId;

  const roots   = comments.filter((c) => !c.parentId);
  const repliesByParent = comments
    .filter((c) => c.parentId)
    .reduce<Record<string, Comment[]>>((acc, c) => {
      (acc[c.parentId!] ??= []).push(c);
      return acc;
    }, {});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSubmit(content.trim());
    setContent('');
  };

  return (
    <div className="space-y-4">
      {/* 입력창 */}
      {user ? (
        <form onSubmit={submit} className="flex gap-2 py-2">
          <Avatar name={user.name} src={user.avatarUrl} color={user.avatarColor} size={32} />
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 입력하세요..."
            className="input flex-1"
          />
          <button type="submit" className="btn-primary px-4 shrink-0" disabled={!content.trim()}>
            등록
          </button>
        </form>
      ) : (
        <div className="p-3 rounded-input bg-surface-high text-center text-xs text-ink-muted">
          로그인하면 댓글을 작성할 수 있습니다.
        </div>
      )}

      {/* 목록 */}
      {roots.length === 0 ? (
        <p className="text-center py-8 text-xs text-ink-muted">{emptyText}</p>
      ) : (
        <div className="space-y-4">
          {roots.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={repliesByParent[c.id] ?? []}
              onReply={(parentId, content) => onSubmit(content, parentId)}
              onDelete={onDelete}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
