import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import {
  getDealerPosts, createDealerPost, deleteDealerPost,
  type DealerPost, type DealerPostKind,
} from '../../api/community';
import { relativeTime } from './MarketplaceTab';
import ICMCalculator from './ICMCalculator';
import { getNotices, type MarketplaceNotice } from '../../api/marketplace';

const KIND_LABEL: Record<DealerPostKind, string> = { hiring: '구인', seeking: '구직', general: '일반' };
const KIND_STYLE: Record<DealerPostKind, string> = {
  hiring:  'bg-gold-300/15 text-gold-300 border-gold-400/40',
  seeking: 'bg-sky-500/15 text-sky-300 border-sky-400/40',
  general: 'bg-surface-float text-ink-secondary border-border-default',
};

/** 딜러 게시판 — 구인/구직/일반. 누구나 열람, 로그인 시 작성. */
export default function DealerCommunity() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const canPost = !!user;

  const [posts, setPosts]   = useState<DealerPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick]     = useState(0);
  const [notices, setNotices] = useState<MarketplaceNotice[]>([]);

  useEffect(() => {
    // 딜러 게시판 전용 공지만 노출(전체 공지는 일정탐색 등 다른 메뉴에서 표시)
    getNotices()
      .then((all) => setNotices(all.filter((n) => n.board === 'dealer')))
      .catch(() => {});
  }, []);

  // 작성 폼
  const [open, setOpen]       = useState(false);
  const [showIcm, setShowIcm] = useState(false);
  const [kind, setKind]       = useState<DealerPostKind>('hiring');
  const [region, setRegion]   = useState('');
  const [venueName, setVenue] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoading(true);
    getDealerPosts()
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tick]);
  const reload = () => setTick((t) => t + 1);

  const resetForm = () => { setKind('hiring'); setRegion(''); setVenue(''); setContent(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) { toast.show('내용을 입력해 주세요', 'error'); return; }
    if (kind === 'hiring' && !region.trim()) { toast.show('구인은 지역을 입력해야 합니다', 'error'); return; }
    setSending(true);
    try {
      await createDealerPost({ kind, content, region: kind === 'hiring' ? region : undefined, venueName: kind === 'hiring' ? venueName : undefined });
      resetForm();
      setOpen(false);
      toast.show('등록되었습니다', 'success');
      reload();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '등록에 실패했습니다', 'error');
    } finally {
      setSending(false);
    }
  };

  const remove = async (p: DealerPost) => {
    if (!confirm('이 글을 삭제하시겠습니까?')) return;
    try {
      await deleteDealerPost(p.id);
      toast.show('삭제되었습니다', 'info');
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '삭제에 실패했습니다', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-input border border-sky-400/30 bg-sky-500/[0.06] px-3 py-2 text-2xs leading-relaxed text-sky-300">
        딜러 게시판입니다. 딜러 구인·구직과 자유로운 정보 공유에 활용하세요. (누구나 열람 가능)
      </div>

      {/* 불법 행위 경고 — 강제 탈퇴 사유 명시 */}
      <div className="rounded-input border border-danger/40 bg-danger/[0.08] px-3 py-2 text-2xs leading-relaxed text-danger-light">
        불법 사행성 영업, 환전, 도박 알선 등 <b>불법적인 일의 구인·구직은 강제 탈퇴 사유</b>가 되며 관련 법령에 따라 처벌받을 수 있습니다.
      </div>

      {/* 딜러 게시판 공지 */}
      {notices.length > 0 && (
        <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent overflow-hidden">
          <header className="px-3 py-2 border-b border-gold-400/20">
            <h3 className="text-xs font-bold text-gold-300">공지사항</h3>
          </header>
          <ul>
            {notices.slice(0, 5).map((n) => (
              <li key={n.id} className="px-3 py-2 border-b border-border-subtle last:border-b-0">
                <p className="text-xs font-semibold text-ink-primary">{n.title}</p>
                {n.body && <p className="mt-0.5 text-2xs text-ink-muted line-clamp-2 leading-snug">{n.body}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ICM 계산기 (딜러 실무 도구) */}
      <div>
        <button
          type="button"
          onClick={() => setShowIcm((v) => !v)}
          className="w-full flex items-center justify-between rounded-input border border-border-default bg-surface-high px-3 py-2 text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-colors"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="text-gold-300">ICM</span> 계산기
          </span>
          <span className="text-2xs text-ink-muted">{showIcm ? '닫기' : '열기'}</span>
        </button>
        {showIcm && <div className="mt-2"><ICMCalculator /></div>}
      </div>

      {/* 글쓰기 토글 */}
      {canPost ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="btn-primary px-4 text-xs"
          >
            {open ? '닫기' : '+ 글쓰기 (구인/구직/일반)'}
          </button>
        </div>
      ) : (
        <p className="text-center text-2xs text-ink-muted">로그인하면 글을 작성할 수 있습니다</p>
      )}

      {canPost && open && (
        <form onSubmit={submit} className="space-y-2.5 rounded-card border border-border-default bg-surface-low p-3 animate-slide-up">
          {/* 구인/구직/일반 선택 */}
          <div className="inline-flex items-center gap-0.5 rounded-input bg-surface-high p-0.5 border border-border-default">
            {(['hiring', 'seeking', 'general'] as DealerPostKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={[
                  'inline-flex items-center h-7 px-4 rounded-[6px] text-xs font-bold transition-colors',
                  kind === k ? 'bg-gold-300 text-ink-inverse' : 'text-ink-muted hover:text-ink-secondary',
                ].join(' ')}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          {/* 구인일 때만: 지역(필수) + 홀덤펍 이름(선택) */}
          {kind === 'hiring' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-2xs font-medium text-ink-secondary mb-1">지역 <span className="text-danger">*</span></span>
                <input
                  type="text" value={region} onChange={(e) => setRegion(e.target.value)}
                  maxLength={20} placeholder="예: 강남, 부산"
                  className="input w-full text-sm"
                />
              </label>
              <label className="block">
                <span className="block text-2xs font-medium text-ink-secondary mb-1">홀덤펍 이름 (선택)</span>
                <input
                  type="text" value={venueName} onChange={(e) => setVenue(e.target.value)}
                  maxLength={30} placeholder="예: 강남 로얄 홀덤"
                  className="input w-full text-sm"
                />
              </label>
            </div>
          )}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={kind === 'hiring' ? '근무 조건·시간·문의 방법 등을 적어주세요' : kind === 'seeking' ? '경력·가능 시간·희망 지역 등을 적어주세요' : '자유롭게 이야기해보세요'}
            className="input w-full resize-none text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setOpen(false); resetForm(); }} className="btn-ghost text-xs px-3">취소</button>
            <button type="submit" disabled={sending || !content.trim()} className="btn-primary px-4 disabled:opacity-60">등록</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="py-8 text-center text-2xs text-ink-muted">불러오는 중...</p>
      ) : posts.length === 0 ? (
        <p className="py-10 text-center text-xs text-ink-muted">아직 글이 없습니다. 첫 구인·구직 글을 남겨보세요.</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id} className="rounded-card border border-border-subtle bg-surface-low p-3">
              <div className="flex items-center gap-1.5">
                <span className={['inline-flex items-center rounded-badge border px-1.5 py-0.5 text-2xs font-bold leading-none', KIND_STYLE[p.kind]].join(' ')}>
                  {KIND_LABEL[p.kind]}
                </span>
                {p.kind === 'hiring' && p.region && (
                  <span className="text-2xs font-semibold text-ink-secondary">{p.region}</span>
                )}
                {p.kind === 'hiring' && p.venueName && (
                  <span className="text-2xs text-ink-muted">· {p.venueName}</span>
                )}
                <span className="ml-auto text-2xs text-ink-muted">{relativeTime(p.createdAt)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-ink-primary">{p.content}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: p.authorColor ?? '#5A6175' }}>
                  {p.authorName[0]}
                </div>
                <span className="text-2xs text-ink-muted">{p.authorName}</span>
                {(isAdmin || p.authorId === user?.id) && (
                  <button type="button" onClick={() => remove(p)} className="ml-auto text-2xs text-ink-muted transition-colors hover:text-danger-light">삭제</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
