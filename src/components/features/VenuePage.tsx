import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { Map, MapMarker, useKakaoLoader } from 'react-kakao-maps-sdk';
import CommentThread from './CommentThread';
import RotiArenaLogo from '../atoms/RotiArenaLogo';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import type { Venue, Comment } from '../../api/community';
import type { Schedule } from '../../api/schedules';
import type { MarketplaceNotice } from '../../api/marketplace';
import { useAuth } from '../../contexts/AuthContext';
import { followVenue, unfollowVenue, getMyFollowedVenueIds, updateVenueAddress, updateVenueKakao } from '../../api/community';
import { getVenueNotices, createVenueNotice, deleteVenueNotice, type VenueNotice } from '../../api/community';
import { getVenueMessages, sendVenueMessage, deleteVenueMessage, subscribeVenueMessages, type VenueMessage } from '../../api/community';
import Avatar from '../atoms/Avatar';
import { relativeTime } from './MarketplaceTab';
import { promptLogin } from '../../lib/requireLogin';
import {
  getVenueRankings, getVenueRankingTotals, subscribeRankings, maskRealName,
  getVenuePageConfig, getScoreEntries, getVenuePlayerCounts,
  boardLabel, boardDesc, boardUnit, isCustomBoard, customKeyOf, boardPeriodStart,
  type RankingEntry, type RankingTotal, type VenuePageConfig, type RankBoardId, type ScoreEntry, type PlayerCounts,
} from '../../api/rankings';
import { uploadVenueImages } from '../../lib/storage';
import { useBackClose } from '../../lib/backstack';

