import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import {
  getDealerPosts, createDealerPost, deleteDealerPost,
  createDealerApplication, getDealerApplications,
  type DealerPost, type DealerPostKind, type DealerApplication,
} from '../../api/community';
import Modal from '../atoms/Modal';
import { relativeTime } from './MarketplaceTab';
import ICMCalculator from './ICMCalculator';
import NoticeDetailModal from './NoticeDetailModal';
import { getNotices, type MarketplaceNotice } from '../../api/marketplace';

const KIND_LABEL: Record<DealerPostKind, string> = { hiring: '구인', seeking: '구직', general: '일반' };
const KIND_STYLE: Record<DealerPostKind, string> = {
  hiring:  'bg-gold-300/15 text-gold-300 border-gold-400/40',
  seeking: 'bg-sky-500/15 text-sky-300 border-sky-400/40',
  general: 'bg-surface-float text-ink-secondary border-border-default',
};

/** 딜러 게시판 — 구인/구직/일반. 누구나 열람, 로그인 시 작성/지원. */
export default function DealerCommunity() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const canPost = !!user;

  const [posts, setPosts]   = useState<DealerPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick]     = useState(0);
  const [notices, setNotices] = useState<MarketplaceNotice[]>([]);
  const [openNotice, setOpenNotice] = useState<MarketplaceNotice | null>(null);
  const [openPost, setOpenPost] = useState<DealerPost | null>(null);

  useEffect(() => {
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
  const [wage, setWage]       = useState('');
  const [workHours, setWorkHours] = useState('');
  const [workPeriod, setWorkPeriod] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setLoading(true);
    getDealerPosts().then(setPosts).catch(() => {}).finally(() => setLoading(false));
  }, [tick]);
  const reload = () => setTick((t) => t + 1);

  const resetForm = () => {
    setKind('hiring'); setRegion(''); setVenue(''); setWage(''); setWorkHours(''); setWorkPeriod(''); setContent('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) { toast.show('내용을 입력해 주세요', 'error'); return; }
    if (kind === 'hiring' && !region.trim()) { toast.show('구인은 지역을 입력해야 합니다', 'error'); return; }
    setSending(true);
    try {
      await createDealerPost({
        kind, content,
        region: kind === 'hiring' ? region : undefined,
        venueName: kind === 'hiring' ? venueName : undefined,
        wage: kind === 'hiring' ? wage : undefined,
        workHours: kind === 'hiring' ? workHours : undefined,
        workPeriod: kind === 'hiring' ? workPeriod : undefined,
      });
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

      <div className="rounded-input border border-danger/40 bg-danger/[0.08] px-3 py-2 text-2xs leading-relaxed text-danger-light">
        불법 사행성 영업, 환전, 도박 알선 등 <b>불법적인 일의 구인·구직은 강제 탈퇴 사유</b>가 되며 관련 법령에 따라 처벌받을 수 있습니다.
      </div>

      {notices.length > 0 && (
        <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent overflow-hidden">
          <header className="px-3 py-2 border-b border-gold-400/20">
            <h3 className="text-xs font-bold text-gold-300">공지사항</h3>
          </header>
          <ul>
            {notices.slice(0, 5).map((n) => (
              <li key={n.id} className="border-b border-border-subtle last:border-b-0">
                <button type="button" onClick={() => setOpenNotice(n)} className="w-full text-left px-3 py-2 hover:bg-gold-300/[0.06] transition-colors">
                  <p className="text-xs font-semibold text-ink-primary">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-2xs text-ink-muted line-clamp-2 leading-snug">{n.body}</p>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ICM 계산기 */}
      <div>
        <button type="button" onClick={() => setShowIcm((v) => !v)}
          className="w-full flex items-center justify-between rounded-input border border-border-default bg-surface-high px-3 py-2 text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-colors">
          <span className="inline-flex items-center gap-1.5"><span className="text-gold-300">ICM</span> 계산기</span>
          <span className="text-2xs text-ink-muted">{showIcm ? '닫기' : '열기'}</span>
        </button>
        {showIcm && <div className="mt-2"><ICMCalculator /></div>}
      </div>

      {/* 글쓰기 토글 */}
      {canPost ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn-primary px-4 text-xs">
            {open ? '닫기' : '+ 글쓰기 (구인/구직/일반)'}
          </button>
        </div>
      ) : (
        <p className="text-center text-2xs text-ink-muted">로그인하면 글을 작성할 수 있습니다</p>
      )}

      {canPost && open && (
        <form onSubmit={submit} className="space-y-2.5 rounded-card border border-border-default bg-surface-low p-3 animate-slide-up">
          <div className="inline-flex items-center gap-0.5 rounded-input bg-surface-high p-0.5 border border-border-default">
            {(['hiring', 'seeking', 'general'] as DealerPostKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={['inline-flex items-center h-7 px-4 rounded-[6px] text-xs font-bold transition-colors',
                  kind === k ? 'bg-gold-300 text-ink-inverse' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          {/* 구인일 때만: 지역/홀덤펍 + 시급/근무시간/필요기간 */}
          {kind === 'hiring' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-2xs font-medium text-ink-secondary mb-1">지역 <span className="text-danger">*</span></span>
                  <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} maxLength={20} placeholder="예: 강남, 부산" className="input w-full text-sm" />
                </label>
                <label className="block">
                  <span className="block text-2xs font-medium text-ink-secondary mb-1">홀덤펍 이름 (선택)</span>
                  <input type="text" value={venueName} onChange={(e) => setVenue(e.target.value)} maxLength={30} placeholder="예: 강남 로얄 홀덤" className="input w-full text-sm" />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="block text-2xs font-medium text-ink-secondary mb-1">시급</span>
                  <input type="text" value={wage} onChange={(e) => setWage(e.target.value)} maxLength={20} placeholder="예: 20,000원" className="input w-full text-sm" />
                </label>
                <label className="block">
                  <span className="block text-2xs font-medium text-ink-secondary mb-1">근무시간</span>
                  <input type="text" value={workHours} onChange={(e) => setWorkHours(e.target.value)} maxLength={30} placeholder="예: 19:00~02:00" className="input w-full text-sm" />
                </label>
                <label className="block">
                  <span className="block text-2xs font-medium text-ink-secondary mb-1">필요 기간</span>
                  <input type="text" value={workPeriod} onChange={(e) => setWorkPeriod(e.target.value)} maxLength={30} placeholder="예: 3개월, 상시" className="input w-full text-sm" />
                </label>
              </div>
            </div>
          )}

          <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} rows={3}
            placeholder={kind === 'hiring' ? '근무 조건·우대사항·문의 방법 등을 적어주세요' : kind === 'seeking' ? '경력·가능 시간·희망 지역 등을 적어주세요' : '자유롭게 이야기해보세요'}
            className="input w-full resize-none text-sm" />
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
            <li key={p.id} className="rounded-card border border-border-subtle bg-surface-low overflow-hidden">
              {/* 본문 클릭 → 상세/지원 */}
              <button type="button" onClick={() => setOpenPost(p)} className="w-full text-left p-3 hover:bg-surface-high/40 transition-colors">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={['inline-flex items-center rounded-badge border px-1.5 py-0.5 text-2xs font-bold leading-none', KIND_STYLE[p.kind]].join(' ')}>
                    {KIND_LABEL[p.kind]}
                  </span>
                  {p.kind === 'hiring' && p.region && <span className="text-2xs font-semibold text-ink-secondary">{p.region}</span>}
                  {p.kind === 'hiring' && p.venueName && <span className="text-2xs text-ink-muted">· {p.venueName}</span>}
                  <span className="ml-auto text-2xs text-ink-muted">{relativeTime(p.createdAt)}</span>
                </div>
                {/* 구인 핵심 조건 칩 */}
                {p.kind === 'hiring' && (p.wage || p.workHours || p.workPeriod) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.wage && <span className="inline-flex items-center gap-1 rounded-badge bg-gold-300/10 border border-gold-400/30 px-1.5 py-0.5 text-2xs text-gold-300">시급 {p.wage}</span>}
                    {p.workHours && <span className="inline-flex items-center gap-1 rounded-badge bg-surface-high border border-border-default px-1.5 py-0.5 text-2xs text-ink-secondary">{p.workHours}</span>}
                    {p.workPeriod && <span className="inline-flex items-center gap-1 rounded-badge bg-surface-high border border-border-default px-1.5 py-0.5 text-2xs text-ink-secondary">{p.workPeriod}</span>}
                  </div>
                )}
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-ink-primary line-clamp-3">{p.content}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: p.authorColor ?? '#5A6175' }}>
                    {p.authorName[0]}
                  </div>
                  <span className="text-2xs text-ink-muted">{p.authorName}</span>
                  {(p.kind === 'hiring' || p.kind === 'seeking') && (
                    <span className="ml-auto text-2xs font-semibold text-gold-300">자세히 · 지원 →</span>
                  )}
                </div>
              </button>
              {(isAdmin || p.authorId === user?.id) && (
                <div className="flex justify-end border-t border-border-subtle px-3 py-1">
                  <button type="button" onClick={() => remove(p)} className="text-2xs text-ink-muted transition-colors hover:text-danger-light">삭제</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <NoticeDetailModal notice={openNotice} open={openNotice !== null} onClose={() => setOpenNotice(null)} />

      {/* 글 상세 + 지원 */}
      <Modal open={!!openPost} onClose={() => setOpenPost(null)} title={openPost ? `${KIND_LABEL[openPost.kind]} 상세` : ''} maxWidth="md">
        {openPost && (
          <DealerPostBody
            post={openPost}
            isAdmin={isAdmin}
            userId={user?.id}
            userName={user?.nickname ?? user?.name ?? ''}
          />
        )}
      </Modal>
    </div>
  );
}

// ── 글 상세 본문 + 지원 양식 + 받은 지원서 ────────────────────────────────────
function DealerPostBody({ post, isAdmin, userId, userName }: {
  post: DealerPost; isAdmin: boolean; userId?: string; userName: string;
}) {
  const toast = useToast();
  const isAuthor = !!userId && userId === post.authorId;
  const canSeeApps = isAdmin || isAuthor;
  const canApply = !!userId && !isAuthor && (post.kind === 'hiring' || post.kind === 'seeking');

  const [apps, setApps] = useState<DealerApplication[]>([]);
  const [name, setName] = useState(userName);
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [applied, setApplied] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (canSeeApps) getDealerApplications(post.id).then(setApps).catch(() => {});
  }, [post.id, canSeeApps]);

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.show('이름을 입력해 주세요', 'error'); return; }
    if (!phone.trim()) { toast.show('연락처(번호)는 필수입니다', 'error'); return; }
    setSending(true);
    try {
      await createDealerApplication(post.id, { name, phone, message: msg });
      setApplied(true); setPhone(''); setMsg('');
      toast.show('지원이 접수되었습니다', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '지원에 실패했습니다', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={['inline-flex items-center rounded-badge border px-1.5 py-0.5 text-2xs font-bold leading-none', KIND_STYLE[post.kind]].join(' ')}>{KIND_LABEL[post.kind]}</span>
        {post.region && <span className="text-2xs font-semibold text-ink-secondary">{post.region}</span>}
        {post.venueName && <span className="text-2xs text-ink-muted">· {post.venueName}</span>}
        <span className="ml-auto text-2xs text-ink-muted">{relativeTime(post.createdAt)}</span>
      </div>

      {/* 구인 조건 */}
      {post.kind === 'hiring' && (post.wage || post.workHours || post.workPeriod) && (
        <div className="grid grid-cols-3 gap-2">
          <ConditionCell label="시급" value={post.wage} highlight />
          <ConditionCell label="근무시간" value={post.workHours} />
          <ConditionCell label="필요 기간" value={post.workPeriod} />
        </div>
      )}

      {/* 내용 */}
      <p className="whitespace-pre-wrap break-words text-sm text-ink-primary leading-relaxed">{post.content}</p>

      {/* 작성자 */}
      <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white" style={{ background: post.authorColor ?? '#5A6175' }}>{post.authorName[0]}</div>
        <span className="text-xs text-ink-secondary">{post.authorName}</span>
      </div>

      {/* 지원 양식 */}
      {!userId ? (
        <p className="rounded-input bg-surface-high px-3 py-2 text-center text-2xs text-ink-muted">로그인 후 지원할 수 있습니다</p>
      ) : isAuthor ? null : applied ? (
        <p className="rounded-input bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-center text-xs font-semibold text-emerald-400">지원이 접수되었습니다 ✓</p>
      ) : canApply ? (
        <form onSubmit={apply} className="space-y-2 rounded-card border border-gold-400/30 bg-gold-300/[0.04] p-3">
          <p className="text-xs font-bold text-gold-300">지원하기</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-2xs font-medium text-ink-secondary mb-1">이름 <span className="text-danger">*</span></span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="실명" className="input w-full text-sm" />
            </label>
            <label className="block">
              <span className="block text-2xs font-medium text-ink-secondary mb-1">연락처 <span className="text-danger">*</span></span>
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="010-0000-0000" className="input w-full text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-2xs font-medium text-ink-secondary mb-1">자기소개 · 경력 (선택)</span>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1000} rows={3} placeholder="경력, 가능 시간, 희망 조건 등을 적어주세요" className="input w-full resize-none text-sm" />
          </label>
          <p className="text-2xs text-ink-muted">지원 정보(이름·연락처)는 이 글 작성자와 운영자에게만 전달됩니다.</p>
          <button type="submit" disabled={sending} className="btn-primary w-full text-sm disabled:opacity-60">{sending ? '지원 중…' : '지원서 제출'}</button>
        </form>
      ) : null}

      {/* 받은 지원서 (작성자/운영자) */}
      {canSeeApps && (
        <section className="space-y-1.5">
          <p className="text-xs font-bold text-ink-secondary">받은 지원서 ({apps.length})</p>
          {apps.length === 0 ? (
            <p className="rounded-input bg-surface-high px-3 py-3 text-center text-2xs text-ink-muted">아직 지원자가 없습니다</p>
          ) : (
            <ul className="space-y-1.5">
              {apps.map((a) => (
                <li key={a.id} className="rounded-input border border-border-default bg-surface-high p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink-primary">{a.applicantName}</span>
                    <a href={`tel:${a.phone}`} className="text-xs font-bold text-gold-300 tabular-nums">{a.phone}</a>
                    <span className="ml-auto text-2xs text-ink-muted">{relativeTime(a.createdAt)}</span>
                  </div>
                  {a.message && <p className="mt-1 whitespace-pre-wrap break-words text-2xs text-ink-secondary leading-snug">{a.message}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ConditionCell({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <div className={['rounded-input border p-2 text-center', highlight ? 'border-gold-400/40 bg-gold-300/[0.06]' : 'border-border-default bg-surface-high'].join(' ')}>
      <p className="text-[10px] text-ink-muted">{label}</p>
      <p className={['text-xs font-bold mt-0.5 break-words', highlight ? 'text-gold-300' : 'text-ink-primary'].join(' ')}>{value || '-'}</p>
    </div>
  );
}
