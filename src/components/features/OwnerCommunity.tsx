import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import { getOwnerPosts, createOwnerPost, deleteOwnerPost, type OwnerPost } from '../../api/community';
import { relativeTime } from './MarketplaceTab';

/** 업주 전용 라운지 — 작성 1일 후 자동 만료, 삭제/만료글은 관리자만 열람 */
export default function OwnerCommunity() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const canPost = user?.role === 'venue_owner' || isAdmin;

  const [posts, setPosts] = useState<OwnerPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    getOwnerPosts({ deleted: showDeleted })
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tick, showDeleted]);
  const reload = () => setTick((t) => t + 1);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = draft.trim();
    if (!c) return;
    setSending(true);
    try {
      await createOwnerPost(c);
      setDraft('');
      setShowDeleted(false);
      toast.show('등록되었습니다', 'success');
      reload();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '등록에 실패했습니다', 'error');
    } finally {
      setSending(false);
    }
  };

  const remove = async (p: OwnerPost) => {
    if (!confirm('이 글을 삭제하시겠습니까?')) return;
    try {
      await deleteOwnerPost(p.id);
      toast.show('삭제되었습니다', 'info');
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '삭제에 실패했습니다', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-input border border-gold-400/30 bg-gold-300/[0.06] px-3 py-2 text-2xs leading-relaxed text-gold-300">
        업주 전용 라운지입니다. 작성한 글은 24시간이 지나면 자동으로 사라집니다.
      </div>

      {canPost ? (
        <form onSubmit={submit} className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="업주끼리 자유롭게 이야기해보세요 (24시간 후 자동 삭제)"
            className="input w-full resize-none text-sm"
          />
          <div className="flex justify-end">
            <button type="submit" disabled={sending || !draft.trim()} className="btn-primary px-4 disabled:opacity-60">등록</button>
          </div>
        </form>
      ) : (
        <p className="py-1 text-center text-2xs text-ink-muted">읽기 전용입니다. 글 작성은 매장 업주만 가능합니다.</p>
      )}

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowDeleted((v) => !v)}
            className={[
              'rounded-input px-2 py-1 text-2xs font-semibold transition-colors',
              showDeleted ? 'bg-gold-300 text-ink-inverse' : 'border border-border-default text-ink-muted',
            ].join(' ')}
          >
            {showDeleted ? '삭제/만료 글 보는 중' : '삭제/만료 글 보기(관리자)'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-2xs text-ink-muted">불러오는 중...</p>
      ) : posts.length === 0 ? (
        <p className="py-10 text-center text-xs text-ink-muted">{showDeleted ? '삭제/만료된 글이 없습니다' : '아직 글이 없습니다'}</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id} className="rounded-card border border-border-subtle bg-surface-low p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white" style={{ background: p.authorColor ?? '#5A6175' }}>
                  {p.authorName[0]}
                </div>
                <span className="text-xs font-semibold text-ink-primary">{p.authorName}</span>
                <span className="text-2xs text-ink-muted">{relativeTime(p.createdAt)}</span>
                {p.deleted && <span className="rounded-badge bg-danger/15 px-1 text-2xs font-bold text-danger-light">삭제/만료</span>}
                {!p.deleted && (isAdmin || p.authorId === user?.id) && (
                  <button type="button" onClick={() => remove(p)} className="ml-auto text-2xs text-ink-muted transition-colors hover:text-danger-light">삭제</button>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-ink-primary">{p.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
