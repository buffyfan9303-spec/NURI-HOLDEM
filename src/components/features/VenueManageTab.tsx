import { useEffect, useState, useDeferredValue, type ReactNode, useRef, memo, useCallback, useMemo } from 'react';
import Icon, { type IconName } from '../atoms/Icon';
import { useAuth } from '../../contexts/AuthContext';
import { useBackClose } from '../../lib/backstack';
import { useToast } from '../atoms/Toast';
import type { User, VenueInvite } from '../../api/auth';
import { getMyVenueStaff, getMyVenueInvites, inviteStaffByEmail, cancelStaffInvite, removeStaff, setStaffTitle } from '../../api/auth';
import { msgOf } from '../../lib/dbError';
import { getVenueRankings, saveVenueRankings, getVenuePageConfig, placementPointsOf, prizeUnitRisk, searchRankingMembers, resolveRankingMembers, type VenuePageConfig, type RankingEntry, type RankMember } from '../../api/rankings';
import { canAccessLedger, canManagePos, getLedgerAccessUserIds, grantLedgerAccess, revokeLedgerAccess } from '../../api/ledger';
import { getAllVenues, createMyVenue, getMyVenue, getVenueStaff, type Venue } from '../../api/community';
import { getLedgerRange } from '../../api/ledger';
import { uploadPoster } from '../../lib/storage';
import VenueVerificationCard from './VenueVerificationCard';
import NuriPosLedger, { type LedgerSeed } from './NuriPosLedger';
import StoreToolsPanel from './StoreToolsPanel';
import LedgerStatsPanel, { PosSettingsPanel } from './LedgerStatsPanel';
import TournamentClock from './clock/TournamentClock';
import AnnouncePanel from './AnnouncePanel';
import SeasonPanel from './SeasonPanel';
import PresetManager from './PresetManager';
import KillSwitch from './KillSwitch';
import StaffSchedule from './StaffSchedule';
import { StaffWageManager, StaffSettlement, StaffWorkLog, StaffSelfAttendance } from './StaffPayroll';
import StoreDashboard from './StoreDashboard';
import { VoucherManagePanel } from './VoucherManageModal';
import { useIdentityEnabled } from '../../lib/identityFlag'; // 본인인증·매장이용권 통합 킬스위치(2026-08-29)
import { listVoucherNotes, iCanViewVouchers, getVoucherAccessUserIds, grantVoucherAccess, revokeVoucherAccess, findUserForTransfer, issueVoucher, isVoucherIssueApproved, getVoucherQuota, type TransferTarget } from '../../api/vouchers';
import MyPostersTab from './MyPostersTab';
import VenueCustomizePanel, { VenueRankHub } from './VenueCustomizePanel';
import SectionHeader from '../atoms/SectionHeader';
import SlidingPill from '../atoms/SlidingPill';
import { getSchedules, type Schedule } from '../../api/schedules';
import { getLedgerBuyins, getLedgerSession, kstToday, getPendingBuyinRequests, subscribeBuyinRequests, getLedgerGames, MAIN_GAME_SEQ, type LedgerGame } from '../../api/ledger';
import { getVenueClocks, subscribeClock, effectiveLevel, type ClockState } from '../../api/clock';
import { rankDraftKey, readRowsDraft, writeRowsDraft, clearRowsDraft, pruneRowsDrafts, hasRowContent, moveRankRow, type RankRow } from '../../lib/rankingDraft';
import { onColorInkClass } from '../../lib/color';

// 'league' 는 §12-A-1 오너 결정으로 제거(LEAGUE-FREEZE 의 클라이언트 절반 — 코드는 동결, 진입 경로만 0)
// IA2: 포스터·장부·클락·순위 4개 최상위 문(門)이 'game' 섹션의 4단계 스텝으로 통합 —
// 순차 운영 제품은 객체형이 아니라 워크플로형 내비여야 한다(§13-C). 자식 컴포넌트 props 무변경.
// IA3c: 프리셋·매장랭킹·매장꾸미기·이용권·POS설정 5개 문(門)이 '매장 설정' 하위탭으로 통합
type Section = 'dashboard' | 'game' | 'stats' | 'staff' | 'attendance' | 'settings';
type GameStep = 'posters' | 'ledger' | 'clock' | 'ranking';
type SettingsTab = 'page' | 'presets' | 'pos' | 'voucher' | 'optools' | 'danger';
/** keep-alive box()·visited 의 단위 — 섹션 / 게임 스텝 / 설정 하위탭 */
type PaneId = Exclude<Section, 'game' | 'settings'> | GameStep | SettingsTab;
const GAME_STEPS: readonly { id: GameStep; label: string }[] = [
  { id: 'posters', label: '포스터·예약' }, { id: 'ledger', label: '장부' },
  { id: 'clock', label: '클락' }, { id: 'ranking', label: '순위' },
];
const isGameStep = (s: string): s is GameStep => GAME_STEPS.some((g) => g.id === s);
const SETTINGS_TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: 'page', label: '매장 페이지' }, { id: 'presets', label: '게임 프리셋' },
  { id: 'pos', label: 'POS·결제' }, { id: 'voucher', label: '이용권·QR' },
  { id: 'optools', label: '운영 도구' }, { id: 'danger', label: '위험 구역' },
];
const isSettingsTab = (s: string): s is SettingsTab => SETTINGS_TABS.some((t) => t.id === s);
// IA2 잔여(게임 선택 칩 바): 순위 입력에 전달하는 '오늘 게임 선택' 신호 — n 은 같은 게임 재선택도
// 다시 적용되게 하는 단조 카운터, name 은 순위(이벤트명 기반) 칸 이름(''=메인 기본).
type GameSel = { n: number; name: string };
// IA1: 사용 빈도 기반 3그룹 — 매일 여는 것(오늘) / 주간(분석) / 가끔(관리)
type NavGroup = '오늘' | '분석' | '관리';
const NAV_GROUPS: readonly NavGroup[] = ['오늘', '분석', '관리'];

// LINK-MAP(§15.6 #9): 알림 딥링크 id 정규화의 단일 지점 — 구 번들·기발송 푸시의 구 id 를 계속 수용.
// IA2 확장 완료: ledger|clock|ranking|posters → 게임 스텝. 미지 값은 null → 호출부가 대시보드 + 토스트.
const DEEP_SECTION_ALIAS: Record<string, Section | GameStep | SettingsTab> = {
  dashboard: 'dashboard', posters: 'posters', presets: 'presets', ledger: 'ledger', stats: 'stats',
  ranking: 'ranking', staff: 'staff', clock: 'clock', attendance: 'attendance', game: 'ledger',
  // IA3c: 구 섹션 id → 설정 하위탭('venueRank' 는 매장 페이지 탭에 병합, 구 'settings' = POS)
  venueRank: 'page', voucher: 'voucher', page: 'page', settings: 'pos', optools: 'optools',
  league: 'dashboard', // §12-A-1 제거 — 구 알림의 무음 실패 방지(대시보드 착지)
};
const normalizeDeepSection = (raw: string): Section | GameStep | SettingsTab | null => DEEP_SECTION_ALIAS[raw] ?? null;

// 메뉴 전환 잰크 제거 — 방문 섹션은 마운트 유지(display 토글)라, 부모(VenueManageTab) 재렌더 시
// 숨겨진 무거운 섹션들이 전부 재조정(reconcile)되며 프레임을 잡아먹었다. memo 로 감싸 prop 이
// 그대로면 재렌더를 건너뛴다 → 전환 시 "나가는 섹션 + 들어오는 섹션"만 재렌더(active 변경분).
// (active 게이팅은 내부 작업만 멈출 뿐 재렌더 자체는 못 막아서 이 한 겹이 빠져 있었음.)
const StoreDashboardM = memo(StoreDashboard);
const NuriPosLedgerM = memo(NuriPosLedger);
const StoreToolsPanelM = memo(StoreToolsPanel);
const LedgerStatsPanelM = memo(LedgerStatsPanel);
const TournamentClockM = memo(TournamentClock);
const MyPostersTabM = memo(MyPostersTab);
const PresetManagerM = memo(PresetManager);
const SeasonPanelM = memo(SeasonPanel);
const VenueCustomizePanelM = memo(VenueCustomizePanel);
const VoucherManagePanelM = memo(VoucherManagePanel);
const AnnouncePanelM = memo(AnnouncePanel);
const VenueRankHubM = memo(VenueRankHub);
const PosSettingsPanelM = memo(PosSettingsPanel);
const StaffSelfAttendanceM = memo(StaffSelfAttendance);