interface VenuePageProps {
  venue: Venue | null;
  open: boolean;
  onClose: () => void;
  schedules: Schedule[];
  comments: Comment[];
  /** 포스터 탭의 '금일 포스터'에 함께 노출할 공지글 */
  notices?: MarketplaceNotice[];
  onSubmitComment: (venueId: string, content: string, parentId?: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onUpdateDescription?: (venueId: string, description: string) => void;
  onUpdateImage?: (venueId: string, dataUrl: string) => void;
  onUpdateImages?: (venueId: string, urls: string[]) => void;
  /** 포스터/진행예정 클릭 시 일정 상세 열기 */
  onSelectSchedule?: (s: Schedule) => void;
}

type Tab = 'about' | 'ranking' | 'posters' | 'schedules' | 'community';
const TABS: Tab[] = ['about', 'ranking', 'posters', 'schedules', 'community'];

const TAB_LABEL: Record<Tab, string> = {
  about:     '매장 소개',
  ranking:   '순위',
  posters:   '포스터',
  schedules: '진행 예정',
  community: '커뮤니티',
};

/**
 * VenuePage — 풀스크린 매장 홈페이지
 *
 * 모달 대신 페이지 전환 방식:
 * - 헤더 sticky (back arrow + 매장명)
 * - 히어로 영역 (배경 이미지 업로드 가능)
 * - 탭바 sticky (고정 grid-cols-3)
 * - 탭 컨텐츠는 일반 스크롤
 * - 브라우저 뒤로가기 지원 (popstate)
 */
export default function VenuePage({
  venue, open, onClose, schedules, comments, notices = [],
  onSubmitComment, onDeleteComment, onUpdateDescription, onUpdateImage, onUpdateImages,
  onSelectSchedule,
}: VenuePageProps) {
  const [tab, setTab] = useState<Tab>('about');
  const { user, isApprovedOwner } = useAuth();
  const toast = useToast();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [kakaoOverride, setKakaoOverride] = useState<string | null>(null);
  useEffect(() => { setKakaoOverride(null); }, [venue?.id]);

  // 업주가 설정한 탭 순서(page_config.tabOrder) — 미설정 시 기본 순서
  const [tabOrder, setTabOrder] = useState<Tab[] | null>(null);
  useEffect(() => {
    setTabOrder(null);
    if (!venue?.id) return;
    let alive = true;
    getVenuePageConfig(venue.id).then((c) => {
      if (!alive || !c?.tabOrder?.length) return;
      const valid = c.tabOrder.filter((t): t is Tab => (TABS as string[]).includes(t));
      if (valid.length) setTabOrder([...valid, ...TABS.filter((t) => !valid.includes(t))]);
    }).catch(() => {});
    return () => { alive = false; };
  }, [venue?.id]);
  const orderedTabs = tabOrder ?? TABS;

  // 바디 스크롤 잠금 (페이지가 열려있는 동안)
  useEffect(() => {
    if (!open || !venue) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open, venue?.id]);

  // 브라우저/모바일 뒤로가기 → 매장 페이지만 닫기 (중앙 back-stack 매니저가 중첩/충돌 처리)
  useBackClose(!!open && !!venue, onClose);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 승인(approved)된 포스터만 매장 페이지에 노출 — 미승인은 「내 포스터」에서만 관리.
  const venueSchedules = useMemo(
    () => (venue ? schedules.filter((s) => s.venueId === venue.id && s.approved) : []),
    [venue, schedules],
  );
  const venueComments = useMemo(
    () => (venue ? comments.filter((c) => c.venueId === venue.id) : []),
    [venue, comments],
  );
  // 금일 포스터 — 오늘 날짜(YYYY-MM-DD)와 일치하는 매장 포스터
  const todayPosters = useMemo(() => {
    const todayIso = new Date().toLocaleDateString('en-CA');
    return venueSchedules.filter((s) => s.date === todayIso);
  }, [venueSchedules]);

  if (!open || !venue) return null;

  const isMyVenue = isApprovedOwner && user?.venueId === venue.id;
  const isRoti    = venue.id === 'v_roti';
  const kakao     = (kakaoOverride ?? venue.kakaoUrl ?? '').trim();
  const editKakao = async () => {
    const url = window.prompt('카카오톡 오픈채팅/단톡방 링크 (비우면 삭제)', kakao);
    if (url === null) return;
    try { await updateVenueKakao(venue.id, url); setKakaoOverride(url.trim()); toast.show(url.trim() ? '카카오톡 링크를 저장했습니다' : '링크를 삭제했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
  };
  const shareVenue = async () => {
    // 단축 + 카톡 미리보기: /s/<8자리> → 봇은 매장 OG 카드, 사람은 /?v= 앱으로 리다이렉트.
    const url = `${location.origin}/s/${venue.id.slice(0, 8)}`;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((navigator as any).share) await (navigator as any).share({ title: venue.name, text: `${venue.name} · 홀덤펍`, url });
      else { await navigator.clipboard.writeText(url); toast.show('매장 링크를 복사했습니다', 'success'); }
    } catch { /* 사용자 취소 */ }
  };

  return (
    <div
      role="dialog"
      aria-label={`${venue.name} 매장 페이지`}
      className="fixed inset-0 z-40 bg-surface-base flex flex-col animate-slide-up"
      style={{ animationDuration: '0.25s' }}
    >
      {/* ── 최상단: 뒤로가기 헤더 ──────────────────────────────────────── */}
      <header className="shrink-0 sticky top-0 z-30 flex items-center h-header-h px-page-x bg-surface-base border-b border-border-subtle">
        <button
          type="button"
          onClick={onClose}
          aria-label="뒤로 가기"
          className="w-9 h-9 -ml-2 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors"
        >
          <Icon name="back" size={22} />
        </button>
        <h1 className="ml-1 text-sm font-semibold text-ink-primary truncate flex-1">
          {venue.name}
        </h1>
        {isMyVenue && (
          <span className="ml-2 shrink-0 inline-block px-1.5 py-0.5 text-2xs font-bold rounded-badge bg-gold-300 text-ink-inverse">
            내 매장
          </span>
        )}
      </header>

      {/* ── 스크롤 컨테이너 ────────────────────────────────────────────── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {/* PC 에서 전체 폭으로 퍼져 공백이 과해지지 않도록 중앙 컬럼(최대 768px)으로 제한 */}
        <div className="mx-auto w-full max-w-3xl">

        {/* 히어로 (배경 이미지) */}
        <HeroSection
          venue={venue}
          editable={isMyVenue}
          onUpdateImage={onUpdateImage}
          onUpdateImages={onUpdateImages}
          showRotiMark={isRoti}
        />

        {/* 매장 기본 정보 (히어로 밑) */}
        <div className="px-page-x py-4 border-b border-border-subtle">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="inline-block px-1.5 py-0.5 text-2xs font-semibold rounded-badge bg-surface-high text-ink-secondary">
                  {venue.region}
                </span>
                {venue.isPaidAd && (
                  <span className="inline-block px-1.5 py-0.5 text-2xs font-bold rounded-badge bg-gold-300 text-ink-inverse">
                    프리미엄
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-ink-primary">{venue.name}</h2>
              <p className="text-xs text-ink-muted mt-1">{venue.address}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {kakao && (
                  <a href={kakao} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#FEE500] text-[#3A1D1D] text-xs font-bold hover:brightness-95 transition-all active:scale-95">
                    <span aria-hidden>💬</span> 카카오톡 오픈채팅
                  </a>
                )}
                {isMyVenue && (
                  <button type="button" onClick={editKakao} className="text-2xs text-ink-muted hover:text-gold-300">{kakao ? '카톡링크 수정' : '+ 카톡링크 등록'}</button>
                )}
              </div>
            </div>
            {/* 팔로우 + 링크공유 한 묶음 */}
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <FollowButton venueId={venue.id} followerCount={venue.followerCount} />
              <button type="button" onClick={shareVenue} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-input bg-surface-high border border-border-default text-2xs font-semibold text-ink-secondary hover:text-gold-300 transition-colors">
                <span aria-hidden>🔗</span> 링크 공유
              </button>
            </div>
          </div>
        </div>

        {/* ── Sticky 탭바 ─────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-surface-base border-b border-border-subtle">
          <div className="flex overflow-x-auto scrollbar-none [-webkit-overflow-scrolling:touch]">
            {orderedTabs.map((t) => {
              const count = t === 'posters'   ? venueSchedules.length
                          : t === 'schedules' ? venueSchedules.length
                          : t === 'community' ? venueComments.length
                          : 0;
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  aria-selected={active}
                  role="tab"
                  className={[
                    'flex-1 shrink-0 whitespace-nowrap px-2 py-3 text-sm font-medium transition-colors text-center relative',
                    'border-b-2 -mb-px',
                    active
                      ? 'border-gold-300 text-gold-300'
                      : 'border-transparent text-ink-muted hover:text-ink-secondary',
                  ].join(' ')}
                >
                  {TAB_LABEL[t]}
                  {t !== 'about' && t !== 'ranking' && (
                    <span className="ml-1 text-2xs text-ink-muted tabular-nums">
                      ({count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 탭 컨텐츠 ──────────────────────────────────────────── */}
        <div className="px-page-x py-4 min-h-[50vh]">
          {tab === 'about' && (
            <AboutPanel
              venue={venue}
              editable={isMyVenue}
              onUpdateDescription={onUpdateDescription}
            />
          )}
          {tab === 'ranking' && <VenueRankingPanel venueId={venue.id} />}
          {tab === 'posters' && (
            <PostersPanel
              todayPosters={todayPosters}
              allPosters={venueSchedules}
              notices={notices}
              onSelect={onSelectSchedule}
            />
          )}
          {tab === 'schedules' && <SchedulesPanel schedules={venueSchedules} onSelect={onSelectSchedule} />}
          {tab === 'community' && (
            <div className="space-y-3">
              <VenueNoticeBoard venueId={venue.id} canManage={isMyVenue || user?.role === 'admin'} />
              {/* 모든 커뮤니티 공통 구성(그룹과 동일): 실시간 채팅 | 게시판 */}
              <VenueCommunitySection
                venueId={venue.id}
                canManage={isMyVenue || user?.role === 'admin'}
                board={
                  <CommentThread
                    comments={venueComments}
                    onSubmit={(content, parentId) => onSubmitComment(venue.id, content, parentId)}
                    onDelete={onDeleteComment}
                    moderator={isMyVenue}
                    emptyText="이 매장의 첫 게시글(댓글)을 남겨보세요."
                  />
                }
              />
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

// ── 히어로 (배경 이미지 업로드 가능) ──────────────────────────────────────

function HeroSection({
  venue, editable, onUpdateImage, onUpdateImages, showRotiMark,
}: {
  venue: Venue;
  editable?: boolean;
  onUpdateImage?: (id: string, dataUrl: string) => void;
  onUpdateImages?: (id: string, urls: string[]) => void;
  showRotiMark?: boolean;
}) {
  const bgInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);
  const toast = useToast();

  const gallery = venue.images ?? [];
  // 갤러리가 있으면 갤러리, 없으면 기존 단일 배경, 그것도 없으면 빈 배열
  const slides = gallery.length > 0 ? gallery : (venue.imageUrl ? [venue.imageUrl] : []);
  const usingGallery = gallery.length > 0;
  const safeIdx = slides.length ? Math.min(idx, slides.length - 1) : 0;

  // 네이버 지도 스타일 자동 슬라이드(이미지 2장 이상). 사용자가 조작하면 잠시 멈춤.
  const pausedUntil = useRef(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setIdx((i) => (i + 1) % slides.length);
    }, 3500);
    return () => clearInterval(t);
  }, [slides.length]);

  // 수동 넘김(스와이프/버튼) — 조작 후 6초간 자동 슬라이드 일시정지
  const go = (n: number) => {
    if (!slides.length) return;
    pausedUntil.current = Date.now() + 6000;
    setIdx(((n % slides.length) + slides.length) % slides.length);
  };
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current; touchRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(safeIdx + (dx < 0 ? 1 : -1));
  };

  // 단일 배경 업로드(레거시 — 갤러리 없을 때만 노출)
  const handleBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.show('5MB 이하의 이미지만 업로드 가능합니다', 'error'); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => { onUpdateImage?.(venue.id, ev.target?.result as string); setUploading(false); };
    reader.onerror = () => { toast.show('이미지 읽기에 실패했습니다', 'error'); setUploading(false); };
    reader.readAsDataURL(file);
  };

  // 갤러리 다중 업로드 → 스토리지 → images 배열에 추가
  const handleGalleryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const urls = await uploadVenueImages(venue.id, files);
      onUpdateImages?.(venue.id, [...gallery, ...urls]);
      toast.show('사진을 추가했습니다', 'success');
    } catch {
      toast.show('사진 업로드에 실패했습니다', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeCurrent = () => {
    if (!usingGallery) return;
    onUpdateImages?.(venue.id, gallery.filter((_, k) => k !== safeIdx));
    setIdx(0);
  };

  return (
    <div
      className="relative w-full overflow-hidden h-44 sm:h-52 md:h-60"
      onTouchStart={slides.length > 1 ? onTouchStart : undefined}
      onTouchEnd={slides.length > 1 ? onTouchEnd : undefined}
    >
      {slides.length > 0 ? (
        // 슬라이드 트랙(자동 + 스와이프)
        <div
          className="absolute inset-0 flex transition-transform duration-500 ease-out touch-pan-y select-none"
          style={{ transform: `translateX(-${safeIdx * 100}%)` }}
        >
          {slides.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt={`${venue.name} 사진 ${i + 1}`}
              draggable={false}
              loading="lazy"
              decoding="async"
              className="h-full w-full shrink-0 object-cover"
            />
          ))}
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, #161922 0%, #0a0c0f 100%)' }}
        >
          {/* 테마 글로우 — 상단 중앙(좌우 대칭) */}
          <div
            aria-hidden
            className="absolute left-1/2 -top-1/4 h-2/3 w-2/3 -translate-x-1/2 rounded-full blur-3xl opacity-25 pointer-events-none"
            style={{ background: venue.themeColor ?? '#3A4253' }}
          />
          {/* 카드 무늬 패턴 */}
          <div className="absolute inset-0 grid grid-cols-6 gap-2 p-3 opacity-[0.06] select-none pointer-events-none" aria-hidden>
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} className="text-2xl text-white text-center">{['♠', '♥', '♦', '♣'][i % 4]}</span>
            ))}
          </div>
          {showRotiMark ? (
            <div className="absolute inset-0 flex items-center justify-center opacity-90">
              <div className="scale-150"><RotiArenaLogo variant="mark" /></div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 select-none pointer-events-none">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold text-white shadow-lg ring-1 ring-white/10"
                style={{ background: venue.themeColor ?? '#3A4253' }}
              >
                {venue.name[0]}
              </div>
              {editable && <p className="text-2xs text-white/55">사진을 추가하면 매장이 더 돋보입니다</p>}
            </div>
          )}
        </div>
      )}

      {/* 그라디언트 오버레이 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 30%, rgba(10,12,15,0.5) 100%)' }}
      />

      {/* 좌/우 넘김 버튼 */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(safeIdx - 1)}
            aria-label="이전 사진"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-surface-base/55 text-white backdrop-blur transition-colors hover:bg-surface-base/80"
          >
            <Icon name="chevron-left" size={14} />
          </button>
          <button
            type="button"
            onClick={() => go(safeIdx + 1)}
            aria-label="다음 사진"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-surface-base/55 text-white backdrop-blur transition-colors hover:bg-surface-base/80"
          >
            <Icon name="chevron-right" size={14} />
          </button>
        </>
      )}

      {/* 슬라이드 점 인디케이터 */}
      {slides.length > 1 && (
        <div className="absolute bottom-2.5 left-0 right-0 z-10 flex justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`${i + 1}번째 사진 보기`}
              className={['h-1.5 rounded-full transition-all', i === safeIdx ? 'w-5 bg-gold-300' : 'w-1.5 bg-white/50 hover:bg-white/80'].join(' ')}
            />
          ))}
        </div>
      )}

      {/* 편집 컨트롤 (업주) */}
      {editable && (
        <div className="absolute top-3 right-3 z-10 flex gap-1.5">
          {!usingGallery && (
            <button
              type="button"
              onClick={() => bgInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-8 items-center gap-1.5 rounded-input bg-surface-base/85 px-3 text-xs font-semibold text-ink-primary backdrop-blur transition-colors hover:bg-surface-high disabled:opacity-50"
            >
              {uploading ? '업로드 중' : (venue.imageUrl ? '배경 변경' : '배경 업로드')}
            </button>
          )}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-input bg-gold-300/90 px-3 text-xs font-bold text-ink-inverse backdrop-blur transition-colors hover:bg-gold-200 disabled:opacity-50"
          >
            {busy ? '추가 중' : '사진 추가'}
          </button>
        </div>
      )}
      {editable && usingGallery && (
        <button
          type="button"
          onClick={removeCurrent}
          aria-label="현재 사진 삭제"
          className="absolute top-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-danger/70"
        >
          <Icon name="close" size={14} />
        </button>
      )}

      <input ref={bgInputRef} type="file" accept="image/*" onChange={handleBgChange} className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={handleGalleryChange} className="hidden" />
    </div>
  );
}

