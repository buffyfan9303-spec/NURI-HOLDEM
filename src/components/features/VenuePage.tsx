import { useState, useEffect, useRef, useMemo } from 'react';
import { Map, MapMarker, useKakaoLoader } from 'react-kakao-maps-sdk';
import CommentThread from './CommentThread';
import RotiArenaLogo from '../atoms/RotiArenaLogo';
import { useToast } from '../atoms/Toast';
import type { Venue, Comment } from '../../api/community';
import type { Schedule } from '../../api/schedules';
import type { MarketplaceNotice } from '../../api/marketplace';
import { useAuth } from '../../contexts/AuthContext';
import { followVenue, unfollowVenue, getMyFollowedVenueIds } from '../../api/community';

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
}

type Tab = 'about' | 'posters' | 'schedules' | 'community';
const TABS: Tab[] = ['about', 'posters', 'schedules', 'community'];

const TAB_LABEL: Record<Tab, string> = {
  about:     '매장 소개',
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
  onSubmitComment, onDeleteComment, onUpdateDescription, onUpdateImage,
}: VenuePageProps) {
  const [tab, setTab] = useState<Tab>('about');
  const { user, isApprovedOwner } = useAuth();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 브라우저 뒤로가기 지원
  useEffect(() => {
    if (!open || !venue) return;
    const stateKey = `venue-${venue.id}`;
    history.pushState({ venuePage: stateKey }, '');
    document.body.style.overflow = 'hidden';

    const onPopState = () => onClose();
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      document.body.style.overflow = '';
      // 페이지를 정상 닫을 때 history 정리
      if (history.state?.venuePage === stateKey) {
        history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, venue?.id]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const venueSchedules = useMemo(
    () => (venue ? schedules.filter((s) => s.venueId === venue.id) : []),
    [venue, schedules],
  );
  const venueComments = useMemo(
    () => (venue ? comments.filter((c) => c.venueId === venue.id) : []),
    [venue, comments],
  );
  // 금일 포스터 — 오늘 날짜(YYYY-MM-DD)와 일치하는 매장 포스터
  const todayPosters = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return venueSchedules.filter((s) => s.date === todayIso);
  }, [venueSchedules]);

  if (!open || !venue) return null;

  const isMyVenue = isApprovedOwner && user?.venueId === venue.id;
  const isRoti    = venue.id === 'v_roti';

  return (
    <div
      role="dialog"
      aria-label={`${venue.name} 매장 페이지`}
      className="fixed inset-0 z-50 bg-surface-base flex flex-col animate-slide-up"
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
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="14,5 7,11 14,17" />
          </svg>
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

        {/* 히어로 (배경 이미지) */}
        <HeroSection
          venue={venue}
          editable={isMyVenue}
          onUpdateImage={onUpdateImage}
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
            </div>
            <FollowButton venueId={venue.id} followerCount={venue.followerCount} />
          </div>
        </div>

        {/* ── Sticky 탭바 ─────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-surface-base border-b border-border-subtle">
          <div className="grid grid-cols-4">
            {TABS.map((t) => {
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
                    'py-3 text-sm font-medium transition-colors text-center relative',
                    'border-b-2 -mb-px',
                    active
                      ? 'border-gold-300 text-gold-300'
                      : 'border-transparent text-ink-muted hover:text-ink-secondary',
                  ].join(' ')}
                >
                  {TAB_LABEL[t]}
                  {t !== 'about' && (
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
          {tab === 'posters' && (
            <PostersPanel
              todayPosters={todayPosters}
              allPosters={venueSchedules}
              notices={notices}
            />
          )}
          {tab === 'schedules' && <SchedulesPanel schedules={venueSchedules} />}
          {tab === 'community' && (
            <CommentThread
              comments={venueComments}
              onSubmit={(content, parentId) => onSubmitComment(venue.id, content, parentId)}
              onDelete={onDeleteComment}
              emptyText="이 매장의 첫 댓글을 남겨보세요."
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── 히어로 (배경 이미지 업로드 가능) ──────────────────────────────────────

function HeroSection({
  venue, editable, onUpdateImage, showRotiMark,
}: {
  venue: Venue;
  editable?: boolean;
  onUpdateImage?: (id: string, dataUrl: string) => void;
  showRotiMark?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const toast = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.show('5MB 이하의 이미지만 업로드 가능합니다', 'error');
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onUpdateImage?.(venue.id, dataUrl);
      setUploading(false);
    };
    reader.onerror = () => {
      toast.show('이미지 읽기에 실패했습니다', 'error');
      setUploading(false);
    };
    reader.readAsDataURL(file);
    // 동일 파일 재선택 가능하도록 value 초기화
    e.target.value = '';
  };

  return (
    <div className="relative w-full overflow-hidden h-44 sm:h-52 md:h-60">
      {/* 배경 — 이미지 있으면 표시, 없으면 그라데이션 + 패턴 */}
      {venue.imageUrl ? (
        <img
          src={venue.imageUrl}
          alt={`${venue.name} 배경`}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${venue.themeColor ?? '#1A1D24'} 0%, #0a0c0f 100%)` }}
        >
          <div
            className="absolute inset-0 grid grid-cols-6 gap-2 p-3 opacity-[0.08] select-none pointer-events-none"
            aria-hidden
          >
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} className="text-2xl text-white text-center">
                {['♠','♥','♦','♣'][i % 4]}
              </span>
            ))}
          </div>
          {/* ROTI ARENA 마크 (중앙) */}
          {showRotiMark && (
            <div className="absolute inset-0 flex items-center justify-center opacity-90">
              <div className="scale-150">
                <RotiArenaLogo variant="mark" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 그라디언트 오버레이 (제목 가독성) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 30%, rgba(10,12,15,0.5) 100%)',
        }}
      />

      {/* 업로드 버튼 (편집권 있는 업주만) */}
      {editable && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 h-8 rounded-input bg-surface-base/85 backdrop-blur text-xs font-semibold text-ink-primary hover:bg-surface-high transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                업로드 중
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="1.5" y="2.5" width="11" height="9" rx="1.5" />
                  <circle cx="5" cy="5.5" r="1" />
                  <polyline points="2,9 5,7 7,9 9,7 12,11" />
                </svg>
                {venue.imageUrl ? '배경 변경' : '배경 업로드'}
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </>
      )}
    </div>
  );
}