/** 업주/직원 전용 "매장 관리" 탭 — 장부(POS) · 통계 · 순위 입력 · (업주) 직원 관리 */
export default function VenueManageTab({ schedules, onCreatePoster, onEditPoster, onDeletePoster, deepSection, onConsumeDeepSection, tabActive = true }: {
  schedules: Schedule[]; onCreatePoster: () => void; onEditPoster: (id: string) => void; onDeletePoster: (id: string) => void;
  /** 알림 딥링크 등 외부 진입 — 지정 섹션/게임스텝으로 바로 이동(1회 소비, 구 id 는 LINK-MAP 이 정규화) */
  deepSection?: Section | GameStep | null;
  onConsumeDeepSection?: () => void;
  /** 탭 keep-alive: '내 매장' 탭이 화면에 보이는가 — 숨김이면 섹션 active 를 전부 끈다(구독·틱 정지) */
  tabActive?: boolean;
}) {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const isOwner = user?.role === 'venue_owner';
  const isAdmin = user?.role === 'admin';
  const canStaff = isOwner || isAdmin; // 직원 관리·POS 설정 접근
  const canPosters = isOwner || isAdmin; // 포스터·예약 관리
  const [adminVenues, setAdminVenues] = useState<Venue[]>([]);
  const [adminVenueId, setAdminVenueId] = useState<string | null>(null);
  // 운영자는 선택한 매장, 그 외는 본인 소속 매장
  const venueId: string | null = isAdmin ? adminVenueId : (user?.venueId ?? null);
  const [section, setSection] = useState<Section | null>(null);
  // IA2: 게임 진행 스텝 — 마지막 사용 스텝을 기억해 착지(대시보드 '지금 할 일' CTA 는 정확한 스텝을 직접 지정)
  const [gameStep, setGameStep] = useState<GameStep>(() => {
    try { const v = localStorage.getItem('nuri:game-step'); if (v && isGameStep(v)) return v; } catch { /* noop */ }
    return 'ledger';
  });
  useEffect(() => { try { localStorage.setItem('nuri:game-step', gameStep); } catch { /* noop */ } }, [gameStep]);
  // IA3c: 설정 하위탭 상태(기본 '매장 페이지')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('page');
  const renderSettingsTab = useDeferredValue(settingsTab);
  // 스텝 백스택(§13-C: 백버튼 스텝→섹션→탭 3단) — 직전 스텝 1개를 기억해 back 1회 흡수
  const [stepHist, setStepHist] = useState<GameStep[]>([]);
  const gameStepRef = useRef<GameStep>(gameStep);
  useEffect(() => { gameStepRef.current = gameStep; }, [gameStep]);
  const inGameRef = useRef(false);
  useEffect(() => { inGameRef.current = section === 'game'; }, [section]);
  const [navOpen, setNavOpen] = useState(false); // 모바일 메뉴 아코디언 펼침
  const [ledgerOk, setLedgerOk] = useState(false); // 장부 접근(업주/운영자/권한직원)
  const [manageOk, setManageOk] = useState(false); // 통계·설정(업주/운영자)
  const [voucherViewRaw, setVoucherView] = useState(false); // 매장이용권 내역 열람 '권한'(업주/권한직원)
  // 킬스위치(2026-08-29). 권한(voucherViewRaw)은 서버 판정 그대로 두고 **노출만** 덮는다 —
  // 켜는 순간 권한 재계산 없이 원래 화면이 그대로 돌아오게(비활성화이지 삭제가 아니다).
  const idOn = useIdentityEnabled();
  const voucherView = voucherViewRaw && idOn;
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [rankingDraft, setRankingDraft] = useState<{ date: string; names: string[]; event?: string } | null>(null);
  const [clockSeed, setClockSeed] = useState<string | null>(null); // 장부→클락 연동 날짜
  const [clockSeedGame, setClockSeedGame] = useState(1); // 장부→클락 연동 게임(game_seq)
  const [ledgerSeed, setLedgerSeed] = useState<LedgerSeed | null>(null); // 게임관리→장부 바로가기
  // IA2 잔여(게임 선택 칩 바): 매장 수준 '현재 게임'의 정본은 기존 clockSeedGame(상태 신설 0) —
  // 클락은 seedGameSeq 배선으로 즉시 따라오고, 순위(이벤트명 기반)엔 아래 픽 신호만 얹는다.
  const [gameSel, setGameSel] = useState<GameSel | null>(null);
  const [ledgerFollow, setLedgerFollow] = useState<{ seq: number; n: number } | null>(null); // 칩 픽 → 장부 보드 추종
  const gameSelN = useRef(0);
  const [visited, setVisited] = useState<PaneId[]>([]); // 방문 판(섹션/게임스텝, 최근순) — 마운트 유지(깜빡임 제거), 상한 초과 시 가장 오래된 판 정리(메모리 가드)

  // 스텝 이동 공통(IA2) — 게임 섹션 안에서의 이동은 직전 스텝을 백스택에 1개 기억.
  // 장부를 메뉴/칩으로 직접 열 땐 게임관리 시드를 지워 일반 진입으로(시드 부착 진입은 keepLedgerSeed).
  const goStep = useCallback((s: GameStep, opts?: { keepLedgerSeed?: boolean }) => {
    if (s === 'ledger' && !opts?.keepLedgerSeed) setLedgerSeed(null);
    if (inGameRef.current && gameStepRef.current !== s) {
      const prev = gameStepRef.current;
      setStepHist((h) => [...h.filter((x) => x !== prev), prev].slice(-4));
    }
    gameStepRef.current = s;
    setGameStep(s);
    setSection('game');
  }, []);
  // IA3c 하위탭 노출 판정의 **단일 지점** — 탭 목록·딥링크 착지·판(pane) 렌더가 서로 갈리면
  // "탭 바에는 없는 탭이 열려 있는" 빈 화면이 된다. 실제로 두 조합이 그랬다:
  //  ① 이용권 킬스위치 OFF 인데 알림 딥링크가 voucher 를 지정 → 제목만 '이용권·QR' 인 백지
  //  ② 이용권 열람 권한만 있는 직원(canStaff=false)이 '매장 설정' 첫 진입 → 기본값 'page' 가
  //     권한 밖이라 백지. 볼 수 있는 탭이 하나 있는데도 아무것도 안 보인다.
  const canSettingsTab = useCallback((t: SettingsTab) => (
    t === 'voucher' ? (idOn && (manageOk || voucherView))
      : t === 'danger' ? (isOwner && !!venueId)
        : canStaff
  ), [idOn, manageOk, voucherView, isOwner, venueId, canStaff]);
  const firstSettingsTab = useCallback((): SettingsTab => SETTINGS_TABS.find((t) => canSettingsTab(t.id))?.id ?? 'page', [canSettingsTab]);
  // 섹션 이동 공통 — 레거시 게임 스텝·설정 하위탭 id 도 수용(StoreDashboard·라이브바·딥링크)
  const gotoSection = useCallback((s: Section | GameStep | SettingsTab) => {
    if (isGameStep(s)) { goStep(s); return; }
    // 권한 밖 하위탭으로 착지 요청이 오면 백지 대신 '지금 열 수 있는 첫 탭'으로 흡수
    if (isSettingsTab(s)) { setSettingsTab(canSettingsTab(s) ? s : firstSettingsTab()); setSection('settings'); return; }
    setSection(s);
  }, [goStep, canSettingsTab, firstSettingsTab]);

  // ── memo 섹션에 넘기는 핸들러/객체 prop 을 참조 고정(재렌더 건너뛰기 조건 충족) ──
  // caps.voucher = '대시보드에 이용권 카드/단골 이용권 보내기를 그릴까' — 킬스위치가 그대로 반영된다.
  const caps = useMemo(() => ({ ledger: ledgerOk, manage: manageOk, voucher: idOn && (manageOk || voucherView), posters: canPosters, staff: canStaff }),
    [ledgerOk, manageOk, voucherView, canPosters, canStaff, idOn]);
  const onGotoStore = useCallback((s: string) => {
    // StoreDashboard·라이브바가 보내는 문자열 id — LINK-MAP 정규화로 구 id(page·venueRank·settings 등)도 흡수
    const t = normalizeDeepSection(s);
    gotoSection(t ?? 'dashboard');
  }, [gotoSection]);
  // 크로스 섹션 텔레포트였던 핸들러들이 IA2 로 '게임 섹션 내부 스텝 전환'으로 강등(§13-C)
  const onMakeRankingDraft = useCallback((d: string, names: string[], ev?: string) => {
    setGameSel(null); // 명단 초안(draft)이 우선 — 칩 픽 신호가 마운트 시 이벤트를 덮지 않게
    setRankingDraft({ date: d, names, event: ev ?? '' }); goStep('ranking');
  }, [goStep]);
  // IA2 잔여 — 게임 선택 칩 바 픽: 오늘 게임(메인/사이드N) 전환을 게임 단계 상단 한 곳으로.
  // 클락은 기존 clockSeedGame 배선으로 따라오고(시드 날짜는 걷어내 '지금 그 게임 보기'로),
  // 순위는 gameSel 신호로, 장부 보드는 followGame 신호(NuriPosLedger 제어 prop)로
  // 오늘·해당 게임에 함께 착지한다 — 칩 하나로 장부·클락·순위 3면이 같은 게임을 본다.
  const onPickGame = useCallback((seq: number, title?: string) => {
    setClockSeed(null);
    setClockSeedGame(seq);
    const n = ++gameSelN.current;
    setGameSel({ n, name: seq === MAIN_GAME_SEQ ? '' : ((title ?? '').trim() || `사이드${seq - 1}`) });
    setLedgerFollow({ seq, n });
  }, []);
  const onOpenClockFromLedger = useCallback((d: string, g: number) => {
    setClockSeed(d); setClockSeedGame(g); goStep('clock');
  }, [goStep]);
  const onOpenStatsCb = useCallback(() => setSection('stats'), []);
  const onGotoRankingFromPosters = useCallback((date: string) => {
    setGameSel(null); // 포스터가 지정한 날짜가 우선 — 칩 픽 신호가 마운트 시 오늘로 덮지 않게
    setRankingDraft({ date, names: [] }); goStep('ranking');
  }, [goStep]);
  const onOpenLedgerFromPosters = useCallback((s: Schedule, existingDate: string | null) => {
    const schedDate = new Date(s.date).toLocaleDateString('en-CA');
    setLedgerSeed(existingDate
      ? { date: existingDate, scheduleId: s.id, isNew: false }
      : { date: schedDate, scheduleId: s.id, isNew: true, title: s.title, buyinAmount: s.buyIn?.amount ?? 0, gtd: !!s.guaranteed });
    goStep('ledger', { keepLedgerSeed: true });
  }, [goStep]);
  // 뒤로가기 3단(§13-C): ①게임 스텝(직전 스텝 1회) → ②섹션(대시보드) → ③탭 이탈
  useBackClose(!!section && section !== 'dashboard', () => gotoSection('dashboard'));
  useBackClose(section === 'game' && stepHist.length > 0, () => {
    setStepHist((h) => {
      const prev = h[h.length - 1];
      if (prev) { gameStepRef.current = prev; setGameStep(prev); }
      return h.slice(0, -1);
    });
  });
  // 방문 판(섹션/스텝)을 최근순으로 기록 + 상한(8) 초과 시 가장 오래된 판 언마운트(메모리 가드).
  // 잰크는 active 게이팅(클락·라이브·장부)으로 이미 차단했고, 이건 순수 메모리/구독 누적 방지용.
  const pane: PaneId | null = section === 'game' ? gameStep : section === 'settings' ? settingsTab : section;
  useEffect(() => {
    if (!pane) return;
    setVisited((v) => {
      const next = [...v.filter((x) => x !== pane), pane];
      return next.length > 8 ? next.slice(next.length - 8) : next;
    });
  }, [pane]);

  // 시즌 '역대 챔피언' 카드 공유에 찍히는 매장명 — prop 이 비어 있어 카드에서 매장명 줄이 통째로
  // 빠져 있었다. 첫 진입 비용 0 을 지키려고 '매장 설정 > 매장 페이지'를 실제로 연 뒤에만 조회한다.
  const [venueName, setVenueName] = useState('');
  const needVenueName = visited.includes('page');
  useEffect(() => {
    if (!venueId || !needVenueName) return;
    if (isAdmin) { setVenueName(adminVenues.find((v) => v.id === venueId)?.name ?? ''); return; }
    let alive = true;
    getMyVenue().then((v) => { if (alive && v?.id === venueId) setVenueName(v.name); }).catch(() => { /* 이름은 장식 — 실패해도 카드는 나간다 */ });
    return () => { alive = false; };
  }, [venueId, isAdmin, adminVenues, needVenueName]);

  // 권한 조회가 끝났거나(직원) 킬스위치가 꺼져 현재 하위탭이 사라졌으면 첫 노출 탭으로 이동.
  // (탭 바에서 사라진 탭이 그대로 열려 있으면 판이 렌더되지 않아 백지가 된다)
  useEffect(() => {
    if (!permsLoaded) return;
    if (!canSettingsTab(settingsTab)) setSettingsTab(firstSettingsTab());
  }, [permsLoaded, settingsTab, canSettingsTab, firstSettingsTab]);

  // 알림 딥링크("📒 장부 시작" 클릭 등) — 권한 확인이 끝나면 지정 섹션으로 1회 이동
  useEffect(() => {
    if (!deepSection || !permsLoaded) return;
    // LINK-MAP 정규화 → IA1 폴백: 없는 섹션이면 무음 실패 대신 대시보드 + 안내(§15.6 #9)
    const target = normalizeDeepSection(deepSection);
    const targetSection: Section | null = target == null ? null
      : isGameStep(target) ? 'game' : isSettingsTab(target) ? 'settings' : target;
    if (!targetSection || !available.some((a) => a.id === targetSection)) {
      toast.show('요청한 메뉴를 찾을 수 없어 대시보드로 이동했어요', 'error');
      gotoSection('dashboard');
    } else {
      gotoSection(target as Section | GameStep | SettingsTab);
    }
    onConsumeDeepSection?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepSection, permsLoaded]);

  // ★ 즐겨찾기는 IA1 에서 전량 삭제 — 5섹션 그룹 구조에선 '제품이 중요도를 못 정해 정렬을 외주 준' 장치가 무의미.
  // 기존 localStorage(nuri:fav-sections:*) 값은 읽지 않고 방치(마이그레이션 불필요).

  // IA3d 점진적 공개 — 성숙도 게이팅(권한 게이팅과 분리, §13-C). 숨김은 잠금이 아니라 '아예 비노출':
  // 잠금은 '언젠가 열림'을 약속하지만 성숙도는 저절로 열리므로 설명이 필요 없다.
  // 해금: 매출·손님 ← 장부 마감 3회(90일) / 직원 관리 ← 직원 1명+. 캐시로 재방문 깜빡임 방지.
  const [navAll, setNavAll] = useState(false);
  useEffect(() => {
    if (!venueId) return;
    try { setNavAll(localStorage.getItem(`nuri:nav-mode:${venueId}`) === 'all'); } catch { /* noop */ }
  }, [venueId]);
  const toggleNavAll = () => setNavAll((v) => {
    const n = !v;
    try { if (venueId) localStorage.setItem(`nuri:nav-mode:${venueId}`, n ? 'all' : 'auto'); } catch { /* noop */ }
    return n;
  });
  const [matured, setMatured] = useState<{ insights: boolean; team: boolean }>(() => {
    try { const v = localStorage.getItem('nuri:nav-matured'); if (v) return JSON.parse(v) as { insights: boolean; team: boolean }; } catch { /* noop */ }
    return { insights: false, team: false };
  });
  useEffect(() => {
    if (!venueId || !canStaff || isAdmin) return;
    let alive = true;
    const to = new Date().toLocaleDateString('en-CA');
    const from = new Date(Date.now() - 90 * 86_400_000).toLocaleDateString('en-CA');
    Promise.allSettled([getVenueStaff(venueId), getLedgerRange(venueId, from, to)]).then(([st, lr]) => {
      if (!alive) return;
      const team = st.status === 'fulfilled' && st.value.length > 0;
      const insights = lr.status === 'fulfilled' && lr.value.sessions.filter((x) => x.closed).length >= 3;
      const next = { insights, team };
      setMatured((cur) => (cur.insights === next.insights && cur.team === next.team ? cur : next));
      try { localStorage.setItem('nuri:nav-matured', JSON.stringify(next)); } catch { /* noop */ }
    });
    return () => { alive = false; };
  }, [venueId, canStaff, isAdmin]);

  // 운영자: 전체 매장 목록 로드(선택용)
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    getAllVenues()
      .then((vs) => { if (alive) { setAdminVenues(vs); setAdminVenueId((cur) => cur ?? vs[0]?.id ?? null); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAdmin]);

  // 권한 확인 후 첫 화면 결정 — 장부 우선(없으면 통계 → 순위). 운영자는 전권이라 조회 생략.
  useEffect(() => {
    if (!venueId) { setPermsLoaded(false); return; }
    let alive = true;
    if (isAdmin) {
      setLedgerOk(true); setManageOk(true); setVoucherView(true);
      setSection((s) => s ?? 'dashboard');
      setPermsLoaded(true);
      return () => { alive = false; };
    }
    setPermsLoaded(false);
    Promise.all([canAccessLedger(venueId), canManagePos(venueId), iCanViewVouchers(venueId)])
      .then(([l, m, vv]) => {
        if (!alive) return;
        setLedgerOk(l); setManageOk(m); setVoucherView(vv);
        setSection((s) => s ?? 'dashboard');
      })
      .catch(() => { if (alive) setSection(null); })
      .finally(() => { if (alive) setPermsLoaded(true); });
    return () => { alive = false; };
  }, [venueId, isAdmin]);

  // L4: 권한을 부여받은 직후 창에 다시 포커스되면 권한 재조회 → 재진입/새로고침 없이 탭 갱신
  useEffect(() => {
    if (!venueId || isAdmin) return;
    const recheck = () => {
      Promise.all([canAccessLedger(venueId), canManagePos(venueId), iCanViewVouchers(venueId)])
        .then(([l, m, vv]) => { setLedgerOk(l); setManageOk(m); setVoucherView(vv); })
        .catch(() => { /* keep current */ });
    };
    window.addEventListener('focus', recheck);
    return () => window.removeEventListener('focus', recheck);
  }, [venueId, isAdmin]);

  // 섹션 노출 규칙(IA1 — 14개 평면 형제 → 사용 빈도 3그룹, 컴포넌트 마운트 이동 0):
  //  · 직원이 부여받을 수 있는 권한(장부)은 권한 없어도 '잠금' 탭으로 노출 → 클릭 시 "권한 없음" 안내(휑한 화면 방지).
  //  · 장부에 종속된 순위·클락·출근은 장부 권한이 있을 때만 노출(중복 잠금 방지).
  //  · 업주만 가능한 섹션(포스터·통계·직원·POS)은 직원에게 아예 숨김.
  //  · 이용권은 볼 수 있는 사람에게만 — 발행매장이 아니면 영원히 안 열리는 '잠금'은 거짓 약속이라 아예 비노출.
  //  · 연합리그 제거(§12-A-1) — 잠금이 아니라 진입 경로 자체를 없앤다.
  const available: { id: Section; label: string; group: NavGroup; locked?: boolean }[] = [{ id: 'dashboard', label: '대시보드', group: '오늘' }];
  // IA2: 포스터·장부·클락·순위 = '게임 진행' 한 문(門)의 4단계 스텝(권한 없으면 잠금 노출 유지)
  available.push({ id: 'game', label: '게임 진행', group: '오늘', locked: !ledgerOk && !canPosters });
  if (manageOk) available.push({ id: 'stats',  label: '매출·손님', group: '분석' });
  // ATT-FIX: '내 출퇴근 기록'이 장부 권한(ledgerOk)에 묶여 있어 장부 권한 없는 직원이
  // 자기 출퇴근을 못 보던 오게이팅 — 이 탭에 들어온 소속 구성원이면 누구나
  available.push({ id: 'attendance', label: '출근 관리', group: '관리' });
  if (canStaff) available.push({ id: 'staff', label: '직원 관리', group: '관리' });
  // IA3c: 프리셋·매장랭킹·매장꾸미기·이용권·POS 가 '매장 설정' 하위탭 5개로 통합
  if (canStaff || voucherView) available.push({ id: 'settings', label: '매장 설정', group: '관리' });
  // IA3d: nav 노출용 목록 — 성숙도 미달 항목 비노출(운영자·전체보기·직원 계정은 게이팅 없음).
  // 콘텐츠 접근(curItem·dItem·딥링크)은 available 기준 유지 — 숨김은 nav 표시만 줄인다.
  //
  // ⚠ 'staff' 는 게이팅에서 뺐다(2026-08-29). 해금 조건이 '직원 1명+' 인데 **첫 직원을 만드는
  //   유일한 화면(구성원 초대)이 그 안에** 있어 자기 자신을 잠그는 데드락이었다 —
  //   실측: 구성원 0명인 매장의 사이드바에 '직원 관리' 가 없고, '고급 기능 모두 보기' 를
  //   찾아내야만 초대에 도달한다. 점진적 공개는 '아직 쓸 일 없는 것' 을 미루는 장치지
  //   '쓰려면 반드시 거쳐야 하는 문' 을 잠그는 장치가 아니다.
  //   '매출·손님' 은 해금 조건(장부 마감 3회)이 **다른 문(게임 진행)에서** 만들어지므로 그대로 둔다.
  //   (matured.team 은 계산만 남는다 — 게이트를 되살릴 때 조건식이 이미 있게.)
  const navItems = (isAdmin || navAll || !canStaff) ? available
    : available.filter((a) => (a.id === 'stats' ? matured.insights : true));
  const navHiddenCount = available.length - navItems.length;
  const curItem = available.find((a) => a.id === section);
  // 콘텐츠 전환은 deferred — 내비(탭 하이라이트)는 즉시 반응하고, 무거운 섹션 렌더는 메인스레드를 막지 않고 양보.
  // 폰(저사양 CPU)에서 메뉴 이동 시 동기 렌더가 프레임을 막아 생기던 "치직임/끊김"을 제거.
  const renderSection = useDeferredValue(section);
  const renderGameStep = useDeferredValue(gameStep); // 스텝 전환도 deferred — 무거운 판 렌더가 칩 하이라이트를 막지 않게
  const dItem = available.find((a) => a.id === renderSection); // deferred 기준 — 헤더·잠금화면·콘텐츠가 한 번에 원자적으로 전환

  if (!user) return null;
  // 업주: 소속 매장이 없으면 '매장 생성' 화면. 직원: 매장/직원 승인 대기 안내.
  if (!isAdmin && !venueId) {
    if (isOwner) return <VenueCreateForm onCreated={refreshProfile} />;
    return (
      <div className="py-16 text-center text-sm text-ink-muted">
        소속된 매장이 없습니다. 직원 승인 후 이용할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3 mx-auto w-full max-w-5xl">
      {/* 운영자: 전 매장 접근 — 관리할 매장 선택 */}
      {isAdmin && (
        <div className="rounded-card border border-accent-400/40 bg-accent-300/[0.06] p-2.5 space-y-1.5">
          <p className="text-2xs font-bold text-accent-300">운영자 전체 접근 · 관리할 매장 선택</p>
          <select value={venueId ?? ''} onChange={(e) => setAdminVenueId(e.target.value || null)} className="input text-sm">
            {adminVenues.length === 0 && <option value="">불러오는 중…</option>}
            {adminVenues.map((v) => (
              <option key={v.id} value={v.id}>{v.name} · {v.region}{v.approved ? '' : ' (미승인)'}</option>
            ))}
          </select>
        </div>
      )}

      {isOwner && <VenueVerificationCard />}

      {!venueId ? (
        <p className="py-16 text-center text-sm text-ink-muted">관리할 매장을 선택하세요.</p>
      ) : !permsLoaded ? (
        <p className="py-16 text-center text-sm text-ink-muted">불러오는 중…</p>
      ) : section === null ? (
        <p className="py-16 text-center text-sm text-ink-muted">이 매장에서 사용 가능한 메뉴가 없습니다.<br />업주에게 장부 권한을 요청하세요.</p>
      ) : (
        <>
        {/* ST1 상시 게임 바 — 통계·직원 등 어느 섹션에서도 진행 클락·대기 바인요청이 보인다.
            대시보드는 자체 라이브 위젯이 있어 제외(중복 채널·중복 표시 방지). */}
        {venueId && renderSection !== 'dashboard' && (
          // 대시보드 진입 시 언마운트 → 구독도 함께 정리(중복 채널 방지)
          <StoreLiveBar venueId={venueId} active={tabActive} onGoto={gotoSection} />
        )}
        <div className="lg:flex lg:gap-4">
          {available.length > 1 && (<>
              {/* 모바일: 아코디언 — 현재 메뉴만 보이고, 탭하면 그룹별 전체 펼침(위로 다 몰지 않게) */}
              <div className="lg:hidden">
                <button type="button" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen}
                  className="flex w-full items-center gap-2 rounded-card border border-accent-400/30 bg-surface-high px-3 py-2.5">
                  <span className="shrink-0 text-accent-300" aria-hidden>{SECTION_ICON[section as Section]}</span>
                  <span className="min-w-0 flex-1 text-left text-sm font-bold text-ink-primary truncate">{curItem?.label ?? '메뉴'}</span>
                  <span className="text-2xs text-ink-muted">{navOpen ? '닫기' : '메뉴'}</span>
                  <Icon name="chevron-down" size={16} className={['shrink-0 text-ink-muted transition-transform', navOpen ? 'rotate-180' : ''].join(' ')} />
                </button>
                {navOpen && (
                  <div className="mt-1 rounded-card border border-border-subtle bg-surface-high p-1 animate-slide-up space-y-0.5">
                    {NAV_GROUPS.map((grp) => {
                      const items = navItems.filter((a) => a.group === grp);
                      if (items.length === 0) return null;
                      return (
                        <div key={grp}>
                          <p className="px-2 pb-0.5 pt-1.5 text-2xs font-bold text-ink-muted">{grp}</p>
                          <div className="grid grid-cols-2 gap-1">
                            {items.map((a) => {
                              const on = section === a.id;
                              return (
                                <button key={a.id} type="button" onClick={() => { gotoSection(a.id); setNavOpen(false); }}
                                  className={['flex min-w-0 items-center gap-2 rounded-input px-2.5 py-2.5 text-xs font-bold transition-colors',
                                    on ? 'pill-active text-white' : a.locked ? 'text-ink-muted/60' : 'text-ink-secondary hover:bg-surface-float'].join(' ')}>
                                  <span className="shrink-0" aria-hidden>{SECTION_ICON[a.id]}</span>
                                  <span className="min-w-0 flex-1 text-left truncate">{a.label}</span>
                                  {a.locked && <Icon name="lock" size={11} className="shrink-0 opacity-70" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {canStaff && !isAdmin && (navHiddenCount > 0 || navAll) && (
                      <button type="button" onClick={toggleNavAll}
                        className="w-full px-2 py-2 text-left text-2xs font-bold text-ink-muted transition-colors hover:text-ink-secondary">
                        {navAll ? '기본 메뉴만 보기' : `고급 기능 모두 보기 (+${navHiddenCount})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* PC: 세로 사이드바 — 그룹 헤더 3개 + 라이브 배지 자리(IA3 에서 공급), 폭 w-44→w-52 */}
              <nav className="hidden lg:flex lg:sticky lg:top-[calc(var(--stack-top,6.0625rem)+0.75rem)] lg:w-52 lg:shrink-0 lg:flex-col lg:self-start lg:gap-1">
                {NAV_GROUPS.map((grp) => {
                  const items = navItems.filter((a) => a.group === grp);
                  if (items.length === 0) return null;
                  return (
                    <div key={grp} className="flex flex-col gap-1">
                      <p className="px-3 pb-0.5 pt-2 text-2xs font-bold tracking-wide text-ink-muted">{grp}</p>
                      {items.map((a) => (
                        <SectionBtn key={a.id} icon={SECTION_ICON[a.id]} active={section === a.id} locked={a.locked}
                          onClick={() => gotoSection(a.id)}>{a.label}</SectionBtn>
                      ))}
                    </div>
                  );
                })}
                {/* IA3d: 성숙도로 숨긴 항목이 있으면 파워유저 탈출구 — 잠금 아이콘이 아니라 토글 */}
                {canStaff && !isAdmin && (navHiddenCount > 0 || navAll) && (
                  <button type="button" onClick={toggleNavAll}
                    className="mt-2 px-3 py-1.5 text-left text-2xs font-bold text-ink-muted transition-colors hover:text-ink-secondary">
                    {navAll ? '기본 메뉴만 보기' : `고급 기능 모두 보기 (+${navHiddenCount})`}
                  </button>
                )}
              </nav>
            </>)}

          <div className="mt-3 min-w-0 flex-1 space-y-3 lg:mt-0">
            {dItem?.locked && (
              <div className="rounded-card border border-border-default bg-surface-low p-6 text-center space-y-2.5">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-high text-ink-muted"><Icon name="lock" size={22} /></div>
                <p className="text-sm font-bold text-ink-primary">{dItem.label} · 접근 권한이 없습니다</p>
                <p className="text-2xs leading-relaxed text-ink-muted">이 기능은 업주가 권한을 부여해야 사용할 수 있어요.<br />매장 업주에게 <span className="font-semibold text-accent-300">장부·순위 권한</span>을 요청하세요.</p>
              </div>
            )}
            {/* IA2 잔여 — 게임 선택 칩 바(원문: '상단에 게임 선택 칩 바, 아래에 4단계 스테퍼').
                멀티게임(메인+사이드) 날에만 노출 — 단일 게임이면 바 자체를 그리지 않아 잡음 0 */}
            {renderSection === 'game' && !dItem?.locked && (
              <GameChipBar venueId={venueId} active={tabActive} step={renderGameStep} current={clockSeedGame}
                canPosters={canPosters} onPick={onPickGame} onNewGame={onCreatePoster} />
            )}
            {/* IA2 게임 진행 4단계 스테퍼 — 섹션을 떠나지 않고 작업판만 교체(포스터→장부→클락→순위) */}
            {renderSection === 'game' && !dItem?.locked && (
              <div role="tablist" aria-label="게임 진행 단계"
                className="relative flex items-center gap-0.5 overflow-x-auto rounded-input border border-border-subtle bg-surface-high/60 p-0.5">
                <SlidingPill activeKey={renderGameStep} className="rounded-[6px] pill-active" />
                {GAME_STEPS.filter((st) => (st.id === 'posters' ? canPosters : ledgerOk)).map((st, i) => {
                  const on = renderGameStep === st.id;
                  return (
                    <button key={st.id} type="button" role="tab" aria-selected={on} data-pill-active={on || undefined}
                      onClick={() => gotoSection(st.id)}
                      className={['relative inline-flex h-9 shrink-0 items-center rounded-[6px] px-3 t-tab leading-none transition-colors duration-300 focus:outline-none',
                        on ? 'font-bold text-white' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
                      <span className="relative">{i + 1}. {st.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {/* IA3c 매장 설정 하위탭 — 프리셋·페이지·POS·이용권·위험구역(권한별 노출) */}
            {renderSection === 'settings' && !dItem?.locked && (
              <div role="tablist" aria-label="매장 설정 하위탭"
                className="relative flex items-center gap-0.5 overflow-x-auto rounded-input border border-border-subtle bg-surface-high/60 p-0.5">
                <SlidingPill activeKey={renderSettingsTab} className="rounded-[6px] pill-active" />
                {SETTINGS_TABS.filter((t) => canSettingsTab(t.id)).map((t) => {
                  const on = renderSettingsTab === t.id;
                  return (
                    <button key={t.id} type="button" role="tab" aria-selected={on} data-pill-active={on || undefined}
                      onClick={() => gotoSection(t.id)}
                      className={['relative inline-flex h-9 shrink-0 items-center rounded-[6px] px-3 t-tab leading-none transition-colors duration-300 focus:outline-none',
                        on ? 'font-bold text-white' : t.id === 'danger' ? 'text-danger-light/80 hover:text-danger-light' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
                      <span className="relative">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {/* 공용 섹션 헤더 — 모든 섹션의 제목·설명·주 액션 위치/크기를 한 규격으로(콘텐츠와 함께 deferred 전환) */}
            {!dItem?.locked && (
              <SectionHeader
                title={renderSection === 'game'
                  ? (GAME_STEPS.find((s) => s.id === renderGameStep)?.label ?? '게임 진행')
                  : renderSection === 'settings'
                  ? (SETTINGS_TABS.find((t) => t.id === renderSettingsTab)?.label ?? '매장 설정')
                  : (dItem?.label ?? '')}
                desc={renderSection === 'game' ? SECTION_DESC[renderGameStep]
                  : renderSection === 'settings' ? SECTION_DESC[renderSettingsTab]
                  : renderSection ? SECTION_DESC[renderSection] : ''}
                action={renderSection === 'game' && renderGameStep === 'posters' && canPosters
                  ? <button type="button" onClick={onCreatePoster} className="btn-primary">+ 새 게임</button>
                  : undefined}
              />
            )}
            {/* 방문한 판(섹션/스텝)은 마운트 유지 — display 토글만(전환 시 unmount/remount·재fetch·깜빡임 제거). 토글 기준은 deferred */}
            {(() => {
              const box = (s: PaneId, node: ReactNode) => {
                const shown = isGameStep(s)
                  ? renderSection === 'game' && renderGameStep === s
                  : isSettingsTab(s)
                  ? renderSection === 'settings' && renderSettingsTab === s
                  : renderSection === s;
                return <div key={s} style={shown && !dItem?.locked ? undefined : { display: 'none' }}>{node}</div>;
              };
              return (<>
                {visited.includes('dashboard') && box('dashboard', <>
                  <StoreDashboardM venueId={venueId} schedules={schedules} onGoto={onGotoStore} onCreatePoster={onCreatePoster}
                    active={tabActive && renderSection === 'dashboard'} caps={caps} />
                  {manageOk && <div className="mt-4"><AnnouncePanelM venueId={venueId} /></div>}
                </>)}
                {visited.includes('posters') && canPosters && box('posters', <MyPostersTabM schedules={schedules} onCreate={onCreatePoster} onEdit={onEditPoster} onDelete={onDeletePoster}
                  onGotoRanking={ledgerOk ? onGotoRankingFromPosters : undefined}
                  onOpenLedger={ledgerOk ? onOpenLedgerFromPosters : undefined} />)}
                {visited.includes('presets') && canSettingsTab('presets') && box('presets', <PresetManagerM venueId={venueId} />)}
                {visited.includes('ledger') && ledgerOk && box('ledger', <NuriPosLedgerM venueId={venueId} canManage={manageOk} active={tabActive && renderSection === 'game' && renderGameStep === 'ledger'} seed={ledgerSeed}
                  followGame={ledgerFollow}
                  onMakeRankingDraft={onMakeRankingDraft}
                  onOpenClock={onOpenClockFromLedger}
                  onOpenStats={manageOk ? onOpenStatsCb : undefined} />)}
                {visited.includes('stats') && manageOk && box('stats', <LedgerStatsPanelM venueId={venueId} />)}
                {visited.includes('ranking') && ledgerOk && box('ranking', <RankingEditor venueId={venueId} canEdit={isAdmin || user.approved === true || ledgerOk} draft={rankingDraft} gameSel={gameSel} />)}
                {/* IA3c '매장 페이지' 탭 = 구 매장꾸미기 + 구 매장랭킹(시즌·랭킹보드) 병합 — 같은
                    venue_page_config 를 두 문에서 각자 로드/저장해 서로 낡던 문제를 한 화면으로 해소 */}
                {visited.includes('page') && canSettingsTab('page') && box('page', <>
                  <VenueCustomizePanelM venueId={venueId} />
                  {ledgerOk && <div className="mt-5 border-t border-border-subtle pt-4"><SeasonPanelM venueId={venueId} canManage={manageOk} venueName={venueName || undefined} /></div>}
                  {ledgerOk && <div className="mt-5 border-t border-border-subtle pt-4"><VenueRankHubM venueId={venueId} canConfigure={manageOk} /></div>}
                </>)}
                {visited.includes('clock') && ledgerOk && box('clock', <TournamentClockM venueId={venueId} canManage={ledgerOk} seedSessionDate={clockSeed} seedGameSeq={clockSeedGame} active={tabActive && renderSection === 'game' && renderGameStep === 'clock'} />)}
                {visited.includes('attendance') && box('attendance', <StaffSelfAttendanceM venueId={venueId} />)}
                {visited.includes('staff') && canStaff && box('staff', <StaffHub venueId={venueId} />)}
                {visited.includes('pos') && canSettingsTab('pos') && box('pos', <PosSettingsPanelM venueId={venueId} />)}
                {visited.includes('voucher') && canSettingsTab('voucher') && box('voucher', <VoucherManagePanelM venueId={venueId} />)}
                {/* §7 ⑥b: 운영 도구 5종 — GTO 탭에서 이관(레지스트리는 ToolsPanel 재사용) */}
                {visited.includes('optools') && canSettingsTab('optools') && box('optools', <StoreToolsPanelM />)}
                {/* 위험 구역(IA1→IA3c) — 매장 영구 삭제. 설정의 전용 하위탭으로 격리(접근 2단계) */}
                {visited.includes('danger') && canSettingsTab('danger') && venueId && box('danger', <KillSwitch venueId={venueId} />)}
              </>);
            })()}
          </div>
        </div>
        </>
      )}

    </div>
  );
}

// 섹션 설명 — 공용 SectionHeader에 표시(제목·설명·액션 규격 통일)
const SECTION_DESC: Record<Section | GameStep | SettingsTab, string> = {
  dashboard: '매장 운영 현황을 한눈에 — 오늘 장부·클락·추세·단골',
  game: '포스터 → 장부 → 클락 → 순위, 게임 하나를 단계로 진행합니다',
  posters: '게임(포스터)별 예약 관리 — 게임을 누르면 예약 리스트가 펼쳐집니다',
  presets: '게임 내용·듀레이션을 템플릿으로 저장 — 포스터/장부 없이 만들고 수정',
  ledger: '게임(세션)별 장부 — 날짜·게임명으로 검색해 열람·수정하세요',
  stats: '기간별 매출·엔트리·요일 분석',
  ranking: '대회 순위 등록 — 닉네임이 일치하는 회원에게 점수가 자동 반영됩니다',
  clock: '토너먼트 타이머 — 장부 연동 시 엔트리·생존이 자동 반영됩니다',
  attendance: '내 출퇴근 기록',
  voucher: '매장이용권 발행·사용 내역 + 매장 QR(이용권·출석 체크인·가입) 인쇄',
  page: '손님 화면 탭 순서 · 내 매장 링크 · 시즌 · 랭킹 보드 · 칭호 · 기준 점수 · 포인트',
  staff: '구성원·권한·출근 스케줄·인건비',
  settings: '매장 페이지 · 게임 프리셋 · POS·결제 · 운영 도구 · 위험 구역',
  // ⚠ 설명은 '이 화면에 실제로 있는 것'만 적는다 — 결제수단·할인 프리셋은 장부(세션 설정)에 있고
  //   여기엔 없다. 없는 것을 약속하면 사장님이 이 탭을 열고 찾다가 포기한다.
  pos: 'POS 취소 비밀번호 · 매장 알림 수신 · 공동 사장님 관리',
  optools: '토너먼트 세팅 계산기 — 칩 분배·구조·블라인드·상금·종료시간 (GTO 탭에서 이관)',
  danger: '매장 영구 삭제 — 복구할 수 없습니다. 신중하게.',
};

// 섹션 아이콘(라인 스타일 통일: 16px, stroke 1.8)
const ic = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const SECTION_ICON: Record<Section | GameStep | SettingsTab, ReactNode> = {
  game: ic(<><polygon points="6 4 20 12 6 20 6 4" /></>),
  dashboard: ic(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>),
  posters: ic(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-4.5-4.5L6 21" /></>),
  presets: ic(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>),
  ledger: ic(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>),
  stats: ic(<><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="9" /><line x1="18" y1="20" x2="18" y2="4" /></>),
  ranking: ic(<><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.7V18M14 14.7V18" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></>),
  clock: ic(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  attendance: ic(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></>),
  voucher: ic(<><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v14" /></>),
  pos: ic(<><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>),
  optools: ic(<><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="10" y2="10" /><line x1="14" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="10" y2="14" /><line x1="14" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="16" y2="18" /></>),
  danger: ic(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  staff: ic(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  page: ic(<><path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="m2 2 7.586 7.586" /><circle cx="11" cy="11" r="2" /></>),
  settings: ic(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>),
};

// ── ST1: 상시 게임 바 — 통계·직원 등 어느 섹션에서도 진행 클락·대기 바인요청이 보인다(§13-C).
// 데이터·게이팅은 StoreDashboard의 검증된 배선을 그대로 승격: venue 스코프 조회 + active 게이트 구독
// (전역 subscribeRunningClocks 금지 — §15.5 #9, venue 단위 채널만). 1초 틱은 이 컴포넌트로 국한.
const StoreLiveBar = memo(function StoreLiveBar({ venueId, active, onGoto }: {
  venueId: string; active: boolean; onGoto: (s: Section | GameStep) => void;
}) {
  const [clocks, setClocks] = useState<ClockState[]>([]);
  const [pending, setPending] = useState(0);
  const [, setTick] = useState(0);
  const reload = useCallback(() => {
    getVenueClocks(venueId).then(setClocks).catch(() => {});
    getPendingBuyinRequests(venueId, kstToday()).then((r) => setPending(r.length)).catch(() => {});
  }, [venueId]);
  useEffect(() => { if (active) reload(); }, [active, reload]);
  useEffect(() => { if (active) return subscribeClock(venueId, reload); }, [venueId, reload, active]);
  useEffect(() => { if (active) return subscribeBuyinRequests(venueId, reload); }, [venueId, reload, active]);
  const live = clocks.filter((c) => c.running || c.currentIndex > 0 || c.endsAt != null).sort((a, b) => a.gameSeq - b.gameSeq);
  const main = live[0];
  const mainRunning = !!main?.running;
  // 남은 시간 1초 틱 — 바가 보이고 클락이 실제로 돌 때만(리렌더 범위 = 이 바 하나)
  useEffect(() => {
    if (!active || !mainRunning) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [active, mainRunning]);
  if (!main && pending === 0) return null;
  const eff = main ? effectiveLevel(main) : null;
  const lv = main && eff ? main.config.levels[eff.index] : undefined;
  const levelNo = main && eff ? main.config.levels.slice(0, eff.index + 1).filter((l) => l.kind === 'level').length : 0;
  const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const alive = main?.liveStats?.alive;
  return (
    <div className="mb-3 flex items-stretch gap-1.5 overflow-x-auto rounded-card border border-accent-400/30 bg-surface-low px-1.5 py-1.5 text-2xs">
      {main && eff && (
        <button type="button" onClick={() => onGoto('clock')}
          className="flex shrink-0 items-center gap-2 rounded-input px-2 py-1 transition-colors hover:bg-surface-float">
          <span className={['h-1.5 w-1.5 shrink-0 rounded-full', main.running ? 'bg-emerald-400' : 'bg-amber-400'].join(' ')} aria-hidden />
          <span className="font-bold text-ink-primary">{lv?.kind === 'break' ? 'BREAK' : `레벨 ${levelNo}`}</span>
          {lv && lv.kind !== 'break' && <span className="tabular-nums text-ink-secondary">{lv.sb.toLocaleString()}/{lv.bb.toLocaleString()}</span>}
          <span className={['font-extrabold tabular-nums', main.running ? 'text-emerald-400' : 'text-amber-400'].join(' ')}>{mmss(eff.remainingMs)}</span>
          {typeof alive === 'number' && alive > 0 && <span className="text-ink-muted">생존 <b className="tabular-nums text-accent-300">{alive}</b></span>}
          {live.length >= 2 && <span className="text-ink-muted">+{live.length - 1}게임</span>}
        </button>
      )}
      {pending > 0 && (
        <button type="button" onClick={() => onGoto('ledger')}
          className="flex shrink-0 items-center gap-1.5 rounded-input bg-amber-500/10 px-2 py-1 font-bold text-amber-300 transition-colors hover:bg-amber-500/20">
          바인 대기 <b className="tabular-nums">{pending}</b>건 →
        </button>
      )}
    </div>
  );
});

// ── IA2 잔여: 게임 선택 칩 바 — 멀티게임(메인/사이드 N) 운영 시 게임 단계(포스터·장부·클락·순위)
// 상단에서 현재 게임을 한 곳에서 전환한다. 그동안 이 동선은 장부 GameSwitcher·클락 MultiClockOverview·
// 순위 게임칩으로 화면마다 흩어져 있었다(각 화면 내부 장치는 보존 — 이 바는 매장 수준 전환의 정문).
// 데이터는 오늘 장부 게임 목록(getLedgerGames) 재사용 — 구독·틱 0, active 로드 + 포커스/스텝 전환 시 갱신.
// 단일 게임 날(사이드 0)은 바 자체를 그리지 않는다(잡음 0). 칩 문법 = browse 필터 레일과 동일(h-9·rounded-badge).
const GameChipBar = memo(function GameChipBar({ venueId, active, step, current, canPosters, onPick, onNewGame }: {
  venueId: string; active: boolean; step: GameStep; current: number; canPosters: boolean;
  onPick: (seq: number, title?: string) => void;
  /** '+ 새 게임' = 기존 포스터 만들기(포스터 단계 헤더의 '+ 새 게임'과 같은 동작·카피) */
  onNewGame: () => void;
}) {
  const [games, setGames] = useState<LedgerGame[]>([]);
  const reload = useCallback(() => { getLedgerGames(venueId, kstToday()).then(setGames).catch(() => {}); }, [venueId]);
  // step 은 갱신 트리거 — 장부에서 사이드를 새로 열고 다른 단계로 넘어오면 칩이 따라잡는다
  useEffect(() => { if (active) reload(); }, [active, step, reload]);
  useEffect(() => {
    if (!active) return;
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [active, reload]);
  if (games.length <= 1) return null;
  const label = (seq: number) => (seq === MAIN_GAME_SEQ ? '메인' : `사이드${seq - 1}`);
  return (
    <div role="group" aria-label="오늘 게임 선택" className="flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-2xs font-bold text-ink-muted">오늘 게임</span>
      {games.map((g) => {
        const on = g.gameSeq === current;
        return (
          <button key={g.gameSeq} type="button" aria-pressed={on} onClick={() => onPick(g.gameSeq, g.title)}
            className={['inline-flex h-9 shrink-0 items-center gap-1 rounded-badge px-3.5 text-xs font-bold leading-none transition-colors',
              on ? 'bg-accent-300/15 text-accent-300' : 'bg-surface-high text-ink-secondary hover:bg-surface-float/70'].join(' ')}>
            <span>{label(g.gameSeq)}</span>
            {g.title && <span className="max-w-[8rem] truncate font-semibold opacity-80">· {g.title}</span>}
            {g.closed && <span className="text-2xs opacity-70">마감</span>}
          </button>
        );
      })}
      {canPosters && (
        <button type="button" onClick={onNewGame}
          className="inline-flex h-9 shrink-0 items-center rounded-badge border border-dashed border-accent-400/40 px-3.5 text-xs font-bold leading-none text-accent-300 transition-colors hover:bg-accent-300/10">
          + 새 게임
        </button>
      )}
    </div>
  );
});

function SectionBtn({ active, onClick, icon, children, locked }: {
  active: boolean; onClick: () => void; icon?: ReactNode; children: ReactNode; locked?: boolean;
}) {
  // 모바일: 가로 스크롤 칩 바 — 선택된 칩이 항상 화면 안에 오도록 부드럽게 센터링
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (active && ref.current && window.innerWidth < 1024) {
      ref.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active]);
  return (
    <button type="button" onClick={onClick} ref={ref}
      // 모바일=인라인 칩(아이콘+라벨 한 줄, 1행 가로 스크롤) / PC=세로 리스트.
      // §T1: PC 만 13px(사다리 밖)이라 모바일 12.75 와 어긋나 있었다 → t-tab 한 값으로 고정(-0.25px).
      className={['group/nav relative flex shrink-0 snap-start flex-row items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-2 t-tab transition-colors duration-300 focus:outline-none touch-manipulation lg:w-full lg:shrink lg:justify-start lg:gap-2 lg:py-2.5',
        active ? 'font-bold text-white' : locked ? 'text-ink-muted/60 hover:text-ink-secondary lg:hover:bg-surface-high' : 'text-ink-secondary hover:text-ink-primary lg:hover:bg-surface-high'].join(' ')}>
      {active && <span aria-hidden className="absolute inset-0 rounded-[7px] pill-active animate-fade-in" />}
      <span className="relative shrink-0" aria-hidden>{icon}</span>
      <span className="relative">{children}</span>
      {locked && <Icon name="lock" size={11} className={['hidden lg:block ml-auto shrink-0', active ? 'text-white/70' : 'text-ink-muted'].join(' ')} />}
    </button>
  );
}


// ── 일일 순위 입력 ────────────────────────────────────────────────────────────
// Row 정의는 lib/rankingDraft 에 둔다 — 임시 초안으로 직렬화·복원되는 값이라 두 곳이 어긋나면 복구가 깨진다.
type Row = RankRow;
const emptyRow = (): Row => ({ nickname: '', realName: '', prize: '', voucher: '', note: '' });
// 그날 열린 게임 후보 — 메인(포스터 제목) · 사이드(포스터 sideEvents) · 장부(장부만 있는 게임)
type GameOpt = { name: string; kind: 'main' | 'side' | 'ledger' };

function RankingEditor({ venueId, canEdit, draft, gameSel }: {
  venueId: string; canEdit: boolean; draft?: { date: string; names: string[]; event?: string } | null;
  /** 게임 선택 칩 바(게임 단계 상단)의 오늘 게임 픽 — 날짜·게임칩만 따라가고 명단은 건드리지 않는다 */
  gameSel?: GameSel | null;
}) {
  const toast = useToast();
  const today = new Date().toLocaleDateString('en-CA'); // 로컬 날짜 — UTC 자정 넘김 방지
  const [date, setDate] = useState(draft?.date ?? today);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  // 같은 날 여러 게임(메인+사이드) — 게임(이벤트)별로 순위를 따로 저장. ''=기본 게임
  const [eventName, setEventName] = useState('');
  // 저장 전 입력분 보호 — (매장·날짜·게임)별 임시 초안.
  // 왜: 아래 로더가 날짜·게임이 바뀔 때마다 rows 를 통째로 갈아끼운다. 20명 다 친 뒤 사이드 칩을
  //     잘못 누르면 경고 없이 빈 줄 하나로 리셋됐고, 저장 전이라 서버에도 없어 되돌릴 수단이 없었다.
  //     칩 오탭뿐 아니라 장부→순위 딥링크(draft prop), 섹션 상한 초과 언마운트, 새로고침도 같은 손실이라
  //     확인 다이얼로그가 아니라 '키별 초안 보관 + 되돌아오면 복원'으로 막는다.
  const dkey = rankDraftKey(venueId, date, eventName);
  const baselineRef = useRef('');                                   // 로더가 넣은 원본(서버 저장본/장부 초안/빈 줄) — 이것과 다르면 사장님이 손댄 것
  const [rowsKey, setRowsKey] = useState('');                       // 지금 rows 가 '어느 키의 것'인지 — 전환 직후 커밋에서 남의 칸을 덮어쓰는 걸 막는 가드
  const [drafted, setDrafted] = useState(false);                    // 임시 보관 중 표시
  const [restorable, setRestorable] = useState<Row[] | null>(null); // 저장본이 있는 칸의 복구 후보(자동 복원 금지 — 저장이 전체 교체라 위험)
  useEffect(() => { pruneRowsDrafts(); }, []);                      // 만료 초안 청소(매장·날짜·게임마다 키가 쌓인다)
  const [allEntries, setAllEntries] = useState<RankingEntry[]>([]);
  // 그날 열린 게임 후보 = 그날 포스터 제목 + 그날 장부 제목(둘 다 '어떤 게임인지' 선택지)
  const [dayGames, setDayGames] = useState<GameOpt[]>([]);
  useEffect(() => {
    Promise.all([
      getSchedules().then((all: Schedule[]) => all.filter((sc) => sc.venueId === venueId && new Date(sc.date).toLocaleDateString('en-CA') === date)).catch(() => [] as Schedule[]),
      getLedgerSession(venueId, date).then((ls) => (ls.title ? ls.title.trim() : '')).catch(() => ''),
    ]).then(([posters, ledgerTitle]) => {
      const opts: GameOpt[] = [];
      // 포스터 1장 = 메인 게임(제목) + 사이드 게임 여러 개(sideEvents[])
      for (const sc of posters) {
        const t = sc.title.trim();
        if (t) opts.push({ name: t, kind: 'main' });
        for (const se of sc.sideEvents ?? []) {
          const n = (se.name ?? '').trim();
          if (n) opts.push({ name: n, kind: 'side' });
        }
      }
      // 포스터엔 없고 장부만 있는 게임
      if (ledgerTitle && !opts.some((o) => o.name === ledgerTitle)) opts.push({ name: ledgerTitle, kind: 'ledger' });
      // 이름 중복 제거(먼저 등록된 분류 우선: main > side > ledger)
      const seen = new Set<string>();
      setDayGames(opts.filter((o) => (seen.has(o.name) ? false : (seen.add(o.name), true))));
    });
  }, [venueId, date]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 지류 양식 출력용 매장명 + 인증 여부(인증 펍만 지류 발급)
  const [venueName, setVenueName] = useState('');
  const [venueVerified, setVenueVerified] = useState(false);
  useEffect(() => {
    getAllVenues().then((vs) => {
      const v = vs.find((x) => x.id === venueId);
      setVenueName(v?.name ?? '');
      setVenueVerified(v?.verificationStatus === 'verified');
    }).catch(() => {});
  }, [venueId]);
  // 지류(공식 결과 기록지) 출력 — 인증 펍 전용. 수기 기입형(NAME/COUNTRY/EVENT/PLACE/PRIZE/TD SIGN)
  const printPaperForm = () => {
    if (!venueVerified) {
      window.alert('공식 결과 기록지(지류 양식)는 NURI HOLDEM 인증 매장만 사용할 수 있습니다.\n\n비인증 매장은 발급이 불가하니 운영자(관리자)에게 인증을 문의해 주세요.');
      return;
    }
    const w = window.open('', '_blank', 'width=560,height=900');
    if (!w) { toast.show('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도하세요.', 'error'); return; }
    // 매장명은 업주 자유입력(DB) → 인쇄창(about:blank, 같은 출처) HTML 인젝션 방지를 위해 반드시 이스케이프.
    const esc = (s: string) => String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const field = (label: string, sub: string) => `<div class="f"><div class="lb">${esc(label)} <span>${esc(sub)}</span></div><div class="ln"></div></div>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>NURI HOLDEM · 공식 결과 기록지</title><style>
*{box-sizing:border-box;margin:0}body{font-family:Georgia,'Apple SD Gothic Neo',serif;color:#111;padding:34px 38px}
.top{text-align:center;border-bottom:3px double #1a1a1a;padding-bottom:14px}
.logo{font-size:34px;font-weight:900;letter-spacing:2px}.logo .h{color:#b8932f}
.sub{font-size:12px;letter-spacing:4px;color:#555;margin-top:4px}
.venue{font-size:19px;font-weight:800;margin-top:10px}
.note{font-size:10px;color:#888;margin-top:4px}
.fs{margin-top:26px;display:flex;flex-direction:column;gap:24px}
.f .lb{font-size:13px;font-weight:800;letter-spacing:1px}.f .lb span{font-weight:400;color:#888;font-size:10px;margin-left:6px}
.f .ln{border-bottom:1.6px solid #222;height:34px}
.foot{margin-top:30px;display:flex;justify-content:space-between;align-items:flex-end;font-size:10px;color:#777}
.foot b{color:#b8932f}
@media print{body{padding:18px 24px}}
</style></head><body>
<div class="top">
  <div class="logo">NURI <span class="h">HOLDEM</span></div>
  <div class="sub">OFFICIAL RESULT SLIP</div>
  <div class="venue">${esc(venueName) || '매장명'}</div>
  <div class="note">NURI HOLDEM 인증 펍 전용 양식 — 인증 펍 외 사용·발급은 무효입니다.</div>
</div>
<div class="fs">
  ${field('NAME', '성명')}
  ${field('COUNTRY', '국가')}
  ${field('EVENT', '대회명')}
  ${field('PLACE', '순위')}
  ${field('PRIZE', '프라이즈')}
  ${field('TD SIGN', '토너먼트 디렉터 서명')}
</div>
<div class="foot"><span>DATE: ________________</span><span><b>nuriholdem.com</b> · 본 기록지는 금전적 가치가 없습니다</span></div>
<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
</body></html>`);
    w.document.close();
  };
  // 등수→점수 매핑(매장 꾸미기에서 설정) — 입력 시 점수 미리보기에 사용
  const [cfg, setCfg] = useState<VenuePageConfig | null>(null);
  useEffect(() => { getVenuePageConfig(venueId).then(setCfg).catch(() => {}); }, [venueId]);

  // 장부에서 넘어온 초안: 해당 날짜로 이동 + 그 게임(메인/사이드) 제목으로 게임칩 자동 선택
  useEffect(() => {
    if (draft?.date) setDate(draft.date);
    setEventName(draft?.event ?? ''); // 사이드 마감→순위입력 시 그 사이드 title로 바로(메인은 '')
  }, [draft]);
  // 게임 선택 칩 바(IA2 잔여)에서 고른 오늘 게임 — 순위 입력 칸도 오늘·그 게임으로 따라간다.
  // draft(장부 마감 초안)와 달리 명단(names)은 만들지 않는다 — 저장 전 입력분은 키별 임시 초안이 지킨다.
  // (draft 계열 진입은 부모가 gameSel 을 비워 우선순위를 보장 — 마운트 시 이 효과가 draft 를 덮지 않는다)
  useEffect(() => {
    if (!gameSel) return;
    setDate(today);
    setEventName(gameSel.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSel]);

  useEffect(() => {
    setLoading(true);
    getVenueRankings(venueId, date)
      .then(({ entries }) => { setAllEntries(entries); })
      .catch(() => setAllEntries([]))
      .finally(() => setLoading(false));
  }, [venueId, date]);

  // 선택한 게임(이벤트)의 줄만 편집 — 게임 전환 시 해당 저장본/장부 초안 로드.
  // ⚠ 여기서 rows 를 통째로 갈아끼운다. 그래서 갈아끼우기 직전에 임시 초안을 먼저 본다.
  //   · 저장본이 없는 칸(아직 저장 안 한 게임)이면 초안을 그대로 되살린다 — 칩·날짜 오탭 즉시 복구.
  //   · 저장본이 있는 칸이면 자동 복원하지 않는다. 저장(save_venue_rankings)이 (날짜+게임) 단위
  //     전체 삭제 후 재삽입이라, 낡은 초안을 무심코 저장하면 이미 저장된 순위를 통째로 덮어쓴다.
  //     그래서 '되살리기' 버튼을 눌렀을 때만 올린다.
  useEffect(() => {
    if (loading) return;
    const mine = allEntries.filter((e) => (e.eventName ?? '') === eventName);
    // 오너 지시(2026-08-28): 장부 명단 자동 채움 폐지 — 빈 줄에서 시작한다.
    //   왜: 자동으로 20줄이 차 있으면 '등수'가 아니라 '바인 기록순'인데도 그럴듯해 보여서
    //   그대로 저장되기 쉬웠고, 지우는 것이 치는 것보다 오래 걸렸다. 장부 명단은 사라지지
    //   않는다 — 아래 '📒 그날 장부 명단' 패널(＋/전체 추가)과 닉네임 자동완성 후보로 남는다.
    const base: Row[] = mine.length
      ? mine.map((e) => ({ nickname: e.nickname, realName: e.realName, prize: e.prize ?? '', voucher: '', note: '' }))
      : [emptyRow()];
    const kept = readRowsDraft(dkey);
    // 기준선은 항상 '원본'. 복구본을 기준선으로 잡으면 아래 보관 효과가 초안을 즉시 지워버린다.
    baselineRef.current = JSON.stringify(base);
    setRows(kept && !mine.length ? kept : base);
    setRowsKey(dkey);
    setDrafted(!!kept && !mine.length);
    setRestorable(kept && mine.length && JSON.stringify(kept) !== baselineRef.current ? kept : null);
  }, [loading, allEntries, eventName, dkey]);

  // 저장 전 입력분을 (매장·날짜·게임) 키로 임시 보관 — 전환·딥링크·섹션 정리·새로고침에도 남게.
  // rowsKey 가드가 핵심: 칩을 누른 직후 커밋에는 'rows=이전 게임 것 + dkey=새 게임'이 섞여 있어,
  // 그대로 쓰면 방금 고른 게임 칸에 이전 게임 명단이 들어가 오염된다.
  useEffect(() => {
    if (loading || rowsKey !== dkey) return;
    if (JSON.stringify(rows) === baselineRef.current || !hasRowContent(rows)) {
      clearRowsDraft(dkey); setDrafted(false); return; // 원본과 같아짐 = 지킬 게 없음
    }
    writeRowsDraft(dkey, rows);
    setDrafted(true);
  }, [rows, rowsKey, dkey, loading]);

  const update = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  // 자동완성: ①그날 장부 명단 ②비회원 등록 ③회원 검색(닉네임/실명 — 동명이인은 실명으로 구분)
  const [ledgerNames, setLedgerNames] = useState<string[]>([]);
  // 그날 장부 명단(인원·바인 수) — 순위입력에서 '장부 보기'로 펼쳐 참고/추가
  const [ledgerPlayers, setLedgerPlayers] = useState<{ name: string; buyins: number }[]>([]);
  const [ledgerPanelOpen, setLedgerPanelOpen] = useState(false);
  // 마감정산에서 넘어온 참가자 명단은 이제 행을 채우지 않는다 — 자동완성 후보로만 합류시킨다.
  const draftNames = draft && draft.date === date ? draft.names : null;
  useEffect(() => {
    getLedgerBuyins(venueId, date)
      .then((bs) => {
        setLedgerNames([...new Set([...bs.map((b) => b.playerName), ...(draftNames ?? [])].filter(Boolean))]);
        const counts = new Map<string, number>();
        for (const b of bs) { const n = (b.playerName ?? '').trim(); if (n) counts.set(n, (counts.get(n) ?? 0) + 1); }
        const players = [...counts.entries()].map(([name, buyins]) => ({ name, buyins }));
        setLedgerPlayers(players);
        // 자동 채움을 없앴으니 명단은 '펼쳐 두고 골라 넣는' 것이 기본 동선이 된다.
        // 채워 넣지는 않는다 — 보여 주기만 한다(오너 지시: 미리 넣지 말 것).
        if (players.length > 0) setLedgerPanelOpen(true);
      })
      .catch(() => { setLedgerNames([...new Set((draftNames ?? []).filter(Boolean))]); setLedgerPlayers([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, date, draftNames?.length]);
  const [sugRow, setSugRow] = useState<number | null>(null);     // 드롭다운 열린 행
  const [memCands, setMemCands] = useState<RankMember[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 행 ↔ 회원 대조(이용권 전송 대상 특정) ──────────────────────────────────
  // 왜 닉네임(소문자)을 키로 쓰나: 이용권 멱등 키가 AWARD:{날짜}:{게임}:{닉네임} 라
  //   '누구에게 보냈는가'의 단위가 이미 닉네임이다. 행 인덱스로 잡으면 ▲▼ 재배치에
  //   따라다니지 못하고, RankRow 에는 안정적인 id 가 없다(초안 직렬화 포맷 고정).
  // 값의 의미: undefined = 아직 조회 안 함 · [] = 비회원 · 1개 = 회원 확정 · 2개↑ = 동명이인.
  const [memberMap, setMemberMap] = useState<Record<string, RankMember[]>>({});
  // 업주가 자동완성에서 직접 고른 확정값 — 동명이인이어도 이 선택이 이깁니다.
  // null = '비회원으로 등록'을 명시적으로 고른 것.
  const [pickedMap, setPickedMap] = useState<Record<string, RankMember | null>>({});
  const nickKey = (s: string) => s.trim().toLowerCase();
  /** 이 이름의 지급 대상 — 확정 회원 / 비회원(null) / 동명이인·미조회('ambiguous'|'unknown') */
  const targetOf = (nick: string): RankMember | null | 'ambiguous' | 'unknown' => {
    const k = nickKey(nick);
    if (!k) return 'unknown';
    if (k in pickedMap) return pickedMap[k];
    const cands = memberMap[k];
    if (cands === undefined) return 'unknown';
    if (cands.length === 0) return null;
    if (cands.length === 1) return cands[0];
    return 'ambiguous';
  };

  // 화면에 있는 이름을 한 번에 대조 — 저장본을 다시 열면 20줄이 차 있는데 줄마다
  // 요청을 쏘면 진입 한 번에 20왕복이다(무료 티어 egress 가 실질 천장).
  // 디바운스가 필요한 이유: rows 는 타이핑 한 글자마다 바뀐다. 그대로 대조하면 '나'·'나누'·
  //   '나누리'가 각각 한 번씩 나가 한 명 입력에 요청 3건이 된다. 손이 멈춘 뒤 한 번만 보낸다.
  const resolvingRef = useRef(new Set<string>());
  useEffect(() => {
    const want = [...new Set(rows.map((r) => r.nickname.trim()).filter(Boolean))]
      .filter((n) => !(nickKey(n) in memberMap) && !resolvingRef.current.has(nickKey(n)));
    if (want.length === 0) return;
    let alive = true;
    const t = setTimeout(() => {
      for (const n of want) resolvingRef.current.add(nickKey(n));
      resolveRankingMembers(want)
        .then((m) => {
          if (!alive) return;
          setMemberMap((prev) => {
            const next = { ...prev };
            for (const [k, v] of m) next[k] = v;
            return next;
          });
        })
        .catch(() => { /* 조회 실패 — 다음 편집에서 다시 시도된다 */ })
        .finally(() => { for (const n of want) resolvingRef.current.delete(nickKey(n)); });
    }, 450);
    return () => { alive = false; clearTimeout(t); };
  }, [rows, memberMap]);

  const onNickInput = (i: number, v: string) => {
    update(i, 'nickname', v);
    setSugRow(v.trim() ? i : null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!v.trim()) { setMemCands([]); return; }
    searchTimer.current = setTimeout(() => {
      searchRankingMembers(v).then(setMemCands).catch(() => setMemCands([]));
    }, 280);
  };
  const pickSuggestion = (i: number, kind: 'ledger' | 'guest' | 'member', nickname: string, member?: RankMember) => {
    const nick = nickname.trim();
    setRows((r) => r.map((row, idx) => (idx === i
      ? { ...row, nickname: nick, realName: member?.realName ?? row.realName }
      : row)));
    // 회원/비회원은 여기서 확정된다 — 그래야 동명이인이어도 '이 사람'에게만 전송된다.
    if (kind === 'member' && member) setPickedMap((p) => ({ ...p, [nickKey(nick)]: member }));
    if (kind === 'guest') setPickedMap((p) => ({ ...p, [nickKey(nick)]: null }));
    // 장부명은 회원일 수도 비회원일 수도 있다 — 확정하지 않고 대조 효과에 맡긴다.
    setSugRow(null); setMemCands([]);
  };
  const addRow = () => setRows((r) => [...r, emptyRow()]);
  // 장부 명단 → 순위에 추가: 빈 칸 있으면 채우고, 없으면 새 줄. 이미 있으면 무시
  const addFromLedger = (name: string) => {
    // 장부는 '실명(닉네임)' 합성 표기를 쓴다 — 그대로 닉네임 칸에 넣으면 회원 대조가
    // 전부 '비회원'으로 판정된다. 경계에서 분리해 각 칸에 넣는다.
    const raw = name.trim(); if (!raw) return;
    const m = raw.match(/^(.+?)\((.+)\)$/);
    const nick = (m ? m[2] : raw).trim();
    const real = (m ? m[1] : '').trim();
    if (!nick) return;
    setRows((r) => {
      if (r.some((row) => row.nickname.trim() === nick)) return r;
      const emptyIdx = r.findIndex((row) => !row.nickname.trim() && !row.realName.trim() && !row.prize.trim());
      if (emptyIdx >= 0) return r.map((row, idx) => (idx === emptyIdx ? { ...row, nickname: nick, realName: real || row.realName } : row));
      return [...r, { ...emptyRow(), nickname: nick, realName: real }];
    });
  };
  const addAllFromLedger = () => { for (const p of ledgerPlayers) addFromLedger(p.name); };
  // 줄 삭제는 닉네임만 지우는 게 아니다 — 실명·프라이즈·이용권 개수·비고가 한꺼번에 날아간다.
  // 저장 전이라 서버에도 없고, 초안은 '지워진 뒤 상태'를 보관하므로 여기선 아무 보호가 안 된다.
  // 왜 유예 큐(lib/undoableDelete)가 아닌가: 저건 '서버에 나가면 복구 경로가 0'인 조작을 위한 장치다.
  //   여기는 로컬 배열이라 유예할 요청 자체가 없고, 유예하면 '지웠는데 화면에 남는' 상태가 생긴다.
  // 왜 전체 스냅샷이 아니라 그 줄만 되꽂는가: 되돌리기 전에 다른 줄을 고쳤어도 그 수정이 안 날아간다.
  const removeRow = (i: number) => {
    const removed = rows[i];
    if (rows.length <= 1 || !removed) return; // 마지막 한 줄은 남긴다(기존 동작 유지)
    setRows((r) => r.filter((_, idx) => idx !== i));
    setSugRow(null); // 자동완성은 행 인덱스로 열려 있어 삭제 후엔 남의 줄에 붙는다
    const filled = removed.nickname.trim() || removed.realName.trim() || removed.prize.trim() || removed.voucher.trim() || removed.note.trim();
    if (!filled) return; // 빈 줄까지 토스트를 띄우면 잔소리가 된다
    toast.show(`${i + 1}위 '${removed.nickname.trim() || '이름 없음'}' 줄을 지웠습니다`, 'info', {
      action: { label: '되돌리기', onClick: () => setRows((r) => [...r.slice(0, i), removed, ...r.slice(i)]) },
    });
  };

  // ── 등수 재배치 ─────────────────────────────────────────────────────────────
  // 왜 필요한가: 행 순서가 곧 등수인데(서버가 배열 순서대로 position 을 매긴다) 행을 채우는 두 경로가
  //   등수와 무관하다 — 장부 '전체 추가'는 바인 기록순, 장부 마감 초안은 참가자 명단순.
  //   순서를 바꿀 수단이 없으면 대회 직후 가장 바쁜 시각에 20줄을 지우고 다시 치는 수밖에 없었다.
  // 왜 드래그가 아닌가: RankRow 에 안정적인 id 가 없고, 이 타입은 초안으로 localStorage 에
  //   직렬화되는 포맷이라 id 를 심으면 기존 초안(48h)과 형태가 어긋난다. 한 손 조작에도 ▲▼가 안전하다.
  const [moved, setMoved] = useState<{ i: number } | null>(null); // 방금 옮긴 줄 — 줄들이 서로 똑같이 생겨서 어디로 갔는지 놓친다
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setMoved(null), 900);
    return () => clearTimeout(t);
  }, [moved]);
  const moveRow = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    setRows((r) => moveRankRow(r, from, to)); // 객체는 그대로 — 되돌리면 기준선과 같아져 초안이 스스로 지워진다
    setSugRow(null);                          // 자동완성 드롭다운은 행 인덱스로 열려 있다
    setMoved({ i: to });
  };
  // ▲▼만으로는 20위 우승자를 1위로 올리는 데 19번을 눌러야 한다 — 등수를 직접 찍어 한 번에 옮긴다
  // (게임 이름 '직접 추가'와 같은 window.prompt 패턴 — 이 화면의 기존 관행)
  const promptMoveTo = (from: number) => {
    const v = window.prompt(`'${rows[from]?.nickname.trim() || `${from + 1}위`}' 을(를) 몇 위로 옮길까요? (1~${rows.length})`, String(from + 1));
    if (v == null) return;
    const n = parseInt(v.trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > rows.length) { toast.show(`1~${rows.length} 사이의 등수를 입력해 주세요`, 'error'); return; }
    moveRow(from, n - 1);
  };

  // ── 매장이용권 전송(행 단위) ───────────────────────────────────────────────
  // 오너 지시(2026-08-28): 순위 저장과 이용권 지급을 갈라, 줄마다 개수를 넣고
  //   그 줄의 '전송'을 눌렀을 때만 그 한 명에게 나가게 한다.
  // 왜 행 단위인가: 일괄 발급은 한 명이 막히면 나머지가 어디까지 나갔는지 알 수 없었다.
  //   (미가입·미인증·한도부족이 전부 '미지급 N명'으로 뭉개졌고, issued===0 이면 그 표시조차
  //   사라졌다.) 한 번에 한 명이면 성공·실패가 그 줄에 그대로 남는다.
  const awardKeyBase = `AWARD:${date}:${(eventName || '메인').trim()}`;
  // 킬스위치(2026-08-29) — 이용권이 꺼지면 이 화면에서 '순위'만 남는다.
  // 순위 저장은 이용권과 이미 완전히 분리돼 있으므로(오너 지시 2026-08-28) 저장 경로는 무손실.
  const vchOn = useIdentityEnabled();
  const [sendMap, setSendMap] = useState<Record<string, { status: 'busy' | 'sent' | 'error'; count?: number; msg?: string }>>({});
  // 이미 보낸 줄은 새로고침·재진입 후에도 '전송됨'으로 보여야 한다 — 중복 발급의 대부분은
  // '보냈는지 기억이 안 나서 한 번 더'였다. 발급 note 의 AWARD 마커를 되읽어 복원한다.
  useEffect(() => {
    // 날짜·게임이 바뀌면 '누가 누구인지'와 '누구에게 보냈는지'를 함께 리셋한다 —
    // 한쪽만 남으면 다른 게임의 확정 대상이 이 게임 줄에 붙는다.
    setSendMap({});
    setPickedMap({});
    if (!canEdit || !vchOn) return; // 이용권 OFF — 멱등 마커 조회도 불필요(조회 0)
    let alive = true;
    listVoucherNotes(venueId, awardKeyBase)
      .then((notes) => {
        if (!alive) return;
        const seeded: Record<string, { status: 'sent' }> = {};
        for (const nt of notes) {
          const at = nt.lastIndexOf(`${awardKeyBase}:`);
          if (at < 0) continue;
          const nick = nt.slice(at + awardKeyBase.length + 1).trim();
          if (nick) seeded[nickKey(nick)] = { status: 'sent' };
        }
        setSendMap(seeded);
      })
      .catch(() => { /* 조회 실패 — 전송 자체는 막지 않는다(서버가 최종 판정) */ });
    return () => { alive = false; };
  }, [venueId, awardKeyBase, canEdit, vchOn]);

  // ── 매장 단위 발급 게이트(승인·잔여 한도) ──────────────────────────────────
  // 왜 필요한가: 승인 전 매장이거나 한도가 0이면 '전송'은 줄마다 눌러 봐야 서버에서
  //   거절된다. 20줄이면 20번을 눌러 20개의 같은 실패를 본 뒤에야 원인을 안다.
  //   그것도 각 줄의 잘린 한 줄짜리 문구로. 매장 단위 사실은 매장 단위로 한 번만 말한다.
  // 왜 서버 판정을 그대로 두는가: 여기 값은 화면을 연 시점의 스냅샷이라 최종 권위가 아니다.
  //   (다른 창에서 발급했거나 운영자가 승인을 바꿀 수 있다) 미리 알리되 막지는 않는다 —
  //   단 '확실히 안 되는' 두 경우(미승인·잔여 0)만 버튼을 잠근다.
  const [issueApproved, setIssueApproved] = useState<boolean | null>(null); // null = 확인 중
  const [quotaLeft, setQuotaLeft] = useState<number | null>(null);          // null = 알 수 없음
  useEffect(() => {
    if (!canEdit || !vchOn) return; // 이용권 OFF — 승인·한도는 화면에 없는 개념이라 조회하지 않는다
    let alive = true;
    isVoucherIssueApproved(venueId).then((v) => { if (alive) setIssueApproved(v); }).catch(() => { if (alive) setIssueApproved(null); });
    getVoucherQuota(venueId).then((q) => { if (alive) setQuotaLeft(q); }).catch(() => { if (alive) setQuotaLeft(null); });
    return () => { alive = false; };
  }, [venueId, canEdit, vchOn]);
  /** 매장 차원에서 전송이 막혀 있으면 그 사유 — 줄 단위 판정보다 먼저 본다 */
  const venueSendBlock = (): string | null => {
    if (issueApproved === false) return '운영자 승인 전이라 이용권을 보낼 수 없습니다 — 순위 저장은 그대로 됩니다';
    if (quotaLeft !== null && quotaLeft <= 0) return '발급 한도가 0개입니다 — 운영자에게 문의해 주세요 (순위 저장은 그대로 됩니다)';
    return null;
  };

  /** 이 줄이 지금 전송 가능한가 — 버튼 활성/비활성과 안내 문구의 단일 소스 */
  const sendGate = (row: Row): { ok: boolean; reason: string; target: RankMember | null } => {
    const blocked = venueSendBlock();
    if (blocked) return { ok: false, reason: blocked, target: null };
    const nick = row.nickname.trim();
    if (!nick) return { ok: false, reason: '닉네임을 먼저 입력해 주세요', target: null };
    const t = targetOf(nick);
    if (t === 'unknown') return { ok: false, reason: '회원 확인 중…', target: null };
    if (t === null) return { ok: false, reason: '비회원 — 가입·인증 후 지급 가능', target: null };
    if (t === 'ambiguous') return { ok: false, reason: '동명이인 — 닉네임 칸에서 받는 분을 골라 주세요', target: null };
    if (vchOn && !t.verified) return { ok: false, reason: '본인인증 전 회원 — 인증 후 지급 가능', target: null };
    return { ok: true, reason: '', target: t };
  };

  const sendVoucher = async (i: number) => {
    const row = rows[i];
    if (!row) return;
    const nick = row.nickname.trim();
    const k = nickKey(nick);
    const gate = sendGate(row);
    if (!gate.ok || !gate.target) { toast.show(gate.reason, 'error'); return; }
    const cnt = parseInt(row.voucher, 10);
    if (!Number.isFinite(cnt) || cnt < 1) { toast.show('보낼 이용권 개수를 입력해 주세요', 'error'); return; }
    if (sendMap[k]?.status === 'sent' && !window.confirm(
      `'${nick}' 에게는 이 게임(${eventName || '메인'}) 이용권을 이미 보냈습니다.\n\n`
      + '한 번 더 누르면 이용권이 추가로 발급됩니다. 계속할까요?',
    )) return;
    const n = Math.min(1000, cnt);
    setSendMap((m) => ({ ...m, [k]: { status: 'busy' } }));
    try {
      await issueVoucher(venueId, {
        title: '순위 시상', count: n, holderUserId: gate.target.id, holderName: gate.target.nickname,
        note: `${row.note.trim() || '순위 시상'} · ${awardKeyBase}:${nick}`,
      });
      setSendMap((m) => ({ ...m, [k]: { status: 'sent', count: n } }));
      // 잔여 한도는 화면에 계속 떠 있는 숫자다 — 보낸 만큼 즉시 깎아야 다음 줄에서 맞는다
      setQuotaLeft((q) => (q === null ? q : Math.max(0, q - n)));
      toast.show(`'${nick}' 에게 매장이용권 ${n}개를 보냈습니다`, 'success');
    } catch (e) {
      // 실패 사유는 그 줄에 그대로 남긴다 — 한도부족과 미인증은 다음 행동이 완전히 다르다
      setSendMap((m) => ({ ...m, [k]: { status: 'error', msg: e instanceof Error ? e.message : '전송에 실패했습니다' } }));
    }
  };

  const save = async () => {
    const clean = rows.filter((r) => r.nickname.trim() || r.realName.trim() || r.prize.trim());
    if (clean.length === 0) return toast.show('순위를 한 명 이상 입력해 주세요', 'error');
    if (clean.some((r) => !r.nickname.trim()))
      return toast.show('각 줄에 닉네임을 입력해 주세요 (실명·프라이즈는 선택)', 'error');
    // 프라이즈는 만원 단위 — 1억(10,000만) 이상은 원 단위 오입력이 거의 확실하다.
    // 저장되는 순간 매장·전국 프라이즈 보드에 그대로 누적되고, 되돌리려면 그 날짜 순위를
    // 통째로 다시 입력해야 해서 인라인 경고만으로는 부족하다. 여기서 한 번 붙잡는다.
    const wrongUnit = clean.filter((r) => prizeUnitRisk(r.prize) === 'impossible');
    if (wrongUnit.length > 0 && !window.confirm(
      `프라이즈가 원 단위로 입력된 것 같습니다 (${wrongUnit.map((r) => r.prize).join(', ')}).\n\n`
      + '이 칸은 만원 단위입니다 — 100만원이면 100, 1,000만원이면 1000.\n\n'
      + '이대로 저장하면 매장·전국 프라이즈 순위가 크게 왜곡됩니다. 그래도 저장할까요?',
    )) return;
    setSaving(true);
    try {
      // ⚠ 순위 저장은 매장이용권과 완전히 분리돼 있다(오너 지시 2026-08-28).
      //   예전엔 이 버튼 하나가 '순위 저장 → 이용권 자동 발급 루프'를 이어서 돌렸다.
      //   그 루프의 실패(미가입·미인증·한도부족)는 issued===0 일 때 토스트에서 아예
      //   사라졌고, 반대로 실패 문구만 본 사장님은 순위까지 안 저장된 줄 알았다.
      //   이제 이 함수는 순위만 저장한다 — 이용권은 행마다 '전송' 버튼으로만 나간다.
      await saveVenueRankings(venueId, date, clean.map(({ nickname, realName, prize }) => ({ nickname, realName, prize })), eventName);
      // 저장 성공 = 서버가 정본이므로 임시 초안을 폐기한다. 남겨두면 다음 진입 때 낡은 초안이
      // 되살아나고, 저장이 (날짜+게임) 전체 교체라 방금 저장한 순위를 덮어쓸 수 있다.
      baselineRef.current = JSON.stringify(rows); // 저장 직후 화면 = 새 기준선
      clearRowsDraft(dkey);
      setDrafted(false);
      setRestorable(null);
      // 이용권 칸에 숫자만 넣고 전송을 안 누른 줄은 여기서 짚어 준다 — 저장과 전송이
      // 갈라졌으니 '저장했으니 나갔겠지'라는 예전 기대가 남아 있으면 그게 곧 미지급이다.
      const pending = clean.filter((r) => {
        const c = parseInt(r.voucher, 10);
        return c > 0 && sendMap[nickKey(r.nickname)]?.status !== 'sent';
      }).length;
      toast.show(
        pending > 0
          ? `순위 저장 완료 — 이용권 ${pending}줄은 아직 전송 전입니다. 줄 오른쪽 '전송'을 눌러 주세요`
          : '순위 저장 완료 — 닉네임이 일치하는 회원에게 포인트가 반영됩니다',
        pending > 0 ? 'info' : 'success',
      );
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="py-16 text-center text-sm text-ink-muted">
        매장(직원) 승인 완료 후 순위를 입력할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 날짜 */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value || today)}
          className="input flex-1 text-sm"
        />
        {date !== today && (
          <button type="button" onClick={() => setDate(today)} className="btn-ghost text-xs px-3 shrink-0">오늘</button>
        )}
        <button type="button" onClick={printPaperForm} title="공식 결과 기록지(수기 양식) 인쇄 — 인증 펍 전용"
          className="btn-ghost inline-flex min-h-11 items-center gap-1.5 text-xs px-3 shrink-0 text-accent-300 dark:text-accent-200"><Icon name="printer" size={14} className="shrink-0" />지류 양식</button>
      </div>

      {/* 어떤 게임의 순위인지 — 메인(포스터)·사이드(사이드 포스터)·장부·기타로 구분해 선택 */}
      {(() => {
        const saved = new Set(allEntries.map((e) => e.eventName ?? ''));
        const mains = [...new Set(dayGames.filter((g) => g.kind === 'main').map((g) => g.name))];
        const sides = [...new Set(dayGames.filter((g) => g.kind === 'side').map((g) => g.name))];
        const ledgers = [...new Set(dayGames.filter((g) => g.kind === 'ledger').map((g) => g.name))];
        const known = new Set<string>(['', ...mains, ...sides, ...ledgers]);
        // 포스터·장부엔 없지만 이미 저장됐거나(과거 직접추가) 지금 입력 중인 커스텀 게임
        const extras = [...new Set([
          ...[...saved].filter((s) => s && !known.has(s)),
          ...(eventName && !known.has(eventName) ? [eventName] : []),
        ])];

        const chip = (ev: string, k: string, label?: string) => {
          const on = eventName === ev;
          const has = saved.has(ev);
          return (
            <button key={k} type="button" onClick={() => setEventName(ev)}
              className={['inline-flex min-h-9 items-center text-xs font-bold px-2.5 py-1.5 rounded-input border transition-colors',
                on ? 'bg-accent-300 text-white border-accent-300' : 'bg-surface-float text-ink-secondary border-border-default hover:text-ink-primary'].join(' ')}>
              {label ?? ev}{has ? ' ✓' : ''}
            </button>
          );
        };
        const Section = ({ icon, label, hint, children }: { icon: IconName; label: string; hint: string; children: ReactNode }) => (
          <div className="space-y-1">
            <p className="flex items-center gap-1 text-2xs font-bold text-ink-muted"><Icon name={icon} size={12} className="shrink-0" />{label}<span className="font-normal text-ink-muted/70"> · {hint}</span></p>
            <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
          </div>
        );

        return (
          <div className="rounded-card border border-accent-400/30 bg-accent-300/[0.05] p-2.5 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-1 text-2xs font-bold text-ink-muted"><Icon name="target" size={12} className="shrink-0" />입력 중인 게임</span>
              <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-accent-300 dark:text-accent-200">{eventName || '메인 게임(기본)'}</span>
            </div>

            {/* 메인 게임 — 기본 + 그날 포스터 제목 */}
            <Section icon="trophy" label="메인 게임" hint="포스터 메인">
              {chip('', 'g-main-base', '메인(기본)')}
              {mains.map((n) => chip(n, 'g-m-' + n))}
            </Section>

            {/* 사이드 게임 — 사이드 포스터에서 등록된 이벤트(여러 개) */}
            {sides.length > 0 && (
              <Section icon="dice" label="사이드 게임" hint="사이드 포스터">
                {sides.map((n) => chip(n, 'g-s-' + n))}
              </Section>
            )}

            {/* 장부 게임 — 포스터 없이 장부만 있는 게임 */}
            {ledgers.length > 0 && (
              <Section icon="notebook" label="장부 게임" hint="장부에서">
                {ledgers.map((n) => chip(n, 'g-l-' + n))}
              </Section>
            )}

            {/* 기타 — 포스터·장부 없는 게임(직접 추가) */}
            <Section icon="edit" label="기타 게임" hint="포스터·장부 없음">
              {extras.map((n) => chip(n, 'g-x-' + n))}
              <button type="button"
                onClick={() => { const v = window.prompt('게임 이름 직접 입력 (예: 사이드 2, 새틀라이트, 하이롤러)'); if (v && v.trim()) setEventName(v.trim().slice(0, 40)); }}
                className="inline-flex min-h-9 items-center text-xs font-bold px-2.5 py-1.5 rounded-input border bg-surface-float text-accent-300 dark:text-accent-200 border-dashed border-accent-400/40 hover:bg-accent-300/10">+ 직접 추가</button>
            </Section>

            <p className="text-2xs leading-relaxed text-ink-muted">하루에 게임이 여러 개면 <b className="text-ink-secondary">게임마다 따로</b> 골라 입력하세요. 메인·사이드·기타를 선택해 순위를 넣으면 그 게임 순위만 따로 저장·표시됩니다. <b className="text-accent-300 dark:text-accent-200">✓</b> 표시는 이미 입력된 게임입니다.</p>
          </div>
        );
      })()}

      {/* 그날 장부 명단 — 펼쳐서 참고하며 순위 입력(장부↔순위 직접 연동) */}
      <div className="rounded-card border border-emerald-500/25 bg-emerald-500/[0.04] overflow-hidden">
        <button type="button" onClick={() => setLedgerPanelOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
          <span className="inline-flex items-center gap-1 text-2xs font-bold text-emerald-300"><Icon name="notebook" size={12} className="shrink-0" />그날 장부 명단 {ledgerPlayers.length > 0 ? <span className="text-ink-secondary">({ledgerPlayers.length}명)</span> : <span className="font-normal text-ink-muted">— 연결된 장부 없음</span>}</span>
          <span className="text-2xs text-ink-muted">{ledgerPanelOpen ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>
        {ledgerPanelOpen && (
          <div className="space-y-1.5 border-t border-emerald-500/20 p-2">
            {ledgerPlayers.length === 0 ? (
              <p className="py-1.5 text-center text-2xs text-ink-muted">이 날짜에 연결된 장부 바인 명단이 없습니다. 장부에서 바인을 먼저 기록하면 여기에 손님 명단이 뜹니다.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xs text-ink-muted">장부에 바인한 손님 — <b className="text-emerald-300">＋</b>로 순위에 추가</p>
                  <button type="button" onClick={addAllFromLedger} className="rounded-input border border-emerald-500/40 px-2 py-1 text-2xs font-bold text-emerald-300 hover:bg-emerald-500/10">전체 추가</button>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {ledgerPlayers.map((p) => {
                    const added = rows.some((row) => row.nickname.trim() === p.name);
                    return (
                      <li key={p.name}>
                        <button type="button" onClick={() => addFromLedger(p.name)} disabled={added}
                          className={['flex items-center gap-1 rounded-input border px-2 py-1 text-2xs font-semibold transition-colors',
                            added ? 'border-border-subtle bg-surface-high/40 text-ink-muted' : 'border-emerald-500/40 text-ink-secondary hover:bg-emerald-500/10 hover:text-ink-primary'].join(' ')}>
                          <span>{p.name}</span>
                          <span className="tabular-nums text-ink-muted">{p.buyins}바인</span>
                          <span className={added ? 'text-emerald-400' : 'text-emerald-300'}>{added ? '✓' : '＋'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* 오너 지시(2026-08-27): 안내가 쓸데없이 길다 — 핵심 1줄 + 나머지는 접힘 */}
      <details className="group/rkhelp text-2xs text-ink-muted">
        <summary className="cursor-pointer list-none">
          <span className="text-accent-300 dark:text-accent-200 font-semibold">닉네임 필수</span> · 프라이즈는 <span className="text-accent-300 dark:text-accent-200 font-semibold">만원 단위</span>(100만원=100)
          <span className="ml-1 text-ink-muted underline decoration-border-default underline-offset-2 group-open/rkhelp:hidden">자세히</span>
        </summary>
        <p className="mt-1">
          실명·프라이즈는 선택입니다. 1,000만원은 <span className="text-accent-300 font-semibold">1000</span>(원 단위로 치면 순위 점수가 1만 배로 잘못 쌓입니다). 등수마다 <span className="text-accent-300 font-semibold">기준 점수(+N점)</span>가 자동 부여되고, 프라이즈는 <span className="text-accent-300 font-semibold">매장 커뮤니티 순위 점수</span>로만 쓰입니다(금전적 가치 없음). 손님 화면엔 <span className="text-accent-300 font-semibold">실명(닉네임) 형식</span>으로 닉네임 일부를 가려 표시됩니다(예: 누리홀덤(나*리)).
        </p>
        {vchOn && <p className="mt-1">
          <b className="text-accent-300">매장이용권은 순위 저장과 따로 나갑니다.</b> 개수를 넣고 그 줄 맨 오른쪽 <b className="text-accent-300">전송</b>을 눌러야 그 한 명에게 발급됩니다 — 저장만으로는 나가지 않습니다. 비회원·본인인증 전 회원 줄은 전송 버튼이 비활성이고, 같은 닉네임 회원이 둘 이상(<span className="text-amber-300 font-semibold">중복</span>)이면 닉네임 칸 자동완성에서 받는 분을 먼저 골라 주세요.
        </p>}
        {!vchOn && <p className="mt-1">같은 닉네임 회원이 둘 이상(<span className="text-amber-300 font-semibold">중복</span>)이면 닉네임 칸 자동완성에서 기록 주인을 먼저 골라 주세요.</p>}
      </details>

      {/* 매장 차원 발급 게이트 — 줄마다 눌러 실패를 20번 확인하기 전에 한 번 말한다.
          순위 저장과 이용권 전송이 갈라져 있다는 사실을 여기서 다시 못 박는다(저장은 항상 된다). */}
      {vchOn && (() => {
        const blocked = venueSendBlock();
        if (blocked) {
          return (
            <p className="flex items-start gap-1.5 rounded-input border border-danger/40 bg-danger/[0.08] px-2.5 py-2 text-2xs leading-relaxed text-danger-deep dark:text-danger-light">
              <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
              <span><b>이용권 전송이 잠겨 있습니다</b> — {blocked}</span>
            </p>
          );
        }
        // 한도가 얼마 안 남았으면 미리 보여 준다 — 20줄을 다 치고 나서 3줄째에 막히는 게 최악이다
        if (quotaLeft !== null && quotaLeft <= 50) {
          return (
            <p className="flex items-start gap-1.5 rounded-input border border-amber-400/40 bg-amber-500/10 px-2.5 py-2 text-2xs leading-relaxed text-amber-200">
              <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
              <span>남은 발급 한도 <b className="tabular-nums">{quotaLeft.toLocaleString()}개</b> — 시상 전에 확인해 주세요. 한도 추가는 운영자 문의.</span>
            </p>
          );
        }
        return null;
      })()}

      {/* 저장 전 입력분 안내 — 초안은 자동 보관되지만, 상태를 보여주지 않으면 사장님이 오탭을 눈치채지 못한다 */}
      {(drafted || restorable) && (
        <div className="flex items-center gap-2 rounded-input border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-1.5">
          {restorable ? (
            <>
              <span className="min-w-0 flex-1 text-2xs text-amber-200">저장하지 않고 나갔던 입력분이 있어요({restorable.length}줄). 지금 화면은 <b>저장된 순위</b>입니다.</span>
              <button type="button" onClick={() => { setRows(restorable); setRestorable(null); }}
                className="shrink-0 rounded-input border border-amber-500/40 px-2 py-1 text-2xs font-bold text-amber-200 hover:bg-amber-500/10">되살리기</button>
              <button type="button" onClick={() => { clearRowsDraft(dkey); setRestorable(null); setDrafted(false); }}
                className="shrink-0 text-2xs text-ink-muted hover:text-ink-secondary">버리기</button>
            </>
          ) : (
            <span className="min-w-0 flex-1 text-2xs text-amber-200">✎ 저장 전 임시 보관 중 — 날짜·게임을 바꿔도 되돌아오면 그대로 있어요. 마무리하려면 아래 <b>순위 저장</b>을 눌러 주세요.</span>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-center py-8 text-2xs text-ink-muted">불러오는 중…</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li key={i}
              // 모바일 3행(칸 잘림·경계 어긋남 교정 — 오너 스크린샷): 닉네임·실명 / 프라이즈·이용권 / 비고
              // ⚠ 이 그리드는 명시 col-start 와 자동배치가 섞여 있다 — 이용권(5)·전송(7) 칸을
              //   숨기면서 8열 정의를 그대로 두면 비고·삭제가 빈 칸을 건너뛰어 어긋난다.
              //   그래서 열 정의도 같은 조건으로 6열(등수·닉네임·실명·프라이즈·비고·삭제)로 줄인다.
              className={['grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-1.5 rounded-input border p-1.5 transition-colors',
                vchOn
                  ? 'lg:grid-cols-[5.75rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_5rem_minmax(0,1.2fr)_5.25rem_2rem]'
                  : 'lg:grid-cols-[5.75rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem]',
                // 방금 옮긴 줄만 잠깐 물들인다 — 줄이 전부 똑같이 생겨서 어디로 갔는지 눈으로 못 쫓는다
                moved?.i === i ? 'border-accent-400/70 bg-accent-300/[0.07]' : 'border-border-subtle bg-surface-low/40'].join(' ')}>
              {/* 등수 = 행 순서. 순서를 못 바꾸면 정정 수단이 '지우고 다시 치기'뿐이라 ▲▼를 등수에 붙인다.
                  모바일은 2줄 그리드의 비어 있던 왼쪽 아래 칸을 세로로 흡수하고(row-span-2),
                  PC는 한 줄짜리라 가로로 편다(첫 열만 넓힘). */}
              <span className="row-span-3 lg:row-span-1 flex flex-col lg:flex-row items-center justify-center gap-0.5">
                <button
                  type="button" onClick={() => moveRow(i, i - 1)} disabled={i === 0}
                  aria-label={`${i + 1}위를 한 칸 위로`} title="위로 — 등수 올리기"
                  className="flex h-9 w-full shrink-0 items-center justify-center rounded-input text-ink-muted transition-colors hover:bg-surface-high hover:text-accent-300 active:scale-95 disabled:pointer-events-none disabled:opacity-20 lg:h-7 lg:w-6"
                >
                  <Icon name="chevron-up" size={14} />
                </button>
                {/* 숫자 자체가 '등수 직접 지정' 버튼 — ▲만으로는 20위를 1위로 올리는 데 19번을 눌러야 한다 */}
                <button type="button" onClick={() => promptMoveTo(i)}
                  aria-label={`${i + 1}위 — 등수 직접 지정`} title="등수 직접 지정 — 몇 위로 옮길지 입력"
                  className="flex min-h-9 min-w-9 shrink-0 flex-col items-center justify-center px-0.5 text-center leading-none">
                  <span className="block text-sm font-bold text-accent-300 dark:text-accent-200 tabular-nums">{i + 1}</span>
                  {/* 등수→점수 미리보기(매장 꾸미기 '기준 점수' 반영) */}
                  <span className="block text-[9px] font-semibold text-ink-muted tabular-nums">+{placementPointsOf(i + 1, cfg)}점</span>
                </button>
                <button
                  type="button" onClick={() => moveRow(i, i + 1)} disabled={i === rows.length - 1}
                  aria-label={`${i + 1}위를 한 칸 아래로`} title="아래로 — 등수 내리기"
                  className="flex h-9 w-full shrink-0 items-center justify-center rounded-input text-ink-muted transition-colors hover:bg-surface-high hover:text-accent-300 active:scale-95 disabled:pointer-events-none disabled:opacity-20 lg:h-7 lg:w-6"
                >
                  <Icon name="chevron-down" size={14} />
                </button>
              </span>
              <div className="relative min-w-0 col-start-2 row-start-1 lg:col-auto lg:row-auto">
                <input
                  type="text" value={row.nickname} maxLength={30}
                  onChange={(e) => onNickInput(i, e.target.value)}
                  onFocus={() => { if (row.nickname.trim()) setSugRow(i); }}
                  // 회원 여부는 rows 변화를 보는 대조 효과가 일괄로 채운다 — blur 마다 따로 조회하지 않는다
                  onBlur={() => { setTimeout(() => setSugRow((r) => (r === i ? null : r)), 180); }}
                  placeholder="닉네임 *"
                  className="input w-full min-w-0 text-sm py-2 pr-7"
                />
                {/* 자동완성 — 장부 명단 → 비회원 등록 → 회원(닉네임 · 실명) 순. 번호 없이 탭해서 선택.
                    장부에 이름을 넣을 때와 같은 문법: 치면 후보가 뜨고, [회원]/[비회원]/[중복] 을 보고 고른다.
                    [중복]은 같은 닉네임 회원이 둘 이상이라는 뜻 — 실명으로 구분해 고르면 그 사람으로 확정된다. */}
                {sugRow === i && row.nickname.trim() !== '' && (() => {
                  const dupNicks = new Set(
                    memCands.map((c) => c.nickname.trim().toLowerCase())
                      .filter((n, _idx, arr) => arr.filter((x) => x === n).length > 1),
                  );
                  return (
                    <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-input border border-border-default bg-surface-float shadow-dialog">
                      {ledgerNames.filter((n) => n.includes(row.nickname.trim())).slice(0, 4).map((n) => (
                        <li key={'l' + n}>
                          <button type="button" onMouseDown={(e) => { e.preventDefault(); pickSuggestion(i, 'ledger', n); }}
                            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-surface-high">
                            <span className="shrink-0 rounded-badge bg-accent-300/15 px-1.5 py-0.5 text-[9px] font-bold text-accent-300">장부</span>
                            <span className="truncate font-semibold text-ink-primary">{n}</span>
                          </button>
                        </li>
                      ))}
                      <li>
                        <button type="button" onMouseDown={(e) => { e.preventDefault(); pickSuggestion(i, 'guest', row.nickname.trim()); }}
                          className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-surface-high">
                          <span className="shrink-0 rounded-badge bg-surface-high px-1.5 py-0.5 text-[9px] font-bold text-ink-muted">비회원</span>
                          <span className="truncate text-ink-secondary">'{row.nickname.trim()}' 비회원으로 등록</span>
                        </button>
                      </li>
                      {memCands.map((c) => (
                        <li key={'m' + c.id}>
                          <button type="button" onMouseDown={(e) => { e.preventDefault(); pickSuggestion(i, 'member', c.nickname, c); }}
                            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-surface-high">
                            <span className="shrink-0 rounded-badge bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">회원</span>
                            {dupNicks.has(c.nickname.trim().toLowerCase()) && (
                              <span className="shrink-0 rounded-badge bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300"
                                title="같은 닉네임의 회원이 둘 이상입니다 — 실명을 보고 골라 주세요">중복</span>
                            )}
                            {/* 킬스위치 OFF 면 '미인증' 은 아무것도 막지 않는다 — 남겨두면 존재하지 않는
                                인증 화면으로 가라는 뜻 없는 경고가 된다(순위 기록은 원래 인증과 무관). */}
                            {vchOn && !c.verified && (
                              <span className="shrink-0 rounded-badge bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-300"
                                title="미인증 회원 — 본인인증 전이라 순위 기록은 되지만 매장이용권은 지급할 수 없어요"><Icon name="alert" size={9} className="mr-0.5 inline-block align-[-1px] shrink-0" />미인증</span>
                            )}
                            <span className="truncate font-semibold text-ink-primary">{c.nickname}{c.realName ? <span className="font-normal text-ink-muted"> · {c.realName}</span> : null}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
                {/* 회원 여부 — 체크=회원, 회색 원=비회원(미가입이면 점수·이용권 안 감), ⚠=동명이인.
                    판정 근거가 이용권 전송 가능 여부와 같은 소스라, 여기 뜬 표시와 전송 버튼 상태가 어긋나지 않는다. */}
                {row.nickname.trim() !== '' && (() => {
                  const t = targetOf(row.nickname);
                  if (t === 'unknown') return null;
                  // ⚠⚪✅🟡 이모지는 OS 마다 색·굵기가 달라 '회원/비회원/미인증'이 서로 구분되지 않았다.
                  const [icon, tone, label]: [IconName, string, string] =
                    t === 'ambiguous' ? ['alert', 'text-amber-300', '동명이인 — 후보에서 선택 필요']
                    : t === null ? ['circle', 'text-ink-muted', '비회원']
                      : !vchOn ? ['check-circle', 'text-emerald-400', '회원']
                      : t.verified ? ['check-circle', 'text-emerald-400', '회원(본인인증 완료)']
                      : ['circle', 'text-amber-300', '회원 — 본인인증 전'];
                  return (
                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2" title={label}>
                      <Icon name={icon} size={14} className={tone} role="img" aria-hidden={false} aria-label={label} />
                    </span>
                  );
                })()}
              </div>
              <input
                type="text" value={row.realName} maxLength={20}
                onChange={(e) => update(i, 'realName', e.target.value)}
                placeholder="실명"
                className="input w-full min-w-0 text-sm py-2 col-start-3 row-start-1 lg:col-auto lg:row-auto"
              />
              {/* 프라이즈는 '만원 단위'다. 단위 표기가 없어 원 단위로 치면 매장·전국 프라이즈
                  랭킹이 1만 배로 오염되므로, 값이 지워져도 안 사라지는 고정 suffix 로 못 박는다.
                  (placeholder 만으로는 입력 시작하는 순간 단위가 화면에서 사라진다) */}
              <div className="relative min-w-0 col-start-2 row-start-2 lg:col-auto lg:row-auto">
                <input
                  type="text" inputMode="numeric" value={row.prize} maxLength={12}
                  onChange={(e) => update(i, 'prize', e.target.value.replace(/[^\d.]/g, ''))}
                  onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; /* 한글 조합 확정 Enter 를 제출로 오인하지 않게 */ if (e.key === 'Enter' && i === rows.length - 1) addRow(); }}
                  placeholder="프라이즈"
                  aria-label="프라이즈 (만원 단위)"
                  title="만원 단위 — 100만원이면 100, 1,000만원이면 1000"
                  className={['input w-full min-w-0 text-sm py-2 pr-7',
                    prizeUnitRisk(row.prize) !== 'ok' ? 'border-amber-400/70 focus:border-amber-400 focus:ring-amber-400' : ''].join(' ')}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">만</span>
              </div>
              <button
                type="button" onClick={() => removeRow(i)} aria-label="줄 삭제"
                className="h-9 w-9 justify-self-center flex items-center justify-center rounded-input text-ink-muted hover:text-danger transition-colors col-start-4 row-start-1 lg:col-auto lg:row-auto lg:order-last"
              >
                <Icon name="close" size={14} />
              </button>
              {/* 모바일 2줄(고정 그리드로 칸 경계 정렬) · PC는 같은 행에 이어짐 */}
              {vchOn && (
                <div className="relative col-start-3 row-start-2 lg:col-start-5 lg:row-auto min-w-0 lg:w-auto">
                  <input type="number" inputMode="numeric" value={row.voucher} onChange={(e) => update(i, 'voucher', e.target.value.replace(/[^\d]/g, ''))} placeholder="이용권" className="input w-full text-sm py-2 pr-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">개</span>
                </div>
              )}
              {/* 이용권 칸이 빠지면 모바일 2행 오른쪽이 비므로 비고가 그 폭을 흡수한다(빈 칸 방지) */}
              <input type="text" value={row.note} onChange={(e) => update(i, 'note', e.target.value)} maxLength={50} placeholder="비고" className={['input row-start-3 lg:col-auto lg:row-auto w-full min-w-0 text-sm py-2', vchOn ? 'col-start-2' : 'col-start-2 col-span-2'].join(' ')} />
              {/* 맨 오른쪽 '전송' — 이 줄 한 명에게만 나간다(오너 지시 2026-08-28).
                  비회원·미인증·동명이인 줄은 아예 눌리지 않는다: 예전엔 눌러 봐야 서버에서 막혔고
                  그 실패가 '미지급 N명'으로 뭉개져 누가 왜 못 받았는지 알 수 없었다. */}
              {vchOn && (() => {
                const nick = row.nickname.trim();
                const st = sendMap[nickKey(nick)];
                const gate = sendGate(row);
                const cnt = parseInt(row.voucher, 10);
                const busy = st?.status === 'busy';
                const sent = st?.status === 'sent';
                const canSend = gate.ok && Number.isFinite(cnt) && cnt > 0 && !busy;
                return (
                  <button
                    type="button" onClick={() => sendVoucher(i)} disabled={!canSend}
                    title={gate.ok ? (sent ? '이미 보냈습니다 — 다시 누르면 추가 발급됩니다' : '이 줄의 이용권을 지금 전송') : gate.reason}
                    className={['col-start-3 row-start-3 lg:col-start-7 lg:row-auto h-9 w-full rounded-input border px-2 text-2xs font-bold transition-colors disabled:cursor-not-allowed',
                      sent ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : st?.status === 'error' ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                          : canSend ? 'border-accent-400/60 bg-accent-300/10 text-accent-300 hover:bg-accent-300/20'
                            : 'border-border-subtle bg-surface-high/40 text-ink-muted'].join(' ')}
                  >
                    {busy ? '전송 중…' : sent ? '✓ 전송됨' : <span className="inline-flex items-center justify-center gap-1"><Icon name="ticket" size={12} className="shrink-0" />전송</span>}
                  </button>
                );
              })()}
              {/* 행 단위 결과 — 성공은 개수까지, 실패는 서버가 준 사유 그대로. 토스트로 흘려보내면
                  20줄 중 어느 줄 얘기인지 알 수 없어 '누구에게 다시 보내야 하나'가 사라진다. */}
              {vchOn && (() => {
                const nick = row.nickname.trim();
                const st = sendMap[nickKey(nick)];
                const gate = sendGate(row);
                const cnt = parseInt(row.voucher, 10);
                const wants = Number.isFinite(cnt) && cnt > 0;
                // 매장 차원 사유(미승인·한도 0)는 위 배너가 한 번 말한다 — 줄마다 반복하면 20줄이 같은 문장으로 덮인다
                const venueLevel = venueSendBlock();
                const msg = st?.status === 'sent' ? { tone: 'ok', text: `매장이용권 ${st.count ? `${st.count}개 ` : ''}전송 완료` }
                  : st?.status === 'error' ? { tone: 'err', text: st.msg ?? '전송에 실패했습니다' }
                    : wants && !gate.ok && gate.reason !== '회원 확인 중…' && gate.reason !== venueLevel ? { tone: 'warn', text: gate.reason }
                      : null;
                if (!msg) return null;
                return (
                  <p className={['col-start-2 col-span-2 row-start-4 lg:col-start-2 lg:col-span-6 min-w-0 truncate text-2xs leading-relaxed',
                    msg.tone === 'ok' ? 'text-emerald-300' : msg.tone === 'err' ? 'text-rose-300' : 'text-amber-200'].join(' ')}
                    title={msg.text}>
                    {msg.tone === 'ok' ? '✓ ' : msg.tone === 'err' ? '✕ ' : '· '}{msg.text}
                  </p>
                );
              })()}
            </li>
          ))}
        </ul>
      )}

      {/* 프라이즈 단위 오입력 경고 — 저장 버튼을 누르기 전에 어느 등수가 이상한지 짚어 준다.
          막지 않는 이유: 1,000만원 프라이즈는 실제로 있어서, 차단하면 정상 입력을 잃는다. */}
      {(() => {
        const bad = rows.map((r, i) => ({ no: i + 1, risk: prizeUnitRisk(r.prize) })).filter((x) => x.risk !== 'ok');
        if (bad.length === 0) return null;
        return (
          <p className="rounded-input border border-amber-400/40 bg-amber-500/10 px-2.5 py-2 text-2xs leading-relaxed text-amber-200">
            <Icon name="alert" size={12} className="mr-0.5 inline-block align-[-1px] shrink-0" /><b>{bad.map((x) => `${x.no}위`).join(', ')}</b> 프라이즈가 큽니다 — 이 칸은 <b>만원 단위</b>예요.
            100만원이면 <b>100</b>, 1,000만원이면 <b>1000</b>. 원 단위로 치면 매장·전국 프라이즈 순위가 크게 왜곡됩니다.
          </p>
        );
      })()}

      <button type="button" onClick={addRow}
        className="w-full py-2 rounded-input border border-dashed border-border-default text-xs font-semibold text-ink-secondary hover:text-ink-primary hover:border-accent-400/50 transition-colors">
        + 줄 추가
      </button>


      <button type="button" onClick={save} disabled={saving} className="btn-primary w-full disabled:opacity-60">
        {saving ? '저장 중…' : `${date === today ? '오늘' : date} · ${eventName || '메인'} 순위 저장`}
      </button>
    </div>
  );
}

function Lbl({ t, children }: { t: string; children: ReactNode }) {
  return (<label className="block"><span className="mb-1 block text-2xs font-bold text-ink-secondary">{t}</span>{children}</label>);
}

// ── 업주 셀프 매장 생성 폼 — 소속 매장이 없는 업주 진입 화면 ────────────────────
function VenueCreateForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [kakao, setKakao] = useState('');
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState('');
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState('');
  const [busy, setBusy] = useState(false);

  const pickImage = (f: File | null) => {
    setImgFile(f);
    setImgPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ''; });
  };
  const ready = !!(name.trim() && address.trim() && phone.trim());
  const submit = async () => {
    if (!ready) { toast.show('매장 이름·주소·전화번호는 필수입니다', 'error'); return; }
    setBusy(true);
    try {
      let imageUrl: string | undefined;
      if (imgFile && user) imageUrl = await uploadPoster(user.id, imgFile);
      await createMyVenue({
        name: name.trim(), region: region.trim(), address: address.trim(), phone: phone.trim(),
        imageUrl, kakaoUrl: kakao.trim() || undefined, description: desc.trim() || undefined, businessHours: hours.trim() || undefined,
      });
      toast.show('매장이 생성되었습니다 — 운영자 승인 후 일정탐색·커뮤니티에 공개됩니다', 'success');
      await onCreated();
    } catch (e) { toast.show(e instanceof Error ? e.message : '매장 생성 실패', 'error'); }
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 py-6">
      <div className="text-center space-y-1">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-300/15 text-accent-300"><Icon name="store" size={26} /></div>
        <h2 className="text-base font-bold text-ink-primary">내 매장 만들기</h2>
        <p className="text-2xs leading-relaxed text-ink-muted">매장 정보를 입력하면 NURI HOLDEM 커뮤니티에 매장이 등록됩니다.<br />운영자 승인 후 일정탐색·커뮤니티에 공개돼요.</p>
        {/* 신규 업주 온보딩 — 운영 가이드 슬라이드로 전체 흐름 먼저 파악 */}
        <button type="button" onClick={() => window.open('/guide/owner.html', '_blank', 'noopener')}
          className="mx-auto inline-flex items-center gap-1 rounded-input border border-accent-400/40 bg-accent-300/10 px-3 py-1.5 text-2xs font-bold text-accent-300 hover:bg-accent-300/20 transition-colors">
          <Icon name="book-open" size={13} className="shrink-0" />운영 가이드 먼저 보기 <span className="text-ink-muted font-normal">(포스터→장부→클락→정산)</span>
        </button>
      </div>

      <div className="space-y-3 rounded-card border border-border-default bg-surface-low p-4">
        {/* 대표 이미지(선택) */}
        <div>
          <p className="mb-1 text-2xs font-bold text-ink-secondary">대표 이미지 <span className="font-normal text-ink-muted">(선택)</span></p>
          <label className="flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-input border border-dashed border-border-default bg-surface-base hover:border-accent-400/50">
            {imgPreview
              ? <img src={imgPreview} alt="미리보기" className="h-full w-full object-cover" />
              : <span className="text-2xs text-ink-muted">탭하여 매장 사진 업로드</span>}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <Lbl t="매장 이름 *"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="예) 로티아레나" className="input w-full text-sm" /></Lbl>
        <Lbl t="주소 *"><input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={120} placeholder="예) 서울 강남구 …" className="input w-full text-sm" /></Lbl>
        <div className="grid grid-cols-2 gap-2">
          <Lbl t="전화번호 *"><input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder="02-000-0000" className="input w-full text-sm" /></Lbl>
          <Lbl t="지역 (선택)"><input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={40} placeholder="예) 경기북부" className="input w-full text-sm" /></Lbl>
        </div>
        <Lbl t="카카오톡 채팅방 링크 (선택)"><input value={kakao} onChange={(e) => setKakao(e.target.value)} maxLength={200} placeholder="https://open.kakao.com/…" className="input w-full text-sm" /></Lbl>
        <Lbl t="영업시간 (선택)"><input value={hours} onChange={(e) => setHours(e.target.value)} maxLength={60} placeholder="예) 매일 18:00~익일 04:00" className="input w-full text-sm" /></Lbl>
        <Lbl t="매장 소개 (선택)"><textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={3} placeholder="매장 분위기·특징·이벤트 등을 자유롭게" className="input w-full resize-none text-sm" /></Lbl>

        <button type="button" disabled={!ready || busy} onClick={submit} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-50">
          {busy ? '생성 중…' : '+ 매장 생성하기'}
        </button>
        <p className="text-2xs text-ink-muted">* 표시는 필수입니다. 생성 후 ‘매장 꾸미기·설정’에서 추가 정보(갤러리·테마·블라인드 등)를 채울 수 있어요.</p>
      </div>
    </div>
  );
}

// ── 직원 관리(업주) ───────────────────────────────────────────────────────────
const TITLE_SUGGEST = ['매니저', '플로어', '딜러', '칩러너', '매장장', '직원'];

// ── 직원 관리 허브(아코디언) ──────────────────────────────────────────────────
function StaffHub({ venueId }: { venueId: string }) {
  const [open, setOpen] = useState<string>('members'); // 한 번에 하나(스크롤 절약)
  const items: { id: string; label: string; node: ReactNode }[] = [
    { id: 'members',  label: '구성원 목록',                 node: <StaffManager venueId={venueId} /> },
    { id: 'schedule', label: '딜러 출근 스케줄',            node: <StaffSchedule venueId={venueId} /> },
    { id: 'wage',     label: '인건비 관리 (시급·급여일·휴무)', node: <StaffWageManager venueId={venueId} /> },
    { id: 'settle',   label: '인건비 정산 (월 급여·총 인건비)', node: <StaffSettlement venueId={venueId} /> },
    { id: 'log',      label: '직원 출근일지',                node: <StaffWorkLog venueId={venueId} /> },
  ];
  return (
    <div className="space-y-2">
      {items.map((it) => {
        const isOpen = open === it.id;
        return (
          <div key={it.id} className="rounded-card border border-border-default bg-surface-low overflow-hidden">
            <button type="button" onClick={() => setOpen(isOpen ? '' : it.id)}
              className="w-full flex items-center justify-between px-3 py-3 text-left hover:bg-surface-high transition-colors">
              <span className="text-sm font-bold text-ink-primary">{it.label}</span>
              <span className="text-accent-300 dark:text-accent-200 text-xs">{isOpen ? '▲ 접기' : '▼ 펼치기'}</span>
            </button>
            {isOpen && <div className="px-3 pb-3 border-t border-border-subtle pt-3">{it.node}</div>}
          </div>
        );
      })}
    </div>
  );
}

function StaffManager({ venueId }: { venueId: string }) {
  const toast = useToast();
  // 킬스위치(2026-08-29) — 이용권이 꺼진 동안 '이용권내역 권한' 토글은 아무 화면도 열지 못한다.
  // 부여된 권한(vouch)은 서버에 그대로 남는다 — 다시 켜면 이 줄이 원래대로 돌아온다.
  const vchOn = useIdentityEnabled();
  const [staff, setStaff] = useState<User[]>([]);
  const [invites, setInvites] = useState<VenueInvite[]>([]);
  const [access, setAccess] = useState<string[]>([]); // 장부·순위 권한 보유 직원 id
  const [vouch, setVouch] = useState<string[]>([]); // 이용권 내역 열람 권한 보유 직원 id
  const [loading, setLoading] = useState(true);
  // 초대 입력 하나가 두 경로를 겸한다 — '@' 가 있으면 이메일(기존 경로 그대로),
  // 없으면 아이디(닉네임) 검색. 모드 토글을 두지 않는 이유: 업주는 상대가
  // '이메일로 가입했는지'를 모르고, 아는 건 화면에 보이는 아이디뿐이다.
  const [ident, setIdent] = useState('');
  const [results, setResults] = useState<TransferTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [tick, setTick] = useState(0);
  const identTrim = ident.trim();
  const isEmailMode = identTrim.includes('@');

  useEffect(() => {
    setLoading(true);
    Promise.all([getMyVenueStaff(venueId), getMyVenueInvites(venueId), getLedgerAccessUserIds(venueId), getVoucherAccessUserIds(venueId)])
      .then(([s, i, a, va]) => { setStaff(s); setInvites(i); setAccess(a); setVouch(va); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tick, venueId]);
  const reload = () => setTick((t) => t + 1);

  const saveTitle = async (id: string, title: string) => {
    const prev = staff.find((s) => s.id === id)?.staffTitle ?? '';
    if (title.trim() === prev.trim()) return;
    setStaff((arr) => arr.map((s) => (s.id === id ? { ...s, staffTitle: title.trim() || undefined } : s)));
    try { await setStaffTitle(id, title.trim()); }
    catch (e) { toast.show(msgOf(e, '직책 저장 실패'), 'error'); reload(); }
  };
  const toggleAccess = async (id: string) => {
    const has = access.includes(id);
    setAccess((a) => has ? a.filter((x) => x !== id) : [...a, id]);
    try { if (has) await revokeLedgerAccess(venueId, id); else await grantLedgerAccess(venueId, id); }
    catch (e) { toast.show(msgOf(e, '장부·순위 권한 변경 실패'), 'error'); reload(); }
  };
  const toggleVoucher = async (id: string) => {
    const has = vouch.includes(id);
    setVouch((a) => has ? a.filter((x) => x !== id) : [...a, id]);
    try { if (has) await revokeVoucherAccess(venueId, id); else await grantVoucherAccess(venueId, id); }
    catch (e) { toast.show(msgOf(e, '이용권내역 권한 변경 실패'), 'error'); reload(); }
  };

  // 아이디 검색 — 기존 RPC find_user_for_transfer 재사용(쪽지·이용권 전달과 같은 동선·같은 300ms).
  // profiles 직접 select 는 RLS 로 빈 결과라 반드시 RPC 경유. 결과의 id 가 초대의 정본 키다
  // (닉네임엔 DB unique 제약이 없어 문자열로 보내면 동명이인에서 오초대가 난다).
  useEffect(() => {
    if (isEmailMode || identTrim.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      findUserForTransfer(identTrim)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [identTrim, isEmailMode]);

  // 초대 실행 — 식별자는 uuid(목록에서 고름) · 이메일 · 아이디 정확일치 셋 다 서버가 해석한다.
  const sendInvite = async (identifier: string) => {
    if (!identifier) return;
    setInviting(true);
    try {
      await inviteStaffByEmail(identifier, venueId);
      toast.show('초대를 보냈습니다 — 상대가 알림에서 수락하면 합류합니다', 'success');
      setIdent('');
      setResults([]);
      reload();
    } catch (err) {
      // 서버는 '이미 매장 소속 직원입니다' / '본인은 초대할 수 없습니다' 처럼 이유를 정확히 준다.
      // 그 문장을 그대로 살린다 — 뭉개면 업주가 다시 눌러도 되는 상황인지 알 수 없다.
      toast.show(msgOf(err, '초대에 실패했습니다'), 'error');
    } finally {
      setInviting(false);
    }
  };
  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    void sendInvite(identTrim);
  };

  const cancel = async (id: string) => {
    try { await cancelStaffInvite(id); toast.show('초대를 취소했습니다', 'info'); reload(); }
    catch (e) { toast.show(msgOf(e, '초대 취소에 실패했습니다'), 'error'); }
  };
  const remove = async (s: User) => {
    if (!confirm(`${s.name} 구성원을 제거하시겠습니까?
일반 회원으로 전환되고 장부·순위${vchOn ? ' / 이용권내역' : ''} 권한도 함께 회수됩니다.`)) return;
    try { await removeStaff(s.id); toast.show(`구성원을 제거했습니다 — 장부${vchOn ? '·이용권' : '·순위'} 권한도 함께 회수됐습니다`, 'success'); reload(); }
    catch (e) { toast.show(msgOf(e, '구성원 제거에 실패했습니다'), 'error'); }
  };

  return (
    <div className="space-y-4">
      {/* 구성원 초대 — 아이디(닉네임) 검색 또는 이메일 */}
      <form onSubmit={invite} className="space-y-1.5">
        <label htmlFor="staff-invite-ident" className="block text-xs font-semibold text-ink-secondary">구성원 초대</label>
        <div className="flex gap-2">
          <input
            id="staff-invite-ident"
            type="text"
            inputMode="email"
            value={ident}
            onChange={(e) => setIdent(e.target.value)}
            placeholder="아이디(닉네임) 또는 이메일"
            autoComplete="off"
            aria-describedby="staff-invite-hint"
            className="input flex-1 text-sm"
          />
          <button type="submit" disabled={inviting || !identTrim} className="btn-primary px-4 shrink-0 disabled:opacity-60">초대</button>
        </div>

        {/* 아이디 경로 — 디바운스 검색 후보. 선택하면 그 회원 id 로 초대해 동명이인 오초대를 막는다. */}
        {!isEmailMode && identTrim.length >= 2 && (
          <div className="rounded-input border border-border-subtle bg-surface-low">
            {searching && results.length === 0 ? (
              <p className="px-2.5 py-2 text-2xs text-ink-muted">검색 중…</p>
            ) : results.length === 0 ? (
              <p className="px-2.5 py-2 text-2xs text-ink-muted">
                가입 이력이 없어요 — 이메일로 초대하거나, 먼저 일반 회원으로 가입하도록 안내해 주세요.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {results.map((u) => {
                  const already = staff.some((s) => s.id === u.id);
                  const pending = invites.some((iv) => iv.userId === u.id);
                  const blocked = already || pending;
                  return (
                    <li key={u.id} className="flex items-center gap-2 px-2.5 py-2">
                      <span className="flex-1 min-w-0 truncate text-sm text-ink-primary">{u.display}</span>
                      {u.verified === false && <span className="shrink-0 text-2xs text-ink-muted">미인증</span>}
                      {already && <span className="shrink-0 text-2xs text-ink-muted">이미 구성원</span>}
                      {pending && <span className="shrink-0 text-2xs text-amber-400">초대 대기중</span>}
                      <button
                        type="button" disabled={inviting || blocked}
                        onClick={() => void sendInvite(u.id)}
                        className="shrink-0 text-2xs font-bold px-2.5 py-1.5 rounded-badge border border-accent-400/40 bg-accent-300/15 text-accent-300 dark:text-accent-200 hover:bg-accent-300/25 transition-colors disabled:opacity-40"
                      >초대</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* 초대 절차 — 문장 나열 대신 번호 배지 스텝(순서가 의미 있는 3단계) */}
        <ol id="staff-invite-hint" className="flex flex-col gap-1 rounded-input border border-border-subtle bg-surface-low px-2.5 py-2 sm:flex-row sm:items-center sm:gap-3">
          {(['상대가 일반 회원으로 가입', '아이디나 이메일로 초대', '상대가 알림에서 수락 → 합류'] as const).map((t, i) => (
            <li key={t} className="flex items-center gap-1.5 text-2xs text-ink-muted">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-300/15 text-[10px] font-bold tabular-nums text-accent-300 dark:text-accent-200">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </form>

      {loading ? (
        <p className="text-center py-6 text-2xs text-ink-muted">불러오는 중…</p>
      ) : (
        <>
          {/* 대기중 초대 */}
          {invites.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-ink-secondary">대기중 초대 ({invites.length})</p>
              <ul className="space-y-1.5">
                {invites.map((iv) => (
                  <li key={iv.id} className="flex items-center gap-2 p-2.5 rounded-input bg-surface-low border border-amber-500/30">
                    <span className="flex-1 min-w-0 truncate">
                      <span className="text-sm text-ink-primary">{iv.name}</span>
                      <span className="text-2xs text-ink-muted"> · {iv.email}</span>
                      <span className="text-2xs text-amber-400"> · 수락 대기</span>
                    </span>
                    <button type="button" onClick={() => cancel(iv.id)} className="text-2xs px-2.5 py-1.5 rounded-input text-ink-muted hover:text-danger-light transition-colors">취소</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 구성원 목록 */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-ink-secondary">구성원 ({staff.length})</p>
            <p className="text-2xs text-ink-muted">직책은 표시용 라벨이고, <span className="text-accent-300 dark:text-accent-200 font-semibold">장부·순위 권한</span>은 별도로 켜야 적용됩니다. 권한 받은 직원만 장부 담당자로 지정·운영할 수 있습니다.</p>
            <datalist id="staff-title-suggest">
              {TITLE_SUGGEST.map((t) => <option key={t} value={t} />)}
            </datalist>
            {staff.length === 0 ? (
              <p className="py-6 text-center text-2xs text-ink-muted">아직 구성원이 없습니다. 위에서 아이디나 이메일로 초대해 보세요.</p>
            ) : (
              <ul className="space-y-2">
                {staff.map((s) => {
                  const hasAccess = access.includes(s.id);
                  return (
                  <li key={s.id} className="p-3 rounded-card bg-surface-low border border-border-subtle space-y-2">
                    <div className="flex items-center gap-3">
                      <div className={['w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold', onColorInkClass(s.avatarColor ?? '#5A6175')].join(' ')}
                        style={{ background: s.avatarColor ?? '#5A6175' }}>
                        {s.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-ink-primary truncate">
                          {s.name}{s.staffTitle ? <span className="ml-1.5 text-2xs font-bold text-accent-300 dark:text-accent-200">· {s.staffTitle}</span> : null}
                        </span>
                        <p className="text-2xs text-ink-muted truncate">{s.nickname ? `@${s.nickname}` : s.email}</p>
                      </div>
                      <button type="button" onClick={() => remove(s)} className="text-2xs px-2.5 py-1.5 rounded-input text-ink-muted hover:text-danger-light transition-colors">제거</button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text" defaultValue={s.staffTitle ?? ''} list="staff-title-suggest" maxLength={20}
                        onBlur={(e) => saveTitle(s.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        placeholder="직책 (매니저·딜러 등)"
                        className="input flex-1 min-w-0 text-xs py-1.5"
                      />
                      <button type="button" onClick={() => toggleAccess(s.id)}
                        className={['shrink-0 text-2xs font-bold px-2.5 py-1.5 rounded-badge border transition-colors',
                          hasAccess ? 'bg-accent-300/15 text-accent-300 dark:text-accent-200 border-accent-400/40' : 'bg-surface-float text-ink-muted border-border-default'].join(' ')}>
                        장부·순위 {hasAccess ? '권한 ✓' : '권한 없음'}
                      </button>
                      {vchOn && (
                        <button type="button" onClick={() => toggleVoucher(s.id)}
                          className={['shrink-0 text-2xs font-bold px-2.5 py-1.5 rounded-badge border transition-colors',
                            vouch.includes(s.id) ? 'bg-accent-300/15 text-accent-300 dark:text-accent-200 border-accent-400/40' : 'bg-surface-float text-ink-muted border-border-default'].join(' ')}>
                          이용권내역 {vouch.includes(s.id) ? '✓' : '✗'}
                        </button>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