// ── 매장 커뮤니티(그룹과 동일 구성: 실시간 채팅 | 게시판) ─────────────────────
function VenueCommunitySection({ venueId, canManage, board }: { venueId: string; canManage: boolean; board: ReactNode }) {
  const [sub, setSub] = useState<'chat' | 'board'>('chat');
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
        {(['chat', 'board'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setSub(t)}
            className={['flex-1 py-1.5 text-xs font-bold rounded-[6px] transition-colors',
              sub === t ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
            {t === 'chat' ? '실시간 채팅' : '게시판'}
          </button>
        ))}
      </div>
      {sub === 'chat' ? <VenueChat venueId={venueId} canManage={canManage} /> : board}
    </div>
  );
}

// 매장 실시간 채팅 — 공개 열람, 로그인 시 작성(그룹 채팅과 동일 UX)
function VenueChat({ venueId, canManage }: { venueId: string; canManage: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<VenueMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getVenueMessages(venueId, 80).then((m) => { if (active) setMessages(m.reverse()); }).catch(() => {});
    const unsub = subscribeVenueMessages(venueId, (m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])));
    return () => { active = false; unsub(); };
  }, [venueId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.show('로그인 후 채팅할 수 있습니다', 'error'); promptLogin(); return; }
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const m = await sendVenueMessage(venueId, { userName: user.nickname ?? user.name, userColor: user.avatarColor, content: body });
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setDraft('');
    } catch (err) { toast.show(err instanceof Error ? err.message : '전송 실패', 'error'); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5 max-h-[55vh] overflow-y-auto">
        {messages.length === 0 ? <p className="py-8 text-center text-2xs text-ink-muted">이 매장의 첫 메시지를 남겨보세요</p> : messages.map((m) => (
          <li key={m.id} className="flex items-start gap-2">
            <Avatar name={m.userName} color={m.userColor} size={24} className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-2xs">
                <span className="font-semibold text-ink-primary truncate">{m.userName}</span>
                <span className="text-ink-muted ml-auto shrink-0">{relativeTime(m.createdAt)}</span>
                {(canManage || m.userId === user?.id) && (
                  <button type="button" onClick={() => deleteVenueMessage(m.id).then(() => setMessages((p) => p.filter((x) => x.id !== m.id))).catch(() => {})} aria-label="삭제" className="shrink-0 text-ink-muted hover:text-danger-light">×</button>
                )}
              </div>
              <p className="text-xs text-ink-primary leading-snug mt-0.5 break-words whitespace-pre-wrap">{m.content}</p>
            </div>
          </li>
        ))}
        <div ref={endRef} />
      </ul>
      <form onSubmit={send} className="flex items-center gap-2">
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500}
          placeholder={user ? '메시지 입력…' : '로그인 후 채팅할 수 있어요'} className="input flex-1" />
        <button type="submit" disabled={sending || !draft.trim()} className="btn-primary px-4 shrink-0 disabled:opacity-50">전송</button>
      </form>
    </div>
  );
}