// ── 팔로우 버튼 ────────────────────────────────────────────────────────────

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
  const toast = useToast();

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
              placeholder="매장 소개를 입력하세요..."
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
        <h3 className="text-sm font-semibold text-ink-primary">매장 정보</h3>
        <dl className="space-y-1.5">
          <AddressRow address={venue.address} />
          {venue.contactPhone  && <PhoneRow phone={venue.contactPhone} />}
          {venue.businessHours && <Row dt="영업시간" dd={venue.businessHours} />}
        </dl>
      </section>

      {/* 카카오맵 위치 */}
      <KakaoMap address={venue.address} name={venue.name} />
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
  todayPosters, allPosters, notices,
}: {
  todayPosters: Schedule[];
  allPosters: Schedule[];
  notices: MarketplaceNotice[];
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
                  <li key={s.id} className="flex items-center gap-3 p-2.5 rounded-input bg-surface-low border border-border-subtle">
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
                <li key={s.id} className="flex items-center gap-3 p-3 rounded-input bg-surface-high border border-border-subtle">
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

function SchedulesPanel({ schedules }: { schedules: Schedule[] }) {
  if (schedules.length === 0) {
    return <p className="text-center py-8 text-xs text-ink-muted">예정된 토너먼트가 없습니다.</p>;
  }
  const dows = ['일','월','화','수','목','금','토'];
  return (
    <ul className="space-y-2">
      {schedules.map((s) => {
        const d = new Date(s.date);
        return (
          <li key={s.id} className="flex items-center gap-3 p-3 rounded-input bg-surface-high border border-border-subtle">
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
