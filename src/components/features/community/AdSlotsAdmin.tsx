// src/components/features/community/AdSlotsAdmin.tsx
// 커뮤니티 광고 5칸 관리(운영자) — **게시글 승격** 방식 (2026-09-11 오너 지시).
//
// 종전에는 광고 문구·외부 링크·광고주를 여기서 직접 입력했다. 그래서 광고는 게시글과 다른 물건이
// 되었고, 링크가 없으면 손님 화면에서 아예 클릭되지 않았다(오너 리포트).
// 이제 운영자는 **이미 게시판에 있는 글**을 골라 슬롯에 올린다. 손님 화면에서는 그 글이 평소 모습
// 그대로 광고 자리에 서고, 누르면 그 글의 상세가 열린다.
//
// 미리보기는 손님 화면과 **같은 컴포넌트**(PostRow/PostCard)를 쓴다 — 관리 화면과 실제 피드가
// 다른 모양이 되면 운영자가 잘못된 판단을 한다(오너 지시).
//
// AdminTab 에서 떼어 낸 이유: AdminTab 이 이미 1400줄이라 광고 UI 가 통째로 들어가면 읽을 수 없어진다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../atoms/Icon';
import Modal from '../../atoms/Modal';
import LoadErrorCard from '../../atoms/LoadErrorCard';
import { useToast } from '../../atoms/Toast';
import { relativeTime } from '../../../lib/relativeTime';
import { getAdSlots, saveAdSlot, swapAdSlots, type AdSlot } from '../../../api/ads';
import { getAppSetting, setAppSetting, COMMUNITY_ADS_EVERY_KEY, COMMUNITY_ADS_EVERY_DEFAULT, parseAdsEvery } from '../../../api/settings';
import type { CommunityPost } from '../../../api/community';
import { PostRow, PostCard } from './PostRowCard';

