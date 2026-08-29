import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import { getOwnerPosts, createOwnerPost, deleteOwnerPost, type OwnerPost } from '../../api/community';
import { relativeTime } from './MarketplaceTab';
import { onColorInkClass } from '../../lib/color';

/** 업주 전용 라운지 — 작성 1일 후 자동 만료, 삭제/만료글은 관리자만 열람 */
export default function OwnerCommunity() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const canPost = isAdmin || (user?.role === 'venue_owner' && user?.venueVerified === true);

  const [posts, setPosts] = useState<OwnerPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  // 오너 지시: 입력 영역이 화면을 너무 차지 — 평소엔 1행(입력 1줄 + 우측 게시 버튼),
  // 포커스하거나 쓰던 글이 있으면 자연 확장. 확장은 rows 교체(즉시 레이아웃)라 height 애니 금지 규약과 무관.
  const [focused, setFocused] = useState(false);
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
      toast.show('게시되었습니다', 'success');
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

  // 접힌 1행 ↔ 확장(포커스 중이거나 쓰던 글이 있을 때)
  const expanded = focused || draft.trim().length > 0;

  return (
    <div className="space-y-2">
      {canPost ? (
        <form onSubmit={submit} className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            maxLength={2000}
            rows={expanded ? 3 : 1}
            placeholder="업주끼리 자유롭게 이야기해보세요"
            // 접힘 상태는 textarea.input 의 min-block-size(3.25rem, 비레이어 규칙이라 ! 필요)를 1행 높이로 눌러 게시 버튼(h-9)과 나란히
            className={['input min-w-0 flex-1 resize-none text-sm leading-5', expanded ? '' : '![min-block-size:2.4rem]'].join(' ')}
          />
          <button type="submit" disabled={sending || !draft.trim()} className="btn-primary h-9 shrink-0 px-4 disabled:opacity-60">게시</button>
        </form>
      ) : (
        <p className="py-1 text-center text-2xs text-ink-muted">읽기 전용입니다. 글 작성은 인증 업주만 가능합니다.</p>
      )}

      {/* 안내는 큰 박스 대신 한 줄 캡션으로 축소(카피 보존) */}
      <p className="px-1 text-2xs leading-relaxed text-ink-muted">
        인증 업주 전용 라운지입니다. 작성한 글은 24시간이 지나면 자동으로 사라집니다.
      </p>

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowDeleted((v) => !v)}
            className={[
              'rounded-input px-2 py-1 text-2xs font-semibold transition-colors',
              showDeleted ? 'bg-accent-300 text-white' : 'border border-border-default text-ink-muted',
            ].join(' ')}
          >
            {showDeleted ? '삭제/만료 글 보는 중' : '삭제/만료 글 보기(운영자)'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-2xs text-ink-muted">불러오는 중…</p>
      ) : posts.length === 0 ? (
        <p className="py-10 text-center text-xs text-ink-muted">{showDeleted ? '삭제/만료된 글이 없습니다' : '아직 글이 없습니다'}</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id} className="rounded-card border border-border-subtle bg-surface-low p-3">
              <div className="flex items-center gap-2">
                <div className={['flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold', onColorInkClass(p.authorColor ?? '#5A6175')].join(' ')} style={{ background: p.authorColor ?? '#5A6175' }}>
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
