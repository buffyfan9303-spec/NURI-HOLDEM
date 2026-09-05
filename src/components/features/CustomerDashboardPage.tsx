// src/components/features/CustomerDashboardPage.tsx
// '내 정보' 통합 페이지(오너 지시 2026-09-03) — [대시보드 · 프로필 · 설정 · 보안] 4탭.
//   대시보드 = 이 파일 본문, 프로필/설정/보안 = ProfilePanels(구 ProfileModal) 패널 그대로.
//   진입점은 헤더 아바타 메뉴('내 정보')·모바일 탭바 5칸·/wallet 딥링크·본인인증 배너(보안 탭) 뿐이다.
// 내 매장이용권(매장별) + 매장 이용내역(방문·머니인·금액). 매장이용권은 금전적 가치 없음.
// 사용(회수) = 발급 매장 QR 스캔 또는 그 매장 업주 전화번호로만. 유저 간 전송 불가.
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { lazyWithReload } from '../../lib/lazyWithReload';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../atoms/Icon';
import UnderlineTabs from '../atoms/UnderlineTabs';
import { SectionHead as Head, SectionTile as Tile } from '../atoms/SectionHeader'; // 섹션 머리글·타일 정본(지갑과 공유)
import EmptyState from '../atoms/EmptyState';
import { goSubTab } from '../../lib/subTabTransition';
import type { LegalDoc } from './LegalDocsModal';
import { myVisitedVenues, myPlayHistory, type VisitedVenue, type PlayHistory } from '../../api/vouchers';
import { wonToMan } from '../../api/ledger';
import { getMyReservations, cancelMyReservation, type MyReservationRow } from '../../api/reservations';
import { getPostsByUser, type CommunityPost } from '../../api/community';
import { getMyRankingHistory, placementPoints, type MyRankingRow } from '../../api/rankings';
import { shareRecordCard, shareRecordCardKakao } from '../../lib/recordCard';
import { kakaoConfigured, kakaoShareLink } from '../../lib/kakao';
import { getMyReferralStats, inviteUrl, type ReferralStats } from '../../api/referrals';
import { getMyChampionships } from '../../api/seasons';
import QRCode from 'qrcode';
import { BADGES, getMyBadgeStats, type BadgeStats } from '../../lib/loyalty';
import TierBadge, { tierOf, tierProgress, allTiers, tierCss } from '../atoms/TierBadge';
import ProfilePanels, { ProfileIdentityHeader, type ProfileTab } from './ProfileModal'; // 프로필·설정·보안 패널 + 아이덴티티 헤더 정본(중복 정의 0)
import { loginWithKakao, signInWithGoogle } from '../../api/auth'; // 비로그인 랜딩 — AuthModal 과 같은 OAuth 시작 함수 재사용
import AutoLoginCheckbox from '../atoms/AutoLoginCheckbox'; // 자동 로그인 — AuthModal 로그인 탭과 같은 원자·같은 플래그
import { isKeepSignedIn, setKeepSignedIn } from '../../lib/supabase';
import { promptLogin } from '../../lib/requireLogin'; // 이메일 로그인 — App 이 듣고 AuthModal(z-[60], DOM 후순위)을 위로 띄운다
import { useIdentityEnabled } from '../../lib/identityFlag'; // 본인인증·매장이용권 통합 킬스위치(2026-08-29)
import VoucherWallet from './VoucherWallet'; // 이용권 지갑 정본 — 헤더 [이용권·출석] 시트와 같은 컴포넌트를 쓴다(중복 0)

// ── 홈 화면 설치(A2HS) 이벤트 선점 ─────────────────────────────────────────────
// 왜: beforeinstallprompt 는 페이지 로드 직후 1회만 발화한다 — 이 페이지가 열릴 때는 이미 지나간 뒤라
// 모듈 로드 시점에 참조를 붙잡아 둔다(InstallBanner 와 병존 — 둘 다 같은 이벤트 참조를 저장할 뿐, prompt 는 1회만).
interface BipEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferredInstall: BipEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e as BipEvent; });
}

// 매장(업주) 회원가입 — AuthModal 의 'signup-owner' 탭을 그대로 재사용(새 플로우 0).
// App 과 같은 동적 임포트 경로라 청크가 공유된다(중복 번들 없음).
const AuthModalLazy = lazyWithReload(() => import('./AuthModal'));

/** 통합 페이지 탭 — 하위 탭 전환 방향(forward/back)은 이 진열 순서 기준(goSubTab). */
export type MeTab = 'dashboard' | ProfileTab;
const ME_TAB_ORDER: MeTab[] = ['dashboard', 'profile', 'settings', 'security'];
const ME_TABS: { key: MeTab; label: string }[] = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'profile',   label: '프로필' },
  { key: 'settings',  label: '설정' },
  { key: 'security',  label: '보안' },
];