export default function AdSlotsAdmin({ posts }: { posts: CommunityPost[] }) {
  const toast = useToast();
  const [slots, setSlots] = useState<AdSlot[]>([]);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);   // AD 지정 중인 슬롯
  const [preview, setPreview] = useState<'compact' | 'feed'>('feed');

  const reload = useCallback(() => {
    getAdSlots().then((r) => { setLoadErr(null); setSlots(r); }).catch((e) => { setLoadErr(e); setSlots([]); });
  }, []);
  useEffect(() => { reload(); }, [reload]);

  /**
   * 광고를 바꿨다고 알린다 — 커뮤니티 탭이 듣고 목록을 다시 받는다(2026-09-11).
   *
   * 왜 이벤트인가: 커뮤니티 탭은 최상위 탭이라 언마운트되지 않고 display 토글로 살아 있다(App.tsx).
   *   그래서 관리자 화면에서 저장해도 이미 열려 본 커뮤니티는 부팅 때 받은 광고를 계속 들고 있었고,
   *   운영자는 저장 성공 토스트를 보면서 화면은 안 바뀌는 상태를 겪었다(배너와 같은 증상).
   *   App 으로 상태를 끌어올리는 대신, 이 저장소가 이미 쓰는 `nuri:*` 커스텀 이벤트로 잇는다
   *   (새 전역 상태 0 · 두 화면이 서로를 import 하지 않는다).
   */
  const announce = () => { try { window.dispatchEvent(new CustomEvent('nuri:ads-changed')); } catch { /* 무시 */ } };

  const postById = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);
  // 같은 글이 두 활성 슬롯에 들어가지 않게 — DB 부분 유니크 인덱스와 같은 규칙을 화면에서도 먼저 막는다.
  const takenPostIds = useMemo(
    () => new Set(slots.filter((s) => s.active && s.postId).map((s) => s.postId as string)),
    [slots],
  );

  const save = async (next: AdSlot, msg: string) => {
    setBusySlot(next.slot);
    try {
      await saveAdSlot(next);
      setSlots((arr) => arr.map((x) => (x.slot === next.slot ? next : x)));
      toast.show(msg, 'success');
      announce();
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); reload(); }
    finally { setBusySlot(null); }
  };

  const move = async (slot: number, dir: -1 | 1) => {
    const sorted = [...slots].sort((a, b) => a.slot - b.slot);
    const i = sorted.findIndex((x) => x.slot === slot);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    setBusySlot(slot);
    try {
      await swapAdSlots(sorted[i], sorted[j]);
      toast.show('광고 순서를 바꿨습니다', 'success');
      announce();
    } catch (e) { toast.show(e instanceof Error ? e.message : '순서 변경 실패', 'error'); }
    // 성공이든 실패든 서버 상태로 되맞춘다 — 종전엔 부분 성공 시 UI 가 옛 순서를 계속 보여줬다.
    finally { setBusySlot(null); reload(); }
  };

  // 게시판 광고 빈도(글 N개마다 1칸) — app_settings community_ads_every
  const [every, setEvery] = useState(COMMUNITY_ADS_EVERY_DEFAULT);
  const [savingEvery, setSavingEvery] = useState(false);
  useEffect(() => { getAppSetting(COMMUNITY_ADS_EVERY_KEY).then((v) => setEvery(parseAdsEvery(v))).catch(() => {}); }, []);
  const saveEvery = async () => {
    const n = parseAdsEvery(String(every));
    setEvery(n); setSavingEvery(true);
    try {
      await setAppSetting(COMMUNITY_ADS_EVERY_KEY, String(n));
      toast.show('게시판 글 ' + n + '개마다 광고 1칸으로 저장했습니다', 'success');
      announce();
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
    finally { setSavingEvery(false); }
  };

  // 상태 배지 — 손님 화면의 노출 조건(community_ads_public RPC)과 **같은 판정**이어야 한다.
  const today = new Date().toLocaleDateString('en-CA');
  const statusOf = (s: AdSlot): { label: string; tone: 'on' | 'warn' | 'off' } => {
    if (!s.postId) {
      // 옛 문구형 광고 — 내용은 보존돼 있지만 새 방식에서는 노출 경로가 없다.
      return s.legacyTitle.trim() ? { label: '게시글 연결 필요', tone: 'warn' } : { label: '비어있음', tone: 'off' };
    }
    const post = postById.get(s.postId);
    if (post?.blinded) return { label: '블라인드된 글', tone: 'warn' };
    if (!s.active) return { label: '꺼짐', tone: 'off' };
    if (s.expiresAt && s.expiresAt < today) return { label: '만료', tone: 'off' };
    if (s.startsAt && s.startsAt > today) return { label: '예약 ' + s.startsAt, tone: 'warn' };
    return { label: '게재중', tone: 'on' };
  };

  const noop = () => {};

  return (
    <section className="rounded-aura border card-aura p-3 space-y-2">
      <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink-primary">
        <Icon name="megaphone" size={15} className="shrink-0" />커뮤니티 광고 5칸
        <span className="text-xs font-normal text-ink-muted">게시판 글을 골라 광고로 올립니다. 손님 화면에선 평소 글 모습 그대로 서고, 누르면 그 글의 상세가 열립니다.</span>
      </p>

      <div className="flex flex-wrap items-center gap-1.5 rounded-input border border-border-subtle bg-surface-high/40 p-1.5 text-xs">
        <label htmlFor="ads-every" className="text-ink-secondary">게시판 글</label>
        <input id="ads-every" type="number" inputMode="numeric" min={2} max={10} value={every}
          onChange={(e) => setEvery(Number(e.target.value) || COMMUNITY_ADS_EVERY_DEFAULT)}
          className="input w-16 text-sm tabular-nums" />
        <span className="text-ink-secondary">개마다 광고 1칸 (2~10)</span>
        <button type="button" onClick={saveEvery} disabled={savingEvery} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-60">저장</button>
        <span className="ml-auto flex items-center gap-1">
          <span className="text-ink-muted">미리보기</span>
          {(['feed', 'compact'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setPreview(v)} aria-pressed={preview === v}
              className={['min-h-8 rounded-input border px-2 text-2xs font-bold transition-colors',
                preview === v ? 'border-accent-400/50 bg-accent-300/15 text-accent-200' : 'border-border-default text-ink-muted hover:text-ink-primary'].join(' ')}>
              {v === 'feed' ? '피드' : '한 줄'}
            </button>
          ))}
        </span>
      </div>

      {loadErr != null ? <LoadErrorCard error={loadErr} what="광고 슬롯" onRetry={reload} compact /> : (
        <ul className="space-y-1.5">
          {slots.map((s, i) => {
            const st = statusOf(s);
            const post = s.postId ? postById.get(s.postId) : undefined;
            return (
              <li key={s.slot} data-ad-admin-slot={s.slot} className="space-y-1.5 rounded-input border border-border-subtle bg-surface-high/40 p-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="flex shrink-0 gap-0.5">
                    <button type="button" onClick={() => move(s.slot, -1)} disabled={i === 0 || busySlot !== null} aria-label="위로 이동"
                      className="min-h-8 min-w-8 rounded border border-border-default text-2xs text-ink-secondary transition-colors hover:border-accent-400/50 hover:text-accent-300 disabled:opacity-25">▲</button>
                    <button type="button" onClick={() => move(s.slot, 1)} disabled={i === slots.length - 1 || busySlot !== null} aria-label="아래로 이동"
                      className="min-h-8 min-w-8 rounded border border-border-default text-2xs text-ink-secondary transition-colors hover:border-accent-400/50 hover:text-accent-300 disabled:opacity-25">▼</button>
                  </span>
                  <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold',
                    st.tone === 'on' ? 'bg-accent-300 text-white'
                      : st.tone === 'warn' ? 'bg-amber-500/20 text-amber-200'
                        : 'bg-surface-float text-ink-muted'].join(' ')}>{s.slot}번 {st.label}</span>
                  <button type="button" aria-pressed={s.active} disabled={busySlot === s.slot || !s.postId}
                    onClick={() => save({ ...s, active: !s.active }, !s.active ? '광고 ' + s.slot + '번을 켰습니다' : '광고 ' + s.slot + '번을 껐습니다 (연결은 유지)')}
                    className={['min-h-8 rounded-input border px-2.5 text-xs font-bold transition-colors disabled:opacity-40',
                      s.active ? 'border-accent-400/50 bg-accent-300/15 text-accent-200' : 'border-border-default text-ink-muted hover:text-ink-primary'].join(' ')}>
                    노출 {s.active ? '켜짐' : '꺼짐'}
                  </button>
                  <button type="button" onClick={() => setPicking(s.slot)} disabled={busySlot === s.slot}
                    className="min-h-8 rounded-input border border-accent-400/40 bg-accent-300/[0.06] px-2.5 text-xs font-bold text-accent-300 disabled:opacity-50">
                    {s.postId ? '글 바꾸기' : 'AD 지정'}
                  </button>
                  {s.postId && (
                    <button type="button" disabled={busySlot === s.slot}
                      onClick={() => save({ ...s, postId: null, active: false }, '광고 ' + s.slot + '번의 글 연결을 해제했습니다')}
                      className="min-h-8 rounded-input border border-danger/40 px-2.5 text-xs font-bold text-danger-light transition-colors hover:bg-danger/10 disabled:opacity-40">해제</button>
                  )}
                </div>

                {/* 연결된 글 미리보기 — 손님 화면과 같은 컴포넌트다. onClick 은 no-op(관리 화면에서 상세를 열지 않는다). */}
                {s.postId && (post ? (
                  <div className="rounded-input border border-border-subtle bg-surface-base/60 p-1.5">
                    {preview === 'feed'
                      ? <ul><PostCard post={post} promoted adSlot={s.slot} onLike={noop} onClick={noop} /></ul>
                      : <ul className="overflow-hidden rounded-input border border-border-subtle"><PostRow post={post} promoted adSlot={s.slot} onClick={noop} /></ul>}
                  </div>
                ) : (
                  // 최근 50건 밖의 글이면 이 목록에 없다 — '없는 글' 로 단정하지 않는다.
                  <p className="text-2xs text-ink-muted">연결된 글이 최근 목록에 없습니다(오래된 글일 수 있음) · id {s.postId.slice(0, 8)}</p>
                ))}

                {s.postId && (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <label className="flex items-center gap-1.5 text-2xs text-ink-secondary">
                      <span className="shrink-0">시작</span>
                      <input type="date" value={s.startsAt ?? ''} max={s.expiresAt ?? undefined}
                        onChange={(e) => save({ ...s, startsAt: e.target.value || null }, '게재 시작일을 저장했습니다')}
                        className="input min-h-[36px] w-full min-w-0 text-sm" />
                    </label>
                    <label className="flex items-center gap-1.5 text-2xs text-ink-secondary">
                      <span className="shrink-0">종료</span>
                      <input type="date" value={s.expiresAt ?? ''} min={s.startsAt ?? undefined}
                        onChange={(e) => save({ ...s, expiresAt: e.target.value || null }, '게재 종료일을 저장했습니다')}
                        className="input min-h-[36px] w-full min-w-0 text-sm" />
                    </label>
                  </div>
                )}

                {!s.postId && s.legacyTitle.trim() && (
                  <p className="text-2xs text-amber-200">
                    옛 문구형 광고: “{s.legacyTitle}” — 새 방식에서는 노출되지 않습니다. 같은 내용의 글을 게시판에 올린 뒤 <b>AD 지정</b>으로 연결해 주세요.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-ink-muted">가격 운영 예: 3일 10만 / 7일 20만. 시작·종료일만 맞춰 두면 그날 자동으로 오르내립니다.</p>

      {picking !== null && (
        <AdPostPicker
          posts={posts}
          takenPostIds={takenPostIds}
          onClose={() => setPicking(null)}
          onPick={(post) => {
            const s = slots.find((x) => x.slot === picking);
            if (!s) return;
            setPicking(null);
            void save({ ...s, postId: post.id, active: true }, (post.title || '글') + ' 을 광고 ' + s.slot + '번에 올렸습니다');
          }}
        />
      )}
    </section>
  );
}

// ── AD 지정 — 최근 글에서 고르기 ────────────────────────────────────────────
// 광고 전용 글을 새로 만들지 않는다(오너 지시). 이미 있는 글만 고른다.
function AdPostPicker({ posts, takenPostIds, onClose, onPick }: {
  posts: CommunityPost[];
  takenPostIds: Set<string>;
  onClose: () => void;
  onPick: (p: CommunityPost) => void;
}) {
  const [q, setQ] = useState('');
  const kw = q.trim().toLowerCase();
  const list = posts
    .filter((p) => !kw
      || (p.title ?? '').toLowerCase().includes(kw)
      || p.userName.toLowerCase().includes(kw)
      || p.id.toLowerCase().startsWith(kw))
    .slice(0, 40);

  /** 광고로 쓸 수 없는 이유 — 목록에서 **빼지 않고** 적어서 비활성화한다.
   *  안 보이면 운영자는 '왜 없지?' 로 시간을 버린다. */
  const blockOf = (p: CommunityPost): string | null => {
    if (p.blinded) return '블라인드된 글';
    if (!((p.title ?? '').trim() || p.content.trim())) return '제목·본문이 비어 있음';
    if (takenPostIds.has(p.id)) return '이미 다른 슬롯에 게재 중';
    return null;
  };

  return (
    <Modal open onClose={onClose} title="AD 로 올릴 글 고르기" variant="sheet" maxWidth="md">
      <div className="space-y-2 px-4 py-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="글 검색"
          placeholder="제목 · 작성자 · 게시글 ID" className="input min-h-[44px] w-full text-sm" />
        {list.length === 0 ? (
          <p className="py-6 text-center text-2xs text-ink-muted">{posts.length === 0 ? '최근 게시글이 없습니다.' : '검색 결과가 없습니다.'}</p>
        ) : (
          <ul className="space-y-1">
            {list.map((p) => {
              const blocked = blockOf(p);
              return (
                <li key={p.id}>
                  <button type="button" disabled={!!blocked} onClick={() => onPick(p)}
                    className="flex min-h-[44px] w-full items-center gap-2 rounded-input border border-border-default bg-surface-high/40 px-2.5 py-1.5 text-left transition-colors hover:border-accent-400/50 disabled:opacity-40 disabled:hover:border-border-default">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink-primary">{p.title || p.content.slice(0, 40)}</span>
                      <span className="block truncate text-2xs text-ink-muted">{p.userName} · {relativeTime(p.createdAt)} · 조회 {p.viewCount ?? 0}</span>
                    </span>
                    {blocked
                      ? <span className="shrink-0 rounded-badge bg-surface-float px-1.5 py-0.5 text-2xs text-ink-muted">{blocked}</span>
                      : <span className="shrink-0 text-2xs font-bold text-accent-300">선택</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