// ── 팔로우 버튼 ────────────────────────────────────────────────────────────

function VenueRankingPanel({ venueId }: { venueId: string }) {
  const [cfg, setCfg] = useState<VenuePageConfig | null>(null);
  const [metric, setMetric] = useState<RankBoardId | null>(null);
  const [totals, setTotals] = useState<RankingTotal[]>([]);
  const [manual, setManual] = useState<ScoreEntry[]>([]);
  // 주의: 이 파일에 지도용 Map 컴포넌트가 있어 내장 Map 생성이 가려짐 → Record 사용
  const [buyinCounts, setBuyinCounts] = useState<Record<string, number>>({});
  const [latest, setLatest] = useState<{ date: string | null; entries: RankingEntry[] }>({ date: null, entries: [] });
  const [loading, setLoading] = useState(true);

  const [playerCounts, setPlayerCounts] = useState<PlayerCounts[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const c = await getVenuePageConfig(venueId).catch(() => null);
        const ms = c?.rankMetrics ?? [];
        const wantsCounts = ms.includes('moneyin_rate') || ms.includes('buyin_count') || ms.includes('visit_count');
        const [t, d, m] = await Promise.all([
          getVenueRankingTotals(venueId, c),
          getVenueRankings(venueId),
          getScoreEntries(venueId).catch(() => [] as ScoreEntry[]),
        ]);
        const pc: PlayerCounts[] = wantsCounts ? await getVenuePlayerCounts(venueId).catch(() => []) : [];
        const bc: Record<string, number> = {};
        for (const p of pc) bc[p.name.toLowerCase()] = p.buyins;
        if (!active) return;
        setCfg(c); setTotals(t); setLatest(d); setManual(m); setBuyinCounts(bc); setPlayerCounts(pc);
        setMetric((cur) => cur ?? (c?.rankMetrics?.[0] ?? 'score'));
      } catch { /* noop */ }
      finally { if (active) setLoading(false); }
    };
    setLoading(true);
    load();
    const unsub = subscribeRankings(venueId, load); // 실시간: 순위 입력 시 자동 반영
    return () => { active = false; unsub(); };
  }, [venueId]);

  // 업주가 고른 보드(1~2개). 미설정 시 기본 2종.
  const metrics: RankBoardId[] = (cfg?.rankMetrics && cfg.rankMetrics.length > 0 ? cfg.rankMetrics : (['score', 'prize'] as RankBoardId[])).slice(0, 2);
  const cur: RankBoardId = metric && metrics.includes(metric) ? metric : metrics[0];

  // 수동 포인트 합산(기본 매장 포인트 보드 — 커스텀 보드 항목 제외)
  const manualByName = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of manual) {
      if (e.boardKey) continue;
      const k = e.name.trim().toLowerCase();
      m[k] = (m[k] ?? 0) + e.points;
    }
    return m;
  }, [manual]);

  // 메트릭별 값 계산 + 정렬
  const rows = useMemo(() => {
    // 커스텀 보드: 업주가 직접 입력한 항목 합산(이름별) — 월간/시즌 기간 필터 반영
    if (isCustomBoard(cur)) {
      const key = customKeyOf(cur);
      const start = boardPeriodStart((cfg?.customBoards ?? []).find((b) => b.key === key));
      const m = new globalThis.Map<string, { name: string; value: number }>();
      for (const e of manual) {
        if (e.boardKey !== key) continue;
        if (start && e.entryDate < start) continue;
        const k = e.name.trim().toLowerCase();
        const c = m.get(k) ?? { name: e.name, value: 0 };
        c.value += e.points;
        m.set(k, c);
      }
      return [...m.values()]
        .map((x) => ({ nickname: x.name, realName: '', moneyPoints: 0, prizeMan: 0, appearances: 0, bestPosition: 0, value: x.value }))
        .filter((b) => b.value > 0)
        .sort((a, b) => b.value - a.value);
    }
    // 바인왕/출석왕: 장부 집계(전 플레이어) 기반 — 랭킹 등록 여부와 무관
    if (cur === 'buyin_count' || cur === 'visit_count') {
      return playerCounts
        .map((p) => ({ nickname: p.name, realName: '', moneyPoints: 0, prizeMan: 0, appearances: 0, bestPosition: 0, value: cur === 'buyin_count' ? p.buyins : p.visits }))
        .filter((b) => b.value > 0)
        .sort((a, b) => b.value - a.value);
    }
    const base = totals.map((t) => {
      const k = t.nickname.toLowerCase();
      const buyins = buyinCounts[k] ?? 0;
      const value =
        cur === 'score'         ? t.moneyPoints + (manualByName[k] ?? 0)
        : cur === 'prize'         ? t.prizeMan
        : cur === 'moneyin_count' ? t.appearances
        : buyins >= 5 ? Math.round((t.appearances / buyins) * 100) : -1; // rate: 표본 5바인 미만 제외
      return { ...t, value };
    });
    // 수동 포인트만 있고 순위 등록이 없는 사람도 score 보드에 포함
    if (cur === 'score') {
      for (const [k, pts] of Object.entries(manualByName)) {
        if (!base.some((b) => b.nickname.toLowerCase() === k)) {
          const src = manual.find((e) => e.name.trim().toLowerCase() === k);
          base.push({ nickname: src?.name ?? k, realName: '', moneyPoints: 0, prizeMan: 0, appearances: 0, bestPosition: 0, value: pts });
        }
      }
    }
    return base.filter((b) => b.value >= 0)
      .sort((a, b) => (b.value - a.value) || (b.prizeMan - a.prizeMan) || (b.moneyPoints - a.moneyPoints));
  }, [totals, cur, manualByName, buyinCounts, manual, playerCounts, cfg]);

  if (loading) return <p className="text-center py-10 text-xs text-ink-muted">불러오는 중…</p>;
  if (totals.length === 0 && manual.length === 0 && playerCounts.length === 0) {
    return (
      <div className="py-12 text-center text-ink-muted">
        <p className="text-sm">아직 등록된 순위가 없습니다.</p>
        <p className="text-2xs mt-1">매장에서 순위를 등록하면 누적 랭킹이 자동 집계됩니다.</p>
      </div>
    );
  }

  const unit = boardUnit(cur, cfg);
  const fmtVal = (v: number) => `${v.toLocaleString()}${unit}`;
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3, 20);
  // 1~3등 칭호 — 업주 설정(예: 로티아레나 포식자), 미설정 시 기본
  const titleOf = (rank: number) => cfg?.rankTitles?.[String(rank)]?.trim()
    || (rank === 1 ? '챔피언' : rank === 2 ? '준우승' : '3위');

  return (
    <div className="space-y-3">
      {/* 보드 토글 — 업주가 1개만 골랐으면 라벨 헤더로 표시 */}
      {metrics.length > 1 ? (
        <div className="flex items-center gap-1 bg-surface-high rounded-input p-0.5">
          {metrics.map((id) => (
            <button key={id} type="button" onClick={() => setMetric(id)}
              className={['flex-1 py-1.5 text-xs font-bold rounded-[6px] transition-colors',
                cur === id ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary hover:text-ink-primary'].join(' ')}>
              {boardLabel(id, cfg)}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm font-bold text-gold-300">{boardLabel(cur, cfg)} 순위</p>
      )}
      <p className="text-2xs text-ink-muted">{boardDesc(cur, cfg)} · 매장 커뮤니티 순위용 점수(금전적 가치 없음)</p>

      {/* ── 포디움(1~3등 명예 표기) ── */}
      {podium.length > 0 && (
        <div className="flex items-end justify-center gap-2 pt-2">
          {[podium[1], podium[0], podium[2]].map((e, slot) => {
            if (!e) return <div key={slot} className="flex-1" />;
            const rank = slot === 1 ? 1 : slot === 0 ? 2 : 3;
            const masked = maskRealName(e.realName);
            const big = rank === 1;
            const ring = rank === 1 ? 'border-gold-300/80 bg-gradient-to-b from-gold-300/[0.14] to-transparent'
              : rank === 2 ? 'border-slate-300/50 bg-gradient-to-b from-slate-300/[0.08] to-transparent'
              : 'border-amber-700/50 bg-gradient-to-b from-amber-700/[0.10] to-transparent';
            const medal = rank === 1 ? 'bg-gold-300 text-ink-inverse' : rank === 2 ? 'bg-slate-300 text-ink-inverse' : 'bg-amber-700 text-white';
            return (
              <div key={e.nickname} className={['flex-1 max-w-[9.5rem] rounded-card border p-2.5 text-center', ring, big ? 'pb-4 -translate-y-2 shadow-[0_0_18px_rgba(255,209,0,0.12)]' : ''].join(' ')}>
                {big && <div aria-hidden className="text-base leading-none mb-1">👑</div>}
                <span className={['mx-auto flex items-center justify-center rounded-full font-extrabold tabular-nums', medal, big ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-2xs'].join(' ')}>{rank}</span>
                <p className={['mt-1 font-bold uppercase tracking-wide', rank === 1 ? 'text-gold-300' : 'text-ink-secondary', 'text-[10px]'].join(' ')}>{titleOf(rank)}</p>
                <p className={['font-extrabold text-ink-primary truncate', big ? 'text-base' : 'text-sm'].join(' ')}>{e.nickname}</p>
                {masked && <p className="text-[10px] text-ink-muted">({masked})</p>}
                <p className={['font-bold tabular-nums', big ? 'text-sm text-gold-300' : 'text-xs text-ink-secondary'].join(' ')}>{fmtVal(e.value)}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* 4등~ 리스트 */}
      <ol className="space-y-1.5">
        {rest.map((e, i) => {
          const masked = maskRealName(e.realName);
          return (
            <li key={e.nickname} className="flex items-center gap-3 p-2.5 rounded-input bg-surface-high border border-border-subtle">
              <span className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-2xs font-bold tabular-nums bg-surface-float text-ink-secondary">
                {i + 4}
              </span>
              <span className="text-sm font-semibold text-ink-primary truncate">{e.nickname}</span>
              {masked && <span className="text-2xs text-ink-muted">({masked})</span>}
              <span className="ml-auto shrink-0 text-right">
                <span className="text-sm font-bold tabular-nums text-gold-300">{fmtVal(e.value)}</span>
                {e.appearances > 0 && <span className="block text-[10px] text-ink-muted">{e.appearances}회{e.bestPosition > 0 && e.bestPosition < 9999 ? ` · 최고 ${e.bestPosition}등` : ''}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {latest.date && latest.entries.length > 0 && (
        <div className="pt-2 border-t border-border-subtle">
          <p className="text-2xs font-semibold text-ink-secondary mb-1.5">최근 등록 · {latest.date}</p>
          <div className="flex flex-wrap gap-1.5">
            {latest.entries.map((e) => {
              const masked = maskRealName(e.realName);
              return (
                <span key={e.position} className="text-2xs px-2 py-0.5 rounded-badge bg-surface-float text-ink-primary">
                  {e.position}. {e.nickname}{masked ? `(${masked})` : ''}{e.prize ? ` · ${e.prize}점` : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FollowButton({ venueId, followerCount }: { venueId: string; followerCount?: number }) {
  const { user } = useAuth();
  const toast = useToast();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getMyFollowedVenueIds().then((ids) => { if (active) setFollowing(ids.includes(venueId)); }).catch(() => {});
    return () => { active = false; };
  }, [user, venueId]);

  const toggle = async () => {
    if (!user) return toast.show('로그인이 필요합니다', 'error');
    const next = !following;
    setFollowing(next); setBusy(true);
    try {
      if (next) await followVenue(venueId); else await unfollowVenue(venueId);
      toast.show(next ? '매장을 팔로우했습니다' : '팔로우를 해제했습니다', 'info');
    } catch (e) {
      setFollowing(!next);
      toast.show(e instanceof Error ? e.message : '처리에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };

  const count = followerCount ?? 0;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      className={[
        'shrink-0 inline-flex items-center gap-1 px-3 h-9 rounded-input text-xs font-semibold transition-colors disabled:opacity-60',
        following
          ? 'bg-gold-300 text-ink-inverse'
          : 'bg-surface-high text-ink-secondary border border-border-default hover:text-ink-primary',
      ].join(' ')}
    >
      {following ? '팔로잉' : '팔로우'}
      <span className="text-2xs opacity-80">({count.toLocaleString()})</span>
    </button>
  );
}

// ── About 패널 ───────────────────────────────────────────────────────────────

function AboutPanel({
  venue, editable, onUpdateDescription,
}: { venue: Venue; editable?: boolean; onUpdateDescription?: (id: string, desc: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(venue.description ?? '');
  const [addr, setAddr]       = useState(venue.address);
  const [addrEditing, setAddrEditing] = useState(false);
  const [addrDraft, setAddrDraft]     = useState(venue.address);
  const [addrSaving, setAddrSaving]   = useState(false);
  const toast = useToast();

  const saveAddr = async () => {
    setAddrSaving(true);
    try {
      await updateVenueAddress(venue.id, addrDraft);
      setAddr(addrDraft.trim());
      setAddrEditing(false);
      toast.show('주소가 저장되었습니다', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
    finally { setAddrSaving(false); }
  };

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ink-primary">매장 소개</h3>
          {editable && !editing && (
            <button
              type="button"
              onClick={() => { setDraft(venue.description ?? ''); setEditing(true); }}
              className="text-2xs text-ink-muted hover:text-gold-300"
            >
              편집
            </button>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              className="input resize-none w-full"
              placeholder="매장 소개를 입력하세요…"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(false)}>취소</button>
              <button
                type="button"
                className="btn-primary text-xs"
                onClick={() => {
                  onUpdateDescription?.(venue.id, draft);
                  setEditing(false);
                  toast.show('매장 소개가 저장되었습니다', 'success');
                }}
              >
                저장
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">
            {venue.description ?? '아직 등록된 소개가 없습니다.'}
          </p>
        )}
      </section>

      <div className="border-t border-border-subtle" />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">매장 정보</h3>
          {editable && !addrEditing && (
            <button type="button" onClick={() => { setAddrDraft(addr); setAddrEditing(true); }}
              className="text-2xs text-ink-muted hover:text-gold-300">주소 편집</button>
          )}
        </div>
        {addrEditing ? (
          <div className="space-y-2">
            <input value={addrDraft} onChange={(e) => setAddrDraft(e.target.value)} maxLength={120}
              placeholder="도로명 주소" className="input w-full text-sm" autoFocus />
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-ghost text-xs" onClick={() => setAddrEditing(false)}>취소</button>
              <button type="button" className="btn-primary text-xs disabled:opacity-60" disabled={addrSaving} onClick={saveAddr}>
                {addrSaving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <dl className="space-y-1.5">
            <AddressRow address={addr} />
            {venue.contactPhone  && <PhoneRow phone={venue.contactPhone} />}
            {venue.businessHours && <Row dt="영업시간" dd={venue.businessHours} />}
          </dl>
        )}
      </section>

      {/* 카카오맵 위치 */}
      <KakaoMap address={addr} name={venue.name} />
    </div>
  );
}

function Row({ dt, dd }: { dt: string; dd: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <dt className="w-14 shrink-0 text-ink-muted">{dt}</dt>
      <dd className="text-ink-secondary flex-1 whitespace-pre-line">{dd}</dd>
    </div>
  );
}

// 주소 — 클릭하면 클립보드 복사 + 외부 지도 링크
function AddressRow({ address }: { address: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.show('주소가 복사되었습니다', 'success');
    } catch {
      toast.show('복사에 실패했습니다', 'error');
    }
  };
  const mapUrl = `https://map.naver.com/v5/search/${encodeURIComponent(address)}`;
  return (
    <div className="flex items-start gap-2 text-xs">
      <dt className="w-14 shrink-0 text-ink-muted">주소</dt>
      <dd className="flex-1 flex items-start justify-between gap-2">
        <span className="text-ink-secondary whitespace-pre-line">{address}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button" onClick={copy}
            className="px-1.5 py-0.5 rounded-badge text-2xs text-ink-muted hover:text-gold-300 hover:bg-surface-high transition-colors"
            aria-label="주소 복사"
          >
            복사
          </button>
          <a
            href={mapUrl} target="_blank" rel="noopener noreferrer"
            className="px-1.5 py-0.5 rounded-badge text-2xs text-ink-muted hover:text-gold-300 hover:bg-surface-high transition-colors"
          >
            지도 ↗
          </a>
        </div>
      </dd>
    </div>
  );
}

// 전화 — 클릭하면 tel: 링크 또는 복사
function PhoneRow({ phone }: { phone: string }) {
  const toast = useToast();
  const numbers = phone.split('/').map((s) => s.trim()).filter(Boolean);
  return (
    <div className="flex items-start gap-2 text-xs">
      <dt className="w-14 shrink-0 text-ink-muted">연락처</dt>
      <dd className="flex-1 flex flex-wrap gap-1.5">
        {numbers.map((n) => (
          <a
            key={n}
            href={`tel:${n.replace(/[^0-9+]/g, '')}`}
            onClick={async (e) => {
              // 클립보드 복사 성공 시 tel: 링크 막고 토스트 표시
              // 실패 시 기본 tel: 링크 실행
              try {
                await navigator.clipboard.writeText(n);
                e.preventDefault();
                toast.show(`${n} 복사됨`, 'success');
              } catch { /* 복사 실패 → tel: 링크 그대로 실행 */ }
            }}
            className="px-2 py-0.5 rounded-badge bg-surface-high border border-border-default text-ink-secondary hover:text-gold-300 hover:border-gold-400/40 transition-colors tabular-nums"
          >
            {n}
          </a>
        ))}
      </dd>
    </div>
  );
}

// ── 카카오맵 ─────────────────────────────────────────────────────────────────

const KAKAO_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;

function KakaoMap({ address, name }: { address: string; name: string }) {
  const [loading, error] = useKakaoLoader({
    appkey: KAKAO_KEY ?? '',
    libraries: ['services'],
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (loading || error || !KAKAO_KEY) return;
    setGeocoding(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geocoder = new (window as any).kakao.maps.services.Geocoder();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geocoder.addressSearch(address, (result: any[], status: string) => {
      setGeocoding(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (status === (window as any).kakao.maps.services.Status.OK && result[0]) {
        setCoords({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
      }
    });
  }, [loading, error, address]);

  // 카카오 앱키 미설정 시 숨김
  if (!KAKAO_KEY) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink-primary">위치</h3>
      <div className="rounded-card overflow-hidden border border-border-subtle" style={{ height: 200 }}>
        {loading || geocoding ? (
          <div className="w-full h-full flex items-center justify-center bg-surface-high">
            <span className="w-5 h-5 rounded-full border-2 border-gold-300 border-t-transparent animate-spin" />
          </div>
        ) : error || !coords ? (
          <div className="w-full h-full flex items-center justify-center bg-surface-high">
            <p className="text-xs text-ink-muted">지도를 불러올 수 없습니다</p>
          </div>
        ) : (
          <Map
            center={coords}
            level={4}
            style={{ width: '100%', height: '100%' }}
          >
            <MapMarker position={coords}>
              <div className="px-2 py-1 text-xs font-semibold text-surface-base whitespace-nowrap">
                {name}
              </div>
            </MapMarker>
          </Map>
        )}
      </div>
      <a
        href={`https://map.kakao.com/link/search/${encodeURIComponent(address)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-2xs text-ink-muted hover:text-gold-300 transition-colors"
      >
        카카오맵에서 보기 ↗
      </a>
    </section>
  );
}

// ── Schedules 패널 ──────────────────────────────────────────────────────────

// ── 포스터 탭 ────────────────────────────────────────────────────────────────
// '금일 포스터' 카테고리 — 클릭 시 공지글이 포함된 상태로 아코디언이 열린다.
// (오늘 진행 포스터 + 운영 공지를 함께 묶어 보여줌)

function PostersPanel({
  todayPosters, allPosters, notices, onSelect,
}: {
  todayPosters: Schedule[];
  allPosters: Schedule[];
  notices: MarketplaceNotice[];
  onSelect?: (s: Schedule) => void;
}) {
  // 금일 포스터가 있으면 기본 열림, 없으면 접힘
  const [open, setOpen] = useState(todayPosters.length > 0);
  const dows = ['일', '월', '화', '수', '목', '금', '토'];

  // 오늘이 아닌 예정 포스터 (날짜 오름차순)
  const upcoming = allPosters
    .filter((s) => !todayPosters.some((t) => t.id === s.id))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      {/* ── 금일 포스터 아코디언 ───────────────────────────────── */}
      <section className="rounded-card border border-gold-400/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-gradient-to-br from-gold-300/[0.08] to-transparent hover:from-gold-300/[0.12] transition-colors focus:outline-none"
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gold-300">
            금일 포스터
            <span className="text-2xs text-ink-muted font-normal">({todayPosters.length})</span>
          </span>
          {/* 펼침/접힘 화살표 */}
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={['text-ink-secondary transition-transform duration-200', open ? 'rotate-180' : ''].join(' ')}
            aria-hidden
          >
            <polyline points="4 6 8 10 12 6" />
          </svg>
        </button>

        {/* 아코디언 본문 — 공지글 + 금일 포스터 */}
        {open && (
          <div className="px-3 py-3 space-y-3 border-t border-gold-400/20 animate-slide-up">
            {/* 공지글 (있을 때만) */}
            {notices.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-2xs font-bold text-ink-muted">공지</p>
                <ul className="space-y-1.5">
                  {notices.slice(0, 3).map((n) => (
                    <li key={n.id} className="px-2.5 py-2 rounded-input bg-surface-high border-l-2 border-gold-400/50">
                      <p className="text-xs font-semibold text-ink-primary">{n.title}</p>
                      {n.body && <p className="text-2xs text-ink-muted line-clamp-2 mt-0.5">{n.body}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 금일 포스터 목록 */}
            {todayPosters.length === 0 ? (
              <p className="text-center py-4 text-xs text-ink-muted">오늘 진행되는 포스터가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {todayPosters.map((s) => (
                  <li key={s.id} onClick={() => onSelect?.(s)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(s); } }}
                    className="flex items-center gap-3 p-2.5 rounded-input bg-surface-low border border-border-subtle cursor-pointer hover:border-gold-400/40 focus:outline-none focus-visible:border-gold-300 transition-colors">
                    {/* 포스터 썸네일 */}
                    <div
                      className="w-10 h-14 shrink-0 rounded-input overflow-hidden flex items-center justify-center"
                      style={s.posterUrl ? undefined : { background: `linear-gradient(135deg, ${s.posterColor ?? '#1a1d24'}, #0a0c0f)` }}
                    >
                      {s.posterUrl
                        ? <img src={s.posterUrl} alt={`${s.title} 포스터`} className="w-full h-full object-cover" loading="lazy" />
                        : <span className="text-lg opacity-30">♠</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-primary truncate">{s.title}</p>
                      <p className="text-2xs text-ink-muted mt-0.5">
                        {s.startTime} · 바이인 {s.buyIn.amount.toLocaleString()}
                      </p>
                    </div>
                    <span className="shrink-0 text-2xs font-bold text-gold-300 bg-gold-300/15 px-1.5 py-0.5 rounded-badge">
                      TODAY
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ── 예정 포스터 ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-2xs font-bold text-ink-muted px-0.5">예정 포스터 ({upcoming.length})</p>
        {upcoming.length === 0 ? (
          <p className="text-center py-6 text-xs text-ink-muted">예정된 포스터가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((s) => {
              const d = new Date(s.date);
              return (
                <li key={s.id} onClick={() => onSelect?.(s)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(s); } }}
                  className="flex items-center gap-3 p-3 rounded-input bg-surface-high border border-border-subtle cursor-pointer hover:border-gold-400/40 focus:outline-none focus-visible:border-gold-300 transition-colors">
                  <div className="text-center shrink-0">
                    <p className="text-2xs text-ink-muted">{dows[d.getDay()]}</p>
                    <p className="text-lg font-bold text-gold-300 tabular-nums leading-none">{d.getDate()}</p>
                    <p className="text-2xs text-ink-muted">{d.getMonth() + 1}월</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-primary truncate">{s.title}</p>
                    <p className="text-2xs text-ink-muted mt-0.5">
                      {s.startTime} · 바이인 {s.buyIn.amount.toLocaleString()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// 매장 공지 — 업주 + 관리자만 작성/삭제, 누구나 열람
function VenueNoticeBoard({ venueId, canManage }: { venueId: string; canManage: boolean }) {
  const toast = useToast();
  const [notices, setNotices] = useState<VenueNotice[]>([]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getVenueNotices(venueId).then(setNotices).catch(() => {}); }, [venueId]);
  const reload = () => getVenueNotices(venueId).then(setNotices).catch(() => {});

  const submit = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await createVenueNotice(venueId, draft);
      setDraft(''); setOpen(false);
      toast.show('공지를 등록했습니다', 'success');
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '등록에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return;
    try { await deleteVenueNotice(id); reload(); } catch { toast.show('삭제에 실패했습니다', 'error'); }
  };

  if (notices.length === 0 && !canManage) return null;

  return (
    <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.06] to-transparent overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 border-b border-gold-400/20">
        <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-gold-300">
          매장 공지 <span className="text-2xs text-ink-muted font-normal">({notices.length})</span>
        </h3>
        {canManage && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-2xs text-gold-300 hover:text-gold-200 font-semibold">
            {open ? '닫기' : '+ 공지 작성'}
          </button>
        )}
      </header>

      {canManage && open && (
        <div className="p-2.5 border-b border-border-subtle space-y-2">
          <textarea
            value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} rows={2}
            placeholder="매장 손님에게 전할 공지를 작성하세요"
            className="input w-full resize-none text-sm"
          />
          <div className="flex justify-end">
            <button type="button" onClick={submit} disabled={busy || !draft.trim()} className="btn-primary px-4 text-xs disabled:opacity-60">등록</button>
          </div>
        </div>
      )}

      {notices.length === 0 ? (
        <p className="py-3 text-center text-2xs text-ink-muted">등록된 공지가 없습니다</p>
      ) : (
        <ul>
          {notices.map((n) => (
            <li key={n.id} className="px-3 py-2 border-b border-border-subtle last:border-b-0">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-xs text-ink-primary whitespace-pre-wrap break-words leading-relaxed">{n.content}</p>
                {canManage && (
                  <button type="button" onClick={() => remove(n.id)} className="shrink-0 text-2xs text-ink-muted hover:text-danger-light">삭제</button>
                )}
              </div>
              <p className="mt-1 text-2xs text-ink-muted">{n.authorName} · {new Date(n.createdAt).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SchedulesPanel({ schedules, onSelect }: { schedules: Schedule[]; onSelect?: (s: Schedule) => void }) {
  if (schedules.length === 0) {
    return <p className="text-center py-8 text-xs text-ink-muted">예정된 토너먼트가 없습니다.</p>;
  }
  const dows = ['일','월','화','수','목','금','토'];
  return (
    <ul className="space-y-2">
      {schedules.map((s) => {
        const d = new Date(s.date);
        return (
          <li key={s.id} onClick={() => onSelect?.(s)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(s); } }}
            className="flex items-center gap-3 p-3 rounded-input bg-surface-high border border-border-subtle cursor-pointer hover:border-gold-400/40 focus:outline-none focus-visible:border-gold-300 transition-colors">
            <div className="text-center shrink-0">
              <p className="text-2xs text-ink-muted">{dows[d.getDay()]}</p>
              <p className="text-lg font-bold text-gold-300 tabular-nums leading-none">{d.getDate()}</p>
              <p className="text-2xs text-ink-muted">{d.getMonth() + 1}월</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-primary truncate">{s.title}</p>
              <p className="text-2xs text-ink-muted mt-0.5">
                {s.startTime} · {s.duration} · 바이인 {s.buyIn.amount.toLocaleString()}
              </p>
            </div>
            <span className={[
              'shrink-0 text-2xs font-bold px-1.5 py-0.5 rounded-badge border',
              s.format === 'MTT'    && 'bg-blue-500/15   text-blue-400   border-blue-500/30',
              s.format === 'SNG'    && 'bg-purple-500/15 text-purple-400 border-purple-500/30',
              s.format === 'PKO'    && 'bg-teal-500/15   text-teal-400   border-teal-500/30',
              s.format === 'Bounty' && 'bg-amber-500/15  text-amber-400  border-amber-500/30',
              s.format === 'Mix'    && 'bg-pink-500/15   text-pink-400   border-pink-500/30',
            ].filter(Boolean).join(' ')}>
              {s.format}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