export default function CustomerDashboardPage({ open, onClose, unread = [], onOpenNotification, onOpenPost, onOpenMarket, onOpenRanking, initialTab = 'dashboard', onOpenLegal, onOpenSupport }: {
  open: boolean; onClose: () => void;
  /** 미읽음 알림 미리보기(상위 3개) — 프로필 메뉴까지 안 가도 되게 */
  unread?: { id: string; title: string; message: string; createdAt: string }[];
  onOpenNotification?: (id: string) => void;
  /** '내 것' 허브 — 흩어져 있던 내 글·내 거래·프로필을 이 화면에서 잇는다 */
  onOpenPost?: (p: CommunityPost) => void;
  onOpenMarket?: () => void;
  /** 랭킹 상점(커뮤니티 → 랭킹) — 마크·프레임·닉네임색을 사는 곳. 내 정보에서 바로 갈 수 있어야 한다(오너 2026-09-04) */
  onOpenRanking?: () => void;
  /** 열릴 때 보여줄 탭(본인인증 배너·비밀번호 OTP 복귀 → 'security') — 열림마다 이 값으로 리셋 */
  initialTab?: MeTab;
  /** 프로필 탭 하단 약관·고객센터(구 ProfileModal props 그대로) */
  onOpenLegal?: (d: LegalDoc) => void;
  onOpenSupport?: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  // 본인인증·매장이용권 킬스위치. OFF 면 지갑(이용권) 전체와 인증 유도가 이 화면에서 사라진다.
  // 훅이므로 조건부 return 들보다 위 — 아래 everOpenedRef / LoginLanding 분기보다 반드시 먼저 실행돼야 한다.
  const idOn = useIdentityEnabled();
  const [visits, setVisits] = useState<VisitedVenue[]>([]);
  const [plays, setPlays] = useState<PlayHistory[]>([]);
  const [resv, setResv] = useState<MyReservationRow[]>([]);   // 대회 참가(예약) 이력
  const [ranks, setRanks] = useState<MyRankingRow[]>([]);     // 내 입상 기록(닉네임 기준)
  const [refStats, setRefStats] = useState<ReferralStats>({ invited: 0, rewarded: 0 }); // 친구 초대 현황
  const [championships, setChampionships] = useState(0); // 시즌 우승 횟수(영구 배지)
  // 첫 프레임에 loading 이 false 면 방문·예약·입상 세 섹션이 동시에 "아직 없습니다"로 떨어진다
  // — reload() 안의 setLoading(true) 는 useEffect 라 페인트 뒤에 돈다(2026-09-05 전수 조사).
  const [loading, setLoading] = useState(true);
  const [badgeStats, setBadgeStats] = useState<BadgeStats | null>(null); // 내 업적(랭킹 탭에서 이전)
  const [achOpen, setAchOpen] = useState(false); // 내 업적 접기/펼치기 — 기본 닫힘
  const [myPosts, setMyPosts] = useState<CommunityPost[]>([]); // 내가 쓴 글 — 그동안 찾을 화면 자체가 없었다
  const recordsRef = useRef<HTMLElement | null>(null); // '내 전적' 버튼 → 기존 입상 기록 섹션 앵커 스크롤
  // 4탭 상태 — 페이지가 소유(ProfilePanels 는 controlled). 열릴 때마다 initialTab 으로 리셋(keep-alive 재열림 포함).
  const [tab, setTab] = useState<MeTab>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  // 하위 탭 전환 = 방향성 푸시(data-profile-tabbar 제자리 · data-profile-panel 만 밀림) — 커뮤니티·GTO 와 같은 조리법
  const goTab = useCallback((v: MeTab) => goSubTab('profile-tab', ME_TAB_ORDER, tab, v, () => setTab(v)), [tab]);

  useEffect(() => {
    if (!open || !user) { setMyPosts([]); return; }
    getPostsByUser(user.id).then(setMyPosts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const reload = () => {
    setLoading(true);
    Promise.all([
      myVisitedVenues(), myPlayHistory(),
      getMyReservations().catch(() => [] as MyReservationRow[]),
      user?.nickname ? getMyRankingHistory(user.nickname, 200).catch(() => [] as MyRankingRow[]) : Promise.resolve([] as MyRankingRow[]),
      user?.nickname ? getMyReferralStats().catch(() => ({ invited: 0, rewarded: 0 })) : Promise.resolve({ invited: 0, rewarded: 0 }),
      user?.nickname ? getMyChampionships(user.nickname).catch(() => 0) : Promise.resolve(0),
    ])
      .then(([vi, pl, rv, rk, rs, ch]) => {
        setVisits(vi); setPlays(pl); setResv(rv); setRanks(rk); setRefStats(rs); setChampionships(ch);
        // 전국 상위 N%(상금 합산 기준)는 2026-09-05 미산정으로 전환(법적위험완화 v3) — 새 기준이 정해지기 전엔 계산하지 않는다.
      })
      .catch(() => {}).finally(() => setLoading(false));
  };
  // 왜 user?.id 의존성: 비로그인 랜딩에서 이메일 로그인(AuthModal이 이 페이지 위에 뜸) 성공 시
  // open 은 그대로 true 라 [open]만으로는 재조회가 없다 — user 확정 순간 대시보드 데이터를 채운다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && user) reload(); }, [open, user?.id, idOn]);
  useEffect(() => { if (open && user) getMyBadgeStats(user.nickname ?? null, user.activityPoints ?? 0).then(setBadgeStats).catch(() => {}); }, [open, user]);

  // keep-alive(메인 탭과 같은 조리법) — 한 번 열린 뒤에는 언마운트하지 않고 display 토글만.
  // 재열림이 '풀 마운트 + 데이터 상태 재구축' 대신 display 복원이 되어, GTO 같은 무거운 탭 위에서
  // '내 정보'를 열 때의 마운트 커밋 프레임 드롭(확 버벅)이 사라진다. App 쪽은 VT 스냅샷 뒤 동기 커밋.
  const everOpenedRef = useRef(false);
  if (open) everOpenedRef.current = true; // 렌더 중 latch — 단조 증가라 안전
  if (!open && !everOpenedRef.current) return null;
  const hidden = !open;

  // 비로그인 — 대시보드 대신 로그인 랜딩(APIS '내 게임' 문법). 훅은 전부 위에서 이미 실행됐고
  // 데이터 이펙트는 user 가드로 잠겨 있어 user=null 렌더가 안전하다.
  // 숨김 중 로그인이 확정되면(user 등장) 갈래 전환은 자연 리렌더로 처리된다.
  if (!user) return <LoginLanding onClose={onClose} hidden={hidden} />;

  const usageMap = new Map<string, { name: string; visits: number; moneyin: number; amount: number; lastAt: string | null }>();
  for (const x of visits) usageMap.set(x.venueId, { name: x.venueName ?? '매장', visits: x.visits, moneyin: 0, amount: 0, lastAt: null });
  for (const p of plays) {
    const e = usageMap.get(p.venueId) ?? { name: p.venueName ?? '매장', visits: 0, moneyin: 0, amount: 0, lastAt: null };
    e.moneyin = p.moneyinCount; e.amount = p.totalAmount; e.lastAt = p.lastAt;
    usageMap.set(p.venueId, e);
  }
  const usage = [...usageMap.values()].sort((a, b) => (b.moneyin + b.visits) - (a.moneyin + a.visits));
  // 하이라이트 — 총 머니인/누적액 + 최다 머니인(횟수) 매장 + 최다 머니인(금액) 매장
  const totalVisits = visits.reduce((s, v) => s + v.visits, 0); // 스탯 3열용 — 이미 내려온 방문 데이터 재사용(새 fetch 0)
  const totalMoneyin = plays.reduce((s, p) => s + p.moneyinCount, 0);
  const totalSpent = plays.reduce((s, p) => s + p.totalAmount, 0);
  const topMoneyin = [...usage].filter((u) => u.moneyin > 0).sort((a, b) => b.moneyin - a.moneyin)[0] ?? null;
  const topAmount = [...usage].filter((u) => u.amount > 0).sort((a, b) => b.amount - a.amount)[0] ?? null;
  const fmtDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface-base pt-[env(safe-area-inset-top)]" style={hidden ? { display: 'none' } : undefined}>
      <header className="flex h-header-h shrink-0 items-center gap-2 px-page-x">
        <button type="button" onClick={() => { sessionStorage.removeItem('nh_pw_otp'); onClose(); }} aria-label="닫기" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-high">
          <Icon name="back" size={20} />
        </button>
        <h1 className="text-lg font-bold text-ink-primary">내 정보</h1>
      </header>
      {/* 탭 바 — view-transition 이름(profile-tabbar)은 index.css 의 data-vt-scope='profile-tab' 규칙이 준다. 탭 44px(py-3 + t-nav) */}
      <div data-profile-tabbar="" className="shrink-0 px-page-x">
        <UnderlineTabs items={ME_TABS} value={tab} onChange={goTab} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 본문 — 탭 전환의 방향성 푸시 대상(탭바는 제자리 고정) */}
        <div data-profile-panel="">
        {tab !== 'dashboard' ? (
          <div className="mx-auto w-full max-w-md">
            <ProfilePanels open={open} tab={tab} onTabChange={goTab} onClose={onClose} onOpenLegal={onOpenLegal} onOpenSupport={onOpenSupport} />
          </div>
        ) : (
        <div className="mx-auto w-full max-w-2xl space-y-4 px-page-x py-section">
          {/* 통합 프로필 아이덴티티 헤더(오너 지시 2026-08-27) — ProfileModal '프로필' 탭과 같은 정본.
              커버 밴드(등급색 틴트) + 오버랩 아바타(등급 링) + 닉네임·등급·칭호·인증 + 등급 진행바. */}
          {user && (
            <ProfileIdentityHeader
              displayName={user.name}
              avatarUrl={user.avatarUrl}
              avatarColor={user.avatarColor}
              points={user.activityPoints ?? 0}
              isAdmin={user.role === 'admin'}
              verified={idOn && user.verified}
              stats={[
                { label: '활동점수', value: (user.activityPoints ?? 0).toLocaleString() },
                { label: '내 글', value: String(myPosts.length) },
                { label: '방문', value: `${totalVisits}회` },
              ]}
              actions={
                <div className="grid w-full grid-cols-2 gap-2">
                  <button type="button" onClick={() => goTab('settings')}
                    className="btn-primary inline-flex items-center justify-center gap-1.5 py-2 text-xs">
                    <Icon name="edit" size={13} /> 프로필 편집
                  </button>
                  <button type="button"
                    onClick={() => recordsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="inline-flex items-center justify-center gap-1.5 rounded-input border border-accent-400/50 py-2 text-xs font-bold text-accent-300 hover:bg-accent-300/10 transition-colors">
                    <Icon name="trophy" size={13} /> 내 전적
                  </button>
                </div>
              }
            />
          )}
          {/* 미읽음 알림 미리보기 — 상위 3개(탭하면 해당 화면으로) */}
          {unread.length > 0 && (
            <section className="rounded-aura border card-aura p-3">
              <Head icon="bell" tone="indigo" title="안 읽은 알림" count={unread.length} />
              <ul className="mt-2 space-y-1">
                {unread.slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => onOpenNotification?.(n.id)}
                      className="w-full rounded-input bg-surface-high/50 px-2.5 py-2 text-left hover:bg-surface-high transition-colors">
                      <p className="truncate text-xs font-bold text-ink-primary">{n.title}</p>
                      <p className="truncate text-2xs text-ink-muted">{n.message}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {/* 업적 — 기본 닫힘, 헤더 클릭으로 펼침 */}
          {badgeStats && (
            <section className="rounded-aura border card-aura p-3">
              <button type="button" onClick={() => setAchOpen((v) => !v)} aria-expanded={achOpen} className="flex w-full items-center gap-2 text-left">
                <Tile icon="medal" tone="violet" />
                <h2 className="text-sm font-bold text-ink-primary">내 업적</h2>
                <span className="text-2xs font-semibold tabular-nums text-ink-muted">{BADGES.filter((b) => b.check(badgeStats)).length}/{BADGES.length} 달성</span>
                <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-2xs text-ink-muted">{achOpen ? '접기' : '펼치기'} <Icon name={achOpen ? 'chevron-up' : 'chevron-down'} size={12} /></span>
              </button>
              {achOpen && (
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {BADGES.map((b) => {
                    const got = b.check(badgeStats);
                    return (
                      <div key={b.key} title={b.desc}
                        className={['rounded-card border p-2.5 text-center transition-colors', got ? 'border-accent-400/50 bg-accent-300/[0.08]' : 'border-border-subtle bg-surface-high opacity-55'].join(' ')}>
                        <Icon name={b.icon} size={22} className={['mx-auto', got ? b.tone : 'text-ink-muted'].join(' ')} />
                        <p className={['mt-1 text-xs font-bold', got ? 'text-accent-300' : 'text-ink-secondary'].join(' ')}>{b.label}</p>
                        <p className="mt-0.5 text-2xs leading-tight text-ink-muted">{b.desc}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {/* 내 계정 — 받는 아이디 · 본인인증(매장이용권 수령 조건).
              킬스위치 OFF: 인증 배지/이용권 수령 칸/인증 독촉이 모두 빠지고 '받는 아이디'만 남는다
              (아이디는 순위·전적 연결에 계속 쓰이므로 기능 자체를 없애지 않는다). */}
          <section className="rounded-aura border card-aura p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-400/15 text-base font-bold text-accent-300">
                {(user?.nickname ?? user?.name ?? '?').slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-primary">{user?.nickname ?? user?.name ?? '회원'}</p>
                <p className="truncate text-2xs text-ink-muted">{user?.verified && user?.realName ? user.realName : '플레이어'}</p>
              </div>
              {idOn && (user?.verified
                ? <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-2xs font-bold text-emerald-300">본인인증 완료</span>
                : <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-2xs font-bold text-danger">미인증</span>)}
            </div>
            <div className={['mt-2.5 grid gap-2', idOn ? 'grid-cols-2' : 'grid-cols-1'].join(' ')}>
              <div className="rounded-input border border-border-subtle bg-surface-base px-2.5 py-1.5">
                <p className="text-2xs text-ink-muted">받는 아이디</p>
                <p className="truncate text-xs font-bold text-ink-primary">{user?.nickname ? '@' + user.nickname : <span className="text-danger-light">미설정</span>}</p>
              </div>
              {idOn && (
                <div className="rounded-input border border-border-subtle bg-surface-base px-2.5 py-1.5">
                  <p className="text-2xs text-ink-muted">이용권 수령</p>
                  <p className={`truncate text-xs font-bold ${user?.verified ? 'text-emerald-300' : 'text-danger'}`}>{user?.verified ? '가능' : '인증 필요'}</p>
                </div>
              )}
            </div>
            {idOn && !user?.verified && (
              <p className="mt-2 flex items-start gap-1.5 text-2xs leading-relaxed text-danger-light"><Icon name="alert" size={12} className="mt-0.5 shrink-0" /> 본인인증을 완료해야 매장이용권을 받을 수 있어요. 프로필에서 인증을 진행하세요.</p>
            )}
            {(idOn ? user?.verified : true) && !user?.nickname && (
              <p className="mt-2 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-secondary"><Icon name="info" size={12} className="mt-0.5 shrink-0" /> {idOn
                ? '받는 아이디(닉네임)를 설정하면 업주가 더 쉽게 이용권을 보낼 수 있어요. 프로필에서 설정하세요.'
                : '받는 아이디(닉네임)를 설정하면 매장에서 등록한 순위·전적이 자동으로 연결돼요. 프로필에서 설정하세요.'}</p>
            )}
          </section>

          {/* 레벨·칭호 — 활동점수 기반 레벨/칭호 + 다음 레벨까지 진행 */}
          <LevelCard points={user?.activityPoints ?? 0} championships={championships} />

          {/* 내 것 바로가기 — 프로필·장터 내 거래가 각각 다른 구석에 살아서 늘 헤맸다 */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => goTab('settings')}
              className="rounded-aura border card-aura px-3 py-2.5 text-left">
              <span className="flex items-center gap-2 text-sm font-bold text-ink-primary"><span className="flex h-6 w-6 items-center justify-center rounded-[6px] tile-grad"><Icon name="user" size={13} /></span> 프로필 관리</span>
              <span className="block text-2xs text-ink-muted mt-0.5">닉네임 · {idOn ? '본인인증 · ' : ''}알림 설정</span>
            </button>
            {onOpenMarket && (
              <button type="button" onClick={onOpenMarket}
                className="rounded-aura border card-aura px-3 py-2.5 text-left">
                <span className="flex items-center gap-2 text-sm font-bold text-ink-primary"><span className="flex h-6 w-6 items-center justify-center rounded-[6px] tile-grad tile-grad-cyan"><Icon name="cart" size={13} /></span> 내 장터 거래</span>
                <span className="block text-2xs text-ink-muted mt-0.5">판매목록 · 채팅 · 찜</span>
              </button>
            )}
            {/* 랭킹 상점 — 활동점수를 쓰는 유일한 곳인데 커뮤니티 안쪽 서브탭에만 있어 찾기 어려웠다(오너 2026-09-04).
                점수가 보이는 이 화면에서 바로 갈 수 있어야 '모은다 → 쓴다'가 이어진다. */}
            {onOpenRanking && (
              <button type="button" onClick={onOpenRanking}
                className="rounded-aura border card-aura px-3 py-2.5 text-left">
                <span className="flex items-center gap-2 text-sm font-bold text-ink-primary"><span className="flex h-6 w-6 items-center justify-center rounded-[6px] tile-grad tile-grad-fuchsia"><Icon name="medal" size={13} /></span> 랭킹 · 상점</span>
                <span className="block text-2xs text-ink-muted mt-0.5">마크 · 카드 프레임 · 닉네임 색</span>
              </button>
            )}
          </div>

          {/* 내가 쓴 글 — 커뮤니티에 흩어진 내 글을 다시 찾을 유일한 화면 */}
          {myPosts.length > 0 && onOpenPost && (
            <section className="rounded-aura border card-aura p-3">
              <Head icon="edit" tone="fuchsia" title="내가 쓴 글" count={myPosts.length} />
              <ul className="mt-2 space-y-1">
                {myPosts.slice(0, 5).map((mp) => (
                  <li key={mp.id}>
                    <button type="button" onClick={() => onOpenPost(mp)}
                      className="w-full rounded-input px-2 py-1.5 text-left hover:bg-surface-high transition-colors">
                      <span className="block truncate text-xs font-semibold text-ink-secondary">{mp.title || (mp.content || '').replace(/\n/g, ' ').slice(0, 40) || '(내용 없음)'}</span>
                      <span className="flex items-center gap-1 text-2xs text-ink-muted tabular-nums"><Icon name="heart" size={11} />{mp.likeCount} <Icon name="comment" size={11} className="ml-1" />{mp.commentCount} <span className="ml-1">{new Date(mp.createdAt).toLocaleDateString()}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 친구 초대 — 추천 링크 + 현황. 친구 가입+본인인증 시 양쪽 활동점수.
              ⚠ 보상 지급은 서버 트리거 trg_referral_reward_on_verify(after update of profiles.ci_hash)다 —
                 본인인증이 꺼진 동안에는 **새 보상이 나가지 않는다**(초대 기록 referrals 는 그대로 쌓이고,
                 인증이 다시 열리면 그때 인증하는 친구 건부터 정상 지급된다). 문구가 이 사실을 말하게 한다. */}
          <InviteSection nickname={user?.nickname ?? ''} stats={refStats} idOn={idOn} />

          {idOn && (
            <div className="rounded-aura border card-aura p-3">
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink-primary"><Icon name="alert" size={15} className="shrink-0 text-danger-light" /> 매장이용권은 금전적 가치가 없습니다</p>
              <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">현금·포인트가 아니며 환불·현금화·유저 간 거래가 불가합니다. 발급한 매장에서 사용(회수)만 가능합니다.</p>
            </div>
          )}

          {/* 하이라이트 요약 — 방문·머니인·최다 머니인 매장/금액
              ⚠ '보유 이용권' 통합 스탯 제거(오너 지시 #4, 2026-08-29):
                 이용권은 **매장마다 개별 매장이용권**만 존재한다. 매장을 가로질러 합산한 'N장'은
                 그 전제와 어긋나는 수치다(어느 매장에서 쓸 수 있는 N장인지 답이 없다).
                 매장별 보유는 아래 '내 매장이용권' 섹션이 매장 단위로 그대로 보여 준다 — 정보 손실 0. */}
          {!loading && usage.length > 0 && (
            <section className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="방문 매장" value={`${usage.length}곳`} />
                <Stat label="총 머니인" value={`${totalMoneyin}회`} />
                <Stat label="누적 머니인액" value={totalSpent ? wonToMan(totalSpent) + '만' : '-'} accent />
              </div>
              {(topMoneyin || topAmount) && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {topMoneyin && <HiCard title="최다 머니인 매장" name={topMoneyin.name} detail={`머니인 ${topMoneyin.moneyin}회 · 누적 ${topMoneyin.amount ? wonToMan(topMoneyin.amount) + '만' : '-'}`} />}
                  {topAmount && <HiCard title="최다 머니인 금액" name={topAmount.name} detail={`${wonToMan(topAmount.amount)}만 · ${topAmount.moneyin}회`} />}
                </div>
              )}
            </section>
          )}

          {/* 내 매장이용권 + 사용 내역 — 헤더 [이용권 · 출석] 시트와 **같은 컴포넌트**(VoucherWallet)다.
              보유 목록·매장별 그룹·만료 D-day·인증 게이트·사용(3경로)·사용 내역이 전부 그 안에 있다.
              두 벌로 그리면 반드시 갈라지므로 여기서는 자리만 내준다(2026-09-05 오너 지시).
              ⚠ open 게이트: 이 페이지는 keep-alive(언마운트 없이 display 토글)라 그냥 두면 다시 열어도
                 지갑이 처음 읽은 값에 머문다 — 닫는 순간 언마운트해서 재열림마다 새로 읽게 한다
                 (덤으로 진행 중이던 RedeemSheet·QR 카메라도 함께 정리된다. 예전 !open 이펙트와 같은 효과). */}
          {open && <VoucherWallet onNeedVerify={() => goTab('security')} />}

          <section className="space-y-2">
            <Head icon="store" tone="cyan" title="매장 이용·참가 내역" count={usage.length} unit="곳" />
            {loading ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
              : usage.length === 0 ? <div className="rounded-aura border card-aura"><EmptyState icon={<Icon name="store" />} title="방문·머니인 기록이 아직 없습니다." /></div>
                : <ul className="space-y-1.5">{usage.map((u, i) => (
                  <li key={i} className="rounded-input border border-border-subtle bg-surface-low px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-ink-primary">{u.name}</p>
                      {u.lastAt && <span className="shrink-0 text-2xs text-ink-muted">최근 {fmtDate(u.lastAt)}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-ink-muted">
                      <span>방문 <b className="text-ink-secondary tabular-nums">{u.visits}</b>회</span>
                      <span>머니인 <b className="text-ink-secondary tabular-nums">{u.moneyin}</b>회</span>
                      <span>누적 <b className="text-accent-300 tabular-nums">{u.amount ? wonToMan(u.amount) + '만' : '-'}</b></span>
                    </div>
                  </li>
                ))}</ul>}
          </section>

          {/* 대회 참가(예약) 내역 — 내가 예약했던 대회들 */}
          <section className="space-y-2">
            <Head icon="calendar-check" tone="indigo" title="대회 참가 내역" count={resv.length} unit="건" desc="참가 예약 기준" />
            {loading ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
              : resv.length === 0 ? <div className="rounded-aura border card-aura"><EmptyState icon={<Icon name="calendar-check" />} title="아직 참가 예약한 대회가 없습니다." /></div>
                : <ul className="space-y-1.5">{resv.slice(0, 15).map((r) => {
                  const upcoming = r.date >= new Date().toLocaleDateString('en-CA');
                  return (
                  <SwipeCancelRow
                    key={`${r.scheduleId}-${r.reservedAt}`}
                    cancelable={upcoming}
                    onCancel={async () => {
                      try {
                        await cancelMyReservation(r.scheduleId);
                        toast.show('예약을 취소했습니다', 'success');
                        setResv((prev) => prev.filter((x) => x.scheduleId !== r.scheduleId));
                      } catch (e) {
                        toast.show(e instanceof Error ? e.message : '예약 취소 실패', 'error');
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* ⚠ '예정' 은 지난 예약과 다가올 예약을 가르는 **유일한 표시**인데
                          대회명이 길면 그것부터 사라졌다(우측 날짜는 shrink-0 라 살아남았다). */}
                      <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-ink-primary">
                        <span className="min-w-0 truncate">{r.title}</span>
                        {upcoming && <span className="shrink-0 rounded-badge bg-emerald-400/15 px-1.5 py-0.5 text-2xs font-bold text-emerald-400">예정</span>}
                      </p>
                      <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{r.date}{r.startTime ? ` ${r.startTime.slice(0, 5)}` : ''}</span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-2xs text-ink-muted">
                      {r.venueName && <span>{r.venueName}</span>}
                      <span>예약명 <b className="text-ink-secondary">{r.displayName}</b></span>
                    </p>
                  </SwipeCancelRow>
                  );
                })}</ul>}
            {resv.some((r) => r.date >= new Date().toLocaleDateString('en-CA')) && (
              <p className="mt-1 text-2xs text-ink-muted">예정 예약은 왼쪽으로 밀면(PC는 마우스 올리면) 취소할 수 있어요.</p>
            )}
          </section>

          {/* 내 입상 기록 — 매장 순위 등록에서 내 닉네임이 잡힌 이력. '내 전적' 버튼의 앵커. */}
          <section ref={recordsRef} className="scroll-mt-4 space-y-2">
            <Head icon="trophy" tone="violet" title="내 입상 기록" count={ranks.length} unit="회" desc="매장 순위 등록 기준" />
            {loading ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
              : !user?.nickname ? <div className="rounded-aura border card-aura"><EmptyState icon={<Icon name="trophy" />} title="프로필에서 아이디(닉네임)를 설정하면 입상 기록이 자동 연결됩니다." action={<button type="button" onClick={() => goTab('settings')} className="btn-ghost px-3 py-1.5 text-2xs">아이디 설정하기</button>} /></div>
              : ranks.length === 0 ? <div className="rounded-aura border card-aura"><EmptyState icon={<Icon name="trophy" />} title="아직 입상 기록이 없습니다." hint="매장에서 순위가 등록되면 자동으로 표시됩니다." /></div>
                : <><RecordSummary rows={ranks} nickname={user?.nickname ?? ''} /><RankTrendChart rows={ranks} />
                <ul className="space-y-1.5">{ranks.slice(0, 15).map((r, i) => (
                  <li key={i} className="flex items-center gap-2.5 rounded-input border border-border-subtle bg-surface-low px-3 py-2">
                    <span className={['flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-extrabold tabular-nums',
                      r.position === 1 ? 'bg-gold-300 text-ink-inverse' : r.position <= 3 ? 'border border-border-default bg-surface-float text-ink-primary' : 'bg-surface-float text-ink-secondary'].join(' ')}>
                      {r.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-primary">{r.venueName}</p>
                      <p className="text-2xs tabular-nums text-ink-muted">{r.date}</p>
                    </div>
                  </li>
                ))}</ul></>}
          </section>
        </div>
        )}
        </div>
      </div>

    </div>
  );
}

/** 비로그인 로그인 랜딩 — APIS '내 게임' 문법(타이틀 + 가치 제안 + 소셜 로그인 + 설정성 행).
 *  왜 별도 화면: 비로그인에게 빈 대시보드 껍데기를 보여주는 대신, 로그인의 '이유'를 먼저 판다. */
function LoginLanding({ onClose, hidden = false }: { onClose: () => void; hidden?: boolean }) {
  const toast = useToast();
  // 진행 중인 소셜만 로딩 표기 + 두 버튼 동시 비활성(중복 리다이렉트 방지) — AuthModal 과 동일 패턴
  const [busy, setBusy] = useState<'kakao' | 'google' | null>(null);
  // 자동 로그인 — 이 랜딩은 소셜(리다이렉트)뿐이라 '제출 시 저장'이 불가능하다.
  // 체크를 만지는 즉시 플래그에 쓰고, OAuth 시작 함수에도 같은 값을 넘긴다(둘 다 같은 결과, 순서 무관).
  const [keepSignedIn, setKeep] = useState(() => isKeepSignedIn());
  const changeKeep = (v: boolean) => { setKeep(v); setKeepSignedIn(v); };
  // 매장(업주) 회원가입 — 기존 AuthModal 'signup-owner' 탭 재사용(가입 후 운영자 승인제 그대로)
  const [ownerSignupOpen, setOwnerSignupOpen] = useState(false);
  // keep-alive 로 이 화면이 숨겨질 때 위에 떠 있던 가입 모달도 함께 정리(재열림 시 유령 모달 방지)
  useEffect(() => { if (hidden) setOwnerSignupOpen(false); }, [hidden]);

  // ♠ 오늘의 운세 — NURI MIND(오너 개발 중인 외부 서비스 nurimind.co.kr)로 연결
  const goFortune = () => { window.open('https://www.nurimind.co.kr', '_blank', 'noopener'); };

  const installApp = async () => {
    try { if (window.matchMedia('(display-mode: standalone)').matches) { toast.show('이미 앱으로 사용 중이에요', 'info'); return; } } catch { /* noop */ }
    if (deferredInstall) {
      const ev = deferredInstall;
      deferredInstall = null; // 왜: 브라우저가 이벤트당 prompt 1회만 허용 — 재클릭 시 안내 문구로 넘어가게 비운다
      try { await ev.prompt(); } catch { /* 사용자 취소 등 무시 */ }
      return;
    }
    toast.show('브라우저 메뉴에서 "홈 화면에 추가"를 선택하세요', 'info');
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface-base pt-[env(safe-area-inset-top)]" style={hidden ? { display: 'none' } : undefined}>
      <header className="flex h-header-h shrink-0 items-center gap-2 border-b border-border-subtle px-page-x">
        <button type="button" onClick={onClose} aria-label="닫기" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-high">
          <Icon name="back" size={20} />
        </button>
        {/* 우상단 칩 — 로그인 없이도 눌러볼 게 하나는 있어야 한다(가벼운 재미 → 도구 탭 유입) */}
        <button type="button" onClick={goFortune}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-400/40 bg-accent-300/10 px-3 py-1.5 text-2xs font-bold text-accent-300 hover:bg-accent-300/15 transition-colors">
          <Icon name="spade" size={13} /> 오늘의 운세
        </button>
      </header>

      {/* 서피스 깊이·오로라 확장(2026-08-27): 비로그인 랜딩 상단 오로라 워시 — 정적 1회 페인트 */}
      <div className="hero-aurora flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-md space-y-4 px-page-x py-section">
          <div>
            <h1 className="text-xl font-extrabold text-ink-primary">반갑습니다</h1>
            <p className="mt-1 text-sm text-ink-secondary">로그인하고 내 홀덤 생활을 모아보세요</p>
          </div>

          {/* 가치 제안 — 헤드라인은 알림이 아니라 우리 최대 장점('전국을 한 곳에').
              ring-conic: 정적 conic 시그니처 보더(홈 밖 1곳 규율) — border 유틸 대신 자체 1px 투명 보더 사용 */}
          <section className="ring-conic rounded-card bg-surface-low p-5 text-center">
            <p className="text-base font-extrabold text-ink-primary">전국 홀덤을 한 곳에서</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">대회 일정·매장 커뮤니티·GTO 학습까지<br />로그인하면 예약·이용권·전적이 모입니다</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([['calendar', '대회 일정'], ['users', '매장 커뮤니티'], ['target', 'GTO 학습']] as const).map(([icon, label]) => (
                <div key={icon} className="flex flex-col items-center gap-1.5 rounded-input bg-surface-high/50 px-1 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-300/15 text-accent-300"><Icon name={icon} size={17} /></span>
                  <span className="text-2xs font-semibold text-ink-secondary">{label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 소셜 로그인 — AuthModal SocialLoginButtons 와 동일한 동작·스타일(같은 OAuth 함수 직접 호출) */}
          <div className="space-y-1.5">
            <AutoLoginCheckbox checked={keepSignedIn} onChange={changeKeep} disabled={busy !== null} />
            <button type="button" disabled={busy !== null}
              onClick={() => { setBusy('kakao'); loginWithKakao(keepSignedIn).catch((e) => { toast.show(e instanceof Error ? e.message : '카카오 로그인 실패', 'error'); setBusy(null); }); }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-input bg-[#FEE500] text-sm font-bold text-black/85 transition active:scale-[0.99] disabled:opacity-60">
              {/* 카카오 심볼(말풍선) — 공식 버튼 규격 색상 */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#000000" aria-hidden>
                <path d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.86 5.33 4.66 6.74-.15.52-.96 3.32-.99 3.54 0 0-.02.17.09.23.11.06.24.01.24.01.32-.04 3.66-2.4 4.24-2.81.57.08 1.16.13 1.76.13 5.52 0 10-3.58 10-8s-4.48-8-10-8Z" />
              </svg>
              {busy === 'kakao' ? '카카오로 이동 중…' : '카카오로 3초 만에 시작하기'}
            </button>
            <button type="button" disabled={busy !== null}
              onClick={() => { setBusy('google'); signInWithGoogle(keepSignedIn).catch((e) => { toast.show(e instanceof Error ? e.message : '구글 로그인 실패', 'error'); setBusy(null); }); }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-input border border-border-default bg-white text-sm font-bold text-[#1f1f1f] transition active:scale-[0.99] disabled:opacity-60">
              {/* 구글 공식 4색 G 로고(브랜드 가이드 규격) */}
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              {busy === 'google' ? 'Google로 이동 중…' : 'Google로 계속하기'}
            </button>
            {/* 이메일 로그인 — AuthModal(로그인 탭)을 이 화면 위로. z-[60] 동순위지만 DOM 후순위라 위에 뜬다 */}
            <button type="button" onClick={promptLogin}
              className="mx-auto block px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-colors">
              이메일로 로그인 ›
            </button>
          </div>

          {/* 설정성 행 — 로그인 없이도 쓸 수 있는 것들(약관은 이 화면 진입 프롭이 없어 하단 푸터에 위임) */}
          <div className="divide-y divide-border-subtle overflow-hidden rounded-aura border card-aura">
            <button type="button" onClick={installApp}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-high transition-colors">
              <Icon name="download" size={17} className="shrink-0 text-ink-secondary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-primary">앱 설치</span>
                <span className="block text-2xs text-ink-muted">홈 화면에 추가하고 앱처럼 쓰기</span>
              </span>
              <Icon name="chevron-right" size={15} className="shrink-0 text-ink-muted" />
            </button>
            <a href="mailto:buffyfan9303@gmail.com?subject=NURI%20HOLDEM%20문의"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-high transition-colors">
              <Icon name="comment" size={17} className="shrink-0 text-ink-secondary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-primary">고객센터 문의</span>
                <span className="block text-2xs text-ink-muted">이메일로 문의를 보내주세요</span>
              </span>
              <Icon name="chevron-right" size={15} className="shrink-0 text-ink-muted" />
            </a>
            {/* 광고 문의 — 고객센터와 같은 메일 채널, 제목 프리셋으로 분류(1:1 문의 모달은 로그인 전용이라 비로그인 랜딩엔 mailto) */}
            <a href="mailto:buffyfan9303@gmail.com?subject=%5B광고%20문의%5D%20NURI%20HOLDEM"
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-high transition-colors">
              <Icon name="mail" size={17} className="shrink-0 text-ink-secondary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-primary">광고 문의</span>
                <span className="block text-2xs text-ink-muted">배너·제휴 광고 제안을 보내주세요</span>
              </span>
              <Icon name="chevron-right" size={15} className="shrink-0 text-ink-muted" />
            </a>
            {/* 매장 회원가입 — AuthModal 업주 가입 탭으로 직행(가입 후 운영자 승인제) */}
            <button type="button" onClick={() => setOwnerSignupOpen(true)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-high transition-colors">
              <Icon name="felt-table" size={17} className="shrink-0 text-ink-secondary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-primary">매장 회원가입</span>
                <span className="block text-2xs text-ink-muted">업주 가입 신청 · 운영자 승인 후 활성화</span>
              </span>
              <Icon name="chevron-right" size={15} className="shrink-0 text-ink-muted" />
            </button>
          </div>
        </div>
      </div>

      {/* 업주 가입 모달 — z-[60] 동순위지만 DOM 후순위(이 랜딩 내부)라 위에 뜬다. 이메일 로그인(promptLogin)과 같은 문법 */}
      {ownerSignupOpen && (
        <Suspense fallback={null}>
          <AuthModalLazy open onClose={() => setOwnerSignupOpen(false)} initialMode="signup-owner" />
        </Suspense>
      )}
    </div>
  );
}

/** 예약 행 스와이프 취소 — 모바일은 왼쪽으로 밀고, PC는 호버로 취소 버튼 노출. */
function SwipeCancelRow({ cancelable, onCancel, children }: { cancelable: boolean; onCancel: () => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number; dx: number } | null>(null);
  const REVEAL = 76; // 취소 버튼 폭
  const onTouchStart = (e: React.TouchEvent) => {
    if (!cancelable) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!cancelable || !start.current) return;
    const mx = e.touches[0].clientX - start.current.x;
    const my = e.touches[0].clientY - start.current.y;
    if (Math.abs(my) > Math.abs(mx)) return; // 세로 스크롤 우선
    setDx(Math.min(0, Math.max(-REVEAL - 14, start.current.dx + mx)));
  };
  const onTouchEnd = () => {
    if (!cancelable) return;
    start.current = null;
    setDx((v) => (v <= -REVEAL / 2 ? -REVEAL : 0)); // 절반 넘게 밀면 열림 고정
  };
  const fire = async () => {
    if (busy) return;
    setBusy(true);
    try { await onCancel(); } finally { setBusy(false); setDx(0); }
  };
  return (
    <li className="group relative overflow-hidden rounded-input border border-border-subtle bg-surface-low">
      {cancelable && (
        <button
          type="button" onClick={fire} disabled={busy}
          className="absolute inset-y-0 right-0 flex w-[76px] items-center justify-center bg-danger text-xs font-bold text-white active:opacity-80 disabled:opacity-60"
        >
          {busy ? '취소 중…' : '예약 취소'}
        </button>
      )}
      <div
        className={[
          'relative bg-surface-low px-3 py-2 transition-transform duration-[var(--dur-fast)] ease-out',
          // PC: 호버 시 살짝 밀려 취소 버튼이 보인다(터치 불가 환경 대응)
          cancelable ? 'md:group-hover:-translate-x-[76px]' : '',
        ].join(' ')}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </li>
  );
}

/** 내 토너먼트 전적 요약 — 입상 기록(닉네임 매칭)에서 우승·입상·승률·누적 포인트·즐겨찾는 매장 집계.
 *  누적 상금·전국 백분위(상금 합산 기준)는 2026-09-05 제거(법적위험완화 v3) — 공유 카드에도 싣지 않는다. */
function RecordSummary({ rows, nickname }: { rows: MyRankingRow[]; nickname: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const n = rows.length;
  if (n === 0) return null;
  const wins = rows.filter((r) => r.position === 1).length;       // 🥇 우승(1위)
  const cashes = rows.filter((r) => r.position <= 3).length;      // 🏅 입상(TOP3)
  const best = Math.min(...rows.map((r) => r.position));
  const avg = Math.round((rows.reduce((s, r) => s + r.position, 0) / n) * 10) / 10;
  const winRate = Math.round((wins / n) * 100);                   // 우승률
  const points = rows.reduce((s, r) => s + placementPoints(r.position), 0); // 누적 포인트
  // 자주 입상하는 매장(빈도)
  const freq = new Map<string, number>();
  for (const r of rows) freq.set(r.venueName, (freq.get(r.venueName) ?? 0) + 1);
  const fav = [...freq.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const cardData = () => ({ nickname: nickname || '플레이어', wins, cashes, records: n, winRate, bestPosition: best, points });
  const doShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await shareRecordCard(cardData());
      toast.show(res === 'shared' ? '전적 카드를 공유했어요' : '전적 카드 이미지를 저장했어요', 'success');
    } catch { toast.show('카드 생성에 실패했어요', 'error'); } finally { setBusy(false); }
  };
  const doKakao = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await shareRecordCardKakao(cardData());
      if (ok) toast.show('카카오톡으로 공유했어요', 'success');
      else { const res = await shareRecordCard(cardData()); toast.show(res === 'shared' ? '공유했어요' : '카카오 공유가 미설정이라 이미지를 저장했어요', 'info'); }
    } catch { toast.show('공유에 실패했어요', 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="mb-2 rounded-aura border card-aura p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-1 text-xs font-bold text-gold-300"><Icon name="trophy" size={13} /> 내 토너먼트 전적 <span className="font-normal text-ink-muted">(기록 {n}회)</span>
        </p>
        <div className="flex shrink-0 gap-1">
          {kakaoConfigured() && <button type="button" onClick={doKakao} disabled={busy} className="shrink-0 rounded-chip px-2 py-1 text-2xs font-bold text-[#3C1E1E] disabled:opacity-50" style={{ background: '#FEE500' }}>카톡</button>}
          <button type="button" onClick={doShare} disabled={busy} className="btn-ghost inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-2xs disabled:opacity-50">{busy ? '생성 중…' : <><Icon name="share" size={12} /> 공유</>}</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        <Stat label="우승" value={`${wins}회`} accent />
        <Stat label="입상 TOP3" value={`${cashes}회`} />
        <Stat label="우승률" value={`${winRate}%`} accent />
        <Stat label="최고 순위" value={`${best}위`} />
        <Stat label="평균 순위" value={`${avg}위`} />
        <Stat label="누적 포인트" value={`${points.toLocaleString()}점`} accent />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-muted">
        {fav && <span>자주 입상 <b className="text-ink-secondary">{fav[0]}</b> ({fav[1]}회)</span>}
        <span>전국 백분위 · 미산정(집계 기준 결정 전)</span>
      </div>
    </div>
  );
}

/** 내 전적 그래프 — 순위 추이(시간순, 1위가 위). 최근 15개. */
function RankTrendChart({ rows }: { rows: MyRankingRow[] }) {
  // rows는 최신순 → 시간순으로 뒤집고 최근 15개만
  const pts = [...rows].slice(0, 15).reverse();
  if (pts.length < 2) return null; // 1개뿐이면 추세가 없어 리스트만 보여준다
  const W = 560, H = 130, PAD_X = 26, PAD_T = 14, PAD_B = 22;
  const maxPos = Math.max(4, ...pts.map((p) => p.position));
  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / (pts.length - 1);
  const y = (pos: number) => PAD_T + ((pos - 1) * (H - PAD_T - PAD_B)) / (maxPos - 1 || 1);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.position).toFixed(1)}`).join(' ');
  const avg = Math.round((pts.reduce((s, p) => s + p.position, 0) / pts.length) * 10) / 10;
  const best = Math.min(...pts.map((p) => p.position));
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return (
    <div className="mb-2 rounded-aura border card-aura p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-bold text-ink-secondary">순위 추이 <span className="font-normal text-ink-muted">(최근 {pts.length}회 · 위로 갈수록 높은 순위)</span></p>
        <p className="text-2xs text-ink-muted">최고 <b className="text-accent-300">{best}위</b> · 평균 <b className="text-ink-secondary">{avg}위</b></p>
      </div>
      {/* 색은 전부 토큰 — 예전엔 다크 팔레트 hex 를 그대로 박아 라이트에서 그림만 안 따라왔다
          (라이트 실측: 추이선 #FCD535 1.43:1 · 가이드선 #2B3139 13.12:1 로 반전, 축 라벨 3.32:1).
          추이선/1위 점은 골드(순위·상금 도메인색)라 text-gold-300 + currentColor 로 받아
          index.css 의 `html.light .text-gold-300 → #8F6200` 라이트 보정을 그대로 탄다. */}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full text-gold-300" role="img" aria-label="내 순위 추이 그래프">
        {/* 가이드선: 1위/중간/하단 */}
        {[1, Math.ceil(maxPos / 2), maxPos].map((g) => (
          <g key={g}>
            <line x1={PAD_X} y1={y(g)} x2={W - PAD_X} y2={y(g)} stroke="rgb(var(--border-strong))" strokeWidth="1" strokeDasharray={g === 1 ? '' : '3 4'} />
            <text x={PAD_X - 5} y={y(g) + 3.5} textAnchor="end" fontSize="10" fill="rgb(var(--ink-muted))">{g}위</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.position)} r={p.position <= 3 ? 4.5 : 3.5}
              fill={p.position === 1 ? 'currentColor' : p.position <= 3 ? 'rgb(var(--ink-secondary))' : 'rgb(var(--border-strong))'}
              stroke="rgb(var(--surface-low))" strokeWidth="1.5" />
            {/* 라벨은 표본이 적을 때만 전부, 많으면 듬성듬성(겹침 방지) */}
            {(pts.length <= 8 || i % 2 === 0 || i === pts.length - 1) && (
              <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="9.5" fill="rgb(var(--ink-muted))">{md(p.date)}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-input border border-border-subtle bg-surface-low p-2 text-center">
      <p className={`text-lg font-extrabold leading-none tabular-nums ${accent ? 'stat-violet' : 'text-ink-primary'}`}>{value}</p>
      <p className="mt-1 text-2xs text-ink-muted">{label}</p>
    </div>
  );
}

function HiCard({ title, name, detail }: { title: string; name: string; detail: string }) {
  return (
    <div className="rounded-aura border card-aura p-3">
      <p className="text-2xs font-bold stat-violet">{title}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-ink-primary">{name}</p>
      <p className="text-2xs text-ink-muted">{detail}</p>
    </div>
  );
}

/** 레벨 도감 — 전체 12레벨·칭호·필요 점수 + 현재 레벨 강조 + 점수 올리는 법. */
function LevelGuideModal({ points, onClose }: { points: number; onClose: () => void }) {
  const idOn = useIdentityEnabled(); // 못 받는 보상을 '받는다'고 적어 두지 않기 위해
  const tiers = allTiers();
  const cur = tierOf(points);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-dialog border border-border-default bg-surface-mid p-4 animate-slide-up sm:rounded-dialog">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink-primary"><Icon name="medal" size={15} /> 레벨 도감</p>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        <p className="mb-3 text-2xs leading-relaxed text-ink-muted">활동점수가 쌓이면 레벨이 오릅니다. 지금은 <b className="text-accent-300">Lv {cur.level} · {cur.title}</b>.</p>
        <ul className="space-y-1.5">
          {tiers.map((t) => {
            const isCur = t.level === cur.level;
            const reached = points >= t.min;
            return (
              <li key={t.key} className={['flex items-center gap-2.5 rounded-input border px-3 py-2', isCur ? 'border-accent-400/60 bg-accent-300/10' : reached ? 'border-border-subtle bg-surface-low' : 'border-border-subtle bg-surface-low opacity-50'].join(' ')}>
                <TierBadge points={t.min} size={24} />
                <p className="min-w-0 flex-1 text-sm font-bold" style={{ color: reached ? tierCss(t.colorVar) : undefined }}>
                  Lv {t.level} · {t.title}
                  {isCur && <span className="ml-1.5 rounded-badge bg-accent-300 px-1.5 py-0.5 align-middle text-2xs font-bold text-white">현재</span>}
                </p>
                <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{t.min.toLocaleString()}점~</span>
              </li>
            );
          })}
          <li className="flex items-center gap-2.5 rounded-input border border-gold-400/40 bg-gold-300/[0.06] px-3 py-2">
            <Icon name="spade" size={18} className="shrink-0 text-gold-300" />
            <p className="min-w-0 flex-1 text-sm font-bold text-gold-300">에이스 (AA)</p>
            <span className="shrink-0 text-2xs text-ink-muted">14,000점 + 전체 상위 10위</span>
          </li>
        </ul>
        <div className="mt-3 rounded-card border border-border-subtle bg-surface-low p-2.5 text-2xs leading-relaxed text-ink-secondary">
          <b className="text-ink-primary">점수 올리는 법</b><br />
          · 접속 +1 · 글쓰기 +3 · 댓글 +1<br />
          · 친구 초대(본인인증) +500 · 추천 가입 +300{!idOn && <span className="text-ink-muted">본인인증 준비 중이라 잠시 중단</span>}<br />
          · 시즌 1·2·3위 +1,000 / +500 / +300
        </div>
      </div>
    </div>
  );
}

/** 레벨·칭호 — 활동점수 기반 레벨(1~12)·한글 칭호 + 다음 레벨까지 진행바. */
function LevelCard({ points, championships = 0 }: { points: number; championships?: number }) {
  const t = tierOf(points);
  const prog = tierProgress(points);
  const [guide, setGuide] = useState(false);
  return (
    <section className="rounded-aura border card-aura p-3">
      <div className="flex items-center gap-2">
        <TierBadge points={points} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-primary">Lv {t.level} · <span style={{ color: tierCss(t.colorVar) }}>{t.title}</span></p>
          <p className="text-2xs text-ink-muted">활동점수 <b className="stat-violet tabular-nums">{points.toLocaleString()}</b>점</p>
        </div>
        {championships > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-badge border border-gold-400/40 bg-gold-300/10 px-1.5 py-1 text-2xs font-bold text-gold-300 tabular-nums" title="시즌 우승 영구 배지"><Icon name="crown" size={12} /> {championships}</span>
        )}
        <button type="button" onClick={() => setGuide(true)} className="btn-ghost inline-flex shrink-0 items-center gap-1 px-2 py-1 text-2xs"><Icon name="medal" size={12} /> 도감</button>
      </div>
      {guide && <LevelGuideModal points={points} onClose={() => setGuide(false)} />}
      {prog.next ? (
        <div className="mt-2.5">
          {/* XP 바 — 현재 점수/다음 레벨 필요 점수 + 바 끝 다음 등급 뱃지 미리보기 */}
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-float">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round(prog.ratio * 100)}%`, background: `linear-gradient(90deg, ${tierCss(t.vividVar)}, ${tierCss(prog.next.vividVar)})` }} />
            </div>
            <span className="shrink-0" title={`다음 레벨 ${prog.next.label} · ${prog.next.title}`}><TierBadge points={prog.next.min} size={15} /></span>
          </div>
          <p className="mt-1 flex items-center justify-between text-2xs text-ink-muted">
            <span>다음 레벨 <b style={{ color: tierCss(prog.next.colorVar) }}>{prog.next.title}</b>까지 <b className="text-ink-secondary tabular-nums">{prog.toNext.toLocaleString()}</b>점</span>
            <span className="tabular-nums"><b className="text-ink-secondary">{points.toLocaleString()}</b> / {prog.next.min.toLocaleString()}</span>
          </p>
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1 text-2xs font-bold text-gold-300"><Icon name="trophy" size={12} className="shrink-0" /> 최고 레벨 달성! 활동을 이어가 명예의 전당에 도전하세요.</p>
      )}
    </section>
  );
}

/** 친구 초대 — 추천 링크(닉네임 코드) + 현황. 친구 가입+본인인증 시 양쪽 활동점수(+500/+300). */
function InviteSection({ nickname, stats, idOn }: { nickname: string; stats: ReferralStats; idOn: boolean }) {
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const url = nickname ? inviteUrl(nickname) : '';
  useEffect(() => { if (url) QRCode.toDataURL(url, { width: 200, margin: 1 }).then(setQr).catch(() => {}); }, [url]);

  if (!nickname) {
    return (
      <section className="rounded-aura border card-aura p-3">
        <div className="flex items-center gap-2"><Tile icon="gift" tone="fuchsia" /><h2 className="text-sm font-bold text-ink-primary">친구 초대</h2></div>
        <p className="mt-1.5 text-2xs leading-relaxed text-ink-secondary">받는 아이디(닉네임)를 설정하면 내 초대 링크가 생깁니다. 프로필에서 설정하세요.</p>
      </section>
    );
  }
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.show('초대 링크를 복사했어요', 'success'); } catch { toast.show('복사 실패', 'error'); } };
  const share = async () => {
    const text = idOn
      ? 'NURI HOLDEM 같이 해요! 내 링크로 가입하고 본인인증하면 둘 다 활동점수 받아요'
      : 'NURI HOLDEM 같이 해요! 내 링크로 가입하고 함께 대회 일정·전적을 챙겨요';
    if (navigator.share) { try { await navigator.share({ title: 'NURI HOLDEM 초대', text, url }); return; } catch { return; } }
    copy();
  };
  const kakao = async () => {
    const ok = await kakaoShareLink({ title: 'NURI HOLDEM 초대 🎁', description: idOn ? '내 링크로 가입하고 본인인증하면 둘 다 활동점수를 받아요!' : '내 링크로 가입하고 함께 대회 일정·전적을 챙겨요!', link: url });
    if (!ok) { toast.show('카카오 공유가 미설정이라 링크를 복사했어요', 'info'); copy(); }
  };
  return (
    <section className="rounded-aura border card-aura p-3">
      <div className="flex items-center gap-2">
        <Tile icon="gift" tone="fuchsia" />
        <h2 className="text-sm font-bold text-ink-primary">친구 초대</h2>
        <span className="ml-auto shrink-0 text-2xs text-ink-muted">초대 <b className="text-ink-secondary tabular-nums">{stats.invited}</b> · 보상 <b className="stat-fuchsia tabular-nums">{stats.rewarded}</b></span>
      </div>
      <p className="mt-1.5 text-2xs leading-relaxed text-ink-secondary">{idOn
        ? <>친구가 내 링크로 가입하고 <b className="text-ink-primary">본인인증</b>까지 마치면 <b className="text-accent-300">둘 다 활동점수</b>(나 +500 · 친구 +300)!</>
        : <>초대 기록은 계속 쌓입니다. <b className="text-accent-300">활동점수 보상</b>(나 +500 · 친구 +300)은 본인인증이 다시 열리면 지급돼요.</>}</p>
      <div className="mt-2 flex items-center gap-2.5">
        {qr && <img src={qr} alt="초대 QR" className="h-16 w-16 shrink-0 rounded bg-white p-0.5" />}
        <div className="min-w-0 flex-1">
          <div className="truncate rounded-input border border-border-subtle bg-surface-base px-2.5 py-1.5 text-2xs text-ink-muted">{url}</div>
          <div className="mt-1.5 flex gap-1.5">
            <button type="button" onClick={copy} className="btn-ghost inline-flex flex-1 items-center justify-center gap-1 px-2 py-1 text-2xs"><Icon name="copy" size={12} /> 복사</button>
            {kakaoConfigured() && <button type="button" onClick={kakao} className="flex-1 rounded-input px-2 py-1 text-2xs font-bold text-[#3C1E1E]" style={{ background: '#FEE500' }}>카톡 공유</button>}
            <button type="button" onClick={share} className="btn-primary inline-flex flex-1 items-center justify-center gap-1 px-2 py-1 text-2xs"><Icon name="share" size={12} /> 공유</button>
          </div>
        </div>
      </div>
    </section>
  );
}
