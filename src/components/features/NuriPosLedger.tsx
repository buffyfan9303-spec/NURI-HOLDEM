// src/components/features/NuriPosLedger.tsx
import { Fold } from '../atoms/Fold';
import { TICKET_WON } from '../../lib/units'; // 티켓 T 단위(1T=1만원) — 분납 합계 환산
import { useIsDesktop, useIsMdUp } from '../../lib/responsive';
import HoldToConfirmButton from '../atoms/HoldToConfirmButton';
// NURI POS 장부 — 표(table) 형태. 장부 입장 시 세션 설정(담당직원·게임·단가·이벤트·딜러) → 보드.
// 셀 2-Tap 입력(결제수단 + 완납/미수/가게지원). 가게지원만 미수 불가(티켓은 가불 허용). 미수=붉은색.
// 8바인 초과 시 가로 스크롤. 비고 컬럼 수기 입력. 장부 마감=읽기전용 스냅샷+메모.
// (엑셀 내보내기는 2026-09-09 오너 지시로 제거 — 외부 반출 기능 삭제.)
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LedgerToolsContext, LedgerFullscreenContext } from './ledgerTools';
import { createPortal } from 'react-dom';
import { useToast } from '../atoms/Toast';
import DateTimePicker from '../atoms/DateTimePicker';
import { useAuth } from '../../contexts/AuthContext';
import { hasRankingForGame, rankingEventOf } from '../../lib/rankingGame'; // 순위 완료·이동 대상은 (날짜, 게임) — F02
import Icon from '../atoms/Icon';
import { deleteLedgerPlayerAtomic, CELL_TAKEN, REDUCE_NEEDS_PW, cancelMyRecentBuyin,
  type LedgerBuyin, type LedgerSession, type LedgerPlayer, type PaymentMethod, type LedgerSessionListItem, type DiscountPreset, type EarlyType, type LedgerGame, type LedgerCloseSnapshot, type LedgerLossSummary,
  visitorLabel, wonToMan, WON_PER_MAN, buyinFinance, isBuyinExcluded, earlyTypeOf, setBuyinEarly, MAIN_GAME_SEQ, ledgerLossSummary,
  setBuyinAddon, addonFinance, addonEntryOf, addonTotals, type AddonMethod, type AddonFinance,
  splitMismatch, summaryRowsOf,

  discountAmountOf, autoDiscountIndex, discountAllowed, discountSummary, type DiscountSummary, ZERO_TENDER, type Tender,
  getLedgerSession, getLedgerGames, saveLedgerSession, openLedgerSession, closeLedgerSession, reopenLedgerSession, deleteLedgerSession,
  setRegistrationClosed, getLastLedgerSettings, getLedgerSessionList, getLedgerAccessUserIds, notifyLedgerOpen,
  getLedgerBuyins, upsertBuyin, upsertBuyinSplit, cancelBuyin,
  getLedgerPlayers, addLedgerPlayer, updateLedgerPlayer, renameLedgerPlayer,
  searchRegisteredPlayers, type RegisteredPlayer,
  subscribeLedger, posHasPassword, getLedgerPresets, type LedgerPreset,
  getPendingBuyinRequests, approveBuyinRequest, rejectBuyinRequest, subscribeBuyinRequests, type BuyinRequest, type VoucherUse,
  voucherShortOf, type VoucherShort, type ShortPayMethod,
  getLastClosedRound, type LastClosedRound,
  discountsAppendOnly, ledgerSessionMatches, cancelPwStateFromError, type LedgerRowOwner,
  LEDGER_SPLIT_MISMATCH, LEDGER_SESSION_MISSING, ledgerErrorText, LEDGER_ALREADY_OPEN, ticketUsedT,
} from '../../api/ledger';
import { getStaffSchedule, addStaffShift, getStaffWages } from '../../api/staffSchedule';
import { getVenueRankings } from '../../api/rankings';
import { getSchedules, type Schedule } from '../../api/schedules';
import { clockPatchFromSchedule, applyToLedger, applyToClock, presetFromRound } from '../../lib/gameInherit';
import { ledgerStartClockConfig, sessionEarlyOf, sessionPatchFromSchedule, clockStartAction, clockStartRow } from '../../lib/ledgerStart';
import { saveGamePreset, type GamePreset } from '../../api/presets';
import PresetPicker from './PresetPicker';
import { resolveDiscountIndex } from '../../api/discountIndex';
import { getClockState, saveClockState, saveClockPatch, createCoalescingSaver, saveClockLevel, subscribeClock, defaultClockConfig, deriveClockCounts, computeLiveStats, composeLiveStats, earlyWindowOf, writeLedgerStats, levelSnapshot, levelMovePatch, levelUndoPatch, levelCatchUp, currentLevelNo, earlyTypeAtLevel, earlyAutoOf, clampAdjEarlies, effectiveLevel, type ClockState, type ClockConfig, type ClockLevelSnapshot } from '../../api/clock';
import { clockPhase, formatCountdown } from '../../lib/clockLevel';
import { useClockSecond } from '../../lib/clockTick';
import { getMyVenueStaff, type User } from '../../api/auth';
import Modal from '../atoms/Modal';
import { planBuyinApprovals, voucherLeftover, voucherLeftoverText } from '../../lib/buyinApproval';
import { discountsFromPromotions, ledgerLabelOf } from '../../lib/posterDiscounts';
import type { AccessLoad } from '../../lib/staffAccess';
import { isFreshResponse, type RequestStamp } from '../../lib/staleResponse';
import { useVenueScope } from '../../lib/useVenueScope';
import { fillEmptyFromPrefill } from '../../lib/ledgerPrefill';
import LoadErrorCard from '../atoms/LoadErrorCard';
import EmptyState from '../atoms/EmptyState';
import SegmentedTabs from '../atoms/SegmentedTabs';
import { SkeletonList } from '../atoms/Skeleton';
import { kstToday } from '../../lib/kst';
import { businessDateOf, useBusinessDate } from '../../lib/businessDate';
import { serverNow, serverTimeKnown, serverTimeSettled, whenServerTimeSettled } from '../../lib/serverTime';   // D1 — 장부 클락 바도 서버 기준 시각
import { useResyncOnWake } from '../../lib/realtimeResync';
import { createBackoff } from '../../lib/retryBackoff';
import './ledgerLazy.css';

// 🔴 2026-09-20 (E2-C/F5) — 여기만 **기기 로컬 날짜**를 썼다. 서버 RPC(request_buyin·check_in)와
//   앱의 나머지(kstToday)는 전부 **KST** 기준이라, 해외·시계 오설정 기기에서 새 장부의 기본 날짜와
//   당일 포스터 자동 연동이 하루 어긋났다. 같은 기준으로 맞춘다(src/lib/kst.ts 가 정본).
const today = () => kstToday();
const shiftDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };

// 얼리 설정용 숫자 입력(라벨 + 접미사)
function EarlyNum({ label, value, onChange, suffix, disabled }: { label: string; value: number; onChange: (n: number) => void; suffix: string; disabled?: boolean }) {
  return (
    // 2026-09-28 — 라벨과 입력을 잇는다(<label>). 예전 <div>+<span> 은 스크린리더·getByLabel 이 칸 이름을 못 읽었다.
    <label className="block">
      <span className="block text-2xs text-ink-muted mb-0.5">{label}</span>
      <div className="relative">
        <input type="number" inputMode="numeric" value={value || ''} disabled={disabled}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
          className="input w-full text-sm pr-8 tabular-nums disabled:opacity-50" />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted pointer-events-none">{suffix}</span>
      </div>
    </label>
  );
}

// 금액은 만원 단위 입력/표시 (천원=0.1만 까지 허용)
const manVal   = (won: number): number | '' => (won ? won / WON_PER_MAN : '');
const parseMan = (v: string): number => Math.max(0, Math.round((parseFloat(v) || 0) * WON_PER_MAN));

const METHOD_SHORT: Record<PaymentMethod, string> = { ticket: 'T', cash: '현', transfer: '이', card: '카', support: '지원' };
/** 정산 제외 패널·마감 메모용 전체 이름 */
const METHOD_LABEL: Record<PaymentMethod, string> = { ticket: '티켓', cash: '현금', transfer: '이체', card: '카드', support: '가게지원' };
// 유형 빠른 선택(고정) + 직접입력은 별도
const VISITOR_OPTS: { code: string; label: string }[] = [
  { code: 'new', label: '신규방문' }, { code: 'regular', label: '기존손님' },
  { code: 'staff', label: '관계자' }, { code: 'other', label: '기타' },
];

function hhmm(iso: string): string {
  try { return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return ''; }
}

interface SelectedCell { playerName: string; entryNo: number; buyin: LedgerBuyin | null; }

/** 게임관리 '장부' 바로가기 시드 — 연결 장부가 있으면 그 날짜로 바로, 없으면 포스터 정보 프리필로 새 등록 */
export interface LedgerSeed {
  date: string;          // 열 장부 날짜(연결 장부 날짜 or 포스터 날짜)
  /** 열 게임(1=메인, 2+=사이드). 연결 장부 목록에서 고른 그 게임 — 없으면 메인. 날짜만 넘기면 같은 날 사이드 장부가 메인으로 착지했다(F01). */
  gameSeq?: number;
  scheduleId: string;
  isNew: boolean;        // true=연결 장부 없음 → 시작 설정에 포스터 프리필
  title?: string;
  buyinAmount?: number;
  gtd?: boolean;
  /** 2026-10-02 오너(데일리 펍) — 게임을 고르지 않은 진입(단계 바 '장부'). 그날 진행 중인 마지막 게임에 착지한다(storeDestination.autoLand). */
  autoLand?: boolean;
}

/**
 * D7(2026-09-29 design-reviewer) — 키보드 포커스가 고정 열(sticky) **밑으로** 들어간 바인 칸을 그 폭만큼 가로로 밀어 보인다.
 * 브라우저의 포커스 스크롤은 칸이 조금이라도 보이면 멈추고 scroll-padding 도 보지 않아(390·360 실측: 6번 중 1~2번 가림),
 * 고정 열의 실제 끝(머리행 sticky th 의 좌우 경계)을 재서 보정한다. 모바일은 오른쪽 두 열이 고정이 아니라(right:auto) 왼쪽만 본다.
 */
function revealPastSticky(sc: HTMLElement, el: HTMLElement) {
  if (!el.closest('td') || el.closest('td.sticky')) return;
  // 키보드 포커스만 — 마우스·터치로 칸을 누른 포커스에서 표를 옆으로 밀면 누른 자리가 도망가는 새 튐이 된다(verifier 2026-09-29).
  if (!el.matches(':focus-visible')) return;
  requestAnimationFrame(() => {
    const ths = [...sc.querySelectorAll<HTMLElement>('thead th.sticky')];
    const box = sc.getBoundingClientRect();
    let L = box.left, R = box.right;
    for (const t of ths) {
      const cs = getComputedStyle(t), rc = t.getBoundingClientRect();
      if (cs.left !== 'auto') L = Math.max(L, rc.right);
      else if (cs.right !== 'auto') R = Math.min(R, rc.left);
    }
    const r = el.getBoundingClientRect();
    if (r.left < L) sc.scrollLeft -= L - r.left;
    else if (r.right > R) sc.scrollLeft += r.right - R;
  });
}

/**
 * F-1(2026-10-02 audit-motion-1002) — PC(lg+) 장부 표 상자는 **헤더 밑 ~ 정산 바 위** 칸 안에서만 굴린다.
 * 예전엔 70vh 상자의 절반(1440: 630 중 413px)이 화면 밖·정산 바 밑인데 휠을 그 상자가 먼저 먹어서,
 * 사용자는 보이지 않는 아래쪽으로 행이 흘러가는 표를 굴렸다(표 2567px 를 다 내린 뒤에야 페이지가 움직였다).
 * → 상자 높이는 그 칸에 맞추고(CSS), 상자가 칸에 다 들어오기 전에는 **페이지가 먼저** 그 차이만큼 움직인다.
 * 상자 위/아래 경계가 칸 안이면 아무것도 안 한다(브라우저 기본: 표가 먼저, 끝나면 페이지로 이어짐).
 * 반환값 = 페이지를 움직여야 하는 양(px, 0 이면 그대로). dy 의 부호가 방향이다.
 */
function pageFirstDelta(box: HTMLElement, bar: HTMLElement | null, dy: number): number {
  const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-top')) || 97;
  const r = box.getBoundingClientRect();
  const barTop = bar && bar.getClientRects().length > 0 ? bar.getBoundingClientRect().top : window.innerHeight;
  let need = 0;
  if (dy > 0 && r.bottom > barTop + 1) need = Math.min(dy, r.bottom - barTop);
  else if (dy < 0 && r.top < head - 1) need = Math.max(dy, r.top - head);
  if (need > 0 && window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 1) return 0; // 문서 끝 — 표에 넘긴다
  if (need < 0 && window.scrollY <= 0) return 0;
  return need;
}
const isLgUp = () => window.matchMedia('(min-width: 1024px)').matches;

// venueName — 장부 삭제 확인에 '어느 매장의' 장부인지 보인다(review-store-link-1002 2a: 날짜·메인만으로는 매장을 구별할 수 없었다).
export default function NuriPosLedger({ venueId, venueName, canManage, onMakeRankingDraft, onOpenClock, onOpenStats, onOpenSchedule, seed, followGame, settleSignal = 0, active = true, gameSlot = null, onTodayGame }: {
  venueId: string; canManage: boolean; venueName?: string; active?: boolean;
  /** 셸(VenueManageTab)의 '오늘 게임' 칩 줄 자리. 있으면 게임 스위처를 거기로 portal 한다 — 게임 선택 줄이 판 안팎 두 벌이던 것을 하나로(감사 L-3). */
  gameSlot?: HTMLElement | null;
  /** 영업일(오늘) 장부에서 보는 게임이 바뀌면 셸에 알린다 — 문맥 줄·클락·순위가 같은 게임을 본다(칩 하나로 3면, IA2). */
  onTodayGame?: (seq: number, title?: string, byUser?: boolean) => void;
  onMakeRankingDraft?: (date: string, names: string[], eventName?: string) => void;
  /** 세션 요약의 '대회 …' → 손님이 보는 대회 상세. 없으면 글자로만 남는다(AdminTab 등). */
  onOpenSchedule?: (s: Schedule) => void;
  onOpenClock?: (date: string, gameSeq: number) => void;
  /** 마감 후 '주간 리포트 보기' — 통계 섹션으로 이동(업주/운영자만 전달) */
  onOpenStats?: () => void;
  /** 게임관리에서 '장부' 버튼으로 진입 시 — 해당 포스터의 장부로 바로 이동/등록 */
  seed?: LedgerSeed | null;
  /** IA2 게임 칩 바 픽 신호 — 오늘 장부의 해당 게임으로 보드 전환(n=논스, 같은 게임 재픽도 반영) */
  followGame?: { seq: number; n: number } | null;
  /**
   * '정산으로' 신호(논스). 스크롤 지시가 아니다 — 정산바는 position:fixed 라 이미 화면에 있다.
   * 예전엔 `window.scrollTo({ top: document.body.scrollHeight })` 로 문서 맨 아래를 추측해 내려갔는데,
   * 정산바는 뷰포트에 붙어 있어서 그 스크롤은 정산과 아무 관계가 없었다(내용만 끝으로 밀려남).
   * 필요한 것은 "어느 버튼을 누르라는 것인지 지목"이고, 그래서 포커스 + 짧은 강조만 한다.
   */
  settleSignal?: number;
}) {
  const toast = useToast();
  const inFullscreen = useContext(LedgerFullscreenContext);
  const wsTools = useContext(LedgerToolsContext); // 작업대 도구([이용권 확인]·[전체화면]) — 날짜 줄·목록 검색 줄 끝에 그린다
  const { user, isAdmin } = useAuth();
  const operatorOk = isAdmin || !!user?.approved; // 담당직원: 승인된 계정만 운영
  const operatorName = user?.name ?? user?.nickname ?? '담당직원';

  // B1(2026-09-28) — 처음 여는 날짜는 **영업일**(서버 ledger_business_date — 자정 넘긴 토너면 어제 장부).
  //   달력 오늘로 열면 00:30 에 빈 시작 화면이 뜨고 손님 바인 요청(날짜=영업일)이 대기열에서 안 보였다.
  const [date, setDate]       = useState(() => businessDateOf(venueId));
  const biz = useBusinessDate(venueId, active);
  const [session, setSession] = useState<LedgerSession>({ venueId, sessionDate: today(), gameSeq: 1, buyinAmount: 0, cardAmount: null, gameType: 'gtd', targetEntries: 0, maxEntries: 0, isAddon: false, addonStack: 0, regClosed: false, closed: false, discounts: [], earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: null });
  const [buyins, setBuyins]   = useState<LedgerBuyin[]>([]);
  const [players, setPlayers] = useState<LedgerPlayer[]>([]);
  const [pendingReqs, setPendingReqs] = useState<BuyinRequest[]>([]); // 손님 자가 바인요청(대기)
  const [payPick, setPayPick] = useState<string | null>(null); // 승인+바인 결제수단 선택 중인 요청 id
  const [splitFor, setSplitFor] = useState<string | null>(null); // 분할 결제 입력 중인 요청 id
  // 20260930i — 이용권이 모자라 서버가 돌려준 숫자(k장·남은 금액). 카드 아래에 '남은 금액 결제 방법' 을 연다.
  const [shortFor, setShortFor] = useState<{ id: string; target: number; use: VoucherUse; s: VoucherShort } | null>(null);
  const [splitAmts, setSplitAmts] = useState<{ cash: number; card: number; transfer: number }>({ cash: 0, card: 0, transfer: 0 });
  const [rejectFor, setRejectFor] = useState<string | null>(null); // 거절 사유 선택 중인 요청 id
  const [gameSeq, setGameSeq] = useState(MAIN_GAME_SEQ);   // 현재 보고있는 게임(1=메인, 2+=사이드)
  // 칩 바 픽 추종(IA2 완전 통합) — 신호가 올 때 1회만 '오늘·그 게임'으로 이동.
  // 내부 GameSwitcher·과거 날짜 탐색은 그대로 자유(신호 없는 동안 이 컴포넌트가 정본).
  useEffect(() => {
    if (!followGame) return;
    setDate(businessDateOf(venueId));   // B1 — 칩 바는 영업일의 게임을 보여 준다(GameChipBar 와 같은 날짜)
    setGameSeq(followGame.seq);
    autoLandRef.current = null;         // 고른 게임이 착지 자동 선택보다 우선
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followGame?.n]);
  const [games, setGames]     = useState<LedgerGame[]>([]); // 그 날짜의 게임 목록(스위처용)
  const [loading, setLoading] = useState(true);
  // 지금 session·games 가 어느 (매장|날짜|회차) 의 것인가 — 첫 로드가 끝나야 채워진다.
  //   `loading` 만으로는 날짜가 바뀐 **첫 커밋**을 못 막는다(setLoading(true) 는 같은 커밋의 앞선 형제 이펙트가 큐에 넣을 뿐이라
  //   그 커밋의 다른 이펙트는 아직 loading=false 와 **앞 날짜 session** 을 본다 — review-store-link-1002b A2).
  const [sessionFor, setSessionFor] = useState<string | null>(null);
  // 조회 실패를 '빈 장부'와 구분하기 위한 세 번째 상태(로딩/빈값/실패)
  const [loadError, setLoadError] = useState<unknown>(null);
  // D8(2026-09-29) — 바인·명단 재조회(reload) 실패. loadError 와 따로 둔다: 둘은 realtime·재접속에서 동시에 돌아,
  //   같은 칸에 쓰면 곧 성공한 reloadSession 의 setLoadError(null) 이 바인 실패를 지운다(순서에 따라 결과가 달라진다).
  const [rowsErr, setRowsErr] = useState<unknown>(null);
  const [hasPw, setHasPw]     = useState(false);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [payBusy, setPayBusy] = useState(false); // 결제 저장 중 — 더블탭 이중 기록 방지
  // LEDGER-REDUCE-PASSWORD(오너 2026-09-24) — 매출을 줄이는 수정은 취소 비밀번호로만. 값 = 비밀번호를 받아 다시 저장하는 함수.
  const [reduceAsk, setReduceAsk] = useState<((pw: string) => Promise<void>) | null>(null);
  // 보드 상단 '바인 할인' 고정 선택. null = 자동(클락 레벨) — **기본값이라 기존 운영이 그대로다**.
  // 0 = 할인 없음 고정, 1~5 = 그 프리셋 고정. 결제창·QR 승인이 모두 이 값을 기본으로 받는다.
  const [discPick, setDiscPick] = useState<number | null>(null);
  const [discHelp, setDiscHelp] = useState(false); // 할인 안내 ⓘ 펼침
  // 1d(오너 2026-10-02) — 모바일(<768) 장부는 진입하면 **요약**이 기본이다: 게임 합계 + 손님별 한 줄. '편집' 을 누르면 지금의 체크 화면.
  //   숫자는 새로 계산하지 않는다 — 합계는 정산바와 같은 stats, 손님 줄은 표의 '총바인·미수' 열과 같은 playerTotals·countOf 다.
  //   판에 다시 들어올 때마다(active 상승) 요약으로 돌아간다. PC(≥768)는 종전 그대로(이 상태를 보지 않는다).
  const isMdUpLedger = useIsMdUp();
  const [mobileEdit, setMobileEdit] = useState(false);
  const wasActiveForSummary = useRef(active);
  useEffect(() => {
    if (active && !wasActiveForSummary.current) { setMobileEdit(false); setQuery(''); }
    wasActiveForSummary.current = active;
  }, [active]);
  const [exOpen, setExOpen] = useState(false);     // 정산 제외 펼침(PC 는 접힘 줄·내용이 갈라져 있어 위로 올렸다)
  const [query, setQuery]     = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<string | null>('regular'); // 기본 선택: 기존손님
  const [suggest, setSuggest] = useState<RegisteredPlayer[]>([]); // 가입자 검색 결과(바인 계정 연동)
  const [closeOpen, setCloseOpen] = useState(false);
  const [editOpen, setEditOpen]   = useState(false);
  const [editPlayer, setEditPlayer] = useState<LedgerPlayer | null>(null);
  const [prefill, setPrefill]     = useState<Partial<LedgerSession> | null>(null);
  const [copyMain, setCopyMain]   = useState<LedgerSession | null>(null); // 사이드 생성 시 '메인 설정 복사'용
  // 🔴 L-06(audit-link-1002) — 이 판은 (관리자의) 매장 A→B 전환에 다시 마운트되지 않는다. A 매장 '직전 게임 설정' 응답이
  //   늦게 오면 B 의 새 게임 폼에 '직전 게임 설정을 불러왔습니다'(A 의 참가비·할인·게임명)로 붙었다. 매장 몫 조회는 run 으로 —
  //   요청 매장이 지금 매장과 다르면 응답을 버린다(공용 지점 lib/useVenueScope).
  const run = useVenueScope(venueId);
  const [mode, setMode]           = useState<'list' | 'board'>('list');
  const [sessionList, setSessionList] = useState<LedgerSessionListItem[]>([]);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set()); // 장부 목록 날짜별 접기(사이드 늘면 단축)
  // 데일리 펍(2026-10-02 감사 L-9) — 진행 중 게임이 있는 날은 마감 회차(4개 이상)를 접어 둔다. 펼친 날짜 집합.
  const [shownClosed, setShownClosed] = useState<Set<string>>(new Set());
  const [listLoading, setListLoading] = useState(true);
  // 목록도 보드와 같은 세 갈래(로딩/실패/빈값) — 실패를 '없음'으로 두면 업주가 안내대로
  // "+ 장부 추가"를 눌러 서버에 이미 있는 그 날짜에 중복 장부를 만든다.
  const [listError, setListError] = useState<unknown>(null);
  const [listQuery, setListQuery] = useState('');
  const [filterFrom, setFilterFrom] = useState(''); // 기간 필터 시작일
  const [filterTo, setFilterTo]     = useState(''); // 기간 필터 종료일
  const [presets, setPresets] = useState<LedgerPreset[]>([]);
  const [venueSchedules, setVenueSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    // B8(2026-09-28) — 매장 전환 가드: A 매장 포스터·프리셋이 B 로 바꾼 뒤 도착해 B 장부의 '포스터 불러오기' 목록을 덮지 않게.
    let alive = true;
    setVenueSchedules([]); setPresets([]);
    getSchedules().then((all) => { if (alive) setVenueSchedules(all.filter((s) => s.venueId === venueId)); }).catch(() => {});
    getLedgerPresets(venueId, 50).then((p) => { if (alive) setPresets(p); }).catch(() => {});
    return () => { alive = false; };
  }, [venueId]);

  // 금일(세션 날짜) 출근자 — 세션 딜러 명단 자동 채움용
  const [scheduledNames, setScheduledNames] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;   // B8 — 앞 매장·앞 날짜 출근자가 늦게 와서 지금 장부 딜러 칩을 덮지 않게
    getStaffSchedule(venueId, date, date).then((ss) => { if (alive) setScheduledNames([...new Set(ss.map((s) => s.name))]); }).catch(() => {});
    return () => { alive = false; };
  }, [venueId, date]);
  // 세션 딜러 명단 → 출근 스케줄에 등록(추가형)
  const syncDealersToSchedule = useCallback(async (d: string, dealersText?: string) => {
    if (!dealersText) return;
    const names = dealersText.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    for (const n of names) { try { await addStaffShift(venueId, d, n); } catch { /* noop */ } }
  }, [venueId]);
  const scheduleTitle = (id?: string | null) => venueSchedules.find((s) => s.id === id)?.title ?? null;

  const [staff, setStaff] = useState<User[]>([]);
  // 장부 접근 권한 보유 직원 — P02(2026-09-13): 조회 실패를 [] 로 두면 담당 직원 후보가 **조용히 빈다**
  // (업주가 "권한 직원이 없네" 로 읽는다). 확인 중/실패/준비됨을 갈라 들고, 실패는 폼에서 재시도로 말한다.
  const [accessLoad, setAccessLoad] = useState<AccessLoad>({ status: 'loading' });
  const [accessTick, setAccessTick] = useState(0);
  // 직원 목록 조회 실패도 후보를 '나' 뿐으로 조용히 줄인다 — 같은 배너로 말한다(독립 검증 Q2, 2026-09-13).
  const [staffLoadError, setStaffLoadError] = useState<unknown>(null);
  useEffect(() => {
    let alive = true;
    setStaffLoadError(null);
    // 🔴 D5(2026-09-25) — 매장을 **넘긴다**. 인자 없이 부르면 서버가 owner_id 첫 매장으로 폴백해
    //   공동운영자·관리자에게는 직원 0명(담당 후보가 '나' 뿐)이었고, 매장을 바꿔도 앞 매장 직원이 남았다(deps 에 venueId 없음).
    getMyVenueStaff(venueId)
      .then((s) => { if (alive) setStaff(s); })
      .catch((e: unknown) => { if (alive) setStaffLoadError(e); });
    return () => { alive = false; };
  }, [venueId, accessTick]);
  // 금일 딜러 칩의 후보 명부 — 계정 직원(venue_staff)만으로는 **비회원 딜러가 통째로 빠진다**.
  // StaffSchedule.tsx 가 쓰는 것과 **같은 두 출처**를 합친다(명부가 두 벌이 되면 어느 화면이 맞는지 알 수 없다).
  // ⚠ 실패해도 조용히 빈 배열로 둔다 — 명부가 없으면 칩만 안 뜨고 직접 입력은 그대로다(장부를 막지 않는다).
  const [wageNames, setWageNames] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    getStaffWages(venueId).then((ws) => { if (alive) setWageNames(ws.map((w) => w.name)); }).catch(() => {});
    return () => { alive = false; };
  }, [venueId]);
  const dealerOptions = useMemo(() => {
    const seen = new Set<string>(), out: string[] = [];
    const add = (n?: string | null) => {
      const v = (n ?? '').trim();
      if (!v || seen.has(v)) return;
      seen.add(v); out.push(v);
    };
    staff.forEach((x) => add(x.name ?? x.nickname));
    wageNames.forEach(add);
    return out;
  }, [staff, wageNames]);
  useEffect(() => {
    let alive = true;
    setAccessLoad({ status: 'loading' });
    getLedgerAccessUserIds(venueId)
      .then((ids) => { if (alive) setAccessLoad({ status: 'ready', ids }); })
      .catch((e: unknown) => { if (alive) setAccessLoad({ status: 'error', error: e }); });
    return () => { alive = false; };
  }, [venueId, accessTick]);
  const reloadAccessIds = useCallback(() => setAccessTick((t) => t + 1), []);
  const operatorOptionsError = accessLoad.status === 'error' ? accessLoad.error : staffLoadError;
  // 현재 사용자가 이 매장 업주/운영자인지(전체 접근). 아니면 장부권한 직원(담당 지정 장부만).
  // 2026-09-28 — 서버 판정(can_manage_pos: 승인 업주·승인 공동운영자·관리자)을 그대로 쓴다. 예전엔 '프로필 매장 == 이 매장인
  //   venue_owner' 만 전체 접근이라, 서버는 허용하는 **공동운영자**(또는 전환기로 다른 소속 매장을 연 업주)가
  //   담당 지정 안 된 장부를 못 열고 담당자 후보도 '일부'로 표시됐다.
  const fullAccess = isAdmin || canManage;
  // 담당직원 후보 = 업주/운영자(나) + 장부 접근 권한 직원만(최대 10은 폼에서 제한)
  const operatorOptions = useMemo(() => {
    const accessIds = accessLoad.status === 'ready' ? accessLoad.ids : [];
    const opts: { id: string; label: string }[] = [];
    if (user) opts.push({ id: user.id, label: `${user.name}${isAdmin ? ' (운영자)' : ' (업주/나)'}` });
    for (const s of staff) if (s.id !== user?.id && accessIds.includes(s.id)) opts.push({ id: s.id, label: `${s.name}${s.staffTitle ? ` · ${s.staffTitle}` : ''}${s.nickname ? ` · @${s.nickname}` : ''}` });
    return opts;
  }, [user, staff, isAdmin, accessLoad]);
  // 전 직원 이름맵(권한 무관) — 담당이 operatorOptions(권한 직원) 밖이어도 정확히 표기(오라벨 방지)
  const staffNameById = useMemo(() => {
    const m = new Map<string, string>();
    if (user) m.set(user.id, user.name ?? user.nickname ?? '나');
    for (const s of staff) m.set(s.id, s.name ?? s.nickname ?? '직원');
    return m;
  }, [user, staff]);
  const operFull = (id?: string | null) => (id ? (staffNameById.get(id) ?? '직원') : '미지정');

  // 🔴 review-store-link-1002 2a — 늦게 온 A 매장 장부 목록이 B 화면에 그려지면 그 행의 🗑 가 **B 매장의 같은 날짜·회차 장부를
  //   하드 삭제**했다(deleteLedgerSession 은 지금 venueId 를 쓴다). 목록은 run 으로 받고, 매장이 바뀌는 렌더에서 목록·삭제 대상을 비운다.
  const loadList = useCallback(() => {
    setListLoading(true);
    setListError(null);
    run('list', getLedgerSessionList, (list) => {
      setSessionList(list);
      const ds = [...new Set(list.map((s) => s.sessionDate))]; // 최신순(날짜 desc)
      setCollapsedDates(new Set(ds.slice(1))); // 최신 날짜만 펼침, 과거 날짜는 접어 목록 단축
      setListLoading(false);
    }, (e) => { setListError(e); setListLoading(false); });
  }, [run]);
  useEffect(() => { if (mode === 'list') loadList(); }, [mode, loadList, venueId]);

  const openBoard = (d: string, g = MAIN_GAME_SEQ) => {
    autoLandRef.current = null; userPickRef.current = true; setDate(d); setGameSeq(g); setSelected(null); setMode('board');
    if (d === biz) onTodayGame?.(g, undefined, true);   // F-3 — 고른 순간 알린다(아래 pickGame 주석)
  };
  // 사이드 게임 추가 — 그 날짜의 다음 game_seq로 전환(새 게임이면 설정 폼이 뜸)
  const addSide = () => {
    autoLandRef.current = null; userPickRef.current = true; const maxSeq = games.reduce((m, g) => Math.max(m, g.gameSeq), 0);
    const next = Math.max(MAIN_GAME_SEQ + 1, maxSeq + 1);
    setGameSeq(next); setSelected(null);
    if (date === biz) onTodayGame?.(next, undefined, true);
  };

  // 게임관리 '장부' 바로가기: 연결 장부로 즉시 이동, 없으면 포스터 정보를 시작 설정에 프리필
  // (ref에 대상 날짜를 묶어 — 세션 fetch 타이밍에 이전 날짜 화면이 잠깐 보여도 오적용/유실 없음)
  // movedTo: 그 날짜 메인 칸이 남의 장부로 차 있어 빈 게임으로 한 번 옮겼다는 표시(무한 이동 방지)
  const seedFillRef = useRef<{ date: string; fill: Partial<LedgerSession>; movedTo?: number } | null>(null);
  // 데일리 펍 착지 — 이 (매장|날짜) 첫 조회가 오면 '진행 중 마지막 게임' 으로 한 번 옮긴다. 사용자가 게임을 고르면(스위처·목록) 지운다.
  const autoLandRef = useRef<string | null>(null);
  // 3b(2026-10-02 검토) — 사용자가 **직접** 고른 게임인가(스위처·목록·사이드 추가·게임을 지정한 시드). 셸은 이것만 '게임 고름'으로
  //   기록한다. 기본 메인·자동 착지까지 고름으로 세면 단계 바 '장부' 의 자동 착지가 세션당 첫 진입 한 번뿐이었다.
  const userPickRef = useRef(false);
  useEffect(() => {
    if (!seed) return;
    if (!seed.autoLand) userPickRef.current = true;
    if (seed.isNew) {
      seedFillRef.current = {
        date: seed.date,
        fill: {
          title: seed.title, buyinAmount: seed.buyinAmount ?? 0,
          gameType: seed.gtd ? 'gtd' : 'entry', scheduleId: seed.scheduleId,
        },
      };
    }
    setDate(seed.date);
    setGameSeq(seed.gameSeq ?? MAIN_GAME_SEQ); // 연결 장부 목록에서 고른 게임 그대로(새 장부는 메인)
    autoLandRef.current = seed.autoLand ? `${venueId}|${seed.date}|${seed.gameSeq ?? MAIN_GAME_SEQ}` : null;
    setMode('board');
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps -- venueId 는 착지 표식의 주인 표시일 뿐(시드 신호로만 돈다)
  // 장부 삭제는 바인·명단·세션을 통째로 지우는 하드 삭제 RPC라 복구 수단이 0이다.
  // 그런데 정작 '되돌릴 수 있는' 정산 마감은 꾹-누르기로 막혀 있어 위험도와 확인 강도가 역전돼 있었다.
  // → confirm 1회를 없애고, 무엇을 잃는지(바인·인원·매출·미수)를 실수치로 먼저 보여준 뒤 마감과 같은 꾹-누르기로 통일한다.
  // venueId — 누른 그 순간의 매장. 지울 때 이 값을 쓴다(지금 매장과 다르면 지우지 않는다).
  const [delTarget, setDelTarget] = useState<{ venueId: string; date: string; gameSeq: number; label: string } | null>(null);
  const [delLoss, setDelLoss] = useState<LedgerLossSummary | null>(null);
  const [delLossErr, setDelLossErr] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [listVenue, setListVenue] = useState(venueId);
  if (listVenue !== venueId) {
    setListVenue(venueId);
    setSessionList([]); setListLoading(true); setListError(null); setDelTarget(null);
  }
  const [delPw, setDelPw] = useState('');   // 20260925g N19 — 비밀번호 설정 매장에서 바인 있는 장부를 지울 때 서버가 취소 비밀번호를 본다
  const delSeq = useRef(0); // (reload 와 같은 관행) 다른 장부의 늦은 응답이 현재 수치를 덮지 않게
  // 목록 API는 단가·담당만 들고 있어 '잃는 양'을 모른다. 목록 로드를 무겁게 만들지 않으려고
  // 삭제를 누른 그 장부 하나만 이 시점에 조회한다(보드의 buyins/players 는 다른 날짜 것이라 못 씀).
  const askDeleteSession = useCallback((d: string, g = MAIN_GAME_SEQ) => {
    const my = ++delSeq.current;
    setDelTarget({ venueId, date: d, gameSeq: g, label: `${venueName ? `${venueName} · ` : ''}${d} ${g === MAIN_GAME_SEQ ? '메인' : `사이드${g - 1}`}` });
    setDelLoss(null); setDelLossErr(false); setDelPw('');
    // 목록 화면은 보드를 안 거쳐 hasPw 가 옛 값일 수 있다 — 비밀번호 칸을 낼지 지금 다시 묻는다(실패하면 직전 값 유지).
    run('pw', posHasPassword, setHasPw); // 실패하면 직전 값 유지
    Promise.all([getLedgerSession(venueId, d, g), getLedgerBuyins(venueId, d, g), getLedgerPlayers(venueId, d, g)])
      .then(([s, bs, ps]) => { if (my === delSeq.current) setDelLoss(ledgerLossSummary(bs, ps, s)); })
      .catch(() => { if (my === delSeq.current) setDelLossErr(true); });
  }, [venueId, venueName, run]);
  const doDeleteSession = useCallback(async () => {
    if (!delTarget || delBusy) return; // 홀드 재진입/연타로 두 번 실행되지 않게
    if (delTarget.venueId !== venueId) { setDelTarget(null); return; } // 누른 뒤 매장이 바뀌었다 — 다른 매장 장부를 지우지 않는다
    setDelBusy(true);
    try {
      await deleteLedgerSession(delTarget.venueId, delTarget.date, delTarget.gameSeq, hasPw ? delPw : null);
      toast.show(`${delTarget.label} 장부를 삭제했습니다`, 'info'); // 어느 장부였는지 남긴다(오삭제 사후 추적)
      setDelTarget(null); setDelPw(''); loadList();
    }
    catch (e) {
      // 서버가 비밀번호 문구(틀림·잠김·미설정)로 거절하면 그 사실로 hasPw 를 바로 고친다(D3 와 같은 규칙) — 모달은 열어 둔다.
      const st = cancelPwStateFromError(ledgerErrorText(e, ''));
      if (st !== null) setHasPw(st);
      toast.show(ledgerErrorText(e, '삭제 실패'), 'error', { durationMs: 7000 });
    }
    finally { setDelBusy(false); }
  }, [venueId, delTarget, delBusy, toast, loadList, hasPw, delPw]);

  // (A4) reload 에도 요청 토큰 가드 — 실시간 콜백이 날짜 전환 중 호출돼도 stale 응답이 현재 명단을 덮지 않게.
  const reloadSeq = useRef(0);
  // 감액 수정 — 서버 RPC(update_ledger_buyin_reduce)로 보낸다. 틀린 비밀번호는 서버 문구 그대로 띄우고 모달·입력은 연 채 둔다.
  const saveReduce = async (save: (pw: string) => Promise<unknown>, pw: string) => {
    setPayBusy(true);
    try {
      await save(pw);
      setReduceAsk(null); setSelected(null);
      toast.show('수정했습니다', 'success');
      reload();
    } catch (e) { notePwFromError(e); toast.show(ledgerErrorText(e, '수정 실패'), 'error', { durationMs: 7000 }); }   // 서버 문구(남은 횟수·잠금)를 그대로 — 20260925g
    finally { setPayBusy(false); }
  };
  // 🔴 D3(2026-09-25) — hasPw 는 보드를 열 때 **한 번** 읽은 값이었다(그것도 조회 실패를 '없음'으로 삼킨 값).
  //   그 사이 다른 기기에서 비밀번호를 설정하면 업주 화면은 '비밀번호 없이 취소' 버튼만 내밀고 서버는 매번 거절 →
  //   입력칸이 끝내 안 나왔다. ① 다시 보일 때 재조회 ② 서버가 비밀번호 문구로 거절하면 그 사실로 바로 고친다.
  const refreshPw = useCallback(() => { run('pw', posHasPassword, setHasPw); }, [run]); // 실패하면 직전 값 유지 · 늦은 A 매장 응답은 버린다(L-06)
  const notePwFromError = (e: unknown) => {
    const st = cancelPwStateFromError(ledgerErrorText(e, ''));   // msgOf 는 42501 문구를 뭉개 '비밀번호가 올바르지 않습니다' 를 못 본다(20260925g)
    if (st !== null) setHasPw(st);
  };
  // 오너 결정(2026-09-24): 비밀번호 **미설정** 매장은 업주·공동사장(canManage = can_manage_pos)만 시트 없이 저장, 직원은 막는다.
  //   비밀번호가 설정되면 업주 포함 모두 시트에서 비밀번호를 받는다. 최종 판정은 서버가 다시 한다.
  const askReducePw = async (save: (pw: string) => Promise<unknown>) => {
    if (hasPw) { setReduceAsk(() => (pw: string) => saveReduce(save, pw)); return; }
    if (!canManage) { toast.show('취소 비밀번호가 설정되지 않은 매장은 업주만 금액을 줄일 수 있습니다', 'error'); return; }
    await saveReduce(save, '');
  };
  const reload = useCallback(() => {
    const my = ++reloadSeq.current;
    Promise.all([getLedgerBuyins(venueId, date, gameSeq), getLedgerPlayers(venueId, date, gameSeq)])
      .then(([b, p]) => { if (my === reloadSeq.current) { setBuyins(b); setPlayers(p); setRowsErr(null); } })
      .catch((e) => { if (my === reloadSeq.current) setRowsErr(e); });   // 마지막 정상 값은 유지하고 인라인 배너로 알린다
  }, [venueId, date, gameSeq]);
  // ⚠ 내부에서 실패를 삼키면 안 된다 — reloadSession 의 Promise.all 이 이 실패를 못 본다
  //   (이미 resolve 된 것으로 보여 아래 setLoadError(null) 이 방금 실패한 재조회를 '성공'으로 지운다).
  // 🔴 D2(2026-09-25) — 세션 재조회에도 **순번·대상 가드**를 건다(reload 에만 있었다). realtime·online·다시 보임이
  //   재조회를 겹쳐 내는 동안 날짜·게임을 옮기면, 앞 장부의 늦은 응답이 지금 장부의 session(단가·할인·마감)을 덮었다 —
  //   그 단가가 바로 다음 바인의 금액 스냅샷이 된다. 초기 로드도 같은 표를 올려 날아가던 재조회를 무효로 만든다.
  const sessionReq = useRef<RequestStamp<string>>({ seq: 0, owner: '' });
  const bumpSessionReq = useCallback((): RequestStamp<string> => {
    const stamp = { seq: sessionReq.current.seq + 1, owner: `${venueId}|${date}|${gameSeq}` };
    sessionReq.current = stamp;
    return stamp;
  }, [venueId, date, gameSeq]);
  const loadGames = useCallback(() => getLedgerGames(venueId, date), [venueId, date]);
  // C05 보완: return 을 살려도 `.catch(() => {})` 로 실패를 삼키면 '조회 실패'와 '정상'이 구분되지 않는다
  // — 다른 접수대가 단가·할인·마감을 바꿨는데 이쪽 재조회가 실패하면 화면은 예전 값을 그대로 들고
  //   아무 표시 없이 정상처럼 보이고, 운영자는 낡은 단가로 승인·정산한다.
  // 기존 loadError 장치를 그대로 쓴다(새 상태 추가 안 함) — 렌더 쪽에서 '보여줄 데이터가 있는가'로
  // 전면 카드(초기 로드 실패)와 인라인 배너(재조회 실패, 마지막 정상 값 유지)를 가른다 — hasBoardData 참고.
  const reloadSession = useCallback(() => {
    const stamp = bumpSessionReq();
    return Promise.all([
      getLedgerSession(venueId, date, gameSeq),
      loadGames(),
    ]).then(([s, gs]) => {
      if (!isFreshResponse(stamp, sessionReq.current)) return;   // 늦게 온 앞 장부 응답 — 지금 화면을 덮지 않는다
      setSession(s); setGames(gs); setLoadError(null);
    })
      .catch((e) => { if (isFreshResponse(stamp, sessionReq.current)) setLoadError(e); }); // session/games 는 건드리지 않는다 — 마지막 정상 값 유지
  }, [venueId, date, gameSeq, loadGames, bumpSessionReq]);

  useEffect(() => {
    // stale 응답 가드 — 날짜를 빠르게 바꾸면(예: 게임관리 '장부' 바로가기) 이전 날짜의
    // 응답이 늦게 도착해 현재 세션을 빈 값으로 덮어쓰는 race가 난다. cleanup으로 무시.
    let alive = true;
    setLoading(true);
    setLoadError(null);
    setRowsErr(null);
    bumpSessionReq();   // D2 — 앞 장부로 날아가던 reloadSession 응답을 무효로
    // B3(2026-09-28) — 바인·명단 재조회(reload)도 같은 순간 무효로 한다. 예전엔 reloadSeq 를 안 올려,
    //   전환 직전에 realtime·online 으로 나간 앞 매장·날짜·게임의 reload 응답이 전환 뒤 도착해 buyins/players 를 덮었다
    //   (그 칸을 누르면 남의 장부 행을 id 로 고치거나 취소한다).
    ++reloadSeq.current;
    // D3 — 비밀번호 조회 실패는 장부를 막지 않되 '없음'으로도 바꾸지 않는다(null = 모름 → 직전 값 유지).
    Promise.all([getLedgerSession(venueId, date, gameSeq), getLedgerBuyins(venueId, date, gameSeq), getLedgerPlayers(venueId, date, gameSeq), posHasPassword(venueId).catch(() => null), getLedgerGames(venueId, date)])
      .then(([s, b, p, pw, gs]) => {
        if (!alive) return;
        setSession(s); setBuyins(b); setPlayers(p); if (pw !== null) setHasPw(pw); setGames(gs); setSessionFor(`${venueId}|${date}|${gameSeq}`);
      })
      // ⚠ 여기서 실패를 삼키면 '조회 실패'가 '오늘 게임 없음'이 되어 세팅 폼이 뜬다.
      //   사장님이 [시작]을 누르는 순간 진행 중이던 장부의 마감·단가·할인이 덮인다.
      .catch((e) => { if (alive) setLoadError(e); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [venueId, date, gameSeq]); // eslint-disable-line react-hooks/exhaustive-deps -- bumpSessionReq 는 같은 세 값에서 파생

  // 데일리 펍(하루 장부 10건+) — 게임을 고르지 않고 들어왔는데 지금 보드(기본 메인)가 **마감**이면 그날 진행 중(마감 전)인 가장 나중 회차로 한 번 옮긴다.
  //   메인이 진행 중이면 그대로 둔다(메인+사이드 동시 운영 매장이 사이드에 서지 않게). 진행 중이 없으면 그대로.
  //   판이 이미 열려 있던(keep-alive) 재진입은 조회가 다시 안 나가므로 '이 장부를 다 받았는가'(sessionFor)와 시드로 판단한다.
  useEffect(() => {
    // F-3 — 표식에 **시드가 가리킨 게임**까지 묶는다. 예전 표식(매장|날짜)은 시드 effect 와 같은 커밋에서 아직 바뀌기 전 게임
    //   (keep-alive 판이 서 있던 사이드14, 이미 조회 끝)을 보고 '마감 아님' 으로 표식을 소비했고, 그다음 시드의 메인(마감)에 섰다(e2e ⑥ 390 실측 3/10).
    if (autoLandRef.current !== `${venueId}|${date}|${gameSeq}` || sessionFor !== `${venueId}|${date}|${gameSeq}`) return;
    autoLandRef.current = null;
    const live = games.filter((g) => !g.closed);
    const target = live.length > 0 ? live[live.length - 1].gameSeq : null;
    const curClosed = games.find((g) => g.gameSeq === gameSeq)?.closed ?? false;
    if (curClosed && target != null && target !== gameSeq) setGameSeq(target);
  }, [seed, venueId, date, gameSeq, sessionFor, games]);

  // 영업일(오늘) 장부에서 보는 게임 → 셸에 알린다(문맥 줄 '매장 › 날짜 › 게임'·클락 시드·순위가 같은 게임). 게임 줄이 하나가 된 뒤(2026-10-02)
  //   게임을 바꾸는 손은 이 판의 스위처뿐이라, 셸 칩이 하던 '칩 하나로 3면' 을 여기서 이어 준다. 지난 날짜·목록 모드는 알리지 않는다.
  useEffect(() => {
    if (!active || mode !== 'board' || date !== biz || sessionFor !== `${venueId}|${date}|${gameSeq}`) return;
    const byUser = userPickRef.current;
    userPickRef.current = false;
    onTodayGame?.(gameSeq, games.find((g) => g.gameSeq === gameSeq)?.title ?? undefined, byUser);
  }, [active, mode, date, biz, gameSeq, sessionFor]); // eslint-disable-line react-hooks/exhaustive-deps -- games·콜백 정체성은 알릴 이유가 아니다

  // C05: reloadSession() 이 빠져 있었다 — 다른 접수대의 마감·단가·할인 변경이 realtime 으로 와도
  // 현재 화면의 session state 가 안 바뀌었다(loadGames 만으로는 games 목록만 갱신됨).
  // ⚡ 이 판이 실제로 보일 때만(active) 구독 — keep-alive 로 숨은 탭이 채널을 계속 물고 있지 않게(§5-A).
  //   다시 보일 때(active 상승) 한 번 재검증해 숨은 동안 놓친 마감·단가·할인 변경을 메운다.
  // ⚠ 재검증은 **active 상승 에지에서만** 돈다(2026-09-12 검증에서 잡힌 결함).
  //   `reload`/`reloadSession` 의 identity 가 `date`·`gameSeq` 에 걸려 있어, 그냥 effect 첫 줄에 두면
  //   **날짜·게임을 옮길 때마다** 같은 조회가 또 나갔다 — 바로 위 초기 로드 effect 가 이미 하는 것이다.
  //   실측: 전환 1회당 요청 11건 → 7건(중복 4건). egress 를 아끼자는 변경이 반대로 비용을 만들고 있었다.
  //   부수로 두 effect 가 `setLoadError` 를 동시에 쓰면서, 초기 로드가 세운 오류를 늦게 온 성공이 지울 수 있었다.
  //   최초 마운트도 재검증하지 않는다 — 그 역시 초기 로드 effect 가 이미 한다.
  const ledgerWasActive = useRef<boolean | null>(null);
  // 🔴 D1(2026-09-25) — 다른 접수대의 **바인 취소·플레이어 삭제**는 필터 걸린 구독에 오지 않는다(api/ledger subscribeLedger 주석).
  //   지금 화면에 있는 행 id 를 알려 주면 필터 없는 DELETE 알림 중 내 것만 골라 재조회한다.
  const rowIdsRef = useRef<{ b: Set<string>; p: Set<string> }>({ b: new Set(), p: new Set() });
  useEffect(() => { rowIdsRef.current = { b: new Set(buyins.map((x) => x.id)), p: new Set(players.map((x) => x.id)) }; }, [buyins, players]);
  const ownsRow = useCallback<LedgerRowOwner>((t, id) => (t === 'ledger_buyins' ? rowIdsRef.current.b : rowIdsRef.current.p).has(id), []);
  useEffect(() => {
    const rising = ledgerWasActive.current === false && active;
    ledgerWasActive.current = active;
    if (!active) return;
    if (rising) { reload(); reloadSession(); refreshPw(); }
    return subscribeLedger(venueId, () => { reload(); reloadSession(); }, { ownsRow });
  }, [venueId, reload, reloadSession, active, ownsRow, refreshPw]);
  // D3 — 창을 다시 볼 때(다른 창에서 비밀번호를 바꾸고 돌아옴) 한 번 더 확인한다.
  useEffect(() => {
    if (!active) return;
    const onVis = () => { if (document.visibilityState === 'visible') refreshPw(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [active, refreshPw]);

  // 손님 자가 바인요청(QR) — 그날 매장 단위 대기목록 로드 + 실시간. 승인 시 현재 게임(gameSeq) 명단에 추가.
  // 실패 시 기존 목록 유지 — 빈 배열로 덮으면 '요청 0건'으로 위장돼 새벽 대기열이 증발해 보인다
  // 🔴 D8(2026-09-25) — 순번·대상 가드. 승인 직후의 낙관 제거 → 재조회가 겹칠 때, 먼저 나간(승인 전) 느린 응답이 나중에 도착해
  //   방금 승인한 요청을 대기열에 **되살렸다**(다시 누르면 이중 승인 시도). 날짜를 옮겼을 때 앞 날짜 대기열이 남는 것도 같은 부류다.
  const pendingReq = useRef<RequestStamp<string>>({ seq: 0, owner: '' });
  const loadPending = useCallback(() => {
    const stamp = { seq: pendingReq.current.seq + 1, owner: `${venueId}|${date}` };
    pendingReq.current = stamp;
    getPendingBuyinRequests(venueId, date)
      .then((rs) => { if (isFreshResponse(stamp, pendingReq.current)) setPendingReqs(rs); })
      .catch(() => {});
  }, [venueId, date]);
  // ⚡ 위와 같은 이유로 active 게이트 — 다시 보일 때(active 상승) loadPending 이 재실행돼 놓친 대기열을 메운다.
  // F(2026-09-28) — 손님 취소·자동 만료(DELETE)도 받는다: 지금 대기열에 있는 요청 id 만 골라 다시 읽는다.
  const pendingIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { pendingIdsRef.current = new Set(pendingReqs.map((r) => r.id)); }, [pendingReqs]);
  const ownsPending = useCallback((id: string) => pendingIdsRef.current.has(id), []);
  useEffect(() => {
    if (!active) return;
    loadPending();
    return subscribeBuyinRequests(venueId, loadPending, { ownsId: ownsPending });
  }, [venueId, loadPending, active, ownsPending]);
  // 지하 매장 재연결·화면 복귀 — 단절(또는 폰 화면 꺼짐) 중 놓친 바인·세션·대기요청을 복귀 즉시 일괄 재검증.
  //   2026-09-28: 'online' 만 듣던 것을 공용 장치(lib/realtimeResync)로 — 창 복귀(visibilitychange)도 같이 메운다.
  //   (소켓만 끊겼다 붙는 경우는 subscribeLedger·subscribeBuyinRequests 가 SUBSCRIBED 재진입으로 메운다.)
  useResyncOnWake(() => { reload(); reloadSession(); loadPending(); }, active);
  // (C1) 낙관적 업데이트 — 승인 즉시 대기열에서 제거하고 백그라운드 동기화. 실패 시 loadPending 으로 서버 기준 복원.
  const gLabel = (seq: number) => (seq === MAIN_GAME_SEQ ? '메인' : `사이드${seq - 1}`);
  // 그날 실제로 **받을 수 있는** 게임 — 마감된 세션은 뺀다(2026-09-07).
  // ⚠ 예전엔 games 전부를 '열림'으로 셌다. getLedgerGames 는 마감 여부와 무관하게 그날 모든 세션을 주므로
  //   (api/ledger.ts:519 가 closed 를 함께 읽는다) '메인 진행 중 + 사이드1 마감' 상태에서 사이드1 요청이
  //   승인 대상으로 잡혔고, 서버 approve_buyin_request 가 '마감된 장부입니다'로 전부 튕겼다.
  //   여기서 걸러 두면 그 요청들은 아래 plan.skipped 로 빠져 목록에 남는다(단건 승인 확인 다이얼로그도 함께 고쳐진다).
  const openSeqs = games.filter((g) => !g.closed).map((g) => g.gameSeq);
  // 이 요청이 들어갈 게임 — 손님이 고른 게임이 우선, 미지정만 현재 보고 있는 게임.
  // 왜: 카드에 '원함: 사이드1'까지 띄워 놓고 현재 게임 명단에 넣으면 명단이 조용히 틀어지고,
  //     원복은 한 명씩 삭제 + (바인까지 찍혔으면) 취소 비밀번호가 필요하다.
  const wantSeq = (r: BuyinRequest) => r.requestedGameSeq ?? gameSeq;
  // 분할 금액은 '들어갈 게임'의 단가로 프리필/검증해야 한다 — 서버가 분할은 입력값을 그대로 기록하므로
  // 현재 화면 단가를 쓰면 사이드 손님이 메인 단가로 찍힌다(재계산으로 구제 안 됨).
  const gameUnit = (seq: number) => (seq === gameSeq ? session.buyinAmount : (games.find((g) => g.gameSeq === seq)?.buyinAmount ?? session.buyinAmount));
  // #8(2026-09-29) — 이용권 요청을 애드온으로 받을 수 있는 게임인가(애드온 게임만). 서버도 같은 조건으로 한 번 더 막는다.
  const gameIsAddon = (seq: number) => (seq === gameSeq ? !!session.isAddon : !!games.find((g) => g.gameSeq === seq)?.isAddon);
  const approveReq = (r: BuyinRequest, withBuyin = false, payMethod: 'cash' | 'card' | 'transfer' = 'cash', split?: { cash: number; card: number; transfer: number }, voucherUse: VoucherUse = 'buyin') => {
    const want = wantSeq(r);
    let target = want;
    // 요청한 게임이 아직 안 열렸으면 조용히 현재 게임에 넣지 않는다 — 한 번 묻고, 아니면 중단.
    if (want !== gameSeq && !openSeqs.includes(want)) {
      if (!window.confirm(`${gLabel(want)}는 아직 열리지 않았습니다.\n현재 ${gLabel(gameSeq)} 명단에 추가할까요?`)) return Promise.resolve();
      target = gameSeq;
    }
    setPendingReqs((prev) => prev.filter((x) => x.id !== r.id));
    setPayPick(null); setSplitFor(null);
    // 접수대 결제 모달과 **같은 기본 할인**을 실어 보낸다(보드 상단 고정 선택 → 없으면 레벨 자동).
    // 예전엔 QR 승인 경로만 할인이 통째로 빠져, 같은 레벨인데 창구에 따라 금액이 갈렸다(2026-09-05 감사).
    // C06: target 이 지금 화면 게임과 다르면 그 게임 자신의 할인·레벨로 다시 계산한다.
    return discIdxFor(target)
      .then((discIdx) => approveBuyinRequest(r.id, target, withBuyin, payMethod, split, discIdx, voucherUse))
      .then(() => { toast.show(`${r.playerName} 승인 · ${gLabel(target)} 명단 추가${r.voucherId ? (voucherUse === 'addon' ? ' + 애드온 기록(이용권)' : ' + 티켓 기록(이용권)') : withBuyin ? (split ? ' + 분할 바인 기록' :` + ${payMethod === 'card' ? '카드' : payMethod === 'transfer' ? '이체' : '현금'} 바인 기록`) : ''}`, 'success'); loadPending(); warnVoucherLeftover(r); })
      .catch((e) => {
        const s = voucherShortOf(e);
        if (s) { setShortFor({ id: r.id, target, use: voucherUse, s }); toast.show(ledgerErrorText(e, '승인 실패'), 'info'); loadPending(); return; }
        toast.show(ledgerErrorText(e, '승인 실패'), 'error'); loadPending();
      });
  };
  // 20260930i — 이용권 k장 + 남은 금액을 고른 방법으로 받아 승인. 금액은 서버가 다시 정한다(화면 숫자는 안내용).
  const approveShort = (r: BuyinRequest, method: ShortPayMethod) => {
    const sf = shortFor;
    if (!sf || sf.id !== r.id) return Promise.resolve();
    setShortFor(null);
    setPendingReqs((prev) => prev.filter((x) => x.id !== r.id));
    return discIdxFor(sf.target)
      .then((discIdx) => approveBuyinRequest(r.id, sf.target, true, method, undefined, discIdx, sf.use))
      .then(() => { toast.show(`${r.playerName} 승인 · 이용권 ${sf.s.have}장 + 남은 ${sf.s.remainder.toLocaleString()}원 ${method === 'unpaid' ? '미수' : method === 'card' ? '카드' : method === 'transfer' ? '계좌' : '현금'}`, 'success'); loadPending(); warnVoucherLeftover(r); })
      .catch((e) => { toast.show(ledgerErrorText(e, '승인 실패'), 'error'); loadPending(); });
  };
  // S-15 — 이용권 승인 뒤 같은 손님 이용권 요청이 남았으면 알린다(다음 승인에 바인 1회로 묶이는 것을 막을 기회).
  const warnVoucherLeftover = (r: BuyinRequest) => {
    if (!r.voucherId) return;
    // key 에 요청 id — 같은 key 는 마지막 요청만 반영하므로, 연달아 두 손님을 승인하면 앞 손님 안내가 사라졌다(review 1002b A1 관찰).
    run(`leftover:${r.id}`, (v) => getPendingBuyinRequests(v, date),
      (rs) => { const n = voucherLeftover(r, rs); if (n > 0) toast.show(voucherLeftoverText(r.playerName, n), 'info'); });
  };
  const doReject = (r: BuyinRequest, reason?: string) => {
    setPendingReqs((prev) => prev.filter((x) => x.id !== r.id)); // 낙관 제거
    setRejectFor(null);
    return rejectBuyinRequest(r.id, reason)
      .then(() => loadPending())
      .catch((e) => { toast.show(ledgerErrorText(e, '거절 실패'), 'error'); loadPending(); });
  };
  const bulkApprove = () => {
    if (!pendingReqs.length) return;
    // 요청 게임별로 나눠 승인 — 전원을 현재 게임에 몰아넣던 동작이 명단·정산을 조용히 틀어놨다.
    const plan = planBuyinApprovals(pendingReqs, gameSeq, openSeqs);
    const flat = plan.groups.flatMap((g) => g.items.map((r) => ({ id: r.id, seq: g.gameSeq })));
    if (!flat.length) { toast.show('요청한 게임이 아직 열리지 않았습니다. 게임을 먼저 여세요', 'error'); return; }
    // 확인은 게임이 섞였을 때만 — 접수대에서 반복되는 조작이라 같은 게임뿐이면 그냥 승인한다.
    if (plan.mixed && !window.confirm(`${plan.groups.map((g) => `${gLabel(g.gameSeq)} ${g.items.length}명`).join(' / ')}으로 나눠 승인합니다.\n계속할까요?`)) return;
    setPendingReqs(plan.skipped); // 낙관: 승인 대상만 비우고 보류 건은 목록에 남긴다
    // ⚠ 실패를 세어 **사실대로** 알린다(2026-09-07). 예전엔 개별 실패를 .catch(() => null) 로 삼키고
    //   시도 건수(flat.length)를 그대로 'N건 승인' 성공 토스트로 띄웠다 — 서버가 전부 거절해도
    //   접수대는 '승인됨'을 보고 손님은 명단에 없다. 단건 승인(위)은 실패를 알리는데 일괄만 예외였다.
    //   allSettled 라 개별 실패가 나머지를 죽이지 않는 성질은 그대로다.
    // ⚠ 순차 승인 — 병렬로 보내면 안 된다(20260911g). 이용권 N장을 쓴 손님은 같은 player_name 으로
    //   대기 행이 N개다. approve_buyin_request 는 max(entry_no)+1 을 읽고 넣고, ledger_players 는
    //   not exists 로 넣어 겹치면 ledger_players_venue_date_game_name_key ·
    //   ledger_buyins_venue_date_game_player_entry_key 가 터져 둘 중 하나가 실패한다.
    (async () => {
      const rs: { status: 'fulfilled' | 'rejected' }[] = [];
      // C06: 게임별로 한 번만 조회해 캐싱 — 같은 게임으로 가는 나머지 건은 재조회하지 않는다.
      const discCache = new Map<number, number>();
      for (const x of flat) {
        try {
          let discIdx = discCache.get(x.seq);
          if (discIdx === undefined) { discIdx = await discIdxFor(x.seq); discCache.set(x.seq, discIdx); }
          await approveBuyinRequest(x.id, x.seq, false, 'cash', undefined, discIdx);
          rs.push({ status: 'fulfilled' });
        }
        catch { rs.push({ status: 'rejected' }); }
      }
      return rs;
    })()
      .then((rs) => {
        const ok = rs.filter((r) => r.status === 'fulfilled').length;
        const ng = rs.length - ok;
        const spread = plan.groups.map((g) => `${gLabel(g.gameSeq)} ${g.items.length}`).join(' · ');
        const held = plan.skipped.length ? ` · ${plan.skipped.length}건 보류(게임이 열려 있지 않음)` : '';
        toast.show(
          ng ? `${ok}건 승인 · ${ng}건 실패 — 실패분은 목록에 그대로 남습니다` : `${ok}건 승인. ${spread}${held}`,
          ng ? 'error' : 'success',
        );
        loadPending(); // 서버 기준으로 대기열을 다시 채운다 — 실패분이 여기서 되돌아온다
      });
  };

  // ── 연동 클락 — 리모컨 제어 + 바인 시점 얼리 확정(스타트 시각 미입력 버그 근본 해결) ──
  const [clock, setClock] = useState<ClockState | null>(null);
  // F5(2026-09-13): 이 컴포넌트는 매장 전환에 언마운트되지 않는다(VenueManageTab keep-alive). 대상이 바뀌면 먼저 비우고,
  //   늦게 도착한 앞 매장·앞 게임 응답은 owner 스탬프(staleResponse)로 버린다 — 앞 매장 클락이 이 장부의 정본으로 남아
  //   리모컨 조작이 남의 매장 대회로 나가던 경로를 막는다.
  const clockReq = useRef<RequestStamp<string>>({ seq: 0, owner: '' });
  // CLOCK-TAP-LAG(2026-09-24) — 리모컨 바의 [아웃]·[얼리±]·레벨 저장은 클락 화면과 같은 저장기(api/clock.ts)로 나간다:
  //   한 번에 한 요청 · 연타는 마지막 값 하나로 · **바뀐 칸만** UPDATE(장부 사본 전체로 다른 기기의 탈락·레벨을 되돌리지 않는다) ·
  //   저장 대기 중의 재조회 응답은 버리고, 연타가 끝나면 한 번 다시 읽는다.
  const clockReloadAfterSaveRef = useRef(false);
  const reloadClockRef = useRef<() => void>(() => {});
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });
  const clockSaver = useMemo(() => createCoalescingSaver<ClockState>(
    (s) => `${s.venueId}#${s.gameSeq}`,
    (next, base) => saveClockPatch(base, next),
    {
      error: (e, back) => {
        setClock((cur) => (cur && cur.venueId === back.venueId && cur.gameSeq === back.gameSeq ? back : cur));
        clockReloadAfterSaveRef.current = true;
        // 이유를 보인다 — 서버 RPC 미배포(CLOCK_COUNT_RPC_MISSING_TEXT)·CAS 충돌을 '네트워크' 로 뭉개지 않는다.
        toastRef.current.show(`클락 제어 실패. ${ledgerErrorText(e, '네트워크를 확인하세요')}`, 'error');
      },
      idle: () => { if (clockReloadAfterSaveRef.current) { clockReloadAfterSaveRef.current = false; reloadClockRef.current(); } },
    },
  ), []);
  const reloadClock = useCallback(() => {
    const owner = `${venueId}#${gameSeq}`;
    if (clockReq.current.owner !== owner) setClock(null);
    if (clockSaver.busy) { clockReloadAfterSaveRef.current = true; return; }
    const stamp: RequestStamp<string> = { seq: clockReq.current.seq + 1, owner };
    clockReq.current = stamp;
    getClockState(venueId, gameSeq)
      .then((c) => { if (isFreshResponse(stamp, clockReq.current) && !clockSaver.busy) setClock(c); })
      .catch(() => {});
  }, [venueId, gameSeq, clockSaver]);
  useEffect(() => { reloadClockRef.current = reloadClock; }, [reloadClock]);
  // active 상승(다시 보일 때) 시에도 재실행 — 숨은 동안 놓친 클락 상태 변화를 메운다.
  useEffect(() => { if (active) reloadClock(); }, [reloadClock, active]);
  // ⚡ 이 판이 실제로 보일 때만(active) 구독 — keep-alive 로 숨은 탭이 채널을 계속 물고 있지 않게(§5-A).
  useEffect(() => { if (!active) return; return subscribeClock(venueId, reloadClock); }, [venueId, reloadClock, active]);
  // K11(2026-09-29) — 창 복귀·온라인 복귀·30초마다 클락도 다시 읽는다(TV·리모컨·클락 화면과 같은 계약).
  //   예전엔 장부·세션·대기만 다시 읽어, 조용히 끊긴 동안 장부의 클락 바가 옛 레벨·옛 생존을 보였다.
  useResyncOnWake(reloadClock, active, 30_000);
  // C04: sessionDate 만 보면 게임 전환 중 도착한 '다른 게임' 응답을 그대로 연동으로 본다 —
  // reloadClock 은 항상 gameSeq 로 조회하지만 요청·응답 사이 gameSeq 가 바뀌면 그 응답은 이전 게임 것이다.
  // 응답 자체에 찍힌 clock.gameSeq 를 지금 gameSeq 와 맞춰 보면 fetch 시점 가드 없이도 stale 을 걸러낸다.
  // F5: venueId 까지 대조한다 — 매장 전환 직후 앞 매장 클락(같은 날짜·같은 gameSeq)이 연동으로 읽히면 안 된다.
  const clockLinked = !!clock && clock.venueId === venueId && clock.sessionDate === date && clock.gameSeq === gameSeq;
  // 바인 추가 시점의 얼리 유형 — 클락의 "현재 레벨"을 earlyDouble/SingleLevel과 직접 비교해 확정 기록.
  // 클락 화면이 닫혀 전진 못 한 경우(endsAt 경과)는 경과분만큼 레벨을 전진시켜 판정.
  // ⚠ 레벨 세는 로직을 여기 인라인으로 두면 클락 화면과 한 칸씩 어긋난다(브레이크 처리 차이).
  //   currentLevelNo(api/clock)로 단일화 — 얼리(#21)와 레벨 할인(#20)이 같은 레벨 번호를 본다.
  /** 연동 클락의 '지금 레벨'(1-based). 0 = 클락 미연동 또는 블라인드 구조 없음. */
  const clockLevelNow = useCallback((): number => {
    if (!clockLinked || !clock) return 0;
    return currentLevelNo(clock);
  }, [clockLinked, clock]);
  /** 새 바인의 기본 할인 자리번호 — 보드 상단 고정 선택이 있으면 그것, 없으면 클락 레벨 자동(#20).
   *  ⚠ 결제창·QR 단건 승인·QR 일괄 승인이 **모두** 이 함수를 쓴다. 창구에 따라 금액이 갈리면 안 된다. */
  const defaultDiscIdx = useCallback(
    (): number => discPick ?? autoDiscountIndex(session.discounts, clockLevelNow()),
    [discPick, session.discounts, clockLevelNow],
  );
  /** 이 요청으로 **받을 금액**(원) = 단가 − 할인. 접수대 모달의 splitMismatch 와 같은 기준이다.
   *  ⚠ 화면이 할인을 아는 것은 **대상이 지금 보고 있는 게임일 때뿐**이다 —
   *    다른 게임의 할인은 discIdxFor 가 승인 시점에 비동기로 구한다(C06 주석 참고). */
  const splitDue = (seq: number) =>
    Math.max(0, (gameUnit(seq) || 0) - (seq === gameSeq ? discountAmountOf(session, defaultDiscIdx()) : 0));
  /** C06: QR 승인 대상 게임(wantSeq(r))이 지금 보고 있는 게임과 다르면 defaultDiscIdx() 를 쓰면 안 된다 —
   *  그건 **현재 화면**의 할인 배열·레벨로 계산된 자리번호인데, SQL 은 그 번호를 **대상 게임의**
   *  할인 배열에 적용한다. 메인·사이드는 할인 순서·단가가 서로 다를 수 있어 자리번호만 맞고 금액이 틀린다.
   *  대상 게임 자신의 세션·클락을 다시 조회해 계산한다 — 조회가 실패하면 그대로 던진다
   *  (현재 게임 할인으로 조용히 fallback 하지 않는다: 실패는 실패로 드러낸다). */
  // 지금 보고 있는 게임은 **사람이 고른 값**(discPick)이 이긴다. 다른 게임이면 자동 판정인데,
  //   그 판정은 `resolveDiscountIndex` **한 곳**에만 있다 — 대시보드 QR 승인도 같은 함수를 쓴다.
  //   예전엔 이 계산이 여기에만 있어서 대시보드는 할인 0으로 승인했고, 같은 손님이 창구에 따라
  //   다른 금액으로 기록됐다(2026-09-17).
  const discIdxFor = useCallback(async (seq: number): Promise<number> => {
    if (seq === gameSeq) return defaultDiscIdx();
    return resolveDiscountIndex(venueId, date, seq);
  }, [venueId, date, gameSeq, defaultDiscIdx]);
  // 날짜·게임을 옮기면 할인 프리셋 목록 자체가 달라진다 — 자리번호를 물고 가면 다른 금액이 된다.
  useEffect(() => { setDiscPick(null); }, [date, gameSeq]);
  const clockEarlyNow = useCallback((): EarlyType | null => {
    const no = clockLevelNow();
    if (no <= 0 || !clock) return null;
    return earlyTypeAtLevel(clock.config, no);
  }, [clock, clockLevelNow]);
  // 리모컨 → 클락 상태 직접 저장(클락 화면은 realtime 구독으로 즉시 동기)
  // ⚠ 예전엔 setClock 갱신 함수 **안에서** 저장을 불렀다 — 갱신 함수는 순수해야 한다(StrictMode 는 두 번 부른다).
  const patchClock = useCallback((patch: Partial<ClockState>) => {
    const cur = clock;
    if (!cur) return;
    const moved = { ...cur, ...patch };
    // ⚠ liveStats 도 함께 재계산해 저장한다(2026-09-07). 예전엔 { ...cur, ...patch } 를 그대로 넘겨
    //   liveStats 가 **낡은 스냅샷 그대로** 다시 쓰였다 — [✕ 아웃 처리]·[얼리 ±] 를 눌러도
    //   생존·얼리 숫자가 움직이지 않고(아웃 카운터만 올라감), 그 낡은 값이 api/clock.ts:379 를 통해
    //   TV 송출·라이브보드·업주 대시보드까지 그대로 퍼졌다.
    //   조리법은 ClockRemote.persist(clock/ClockRemote.tsx:73)·마감 스냅샷(아래 handleClose)과 동일하다.
    // K1(2026-09-29) — 통계는 저장하지 않는다(카운트는 차분 RPC). 화면 표시만 TV 와 같은 합성으로 다시 계산한다.
    const next = { ...moved, liveStats: composeLiveStats(moved) };
    clockReq.current = { seq: clockReq.current.seq + 1, owner: clockReq.current.owner };   // 날아가던 조회 응답이 낙관값을 덮지 않게
    clockReloadAfterSaveRef.current = true;
    setClock(next);
    clockSaver.push(next, cur);
  }, [clock, clockSaver]);

  // D4(2026-09-28) — 장부가 바뀌면(바인·취소·얼리 구간·단가) 연동 클락의 라이브 통계(TV 엔트리·생존·평균 스택)를 여기서도 갱신한다.
  //   예전엔 업주 PC 의 **클락 화면이 열려 있을 때만** 갱신됐다(TournamentClock 400ms 타이머) — 폰 장부로 바인만 받으면
  //   TV 인원이 그대로 멈췄다. 계산은 클락 화면·리모컨·마감 스냅샷과 같은 computeLiveStats 하나이고, 쓰기는 live_stats 한 칸뿐이라
  //   (saveClockLiveStats) 제어 칸(시작·정지·탈락)을 덮지 않는다. 결과가 이미 같으면 쓰지 않는다(클락 화면과 이중 쓰기 방지).
  const clockLatest = useRef(clock);
  useEffect(() => { clockLatest.current = clock; });
  const statsKeyOf = (): string | null => {
    if (!clockLinked || !clock) return null;
    const d = deriveClockCounts(buyins, earlyWindowOf(clock.config, session));
    return `${d.entries}/${d.rebuys}/${d.earlies}/${d.doubleEarlies}/${d.addons ?? 0}/${session.buyinAmount ?? ''}/${JSON.stringify(clock.liveStats?.ledger ?? null)}`;
  };
  const statsKey = statsKeyOf();
  useEffect(() => {
    if (!active || !statsKey) return;
    const t = setTimeout(() => {
      const c = clockLatest.current;
      if (!c || c.venueId !== venueId || c.sessionDate !== date || c.gameSeq !== gameSeq) return;
      // K1·K3 — 장부 몫 작성기 한 벌(클락 화면·리모컨·대시보드와 같은 함수). 같으면 안 쓴다.
      void writeLedgerStats(c, buyins, session).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsKey, active]);

  /** D2 — 기록 직전: 들고 있는 세션이 지금 화면의 장부(매장·날짜·게임) 것인가. 아니면 저장하지 않고 다시 읽는다. */
  const sessionFitsBoard = (): boolean => {
    if (ledgerSessionMatches(session, venueId, date, gameSeq)) return true;
    toast.show('장부 정보를 다시 불러오는 중이라 기록을 멈췄습니다. 잠시 뒤 다시 눌러 주세요', 'error');
    void reloadSession();
    return false;
  };

  /** 20260925f — 서버 금액 규칙이 hint 로 거절한 바인 쓰기를 쉬운 말로 안내하고 장부를 다시 읽는다. 아는 hint 가 아니면 false. */
  const noteServerAmountHint = (e: unknown): boolean => {
    if (!(e instanceof Error)) return false;
    if (e.message === LEDGER_SPLIT_MISMATCH) {
      toast.show('참가비나 할인이 방금 바뀌어 분납 합계가 맞지 않습니다. 최신 장부를 다시 불러왔으니 금액을 확인하고 다시 기록해 주세요', 'error', { durationMs: 7000 });
      void reloadSession();   // 모달은 열어 둔다 — 새 단가로 다시 나누면 된다
      return true;
    }
    if (e.message === LEDGER_SESSION_MISSING) {
      toast.show('이 게임의 장부가 없습니다(삭제됐거나 아직 열리지 않음). 장부에서 게임을 먼저 열어 주세요', 'error', { durationMs: 7000 });
      setSelected(null); void reloadSession(); reload();
      return true;
    }
    return false;
  };

  const closed = session.closed;

  // B1 — 영업일을 **따라가던** 화면만 새 영업일로 옮긴다. 첫 렌더는 캐시가 없어 달력 오늘로 열리고,
  //   서버 답(어제 영업일)이 오면 그리로 옮겨 앉는다. 사용자가 다른 날짜를 골랐으면(date ≠ 직전 영업일) 건드리지 않고,
  //   방금 마감한 장부(closed)도 붙잡아 둔다 — 마감 직후 순위 입력으로 이어지는 화면이 빈 오늘로 튀면 안 된다.
  const prevBiz = useRef(biz);
  useEffect(() => {
    const was = prevBiz.current;
    prevBiz.current = biz;
    if (was === biz || date !== was || closed) return;
    setDate(biz); setGameSeq(MAIN_GAME_SEQ); setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz]);

  // ── '정산으로' 신호 처리 ─────────────────────────────────────────────────────
  // 정산바는 fixed 라 '이동'할 대상이 아니다. 대신 마감 버튼을 **지목**한다: 키보드 포커스 + 짧은 링.
  // 신호가 올 때 버튼이 아직 없을 수 있다(다른 날짜 장부를 여는 중). 그래서 처리한 논스를 기억해 두고
  // 버튼이 그려진 렌더에서 한 번만 처리한다 — 고정 지연(setTimeout 60ms) 같은 추측을 쓰지 않는다.
  const settleEl = useRef<HTMLButtonElement | null>(null);
  const settlePending = useRef(false); // 신호는 왔는데 버튼이 아직 없다
  const settleDone = useRef(0);
  const [settleHot, setSettleHot] = useState(false);
  const focusSettle = useCallback((el: HTMLButtonElement) => {
    el.focus({ preventScroll: true }); // preventScroll: 포커스가 페이지를 끌지 않게
    setSettleHot(true);
  }, []);
  /**
   * 콜백 ref — 버튼이 **실제로 DOM 에 붙는 순간**을 잡는다.
   * ⚠ 예전엔 effect 의 deps(date·closed·gameSeq)로 '이쯤이면 그려졌겠지'를 추측했다. 그런데 정산 이동은
   *   장부를 목록→보드로 바꾸며 들어오므로, 신호가 올 때 버튼이 없고 그 뒤로 저 deps 가 더는 바뀌지 않는다
   *   → 재시도가 영영 안 왔다(E2E: 버튼은 있는데 focus 가 'inactive'). 마운트 시점을 직접 받는 게 맞다.
   */
  const settleBtnRef = useCallback((el: HTMLButtonElement | null) => {
    settleEl.current = el;
    if (el && settlePending.current) { settlePending.current = false; focusSettle(el); }
  }, [focusSettle]);
  /** 정산 마감 버튼을 지목한다. 없으면 '대기'로 남겨 두고, 붙는 순간 위 콜백 ref 가 이어받는다. */
  const pointAtSettle = useCallback(() => {
    const el = settleEl.current;
    if (!el) { settlePending.current = true; return false; }
    focusSettle(el);
    return true;
  }, [focusSettle]);
  useEffect(() => { if (!settleHot) return; const t = setTimeout(() => setSettleHot(false), 1400); return () => clearTimeout(t); }, [settleHot]);
  useEffect(() => {
    if (!settleSignal || settleSignal === settleDone.current || !active) return;
    settleDone.current = settleSignal;
    pointAtSettle();
  }, [settleSignal, active, pointAtSettle]);
  // 신호를 받았는데 끝내 마감 버튼이 없으면 **말해 준다**. 조용히 아무 일도 안 하면
  // 사용자에게는 '정산을 눌렀는데 정산으로 안 간다'가 된다(오너 2026-09-07).
  // 오늘 장부가 아예 없을 때가 대부분이라 다음 행동까지 함께 안내한다.
  useEffect(() => {
    if (!settleSignal || !active) return;
    const t = setTimeout(() => {
      if (!settlePending.current) return;
      settlePending.current = false;
      toast.show(closed ? '이미 마감된 장부입니다' : '마감할 장부가 없습니다. 먼저 장부를 시작해 주세요', 'info');
    }, 2500);
    return () => clearTimeout(t);
  }, [settleSignal, active, closed, toast]);
  const regClosed = session.regClosed;
  // 실패는 '빈 장부'가 아니다 — loadError 가 있으면 세팅 폼으로 넘어가지 않는다.
  const showSetup = !loadError && !session.openedAt && !closed && buyins.length === 0 && players.length === 0;
  // C05 보완 — 지금 보여줄 게 있는가(이미 정상 조회된 세션/명단이 있는가).
  // 있으면 재조회 실패를 전면 카드로 덮지 않고 보드 위 인라인 배너로만 알린다(마지막 정상 값 유지).
  // 없으면(진짜 초기 로드 실패, 또는 원래도 빈 장부) 기존처럼 전면 카드가 맞다 — 잃을 '정상 값'이 없다.
  const hasBoardData = !!session.openedAt || closed || buyins.length > 0 || players.length > 0;

  // 마감 후 다음 액션 바 — **이 게임**의 순위가 이미 입력됐는지(미입력이면 입력 유도 강조).
  // 날짜만 보면 같은 날 메인만 저장해도 사이드가 '입력됨 ✓' 로 뭉쳐 입력 버튼이 사라진다(F02).
  const [hasRank, setHasRank] = useState<boolean | null>(null);
  useEffect(() => {
    if (!closed) { setHasRank(null); return; }
    let on = true;
    getVenueRankings(venueId, date)
      .then(({ entries }) => { if (on) setHasRank(hasRankingForGame({ gameSeq, title: session.title }, entries.map((e) => e.eventName))); })
      .catch(() => { if (on) setHasRank(null); });
    return () => { on = false; };
  }, [closed, venueId, date, gameSeq, session.title]);

  // 매장·날짜·회차가 바뀌면 앞 칸의 직전 설정을 렌더 중에 비운다 — 새 폼의 첫 렌더가 앞 칸 값으로 시작하지 않게.
  //   새 값은 아래 이펙트가 받아 오고, 폼은 도착한 값을 **빈 칸에만** 채운다(SessionForm · lib/ledgerPrefill).
  const prefillKey = `${venueId}|${date}|${gameSeq}`;
  const [prefillFor, setPrefillFor] = useState(prefillKey);
  if (prefillFor !== prefillKey) { setPrefillFor(prefillKey); setPrefill(null); }
  // 다음 게임 바로 작성: 설정 화면일 때 직전 세션 단가/게임명/딜러를 미리 불러옴
  // 게임관리에서 포스터 프리필(seedFill)로 들어왔으면 그게 우선(해당 날짜에서 1회 소비)
  useEffect(() => {
    // 세션 fetch 중엔 이전 날짜 잔상 기준 판단 금지 — loading 은 날짜가 바뀐 첫 커밋에서 아직 false 라
    //   '지금 session 이 이 칸의 것인가'(sessionFor)를 함께 본다. 안 보면 '이 포스터로 새 장부'가 다른 날짜로 들어올 때
    //   **앞 날짜의 열린 장부**를 보고 "이미 다른 장부가 있어 사이드로 엽니다" 로 옮겼다(review-store-link-1002b A2).
    // 취소는 가드보다 **앞** — 날짜·회차가 바뀐 첫 커밋은 아래 가드가 일찍 돌려보내므로, 가드 뒤에 두면 새 장부 로드가 끝날 때까지
    //   앞 날짜의 늦은 직전 설정이 setPrefill 로 들어와 빈 칸을 낡은 값으로 채운다(review-store-link-1002 O-1).
    run.cancel('prefill'); // 앞 날짜·회차의 늦은 직전 설정이 아래 어느 갈래의 결과도 덮지 않게(review 1b)
    if (loading || sessionFor !== prefillKey) return;
    const sf = seedFillRef.current;
    if (!showSetup) {
      setPrefill(null);
      if (sf?.date === date) {
        // 그 (날짜, 게임) 칸이 이미 차 있다. 같은 포스터의 장부면 그게 곧 그 게임이니 그대로 열고 프리필만 폐기한다.
        if (session.scheduleId && session.scheduleId === sf.fill.scheduleId) { seedFillRef.current = null; return; }
        // 여기가 '+ 이 포스터로 새 장부' 가 **다른 포스터의 장부 위에** 조용히 착지하던 자리다(F01-b).
        // 기존 장부는 절대 덮지 않고, 그날의 다음 빈 게임(사이드)으로 옮겨 새 장부를 연다 — 어디로 갔는지 알린다.
        if (sf.movedTo == null) {
          const next = Math.max(MAIN_GAME_SEQ + 1, games.reduce((m, g) => Math.max(m, g.gameSeq), 0) + 1);
          seedFillRef.current = { ...sf, movedTo: next };
          setGameSeq(next); setSelected(null);
          toast.show(`${date} ${gLabel(gameSeq)} 자리에는 이미 다른 장부(${session.title || '제목 없음'})가 있어 ${gLabel(next)} 장부로 새로 엽니다`, 'info');
          return;
        }
        seedFillRef.current = null; // 옮긴 자리까지 차 있으면(동시 개설) 프리필만 폐기 — 남의 장부를 건드리지 않는다
      }
      return;
    }
    if (sf?.date === date) {
      setPrefill(sf.fill);
      seedFillRef.current = null;
      return;
    }
    run('prefill', (v) => getLastLedgerSettings(v, date), setPrefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sessionFor, showSetup, venueId, date, gameSeq]);

  // PL3: 마지막 '마감된' 회차 — '지난 게임 그대로 열기' 1탭 재료(세션 전체 + 마감 때 캡처한 클락 설정)
  const [lastRound, setLastRound] = useState<LastClosedRound | null>(null);
  useEffect(() => {
    if (!showSetup) { setLastRound(null); return; }
    let on = true;
    getLastClosedRound(venueId, date).then((r) => { if (on) setLastRound(r); }).catch(() => {});
    return () => { on = false; };
  }, [showSetup, venueId, date]);
  // 대시보드 '지난 게임 그대로 열기' 인텐트 — 오늘 장부 시작 화면으로 이동 + 1회 자동 적용 예약.
  // (App/VenueManageTab 를 거치지 않는 파일 내 완결 연동 — localStorage 1키, 10분 TTL, 소비 즉시 제거)
  const [autoApplyLast, setAutoApplyLast] = useState(false);
  useEffect(() => {
    if (!active) return;
    try {
      const raw = localStorage.getItem('nuri:last-round-intent');
      if (!raw) return;
      localStorage.removeItem('nuri:last-round-intent'); // 1회 소비
      const it = JSON.parse(raw) as { venueId?: string; at?: number };
      if (it?.venueId !== venueId || Date.now() - (it.at ?? 0) > 10 * 60_000) return;
      setDate(today()); setGameSeq(MAIN_GAME_SEQ); setSelected(null); setMode('board');
      setAutoApplyLast(true);
    } catch { /* noop */ }
  }, [active, venueId]);
  // 오늘 장부가 이미 있으면(설정 화면이 아니면) 자동 적용 예약을 폐기 — 나중에 다른 설정 화면에 오적용 방지
  useEffect(() => { if (!loading && !showSetup && autoApplyLast) setAutoApplyLast(false); }, [loading, showSetup, autoApplyLast]);

  // 사이드 시작 설정일 때 — 그날 메인 게임 설정을 '복사' 버튼으로 제공(반복 입력 제거)
  useEffect(() => {
    if (showSetup && gameSeq !== MAIN_GAME_SEQ) {
      run('copyMain', (v) => getLedgerSession(v, date, MAIN_GAME_SEQ),
        (s) => setCopyMain((s.buyinAmount > 0 || s.openedAt) ? s : null),
        () => setCopyMain(null));
    } else { run.cancel('copyMain'); setCopyMain(null); }
  }, [showSetup, gameSeq, venueId, date, run]);

  // 정산바(하단 고정)가 --tabbar-safe(탭바 예약)보다 커지면(실측 ~166px, SettleFilter 펼침·
  // 좁은 폭 2×2 그리드 포함) 전 화면 상시 노출 푸터(BusinessFooter)의 법정 고지(19세 미만·1336·
  // 사업자정보)를 끝까지 스크롤해도 영구히 가렸다(2026-09-27 오너 보고). 실측 높이를
  // --footer-reserve 로 노출해 푸터가 max() 로 받아쓰게 한다(index.css :root 기본 0 —
  // 다른 화면은 무영향, 정산바가 없는 화면도 이 파일 밖 전부 그대로다).
  // 콜백 ref — mode 전환으로 이 바가 사라지거나(el=null) active(keep-alive 가시성)가 바뀌면
  // measureFooterReserve 의 정체성이 바뀌어 React 가 구 ref(null)→신 ref(el) 로 재호출한다.
  // 그 재호출 자체가 '숨김→0 복귀 / 다시 보임→재측정'을 별도 이펙트 없이 처리한다.
  const settleBarElRef = useRef<HTMLDivElement | null>(null);
  const settleBarRoRef = useRef<ResizeObserver | null>(null);
  const measureFooterReserve = useCallback(() => {
    const el = settleBarElRef.current;
    if (!active || !el) { document.documentElement.style.removeProperty('--footer-reserve'); return; }
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return; // 과도기(display 전환 중) — 다음 발화에서 다시 잰다
    document.documentElement.style.setProperty('--footer-reserve', `${Math.ceil(Math.max(0, window.innerHeight - rect.top) + 12)}px`);
  }, [active]);
  const settleBarRef = useCallback((el: HTMLDivElement | null) => {
    settleBarElRef.current = el;
    settleBarRoRef.current?.disconnect();
    settleBarRoRef.current = null;
    if (el) {
      const ro = new ResizeObserver(measureFooterReserve);
      ro.observe(el);
      settleBarRoRef.current = ro;
    }
    measureFooterReserve();
  }, [measureFooterReserve]);
  useEffect(() => {
    window.addEventListener('resize', measureFooterReserve);
    return () => window.removeEventListener('resize', measureFooterReserve);
  }, [measureFooterReserve]);
  // F-1 — 표 상자 휠은 '페이지 먼저'(pageFirstDelta). React onWheel 은 passive 라 preventDefault 가 안 먹어 직접 붙인다.
  //   상자는 행이 0 이면 사라지므로(빈 목록 분기) 콜백 ref 로 붙였다 뗀다.
  const boardWheelOff = useRef<(() => void) | null>(null);
  const boardRef = useCallback((el: HTMLDivElement | null) => {
    boardWheelOff.current?.();
    boardWheelOff.current = null;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // 전체화면(LedgerWorkspace)은 페이지가 아니라 그 안의 칸이 스크롤 상자다 — 뒤에 깔린 페이지를 굴리면 안 된다.
      if (e.ctrlKey || e.deltaY === 0 || !isLgUp() || el.closest('[data-ledger-fullscreen]')) return;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      const need = pageFirstDelta(el, settleBarElRef.current, dy);
      if (!need) return;
      e.preventDefault();
      window.scrollBy({ top: need, behavior: 'instant' as ScrollBehavior });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    boardWheelOff.current = () => el.removeEventListener('wheel', onWheel);
  }, []);
  // F-1 키보드 — Tab 으로 정산 바 밑(또는 헤더 밑) 행에 들어가면 상자를 칸 안으로 올린다/내린다(브라우저는 고정 바를 모른다).
  const revealBoardRow = useCallback((box: HTMLElement, el: HTMLElement) => {
    if (!isLgUp() || !el.matches(':focus-visible') || box.closest('[data-ledger-fullscreen]')) return;
    requestAnimationFrame(() => {
      const bar = settleBarElRef.current;
      const r = el.getBoundingClientRect();
      const barTop = bar && bar.getClientRects().length > 0 ? bar.getBoundingClientRect().top : window.innerHeight;
      const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-top')) || 97;
      // 칸이 가렸으면 상자 전체를 칸 안으로(상자 높이가 칸에 맞으므로 그 안의 칸도 보인다)
      const need = r.bottom > barTop ? pageFirstDelta(box, bar, Infinity) : r.top < head ? pageFirstDelta(box, bar, -Infinity) : 0;
      if (need) window.scrollBy({ top: need, behavior: 'instant' as ScrollBehavior });
    });
  }, []);

  // 셀/행 조회는 표에서 행×열×바인(예: 50명×10칸×200바인 ≈ 10만회/렌더)으로 폭증하던 곳 —
  // buyins 1회 순회로 맵을 만들어 O(1) 조회로 전환(필터/find/reduce per-cell 제거).
  const binByKey = useMemo(() => {
    const m = new Map<string, typeof buyins[number]>();
    for (const b of buyins) m.set(`${b.playerName}\u0000${b.entryNo}`, b);
    return m;
  }, [buyins]);
  const countByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of buyins) m.set(b.playerName, (m.get(b.playerName) ?? 0) + 1);
    return m;
  }, [buyins]);
  const maxEntryByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of buyins) { const c = m.get(b.playerName) ?? 0; if (b.entryNo > c) m.set(b.playerName, b.entryNo); }
    return m;
  }, [buyins]);
  const cellAt = (name: string, e: number) => binByKey.get(`${name}\u0000${e}`) ?? null;
  const countOf = (name: string) => countByName.get(name) ?? 0;
  const maxEntryOf = (name: string) => maxEntryByName.get(name) ?? 0;
  // 바인 컬럼 수 — PC는 10 고정(폭 축소로 한 화면에), 모바일은 "쓰인 최대 바인+1"만 렌더(가로 스크롤 최소화)
  const isDesktopLedger = useIsDesktop();
  const globalMaxEntry = buyins.reduce((m, b) => Math.max(m, b.entryNo), 0);
  const binCols = (isDesktopLedger || globalMaxEntry >= 10) ? 10 : Math.min(10, Math.max(globalMaxEntry + 1, 3));

  // 정렬 — 100명+ 명단에서 빨리 찾기: 등록순(기본)/이름순/바인 많은 순
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'bins'>('recent');
  const rows = useMemo(() => {
    const rosterNames = players.map((p) => p.name);
    const buyinOnly = [...new Set(buyins.map((b) => b.playerName))].filter((n) => !rosterNames.includes(n));
    const base: { name: string; player: LedgerPlayer | null }[] = [
      ...players.map((p) => ({ name: p.name, player: p as LedgerPlayer | null })),
      ...buyinOnly.map((n) => ({ name: n, player: null as LedgerPlayer | null })),
    ];
    const q = query.trim().toLowerCase();
    const filtered = q ? base.filter((r) => r.name.toLowerCase().includes(q)) : base;
    if (sortBy === 'name') return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (sortBy === 'bins') {
      const cnt = (n: string) => buyins.filter((b) => b.playerName === n).length;
      return [...filtered].sort((a, b) => cnt(b.name) - cnt(a.name));
    }
    return filtered;
  }, [players, buyins, query, sortBy]);

  // ── 정산 제외 필터 (오너 지시 2026-09-05) ─────────────────────────────────
  // "가게지원은 바인엔 포함되지만 정산 때 관계자·신규처럼 빼고 정산 가능하게" +
  // "티켓/현금/카드 등도 뺄 수 있게" → 축이 둘인 하나의 필터로 일반화한다.
  // 키 형식: `visitor:<유형>` · `method:<결제수단>`. 기본은 아무것도 제외하지 않음(전부 포함).
  const [exKeys, setExKeys] = useState<Set<string>>(() => new Set());
  // 게임·날짜를 옮기면 제외를 푼다 — 저장되지 않는 임시 필터라 따라가면 다른 장부의 숫자가 말없이 걸러지고,
  // 그 게임에서 한 적 없는 제외가 마감 메모에 자동으로 적힌다. 할인 프리셋(discPick)·라운드 프리셋과 같은 이유다.
  useEffect(() => { setExKeys(new Set()); }, [date, gameSeq]);

  // 방문자 유형은 플레이어에 붙어 있다 — 바인에는 없으므로 이름으로 잇는다.
  const visitorByName = useMemo(
    () => new Map(players.map((p) => [p.name, p.visitorType ?? ''])),
    [players],
  );

  // 판정 자체는 업무 규칙이라 api/ledger.ts 에 있다(테스트 대상). 여기서는 로스터만 이어 준다.
  const isExcluded = useCallback(
    (b: LedgerBuyin): boolean => isBuyinExcluded(b, exKeys, (nm) => visitorByName.get(nm)),
    [exKeys, visitorByName],
  );

  // 제외 후보별 건수 — 무엇을 빼는지 모르고 누르면 정산이 틀어진다. 체크박스 옆에 그대로 보여준다.
  const exCounts = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const b of buyins) {
      const vt = visitorByName.get(b.playerName);
      if (vt) bump(`visitor:${vt}`);
      if (!b.isSplit) bump(`method:${b.paymentMethod}`);
    }
    return m;
  }, [buyins, visitorByName]);

  /** 마감 메모에 자동으로 적힐 제외 요약 — 무엇을 빼고 정산했는지가 기록에 남아야 감사가 된다. */
  const exNote = useMemo(() => {
    // 켜져만 있고 실제로 빠진 행이 없으면 아무 말도 하지 않는다 — 0건짜리 필터가 켜져 있어도
    // 마감 메모·토스트에 '정산 제외: 티켓'이 박혔고, 마감 모달의 제외 배너(removed.count > 0)는
    // 뜨지 않아 같은 마감이 두 가지 말을 했다. 조건을 그 배너와 같은 것으로 맞춘다.
    if (exKeys.size === 0 || !buyins.some(isExcluded)) return '';
    const labels = [...exKeys].map((k) => {
      const [kind, val] = k.split(':');
      return kind === 'visitor' ? visitorLabel(val) : (METHOD_LABEL[val as PaymentMethod] ?? val);
    });
    return `정산 제외: ${labels.join('·')}`;
  }, [exKeys, buyins, isExcluded]);

  const stats = useMemo(() => {
    // 전체(기록)와 제외 적용(정산 기준)을 한 번에 센다 — 목록을 두 번 훑지 않는다.
    const mk = () => ({ totalBuyins: 0, entries: 0, ticket: 0, ticketUnpaid: 0, revenue: 0, unpaid: 0, support: 0, value: 0,
                        // 대차표: 정가 − 할인 = 순액(value) = tender 합. 행마다 성립하므로 합계도 성립한다.
                        gross: 0, disc: 0, tender: { ...ZERO_TENDER } });
    const all = mk(), kept = mk();
    for (const b of buyins) {
      const f = buyinFinance(b, session);
      const targets = isExcluded(b) ? [all] : [all, kept];
      for (const t of targets) {
        t.totalBuyins++; t.entries += f.entry + addonEntryOf(b, session); t.revenue += f.paid; t.unpaid += f.unpaid;
        t.ticket += f.ticketPaid; t.ticketUnpaid += f.ticketUnpaid; t.support += f.support; t.value += f.value;
        t.gross += f.gross; t.disc += f.disc;
        t.tender.cash += f.tender.cash; t.tender.card += f.tender.card; t.tender.transfer += f.tender.transfer;
        t.tender.ticket += f.tender.ticket; t.tender.support += f.tender.support; t.tender.unpaid += f.tender.unpaid;
      }
    }
    // #20: 할인 엔트리 수 · 금일 총 할인액 — 마감정산/요약바가 같은 계산(discountSummary)을 쓴다.
    const discount = discountSummary(buyins.filter((b) => !isExcluded(b)), session);
    // 무엇이 빠졌는지 — 화면에 그대로 밝힌다(모르고 정산하는 일이 없게).
    const removed = {
      count: all.totalBuyins - kept.totalBuyins,
      entries: all.entries - kept.entries,
      value: all.value - kept.value,
      revenue: all.revenue - kept.revenue,
    };
    // 애드온(2026-09-28) — 바인 대차와 따로 센다. 표시에서 '완납 매출'·'미수'에만 더한다.
    const addon = addonTotals(buyins.filter((b) => !isExcluded(b)));
    // 밖에서 쓰는 이름은 '제외 적용' 값이다 — 오너가 그 숫자로 정산하기 때문이다.
    return { ...kept, discount, all, removed, addon };
  }, [buyins, session, isExcluded]);

  // 플레이어별 총 바이인/미수(금액) — 행마다 buyins 전체를 훑던 것(O(행×바인))을
  // buyins 1회 집계 맵(O(바인))으로 전환. 리스트 렌더에서 두 번 호출돼 재계산 부담이 컸음.
  const playerTotalsMap = useMemo(() => {
    const m = new Map<string, { paid: number; unpaid: number; value: number }>();
    for (const b of buyins) {
      const f = buyinFinance(b, session);
      const a = addonFinance(b);
      const cur = m.get(b.playerName) ?? { paid: 0, unpaid: 0, value: 0 };
      cur.paid += f.paid + a.revenue; cur.unpaid += f.unpaid + a.unpaid;   // 애드온 미수도 미수자 명단에 오른다
      // '총바인' 열에 쓰는 바인 **가치** — 티켓은 단가 전액, 지원은 단가−할인(BuyinFinance.value 주석).
      // 정산 제외된 행은 여기서도 빠진다 → **행 합계의 합이 언제나 총계와 맞는다.**
      if (!isExcluded(b)) cur.value += f.value;
      m.set(b.playerName, cur);
    }
    return m;
  }, [buyins, session, isExcluded]);
  const playerTotals = (name: string) => playerTotalsMap.get(name) ?? { paid: 0, unpaid: 0, value: 0 };
  // 1d 요약 손님 줄 — 머리(stats)와 같은 '정산 제외' 규칙. 표의 미수 열·미수자 명단(playerTotals)은 그대로 전체 기준이다.
  const summaryRows = useMemo(() => summaryRowsOf(buyins, session, isExcluded), [buyins, session, isExcluded]);

  // ── 액션 ──────────────────────────────────────────────────────────────────
  const handleOpen = async (s: LedgerSession) => {
    try {
      await openLedgerSession(s, s.openedBy ?? null);
      await syncDealersToSchedule(s.sessionDate, s.dealers);
      await reloadSession();
      toast.show('장부를 시작했습니다', 'success');
      // 담당 직원(본인 제외)에게 장부 시작 알림 — 실패해도 장부 흐름엔 영향 없음
      const others = (s.operators ?? []).filter((id) => id && id !== user?.id);
      if (others.length) notifyLedgerOpen(venueId, s.title ?? '', others).catch(() => {});
      // 🔴 2026-09-18 오너: "장부를 다 작성하면 바로 클락으로 이동하지 말고 장부를 켜줘 클락은 알아서 사람들이 킬꺼야".
      //   여기 있던 confirm('…클락도 같이 켤까요?') 을 지웠다. 시작하면 **장부 화면에 그대로 머문다.**
      //   기능 소실 아님 — 클락은 장부 상단 '클락' 버튼과 ClockRemoteBar 로 언제든 켠다.
      //   ⚠ 되살릴 일이 있어도 confirm 이 아니라 화면 안 배너로 해라 — 모달 대화상자는 그동안
      //     다른 조작을 전부 막고, 브라우저 자동화에서는 세션이 통째로 멈춘다.
    }
    catch (e) {
      // #5(2026-09-27) — 다른 접수대가 먼저 시작했다. 덮지 않았으니 그 장부를 다시 읽어 보드로 넘어간다.
      if (e instanceof Error && e.message === LEDGER_ALREADY_OPEN) {
        toast.show(`${LEDGER_ALREADY_OPEN}. 그 장부를 불러왔어요 — 제목·단가·담당을 확인해 주세요`, 'info', { durationMs: 7000 });
        await reloadSession(); reload();
        return;
      }
      toast.show(ledgerErrorText(e, '시작 실패'), 'error', { durationMs: 7000 });   // 20260925g: 직원 지난 날짜·담당 권한 hint 를 쉬운 말로
    }
  };
  const handleEditSave = async (s: LedgerSession) => {
    // 비분납 바인은 세션 단가·할인을 '참조'로 재계산한다 — 변경이 기존 기록 전체에 소급된다는
    // 사실을 모르고 고치면 실제 받은 현금과 장부가 조용히 어긋난다. 바뀔 때만 한 번 묻는다.
    const priceChanged = s.buyinAmount !== session.buyinAmount
      || (s.cardAmount ?? null) !== (session.cardAmount ?? null)
      // ⚠ 2026-09-16: 예전에는 JSON.stringify 통째 비교라 **할인을 '추가'하는 것까지 막았다.**
      //   바인은 자리번호로 할인을 참조하므로 뒤에 덧붙이는 것은 소급 영향이 0 이다(ledger.ts discountsAppendOnly).
      //   덤으로 통째 비교는 jsonb 키 순서(label,level,amount)와 폼 키 순서(label,amount,level)가 달라
      //   **제목만 고쳐도** 거부되는 거짓 양성이 있었다 — 필드 비교로 함께 해소된다.
      || !discountsAppendOnly(session.discounts ?? [], s.discounts ?? []);
    // ⚠ 2026-09-14 D1 — 여기 있던 경고문은 **사실과 반대**였다.
    //   "새 기록은 기록 시점 금액이 고정돼 영향 없음" 이라고 적혀 있었지만, 엔트리는
    //   `적용금액 ÷ 세션 **현재** 단가`(ledger.ts buyinFinance.seal)라 스냅샷이 있는 행도 분모가 바뀐다.
    //   10만 게임에 3건 기록 후 단가를 5만으로 바꾸면 엔트리가 3.0 → 6.0, 달성률이 2배가 된다.
    //   게다가 예전 조건은 '레거시 행이 있을 때만' 이라 **레거시가 0건이면 경고조차 안 땡다.**
    //   폼에서 이미 잠갔지만(lockPricing), 저장 경로에서도 막는다 — 폼을 우회해도 장부가 틀어지지 않게.
    if (priceChanged && buyins.length > 0) {
      toast.show('이미 기록된 바인이 있어 단가와 기존 할인은 바꿀 수 없습니다. 할인은 뒤에 추가만 됩니다', 'error');
      return;
    }
    try { await saveLedgerSession(s); await syncDealersToSchedule(s.sessionDate, s.dealers); setSession((prev) => ({ ...prev, ...s })); setEditOpen(false); toast.show('세션 정보를 저장했습니다', 'success'); }
    catch (e) { toast.show(ledgerErrorText(e, '저장 실패'), 'error', { durationMs: 7000 }); }
  };
  const handleClose = async (memo: string) => {
    try {
      // C2: 클락이 이 장부에 연동돼 있으면 최종 보정 수치(엔트리/생존/아웃/얼리)를 스냅샷으로 함께 저장 → 통계 보조 표기
      // PL3: 같은 순간의 클락 '설정'(블라인드·얼리·프라이즈)도 회차 스냅샷으로 동봉 — clock_states 는
      // 다음 게임이 덮으므로, 마감 시점이 '지난 게임 그대로 열기'가 복원할 수 있는 유일한 캡처 기회다.
      let snap: LedgerCloseSnapshot | null = null;
      if (clockLinked && clock) {
        const derived = deriveClockCounts(buyins, earlyWindowOf(clock.config, session));
        const ls = computeLiveStats(clock, derived, clock.config);
        snap = {
          entries: ls.entries, alive: ls.alive, eliminations: ls.eliminations, rebuys: ls.rebuys, earlies: ls.earlies, addons: ls.addons,
          gameSnapshot: { capturedAt: new Date().toISOString(), clockConfig: clock.config },
        };
      }
      await closeLedgerSession(venueId, date, memo, gameSeq, snap);
      await reloadSession();
      setCloseOpen(false);
      // 마감 요약 한 줄 — 바인·매출(실수금)·미수 건수(통계와 동일한 buyinFinance 규칙)
      // ⚠ 방금 읽은 마감 모달과 **같은 모집단**이어야 한다. 예전엔 여기만 전체 buyins 를 써서,
      //   정산 제외를 걸고 마감하면 모달과 토스트가 서로 다른 매출·할인을 말했다(2026-09-05 감사).
      const kept = buyins.filter((b) => !isExcluded(b));
      const fins = kept.map((b) => buyinFinance(b, session));
      const rev = fins.reduce((s, f) => s + f.paid, 0) + addonTotals(kept).revenue;
      const unpaidCnt = kept.filter((b, i) => fins[i].unpaid > 0 || fins[i].ticketUnpaid > 0 || addonFinance(b).unpaid > 0).length;
      // #20: 할인은 '덜 받은 돈'이라 마감 한 줄에도 같이 선다 — 매출만 보면 왜 덜 들어왔는지 알 수 없다.
      const dsum = discountSummary(kept, session);
      let closeMsg = `마감 완료.${exNote ? ` (${exNote})` : ''} 오늘 바인 ${kept.length} · 매출 ${wonToMan(rev)}만${dsum.count ?` · 할인 ${dsum.count}건 현금 −${wonToMan(dsum.cashTotal)}만` : ''}${unpaidCnt ? ` · 미수 ${unpaidCnt}건` : ' · 미수 없음'}`;
      // 클락 연동 마감 시: 클락 최종 인원 vs 장부 인원 차이(정산 누수 조기 경보)
      // ⚠(경고 이모지)를 메시지에 심고 includes('⚠')로 분기하던 코드였다 — 문자열이 곧 제어 플래그라
      // 이모지 한 글자만 지워도 error 토스트가 조용히 success 로 바뀐다. 불리언으로 분리한다.
      let mismatch = false;
      if (snap) {
        const ledgerPlayers = new Set(buyins.map((b) => b.playerName)).size;
        const diff = snap.entries - ledgerPlayers;
        if (Math.abs(diff) >= 1) {
          mismatch = true;
          closeMsg += ` · 클락 ${snap.entries}명 vs 장부 ${ledgerPlayers}명(${diff > 0 ? '+' : ''}${diff})`;
        }
      }
      // 인원차 경보는 마감 해제 골든타임 안에 읽혀야 한다 — error 8초(성공 2.4초로는 대조 불가)
      if (mismatch) toast.show(closeMsg, 'error', { durationMs: 8000 });
      else toast.show(closeMsg, 'success');
    }
    catch (e) { toast.show(ledgerErrorText(e, '마감 실패'), 'error'); }
  };
  const handleReopen = async () => {
    try { await reopenLedgerSession(venueId, date, gameSeq); await reloadSession(); toast.show('마감을 해제했습니다', 'info'); }
    catch (e) { toast.show(ledgerErrorText(e, '해제 실패'), 'error'); }
  };
  // PL3: 마감 직후 '이 게임을 프리셋으로 저장' — 프리셋이 별도 작업이 아니라 운영의 부산물로 쌓이게.
  const [roundPresetState, setRoundPresetState] = useState<'idle' | 'busy' | 'done'>('idle');
  useEffect(() => { setRoundPresetState('idle'); }, [date, gameSeq]);
  const saveRoundPreset = async () => {
    if (roundPresetState !== 'idle') return;
    setRoundPresetState('busy');
    try {
      const sched = venueSchedules.find((s) => s.id === session.scheduleId) ?? null;
      const cfg = (clockLinked && clock) ? clock.config : (session.clockSnapshot?.gameSnapshot?.clockConfig ?? null);
      await saveGamePreset(venueId, session.title?.trim() || `${date} 게임`, presetFromRound(session, cfg, sched));
      setRoundPresetState('done');
      toast.show('프리셋으로 저장했어요. 포스터·장부·클락 어디서든 한 번에 불러올 수 있어요', 'success');
    } catch (e) { setRoundPresetState('idle'); toast.show(ledgerErrorText(e, '프리셋 저장 실패'), 'error'); }
  };
  const handleRegClose = async () => {
    try { await setRegistrationClosed(venueId, date, !regClosed, gameSeq); await reloadSession(); toast.show(!regClosed ? '레지 마감했습니다' : '레지를 다시 열었습니다', 'info'); }
    catch (e) { toast.show(ledgerErrorText(e, '실패했습니다'), 'error'); }
  };
  const addPlayer = async () => {
    const n = newName.trim();
    if (!n) return;
    try {
      await addLedgerPlayer({ venueId, sessionDate: date, gameSeq, name: n, visitorType: newType, sortOrder: players.length });
      // 개장 러시: 손님 10~20명이 줄 선다 — 폼을 유지하고 입력만 비워 연속 등록(닫기는 ✕로)
      setNewName(''); setNewType('regular'); setSuggest([]); reload();
      toast.show(`${n} 추가됨. 이어서 입력하세요`, 'success');
    } catch (e) { toast.show(ledgerErrorText(e, '추가 실패'), 'error'); }
  };
  // 가입자 검색(디바운스) — RPC 하나가 두 경우를 다 준다(20260911h):
  //   이 매장 손님(체크인·CRM·예약)은 부분 일치 + 실명, 처음 오는 회원은 닉네임 정확 일치(실명 없음).
  //   종전엔 여기에 search_members_for_ranking 을 병합했는데, 그건 매장과 무관한 전 회원 실명을
  //   부분 일치로 긁어오는 경로라 걷어냈다. 회원이 아니면 아래 '입력값 그대로 등록'이 받는다.
  useEffect(() => {
    if (!addOpen || newName.trim().length < 1) { run.cancel('search'); setSuggest([]); return; }
    const t = window.setTimeout(() => {
      run('search', (v) => searchRegisteredPlayers(v, newName), setSuggest, () => setSuggest([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [newName, addOpen, venueId, run]);
  // 가입자 선택 → 실명(닉네임)으로 장부 기록(강제 아님, 그냥 추가하면 입력값 그대로)
  const pickRegistered = async (rp: RegisteredPlayer) => {
    const label = rp.realName ? `${rp.realName}(${rp.nickname ?? ''})` : (rp.nickname ?? newName.trim());
    try {
      await addLedgerPlayer({ venueId, sessionDate: date, gameSeq, name: label, visitorType: newType, sortOrder: players.length });
      setNewName(''); setSuggest([]); setNewType('regular'); reload();
      toast.show(`${label} 추가됨. 이어서 입력하세요`, 'success');
    } catch (e) { toast.show(ledgerErrorText(e, '추가 실패'), 'error'); }
  };
  /** 성공하면 true — 실패면 모달을 닫지 않는다(#7 2026-09-27: 이름 충돌로 거절돼도 닫혀 입력이 사라졌다). */
  const savePlayer = async (id: string, patch: { visitorType?: string | null; note?: string | null; name?: string }): Promise<boolean> => {
    try {
      const { name: newName, ...rest } = patch;
      // 이름 변경은 로스터+해당 세션 바인 기록(player_name 키)을 함께 갱신
      if (newName) {
        const cur = players.find((p) => p.id === id);
        if (cur) await renameLedgerPlayer({ id, venueId, sessionDate: date, gameSeq, oldName: cur.name, newName });
      }
      await updateLedgerPlayer(id, rest);
      reload();
      return true;
    }
    catch (e) { toast.show(ledgerErrorText(e, '저장 실패'), 'error'); reload(); return false; }
  };
  const removePlayer = async (p: LedgerPlayer, password?: string) => {
    const hasBuyins = buyins.some((b) => b.playerName === p.name);
    try {
      // #1(2026-09-27) — 서버(_ledger_require_cancel_auth)와 같은 규칙: 비밀번호가 설정된 매장만 비밀번호를 받고,
      //   미설정 매장은 업주·공동운영자(canManage)만 비밀번호 없이 지운다. 예전엔 미설정 매장에서 업주도 영영 못 지웠다.
      if (hasBuyins && hasPw && !password) { toast.show('바인 기록 삭제에는 취소 비밀번호가 필요합니다', 'error'); return; }
      if (hasBuyins && !hasPw && !canManage) { toast.show('취소 비밀번호가 설정되지 않은 매장은 업주·공동운영자만 바인 기록이 있는 플레이어를 지울 수 있습니다', 'error'); return; }
      // 원자 RPC — 예전 순차 삭제는 중간 실패 시 '바인 2건만 사라진' 반쪽 장부를 남겼다
      await deleteLedgerPlayerAtomic(p.id, password);
      toast.show('플레이어를 삭제했습니다', 'info'); setEditPlayer(null); reload();
    } catch (e) { notePwFromError(e); toast.show(ledgerErrorText(e, '삭제 실패(비밀번호 확인)'), 'error', { durationMs: 7000 }); }
  };

  // ── 머리줄(날짜·게임) — 2026-10-02 오너 「게임 선택 줄은 하나로」(감사 L-1·L-3) ─────────────────
  //   셸의 '오늘 게임' 칩 줄 자리(gameSlot)가 있으면 게임 스위처를 거기로 portal 한다. PC(lg+)는 날짜·도구도 같은 한 줄로 올려
  //   판 안의 날짜 줄(42)·게임 줄(34)을 없앤다(첫 화면 표 행 확보). 모바일은 날짜 줄이 판 안에 남고 게임 줄만 올라간다.
  //   자리가 없으면(관리자 탭 등) 종전처럼 판 안에 날짜 줄 + 게임 줄.
  // F-3 — 고른 순간 셸에 '직접 고름' 을 알린다. 보드 조회가 끝나야 도는 아래 알림(onTodayGame effect)만 믿으면,
  //   고르자마자 클락으로 가 판이 비활성이 될 때 알림이 안 나가 재진입이 고른 게임을 잃었다(e2e ⑥ 실측).
  const pickGame = (g: number) => {
    autoLandRef.current = null; userPickRef.current = true; setGameSeq(g); setSelected(null);
    if (date === biz) onTodayGame?.(g, games.find((x) => x.gameSeq === g)?.title ?? undefined, true);
  };
  const switcher = (games.length > 0 || gameSeq > MAIN_GAME_SEQ)
    ? <GameSwitcher games={games} gameSeq={gameSeq} onSelect={pickGame} onAddSide={addSide} canAdd={operatorOk} date={date} today={date === biz} />
    : null;
  const dateBar = (withTools: boolean) => <DateBar date={date} setDate={setDate} biz={biz} onBack={() => setMode('list')} tools={withTools ? wsTools : null} />;
  const slotted = !!gameSlot && mode === 'board' && !inFullscreen;
  const headPortal = slotted && gameSlot ? createPortal(isDesktopLedger ? (
    // flex-wrap — 좁은 PC(1024)에서는 게임 칩 칸이 0 으로 짜부라지지 않고 다음 줄로 내려간다(칸 하한 16rem).
    <div data-ledger-head="" className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="shrink-0">{dateBar(false)}</div>
      <div data-ledger-switcher="" className="order-last min-w-0 basis-full empty:hidden">{switcher}</div>
      {wsTools && <div className="ml-auto flex shrink-0 items-center gap-1.5">{wsTools}</div>}
    </div>
  ) : (switcher ?? (loading ? <div aria-hidden className="h-9 animate-pulse rounded-badge bg-surface-high" /> : null)), gameSlot) : null;
  const headInline = slotted ? (isDesktopLedger ? null : dateBar(true)) : <>{dateBar(true)}{switcher}</>;

  // ── 게임(세션) 리스트 — 장부 진입 첫 화면 ──────────────────────────────────
  if (mode === 'list') {
    const todayStr = today();
    const lq = listQuery.trim().toLowerCase();
    const filtered = sessionList.filter((s) => {
      if (filterFrom && s.sessionDate < filterFrom) return false;
      if (filterTo && s.sessionDate > filterTo) return false;
      if (lq && !`${s.sessionDate} ${s.title ?? ''}`.toLowerCase().includes(lq)) return false;
      return true;
    });
    const hasRange = !!(filterFrom || filterTo);
    return (
      <div className="space-y-3 pb-6">
        {/* 제목은 VenueManageTab 공용 SectionHeader가 렌더 — 여기는 검색+추가 한 행 */}
        <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder="장부 검색 (날짜·게임명)" className="input w-full text-sm pl-9" />
        </div>
        <button type="button" onClick={() => openBoard(todayStr)} className="btn-primary text-xs px-3 shrink-0">+ 장부 추가</button>
        {wsTools}
        </div>

        {/* 기간으로 보기 — 시작~종료 범위의 장부만 표시(필터)
            ⚠ `min-w-0` 이 없으면 flex 아이템의 min-width:auto 가 `<input type="date">` 의 **내재 폭(164px)**
              으로 고정돼 flex-1 이 무력해진다 — 360px 에서 두 칸+`~` 가 컨테이너(326)를 넘어
              오른쪽 칸이 뷰포트 밖(365 > 360)으로 잘렸다(실측 2026-09-18). 390 은 우연히 들어왔다. */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input type="date" value={filterFrom} max={filterTo || todayStr} onChange={(e) => setFilterFrom(e.target.value)} className="input min-w-0 flex-1 text-sm" aria-label="시작일" />
            <span className="text-2xs text-ink-muted shrink-0">~</span>
            <input type="date" value={filterTo} min={filterFrom || undefined} max={todayStr} onChange={(e) => setFilterTo(e.target.value)} className="input min-w-0 flex-1 text-sm" aria-label="종료일" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xs text-ink-muted">{hasRange ? `${filterFrom || '처음'} ~ ${filterTo || '오늘'}` : '기간 설정 시 그 범위만'}</span>
            {/* #7(2026-09-25) — accent-200/90 은 라이트에서 remap(html.light .text-accent-200)을 못 받는 알파 변형이라 대비가 떨어졌다. 알파 없는 토큰으로. */}
            <button type="button" onClick={() => { setFilterFrom(shiftDays(todayStr, -6)); setFilterTo(todayStr); }} className="px-1.5 py-1.5 -my-1.5 text-2xs font-semibold text-accent-200 hover:underline">최근 7일</button>
            <button type="button" onClick={() => { setFilterFrom(todayStr.slice(0, 7) + '-01'); setFilterTo(todayStr); }} className="px-1.5 py-1.5 -my-1.5 text-2xs font-semibold text-accent-200 hover:underline">이번 달</button>
            {hasRange && <button type="button" onClick={() => { setFilterFrom(''); setFilterTo(''); }} className="text-2xs text-ink-muted hover:text-ink-secondary ml-auto">전체 보기</button>}
          </div>
        </div>

        {listLoading ? (
          <SkeletonList rows={5} rowClassName="h-14" />
        ) : listError ? (
          /* ⚠ 실패 분기는 반드시 빈 상태보다 먼저 — 뒤에 두면 '없음'이 계속 이긴다 */
          <LoadErrorCard error={listError} what="장부 목록" onRetry={loadList} />
        ) : sessionList.length === 0 ? (
          <EmptyState title="아직 작성한 장부가 없습니다" hint='"+ 장부 추가"를 누르면 오늘 장부가 열립니다' />
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-ink-muted">{hasRange ? '선택한 기간에 작성된 장부가 없습니다.' : `"${listQuery.trim()}" 검색 결과가 없습니다.`}</p>
        ) : (
          <div className="space-y-2">
            {(() => {
              // 날짜별 그룹(최신순) — filtered는 날짜 desc·game asc 정렬됨
              const groups: { date: string; items: typeof filtered }[] = [];
              for (const s of filtered) {
                const g = groups.find((x) => x.date === s.sessionDate);
                if (g) g.items.push(s); else groups.push({ date: s.sessionDate, items: [s] });
              }
              const gl = (seq: number) => (seq === MAIN_GAME_SEQ ? '메인' : `사이드${seq - 1}`);
              return groups.map(({ date, items: raw }) => {
                const open = !collapsedDates.has(date);
                const liveN = raw.filter((x) => !x.closed && !x.regClosed).length;
                const closedN = raw.filter((x) => x.closed).length;
                // 진행 중(마감 전)이 위 — 하루 15게임이면 지금 받는 게임이 맨 아래에 묻혔다(감사 1-3). 같은 상태 안에서는 회차순 그대로.
                const foldClosed = closedN > 3 && raw.some((x) => !x.closed) && !shownClosed.has(date);
                const items = [...raw].sort((a, b) => Number(a.closed) - Number(b.closed)).filter((x) => !(foldClosed && x.closed));
                return (
                  <div key={date} className="rounded-aura border card-aura overflow-hidden">
                    {/* 날짜 헤더 — 접기/펼치기(그날 게임 묶음) */}
                    <button type="button"
                      onClick={() => setCollapsedDates((prev) => { const n = new Set(prev); if (n.has(date)) n.delete(date); else n.add(date); return n; })}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-high transition-colors">
                      <span className="text-sm font-bold text-ink-primary">{date}{date === todayStr ? ' (오늘)' : ''}</span>
                      <span className="text-2xs font-semibold text-accent-200">게임 {raw.length}</span>
                      {liveN > 0 && <span className="text-2xs font-bold text-emerald-400">진행 {liveN}</span>}
                      {closedN > 0 && <span className="text-2xs text-ink-muted">마감 {closedN}</span>}
                      <span className="flex-1" />
                      <span className="text-2xs font-bold text-ink-muted">{open ? '접기 ▲' : '펼치기 ▼'}</span>
                    </button>
                    {/* 펼친 목록 ↔ 접힌 한 줄 요약 — 둘 다 판으로 들고 나서 높이가 한 프레임에 바뀌지 않는다 */}
                    <Fold open={open}>
                      <ul className="border-t border-border-subtle divide-y divide-border-subtle">
                        {items.map((s) => {
                          const canOpen = fullAccess || s.operators.length === 0 || (!!user && s.operators.includes(user.id));
                          // 열 수 없는 회차(담당자 아님)는 hover 하이라이트도 주지 않는다 —
                          // '안 되는데 반응은 한다'가 한 행에서 충돌했다(2026-09-04 조사).
                          return (
                          <li key={`${s.sessionDate}#${s.gameSeq}`}
                              className={['group/row flex items-center transition-colors', canOpen ? 'hover:bg-surface-high/40' : ''].join(' ')}>
                            <button type="button" disabled={!canOpen} onClick={() => canOpen && openBoard(s.sessionDate, s.gameSeq)}
                              className={['flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 text-left', canOpen ? '' : 'opacity-50 cursor-not-allowed'].join(' ')}>
                              <span className={['shrink-0 text-2xs font-bold px-1.5 py-0.5 rounded-badge border', s.gameSeq === MAIN_GAME_SEQ ? 'bg-surface-float text-ink-secondary border-border-default' : 'bg-accent-300/15 text-accent-300 border-accent-400/40'].join(' ')}>{gl(s.gameSeq)}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-ink-primary truncate">{s.title || '게임'}</p>
                                <p className="text-2xs text-ink-muted truncate">바인 {s.buyinAmount.toLocaleString()}원{s.operators.length > 0 ? ` · 담당 ${operFull(s.operators[0])}${s.operators.length > 1 ? ` 외 ${s.operators.length - 1}` : ''}` : ''}{canOpen ? '' : ' · 접근 권한 없음'}</p>
                              </div>
                              {!canOpen
                                ? <Icon name="lock" size={14} className="shrink-0 text-ink-muted" role="img" aria-hidden={false} aria-label="잠김" />
                                : s.closed
                                ? <span className="shrink-0 text-2xs font-bold text-accent-200 bg-accent-300/15 px-2 py-0.5 rounded-badge">마감</span>
                                : s.regClosed
                                ? <span className="shrink-0 text-2xs font-bold text-danger-light bg-danger/10 px-2 py-0.5 rounded-badge">레지마감</span>
                                : <span className="shrink-0 text-2xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-badge">진행중</span>}
                            </button>
                            {fullAccess && (
                              <button type="button" data-ledger-trash="" onClick={() => askDeleteSession(s.sessionDate, s.gameSeq)} aria-label={`${s.sessionDate} ${gl(s.gameSeq)} 장부 삭제`}
                                // 행마다 늘어선 휴지통이 목록을 어지럽혔다(감사 L-9) — PC 는 행에 마우스·포커스가 올 때만 보인다(누를 수 있는 자리·크기는 그대로).
                                // 3c(2026-10-02 검토) — 숨김은 마우스(hover+fine) 기기에만. 1024+ 터치 태블릿은 hover 가 없어 영영 안 보였다.
                                className="shrink-0 -my-1.5 ml-1 mr-1 h-11 w-11 flex items-center justify-center rounded-input text-ink-muted/70 hover:text-danger-light hover:bg-danger/10 transition-colors">
                                <Icon name="trash" size={15} />
                              </button>
                            )}
                          </li>
                        );})}
                        {foldClosed && (
                          <li>
                            <button type="button" onClick={() => setShownClosed((prev) => new Set(prev).add(date))}
                              className="flex min-h-11 w-full items-center justify-center gap-1 px-3 text-2xs font-bold text-ink-secondary hover:bg-surface-high/40">
                              마감 {closedN}개 보기 <Icon name="chevron-down" size={12} className="shrink-0" />
                            </button>
                          </li>
                        )}
                      </ul>
                    </Fold>
                    <Fold open={!open}>
                      <div className="border-t border-border-subtle px-3 py-1.5 text-2xs text-ink-muted truncate">{raw.map((x) => gl(x.gameSeq)).join(' · ')}</div>
                    </Fold>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* 삭제 확인 — 되돌릴 수 없으므로 실수치 + 꾹 눌러 확정(마감과 최소 동일 강도) */}
        {delTarget && (
          <DeleteSessionModal
            label={delTarget.label} loss={delLoss} lossErr={delLossErr} busy={delBusy}
            hasPw={hasPw} pw={delPw} onPw={setDelPw}
            onClose={() => { if (!delBusy) setDelTarget(null); }}
            onConfirm={doDeleteSession}
          />
        )}
      </div>
    );
  }

  // (B1) 전체를 한 줄 텍스트로 치환하던 것 → 표 골격을 유지하는 스켈레톤(레이아웃 점프 방지)
  // 행 높이는 실제 바인 표 본문 행(1544-1650행, w-12 h-12 셀)과 맞춘다 — h-10(42.5px)이던 것이
  // 실제 h-12 행(51px)보다 6행 합쳐 -51px 작았다(2026-09-20 실측, 프로덕션 프리뷰 4273 합성 DOM: h-12 셀
  // 클래스를 그대로 쓴 1행 rect.height=51px, h-10=42.5px). 같은 h-12 클래스를 그대로 재사용해 맞춘다.
  if (loading) return (
    <div className="space-y-3">
      {headPortal}
      {!(slotted && isDesktopLedger) && <div data-ledger-daterow className="h-9 animate-pulse rounded-input bg-surface-high lg:w-[276px]" />}
      <SkeletonList rows={6} rowClassName="h-12" />
    </div>
  );

  // 불러오기 실패 — 세팅 폼(=새 장부 시작)으로 절대 넘기지 않는다.
  // C05 보완: hasBoardData 면 이미 정상 조회된 값이 있다는 뜻이라 전면 카드로 덮지 않는다 —
  // 아래 보드 렌더로 흘려보내고, 보드 안의 인라인 배너(DateBar 바로 아래)가 실패를 알린다.
  if (loadError && !hasBoardData) {
    return (
      <div className="space-y-3">
        {headPortal}{headInline}
        <LoadErrorCard error={loadError} what="장부" onRetry={() => { setLoadError(null); reloadSession(); reload(); }} />
      </div>
    );
  }

  // ── 세션 설정(장부 입장 게이트) ────────────────────────────────────────────
  if (showSetup) {
    return (
      <div className="space-y-3">
        {headPortal}{headInline}
        {!operatorOk ? (
          <div className="rounded-card border border-danger/40 bg-danger/10 p-4 text-center">
            <p className="text-sm font-bold text-danger-light">승인된 계정만 장부를 운영할 수 있습니다.</p>
            <p className="text-2xs text-ink-muted mt-1">업주 승인 완료 후 이용하세요.</p>
          </div>
        ) : (
          <SessionForm
            base={{ ...session, ...(prefill ?? {}) }} mode="open" operatorName={operatorName}
            prefilled={!!prefill} schedules={venueSchedules} operatorOptions={operatorOptions}
            operatorOptionsError={operatorOptionsError} onRetryOperatorOptions={reloadAccessIds} operatorOptionsPartial={!fullAccess}
            presets={presets} scheduledDealers={scheduledNames} dealerOptions={dealerOptions} copyMain={copyMain}
            lastRound={lastRound} autoApplyLast={autoApplyLast} onLastApplied={() => setAutoApplyLast(false)}
            onSubmit={handleOpen}
          />
        )}
      </div>
    );
  }

  // 생존 상시 표시 — 클락 연동 시 실집계(alive), 미연동/집계전이면 추정(인원−아웃)
  // ⚠ 추정치의 기준은 '엔트리'가 아니라 **인원**이다(2026-09-07). stats.entries 는 리바인을 포함한
  //   총 바인 수라, 6명이 리바인을 돌린 판에서 '생존(추정) 41' 같은 숫자가 나왔다. 클락이 붙는
  //   순간 실집계(alive=인원 기준)로 바뀌면서 같은 타일이 41 → 6 으로 튀는 것도 같은 원인이다.
  //   인원 정의는 아래 마감 대조 줄(new Set(buyins.map(b => b.playerName)).size)과 같은 것을 쓴다.
  // P-02(2026-10-01) — 게임 요약 띠(모바일)와 PC 정산 바가 같은 칸을 쓰도록 위로 올렸다(계산 동일).
  const aliveLive = clockLinked && clock?.liveStats ? clock.liveStats.alive : null;
  const aliveHeads = new Set(buyins.map((b) => b.playerName)).size;
  const aliveEst = Math.max(0, aliveHeads - (clockLinked && clock ? (clock.eliminations ?? 0) : 0));
  const aliveMetric = <Metric label={aliveLive != null ? '생존' : '생존(추정)'} value={`${aliveLive != null ? aliveLive : aliveEst}`} />;

  // ── 보드 ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2 pb-48 lg:pb-28">
      {headPortal}
      {slotted ? headInline : dateBar(true)}
      {/* C05 보완 — 재조회 실패(다른 접수대의 마감·단가·할인 변경을 못 받아옴)를 조용히 감추지 않는다.
          hasBoardData 라 전면 카드로 안 덮었을 뿐, 지금 보이는 값이 낡았을 수 있다는 사실은 알려야 한다. */}
      {!!(loadError || rowsErr) && hasBoardData && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-input border border-amber-500/40 bg-amber-500/8 px-3 py-2">
          <p className="text-2xs font-semibold text-ink-secondary">방금 장부를 새로 불러오지 못했어요. 아래는 마지막으로 확인된 내용이라 단가·할인이 바뀌었을 수 있어요.</p>
          <button type="button" onClick={() => { reloadSession(); reload(); }}
            className="hit shrink-0 rounded-input border border-amber-500/40 px-2 py-1 text-2xs font-bold text-ink-primary">다시 시도</button>
        </div>
      )}
      {!slotted && switcher}

      {/* 세션 요약 */}
      {/* 2026-10-02 감사 L-1·L-8 — 한 줄로 조였다: 왼쪽(제목·단가·담당·대회)은 줄바꿈해도 오른쪽 버튼 둘은 같은 줄 오른쪽에 남는다
          (종전: 긴 대회명이면 [클락]·[세션 정보 수정] 이 다음 줄 왼쪽으로 흩어졌다). 버튼은 .btn-sm(34px)+tap-y-44 — 누름영역 44 유지. */}
      <div className="rounded-aura border card-aura px-2.5 py-1.5 flex items-center gap-2">
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="min-w-0 max-w-full truncate text-sm font-bold text-ink-primary">{session.title || '세션'}</span>
        <span className="text-2xs text-ink-muted">현금 {wonToMan(session.buyinAmount)}만원
          {session.cardAmount && session.cardAmount > 0 ? ` · 카드 ${wonToMan(session.cardAmount)}만원` : ' · 카드=현금'}</span>
        {session.openedAt && <span className="text-2xs text-ink-muted">· 담당 {operFull(session.openedBy)}</span>}
        {/* 대회명은 글자로만 있었다 — 업주가 자기 포스터의 손님 화면으로 갈 길이 장부엔 없었다(2026-09-17 감사). */}
        {scheduleTitle(session.scheduleId) && (onOpenSchedule
          ? <button type="button" title="손님이 보는 대회 상세 열기"
              onClick={() => { const s = venueSchedules.find((x) => x.id === session.scheduleId); if (s) onOpenSchedule(s); }}
              // #5(FULL-RECHECK-2/C) — whitespace-nowrap 이라 긴 대회명이 카드 밖으로 99px(1024)·146px(390) 넘쳤다 → 말줄임 + 24px 과녁.
              aria-label={`대회 ${scheduleTitle(session.scheduleId)} — 손님이 보는 대회 상세 열기`}
              className="max-w-full truncate py-1 text-left text-2xs text-accent-300 font-semibold hover:underline underline-offset-2">· 대회 {scheduleTitle(session.scheduleId)}</button>
          : <span className="inline-block max-w-full truncate align-bottom text-2xs text-accent-300 font-semibold">· 대회 {scheduleTitle(session.scheduleId)}</span>)}
        </div>
        {onOpenClock && <button type="button" onClick={() => onOpenClock(date, gameSeq)} className="btn-ghost btn-sm tap-y-44 inline-flex shrink-0 items-center gap-1.5 px-3 font-semibold"><Icon name="timer" size={15} className="shrink-0" />클락</button>}
        {!closed && <button type="button" onClick={() => setEditOpen(true)} aria-label="세션 정보 수정" className="btn-ghost btn-sm tap-y-44 shrink-0 px-3 font-semibold"><span className="max-sm:hidden">세션 정보 </span>수정</button>}
      </div>

      {/* 게임 요약 띠 — 현재 게임 핵심 지표 상단 고정(스크롤해도 보임, 모바일 라이브 운영용).
          탭하면 정산바의 '정산 마감' 을 지목한다(정산바는 fixed 라 이미 화면에 있다 — 스크롤이 아니다).
          P-02(2026-10-01): PC(lg+)는 이 띠를 숨긴다 — 아래 고정 정산 바가 같은 숫자(엔트리·완납·미수)를 이미 보여 준다.
          띠에만 있던 '생존' 은 정산 바 칸으로 옮겼다(aliveMetric). 모바일(<1024)은 그대로.
          F4(2026-09-29): PC(lg+)는 헤더 밑에 상단 메뉴줄(GNB)이 하나 더 있어 --header-now 에 붙으면 띠가 통째로 가려졌다
          (1280·1440 실측 y60~107, 5점 모두 GNB). 내 매장 사이드바·대시보드 바와 같은 --stack-top(헤더+GNB 실측)에 붙인다. */}
      {/* 2026-10-02 감사 L-6 — 모바일 상단 고정 요약 띠(엔트리·완납·생존·미수)를 걷었다. 아래 고정 정산바가 같은 숫자를 이미 보여 줘
          표로 내려가면 두 고정 크롬(88+166px)이 표 가용 높이를 844 중 450 으로 깎았다. 띠에만 있던 '생존' 은 정산바 '총 바인' 칸 보조 줄로 옮겼다
          (PC 는 P-02 대로 정산바 칸). '탭하면 정산 마감 지목' 은 정산바가 늘 화면에 있어 필요 없다(settleSignal 지목은 그대로). */}
      {/* 손님 자가 바인 요청(QR) — 운영자 원탭 승인 → 현재 게임 명단 추가 */}
      {!closed && pendingReqs.length > 0 && (
        <div className="rounded-card border border-sky-500/40 bg-sky-500/6 p-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="inline-flex items-center gap-1 text-2xs font-bold text-sky-300"><Icon name="hand" size={12} className="shrink-0" />손님 바인 요청 {pendingReqs.length}건</span>
            {/* 게임별 건수·안내문은 sm 미만에서 **자기 줄**(basis-full·order-last)로 내린다 — 종전엔 [전체 승인](ml-auto)이
                360px 에서 안내문 다음 셋째 줄에 혼자 남아 왼쪽 238px 이 비었다(2026-09-18 실측).
                sm+ 는 contents 로 감싸개가 사라져 종전과 같은 한 줄이다. */}
            <span className="order-last flex basis-full flex-wrap items-center gap-x-2 gap-y-0.5 sm:contents">
            {(() => {
              const cnt = pendingReqs.reduce((mm, r) => { const k = r.requestedGameSeq ?? 0; mm[k] = (mm[k] || 0) + 1; return mm; }, {} as Record<number, number>);
              const parts = Object.entries(cnt).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, n]) => `${Number(k) === 0 ? '미지정' : Number(k) === MAIN_GAME_SEQ ? '메인' : '사이드' + (Number(k) - 1)} ${n}`);
              return <span className="text-2xs font-semibold text-sky-300">{parts.join(' · ')}</span>;
            })()}
            <span className="text-2xs text-ink-muted">· 승인 시 각자 원한 게임에 추가(미지정은 현재 {gLabel(gameSeq)})</span>
            </span>
            {pendingReqs.length > 1 && <button type="button" onClick={bulkApprove} className="ml-auto shrink-0 rounded-input bg-emerald-500/90 px-2.5 py-1.5 min-h-9 text-2xs font-bold text-ink-inverse hover:bg-emerald-500">전체 승인</button>}
          </div>
          <ul className="space-y-1.5">
            {pendingReqs.map((r) => (
              <li key={r.id} className="rounded-input bg-surface-base/60 border border-border-subtle px-2.5 py-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-primary truncate">{r.playerName}
                      {/* #7(2026-09-25) — 하늘색 요청 카드 위 라이트 대비: sky-300(remap #0369A1) 4.3 · ink-muted 3.9 → 한 단계 진하게 */}
                      {r.requestedGameSeq != null && <span className="ml-1.5 text-2xs font-semibold text-sky-800 dark:text-sky-300">원함: {r.requestedGameSeq === MAIN_GAME_SEQ ? '메인' : '사이드' + (r.requestedGameSeq - 1)}</span>}
                    </p>
                    {r.note && <p className="text-2xs text-ink-secondary truncate">{r.note}</p>}
                    {/* 20260930i — 받는 장수는 서버가 정한다(참가 1회 N장 · 할인 바인은 할인만큼 덜 · 애드온은 금액 ÷ 1만).
                        여기서는 이 손님이 지금 낸 장수만 보여 준다 — 모자라면 승인 때 서버가 필요한 장수를 알려 준다. */}
                    {r.voucherId != null && (
                      <p data-testid="voucher-pending-count" className="text-2xs text-ink-secondary">
                        이용권 {pendingReqs.filter((x) => x.voucherId != null && (r.userId != null ? x.userId === r.userId : x.id === r.id)).length}장 사용 대기 · 할인 바인은 할인만큼 덜 · 모자라면 남은 금액 분납
                      </p>
                    )}
                  </div>
                  {/* 이용권 요청은 서버가 '티켓 완납' 바인을 자동 기록(무료입장 정합) — 💵 유료 패널은
                      승인해도 서버가 금액을 버리므로(20260623d #9) 숨겨서 '기록됐다고 믿는' 사고를 없앤다 */}
                  {r.voucherId == null && (
                    <button type="button" onClick={() => setPayPick(payPick === r.id ? null : r.id)} title="승인 + 바인 1건 기록(결제수단 선택)" className={['shrink-0 inline-flex h-10 items-center rounded-input px-2.5 text-2xs font-bold', payPick === r.id ? 'bg-emerald-600 text-ink-inverse' : 'bg-emerald-500/90 text-ink-inverse hover:bg-emerald-500', 'gap-0.5'].join(' ')}>✓+<Icon name="banknote" size={13} className="shrink-0" /></button>
                  )}
                  {/* #8 — 이용권 요청은 접수대가 용도를 고른다: 바인(티켓 바인 1건) / 애드온(이 손님의 최근 바인에 이용권 애드온). 애드온 게임에만. */}
                  {r.voucherId != null && gameIsAddon(wantSeq(r)) && (
                    <button type="button" data-testid="approve-voucher-addon" onClick={() => approveReq(r, false, 'cash', undefined, 'addon')} title="이용권 → 최근 바인에 애드온(애드온 금액 ÷ 1만 장)" className="shrink-0 inline-flex h-10 items-center rounded-input border border-accent-400/50 px-3 text-2xs font-bold text-accent-300 hover:bg-accent-300/10">✓ 애드온</button>
                  )}
                  <button type="button" onClick={() => approveReq(r)} title={r.voucherId ? '승인(참가 1회 장수만큼 묶어 티켓 바인 1회 기록 · 할인 바인은 할인만큼 덜 받음 · 모자라면 남은 금액을 다른 결제로)' : '승인만(명단 추가)'} className="shrink-0 inline-flex h-10 items-center rounded-input border border-emerald-500/50 px-3 text-2xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/10">{r.voucherId ? '✓ 승인·티켓' : '승인'}</button>
                  <button type="button" onClick={() => setRejectFor(rejectFor === r.id ? null : r.id)} aria-label="거절" className={['shrink-0 inline-flex h-10 min-w-10 items-center justify-center rounded-input border px-2.5 text-2xs font-bold', rejectFor === r.id ? 'border-danger/50 bg-danger/10 text-danger-light' : 'border-border-default text-ink-secondary hover:text-danger-light hover:border-danger/40'].join(' ')}>✕</button>
                </div>
                {shortFor?.id === r.id && (
                  <div data-testid="voucher-short-pay" className="mt-1.5 border-t border-border-subtle pt-1.5 space-y-1.5">
                    <p className="text-2xs text-ink-secondary">
                      {shortFor.s.use === 'addon' ? '애드온' : '바인'} 이용권 {shortFor.s.need}장 중 {shortFor.s.have}장({(shortFor.s.have * TICKET_WON).toLocaleString()}원) · 남은 <b className="text-ink-primary tabular-nums">{shortFor.s.remainder.toLocaleString()}원</b> 받을 방법
                    </p>
                    <div className="flex items-center gap-1.5">
                      {([['cash', '현금'], ['card', '카드'], ['transfer', '계좌'], ['unpaid', '미수']] as const).map(([mth, lbl]) => (
                        <button key={mth} type="button" data-testid={`voucher-short-${mth}`} onClick={() => approveShort(r, mth)} className="flex-1 inline-flex h-10 items-center justify-center rounded-input border border-emerald-500/50 px-2 text-2xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/15">{lbl}</button>
                      ))}
                      <button type="button" onClick={() => setShortFor(null)} aria-label="남은 금액 결제 닫기" className="shrink-0 inline-flex h-10 min-w-10 items-center justify-center rounded-input border border-border-default px-2.5 text-2xs font-bold text-ink-secondary">✕</button>
                    </div>
                  </div>
                )}
                {payPick === r.id && (
                  <div className="mt-1.5 border-t border-border-subtle pt-1.5 space-y-1.5">
                    {splitFor !== r.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0 text-2xs text-ink-secondary">결제수단</span>
                        {([['cash', '현금'], ['card', '카드'], ['transfer', '이체']] as const).map(([mth, lbl]) => (
                          <button key={mth} type="button" onClick={() => approveReq(r, true, mth)} className="flex-1 inline-flex h-9 items-center justify-center rounded-input border border-emerald-500/50 px-2 text-2xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/15">{lbl}</button>
                        ))}
                        <button type="button" onClick={() => { setSplitFor(r.id); setSplitAmts({ cash: splitDue(wantSeq(r)), card: 0, transfer: 0 }); }} className="flex-1 inline-flex h-9 items-center justify-center rounded-input border border-accent-400/50 px-2 text-2xs font-bold text-accent-300 hover:bg-accent-300/10">분할</button>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-1.5">
                          {([['cash', '현금'], ['card', '카드'], ['transfer', '이체']] as const).map(([k, lbl]) => (
                            <label key={k} className="text-2xs text-ink-secondary">{lbl}
                              {/* #2(2026-09-27) — 음수가 그대로 서버로 갔다(p_cash −500,000 + 카드 +50만 = 합계만 맞으면 확정). 0 미만은 0 으로 막는다. */}
                              <input type="number" inputMode="numeric" min={0} value={splitAmts[k] || ''} onChange={(e) => setSplitAmts((s) => ({ ...s, [k]: Math.max(0, parseInt(e.target.value, 10) || 0) }))} className="input w-full text-2xs py-1 mt-0.5" />
                            </label>
                          ))}
                        </div>
                        {(() => {
                          const sum = splitAmts.cash + splitAmts.card + splitAmts.transfer;
                          const due = splitDue(wantSeq(r)); // '승인해서 들어갈 게임'의 받을 금액(단가 − 할인)
                          // ⚠ 대상이 다른 게임이면 그 게임의 할인을 화면이 모른다. 모르는 기준으로 막으면
                          //   사이드 게임 할인 요청은 **어떤 숫자를 넣어도 승인이 불가능**해진다 — 그때는 막지 않는다.
                          const mismatch = wantSeq(r) === gameSeq && due > 0 && sum !== due;
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className="flex-1 text-2xs">
                                <span className="text-ink-secondary">합계 </span><b className={['tabular-nums', mismatch ? 'text-danger-light' : 'text-ink-primary'].join(' ')}>{sum.toLocaleString()}</b><span className="text-ink-secondary">원</span>
                                {mismatch && <span className="text-danger-light"> · 받을 금액 {due.toLocaleString()}원과 다름</span>}
                              </span>
                              <button type="button" onClick={() => setSplitFor(null)} className="rounded-input border border-border-default px-2.5 py-1 text-2xs font-bold text-ink-secondary">취소</button>
                              <button type="button" disabled={sum <= 0 || mismatch} onClick={() => approveReq(r, true, 'cash', splitAmts)} className="rounded-input bg-emerald-500/90 px-3 py-1 text-2xs font-bold text-ink-inverse hover:bg-emerald-500 disabled:opacity-40">확정</button>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}
                {rejectFor === r.id && (
                  <div className="mt-1.5 flex items-center gap-1.5 border-t border-border-subtle pt-1.5">
                    <span className="shrink-0 text-2xs text-ink-muted">거절 사유</span>
                    {['마감', '중복', '정보부족'].map((rs) => (
                      <button key={rs} type="button" onClick={() => doReject(r, rs)} className="flex-1 inline-flex h-9 items-center justify-center rounded-input border border-border-default px-2 text-2xs font-bold text-ink-secondary hover:text-danger-light hover:border-danger/40">{rs}</button>
                    ))}
                    <button type="button" onClick={() => { const v = window.prompt('거절 사유 직접 입력'); if (v !== null) doReject(r, v.trim() || undefined); }} className="flex-1 inline-flex h-9 items-center justify-center rounded-input border border-border-default px-2 text-2xs font-bold text-ink-secondary hover:text-ink-primary">직접</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 클락 리모컨 — 이 장부에 연결된 클락을 장부에서 바로 제어(레벨± · 일시정지/재개) */}
      {clockLinked && clock && !closed && (
        <ClockRemoteBar clock={clock} onPatch={patchClock} onReload={reloadClock} active={active} onOpenClock={onOpenClock ? () => onOpenClock(date, gameSeq) : undefined} />
      )}

      {closed && (
        <div className="rounded-card border border-accent-400/40 bg-accent-300/10 p-2.5 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-accent-300">마감됨 (읽기전용){session.closedAt ? ` · ${hhmm(session.closedAt)}` : ''}</span>
            {session.closeMemo && <span className="text-2xs text-ink-secondary truncate">메모: {session.closeMemo}</span>}
            <span className="flex-1" />
            {canManage && <button type="button" onClick={handleReopen} className="btn-ghost text-2xs px-2.5 py-1">마감 해제</button>}
          </div>
          {/* 마감 요약 — 토스트 2.4초로 스치던 핵심 수치를 그 자리에 상시(인원차는 정산 누수 경보) */}
          <p className="text-2xs tabular-nums text-ink-secondary">
            {/* 이 숫자가 무엇을 뺀 결과인지 밝힌다 — 제외는 저장되지 않는 임시 필터라, 화면을 새로 열면
                같은 마감 메모('정산 제외: 관계자') 옆에 제외 전 숫자가 선다. 조건은 마감 모달의 제외 배너와 같다. */}
            {stats.removed.count > 0 ? <span className="text-danger-light">제외 적용 · </span>
              : session.closeMemo?.includes('정산 제외') ? <span className="text-ink-muted">제외 전 전체 기록 · </span> : null}
            바인 <b className="text-ink-primary">{stats.totalBuyins}</b> · 매출 <b className="text-ink-primary">{wonToMan(stats.revenue + stats.addon.revenue)}만</b>
            {stats.addon.count > 0 ? <> · 애드온 <b className="text-ink-primary">{stats.addon.count}</b></> : null}
            {stats.unpaid + stats.addon.unpaid > 0 ? <> · 미수 <b className="text-danger-light">{wonToMan(stats.unpaid + stats.addon.unpaid)}만</b></> : ' · 미수 없음'}
            {session.clockSnapshot && (() => {
              const lp = new Set(buyins.map((b) => b.playerName)).size;
              const d = (session.clockSnapshot.entries ?? 0) - lp;
              return d !== 0
                ? <b className="text-danger-light"> · <Icon name="alert" size={12} className="inline-block align-[-1px] shrink-0" /> 클락 {session.clockSnapshot.entries}명 vs 장부 {lp}명({d > 0 ? '+' : ''}{d})</b>
                : <span className="text-emerald-400"> · 클락 대조 일치 ✓</span>;
            })()}
          </p>
        </div>
      )}

      {/* PL3: 마감 직후 프리셋 저장 유도 한 줄 — 이 회차(장부+클락 설정+포스터)가 authoring 재료 */}
      {closed && canManage && (
        <div className="flex items-center gap-2 rounded-aura border card-aura px-3 py-2">
          <Icon name="copy" size={15} className="shrink-0 text-accent-300" />
          <p className="min-w-0 flex-1 truncate text-2xs text-ink-secondary">
            {roundPresetState === 'done'
              ? <>프리셋으로 저장됐어요. 다음엔<b className="text-ink-primary">1탭</b>으로 그대로 열 수 있어요.</>
              : <>이 게임을 <b className="text-ink-primary">프리셋으로 저장</b> — 다음엔 한 번에 채워요</>}
          </p>
          {roundPresetState === 'done'
            ? <span className="shrink-0 text-2xs font-bold text-emerald-400">저장됨 ✓</span>
            : <button type="button" onClick={saveRoundPreset} disabled={roundPresetState === 'busy'}
                className="btn-ghost shrink-0 px-2.5 py-1 text-2xs text-accent-300 disabled:opacity-50">
                {roundPresetState === 'busy' ? '저장 중…' : '프리셋으로 저장'}
              </button>}
        </div>
      )}

      {/* 마감 직후 다음 단계 — 순위 입력(참가자 명단 프리필) → 주간 리포트. 마감→정산 동선을 클릭 1번으로 */}
      {closed && (onMakeRankingDraft || onOpenStats) && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-aura border card-aura p-2">
          <span className="px-1 text-2xs font-bold text-ink-muted">다음 단계</span>
          {onMakeRankingDraft && (
            <button type="button"
              onClick={() => {
                const rosterNames = players.map((p) => p.name);
                const extra = [...new Set(buyins.map((b) => b.playerName))].filter((n) => !rosterNames.includes(n));
                // 명단이 없어도 (날짜, 게임)은 맞춰 이동 — 사이드는 제목이 비어도 '사이드N' 으로 그 게임에 착지한다
                onMakeRankingDraft(date, [...rosterNames, ...extra], rankingEventOf({ gameSeq, title: session.title }));
              }}
              className={hasRank === false
                ? 'btn-primary px-3 py-1.5 text-xs'
                : 'btn-ghost px-3 py-1.5 text-xs text-accent-300'}>
              <Icon name="trophy" size={14} className="inline-block align-[-2px] mr-1 shrink-0" />순위 입력하기{hasRank === false ? ' (미입력)' : hasRank ? ' · 입력됨 ✓' : ''}
            </button>
          )}
          {onOpenStats && (
            <button type="button" onClick={onOpenStats} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"><Icon name="chart" size={14} className="shrink-0" />주간 리포트 보기</button>
          )}
        </div>
      )}

      {/* 1d 모바일 요약 — 게임 합계 + 손님별 한 줄. 손님 줄을 누르면 그 손님만 걸러 편집 화면으로. */}
      {!isMdUpLedger && !mobileEdit && (
        <section data-ledger-summary="" aria-label="이 게임 장부 요약" className="space-y-2">
          {/* 2b — 요약은 **지금 게임 하나**다. 정산 판(마감 정산)은 그날 전 게임을 합친다(데일리 펍이면 늘 다르다). */}
          <p data-sum="scope" className="text-2xs text-ink-muted">
            이 게임 · {gLabel(gameSeq)}
            {stats.removed.count > 0 && <span className="text-danger-light"> · 제외 적용</span>}
          </p>
          <div className="flex items-center gap-2 rounded-aura border card-aura px-3 py-2">
            <dl className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
              <div><dt className="text-2xs text-ink-muted">{exKeys.size > 0 ? '바인(제외 적용)' : '바인'}</dt><dd data-sum="buyins" className="text-sm font-bold tabular-nums text-ink-primary">{stats.totalBuyins.toLocaleString()}회</dd></div>
              <div><dt className="text-2xs text-ink-muted">완납 매출</dt><dd data-sum="revenue" className="text-sm font-bold tabular-nums text-emerald-400">{wonToMan(stats.revenue + stats.addon.revenue)}만</dd></div>
              <div><dt className="text-2xs text-ink-muted">미수</dt><dd data-sum="unpaid" className={['text-sm font-bold tabular-nums', stats.unpaid + stats.addon.unpaid > 0 ? 'text-danger-light' : 'text-ink-primary'].join(' ')}>{wonToMan(stats.unpaid + stats.addon.unpaid)}만</dd></div>
            </dl>
            {/* 3d — 마감 장부도 표(엔트리별 결제수단·얼리·할인·방문 유형·비고)를 볼 수 있어야 한다. 같은 표를 띄우되
                closed 라 표 쪽이 이미 읽기 전용이다(상태 변경 없음). 마감 해제를 우회로로 쓰게 하지 않는다. */}
            {closed ? (
              <button type="button" data-testid="ledger-table-view" onClick={() => setMobileEdit(true)}
                className="btn-ghost btn-sm tap-y-44 shrink-0 px-3">표 보기</button>
            ) : (
              <button type="button" data-testid="ledger-edit-mode" onClick={() => setMobileEdit(true)}
                className="btn-primary btn-sm tap-y-44 shrink-0 px-3">편집</button>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-muted">아직 손님이 없습니다{closed ? '' : ' — 편집에서 추가하세요'}.</p>
          ) : (
            <ul className="divide-y divide-border-subtle rounded-card border border-border-default bg-surface-low">
              {rows.map((r) => {
                const tot = summaryRows.get(r.name) ?? { count: 0, unpaid: 0, value: 0 };
                return (
                  <li key={r.name}>
                    <button type="button" data-sum-row={r.name} onClick={() => { setQuery(r.name); setMobileEdit(true); }}
                      className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-primary" title={r.name}>{r.name}</span>
                      <span className="shrink-0 text-2xs tabular-nums text-ink-secondary">바인 {tot.count}회</span>
                      <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-ink-primary">{wonToMan(tot.value)}만</span>
                      <span className={['w-14 shrink-0 text-right text-2xs tabular-nums', tot.unpaid > 0 ? 'font-bold text-danger-light' : 'text-ink-muted'].join(' ')}>
                        {tot.unpaid > 0 ? `미수 ${wonToMan(tot.unpaid)}만` : '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {!isMdUpLedger && mobileEdit && (
        <button type="button" data-testid="ledger-summary-mode" onClick={() => { setMobileEdit(false); setQuery(''); }}
          className="btn-ghost btn-sm tap-y-44 inline-flex items-center gap-1 px-3 text-xs font-bold">
          <Icon name="chevron-left" size={13} className="shrink-0" />요약 보기
        </button>
      )}
      {/* 마감 장부엔 검색칸이 없다 — 손님 줄로 걸렀으면 무엇을 걸렀는지와 푸는 길을 밝힌다. */}
      {!isMdUpLedger && mobileEdit && closed && query && (
        <p data-testid="ledger-readonly-filter" className="flex items-center gap-2 text-xs text-ink-secondary">
          <span className="min-w-0 truncate">‘{query}’ 만 보는 중 · 읽기 전용</span>
          <button type="button" onClick={() => setQuery('')} className="btn-ghost btn-sm tap-y-44 shrink-0 px-2 text-xs">전체</button>
        </p>
      )}
      {(isMdUpLedger || mobileEdit) && (<>
      {/* 검색 + 유저 추가 */}
      {!closed && (
        <div className="space-y-1.5">
          {/* #6(2026-09-25, 390 실측) — 한 줄에 검색·정렬 3칸·[+ 유저 추가]를 욱여넣어 검색칸 글자 공간이 37px('플레이' 만 보임)였다.
              sm 미만은 검색이 첫 줄을 통째로 쓰고 정렬·추가가 다음 줄로 간다. sm 이상은 종전 한 줄 그대로. */}
          <div className="flex flex-wrap gap-1.5 sm:flex-nowrap">
            <div className="relative min-w-0 flex-1 max-sm:basis-full">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="플레이어 검색"
                className="input w-full text-sm pl-8" />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="9" cy="9" r="6" /><line x1="14" y1="14" x2="18" y2="18" strokeLinecap="round" />
              </svg>
            </div>
            {/* 바인 할인 기본값 — 2026-10-02 감사 L-5: 칩 6개 상자(모바일 203px·PC 82px)를 선택 하나로 접어 검색 줄에 올렸다.
                값·의미는 그대로다(null=자동(클락 레벨) · 0=할인 없음 · 1~5=그 프리셋 고정, 비운 자리는 자리번호 유지). 결제창·QR 승인이 이 값을 기본으로 받는다.
                긴 안내는 ⓘ 로 펼친다(지우지 않는다). 프리셋이 하나도 없으면 그리지 않는다(빈 크롬 금지). */}
            {session.discounts.some((d) => d.amount > 0) && (() => {
              const autoIdx = autoDiscountIndex(session.discounts, clockLevelNow());
              return (
                <div data-ledger-disc="" className="flex shrink-0 items-center gap-1 max-sm:basis-full">
                  <label htmlFor="ledger-disc-pick" className="shrink-0 text-2xs font-bold text-ink-muted">바인 할인</label>
                  <select id="ledger-disc-pick" value={discPick === null ? 'auto' : String(discPick)}
                    onChange={(e) => setDiscPick(e.target.value === 'auto' ? null : Number(e.target.value))}
                    data-ledger-discsel="" className={['input h-10 min-w-0 py-0 text-xs font-bold', discPick === null ? '' : 'text-accent-300'].join(' ')}>
                    <option value="auto">자동{autoIdx > 0 ? ` · ${session.discounts[autoIdx - 1]?.label || `할인${autoIdx}`}` : ''}</option>
                    <option value="0">할인 없음</option>
                    {session.discounts.map((d, i) => (d.amount <= 0 ? null : (
                      <option key={i} value={String(i + 1)}>{d.label || `할인${i + 1}`} −{wonToMan(d.amount)}만</option>
                    )))}
                  </select>
                  <button type="button" onClick={() => setDiscHelp((v) => !v)} aria-expanded={discHelp} aria-controls="ledger-disc-help"
                    aria-label={discHelp ? '할인 안내 접기' : '할인 안내 펼치기'}
                    className="flex h-10 w-8 shrink-0 items-center justify-center text-ink-muted hover:text-ink-secondary">
                    <Icon name="info" size={15} />
                  </button>
                </div>
              );
            })()}
            {/* 정렬 — 100명+ 명단 빨리 찾기: 등록순/이름순/바인순 */}
            <SegmentedTabs className="shrink-0"
              items={[{ key: 'recent', label: '등록순' }, { key: 'name', label: '가나다' }, { key: 'bins', label: '바인순' }]}
              value={sortBy} onChange={setSortBy} />
            {regClosed
              ? <span className="shrink-0 self-center text-2xs font-bold text-danger-light px-2">레지 마감</span>
              : <button type="button" onClick={() => { if (!addOpen && query.trim()) setNewName(query.trim()); setAddOpen((v) => !v); }} className="btn-primary text-xs px-3 shrink-0 max-sm:ml-auto">+ 유저 추가</button>}
          </div>

          {discHelp && session.discounts.some((d) => d.amount > 0) && (
            <p id="ledger-disc-help" className="break-keep text-2xs leading-tight text-ink-muted">
              {discPick === null
                ? '클락 레벨에 맞춰 자동으로 골라 줍니다. 결제창에서 건별로 바꿀 수 있어요.'
                : '새 바인·QR 승인의 기본값입니다. 결제창에서 건별로 바꿀 수 있어요.'}
            </p>
          )}
          <Fold open={addOpen && !regClosed}>
            <div className="rounded-input border border-border-default bg-surface-low p-2 space-y-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; /* 한글 조합 확정 Enter 로 이름이 두 번 들어가던 문제 */ if (e.key === 'Enter') { e.preventDefault(); addPlayer(); } }}
                placeholder="닉네임/이름 (입력 시 가입자 자동완성)" maxLength={20} className="input w-full text-sm" autoFocus />
              {(suggest.length > 0 || newName.trim()) && (
                <ul className="max-h-52 space-y-1 overflow-y-auto rounded-input border border-accent-400/30 bg-surface-base/60 p-1">
                  {newName.trim() && (
                    <li>
                      <button type="button" onClick={addPlayer} className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left hover:bg-surface-high">
                        <span className="shrink-0 rounded-badge border border-border-default bg-surface-float px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">비회원</span>
                        <span className="min-w-0 truncate text-xs font-semibold text-ink-primary">‘{newName.trim()}’ 입력값 그대로 등록</span>
                      </button>
                    </li>
                  )}
                  {suggest.map((rp) => (
                    <li key={rp.userId}>
                      <button type="button" onClick={() => pickRegistered(rp)} className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left hover:bg-surface-high">
                        <span className="shrink-0 rounded-badge border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">✓회원</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-primary">{rp.realName ? `${rp.realName}(${rp.nickname ?? '-'})` : (rp.nickname ?? '-')}</span>{rp.phoneMasked ? <span data-testid="cand-phone" className="shrink-0 text-2xs tabular-nums text-ink-muted">{rp.phoneMasked}</span> : null}
                        <span className="shrink-0 text-2xs text-ink-muted">{rp.visits > 0 ? `방문 ${rp.visits}회` : '첫 방문'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-2xs text-ink-muted">유형(선택):</span>
                {VISITOR_OPTS.map((t) => (
                  <button key={t.code} type="button" onClick={() => setNewType((cur) => (cur === t.code ? null : t.code))}
                    className={['tap-y-44 text-2xs font-bold px-2 py-1.5 min-h-8 rounded-badge border transition-colors',
                      newType === t.code ? 'bg-accent-300/15 text-accent-300 border-accent-400/40' : 'bg-surface-float text-ink-secondary border-border-default'].join(' ')}>
                    {t.label}
                  </button>
                ))}
                <button type="button"
                  onClick={() => { const v = window.prompt('유형 직접입력'); if (v && v.trim()) setNewType(v.trim()); }}
                  className={['tap-y-44 text-2xs font-bold px-2 py-1.5 min-h-8 rounded-badge border transition-colors',
                    newType && !VISITOR_OPTS.some((o) => o.code === newType) ? 'bg-accent-300/15 text-accent-300 border-accent-400/40' : 'bg-surface-float text-ink-secondary border-border-default'].join(' ')}>
                  {newType && !VISITOR_OPTS.some((o) => o.code === newType) ? newType : '직접입력'}
                </button>
                <span className="flex-1" />
                <button type="button" onClick={addPlayer} disabled={!newName.trim()} className="btn-primary text-xs px-4 disabled:opacity-50">추가</button>
              </div>
            </div>
          </Fold>
        </div>
      )}

      {/* 표 보드 */}
      {rows.length === 0 ? (
        <div className="py-10 text-center space-y-2">
          <p className="text-xs text-ink-muted">{query ? '검색 결과가 없습니다.' : '유저를 추가하면 바인을 입력할 수 있습니다.'}</p>
          {/* 검색으로 '없음'을 확인한 이름을 다시 타이핑하지 않게 — 그대로 추가 폼으로 */}
          {query.trim() && !closed && !regClosed && (
            <button type="button" onClick={() => { setNewName(query.trim()); setAddOpen(true); }}
              className="btn-primary px-3 py-1.5 text-xs">'{query.trim()}' 바로 추가</button>
          )}
        </div>
      ) : (
        <div
          // 휠 = 순수 세로 스크롤(가로 변환 제거 — 대각선 이동 방지). PC는 10바인 한 화면이라 가로 휠 불필요.
          // overscroll-contain 금지: 표에 스크롤할 내용이 없을 때 표 위에서 페이지 스크롤까지 막아버린다.
          // 표 안 스크롤이 끝나면 페이지로 이어지는 건 브라우저 표준 동작으로 둔다.
          // isolate: 표 안의 sticky z-index 를 **표 안에 가둔다**.
          //   머리행 모서리 셀은 행 sticky·열 sticky 를 둘 다 이기려고 z-40 인데, overflow:auto 는
          //   스크롤 컨테이너를 만들 뿐 **쌓임 맥락을 만들지 않는다**. 그래서 그 40 이 페이지 최상위에서
          //   정산바(fixed z-30)와 직접 겨뤄, 표가 바 높이를 지날 때 'No·플레이어·총바인·미수'만
          //   바를 뚫고 앞으로 나왔다(오너 2026-09-08 "배경 무시하고 맨 앞으로"). 1바인~비고는 z-30 이라
          //   DOM 후순위인 바에 덮여 멀쩡했다 — 오너가 짚은 네 칸이 정확히 z-40 인 칸들이다.
          //   isolation 은 z-index 를 하나도 안 건드리고 표 안의 상대 순서를 그대로 보존한다.
          //   실측(격리 유무 대조, elementFromPoint): 없음 → TH 가 위 / isolate → 정산바가 위.
          // D7(2026-09-29 design-reviewer) — 고정 열(No 38px + 플레이어 ≤153px, 모바일 ≤119px) 폭만큼 scroll-padding 을 줘
          //   키보드 포커스(Shift+Tab)로 끌려온 바인 칸이 고정 열 밑에 가려지지 않게 한다. sm 이상은 오른쪽 총바인·미수도 고정이다.
          // F-1(2026-10-02) — PC(lg+)는 상자 높이를 '헤더(--stack-top) 밑 ~ 정산 바(--footer-reserve, 바 높이+12) 위' 칸에 맞춘다.
          //   70vh 는 상자가 화면 아래쪽(1440: top 576)에서 시작해도 630px 라 절반이 화면 밖·바 밑이었다. 모바일은 종전 70vh.
          //   휠·키보드는 상자가 그 칸에 다 들어온 뒤에만 표를 굴린다(boardRef·revealBoardRow → pageFirstDelta).
          ref={boardRef}
          onFocusCapture={(e) => { revealPastSticky(e.currentTarget, e.target as HTMLElement); revealBoardRow(e.currentTarget, e.target as HTMLElement); }}
          className="isolate overflow-auto max-h-[70vh] lg:max-h-[calc(100svh-var(--stack-top,6.0625rem)-var(--footer-reserve,0px))] scroll-pl-[192px] max-sm:scroll-pl-[158px] sm:scroll-pr-[152px] [-webkit-overflow-scrolling:touch] rounded-card border border-border-default bg-surface-low [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5"
        >
          {/* w-max: 칸을 압축하지 않고 고정폭 유지 → 모바일에서 가로 스크롤. min-w-full: 데스크톱은 꽉 채움 */}
          <table className="border-separate border-spacing-0 text-center w-max min-w-full">
            <thead>
              {/* 헤더는 세로 스크롤에도 고정(sticky top) — 100명 명단에서도 바인 번호가 항상 보임 */}
              <tr className="bg-surface-high">
                <th className="sticky left-0 top-0 z-40 bg-surface-high w-9 px-1 py-2 text-xs text-ink-muted border-b border-border-default">No</th>
                <th className="sticky left-9 top-0 z-40 bg-surface-high min-w-24 max-w-36 max-sm:max-w-28 px-2 py-2 text-xs text-ink-muted border-b border-l border-r border-border-default border-r-border-strong text-left shadow-[8px_0_8px_-8px_rgba(0,0,0,0.55)]">플레이어</th>
                {Array.from({ length: binCols }, (_, i) => (
                  <th key={i} className="sticky top-0 z-30 bg-surface-high w-12 px-0.5 py-2 text-xs text-ink-muted border-b border-l border-border-default">{i + 1}바인</th>
                ))}
                <th data-ledger-note="" className="sticky top-0 z-30 bg-surface-high min-w-16 max-w-40 px-2 py-2 text-xs text-ink-muted border-b border-l border-border-default text-left">비고</th>
                {/* #6(2026-09-25, 390 실측) — 왼쪽 No·플레이어(≈150px) + 오른쪽 총바인·미수(2×68px)가 모두 붙박이라 바인 칸이 **반 칸**(≈30px)만 보였다.
                    sm 미만은 오른쪽 두 열을 가로로 함께 흐르게 둔다(머리행의 세로 고정 top-0 은 유지). sm 이상은 종전 그대로. */}
                <th className="sticky right-16 top-0 z-40 bg-surface-high w-16 min-w-16 whitespace-nowrap px-1 py-2 text-xs text-ink-muted border-b border-l border-border-default border-l-border-strong shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.55)] max-sm:right-auto max-sm:shadow-none">총바인</th>
                <th className="sticky right-0 top-0 z-40 bg-surface-high w-16 min-w-16 max-w-16 px-1 py-2 text-xs text-ink-muted border-b border-l border-border-default max-sm:right-auto">미수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const cnt = countOf(r.name);
                const mx = maxEntryOf(r.name);
                const tot = playerTotals(r.name);
                const rowChunks = Math.min(10, Math.max(1, Math.ceil((mx + 1) / 10)));
                return Array.from({ length: rowChunks }, (_, chunk) => {
                  const first = chunk === 0;
                  return (
                    <tr key={`${r.name}-${chunk}`}>
                      <td className="sticky left-0 z-10 bg-surface-low w-9 px-1 py-1 text-2xs text-ink-muted border-b border-border-default tabular-nums">{first ? ri + 1 : <span className="opacity-40">↳</span>}</td>
                      <td className="sticky left-9 z-10 bg-surface-low min-w-24 max-w-36 max-sm:max-w-28 px-2 py-1 border-b border-l border-r border-border-default border-r-border-strong text-left shadow-[8px_0_8px_-8px_rgba(0,0,0,0.55)]">
                        {first ? (
                          <button type="button" disabled={!r.player || closed} onClick={() => r.player && setEditPlayer(r.player)} className="w-full text-left disabled:cursor-default">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold text-ink-primary truncate" title={r.name}>{r.name}</span>
                              <span className="text-[10px] text-ink-muted shrink-0">{cnt}회</span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {r.player?.visitorType
                                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-badge bg-accent-300/15 text-accent-300 border border-accent-400/40">{visitorLabel(r.player.visitorType)}</span>
                                : r.player ? <span className="text-[10px] text-ink-muted">{closed ? '' : '유형/비고 +'}</span> : <span className="text-[10px] text-ink-muted">—</span>}
                              {/* D7(2026-09-29) — 390 에선 고정 열이 보이는 폭의 절반을 먹는다. 비고 전문은 비고 칸에 있으니 모바일에선 미리보기를 뺀다. */}
                              {r.player?.note && <span className="text-[10px] text-ink-secondary truncate max-w-16 max-sm:hidden">· {r.player.note}</span>}
                            </div>
                          </button>
                        ) : <span className="block text-2xs text-ink-muted/50 truncate" title={r.name}>{r.name}</span>}
                      </td>

                      {Array.from({ length: binCols }, (_, i) => {
                        const e = chunk * 10 + i + 1;
                        const c = cellAt(r.name, e);
                        const cls = 'w-12 h-12 px-0.5 py-0.5 border-b border-l border-border-default align-middle';
                        if (e > 100) return <td key={e} className={cls} />;
                        if (c) {
                          const tone = c.paymentMethod === 'support'
                            ? 'border-indigo-400/50 bg-indigo-500/10 text-indigo-300'
                            : c.isUnpaid ? 'border-danger bg-danger/10 text-danger-light'
                            : (c.isSplit || c.discountIndex > 0) ? 'border-accent-400/50 bg-accent-300/10 text-accent-200'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
                          const topLabel = c.isSplit ? '분납' : `${METHOD_SHORT[c.paymentMethod]}${c.isUnpaid ? '·미' : ''}`;
                          const et = earlyTypeOf(c, session);
                          // 오너 예시 셀(더블얼리 + 5만 할인)은 **둘 다** 말해야 한다.
                          //   예전엔 `얼리 : 할인 : 시각` 3항 배타라 얼리가 이기고 할인이 영영 안 보였다.
                          //   셀 높이가 h-12 라 둘째 줄 하나에 ' · ' 로 합쳐 쓴다. 셋 다 없으면 시각.
                          const fin = buyinFinance(c, session);
                          const sub = [
                            et !== 'none' ? (et === 'double' ? '더블얼리' : '얼리') : null,
                            fin.disc > 0 ? `−${wonToMan(fin.disc)}만` : null,
                          ].filter(Boolean).join(' · ');
                          return (
                            <td key={e} className={cls}>
                              <button type="button" disabled={closed}
                                onClick={() => !closed && setSelected({ playerName: r.name, entryNo: e, buyin: c })}
                                className={['w-full h-full rounded-input border-2 flex flex-col items-center justify-center leading-none', tone, closed ? 'cursor-default' : 'cell-hover'].join(' ')}>
                                <span className="text-[11px] font-extrabold">{topLabel}{c.discountIndex > 0 ? '*' : ''}</span>
                                {sub
                                  // #13(2026-09-25) — '더블얼리 · −23.46만' 처럼 두 줄로 접히면 leading-none(1.0)이라 줄끼리 맞닿았다 → 1.15.
                                  ? <span className={['text-[10px] font-bold leading-[1.15] mt-0.5', et !== 'none' ? 'text-amber-300' : 'text-accent-200'].join(' ')}>{sub}</span>
                                  : <span className="text-[10px] mt-0.5">{hhmm(c.buyinAt)}</span>}
                              </button>
                            </td>
                          );
                        }
                        if (!closed && e <= mx + 1 && e <= 100) {
                          return (
                            <td key={e} className={cls}>
                              <button type="button" onClick={() => setSelected({ playerName: r.name, entryNo: e, buyin: null })}
                                className="w-full h-full rounded-input border-2 border-dashed border-border-default text-ink-muted hover:border-accent-400 hover:text-accent-300 transition-colors flex items-center justify-center text-base font-bold">+</button>
                            </td>
                          );
                        }
                        return <td key={e} className={cls}><div className="w-full h-full rounded-input bg-surface-base/30" /></td>;
                      })}

                      <td data-ledger-note="" className="min-w-16 max-w-40 px-1 py-1 border-b border-l border-border-default text-left">
                        {/* 2026-09-25 감사: '비고 +' 버튼이 160×15.9 — 행(h-12 ≈ 51px) 안에서 44px 히트 영역을 준다(행 높이는 그대로). */}
                        {first && r.player ? (
                          <button type="button" disabled={closed} onClick={() => setEditPlayer(r.player as LedgerPlayer)} className="flex min-h-[44px] w-full items-center text-left text-2xs disabled:cursor-default">
                            {r.player.note
                              ? <span className="text-ink-secondary line-clamp-2 whitespace-pre-wrap wrap-break-word">{r.player.note}</span>
                              : <span className="text-accent-200 font-semibold">{closed ? '—' : '비고 +'}</span>}
                          </button>
                        ) : first ? <span className="text-2xs text-ink-muted">—</span> : null}
                      </td>
                      {/* D5 후속(2026-09-29 CI) — 폭 상한(68px 고정)을 뺐다. 금액은 줄바꿈하지 않으니 글꼴이 넓으면(리눅스 폴백 실측 +3.4px)
                          고정 폭을 넘어 옆 '미수' 칸을 덮었다. 이제 폭 68px(w-16)을 기본으로 두되 상한이 없어, 더 긴 금액이면 그만큼만 넓어진다. 오른쪽 고정 오프셋(right-16)은 미수 칸 폭이라 그대로다. */}
                      <td className="sticky right-16 z-10 bg-surface-low w-16 min-w-16 px-1 py-1 border-b border-l border-border-default border-l-border-strong text-2xs tabular-nums text-left shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.55)] max-sm:static max-sm:shadow-none">
                        {first && r.player ? (
                          // 리바인 원탭 — 다음 '+' 셀은 가로 스크롤 밖(6~9열)에 있기 일쑤. 항상 보이는
                          // sticky 셀에서 바로 다음 회차 결제 모달을 연다('직전과 동일'과 짝)
                          <button type="button" disabled={closed}
                            onClick={() => setSelected({ playerName: (r.player as LedgerPlayer).name, entryNo: maxEntryOf((r.player as LedgerPlayer).name) + 1, buyin: null })}
                            title="+1 바인 · 결제수단 선택"
                            className="tap-y-44 block w-full whitespace-nowrap rounded-input px-0.5 py-0.5 text-left leading-tight transition-colors hover:bg-accent-300/10 disabled:cursor-default disabled:hover:bg-transparent">
                            <b className="text-accent-200">{cnt}회{closed ? '' : ' +'}</b>
                            {/* 회수와 같은 정의로 — 티켓·지원도 단가만큼. paid+unpaid 로 두면
                                티켓 바인이 '1회 / 0만' 이 된다(오너 보고 2026-09-05). */}
                            <span className="block text-ink-secondary">{wonToMan(tot.value)}만</span>
                          </button>
                        ) : first ? (
                          <span className="leading-tight block whitespace-nowrap text-left">
                            <b className="text-accent-200">{cnt}회</b>
                            <span className="block text-ink-secondary">{wonToMan(tot.value)}만</span>
                          </span>
                        ) : ''}
                      </td>
                      {/* D5 후속 — 미수 칸은 폭 상한(68px)을 **유지**한다. 왼쪽 총바인 칸의 고정 오프셋 right-16 이 곧 이 칸의 폭이라,
                          이 칸이 넓어지면 총바인이 미수를 덮는다. 대신 금액을 줄바꿈 허용 + 어디서든 끊기(overflow-wrap:anywhere)로 칸 안에 가둔다
                          (8,888.89만: Verdana·Courier 강제에서도 두 줄·칸 안 — nowrap 을 넣으면 넘친다, e2e store-0929-fixes 미수 칸). */}
                      <td className="sticky right-0 z-10 bg-surface-low w-16 min-w-16 max-w-16 [overflow-wrap:anywhere] px-1 py-1 border-b border-l border-border-default text-2xs tabular-nums text-left text-danger-light max-sm:static">{first && tot.unpaid > 0 ? `${wonToMan(tot.unpaid)}만` : ''}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}
      </>)}

      {/* 정산 바 (고정) */}
      {/* 정산바 오프셋 = --tabbar-safe − 0.75rem (탭바에 딱 붙이는 의도적 파생값, TB1a) */}
      {/* 좌우 경계를 변수로 뽑는다 — 기본값은 예전 그대로(0/0 · max-w-6xl)라 일반 화면은 변화 없다.
          전체화면(LedgerWorkspace)에서는 그 변수를 **장부 칸** 기준으로 덮어 바가 칸에 맞는다.
          예전엔 뷰포트 기준 1152px 중앙이라 전체화면에서 좌우가 어긋났다(오너 2026-09-08 "길이가 안맞아"). */}
      {/* S-04(2026-10-01) — `lg:pr-16`: PC 폭에서 바가 화면 오른쪽 끝 가까이 닿으면(1024·1280) '맨 위로' FAB(App.tsx `.scroll-top-fab`,
          lg:bottom-5 right-4 z-40, 42.5px)가 맨 아래 스크롤 때 '정산 마감' 버튼을 덮었다(버튼 면 21점 중 1024 11점 · 1280 4점이 FAB — '정' 한 글자만 보임).
          FAB 자리(right 17 + 폭 42.5 ≈ 59.5px)+여백만큼 오른쪽을 비운다. 아래 실행 버튼 바(`pr-12`)와 같은 처방 — FAB 는 App.tsx(공용)라 손대지 않는다. */}
      <div ref={settleBarRef} data-ledger-settlebar="" className="fixed bottom-[calc(var(--tabbar-safe)-0.75rem)] lg:bottom-0 left-(--ledger-bar-left,0px) right-(--ledger-bar-right,0px) z-30 mx-auto max-w-(--ledger-bar-max,72rem) bg-surface-mid border-t border-x border-border-default rounded-t-card lg:rounded-none lg:border-x-0 px-page-x lg:pr-16 py-2">
        {/* 정산 제외 — 오너 지시: "관계자·신규처럼 빼고 정산", "티켓·현금·카드도 뺄 수 있게".
            정산바 **안** 최상단에 둔다. 바는 bottom 고정이라 펼치면 위로 자라 숫자를 가리지 않는다. */}
        {/* 2026-10-02 감사 L-1 — PC(lg+)는 [정산 제외] 접힘 줄(33px)을 숫자 줄 왼쪽 칸으로 올리고, 펼친 내용만 숫자 위에 둔다(바 높이 회수).
            모바일은 종전 그대로(한 상자). 펼침 상태는 하나라 폭이 바뀌어도 이어진다. */}
        <SettleFilter part={isDesktopLedger ? 'panel' : 'all'} open={exOpen} setOpen={setExOpen}
          exKeys={exKeys} setExKeys={setExKeys} counts={exCounts}
          removed={stats.removed} players={players}
        />
        <div className="flex items-center gap-2">
          {isDesktopLedger && (
            <div className="w-40 shrink-0">
              <SettleFilter part="toggle" open={exOpen} setOpen={setExOpen}
                exKeys={exKeys} setExKeys={setExKeys} counts={exCounts}
                removed={stats.removed} players={players}
              />
            </div>
          )}
          {/* ⚠ 2026-09-14 실측(375): 4열이면 칸이 좁아 값이 숫자 중간에서 끊겼다("7,194 / .44만").
              가장 좁은 폭만 2×2 로 내린다 — sm 이상은 종전 4열 그대로(PC 렌더 불변). */}
          <div className={['grid grid-cols-2 gap-2 flex-1 text-center sm:grid-cols-4', !closed ? 'lg:grid-cols-5' : ''].join(' ')}>
            {/* 2026-09-11: 이 줄은 상시 떠 있는 기준선이다. 엔트리(금액 기준·소수)만 세워 두면
                '3명 앉았는데 2.5' 가 인원으로 오독된다 — 마감 모달·대시보드처럼 **횟수를 주로**,
                엔트리를 보조로 같이 적는다(오너 규칙: 바이인 횟수 ≠ 엔트리). */}
            <Metric label={exKeys.size > 0 ? '총 바인(제외 적용)' : '총 바인'}
              value={`${stats.totalBuyins.toLocaleString()}회`}
              sub={`엔트리 ${stats.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })}${!closed && !isDesktopLedger ? ` · 생존${aliveLive != null ? ` ${aliveLive}` : `≈${aliveEst}`}` : ''}`} />
            {/* P-02 — PC 는 위 요약 띠를 숨겨서 띠에만 있던 생존을 여기 둔다(마감 전만 — 띠와 같은 조건). */}
            {!closed && <div className="hidden lg:block">{aliveMetric}</div>}
            {/* 티켓은 '장'이 아니라 **돈**으로도 보인다 — 1장 = 단가. 정산 대차의 한 줄이다. */}
            {/* T = 차감된 이용권 장수(2026-10-01) — 원(아래 대차표 tender.ticket)과 다를 수 있다. 미수 티켓은 아래 줄이 따로 보여준다. */}
            {/* 3-B(2026-09-29) — 이용권 사용 T = 바인 + 애드온(ticketUsedT). stats.ticket 은 바인만이라 아래 대차표(tender.ticket)와 짝으로 둔다. */}
            <Metric label="티켓" value={`${ticketUsedT({ ticketPaid: stats.ticket }, stats.addon).toLocaleString(undefined, { maximumFractionDigits: 1 })}T`} />
            <Metric label="완납 매출" value={`${wonToMan(stats.revenue + stats.addon.revenue)}만`} tone="emerald" />
            <Metric label="미수금" value={`${wonToMan(stats.unpaid + stats.addon.unpaid)}만`} tone="danger" />
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            {!closed ? (
              <div className="flex gap-1">
                <button type="button" onClick={handleRegClose}
                  className={['text-2xs px-2 py-1 min-h-[2.4rem] rounded-input border font-semibold transition-colors',
                    regClosed ? 'border-danger/40 text-danger-light bg-danger/10' : 'border-border-default text-ink-secondary hover:text-ink-primary'].join(' ')}>
                  {regClosed ? '레지 열기' : '레지 마감'}
                </button>
                {/* P2(2026-09-14): 정산 마감은 **업주만** 가능하다 — 서버 트리거(_guard_ledger_session_update)가
                    closed 변경을 can_manage_pos 로만 허용한다. 예전엔 장부 권한 직원에게도 버튼이 보여
                    누르면 항상 '마감 상태 변경은 업주만 가능합니다' 오류였다(누를 수 있는 척하는 죽은 버튼).
                    레지 마감(regClose)은 직원도 되므로 그대로 둔다. 오너 결정: 권한을 넓히지 않고 화면을 서버에 맞춘다. */}
                {canManage && (
                  <button ref={settleBtnRef} type="button" onClick={() => setCloseOpen(true)} data-testid="ledger-settle"
                    className={`btn-primary text-2xs px-2 py-1${settleHot ? ' ring-2 ring-gold-300 ring-offset-2 ring-offset-surface-mid' : ''}`}>정산 마감</button>
                )}
              </div>
            ) : <span className="text-2xs text-accent-300 text-center font-bold px-3 py-1">마감됨</span>}
          </div>
        </div>
        {(stats.support > 0 || stats.ticketUnpaid > 0 || stats.discount.count > 0) && (
          <p className="text-2xs text-center mt-0.5">
            {/* '−N만'은 **덜 받은 현금**이다 → cashTotal. 깎아 준 총액은 마감 모달에서 따로 본다. */}
            {stats.discount.count > 0 && <span className="text-accent-300">할인 {stats.discount.count}건 · −{wonToMan(stats.discount.total)}만 · 현금 −{wonToMan(stats.discount.cashTotal)}만</span>}
            {stats.discount.count > 0 && (stats.ticketUnpaid > 0 || stats.support > 0) && <span className="text-ink-muted"> · </span>}
            {stats.ticketUnpaid > 0 && <span className="text-danger-light">티켓 미수 {stats.ticketUnpaid.toLocaleString(undefined, { maximumFractionDigits: 1 })}T</span>}
            {stats.ticketUnpaid > 0 && stats.support > 0 && <span className="text-ink-muted"> · </span>}
            {stats.support > 0 && <span className="text-indigo-300">가게지원 {stats.support}건</span>}
          </p>
        )}
      </div>

      {/* 2-Tap 결제 모달 */}
      {selected && (
        <PaymentModal
          cell={selected} hasPw={hasPw} canManage={canManage} session={session}
          reduceAsk={reduceAsk !== null}
          onReduceConfirm={(pw) => { void reduceAsk?.(pw); }}
          levelNo={clockLevelNow()}
          autoDiscIdx={defaultDiscIdx()}
          autoFromLevel={discPick === null}
          autoEarly={selected.entryNo === 1 ? clockEarlyNow() : 'none'}
          lastPick={(() => {
            // 신규 기록일 때만 — 그 손님의 직전 바인과 동일하게 원탭 반복(하룻밤 100+ 바인의 왕복 절감)
            if (selected.buyin) return null;
            const prev = buyins.filter((b) => b.playerName === selected.playerName && !b.isSplit && b.paymentMethod !== 'support')
              .sort((a, b) => (b.buyinAt || '').localeCompare(a.buyinAt || ''))[0];
            if (!prev) return null;
            const mLabel = ({ ticket: '티켓', cash: '현금', transfer: '이체', card: '카드', support: '가게지원' } as Record<string, string>)[prev.paymentMethod] ?? prev.paymentMethod;
            return { method: prev.paymentMethod, isUnpaid: prev.isUnpaid, discountIndex: prev.discountIndex,
              // #8(2026-09-27) — 할인은 화면 값(discIdx)을 따르므로 여기서 말하지 않는다('·할인 · 할인 없음' 모순)
              label: `${mLabel} ${prev.isUnpaid ? '미수' : '완납'}` };
          })()}
          onClose={() => { setSelected(null); setReduceAsk(null); }}
          busy={payBusy}
          onPick={async (method, isUnpaid, discountIndex) => {
            if (payBusy) return; // 더블탭 → 이중 기록·이용권 이중 적립 방지
            if (!sessionFitsBoard()) return;
            const pn = selected.playerName; const isNew = !selected.buyin;
            // 신규 첫 바인(entryNo=1)만 클락 현재 레벨로 얼리 확정. 2번째+는 리바인이라 얼리 없음.
            const eo = (isNew && selected.entryNo === 1) ? clockEarlyNow() : (selected.buyin?.earlyOverride ?? null);
            const before = selected.buyin;
            const save = (pw?: string) => upsertBuyin({ venueId, sessionDate: date, gameSeq, playerName: pn, entryNo: selected.entryNo, paymentMethod: method, isUnpaid, discountIndex, earlyOverride: eo, existingId: before?.id ?? null,
              snapshot: { buyinAmount: session.buyinAmount, cardAmount: session.cardAmount ?? null, discounts: session.discounts },
              reduce: before ? { before, session, password: pw } : undefined });
            setPayBusy(true);
            try {
              const savedId = await save();
              setSelected(null); reload();
              if (isNew) {
                // 오입력 즉시 복구 — 최빈 조작(바인 기록)에 90초 셀프 되돌리기(비번 불요, 서버 검증)
                toast.show(`${pn} 바인 기록됨`, 'success', { durationMs: 6000, action: { label: '되돌리기', onClick: () => {
                  cancelMyRecentBuyin(savedId).then(() => { toast.show('바인을 되돌렸습니다', 'info'); reload(); })
                    .catch((err) => toast.show(ledgerErrorText(err, '되돌리기 실패'), 'error'));
                } } });
              }
              // W2-2 VCH-1b: 바인 자동적립 중단(§12-A-3 — 문체부 '적립→입장료' 패턴 회피).
              // ⚠ voucherAccrualPerBin 필드·DB write 는 유지 — 지우면 세션 저장 경로가 전 매장 설정을 0 으로 덮는다(§18.4).
            } catch (e) {
              if (e instanceof Error && e.message === REDUCE_NEEDS_PW) await askReducePw(save);
              else if (e instanceof Error && e.message === CELL_TAKEN) { toast.show('다른 직원이 방금 이 칸을 입력했어요. 최신 내용으로 바꿨어요', 'info'); setSelected(null); reload(); }
              else if (noteServerAmountHint(e)) { /* 20260925f hint — 안내·재조회는 위에서 */ }
              else toast.show(ledgerErrorText(e, '저장 실패'), 'error');
            } finally { setPayBusy(false); }
          }}
          onPickSplit={async (d) => {
            if (payBusy) return;
            if (!sessionFitsBoard()) return;
            const pn = selected.playerName; const isNew = !selected.buyin;
            const before = selected.buyin;
            const save = (pw?: string) => upsertBuyinSplit({ venueId, sessionDate: date, gameSeq, playerName: pn, entryNo: selected.entryNo, ...d, earlyOverride: (isNew && selected.entryNo === 1) ? clockEarlyNow() : undefined, existingId: before?.id ?? null,
              reduce: before ? { before, session, password: pw } : undefined });
            setPayBusy(true);
            try {
              const savedId = await save();
              setSelected(null); reload();
              if (isNew) {
                toast.show(`${pn} 분납 바인 기록됨`, 'success', { durationMs: 6000, action: { label: '되돌리기', onClick: () => {
                  cancelMyRecentBuyin(savedId).then(() => { toast.show('바인을 되돌렸습니다', 'info'); reload(); })
                    .catch((err) => toast.show(ledgerErrorText(err, '되돌리기 실패'), 'error'));
                } } });
              }
              // W2-2 VCH-1b: 바인 자동적립 중단(§12-A-3 — 문체부 '적립→입장료' 패턴 회피).
              // ⚠ voucherAccrualPerBin 필드·DB write 는 유지 — 지우면 세션 저장 경로가 전 매장 설정을 0 으로 덮는다(§18.4).
            } catch (e) {
              if (e instanceof Error && e.message === REDUCE_NEEDS_PW) await askReducePw(save);
              else if (e instanceof Error && e.message === CELL_TAKEN) { toast.show('다른 직원이 방금 이 칸을 입력했어요. 최신 내용으로 바꿨어요', 'info'); setSelected(null); reload(); }
              else if (noteServerAmountHint(e)) { /* 20260925f hint — 안내·재조회는 위에서 */ }
              else toast.show(ledgerErrorText(e, '저장 실패'), 'error');
            } finally { setPayBusy(false); }
          }}
          onCancelBuyin={async (pw) => {
            // 🔴 D9(2026-09-25) — 확정 연타 가드. 예전엔 busy 가 없어 두 번째 탭이 이미 지운 행을 다시 지우려다 '권한/없음' 오류 토스트를 띄웠다.
            if (!selected.buyin || payBusy) return;
            setPayBusy(true);
            try { await cancelBuyin(selected.buyin.id, pw); toast.show('바인을 취소했습니다', 'info'); setSelected(null); reload(); }
            catch (e) { notePwFromError(e); toast.show(ledgerErrorText(e, '취소 실패'), 'error', { durationMs: 7000 }); }
            finally { setPayBusy(false); }
          }}
          onSetAddon={async (addon) => {
            if (!selected.buyin) return;
            setPayBusy(true);
            try {
              const amount = session.addonAmount ?? 0;
              await setBuyinAddon(selected.buyin.id, addon ? { ...addon, amount } : null);
              toast.show(addon ? '애드온을 기록했습니다' : '애드온을 지웠습니다', 'success');
              setSelected((cur) => cur && cur.buyin ? { ...cur, buyin: { ...cur.buyin,
                addonMethod: addon?.method ?? null, addonUnpaid: !!addon?.unpaid, addonAmount: addon ? amount : 0 } } : cur);
              reload();
            }
            catch (e) { toast.show(ledgerErrorText(e, '애드온 저장 실패'), 'error', { durationMs: 7000 }); }
            finally { setPayBusy(false); }
          }}
          onSetEarly={async (override) => {
            if (!selected.buyin) return;
            try {
              await setBuyinEarly(selected.buyin.id, override);
              toast.show('얼리 유형을 변경했습니다', 'success');
              // 모달 유지 — 얼리만 바꾸고 결제수단도 이어서 고치는 흐름이 잦다(닫으면 재탐색 왕복)
              setSelected((cur) => cur && cur.buyin ? { ...cur, buyin: { ...cur.buyin, earlyOverride: override } } : cur);
              reload();
            }
            catch (e) { toast.show(ledgerErrorText(e, '변경 실패'), 'error'); }
          }}
        />
      )}

      {/* 세션 정보 수정 */}
      {editOpen && (
        <Overlay onClose={() => setEditOpen(false)} title="세션 정보 수정">
          <SessionForm base={session} mode="edit" lockPricing={buyins.length > 0} operatorName={operatorName} schedules={venueSchedules} operatorOptions={operatorOptions} operatorOptionsError={operatorOptionsError} onRetryOperatorOptions={reloadAccessIds} operatorOptionsPartial={!fullAccess} scheduledDealers={scheduledNames} dealerOptions={dealerOptions} onSubmit={handleEditSave} onCancel={() => setEditOpen(false)} embedded />
        </Overlay>
      )}

      {/* 장부 마감 */}
      {closeOpen && (
        <CloseModal
          stats={stats}
          unpaidPlayers={rows.map((r) => ({ name: r.name, unpaid: playerTotals(r.name).unpaid })).filter((x) => x.unpaid > 0).sort((a, b) => b.unpaid - a.unpaid)}
          exNote={exNote}
          onClose={() => setCloseOpen(false)}
          onConfirm={handleClose}
        />
      )}

      {/* 플레이어 편집(유형/비고/삭제) */}
      {editPlayer && (
        <PlayerEditModal
          player={editPlayer}
          recordCount={countOf(editPlayer.name)}
          hasPw={hasPw}
          canManage={canManage}
          onClose={() => setEditPlayer(null)}
          onSave={async (patch) => { if (await savePlayer(editPlayer.id, patch)) setEditPlayer(null); }}
          onDelete={(pw) => removePlayer(editPlayer, pw)}
        />
      )}
    </div>
  );
}

// ── 클락 리모컨 바 — 장부 화면에서 레벨±·일시정지/재개. 클락 화면이 닫혀 있어도 제어 가능 ──
// (저장 → clock_states upsert → 열려 있는 클락/라이브 보드는 realtime 구독으로 즉시 반영)
function ClockRemoteBar({ clock, onPatch, onReload, onOpenClock, active = true }: {
  clock: ClockState; onPatch: (p: Partial<ClockState>) => void; onReload: () => void; onOpenClock?: () => void; active?: boolean;
}) {
  // K9 — 초 갱신은 공용 틱 한 벌(서버 기준 ends_at 의 올림 경계). 장부가 숨김(다른 섹션)이면 멈춘다.
  useClockSecond(clock, clock.running && active);

  // 레벨 이동 되돌리기 — ‹ ⏸ › 는 40px 이지만 8px 간격으로 붙어 있어 방향 오탭이 실제로 난다.
  // 이동 직전 raw 행을 6초 보관했다가 그대로 되쓰면 클락 화면·TV(?display=)까지 함께 원상 복구된다.
  const [levelUndo, setLevelUndo] = useState<ClockLevelSnapshot | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);

  // 백업 전진자 — 클락 화면이 아예 안 열려 있으면(이번 세션 미방문·visited LRU 언마운트) DB를 전진시켜
  // 줄 주체가 아무도 없다. 그럴 때만 장부가 대신 쓴다. active(섹션 노출)와 무관한 것은 의도다.
  // 3초 유예: 클락 화면이 떠 있으면 1초 안에 먼저 쓰고 realtime 으로 여기 clock 이 갱신되므로
  //   이 경로는 조용히 지나간다 = 전환음도 클락 화면에서 한 번만 난다.
  // 쓰기는 4필드 부분 업데이트다(전 행 upsert 금지) — 낡은 스냅샷으로 아웃·보정값을 되돌리지 않기 위함.
  // 로컬 화면은 realtime 구독이 갱신하므로 낙관 갱신을 하지 않고, 같은 경계는 한 번만 쓴다.
  const remoteRef = useRef(clock);
  useEffect(() => { remoteRef.current = clock; });
  const onReloadRef = useRef(onReload);
  useEffect(() => { onReloadRef.current = onReload; });
  const wroteForRef = useRef<string | null>(null);
  // #7(FULL-RECHECK-2/C) — 쓰기가 네트워크 오류로 실패하면 다음 1초 틱에 또 보냈다(클락 화면 워치독과 같은 결함). 1·2·4…30초로 벌린다.
  const backoffRef = useRef(createBackoff());
  useEffect(() => {
    if (!clock.running) return;
    const t = setInterval(() => {
      const c = remoteRef.current;
      if (!c.running || !c.endsAt) return;
      if (backoffRef.current.blocked()) return;
      if (!serverTimeKnown()) return;   // K2 — 서버 시각을 모르면 기기 시계로 레벨을 넘기지 않는다
      if (serverNow() - new Date(c.endsAt).getTime() < 3000) return; // 클락 화면이 먼저 쓸 시간을 준다
      if (wroteForRef.current === c.endsAt) return;                 // 이 경계는 이미 우리가 썼다(realtime 대기 중)
      const cu = levelCatchUp(c);
      if (!cu) return;
      wroteForRef.current = c.endsAt;
      const boundary = c.endsAt;
      saveClockLevel(c.venueId, c.gameSeq ?? 1, {
        currentIndex: cu.patch.currentIndex ?? c.currentIndex,
        remainingMs: cu.patch.remainingMs ?? 0,
        endsAt: cu.patch.endsAt ?? null,
        ...(cu.finished && { running: false }),
      }, boundary).then((n) => {
        backoffRef.current.ok();
        // C2(2026-09-25) — 0행 = 다른 기기가 먼저 움직였다(CAS). 예전엔 이 사실을 몰라 realtime 이 안 오면 화면이 옛 경계에 머물렀다.
        if (n === 0) onReloadRef.current();
      }).catch(() => {   // CAS — 다른 기기가 정지·전진시켰으면 이 쓰기는 0행이 된다
        backoffRef.current.fail();
        // 쓰기가 한 번 실패했다고 이 레벨 경계를 영구 포기하면(wroteForRef 가 그대로 남으면)
        // 대회장 와이파이가 잠깐 끊긴 것만으로 레벨이 영영 안 넘어간다 → 다음 틱에 재시도하게 푼다.
        if (wroteForRef.current === boundary) wroteForRef.current = null;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [clock.running]);

  const lv = clock.config.levels;
  // 실효 레벨 — running인데 endsAt이 지났으면(클락 화면 미오픈으로 전진 못 함) 경과분만큼 전진해 표시/제어
  //   (계산은 lib/clockLevel 의 effectiveLevel 한 벌 — 여기 있던 인라인 복제 while 을 걷었다)
  const { index: idx, remainingMs: rem } = effectiveLevel(clock);
  const cur = lv[idx];
  let no = 0;
  for (let i = 0; i <= idx && i < lv.length; i++) if (lv[i].kind === 'level') no++;
  if (!cur) return null;

  // 이동 계산은 실효 idx(endsAt 경과분 전진 반영) 기준이지만, 되돌리기는 '이동 전 DB 행'을 그대로 복원한다.
  // 파생값(rem)이 아니라 raw 를 복원해야 클락 화면·TV 가 이동 전과 완전히 같은 값을 다시 계산한다.
  const go = (delta: number) => {
    const patch = levelMovePatch(clock, idx, delta);
    if (!patch) return; // 경계에서 현재 레벨 타이머만 통째로 리셋되던 사고 차단(기존 ‹ 쪽 가드 누락도 함께 닫힘)
    setLevelUndo(levelSnapshot(clock));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setLevelUndo(null), 6000);
    onPatch(patch);
  };
  const undoGo = () => {
    if (!levelUndo) return;
    onPatch(levelUndoPatch(levelUndo));
    setLevelUndo(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };
  // C7 — 끝난 대회(마지막 레벨 소진)는 재개 버튼이 비활성이다. 예전엔 여기만 마지막 레벨을 **통째로 다시** 돌렸다(다른 화면은 즉시 재종료).
  //   이어서 하려면 클락 화면의 [블라인드 수정]으로 레벨을 덧붙인다.
  const finished = clockPhase(clock) === 'finished';
  const toggle = () => {
    if (finished) return;
    if (!serverTimeSettled()) { void whenServerTimeSettled().then(toggle); return; }   // K2 — 측정 전엔 기다렸다 쓴다
    // 🔴 C5(2026-09-25) — 누른 순간의 실효 레벨·잔여로 커밋한다(렌더는 1초 틱이라 최대 1초 낡았다).
    const at = effectiveLevel(clock, serverNow());
    if (clock.running) {
      onPatch({ currentIndex: at.index, running: false, remainingMs: Math.max(0, at.remainingMs), endsAt: null });
    } else {
      const ms = at.remainingMs > 0 ? at.remainingMs : (lv[at.index].minutes || 0) * 60_000;
      onPatch({ currentIndex: at.index, running: true, remainingMs: ms, endsAt: new Date(serverNow() + ms).toISOString() });
    }
  };
  const ctl = 'w-10 h-10 shrink-0 rounded-input border text-base font-extrabold flex items-center justify-center transition-colors';

  // 아웃 처리(가장 자주 쓰는 운영) — eliminations 증감. 생존 = liveStats.alive(있으면) 또는 엔트리−아웃
  const ls = clock.liveStats;
  const entries = ls ? (ls.entries ?? 0) : 0;
  const alive = ls?.alive != null ? ls.alive : Math.max(0, entries - clock.eliminations);
  // ⚠ liveStats.earlies 는 이미 adjEarlies 를 더한 '최종값'이다(computeLiveStats).
  //   여기서 adjEarlies 를 또 더하면 보정이 두 번 반영돼, +1 을 누를 때마다 표시가 2씩 뛴다.
  //   '자동'은 최종값에서 보정을 되빼야 나온다. (얼리 단위 = 기준칩 배수 — §#21)
  //   ⚠ 2026-09-13: 되빼기는 **클램프 전 값**으로 해야 한다 — `earlies` 는 max(0,…) 라
  //     자동 3·보정 −5 에서 '자동 5' 가 나왔다. earlyAutoOf(clock.ts)가 earliesRaw 를 쓴다.
  const earlyTotal = ls?.earlies ?? 0;            // 화면 합계는 클램프된 값이 맞다(음수 얼리는 없다)
  const earlyAuto = earlyAutoOf(ls, clock.adjEarlies);
  const out = (d: number) => onPatch({ eliminations: Math.max(0, clock.eliminations + d) });
  // 얼리만 하한이 다르다 — 실효 카운트(장부 자동 몫 + 보정)가 0 밑으로 내려가면
  // 카운트는 max(0,…) 로 멈추고 칩만 음수로 떨어졌다 — TV '총 칩' −5,000(#11, 오너 보고 2026-09-15).
  const adjEarly = (d: number) => onPatch({ adjEarlies: clampAdjEarlies(ls, clock.adjEarlies, d) });
  const stepBtn = 'h-10 w-10 shrink-0 rounded-input border border-border-default text-ink-secondary text-base font-bold flex items-center justify-center active:bg-surface-high disabled:opacity-35';

  return (
    <div className="rounded-card border border-accent-400/30 bg-linear-to-r/srgb from-accent-300/[0.07] to-transparent px-2.5 py-2 space-y-2">
      {/* 1행: 레벨/시간 제어 */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onOpenClock} disabled={!onOpenClock} className="min-w-0 flex-1 text-left disabled:cursor-default">
          <p className="text-2xs text-ink-muted leading-none flex items-center gap-1">
            <span className="inline-flex items-center gap-1"><Icon name="timer" size={12} className="shrink-0" />{cur.kind === 'break' ? '브레이크' : `레벨 ${no}`}</span>
            {clock.running
              ? <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-label="진행 중" />
              : <span className="text-accent-300 font-bold">일시정지</span>}
          </p>
          <p className="text-base font-extrabold text-ink-primary tabular-nums leading-tight mt-0.5 truncate">
            {cur.kind === 'break'
              ? (cur.label || 'BREAK')
              : <>{cur.sb.toLocaleString()}/{cur.bb.toLocaleString()}{cur.ante > 0 ? <span className="text-xs text-ink-secondary"> ({cur.ante.toLocaleString()})</span> : null}</>}
            <span className={clock.running ? 'ml-2 text-emerald-300' : 'ml-2 text-accent-300'}>{formatCountdown(rem)}</span>
          </p>
        </button>
        <button type="button" onClick={() => go(-1)} disabled={idx <= 0} aria-label="이전 레벨"
          className={`${ctl} border-border-default text-ink-secondary hover:text-ink-primary disabled:opacity-35`}>‹</button>
        <button type="button" onClick={toggle} disabled={finished} aria-label={finished ? '대회 종료' : clock.running ? '일시정지' : '재개'}
          className={`${ctl} ${finished ? 'border-border-default text-ink-muted disabled:opacity-50' : clock.running ? 'border-accent-400/50 bg-accent-300/15 text-accent-300' : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'}`}>
          <Icon name={finished ? 'check' : clock.running ? 'pause' : 'play'} size={16} />
        </button>
        <button type="button" onClick={() => go(1)} disabled={idx >= lv.length - 1} aria-label="다음 레벨"
          className={`${ctl} border-border-default text-ink-secondary hover:text-ink-primary disabled:opacity-35`}>›</button>
      </div>

      {/* 레벨 오조작 복구(6초) — 이동 전 레벨·남은 시간으로 되돌린다. TV 송출 화면도 함께 복원됨 */}
      {levelUndo && (
        <button type="button" onClick={undoGo} aria-label="레벨 이동 되돌리기"
          className="flex w-full items-center justify-center gap-1.5 rounded-input border border-amber-400/60 py-2 text-2xs font-extrabold text-amber-300 active:bg-amber-400/20">
          <Icon name="undo" size={13} className="shrink-0" />레벨 이동 되돌리기 <span className="font-normal text-amber-300">남은 시간까지 복원</span>
        </button>
      )}

      {/* 2행: 아웃 처리(최우선) — 생존 카운트 + 큰 아웃 버튼 + 되돌리기 아이콘 */}
      <div className="flex items-center gap-2 border-t border-accent-400/15 pt-2">
        <div className="min-w-0 flex-1 leading-none">
          <span className="text-2xs text-ink-secondary">생존</span>
          <span className="ml-1.5 text-lg font-extrabold text-emerald-300 tabular-nums">{alive}</span>
          {clock.eliminations > 0 && <span className="ml-2 text-2xs text-ink-muted">아웃 <b className="text-ink-secondary tabular-nums">{clock.eliminations}</b></span>}
        </div>
        <button type="button" onClick={() => out(-1)} disabled={clock.eliminations <= 0} aria-label="아웃 1명 되돌리기"
          className="h-10 w-10 shrink-0 rounded-input border border-border-default text-ink-secondary text-lg font-bold flex items-center justify-center active:bg-surface-high disabled:opacity-30">↺</button>
        <button type="button" onClick={() => out(1)}
          className="h-10 shrink-0 rounded-input border border-danger/50 px-4 text-sm font-extrabold text-danger-light flex items-center gap-1.5 active:bg-danger/20">
          <span className="text-base leading-none">✕</span> 아웃 처리
        </button>
      </div>

      {/* 3행: 보정 스테퍼 — 얼리(수기 가감). 클락이 자동 집계한 값에 ± */}
      <div className="flex items-center gap-2 rounded-input bg-surface-base/40 px-2.5 py-1.5">
        <span className="text-2xs font-semibold text-ink-muted shrink-0">얼리 보정</span>
        <span className="text-2xs text-ink-muted">자동 {earlyAuto}{(clock.adjEarlies ?? 0) !== 0 ? ` ${(clock.adjEarlies ?? 0) > 0 ? '+' : ''}${clock.adjEarlies}` : ''}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => adjEarly(-1)} aria-label="얼리 −1" className={stepBtn}>−</button>
        {/* 2026-09-14: w-7(29.75px)에 3자리("321")가 "32 / 1" 두 줄로 떨어졌다(엔트리 1,238 규모 대회). */}
        <span className="min-w-7 whitespace-nowrap px-1 text-center text-sm font-extrabold text-accent-300 tabular-nums">{earlyTotal}</span>
        <button type="button" onClick={() => adjEarly(1)} aria-label="얼리 +1" className={stepBtn}>+</button>
      </div>
    </div>
  );
}

// ── 플레이어 편집 모달(이름 수정 + 유형 + 비고 무제한 + 삭제) ─────────────────
function PlayerEditModal({ player, recordCount, hasPw, canManage = false, onClose, onSave, onDelete }: {
  player: LedgerPlayer; recordCount: number; hasPw: boolean;
  /** 업주·공동운영자(can_manage_pos) — 취소 비밀번호 미설정 매장에서는 비밀번호 없이 지운다(서버와 같은 규칙) */
  canManage?: boolean;
  onClose: () => void;
  onSave: (patch: { visitorType: string | null; note: string | null; name?: string }) => void;
  onDelete: (password?: string) => void;
}) {
  const isKnown = VISITOR_OPTS.some((o) => o.code === player.visitorType);
  const [name, setName]   = useState(player.name);
  const [type, setType]   = useState<string | null>(player.visitorType ?? null);
  const [custom, setCustom] = useState(player.visitorType && !isKnown ? player.visitorType : '');
  const [note, setNote]   = useState(player.note ?? '');
  const [delMode, setDelMode] = useState(false);
  const [delPw, setDelPw] = useState('');

  const submit = () => {
    const finalType = type === '__custom__' ? (custom.trim() || null) : type;
    const newName = name.trim();
    onSave({ visitorType: finalType, note: note.trim() || null, name: newName && newName !== player.name ? newName : undefined });
  };

  return (
    <Overlay title={`${player.name} · 플레이어 수정`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="text-2xs text-ink-muted mb-1">이름 (오기 수정 · 바인 기록도 함께 변경됩니다)</p>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30}
            placeholder="플레이어 이름" className="input w-full text-sm" />
        </div>
        <div>
          <p className="text-2xs text-ink-muted mb-1">유형(선택)</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={type === null} onClick={() => setType(null)}>없음</Chip>
            {VISITOR_OPTS.map((o) => (
              <Chip key={o.code} active={type === o.code} onClick={() => setType(o.code)}>{o.label}</Chip>
            ))}
            <Chip active={type === '__custom__'} onClick={() => setType('__custom__')}>직접입력</Chip>
          </div>
          {type === '__custom__' && (
            <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={20}
              placeholder="유형 직접입력" className="input w-full text-sm mt-2" autoFocus />
          )}
        </div>
        <div>
          <p className="text-2xs text-ink-muted mb-1">비고 (글자수 제한 없음)</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
            placeholder="자유롭게 메모하세요" className="input w-full text-sm resize-none" />
        </div>
        {/* 삭제 — 바인 기록이 없으면 즉시, 있으면 취소 비밀번호로 바인까지 함께 삭제 */}
        {recordCount === 0 ? (
          <button type="button" onClick={() => onDelete()} className="w-full btn-danger text-xs py-2">플레이어 삭제</button>
        ) : !delMode ? (
          <button type="button" onClick={() => setDelMode(true)} className="w-full rounded-input border border-danger/40 py-2 text-xs font-semibold text-danger-light transition-colors hover:bg-danger/10">플레이어 삭제 (바인 {recordCount}건 포함)</button>
        ) : (
          <div className="space-y-1.5 rounded-input border border-danger/40 bg-danger/6 p-2">
            <p className="text-2xs text-danger-light">
              바인 {recordCount}건이 함께 삭제됩니다. {hasPw ? '취소 비밀번호를 입력하세요.' : canManage ? '취소 비밀번호가 설정되지 않은 매장이라 비밀번호 없이 삭제됩니다.' : '취소 비밀번호가 설정되지 않은 매장은 업주·공동운영자만 삭제할 수 있습니다.'}
            </p>
            <div className="flex gap-1.5">
              {!hasPw && canManage
                ? <button type="button" onClick={() => onDelete('')} className="btn-danger bg-rose-700! hover:bg-rose-800! min-w-0 flex-1 px-3 text-xs">삭제 확정</button>
                : <>
                  <input type="password" inputMode="numeric" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder={hasPw ? '취소 비밀번호' : '비밀번호 미설정'} disabled={!hasPw} className="input min-w-0 flex-1 text-sm" autoFocus />
                  <button type="button" onClick={() => onDelete(delPw)} disabled={!hasPw || !delPw} className="btn-danger bg-rose-700! hover:bg-rose-800! shrink-0 px-3 text-xs disabled:opacity-50">삭제 확정</button>
                </>}
              <button type="button" onClick={() => { setDelMode(false); setDelPw(''); }} className="btn-ghost shrink-0 px-2 text-xs">취소</button>
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="btn-ghost text-sm px-4">닫기</button>
          <button type="button" onClick={submit} className="btn-primary text-sm px-4">저장</button>
        </div>
      </div>
    </Overlay>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={['tap-y-44 min-h-[32px] text-2xs font-bold px-2.5 py-1 rounded-badge border transition-colors',
        active ? 'bg-accent-300/15 text-accent-300 border-accent-400/40' : 'bg-surface-float text-ink-secondary border-border-default'].join(' ')}>
      {children}
    </button>
  );
}

// ── 날짜 바 ───────────────────────────────────────────────────────────────────
// tools — 장부 작업대(LedgerWorkspace)의 [이용권 확인]·[전체화면]. 2026-10-02(감사 L-4) 혼자 한 줄을 차지하던 도구 줄을 이 줄 끝으로 흡수했다.
function DateBar({ date, setDate, biz, onBack, tools }: { date: string; setDate: (d: string) => void; biz: string; onBack?: () => void; tools?: ReactNode }) {
  return (
    <div data-ledger-daterow className="flex min-w-0 items-center gap-2">
      {/* 크기 사다리 .btn-sm(34px) 을 쓴다 — text-xs(12.75px) 라벨인데 .btn 기본 하한(min-h 2.4rem=40.8px)을
          그대로 받아 필요보다 6.8px 컸다(오너: "글씨에 비해 버튼이 쓸데없이 커져"). 실측 55.8×40.8 → 34px.
          ⚠ 색 변형 뒤에 크기 변형이 와야 한다(index.css §B1 선언 순서).
          ⚠ 이 주석을 아래 조건부 렌더 **안쪽**으로 옮기지 마라 — 거기는 표현식 자리라 JSX 주석이 구문 오류다.
             (2026-09-19 에 실제로 한 번 깨뜨렸다. 중괄호를 주석에 쓰는 것도 같은 이유로 안 된다.) */}
      {onBack && (
        <button type="button" onClick={onBack} className="btn-ghost btn-sm px-2 shrink-0" aria-label="목록으로">← 목록</button>
      )}
      {/* data-testid: '어느 날짜 장부에 착지했는가' 를 재는 유일한 안정 지점(clk-timer 와 같은 규약). */}
      <input data-testid="ledger-date" aria-label="장부 날짜" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="input min-w-0 flex-1 text-sm lg:w-52 lg:flex-none" />
      {date !== biz && <button type="button" onClick={() => setDate(biz)} className="btn-ghost text-xs px-3 shrink-0">오늘</button>}
      {tools && <div className="ml-auto flex shrink-0 items-center gap-1.5">{tools}</div>}
    </div>
  );
}

// ── 게임 스위처 — 그 날짜의 메인/사이드 전환 + 사이드 추가 ─────────────────────
// 🔴 2026-10-02 오너(데일리 펍: 하루 장부 10건+) — ① 셸 '오늘 게임' 칩 줄 자리로 portal 돼 게임 줄이 하나다(같은 자리·같은 칩 모양, h-9).
//   ② 고른 칩을 가로로 화면 가운데에 둔다(종전엔 15번째를 골라도 scrollLeft 0 그대로 — 고른 게임이 화면 밖).
//   ③ 게임이 6개 이상이면 [게임 이동 ▾] 하나로 바로 간다(가로 1,600px 를 밀지 않게). 진행·마감 수도 같이 보인다.
//   칩 글자 '사이드1 · 제목' 은 한 덩어리 그대로(셀렉터·낭독 계약). 영업일이면 '오늘 게임', 지난 날짜면 'M/D 게임'.
function GameSwitcher({ games, gameSeq, onSelect, onAddSide, canAdd, date, today }: {
  games: LedgerGame[]; gameSeq: number; onSelect: (s: number) => void; onAddSide: () => void; canAdd: boolean;
  /** 이 장부의 날짜(en-CA) · 영업일인가 */
  date: string; today: boolean;
}) {
  const label = (seq: number) => (seq === MAIN_GAME_SEQ ? '메인' : `사이드${seq - 1}`);
  const showPending = !games.some((g) => g.gameSeq === gameSeq); // 작성중인 새 사이드
  const scRef = useRef<HTMLDivElement>(null);
  // ② 고른 칩을 가운데로 — rect 차이로 잰다(offsetLeft 는 :active scale 조상에서 끊긴다, CLAUDE.md 참고 메모). 세로 스크롤은 건드리지 않는다.
  useLayoutEffect(() => {
    const sc = scRef.current;
    const on = sc?.querySelector<HTMLElement>('[aria-pressed="true"], [data-pending]');
    if (!sc || !on || sc.scrollWidth <= sc.clientWidth) return;
    const a = sc.getBoundingClientRect(); const b = on.getBoundingClientRect();
    sc.scrollLeft += (b.left + b.width / 2) - (a.left + a.width / 2);
  }, [gameSeq, games.length]);
  const md = date.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/');
  const live = games.filter((g) => !g.closed).length;
  const chip = (on: boolean) => ['inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-badge px-3.5 text-xs font-bold leading-none transition-colors',
    on ? 'bg-accent-300/15 text-accent-300' : 'bg-surface-high text-ink-secondary hover:bg-surface-float/70'].join(' ');
  return (
    <div data-ledger-games="" className="flex min-w-0 items-center gap-2">
      {/* 이름표는 스크롤 밖 — 고른 칩을 가운데로 끌어와도 '어느 날의 게임인가' 가 화면에 남는다 */}
      <span aria-hidden className="shrink-0 text-2xs font-bold text-ink-muted">{today ? '오늘 게임' : `${md} 게임`}</span>
      <div ref={scRef} role="group" aria-label={today ? '오늘 게임 선택' : `${md} 게임 선택`}
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
        {games.map((g) => (
          <button key={g.gameSeq} type="button" aria-pressed={g.gameSeq === gameSeq} onClick={() => onSelect(g.gameSeq)} className={chip(g.gameSeq === gameSeq)}>
            <span data-ledger-chip48="" className="truncate max-sm:max-w-28">{label(g.gameSeq)}{g.title ? ` · ${g.title}` : ''}</span>
            {/* '마감' 은 그 게임에 더 못 넣는다는 운영 상태 — 흐리지 않고 의미 토큰으로(셸 칩과 같은 규칙) */}
            {g.closed ? <span className="text-2xs font-semibold text-ink-secondary">마감</span> : <span className="sr-only">진행 중</span>}
          </button>
        ))}
        {showPending && (
          <span data-pending="" className={chip(true)}>{label(gameSeq)} (작성중)</span>
        )}
        {canAdd && !showPending && (
          <button type="button" onClick={onAddSide}
            className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-badge border border-dashed border-accent-400/40 px-3.5 text-xs font-bold leading-none text-accent-300 transition-colors hover:bg-accent-300/10">+ 사이드</button>
        )}
      </div>
      {games.length >= 6 && (
        // ③ 많으면 한 번에 — 네이티브 select(키보드·낭독기·모바일 휠 피커 그대로). 진행 중이 위.
        <select aria-label={`게임으로 이동 — 진행 ${live} · 마감 ${games.length - live}`} value={showPending ? '' : String(gameSeq)}
          onChange={(e) => { const v = Number(e.target.value); if (v) onSelect(v); }}
          data-ledger-chip44="" className="input h-9 w-auto shrink-0 py-0 text-xs font-bold max-sm:max-w-28">
          {showPending && <option value="">{label(gameSeq)} (작성중)</option>}
          <optgroup label={`진행 ${live}`}>
            {games.filter((g) => !g.closed).map((g) => <option key={g.gameSeq} value={g.gameSeq}>{label(g.gameSeq)}{g.title ? ` · ${g.title}` : ''}</option>)}
          </optgroup>
          <optgroup label={`마감 ${games.length - live}`}>
            {games.filter((g) => g.closed).map((g) => <option key={g.gameSeq} value={g.gameSeq}>{label(g.gameSeq)}{g.title ? ` · ${g.title}` : ''}</option>)}
          </optgroup>
        </select>
      )}
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'emerald' | 'danger' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'danger' ? 'text-danger-light' : 'text-ink-primary';
  return (
    <div>
      {/* truncate — 640 미만 2열에서 '총 바이인(제외 적용)'(94.59px)이 칸(72.5px)보다 넓어 2줄이 되면
          그 칸의 값만 11.69px 아래로 내려가 옆 '티켓' 칸과 어긋났다. 라벨은 한 줄로 두고 전체 문구는 title 로
          보여 준다(같은 파일 Mini/Tile 과 같은 관용구). PC(sm 이상 4열)는 폭이 넉넉해 렌더가 변하지 않는다. */}
      <p className="truncate text-2xs text-ink-muted leading-none" title={label}>{label}</p>
      {/* ⚠ 2026-09-14: 375 의 4열 칸이 좁아 값이 **숫자 중간**에서 끊겼다("7,194 / .44만", "250.3 / 7만").
          금액은 한 덩어리라 쪼개지면 읽는 사람이 다른 수로 오해한다 — 줄바꿈을 막는다. */}
      <p className={['text-sm font-bold tabular-nums leading-tight mt-0.5 whitespace-nowrap', c].join(' ')}>{value}</p>
      {/* 보조 수 — 같은 칸에서 '횟수 vs 엔트리' 처럼 **다른 척도**를 나란히 세울 때만 쓴다 */}
      {sub && <p className="text-2xs tabular-nums leading-none text-ink-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ── 세션 설정 폼 (입장/수정 공용) ─────────────────────────────────────────────
function SessionForm({ base, mode, operatorName, onSubmit, onCancel, embedded, prefilled, schedules = [], operatorOptions = [], operatorOptionsError = null, onRetryOperatorOptions, operatorOptionsPartial = false, presets = [], scheduledDealers = [], dealerOptions = [], copyMain = null, lastRound = null, autoApplyLast, onLastApplied, lockPricing = false }: {
  base: LedgerSession; mode: 'open' | 'edit'; operatorName: string;
  onSubmit: (s: LedgerSession) => void | Promise<void>; onCancel?: () => void; embedded?: boolean; prefilled?: boolean;
  schedules?: Schedule[]; operatorOptions?: { id: string; label: string }[]; presets?: LedgerPreset[]; scheduledDealers?: string[]; copyMain?: LedgerSession | null;
  /** 이 매장에 등록된 딜러/직원 이름 — 금일 딜러 명단을 **적는 대신 고르게** 한다(오너 2026-09-18).
   *  venue_staff(계정 직원) ∪ staff_wage(비회원 포함 인건비 명부). 비어 있으면 칩 줄을 그리지 않고
   *  종전처럼 직접 입력만 남는다 — 명부가 없다고 입력까지 막지 않는다. */
  dealerOptions?: string[];
  /** P02: 권한 직원 조회가 실패했으면 그 오류 — 후보가 '나' 뿐인 것이 실제 0명인지 못 불러온 것인지 폼이 갈라 말한다 */
  operatorOptionsError?: unknown; onRetryOperatorOptions?: () => void;
  /** F4(2026-09-13): 후보 목록이 **완전하지 않을 수 있다** — ledger_access 직접 SELECT 는 RLS(la_select) 때문에 POS 권한 없는
   *  장부직원에게 자기 행만 준다. 그걸 '전체' 로 읽어 본인만 자동 선택·저장하면 동료 장부직원 전원이 그 장부에서 잠긴다.
   *  부분이면 자동 선택하지 않는다(담당 비움 = 장부 권한 직원 전원 열람). 근본 수정은 can_access_ledger 게이트 RPC(DB 변경). */
  operatorOptionsPartial?: boolean;
  /** PL3: 마지막 마감 회차(세션+클락 설정) — '지난 게임 그대로 열기' 1탭 */
  lastRound?: LastClosedRound | null;
  /** 대시보드 인텐트로 진입 시 1회 자동 적용 */
  autoApplyLast?: boolean; onLastApplied?: () => void;
  /** 2026-09-14 D1: 이미 기록된 바인이 있으면 단가·할인을 잠근다.
   *  엔트리는 `적용금액 ÷ **세션 현재 단가**`(ledger.ts buyinFinance.seal)라, 기록 뒤에 단가를 바꾸면
   *  **이미 저장된 행의 엔트리·할인액·기준매출이 소급해서 변한다**(10만→5만 이면 엔트리가 2배).
   *  잠그는 쪽을 택한 이유(오너 결정 2026-09-14): 행마다 정가 스냅샷을 심는 근본 수정은 마이그레이션과
   *  기존 행 백필이 필요하고, 그 전까지 라이브 장부가 계속 틀린 값을 말하게 둘 수는 없다. */
  lockPricing?: boolean;
}) {
  const formToast = useToast();
  const [title, setTitle]     = useState(base.title ?? '');
  const [cash, setCash]       = useState<number>(base.buyinAmount || 0);
  const [card, setCard]       = useState<number>(base.cardAmount ?? 0);
  const [target, setTarget]   = useState<number>(base.targetEntries || 0);
  const [gameType, setGameType] = useState<'gtd' | 'entry'>(base.gameType ?? 'gtd');
  const [maxEntries, setMaxEntries] = useState<number>(base.maxEntries || 0);
  const [isAddon, setIsAddon] = useState<boolean>(!!base.isAddon);
  const [addonStack, setAddonStack] = useState<number>(base.addonStack || 0);
  const [addonAmount, setAddonAmount] = useState<number>(base.addonAmount || 0);   // 애드온 1회 가격(원)
  const [voucherIssued, setVoucherIssued] = useState<number>(base.voucherIssued ?? 0);
  // W2-2 VCH-1b: 자동적립 입력 UI 는 제거됐지만 값은 보존해 write — 지우면 저장 경로가 전 매장 설정을 0 으로 덮는다(§18.4)
  const [accrualPerBin] = useState<number>(base.voucherAccrualPerBin ?? 0);
  const [event, setEvent]     = useState(base.eventMemo ?? '');
  const [dealers, setDealers] = useState(base.dealers ?? (scheduledDealers.length ? scheduledDealers.join('\n') : ''));
  /** 지금 명단에 든 이름(공백 줄 제외). 칩의 켜짐 판정과 토글이 **같은 문자열**을 본다 —
   *  두 벌로 만들면 "칩은 켜졌는데 저장은 안 됨" 이 난다. */
  const dealerSet = useMemo(
    () => new Set(dealers.split('\n').map((x) => x.trim()).filter(Boolean)),
    [dealers],
  );
  const toggleDealer = useCallback((name: string) => {
    setDealers((prev) => {
      const lines = prev.split('\n').map((x) => x.trim()).filter(Boolean);
      const i = lines.indexOf(name);
      // ⚠ 뺄 때는 **첫 항목만** 지운다 — 동명이인을 두 줄로 적어 둔 명부를 칩 한 번에 통째로 날리지 않는다.
      if (i >= 0) lines.splice(i, 1); else lines.push(name);
      return lines.join('\n');
    });
  }, []);
  const [schedId, setSchedId] = useState<string>(base.scheduleId ?? '');
  const [operIds, setOperIds] = useState<string[]>(
    base.operators && base.operators.length ? base.operators
    : base.openedBy ? [base.openedBy]
    : (!operatorOptionsPartial && operatorOptions[0]) ? [operatorOptions[0].id] : [],
  );
  const toggleOper = (id: string) => setOperIds((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : (arr.length >= 10 ? arr : [...arr, id]));
  const [discs, setDiscs]     = useState<DiscountPreset[]>(base.discounts ?? []);
  const [startISO, setStartISO] = useState<string | null>(base.tournamentStart ?? null);
  const [presetOpen, setPresetOpen] = useState(false); // 프리셋 리스트 펼침
  // F-1(store-link-1002) — 직전 게임 설정은 폼이 그려진 뒤 도착한다. 도착하면 **빈 칸만** 채운다(업주가 이미 친 칸은 덮지 않는다).
  const prefillDone = useRef(false);
  useEffect(() => {
    if (mode !== 'open' || !prefilled) { prefillDone.current = false; return; }
    if (prefillDone.current) return;
    prefillDone.current = true;
    const f = fillEmptyFromPrefill({ title, cash, card, target, dealers, event, discs }, base);
    if (f.title !== undefined) setTitle(f.title);
    if (f.cash !== undefined) setCash(f.cash);
    if (f.card !== undefined) setCard(f.card);
    if (f.target !== undefined) setTarget(f.target);
    if (f.dealers !== undefined) setDealers(f.dealers);
    if (f.event !== undefined) setEvent(f.event);
    if (f.discs !== undefined) setDiscs(f.discs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, prefilled]);
  const [autoLinked, setAutoLinked] = useState(false); // 당일 포스터 자동 연동 표시

  // PL1a: 포스터 상속을 3필드(제목·바인·유형) → 전체(스택·애드온, 제출 시 클락 구조·레지레벨·상금)로 확대.
  // 스택 setter 는 아래 '연동 클락 얼리 설정' 블록에서 선언되므로 ref 로 지연 배선한다.
  const applySchedInheritRef = useRef<(sc: Schedule) => void>(() => {});
  const posterStackRef = useRef(false);   // A1 — 포스터가 스택을 채웠는가(늦게 온 클락 설정 조회가 덮지 않게)
  const posterEarlyRef = useRef(false);   // W-04 — 포스터가 얼리 단계를 채웠는가(같은 이유)
  const [addonEntry, setAddonEntry] = useState<number | undefined>(base.addonEntry); // W-06 — 포스터 애드온 엔트리(폼 칸은 KW-2)
  const [todayPick, setTodayPick] = useState<Schedule[]>([]); // 당일 포스터 2개+ — 침묵 대신 선택 칩(§13-B)
  // 당일 포스터 자동 연동 — 새 장부 시작 시 그 날짜 포스터가 1개면 즉시 프리필(수정 가능).
  // 포스터→장부→클락 재입력 반복을 제거(사장님 요청: 더 간단하게).
  useEffect(() => {
    if (mode !== 'open' || prefilled || autoLinked || schedId || title.trim()) return;
    const todays = schedules.filter((s) => s.date === base.sessionDate);
    if (todays.length === 1) {
      setAutoLinked(true);
      applySchedInheritRef.current(todays[0]);
    } else if (todays.length >= 2) {
      // 자동화는 항상 되거나, 왜 안 되는지 보이거나 — 침묵 금지(§13-B). 사이드 우선 정렬 대신 시각순.
      setTodayPick([...todays].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, prefilled, schedules, base.sessionDate]);

  // 연동 클락 얼리 설정(추가스택·레벨) — 장부 시작에서 바로 편집(옵션 1)
  const [clockState, setClockState] = useState<ClockState | null>(null);
  const [earlyBonus, setEarlyBonus] = useState<number>(0);
  const [doubleEarlyBonus, setDoubleEarlyBonus] = useState<number>(0);
  const [earlyDoubleLevel, setEarlyDoubleLevel] = useState<number>(1);
  const [earlySingleLevel, setEarlySingleLevel] = useState<number>(4);
  const [startStack, setStartStack] = useState<number>(50000);
  const [rebuyStack, setRebuyStack] = useState<number>(70000);
  useEffect(() => {
    let alive = true;
    getClockState(base.venueId, base.gameSeq).then((st: ClockState | null) => {
      if (!alive) return;
      const c = st?.config ?? defaultClockConfig();
      setClockState(st);
      // W-04 — 포스터가 얼리 단계를 말했으면(빈 배열 = 얼리 없음) 늦게 온 클락 설정이 그 값을 덮지 않는다(A1 과 같은 이유).
      if (!posterEarlyRef.current) {
        setEarlyBonus(c.earlyBonus ?? 0);
        setDoubleEarlyBonus(c.doubleEarlyBonus ?? 0);
        setEarlyDoubleLevel(c.earlyDoubleLevel ?? 1);
        setEarlySingleLevel(c.earlySingleLevel ?? 4);
      }
      // A1 — 포스터 상속이 이미 스택을 채웠으면 늦게 온 클락 설정이 덮지 않는다(자동 연동·수동 선택·seed 가 이 조회보다 먼저 끝날 수 있다).
      if (!posterStackRef.current) {
        setStartStack(c.startStack ?? 50000);
        setRebuyStack(c.rebuyStack ?? 70000);
      }
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.venueId]);

  // PL1a: 포스터 → 폼 상속(무금액 포함 전체) — 자동연동·선택 칩·(향후 수동 선택)이 공유하는 단일 적용점
  applySchedInheritRef.current = (sc: Schedule) => {
    posterStackRef.current = !!(sc.buyIn?.startStack ?? sc.structure?.startingChips ?? sc.buyIn?.rebuyStack ?? sc.structure?.rebuyStack);
    setSchedId(sc.id);
    setTitle(sc.title);
    if (sc.buyIn?.amount) setCash(sc.buyIn.amount);
    setGameType(sc.guaranteed ? 'gtd' : 'entry');
    const start = sc.buyIn?.startStack ?? sc.structure?.startingChips;
    if (start) setStartStack(start);
    const rebuy = sc.buyIn?.rebuyStack ?? sc.structure?.rebuyStack;
    if (rebuy) setRebuyStack(rebuy);
    if (sc.buyIn?.addonStack) { setIsAddon(true); setAddonStack(sc.buyIn.addonStack); }
    if (sc.buyIn?.addon) { setIsAddon(true); setAddonAmount(sc.buyIn.addon); }   // 포스터 애드온 비용 → 장부 애드온 가격
    // W-04 — 포스터 얼리 단계의 1·2단을 폼 두 칸에 보여 준다(단계 없음 = 0). 3·4단은 제출 때 포스터에서 그대로 온다.
    const cp = clockPatchFromSchedule(sc);
    posterEarlyRef.current = Array.isArray(cp.earlyTiers);
    if (posterEarlyRef.current) {
      setDoubleEarlyBonus(cp.doubleEarlyBonus ?? 0); setEarlyDoubleLevel(cp.earlyDoubleLevel ?? 0);
      setEarlyBonus(cp.earlyBonus ?? 0); setEarlySingleLevel(cp.earlySingleLevel ?? 0);
    }
    if (cp.rebuyStack) setRebuyStack(cp.rebuyStack);   // W-10 — 계단 스택이 있으면 첫 리엔트리 값
    // W-19 — 기준 엔트리 = GTD ÷ 참가비 · W-06 애드온 엔트리(포스터가 말할 때만)
    const lp = sessionPatchFromSchedule(sc);
    if (lp.targetEntries) setTarget(lp.targetEntries);
    setAddonEntry(lp.addonEntry);
    // B2(2026-09-28) — 포스터의 시작 시간을 장부의 '대회 시작 시각'으로 잇는다. 얼리 자동 판정의 기준이 이 값이고,
    //   비어 있으면 '장부를 연 시각'이 기준이 돼 개설 17:30·스타트 19:00 대회의 19:05 첫 바인이 얼리가 아니게 됐다.
    //   (포스터에 시간이 없으면 클락이 처음 돌 때 서버 기준 시각으로 채운다 — api/clock noteTournamentStart.)
    if (sc.startTime) { const iso = isoAt(base.sessionDate, sc.startTime); if (iso) setStartISO(iso); }
  };
  // A1(2026-09-28) — 게임관리 '이 포스터로 새 장부'(seed)로 들어온 경우도 같은 상속을 한 번 적용한다.
  //   예전엔 seed 가 제목·단가·유형만 실어 와서, 제출 때 폼의 스택(기본 50,000)이 포스터 스택을 덮었다(:병합 순서 cfg).
  const seedInherited = useRef(false);
  useEffect(() => {
    if (mode !== 'open' || !prefilled || !base.scheduleId || seedInherited.current) return;
    const sc = schedules.find((s) => s.id === base.scheduleId);
    if (!sc) return;
    seedInherited.current = true;
    applySchedInheritRef.current(sc);
  }, [mode, prefilled, base.scheduleId, schedules]);

  const setDisc = (i: number, patch: Partial<DiscountPreset>) =>
    setDiscs((arr) => arr.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  const addDisc = () => setDiscs((arr) => (arr.length < 5 ? [...arr, { label: '', amount: 0, level: 0 }] : arr));
  // ⚠ 바인은 discountIndex(1-based 자리번호)로 할인을 참조한다 → 중간 칸을 배열에서 빼면
  //   그 뒤 할인을 쓰던 기존 바인이 한 칸씩 당겨져 '다른 금액'으로 계산된다(과거 금액 오류 원인).
  //   마지막 칸만 실제로 줄이고, 중간 칸은 자리를 남긴 채 비운다(계산은 0원 · 선택 목록에선 숨김).
  const removeDisc = (i: number) => setDiscs((arr) => (
    i === arr.length - 1
      ? arr.slice(0, -1)
      : arr.map((d, idx) => (idx === i ? { label: '', amount: 0, level: 0 } : d))
  ));

  // 연결된 포스터의 '할인액이 붙은' 프로모션 — 없으면 가져오기 버튼 자체를 그리지 않는다(껍데기 버튼 금지).
  const posterDiscs = useMemo(
    () => (schedules.find((s) => s.id === schedId)?.promotions ?? []).filter((p) => (p.discountWon ?? 0) > 0),
    [schedules, schedId],
  );
  // 포스터 → 장부 할인 프리셋. 기존 칸은 덮지 않고 뒤에 덧붙인다(자리번호가 바인 계산의 기준).
  const importPosterDiscs = () => {
    const r = discountsFromPromotions(posterDiscs, discs);
    setDiscs(r.discounts);
    const notes = [
      r.added > 0 ? `포스터 할인 ${r.added}개를 가져왔습니다` : '새로 가져올 할인이 없습니다',
      r.duplicates > 0 ? `${r.duplicates}개는 이미 있어 건너뜀` : '',
      r.skipped > 0 ? `${r.skipped}개는 5칸이 차서 못 넣었습니다` : '',
    ].filter(Boolean);
    formToast.show(notes.join(' · '), r.added > 0 ? 'success' : 'info');
  };

  // 프리셋 게임 클릭 → 아래 내용 자동입력(수정 가능). 담당직원(operId)은 프리셋과 무관 → 그대로 유지.
  const applyPreset = (p: LedgerPreset) => {
    setTitle(p.title);
    setCash(p.buyinAmount || 0);
    setCard(p.cardAmount ?? 0);
    setTarget(p.targetEntries || 0);
    setDealers(p.dealers ?? '');
    setEvent(p.eventMemo ?? '');
    setDiscs(p.discounts ?? []);
  };

  // 메인 게임 설정 그대로 복사(사이드 빠른 생성) — 단가·할인·딜러·게임유형·애드온
  const applyCopyMain = () => {
    if (!copyMain) return;
    // 제목은 충돌 방지 위해 "(사이드N)" 접미사 자동(메인은 그대로)
    setTitle(copyMain.title ? `${copyMain.title} (사이드${(base.gameSeq ?? MAIN_GAME_SEQ) - 1})` : '');
    setCash(copyMain.buyinAmount || 0);
    setCard(copyMain.cardAmount ?? 0);
    setTarget(copyMain.targetEntries || 0);
    setGameType(copyMain.gameType ?? 'gtd');
    setMaxEntries(copyMain.maxEntries || 0);
    setIsAddon(!!copyMain.isAddon);
    setAddonStack(copyMain.addonStack || 0);
    setAddonAmount(copyMain.addonAmount || 0);
    setDealers(copyMain.dealers ?? '');
    setEvent(copyMain.eventMemo ?? '');
    setDiscs(copyMain.discounts ?? []);
  };

  // ── PL3 + PL2c: 스냅샷/프리셋에서 온 '클락 몫'은 시작 시 비파괴 병합으로 전달 ──
  // full = 지난 회차의 완성된 클락 설정(통째), patch = 프리셋의 부분 패치. 폼에서 고친 값이 항상 이긴다.
  const inheritClockRef = useRef<{ full: ClockConfig | null; patch: Partial<ClockConfig> | null }>({ full: null, patch: null });
  const isoAt = (dateStr: string, hm: string): string | null => {
    const t = new Date(`${dateStr}T${hm}:00`);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  };
  // 클락 설정 → 폼의 얼리·스택 표시값 동기화(보이는 값과 저장 값이 갈리지 않게)
  const syncClockFields = (c: Partial<ClockConfig>) => {
    if (c.earlyBonus != null) setEarlyBonus(c.earlyBonus);
    if (c.doubleEarlyBonus != null) setDoubleEarlyBonus(c.doubleEarlyBonus);
    if (c.earlyDoubleLevel != null) setEarlyDoubleLevel(c.earlyDoubleLevel);
    if (c.earlySingleLevel != null) setEarlySingleLevel(c.earlySingleLevel);
    if (c.startStack) setStartStack(c.startStack);
    if (c.rebuyStack) setRebuyStack(c.rebuyStack);
  };

  // PL3①: '지난 게임 그대로 열기' — 마감 회차(세션 전체+클락 설정)를 폼에 1탭 프리필.
  // 담당 직원(operIds)과 날짜는 건드리지 않는다(사람 입력은 그 둘만 — DoD).
  const applyLastRound = (r: LastClosedRound) => {
    const s = r.session;
    setTitle(s.title ?? '');
    setCash(s.buyinAmount || 0);
    setCard(s.cardAmount ?? 0);
    setGameType(s.gameType ?? 'gtd');
    setTarget(s.targetEntries || 0);
    setMaxEntries(s.maxEntries || 0);
    setIsAddon(!!s.isAddon);
    setAddonStack(s.addonStack || 0);
    setAddonAmount(s.addonAmount || 0);
    setDealers(s.dealers ?? '');
    setEvent(s.eventMemo ?? '');
    setDiscs(s.discounts ?? []);
    // scheduleId 는 복사하지 않는다 — 지난 날짜의 포스터에 오늘 장부를 연결하면 통계·딥링크가 꼬인다.
    // 스타트 시각은 '시각만' 이어받아 오늘 날짜로 재조립.
    const hm = s.tournamentStart ? (() => { const t = new Date(s.tournamentStart!); return Number.isNaN(t.getTime()) ? null : `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; })() : null;
    if (hm) setStartISO(isoAt(base.sessionDate, hm));
    inheritClockRef.current = { ...inheritClockRef.current, full: r.clockConfig ?? null };
    if (r.clockConfig) syncClockFields(r.clockConfig);
    formToast.show(`지난 게임(${s.sessionDate.slice(5).replace('-', '/')} ${s.title || '제목 없음'}) 설정을 그대로 불러왔어요. 날짜·담당 직원만 확인하세요`, 'success');
  };
  // 대시보드 인텐트 1회 자동 적용
  const lastAppliedRef = useRef(false);
  useEffect(() => {
    if (!autoApplyLast || !lastRound || mode !== 'open' || lastAppliedRef.current) return;
    lastAppliedRef.current = true;
    applyLastRound(lastRound);
    onLastApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApplyLast, lastRound, mode]);

  // PL2c: 게임 프리셋 → 장부 폼(어댑터 경유 · '있는 것만'). 클락 몫은 시작 시 병합.
  const applyGamePresetToForm = (p: GamePreset) => {
    const d = applyToLedger(p.data);
    if (d.title !== undefined) setTitle(d.title ?? '');
    if (d.buyinAmount !== undefined) setCash(d.buyinAmount);
    if (d.cardAmount !== undefined) setCard(d.cardAmount ?? 0);
    if (d.gameType !== undefined) setGameType(d.gameType);
    if (d.targetEntries !== undefined) setTarget(d.targetEntries);
    if (d.maxEntries !== undefined) setMaxEntries(d.maxEntries);
    if (d.isAddon !== undefined) setIsAddon(d.isAddon);
    if (d.addonStack !== undefined) setAddonStack(d.addonStack);
    if (d.addonAmount !== undefined) setAddonAmount(d.addonAmount);
    if (d.dealers !== undefined) setDealers(d.dealers ?? '');
    if (d.eventMemo !== undefined) setEvent(d.eventMemo ?? '');
    if (d.discounts !== undefined) setDiscs(d.discounts);
    if (d.tournamentStartTime) setStartISO(isoAt(base.sessionDate, d.tournamentStartTime));
    const cp = applyToClock(p.data);
    inheritClockRef.current = { ...inheritClockRef.current, patch: Object.keys(cp).length ? cp : null };
    syncClockFields(cp);
    formToast.show(`'${p.name}' 프리셋 적용 · 채워진 항목만 반영했어요(수정 가능)`, 'success');
  };

  // 할인 상한 — **적용될 수 있는 가장 싼 단가 미만**이어야 한다.
  //  · 단가 이상이면 그 바인이 entry 0 · 가치 0 · 매출 0 으로 '없는 기록'이 된다(실측).
  //  · 더 중요한 이유: 그때 nonSplitSnapshot 이 **0원**을 저장하는데, buyinFinance 의
  //    `stored > 0` 센티널은 '저장된 0'과 '미저장 레거시'를 구분하지 못한다.
  //    그러면 나중에 할인 프리셋을 고치는 순간 그 행의 매출이 **되살아난다**
  //    (무료로 들여보낸 손님이 10만 매출로 부활 — 2026-09-05 감사).
  //    여기서 0원 스냅샷이 생기지 않게 막으면 센티널이 다시 성립한다. ⚠ 이 결합을 깨지 말 것.
  //  · 카드단가도 본다. 현금 10만·카드 5만 세션에서 8만 할인은 현금 기준으론 통과하지만
  //    카드 바인에서 0원 스냅샷을 만든다.
  // 100% 할인(무료 이벤트)은 허용한다 — 0원 스냅샷이 위험하던 문제는 buyinFinance 의 센티널을
  // 날짜 기준으로 바꿔 닫았다(SNAPSHOT_SINCE). 단가를 **넘는** 할인만 막는다(entry 가 음수 방향).
  const minUnit = card > 0 ? Math.min(cash, card) : cash;
  const badDisc = discs.findIndex((d) => d.amount > 0 && minUnit > 0 && d.amount > minUnit);

  // #4(2026-09-27) — [장부 시작] 3연타에 장부 저장·클락 설정 저장이 3번씩 나갔다(담당 알림·출근표 등록도 반복).
  //   ref 로 막는다 — 같은 틱의 연속 클릭은 state 가 아직 안 바뀌어 disabled 만으로는 못 막는다.
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true);
    try { await submitOnce(); } finally { submittingRef.current = false; setSubmitting(false); }
  };
  const submitOnce = (): void | Promise<void> => {
    if (cash <= 0) return;
    if (badDisc >= 0) return; // 아래 경고 문구가 이유를 말한다
    const tStart = startISO;
    // #21: 장부에 적은 얼리 '레벨'을 세션의 얼리 '분'으로 환산해 함께 저장한다.
    //   왜: 지금까지 이 환산은 클락 화면을 실제로 연 사람만 했다(TournamentClock). 클락을 안 열면
    //   세션의 earlyDoubleMin/earlySingleMin 이 0 인 채로 남아, 바인 시각 자동판정이 전부 '없음'이 되고
    //   마감 스냅샷의 얼리도 0 으로 굳었다 — 설정은 적혀 있는데 숫자만 안 올라가는 상태.
    let earlyDMin = base.earlyDoubleMin ?? 0, earlySMin = base.earlySingleMin ?? 0;
    let earlyTiers = base.earlyTiers;   // W-04 — 진행 중 클락이면 기존 창 그대로(아래 분기에서만 다시 계산)
    // 연동 클락 얼리 설정 저장 — 진행 중 클락은 건드리지 않음(비파괴 병합)
    if (!clockState?.running) {
      // PL3: '지난 게임 그대로 열기'로 불러온 완성 클락 설정이 있으면 그게 베이스(빈 기본값보다 우선)
      const baseCfg = inheritClockRef.current.full ?? clockState?.config ?? defaultClockConfig();
      // PL1a+b: 연동 포스터의 구조(레벨·레지레벨·애드온)와 상금(원 정규형)을 클락에 함께 병합 —
      // '클락 설정 단계가 일상 운영에서 사라진다'(§13-B 최고 ROI 두 곳 중 ②). 폼에서 고친 값이 우선.
      const linkedSched = schedules.find((s) => s.id === schedId) ?? null;
      // 병합(포스터 구조·레지·얼리 단계·계단 스택·상금 → 프리셋 패치 → 폼)과 레벨→분 환산은 lib/ledgerStart 한 곳.
      //   clockPatchFromSchedule(linkedSched) · withDerivedEarly 가 그 안에서 돈다(포스터 등록 기준 — 클락 #1).
      const cfg = ledgerStartClockConfig(baseCfg, linkedSched, inheritClockRef.current.patch,
        { earlyBonus, doubleEarlyBonus, earlyDoubleLevel, earlySingleLevel, startStack, rebuyStack });
      const early = sessionEarlyOf(cfg);
      earlyDMin = cfg.earlyDoubleMin; earlySMin = cfg.earlySingleMin; earlyTiers = early.earlyTiers;
      // F2(2026-09-13): 새 클락은 단일 소스 emptyClockState 로 — 인라인 리터럴 `remainingMs: 0` 은 clockPhase 가
      //   'paused' 로 읽어 시작도 안 한 대회가 TV 에 PAUSED 로 뜨고, '계속하기' 를 누르면 endsAt=now 로 1레벨이 통째로 건너뛰었다.
      // 🔴 2026-09-17: 여기서 쓰던 `clockState` 는 이 폼이 **마운트될 때 한 번** 읽은 스냅샷이다(:2185, 구독 없음).
      //   장부 판은 keep-alive 라 세팅 폼이 열린 채 남는데, 그 사이 업주가 클락 판에서 게임을 시작하면
      //   이 스냅샷은 '정지·레벨 0' 인 채로 낡는다. 낡은 값으로 **전 행 upsert** 를 하면 진행 중인 대회가
      //   0 으로 초기화되고 TV·리모컨까지 realtime 으로 같이 튄다. 게다가 :2185 의 catch 가 조회 실패를
      //   삼켜 `clockState === null` 로 만들기 때문에 **네트워크가 한 번 흔들린 것만으로도** 같은 사고가 난다.
      //   `clock.ts:381` 이 경고하는 "조회 실패가 '클락 없음'이 되면 진행 중 대회가 0으로 덮인다" 가 바로 이 자리다.
      //   → 쓰기 직전에 다시 읽고, 진행 흔적이 있으면 **덮지 않는다**(TournamentClock.startClock 과 같은 조리법).
      //     그리고 실패를 더 이상 삼키지 않는다 — 설정이 안 넘어간 것을 업주가 알아야 한다.
      void (async () => {
        try {
          const fresh = await getClockState(base.venueId, base.gameSeq);
          // W-14 — 지난 날 멈춘 채 남은 클락(연결 장부 날짜·마지막 쓰기가 오늘이 아님)은 포스터 설정으로 새로 채운다.
          //   오늘 대회로 돌고 있거나 멈춘 클락은 예전처럼 보호한다(clockHasProgress). 판정은 lib/ledgerStart 한 곳.
          const action = clockStartAction(fresh, base.sessionDate);
          const row = clockStartRow(action, fresh, cfg, base.venueId, base.gameSeq, base.title ?? '');
          if (!row) {
            formToast.show('진행 중인 클락이 있어 클락 설정은 덮어쓰지 않았습니다', 'error');
            return;
          }
          await saveClockState(row);
          if (action === 'reset') formToast.show('지난 게임의 클락 기록을 정리하고 오늘 포스터 설정으로 새로 채웠습니다', 'info');
        } catch (e) {
          formToast.show(ledgerErrorText(e, '클락 설정 저장에 실패했습니다'), 'error');
        }
      })();
    }
    return onSubmit({
      ...base, title: title.trim() || undefined,
      buyinAmount: cash, cardAmount: card > 0 ? card : null,
      gameType, targetEntries: gameType === 'gtd' ? target : 0, maxEntries: gameType === 'entry' ? maxEntries : 0,
      isAddon, addonStack: isAddon ? addonStack : 0, addonAmount: isAddon ? addonAmount : 0, voucherIssued, voucherAccrualPerBin: accrualPerBin,
      eventMemo: event.trim() || undefined, dealers: dealers.trim() || undefined,
      scheduleId: schedId || null, openedBy: operIds[0] ?? null, operators: operIds,
      // ⚠ 압축 금지 — 바인은 discountIndex(1-based 자리번호)로 할인을 참조한다.
      //   filter로 빈 칸을 없애면 3번 할인을 쓰던 기존 바인이 2번 금액으로 바뀌거나 할인이 증발한다.
      //   빈 칸은 amount 0으로 자리만 남겨 두고(계산은 0원), 선택 목록에서만 감춘다.
      //   level(자동 적용 레벨)도 함께 보존한다 — 떨어뜨리면 세션 수정 한 번에 자동 적용이 조용히 꺼진다(#20).
      // W-28 — 적용 조건(kind)도 보존한다. 떨어뜨리면 세션 수정 한 번에 '리바인 전용' 이 아무 바인 할인으로 풀린다.
      discounts: discs.map((d) => ({ label: d.label ?? '', amount: d.amount > 0 ? d.amount : 0, level: d.level && d.level > 0 ? d.level : 0, ...(d.kind ? { kind: d.kind } : {}) })),
      earlyDoubleMin: earlyDMin, earlySingleMin: earlySMin, tournamentStart: tStart,
      ...(earlyTiers !== undefined ? { earlyTiers } : {}),
      ...(addonEntry !== undefined ? { addonEntry } : {}),
    });
  };

  // (역사) S2(2026-09-24) — 모바일 하단 고정 바가 포커스한 칸을 덮어 onFocusCapture 에서 scrollBy 로 올렸다.
  //   2026-09-25 오너 실기기에서 바 자체가 스크롤 내내 칸·칩·카드를 덮는다고 다시 지적 → 모바일은 바를 고정하지 않는다
  //   (아래 실행 버튼 주석). 덮을 바가 없으니 포커스 보정도 필요 없어 지웠다.
  return (
    <div className={embedded ? 'space-y-3' : 'rounded-card border border-accent-400/30 bg-linear-to-br/srgb from-accent-300/5 to-transparent p-3 space-y-2.5'}>
      {mode === 'open' && (
        <div>
          <h3 className="text-sm font-bold text-accent-300">장부 시작 설정</h3>
          <p className="text-2xs text-ink-muted mt-0.5">담당직원: <b className="text-ink-secondary">{operatorName}</b></p>
          {prefilled && <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-400 mt-0.5"><Icon name="check-circle" size={14} className="shrink-0 mt-px" />직전 게임 설정을 불러왔습니다. 바로 시작하거나 수정하세요.</p>}
          {autoLinked && <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-400 mt-0.5"><Icon name="check-circle" size={14} className="shrink-0 mt-px" />오늘 포스터 자동 연동. 게임명·바인·유형·스택 입력됨, 블라인드·레지·상금은 클락에 함께 적용(수정 가능).</p>}
          {/* PL1a: 당일 포스터 2개+ — 자동연동이 침묵하던 케이스에 선택 칩(§13-B '자동화는 항상 되거나, 왜 안 되는지 보이거나') */}
          {!autoLinked && !schedId && todayPick.length >= 2 && (
            <div className="mt-1.5">
              <p className="text-xs font-semibold text-amber-300">오늘 포스터 {todayPick.length}개 — 어느 게임의 장부인가요?</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {todayPick.map((sc) => (
                  <button key={sc.id} type="button"
                    onClick={() => { setAutoLinked(true); setTodayPick([]); applySchedInheritRef.current(sc); }}
                    className="rounded-input border border-accent-400/40 bg-accent-300/10 px-2.5 py-1.5 text-2xs font-bold text-accent-300 transition-colors hover:bg-accent-300/20">
                    {sc.startTime ? `${sc.startTime} · ` : ''}{sc.title}
                  </button>
                ))}
                <button type="button" onClick={() => setTodayPick([])}
                  className="rounded-input border border-border-default px-2.5 py-1.5 text-2xs font-bold text-ink-muted transition-colors hover:text-ink-secondary">
                  연동 안 함
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PL3①: 스냅샷이 최우선 후보 — 마지막 마감 회차를 1탭으로 그대로(§13-B 생성 경로 역전) */}
      {mode === 'open' && lastRound && (
        <button type="button" onClick={() => applyLastRound(lastRound)} data-testid="open-last-round"
          className="flex w-full items-center gap-2 rounded-input border border-emerald-500/40 bg-emerald-500/8 px-3 py-2.5 text-left transition-colors hover:bg-emerald-500/[0.14]">
          <Icon name="refresh" size={16} className="shrink-0 text-emerald-400" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-emerald-300">
              지난 게임 그대로 열기 — {lastRound.session.sessionDate.slice(5).replace('-', '/')} {lastRound.session.title || '제목 없음'}
            </span>
            <span className="block text-2xs text-ink-muted">
              단가·할인·딜러{lastRound.clockConfig ? '·블라인드·얼리·상금' : ''}까지 한 번에 — 날짜·담당 직원만 확인하세요
            </span>
          </span>
        </button>
      )}
      {mode === 'open' && copyMain && (base.gameSeq ?? 1) > 1 && (
        <button type="button" onClick={applyCopyMain}
          className="w-full flex items-center justify-center gap-1.5 rounded-input border border-accent-400/50 px-3 py-2.5 text-sm font-bold text-accent-300 transition-colors hover:bg-accent-300/20">
          <Icon name="clipboard" size={16} className="shrink-0" />메인 게임 설정 그대로 복사 (단가·할인·딜러·유형)
        </button>
      )}
      {/* PL2c: 게임 프리셋(공용 PresetPicker) — 저장된 프리셋 1개로 장부+클락 몫까지 프리필 */}
      {mode === 'open' && (
        <PresetPicker venueId={base.venueId} scope="ledger" onApply={applyGamePresetToForm} />
      )}
      {mode === 'open' && presets.length > 0 && (
        <Field label="최근 게임 · 클릭하면 아래 내용 자동입력(수정 가능)">
          <button type="button" onClick={() => setPresetOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3.5 py-3 rounded-input border border-accent-400/40 bg-accent-300/10 text-base font-bold text-accent-300 hover:bg-accent-300/15 transition-colors">
            <span className="inline-flex items-center gap-1.5"><Icon name="clipboard" size={16} className="shrink-0" />{presetOpen ? '최근 게임 닫기' : `최근 게임에서 불러오기 (${presets.length})`}</span>
            <span className="text-sm">{presetOpen ? '▲' : '▼'}</span>
          </button>
          <Fold open={presetOpen}>
            <div className="mt-1 max-h-52 overflow-y-auto rounded-input border border-border-subtle bg-surface-base divide-y divide-border-subtle">
              {presets.map((p, i) => (
                <button key={i} type="button" onClick={() => { applyPreset(p); setPresetOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-high transition-colors">
                  {i < 3 && <span className="shrink-0 text-2xs font-bold text-accent-300 bg-accent-300/15 px-1.5 py-0.5 rounded-badge">최근</span>}
                  <span className="flex-1 min-w-0 text-sm font-semibold text-ink-primary truncate">{p.title}</span>
                  <span className="shrink-0 text-sm text-ink-muted tabular-nums">{wonToMan(p.buyinAmount)}만</span>
                </button>
              ))}
            </div>
          </Fold>
          <p className="text-xs text-ink-muted mt-1">담당 직원은 아래에서 따로 선택하세요.</p>
        </Field>
      )}

      <Field label="금일 게임 내용">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 데일리 딥스택" maxLength={40} className="input w-full text-sm" />
      </Field>

      {schedules.length > 0 && (
        <Field label="기존 포스터 불러오기 · 선택">
          <select value={schedId}
            onChange={(e) => {
              const id = e.target.value; setSchedId(id);
              const sc = schedules.find((s) => s.id === id);
              // A1(2026-09-28) — 수동 선택도 자동 연동과 **같은 상속**(제목·단가·유형 + 스택·리바인·애드온·시작 시각).
              //   예전엔 앞의 세 칸만 채워, 제출 때 폼 스택(기본 50,000)이 포스터 스택을 덮어 TV 평균 스택이 틀렸다.
              if (sc) applySchedInheritRef.current(sc);
            }}
            className="input w-full text-sm">
            <option value="">연결 안 함 / 직접 입력</option>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.date} · {s.title} · 바인 {(s.buyIn?.amount ?? 0).toLocaleString()}</option>)}
          </select>
        </Field>
      )}

      {operatorOptions.length > 0 && (
        <Field label={`담당 직원 · 최대 10명 (${operIds.length} 선택)`}>
          <div className="flex flex-wrap gap-1.5">
            {operatorOptions.map((o) => {
              const on = operIds.includes(o.id);
              return (
                <button key={o.id} type="button" onClick={() => toggleOper(o.id)}
                  className={['text-xs font-semibold px-2.5 py-1.5 rounded-badge border transition-colors',
                    on ? 'bg-accent-300 text-white border-accent-300' : 'bg-surface-high text-ink-secondary border-border-default hover:text-ink-primary'].join(' ')}>
                  {on ? '✓ ' : ''}{o.label}
                </button>
              );
            })}
          </div>
          <p className="text-2xs text-ink-muted mt-1">담당 직원만 열람·운영 가능(업주·운영자는 전체 접근). 후보는 장부 권한 직원.</p>
          {operatorOptionsPartial && (
            <p role="status" className="mt-1.5 rounded-input border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-2xs text-ink-primary">
              권한 직원 전체 목록은 업주·운영자 계정에서만 불러올 수 있어요 — 지금 보이는 후보는 전부가 아닐 수 있어요.
              담당을 비워 두면 장부 권한 직원 모두가 이 장부를 열 수 있어요.
            </p>
          )}
          {operatorOptionsError != null && (
            <div role="alert" className="mt-1.5 flex flex-wrap items-center gap-2 rounded-input border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5">
              <span className="flex-1 min-w-0 text-2xs text-ink-primary">권한 직원 목록을 불러오지 못했어요. 다시 시도해 주세요. (지금 보이는 후보는 전부가 아닐 수 있어요)</span>
              {onRetryOperatorOptions && (
                <button type="button" onClick={onRetryOperatorOptions}
                  className="shrink-0 text-2xs font-bold px-2.5 py-1 rounded-badge border border-amber-500/40 text-amber-400 hover:bg-amber-500/15 transition-colors">
                  다시 시도
                </button>
              )}
            </div>
          )}
        </Field>
      )}

      {/* D1: 바인이 한 건이라도 기록된 뒤에는 단가·할인을 못 고친다. 입력을 하나씩 disabled 로 다는 대신
          fieldset 하나로 감싼다 — 중첩된 input·button 이 전부 네이티브로 잠기고, 나중에 칸이 늘어도 자동으로 덮인다. */}
      {lockPricing && (
        <p className="rounded-input border border-accent-400/40 bg-accent-300/10 px-2.5 py-2 text-2xs leading-relaxed text-accent-200">
          이미 기록된 바인이 있어 <b>단가와 기존 할인은 잠겨 있습니다</b> — 바꾸면 이미 저장된 바인의
          엔트리·달성률까지 <b>소급해서 바뀝니다</b>. 금액을 잘못 넣었다면 해당 바인 기록을 지운 뒤 고쳐 주세요.<br />
          다만 <b>할인은 뒤에 새로 추가할 수 있습니다</b> — 기존 바인은 자리번호로 할인을 참조해 영향이 없습니다.
        </p>
      )}
      {/* D1 잠금은 **단가 두 칸에만** 건다. 할인은 아래에서 행별로 잠근다 —
          기존 자리는 잠그되 **새 행 추가는 열어 둔다**(바인이 자리번호로 참조하므로 뒤에 붙이면 소급 영향 0). */}
      <fieldset disabled={lockPricing} className="contents">
      <div className="grid grid-cols-2 gap-2">
        <Field label="현금단가(만원) *">
          <input type="number" inputMode="decimal" step="0.1" min="0" value={manVal(cash)} onChange={(e) => setCash(parseMan(e.target.value))} placeholder="10" className="input w-full text-sm tabular-nums" />
        </Field>
        <Field label="카드단가(만원) · 선택">
          <input type="number" inputMode="decimal" step="0.1" min="0" value={manVal(card)} onChange={(e) => setCard(parseMan(e.target.value))} placeholder="미입력=현금단가" className="input w-full text-sm tabular-nums" />
        </Field>
      </div>
      </fieldset>

      <Field label="할인 이벤트 (최대 5) · 선택">
        <div className="space-y-1.5">
          {/* 포스터에 적은 할인을 다시 타이핑하지 않게 — 연결 포스터에 할인액이 있을 때만 보인다 */}
          {posterDiscs.length > 0 && (
            <button type="button" onClick={importPosterDiscs}
              className="flex w-full items-center gap-1.5 rounded-input border border-accent-400/40 bg-accent-300/10 px-2 py-1.5 text-2xs font-bold text-accent-300 transition-colors hover:bg-accent-300/15">
              <Icon name="copy" size={13} className="shrink-0" />
              포스터 할인 가져오기 ({posterDiscs.length}개)
              <span className="min-w-0 flex-1 truncate text-right font-normal text-ink-muted">
                {posterDiscs.map((p) => `${ledgerLabelOf(p)} −${wonToMan(p.discountWon ?? 0)}만`).join(' · ')}
              </span>
            </button>
          )}
          {discs.map((d, i) => {
            // 바인이 있으면 **이미 저장돼 있던 자리**만 잠근다. 새로 추가한 행은 자유롭게 입력할 수 있다.
            const rowLocked = lockPricing && i < (base.discounts?.length ?? 0);
            return (
            // #9(FULL-RECHECK-2/C) — 390 에서 한 줄 5칸이면 라벨 칸 글자 공간이 43.5px 라 '1레벨 얼리버드 할인'(117px)이 잘렸다.
            //   좁은 폭(<sm)은 라벨이 첫 줄을 다 쓰고 금액·LV·✕ 가 둘째 줄로 내려간다(sm 이상은 종전 한 줄 그대로).
            <fieldset key={i} disabled={rowLocked} className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
              <span className="w-9 shrink-0 text-2xs font-bold text-accent-300">할인{i + 1}</span>
              <input value={d.label} onChange={(e) => setDisc(i, { label: e.target.value })} maxLength={20} placeholder="예) 1레벨" className="input min-w-0 grow basis-[calc(100%-3rem)] text-sm sm:basis-0" />
              {/* #11(2026-09-25) — w-20 에 '23.4567' 이 글자 공간 45px 에 57px 로 잘렸다(끝자리가 안 보여 금액을 잘못 읽는다) → w-24. */}
              <div className="relative w-24 shrink-0 max-sm:ml-10.5">
                <input type="number" inputMode="decimal" step="0.1" min="0" max={minUnit > 0 ? minUnit / WON_PER_MAN : undefined} value={manVal(d.amount)} onChange={(e) => setDisc(i, { amount: parseMan(e.target.value) })} placeholder="금액" aria-invalid={badDisc === i}
                  className={['input w-full pr-6 text-sm tabular-nums', badDisc === i ? 'border-danger text-danger-light' : ''].join(' ')} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">만</span>
              </div>
              {/* #20: 이 칸이 '자동 적용'의 전부다. 비워 두면 예전과 똑같이 수기 선택 전용으로 남는다. */}
              {/* ⚠ 폭 주의(2026-09-15 오너 리포트 "LV 칸에 한 글자만 보인다"):
                  w-16(68px) − pl-3(12.75) − pr-6(25.5) = 글자 공간 **29.75px** 인데 placeholder '자동' 이
                  text-sm(14.875px)×2 = **29.75px** 로 정확히 경계라 한 글자에서 잘렸다. 여유를 준다.
                  줄이려면 placeholder 를 먼저 줄여라 — 폭만 줄이면 같은 자리로 돌아온다. */}
              <div className="relative w-19 shrink-0">
                <input type="number" inputMode="numeric" min="0" max="60" value={d.level || ''} onChange={(e) => setDisc(i, { level: Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)) })} placeholder="자동" className="input w-full pr-6 text-sm tabular-nums" />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">LV</span>
              </div>
              <button type="button" onClick={() => removeDisc(i)} aria-label={`할인${i + 1} 비우기`} className="flex h-9 w-9 shrink-0 items-center justify-center text-xs text-ink-muted hover:text-danger-light">✕</button>
            </fieldset>
            );
          })}
          {discs.length < 5 && (
            <button type="button" onClick={addDisc} className="w-full rounded-input border border-dashed border-border-default py-1.5 text-2xs text-ink-secondary transition-colors hover:border-accent-400/50 hover:text-accent-300">+ 할인 추가</button>
          )}
          <p className="text-2xs leading-relaxed text-ink-muted">
            할인은 <b className="text-accent-300">금액에서만</b> 차감합니다 — 예) 10만 게임에 5만 할인 = 적용금액 5만원 · 바인 <b className="text-accent-300">1회</b> · 엔트리 <b className="text-accent-300">0.5</b>.<br />
            {badDisc >= 0 && (
              <b className="block text-danger-light">
                할인{badDisc + 1}이 단가({wonToMan(minUnit)}만{card > 0 && card !== cash ? ' · 현금·카드 중 낮은 쪽' : ''})보다 큽니다 —
                단가 이하로 고쳐 주세요. (단가와 같은 100% 할인은 됩니다 = 무료 이벤트)
              </b>
            )}
            <b className="text-accent-300">LV</b> 칸에 레벨을 적으면 <b className="text-accent-300">그 레벨까지 들어온 바인에 자동 적용</b>됩니다(예: 1LV 5만 · 2LV 3만 → 1레벨 5만, 2레벨 3만, 3레벨부터 없음). 결제창에서 언제든 바꿀 수 있습니다.
          </p>
        </div>
      </Field>

      {/* 2026-09-14: 375 에서 `기준)` 이 고아로 떨어졌다 — 괄호 설명을 줄여 한 줄에 맞춘다(아래 설명 줄이 전체를 말한다). */}
      <Field label="대회 시작 시각 · 선택">
        <DateTimePicker value={startISO} onChange={setStartISO} defaultDate={base.sessionDate} placeholder="스타트 날짜·시각 선택" />
        <p className="text-2xs text-ink-muted mt-1 leading-relaxed">
          얼리 구간은 <b className="text-accent-300">「클락」 설정의 레벨 기준</b> — 클락 연동 시 스타트 시각으로 자동 분류되고, 바인 칸에서 수기 변경도 됩니다.
          {(base.earlyDoubleMin || base.earlySingleMin) ? <span className="text-accent-300/90"> 현재 적용: 더블 ~{base.earlyDoubleMin}분 · 1얼리 ~{base.earlySingleMin}분.</span> : null}
        </p>
      </Field>

      <Field label="스택 · 연동 클락 (스타팅 · 리바인)">
        <div className="grid grid-cols-2 gap-2">
          <EarlyNum label="스타팅 스택" value={startStack} onChange={setStartStack} suffix="칩" disabled={!!clockState?.running} />
          <EarlyNum label="리바인 스택" value={rebuyStack} onChange={setRebuyStack} suffix="칩" disabled={!!clockState?.running} />
        </div>
      </Field>

      <Field label="얼리 설정 · 연동 클락 (추가 스택 · 레벨)">
        <div className="grid grid-cols-2 gap-2">
          <EarlyNum label="더블얼리 추가스택" value={doubleEarlyBonus} onChange={setDoubleEarlyBonus} suffix="칩" disabled={!!clockState?.running} />
          <EarlyNum label="1얼리 추가스택" value={earlyBonus} onChange={setEarlyBonus} suffix="칩" disabled={!!clockState?.running} />
          <EarlyNum label="더블얼리 마감레벨" value={earlyDoubleLevel} onChange={setEarlyDoubleLevel} suffix="LV" disabled={!!clockState?.running} />
          <EarlyNum label="1얼리 마감레벨" value={earlySingleLevel} onChange={setEarlySingleLevel} suffix="LV" disabled={!!clockState?.running} />
        </div>
        <p className="text-2xs text-ink-muted mt-1 leading-relaxed">
          {clockState?.running
            ? '클락이 진행 중이라 얼리 설정은 클락 화면에서만 변경할 수 있습니다.'
            : '여기서 변경하면 연동 클락 설정에 반영됩니다(장부 시작 시 저장). 예) 더블얼리 1LV · 1얼리 4LV.'}
        </p>
      </Field>

      <Field label="게임 유형">
        <div className="grid grid-cols-2 gap-2">
          {([['gtd', 'GTD (보장)'], ['entry', '엔트리 게임']] as const).map(([k, lbl]) => (
            <button key={k} type="button" onClick={() => setGameType(k)}
              className={['py-2 rounded-input border text-sm font-bold transition-colors',
                gameType === k ? 'bg-accent-300/15 text-accent-300 border-accent-400/50' : 'bg-surface-high text-ink-secondary border-border-default'].join(' ')}>{lbl}</button>
          ))}
        </div>
      </Field>

      {gameType === 'gtd' ? (
        <Field label="기준 엔트리(통계용) · 선택">
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" value={target || ''} onChange={(e) => setTarget(Math.max(0, parseInt(e.target.value, 10) || 0))} placeholder="100" className="input w-32 shrink-0 text-sm tabular-nums" />
            <span className="text-2xs text-ink-muted leading-snug">통계의 목표 달성률에 사용</span>
          </div>
        </Field>
      ) : (
        <Field label="맥스 엔트리 · 선택">
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" value={maxEntries || ''} onChange={(e) => setMaxEntries(Math.max(0, parseInt(e.target.value, 10) || 0))} placeholder="200" className="input w-32 shrink-0 text-sm tabular-nums" />
            <span className="text-2xs text-ink-muted leading-snug">최대 참가 인원 · 무제한이면 비움</span>
          </div>
        </Field>
      )}

      <Field label="애드온 게임 여부">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setIsAddon((v) => !v)}
            className={['px-3 py-2 rounded-input border text-sm font-bold transition-colors shrink-0',
              isAddon ? 'bg-accent-300/15 text-accent-300 border-accent-400/50' : 'bg-surface-high text-ink-secondary border-border-default'].join(' ')}>
            {isAddon ? '✓ 애드온 게임' : '애드온 없음'}
          </button>
          {isAddon ? (
            <div className="flex min-w-64 max-w-88 flex-1 gap-2">
              <div className="relative min-w-0 flex-1">
                <input type="number" inputMode="numeric" value={addonStack || ''} onChange={(e) => setAddonStack(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="스택" aria-label="애드온 스택" className="input w-full text-sm pr-7 tabular-nums" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">칩</span>
              </div>
              <div className="relative min-w-0 flex-1">
                <input type="number" inputMode="numeric" min={0} step={1000} value={addonAmount || ''} onChange={(e) => setAddonAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="가격" aria-label="애드온 가격(원)" data-testid="ledger-addon-price" className="input w-full text-sm pr-7 tabular-nums" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">원</span>
              </div>
            </div>
          ) : (
            <span className="text-2xs text-ink-muted leading-snug">애드온이 있으면 켜서 스택과 가격을 입력하세요.</span>
          )}
        </div>
      </Field>

      <Field label="매장이용권 전송/시상 · 선택 (당일 전송 장수)">
        <div className="relative w-40">
          <input type="number" inputMode="numeric" value={voucherIssued || ''} onChange={(e) => setVoucherIssued(Math.max(0, parseInt(e.target.value, 10) || 0))}
            placeholder="0" className="input w-full text-sm pr-7 tabular-nums" />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted pointer-events-none">장</span>
        </div>
      </Field>

      {/* W2-2 VCH-1b: '바인 1회당 이용권 자동 적립' 입력 UI 제거 — 문체부 '적립→입장료' 패턴 회피(§12-A-3).
          accrualPerBin state·voucherAccrualPerBin write 는 유지(제거 시 세션 저장이 전 매장 설정을 0 으로 덮는 함정 — §18.4).
          이용권 지급은 순위/수동 발급 경로만 남는다. */}

      <Field label="이벤트 · 비고 · 선택">
        <textarea value={event} onChange={(e) => setEvent(e.target.value)} rows={2} placeholder="예) 1만원 추가 = 1스택 추가" maxLength={200} className="input w-full text-sm resize-none" />
      </Field>

      {/* 🔴 2026-09-18 오너: "금일 딜러를 지금 가게에 등록되어 있는 딜러 리스트를 선택하게 만들어줘야지
          이걸 적게 만들면 안돼 ... 첫째줄에는 딜러를 선택하고 둘째 줄에는 딜러를 적을 수 있게".
          첫 줄 = 등록 딜러 토글 칩 / 둘째 줄 = 직접 입력(비회원·대타 등 명부에 없는 사람).
        ⚠ 저장 형식은 **줄바꿈 구분 문자열 그대로**다(ledger_sessions.dealers text).
          바꾸면 game_presets.dealers · gameInherit(프리셋↔세션) · syncDealersToSchedule 세 곳이 동시에 깨진다.
          칩은 그 문자열을 편집하는 또 하나의 손잡이일 뿐이다. */}
      <Field label="금일 딜러 명단 · 선택">
        {dealerOptions.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {dealerOptions.map((name) => {
              const on = dealerSet.has(name);
              return (
                <button key={name} type="button" aria-pressed={on} onClick={() => toggleDealer(name)}
                  className={[
                    'min-h-[32px] rounded-full border px-2.5 text-xs font-bold transition-colors',
                    on ? 'border-accent-300/60 bg-accent-500/20 text-accent-100'
                       : 'border-border-default bg-surface-high text-ink-secondary hover:bg-surface-float/60',
                  ].join(' ')}>
                  {on && <span aria-hidden className="mr-1">✓</span>}{name}
                </button>
              );
            })}
          </div>
        )}
        <textarea value={dealers} onChange={(e) => setDealers(e.target.value)} rows={2}
          placeholder={dealerOptions.length > 0 ? '명부에 없는 딜러는 여기에 한 줄에 한 명' : '한 줄에 한 명'}
          maxLength={300} className="input w-full text-sm resize-none" />
        <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
          {dealerOptions.length > 0
            ? <>위 칩은 <b className="text-ink-secondary">매장에 등록된 직원·딜러</b>입니다(직원 관리 · 인건비 명부). 눌러서 넣고 뺍니다.</>
            : '등록된 직원·딜러가 없어 목록이 비었습니다 — 내 매장 › 직원에서 등록하면 여기서 고를 수 있습니다.'}
        </p>
      </Field>

      {/* sticky — 필드 15+ 폼이라 실행 버튼이 화면 밖으로 밀렸다. 매일 반복하는 화면이니 항상 보이게 */}
      {/* 🔴 `bottom-0` 이면 **모바일 하단 탭바(fixed z-50) 밑에 깔린다** — 실측(2026-09-18):
          360 '장부 시작' [30.8,735,298×41] vs 탭바 [0,705.75,360×74] → 버튼이 **전면 가림**.
          390 도 동일. 탭바가 스크롤로 자동숨김된 동안에만 보였다 = 매일 쓰는 실행 버튼이 안 눌린다.
          `--tabbar-safe` 는 이 저장소의 **탭바 회피 단일 소스**다(index.css) — 임의 상수를 새로 만들지 않는다.
          PC(lg+)에는 하단 탭바가 없으므로 종전대로 bottom-0. */}
      {/* ⚠ `pr-12` — 스크롤 뒤 나타나는 '맨 위로' FAB(`.scroll-top-fab`, `bottom-(--tabbar-float) right-4`)가
          같은 기준선에 서서 실행 버튼 오른쪽 끝을 덮었다(실측 360: 겹침 28×41 ≈ 1,173px²).
          글자는 가운데라 안 가려지고 탭도 됐지만 그림이 겹친다 — FAB 폭(42.5)+여백만큼 비켜 준다. */}
      {/* 🔴 2026-09-25 오너 실기기(412 · 삼성 인터넷/크롬): 모바일에서 이 막대가 **본문 중간에 떠서** 담당 직원 칩·입력칸을
          덮은 채 스크롤해도 사라지지 않았다. 실측(수정 전 빌드): 폼 첫머리·중간 스크롤에서 막대가 컨트롤을
          360 4,170/2,641px² · 390 5,461/5,548 · 412 13,953/2,109 덮었다(e2e/mystore-ledger-start-bar.spec.ts).
          모바일 화면 높이에서 '탭바 위 고정'은 바닥 105px + 막대 50px 를 입력칸 위에 영구히 얹는다 — 가리지 않는 고정은 없다.
          → 하단 탭바가 있는 폭(<lg)은 **폼 끝의 일반 버튼**(흐름 배치). 끝까지 내리면 탭바 위로 올라온다(푸터 예약).
          PC(lg+)는 종전 sticky bottom-0 그대로. */}
      <div className={['lg:sticky lg:bottom-0 -mx-1 flex gap-2 px-1 pb-1 pr-12 pt-2 backdrop-blur-xs lg:pr-1', mode === 'edit' ? 'bg-surface-mid/90' : 'bg-surface-base/90'].join(' ')}>
        {onCancel && <button type="button" onClick={onCancel} className="btn-ghost text-sm flex-1">취소</button>}
        <button type="button" onClick={submit} disabled={cash <= 0 || submitting} className="btn-primary text-sm flex-1 disabled:opacity-50">
          {submitting ? '저장 중…' : mode === 'open' ? '장부 시작' : '저장'}
        </button>
      </div>
      {/* role=alert: 저장 버튼이 왜 잠겼는지 보조기술에도 들리게(FORM-01) */}
      {cash <= 0 && <p role="alert" className="text-2xs text-danger-light">현금단가를 입력하세요.</p>}
    </div>
  );
}

// 주의: <label> 로 감싸면 라벨 영역 클릭 시 내부 "첫 번째" labelable 요소(button 포함)가
// 활성화되어, 버튼 그룹(담당직원 등)에서 "줄 아무 곳이나 눌러도 첫 번째가 선택"되는 버그가 난다.
// → 컨테이너는 <div> 로, 라벨 텍스트는 <span> 로 둔다.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="block text-sm font-semibold text-ink-secondary mb-1">{label}</span>
      {children}
    </div>
  );
}

// ── 오버레이(모달 셸) ─────────────────────────────────────────────────────────
// Modal 원자로 셸만 교체(MODAL-03): 손으로 짠 셸은 aria-modal 만 선언하고 포커스 이동·트랩·복원·ESC 겹 판정이
// 없었다. 원자가 뒤로가기·ESC(최상단 한 겹)·포커스·스크롤 잠금·44px 닫기를 전부 준다.
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal open onClose={onClose} title={title} variant="center" maxWidth="md">
      <div className="p-4">{children}</div>
    </Modal>
  );
}

// ── 2-Tap 결제 입력 모달 ──────────────────────────────────────────────────────
interface SplitInput { cashAmount: number; cardAmount: number; transferAmount: number; ticketCount: number; unpaidAmount: number; discountIndex: number; }

function PaymentModal({ cell, hasPw, canManage = false, session, onClose, onPick, onPickSplit, onCancelBuyin, onSetEarly, onSetAddon, lastPick, busy = false, levelNo = 0, autoDiscIdx = 0, autoFromLevel = true, autoEarly = null, reduceAsk = false, onReduceConfirm }: {
  cell: SelectedCell; hasPw: boolean; session: LedgerSession;
  /** 애드온 행(2026-09-28) — 기록된 바인에 애드온을 붙이거나 뗀다. null = 없음 */
  onSetAddon?: (addon: { method: AddonMethod; unpaid: boolean } | null) => void;
  /** 방금 누른 수정이 매출을 줄여 취소 비밀번호가 필요하다(LEDGER-REDUCE-PASSWORD) */
  reduceAsk?: boolean;
  onReduceConfirm?: (pw: string) => void;
  /** 연동 클락의 지금 레벨(1-based, 0=미연동) — 얼리·할인 자동 적용의 근거를 화면에 밝힌다 */
  levelNo?: number;
  /** 그 레벨에서 자동 적용될 할인 자리번호(0=없음). 신규 기록의 초기값일 뿐 — 언제든 바꿀 수 있다(#20) */
  autoDiscIdx?: number;
  /** autoDiscIdx 의 출처 — true=클락 레벨 자동, false=보드 상단에서 운영자가 고정한 값. 문구를 정직하게 가른다. */
  autoFromLevel?: boolean;
  /** 신규 기록이 지금 저장되면 확정될 얼리 유형(null=클락 미연동 → 시각 자동판정에 맡김) */
  autoEarly?: EarlyType | null;
  onClose: () => void;
  /** 저장 처리 중 — 모든 기록 버튼 비활성(더블탭 이중 기록 방지) */
  busy?: boolean;
  /** 같은 손님의 직전 바인 반복용 원탭(신규 기록일 때만) — null 이면 미표시 */
  lastPick?: { method: PaymentMethod; isUnpaid: boolean; discountIndex: number; label: string } | null;
  onPick: (m: PaymentMethod, isUnpaid: boolean, discountIndex: number) => void;
  onPickSplit: (d: SplitInput) => void;
  onCancelBuyin: (pw: string) => void;
  canManage?: boolean;
  onSetEarly: (override: EarlyType | null) => void;
}) {
  const [cancelMode, setCancelMode] = useState(false);
  // 분납 셀도 저장된 할인 이벤트를 그대로 복원한다.
  // ⚠ 과거엔 분납이면 무조건 0으로 시작해, 금액만 고쳐 재저장할 때마다 할인 기록이 지워졌다.
  // #20: 신규 기록은 '지금 레벨의 할인'을 미리 골라 둔다(자동 적용). 기존 기록은 저장값이 정본.
  const discs = session.discounts ?? [];
  // W-28 — 할인의 적용 조건(리엔트리 전용·첫 바인 전용)이 이 칸의 순번과 안 맞으면 고를 수 없다(서버 트리거도 같은 규칙으로 막는다).
  //   이미 저장된 행의 할인은 조건이 안 맞아도 보여 준다(기록을 숨기면 무엇이 적용됐는지 모른다).
  const discOk = (i: number) => discountAllowed(discs[i], cell.entryNo) || cell.buyin?.discountIndex === i + 1;
  const autoOk = autoDiscIdx > 0 && discountAllowed(discs[autoDiscIdx - 1], cell.entryNo) ? autoDiscIdx : 0;
  const [discIdx, setDiscIdx] = useState<number>(cell.buyin ? cell.buyin.discountIndex : autoOk);
  // 자동으로 골라준 값을 사람이 그대로 두고 있는가 — 배지 문구를 '자동/직접'으로 정직하게 가른다.
  const autoKept = !cell.buyin && autoOk > 0 && discIdx === autoOk;
  // 수납 상태(완납/미수)를 먼저 고르고 수단을 누른다 — 8버튼 격자를 4+토글로 접는다(#22).
  // 티켓·가게지원까지 같은 규칙 아래 모여, '이 조합이 가능한가'를 매번 외우지 않아도 된다.
  const [unpaidMode, setUnpaidMode] = useState<boolean>(cell.buyin?.isUnpaid ?? false);
  const payMethods: { key: PaymentMethod; label: string }[] = [
    { key: 'cash', label: '현금' }, { key: 'card', label: '카드' },
    { key: 'transfer', label: '이체' }, { key: 'ticket', label: '티켓' },
  ];
  const discWon = discountAmountOf(session, discIdx);
  /** 그 수단으로 실제 받게 될 금액(원) — 티켓/지원은 현금 수납이 아니라 null.
   *  ⚠ 2026-09-11: 결제수단은 바인 가치를 바꾸지 않는다(오너 규칙) — 카드도 **현금 단가**다.
   *    예전엔 여기만 cardUnit(카드단가)을 써서, 모달은 '카드 11만' 이라 안내하는데
   *    실제 저장(nonSplitSnapshot)은 10만이었다. 안내와 기록이 갈리면 접수대가 손님에게 틀린 금액을 부른다.
   *    카드단가 컬럼은 수수료 회계용으로 남겨 두되 이 화면은 쓰지 않는다. */
  const dueOf = (m: PaymentMethod): number | null => {
    if (m === 'ticket' || m === 'support') return null;
    return Math.max(0, session.buyinAmount - discWon);
  };

  // 분납/할인 상세
  const init = cell.buyin?.isSplit ? cell.buyin : null;
  // #10(2026-09-27) — 기존 완납·미수 기록을 분납으로 고치면 0 에서 시작해 '100만원 부족' 부터 떴다.
  //   지금 기록의 수납 내역(tender = 할인 적용 후)을 칸에 채운다. 가게지원은 분납 칸이 없어 0 에서 시작한다.
  const pre = !init && cell.buyin && cell.buyin.paymentMethod !== 'support' ? buyinFinance(cell.buyin, session).tender : null;
  const preT = pre && pre.ticket % TICKET_WON === 0 ? pre.ticket / TICKET_WON : 0;
  const [splitMode, setSplitMode] = useState(!!init);
  const [cash, setCash]         = useState<number>(init?.cashAmount ?? pre?.cash ?? 0);
  const [card, setCard]         = useState<number>(init?.cardAmount ?? pre?.card ?? 0);
  const [transfer, setTransfer] = useState<number>(init?.transferAmount ?? pre?.transfer ?? 0);
  const [tkt, setTkt]           = useState<number>(init?.ticketCount ?? preT);
  const [unpaidAmt, setUnpaidAmt] = useState<number>(init?.unpaidAmount ?? pre?.unpaid ?? 0);
  // ⚠ 티켓을 빼면 화면이 저장값과 다른 말을 한다 — 카드 4만 + 6T 를 넣어도 '합계 4만원'이라
  //   적어 놓고 저장은 10만(entry 1.0)으로 한다. 티켓만 10T 면 '합계 0만원'인데 저장은 된다
  //   (바로 아래 canSaveSplit 이 tkt>0 만으로도 허용한다 — 합계가 0인데 저장되는 모순).
  //   buyinFinance 분납 분기(ledger.ts ticketWon)와 같은 식으로 단가 환산해 맞춘다.
  const splitTotal = cash + card + transfer + unpaidAmt + tkt * TICKET_WON;
  // 분납 합계가 **단가 − 할인** 과 맞는가. splitMismatch 는 정의·문서·테스트까지 있었는데
  // **프로덕션 호출부가 0곳**이었다(2026-09-11 감사) — 검증 함수만 있고 게이트가 없었다.
  // 그래서 10만 게임에 현금 4만 + 카드 4만을 넣어도 그대로 저장됐고, buyinFinance 가
  // 그 8만을 value 로 받아 **엔트리 0.8** 로 셌다. 미수 칸은 0이라 사라진 2만은 흔적이 없다.
  // 부족분을 남기고 싶으면 '미수' 칸에 적는 것이 정본 경로다 — 그래야 미수금 회수 목록에 오른다.
  const mismatch = splitMismatch(
    { cashAmount: cash, cardAmount: card, transferAmount: transfer, ticketCount: tkt, unpaidAmount: unpaidAmt, discountIndex: discIdx },
    session,
  );
  /** 이 바인으로 받아야 할 금액(원) = 단가 − 할인. splitMismatch 의 기준값을 되돌려 얻는다. */
  const splitDue = splitTotal - mismatch;
  const canSaveSplit = (splitTotal > 0 || tkt > 0) && mismatch === 0;
  const submitSplit = () => onPickSplit({ cashAmount: cash, cardAmount: card, transferAmount: transfer, ticketCount: tkt, unpaidAmount: unpaidAmt, discountIndex: discIdx });

  // 셸은 Modal 원자(MODAL-03) — 뒤로가기·ESC(최상단 한 겹)·포커스 트랩·복원을 원자가 준다. 개별 ESC 리스너 금지.
  // F2(2026-09-29): sm(408px)에선 할인 프리셋 3개가 세 줄로 접혀 애드온 줄이 1280×800 첫 화면 밖으로 밀렸다 — md 로 넓힌다(폰은 어차피 화면 폭).
  return (
    <Modal open onClose={onClose} title={`${cell.entryNo}바인 · ${cell.playerName}`} variant="center" maxWidth="md">
        <div className="p-3 space-y-2">
          {/* LEDGER-REDUCE-PASSWORD — 금액 축소·0원·가게지원·미수 전환처럼 매출이 줄어드는 수정은 취소 비밀번호로만 저장된다 */}
          {reduceAsk && onReduceConfirm && (
            <div role="alert" data-testid="ledger-reduce-pw" className="space-y-1.5 rounded-input border border-danger/40 bg-danger/10 px-2.5 py-2">
              <p className="text-2xs font-bold text-danger-light">
                매출이 줄어드는 수정입니다. 업주 취소 비밀번호를 입력하세요.
              </p>
              <PwConfirm hasPw={hasPw} label="수정 확정" busy={busy} onConfirm={onReduceConfirm} />
            </div>
          )}
          {/* 상태 요약 — '지금 무엇이 적용된 상태인가'를 먼저 보여준다.
              #22: 예전엔 얼리·할인 배지가 버튼 사이에 흩어져 있어, 8개 버튼 중 하나를 누르는 순간
              무슨 금액이 기록되는지 누르기 전엔 알 수 없었다. 결과를 먼저, 조작을 나중에. */}
          <div className="rounded-input border border-border-subtle bg-surface-low px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs">
              {levelNo > 0 && <span className="rounded-badge bg-surface-float px-1.5 py-0.5 font-bold text-ink-secondary tabular-nums">LV {levelNo}</span>}
              <span className="font-bold text-amber-300">
                얼리 {(() => {
                  const t = cell.buyin ? earlyTypeOf(cell.buyin, session) : autoEarly;
                  return t === 'double' ? '더블' : t === 'single' ? '1얼리' : t === 'none' ? '없음' : '—';
                })()}
              </span>
              {discs.some((d) => d.amount > 0) && (
                <>
                  <span className="text-ink-muted" aria-hidden>·</span>
                  <span className={discIdx > 0 ? 'font-bold text-accent-300' : 'text-ink-muted'}>
                    할인 {discIdx > 0 ? `${discs[discIdx - 1]?.label || '할인' + discIdx} −${wonToMan(discWon)}만` : '없음'}
                  </span>
                </>
              )}
            </div>
            {session.buyinAmount > 0 && (
              <p className="mt-1 text-2xs text-ink-muted">
                {/* 카드 줄을 따로 두지 않는다 — 이제 현금과 **같은 금액**이라 두 번 적으면 '다른 값'처럼 읽힌다. */}
                받을 금액 <b className="tabular-nums text-ink-primary">{wonToMan(dueOf('cash') ?? 0)}만</b>
                <span className="text-ink-muted"> (현금·카드·이체 동일)</span>
                {/* 바이인 횟수(1회)와 엔트리(금액 기준·소수 가능)를 **둘 다** 밝힌다 — 오너 규칙 2026-09-11. */}
                {discIdx > 0 && (() => {
                  const applied = Math.max(0, session.buyinAmount - discWon);
                  const ent = session.buyinAmount > 0 ? applied / session.buyinAmount : 1;
                  return <span className="text-accent-300"> · 바인 1회 · 엔트리 {ent.toLocaleString(undefined, { maximumFractionDigits: 2 })} · 적용금액 {wonToMan(applied)}만원</span>;
                })()}
              </p>
            )}
          </div>

          {/* 얼리 — 자동 판정을 그대로 두거나(자동), 이 바인만 수기로 확정한다 */}
          {cell.buyin && (
            <div className="flex items-center gap-1.5 flex-wrap pb-2 mb-1 border-b border-border-subtle">
              <span className="text-2xs text-ink-muted">얼리</span>
              {([[null, '자동'], ['double', '더블얼리'], ['single', '1얼리'], ['none', '없음']] as const).map(([v, label]) => {
                const active = (cell.buyin!.earlyOverride ?? null) === v;
                return (
                  <button key={String(v)} type="button" onClick={() => onSetEarly(v)}
                    className={['tap-y-44 text-2xs font-bold px-2 py-1.5 min-h-8 rounded-badge border transition-colors',
                      active ? 'bg-amber-400/20 text-amber-300 border-amber-400/50' : 'bg-surface-high text-ink-secondary border-border-default hover:text-ink-primary'].join(' ')}>{label}</button>
                );
              })}
              <span className="text-[10px] text-ink-muted w-full">
                {cell.buyin.earlyOverride
                  ? '수기 확정. 시각·레벨이 바뀌어도 이 값이 유지됩니다.'
                  : '시각 자동. 바인 시각을 레벨로 환산해 판정합니다.'}
              </span>
            </div>
          )}
          {!splitMode ? (
            <>
              {/* 할인 — 세션에 등록된 프리셋. 레벨이 붙은 할인은 신규 기록에 자동 선택되고(#20),
                  운영자는 여기서 언제든 다른 할인/없음으로 바꿀 수 있다(임의 수정 보장). */}
              {discs.some((d) => d.amount > 0) && (
                <div className="pb-2 mb-1 border-b border-border-subtle space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-ink-muted">할인</span>
                    <button type="button" onClick={() => setDiscIdx(0)}
                      className={['text-xs font-bold px-2.5 py-1.5 min-h-[2.2rem] rounded-badge border transition-colors',
                        discIdx === 0 ? 'bg-surface-float text-ink-primary border-border-strong' : 'text-ink-secondary border-border-default hover:text-ink-primary'].join(' ')}>없음</button>
                    {/* 비운 자리(0원)는 감추되 인덱스는 그대로 둔다 — 자리번호가 바인 계산의 기준이라 재배열 불가 */}
                    {discs.map((d, i) => (d.amount <= 0 || !discOk(i) ? null : (
                      <button key={i} type="button" onClick={() => setDiscIdx(i + 1)}
                        className={['text-xs font-bold px-2.5 py-1.5 min-h-[2.2rem] rounded-badge border transition-colors',
                          discIdx === i + 1 ? 'bg-accent-300/15 text-accent-300 border-accent-400/40' : 'text-ink-secondary border-border-default hover:text-ink-primary'].join(' ')}>
                        {d.label || `할인${i + 1}`} −{wonToMan(d.amount)}만{d.level ? ` · ${d.level}LV` : ''}
                      </button>
                    )))}
                  </div>
                  <p className="text-2xs text-ink-muted">
                    {autoKept
                      ? <span className="text-accent-300">
                          {autoFromLevel ? `LV ${levelNo} 자동 적용` : '보드 상단에서 고른 기본 할인'} — 다른 할인이나 ‘없음’으로 바꿔도 됩니다.
                        </span>
                      : (autoOk > 0 && !cell.buyin)
                        ? <>{autoFromLevel ? '자동 적용' : '기본값'}({discs[autoOk - 1]?.label || `할인${autoOk}`})을 직접 바꿨습니다.</>
                        : '할인액만큼 금액에서만 차감합니다 — 바인은 1회, 엔트리는 그 비율만큼 줄어듭니다.'}
                  </p>
                </div>
              )}

              {/* 직전과 동일(zap) — 리바인 대부분은 그 손님의 직전 결제수단 반복이다 */}
              {lastPick && (
                // ⚠ 할인은 **화면의 현재 값(discIdx)** 을 따른다. 예전엔 직전 바인에 박힌
                //   discountIndex 를 그대로 저장해, 헤더가 '할인 없음 · 받을 금액 10만'이라고
                //   적어 놓은 상태에서 이 버튼만 5만을 저장했다. 레벨은 앞으로만 가므로 직전 바인은
                //   언제나 더 큰 할인 = **과소청구가 기본 방향**이었다(2026-09-05 감사).
                //   반복하는 것은 '수단·완납여부'지 '그때의 할인'이 아니다.
                <button type="button" disabled={busy} onClick={() => onPick(lastPick.method, lastPick.isUnpaid, discIdx)}
                  className="w-full h-12 inline-flex items-center justify-center gap-1.5 rounded-input border border-accent-300 bg-accent-300/15 text-accent-300 font-bold text-sm active:scale-95 transition hover:bg-accent-300/25 disabled:opacity-50 disabled:pointer-events-none">
                  {/* 라벨도 화면 기준으로 말한다 — 직전 바인의 '·할인'을 그대로 적으면 거짓말이 된다 */}
                  <Icon name="zap" size={15} className="shrink-0" />직전과 동일 — {lastPick.label}
                  {discIdx > 0
                    ? <span className="text-2xs font-semibold opacity-80"> · {discs[discIdx - 1]?.label || `할인${discIdx}`} −{wonToMan(discWon)}만</span>
                    : <span className="text-2xs font-semibold"> · 할인 없음</span>}
                </button>
              )}

              {/* 수납 상태 먼저(완납/미수) → 수단 하나.
                  #22: 완납·미수 × 4수단 = 8버튼 격자가 화면 절반을 먹고 티켓만 따로 떨어져 있어
                  '티켓 미수'가 되는지조차 매번 헷갈렸다. 상태를 축으로 접으면 오조작 표면이 절반이 된다. */}
              <div className="grid grid-cols-2 gap-1.5 rounded-input bg-surface-low p-1">
                {([[false, '완납'], [true, '미수']] as const).map(([v, label]) => (
                  <button key={label} type="button" onClick={() => setUnpaidMode(v)}
                    className={['h-9 rounded-input text-xs font-extrabold border transition-colors',
                      unpaidMode === v
                        ? (v ? 'bg-danger/15 text-danger-light border-danger/50' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40')
                        : 'text-ink-muted border-transparent hover:text-ink-secondary'].join(' ')}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {payMethods.map((m) => {
                  const due = dueOf(m.key);
                  return (
                    <button key={m.key} type="button" disabled={busy} onClick={() => onPick(m.key, unpaidMode, discIdx)}
                      className={['h-14 rounded-input border font-bold text-sm active:scale-95 transition disabled:opacity-50 disabled:pointer-events-none',
                        unpaidMode
                          ? 'border-danger/50 bg-danger/10 text-danger-light hover:bg-danger/20'
                          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'].join(' ')}>
                      <span className="block leading-tight">{m.label} {unpaidMode ? '미수' : '완납'}</span>
                      <span className="block text-2xs font-semibold tabular-nums">
                        {/* 티켓은 자리 1개 = (단가−할인)/1만 T — 10만 게임 10T, 5만 할인이면 5T.
                            ⚠ TICKET_WON 을 쓴다 — 만원 환산 상수(WON_PER_MAN)와 값이 같다고 섞으면 T 표시가 조용히 틀어진다. */}
                        {/* #9(2026-09-25) — 5만5,555원 같은 단가가 5.5555T 로 소수 넷째 자리까지 나왔다. 장부 바·정산과 같은 1자리. */}
                        {due === null ? `${(Math.max(0, session.buyinAmount - discWon) / TICKET_WON).toLocaleString(undefined, { maximumFractionDigits: 1 })}T` : `${wonToMan(due)}만`}{discIdx > 0 ? ' ·할인' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 애드온 — 오너 원문(2026-09-28) "현금 완납/현금 미수 고르는 칸 맨 아래에". 수단 격자 **바로 밑**이다.
                  F2(2026-09-29): 예전엔 가게지원·분납 버튼 밑(모달 맨 끝)이라 할인 프리셋 게임의 1280×800 첫 화면에서
                  13.6/131.7px 만 보였다(스크롤 단서 없음). */}
              {session.isAddon && onSetAddon && (
                <AddonRow buyin={cell.buyin} amount={session.addonAmount ?? 0} busy={busy} onSet={onSetAddon} />
              )}

              {/* 가게지원 — 수납이 없으므로 완납/미수 축 밖에 둔다.
                  ⚠ 할인은 다른 수단과 **같은 규칙**으로 받는다. 예전엔 여기만 0 을 강제해,
                     ledger.ts 의 support 분기(value = 단가−disc)가 도달 불가능한 죽은 코드였고
                     화면 상태줄이 '이 바인 0.5 엔트리'라고 적어 놓고도 1.0 으로 저장됐다.
                     티켓은 discIdx 를 받는데 지원만 안 받는 비대칭이기도 했다(2026-09-05 감사). */}
              <button type="button" disabled={busy} onClick={() => onPick('support', false, discIdx)}
                className="w-full h-11 rounded-input border border-indigo-400/50 bg-indigo-500/10 text-indigo-300 font-bold text-sm active:scale-95 transition hover:bg-indigo-500/20 disabled:opacity-50 disabled:pointer-events-none">
                가게지원 <span className="text-2xs font-semibold">· 수납 없음</span>
              </button>

              {/* 분납/할인 상세 */}
              <button type="button" onClick={() => setSplitMode(true)}
                className="w-full h-11 rounded-input border border-accent-400/40 text-accent-300 font-semibold text-sm hover:bg-accent-300/10 transition-colors">
                분납 / 할인 상세 입력
              </button>

            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setSplitMode(false)} className="tap-y-44 inline-flex min-h-[32px] items-center text-2xs text-ink-secondary hover:text-ink-primary">← 빠른 입력</button>
                <span className="text-2xs font-semibold text-accent-300">분납 / 할인</span>
              </div>
              <AmountRow label="현금" value={cash} set={setCash} />
              <AmountRow label="카드" value={card} set={setCard} />
              <AmountRow label="이체" value={transfer} set={setTransfer} />
              <AmountRow label="미수" value={unpaidAmt} set={setUnpaidAmt} danger />
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  {/* T 단위(1T = 1만원). 10만 자리를 티켓으로 다 내면 10, 5만만 티켓이면 5 — 그래서 나눌 수 있다. */}
                  <span className="block text-2xs text-ink-muted mb-0.5">티켓(T · 1T=1만원)</span>
                  <input type="number" inputMode="numeric" min={0} value={tkt || ''} onChange={(e) => setTkt(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    placeholder="0" className="input w-full text-sm tabular-nums" />
                </label>
              </div>
              {/* 할인 이벤트 — 단순 결제와 동일한 프리셋을 분납에서도 적용(예: 1레벨 바인 5만 할인).
                  이전의 '레벨 할인' 숫자칸은 계산 어디에도 반영되지 않는 죽은 값이라 제거했다. */}
              {discs.some((d) => d.amount > 0) ? (
                <div>
                  <span className="mb-1 block text-2xs text-ink-muted">할인 이벤트 (선택)</span>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" onClick={() => setDiscIdx(0)}
                      className={['tap-y-44 min-h-[32px] rounded-input border px-2 py-1 text-2xs font-bold transition-colors',
                        discIdx === 0 ? 'border-accent-400/40 bg-accent-300/15 text-accent-300' : 'border-border-default text-ink-muted'].join(' ')}>
                      없음
                    </button>
                    {discs.map((d, i) => (d.amount <= 0 || !discOk(i) ? null : (
                      <button key={i} type="button" onClick={() => setDiscIdx(i + 1)}
                        className={['tap-y-44 min-h-[32px] rounded-input border px-2 py-1 text-2xs font-bold transition-colors',
                          discIdx === i + 1 ? 'border-accent-400/40 bg-accent-300/15 text-accent-300' : 'border-border-default text-ink-muted'].join(' ')}>
                        {d.label || `할인${i + 1}`} ({wonToMan(d.amount)}만)
                      </button>
                    )))}
                  </div>
                </div>
              ) : (
                /* 2026-09-16 오너 리포트 "분납은 있는데 할인이 없어" — 헤더가 '분납 / 할인' 이라고 약속해 놓고
                   프리셋이 0개면 줄 자체를 안 그려 **기능이 없는 것처럼 보였다.** 없으면 없다고 말한다. */
                <p className="text-2xs leading-relaxed text-ink-muted">
                  {/* ⚠ 줄 끝 `{' '}` 없으면 JSX 가 줄바꿈+들여쓰기를 통째로 지워 `…수정’의‘할인 이벤트’…` 로 붙는다(2026-09-16 실측). */}
                  이 게임에 등록된 할인이 없습니다 — <b className="text-ink-secondary">‘세션 정보 수정’</b>의{' '}
                  <b className="text-ink-secondary">‘할인 이벤트’</b>에 추가하면 여기서 고를 수 있어요.
                </p>
              )}
              <p className="text-2xs text-ink-secondary text-right">
                합계 <b className={`tabular-nums ${mismatch === 0 ? '' : 'text-danger-light'}`}>{wonToMan(splitTotal)}</b>만원
                {' · 받을 금액 '}<b className="tabular-nums">{wonToMan(splitDue)}</b>만원
                {discIdx > 0 && discs[discIdx - 1] ? ` · ${discs[discIdx - 1].label || '할인'} 적용(−${wonToMan(discs[discIdx - 1].amount)}만)` : ''}
              </p>
              {/* 어긋난 금액을 **저장 전에** 사람이 읽는 문장으로 띄운다. 계산에서 몰래 고치지 않는다 —
                  오입력이 숫자로 드러나야 접수대가 손님에게 맞는 금액을 부른다(ledger.ts splitMismatch 주석). */}
              {mismatch !== 0 && (
                <div role="alert" className="space-y-1.5 rounded-input border border-danger/40 bg-danger/10 px-2.5 py-2">
                  <p className="text-2xs font-bold text-danger-light">
                    {mismatch < 0 ? `${wonToMan(-mismatch)}만원 부족합니다` : `${wonToMan(mismatch)}만원 초과입니다`}
                    {' — 합계가 받을 금액과 같아야 저장됩니다.'}
                  </p>
                  {mismatch < 0 && (
                    <button type="button" onClick={() => setUnpaidAmt(unpaidAmt - mismatch)}
                      className="h-9 w-full rounded-input border border-danger/40 text-2xs font-bold text-danger-light">
                      부족분 {wonToMan(-mismatch)}만원을 미수로 잡기
                    </button>
                  )}
                </div>
              )}
              <button type="button" onClick={submitSplit} disabled={!canSaveSplit || busy} className="btn-primary w-full text-sm disabled:opacity-50">저장</button>
            </div>
          )}

          {/* 기존 셀: 취소(삭제) */}
          {cell.buyin && (
            <div className="pt-1 border-t border-border-subtle">
              {!cancelMode ? (
                <button type="button" onClick={() => setCancelMode(true)}
                  className="w-full h-10 rounded-input border border-border-default text-ink-muted text-xs font-semibold hover:text-danger-light hover:border-danger/40 transition-colors">
                  결제 취소 (내역 삭제)
                </button>
              ) : (
                <div className="space-y-1.5">
                  {/* D9 — 비밀번호 미설정 매장의 업주에게 '비밀번호를 입력하세요' 라고 말하면서 입력칸이 없는 모순을 없앤다. */}
                  <p className="text-2xs text-ink-muted">{!hasPw && canManage ? '취소 비밀번호가 설정되지 않은 매장이라 비밀번호 없이 취소됩니다.' : '취소하려면 업주 비밀번호를 입력하세요.'}</p>
                  <PwConfirm hasPw={hasPw} ownerNoPw={canManage} label="취소 확정" busy={busy} onConfirm={onCancelBuyin} />
                </div>
              )}
            </div>
          )}
        </div>
    </Modal>
  );
}

/** 애드온 한 줄(2026-09-28 오너) — 완납/미수 수단 격자 **바로 밑**. 기록된 바인에만 붙는다(애드온은 앉은 자리에 얹는 것).
 *  ⚠ 애드온은 바인 횟수·엔트리·얼리·총 칩에 들어가지 않는다 — 돈만 따로 센다(ledger.ts addonFinance). */
const ADDON_OTHER: { key: string; method: AddonMethod; unpaid: boolean; label: string }[] = [
  { key: 'card', method: 'card', unpaid: false, label: '카드 완납' }, { key: 'card-u', method: 'card', unpaid: true, label: '카드 미수' },
  { key: 'transfer', method: 'transfer', unpaid: false, label: '이체 완납' }, { key: 'transfer-u', method: 'transfer', unpaid: true, label: '이체 미수' },
  { key: 'ticket', method: 'ticket', unpaid: false, label: '티켓 완납' }, { key: 'ticket-u', method: 'ticket', unpaid: true, label: '티켓 미수' },
];
function AddonRow({ buyin, amount, busy, onSet }: {
  buyin: LedgerBuyin | null | undefined; amount: number; busy: boolean;
  onSet: (addon: { method: AddonMethod; unpaid: boolean } | null) => void;
}) {
  const m = buyin?.addonMethod ?? null;
  const u = !!buyin?.addonUnpaid;
  const canPick = !!buyin && amount > 0 && !busy;
  const cur = m ? `${m}${u ? '-u' : ''}` : '';
  const other = ADDON_OTHER.find((o) => o.key === cur);
  const seg = (on: boolean, tone: 'none' | 'ok' | 'due') => ['h-11 min-w-0 whitespace-nowrap rounded-input border px-2 text-xs font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none',
    !on ? 'border-border-default text-ink-secondary hover:text-ink-primary'
      : tone === 'due' ? 'border-danger/50 bg-danger/15 text-danger-light'
      : tone === 'ok' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
      : 'border-border-strong bg-surface-float text-ink-primary'].join(' ');
  return (
    <div data-testid="ledger-addon-row" className="space-y-1.5 border-t border-border-subtle pt-2">
      <p className="flex items-center justify-between gap-2 whitespace-nowrap text-2xs">
        <span className="font-bold text-ink-secondary">애드온</span>
        <span className="tabular-nums text-ink-muted">{amount > 0 ? `${wonToMan(amount)}만 · 바인·엔트리에 안 들어감` : '가격 미설정'}</span>
      </p>
      {/* 20260930i — 이용권 분납 애드온: 이용권 몫은 서버가 적는다(화면은 남은 금액의 수단만 바꾼다). */}
      {m && m !== 'ticket' && (buyin?.addonTicketCount ?? 0) > 0 && (
        <p data-testid="ledger-addon-ticket-part" className="whitespace-nowrap text-2xs text-ink-secondary">
          이용권 {buyin?.addonTicketCount}T 받음 · 남은 {wonToMan(Math.max(0, (buyin?.addonAmount ?? amount) - (buyin?.addonTicketCount ?? 0) * TICKET_WON))}만은 아래 수단
        </p>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" disabled={!canPick} aria-pressed={!m} onClick={() => onSet(null)} className={seg(!m, 'none')}>없음</button>
        <button type="button" disabled={!canPick} aria-pressed={m === 'cash' && !u} onClick={() => onSet({ method: 'cash', unpaid: false })} className={seg(m === 'cash' && !u, 'ok')}>현금 완납</button>
        <button type="button" disabled={!canPick} aria-pressed={m === 'cash' && u} onClick={() => onSet({ method: 'cash', unpaid: true })} className={seg(m === 'cash' && u, 'due')}>현금 미수</button>
      </div>
      <select value={other?.key ?? ''} disabled={!canPick} aria-label="애드온 다른 수단"
        onChange={(e) => { const o = ADDON_OTHER.find((x) => x.key === e.target.value); if (o) onSet({ method: o.method, unpaid: o.unpaid }); }}
        className="input h-11 w-full text-xs disabled:opacity-50">
        <option value="">다른 수단 (카드·이체·티켓)</option>
        {/* 20260930i — 이용권 분납 애드온은 '티켓' 으로 바꿀 수 없다(서버도 막는다). 남은 금액 수단만 고른다. */}
        {ADDON_OTHER.filter((o) => !((buyin?.addonTicketCount ?? 0) > 0 && o.method === 'ticket')).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {!buyin && <p className="whitespace-nowrap text-2xs text-ink-muted">바인을 먼저 기록하면 애드온을 붙일 수 있어요.</p>}
      {buyin && amount <= 0 && <p className="text-2xs text-ink-muted">‘세션 정보 수정’에서 애드온 가격을 넣어 주세요.</p>}
    </div>
  );
}

/** 업주 취소 비밀번호 한 줄 — 바인 취소(삭제)와 감액 수정이 같이 쓴다 */
// 오너 결정 2026-09-25 ②: 비밀번호 **미설정** 매장에서는 업주·공동운영자(ownerNoPw = can_manage_pos)가 비밀번호 없이 확정한다.
//   직원은 여전히 막힌다. 최종 판정은 서버(cancel_ledger_buyin, 20260925e)가 다시 한다.
function PwConfirm({ hasPw, ownerNoPw = false, label, busy = false, onConfirm }: { hasPw: boolean; ownerNoPw?: boolean; label: string; busy?: boolean; onConfirm: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  if (!hasPw && ownerNoPw) {
    return (
      <button type="button" onClick={() => onConfirm('')} disabled={busy} className="btn-danger bg-rose-700! hover:bg-rose-800! w-full text-xs px-3 disabled:opacity-50">{label}</button>
    );
  }
  return (
    <div className="flex gap-1.5">
      <input type="password" inputMode="numeric" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="취소 비밀번호"
        placeholder={hasPw ? '취소 비밀번호' : '비밀번호 미설정'} disabled={!hasPw} className="input flex-1 text-sm" autoFocus />
      <button type="button" onClick={() => onConfirm(pw)} disabled={!hasPw || !pw || busy} className="btn-danger bg-rose-700! hover:bg-rose-800! text-xs px-3 shrink-0 disabled:opacity-50">{label}</button>
    </div>
  );
}

function AmountRow({ label, value, set, danger }: { label: string; value: number; set: (n: number) => void; danger?: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <span className={['w-9 shrink-0 text-2xs font-semibold', danger ? 'text-danger-light' : 'text-ink-secondary'].join(' ')}>{label}</span>
      <div className="relative flex-1">
        <input type="number" inputMode="decimal" step="0.1" min={0} value={manVal(value)} onChange={(e) => set(parseMan(e.target.value))}
          placeholder="0" className="input w-full text-sm tabular-nums pr-7" />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-ink-muted">만</span>
      </div>
    </label>
  );
}

// ── 장부 마감 모달 ────────────────────────────────────────────────────────────
function CloseModal({ stats, unpaidPlayers, exNote, onClose, onConfirm }: {
  /** 위 숫자들은 **정산 제외를 적용한 값**이다(오너가 그 숫자로 정산한다).
   *  제외 전 원본은 stats.all 에 그대로 있고, 아래에서 나란히 보여 준다. */
  stats: {
    totalBuyins: number; entries: number; ticket: number; ticketUnpaid: number;
    revenue: number; unpaid: number; support: number; discount: DiscountSummary;
    value: number; gross: number; disc: number; tender: Tender;
    all: { totalBuyins: number; entries: number; revenue: number; unpaid: number; value: number };
    removed: { count: number; entries: number; value: number; revenue: number };
    addon: AddonFinance;
  };
  unpaidPlayers: { name: string; unpaid: number }[];
  /** '정산 제외: 관계자·가게지원' — 메모에 미리 채워 감사 흔적을 남긴다(수정 가능) */
  exNote: string;
  onClose: () => void; onConfirm: (memo: string) => void;
}) {
  // 제외를 걸고 마감하면 **무엇을 뺐는지가 기록에 남아야 한다** — 나중에 숫자만 보면 알 수 없다.
  // 미리 채우되 잠그지는 않는다(사장님이 지우거나 덧붙일 수 있다).
  const [memo, setMemo] = useState(exNote ? `${exNote}\n` : '');
  return (
    <Overlay title="정산 마감 · 금일 통계" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <SummaryStat label="총 바인" value={`${stats.totalBuyins}회`} />
          <SummaryStat label="총 엔트리" value={stats.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
        </div>

        {/* ── 정산 대차표 ──────────────────────────────────────────────────
            매장이 정산할 때 확인하는 항등식 하나를 그대로 그린다(오너 2026-09-05 "논리에 안 맞는다"):
              정가 총액 − 할인 = 순 바인액 = 현금 + 카드 + 이체 + 티켓 + 가게지원 + 미수
            예전엔 티켓·지원이 '장·건'으로만 있고 바인 총액 자체가 없어서,
            "티켓 3장이 돈으로 얼마인지", "할인이 어디서 얼마 빠졌는지"가 보이지 않았다.
            티켓은 T(1T=1만원) — 10만 자리를 티켓으로 내면 10T = 10만원으로 여기 **돈으로** 선다. */}
        <div className="rounded-input border border-border-default bg-surface-low/60 p-2.5 text-xs">
          <p className="mb-1.5 flex items-center gap-1 text-2xs font-bold text-ink-secondary">
            <Icon name="notebook" size={12} className="shrink-0" />정산 대차
          </p>
          <dl className="space-y-0.5 tabular-nums">
            <div className="flex justify-between"><dt className="text-ink-muted">바인 정가 총액 <span className="text-2xs">({stats.totalBuyins}회)</span></dt><dd className="font-semibold text-ink-primary">{wonToMan(stats.gross)}만원</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">− 할인 <span className="text-2xs">({stats.discount.count}건)</span></dt><dd className="font-semibold text-danger-light">−{wonToMan(stats.disc)}만원</dd></div>
            <div className="flex justify-between border-t border-border-subtle pt-1"><dt className="font-bold text-ink-secondary">= 순 바인액</dt><dd className="font-bold text-ink-primary">{wonToMan(stats.value)}만원</dd></div>
          </dl>
          <p className="mt-2 mb-1 text-2xs font-bold text-ink-secondary">수납 내역 — 순 바인액을 무엇으로 받았나</p>
          <dl className="space-y-0.5 tabular-nums">
            <div className="flex justify-between"><dt className="text-ink-muted">현금</dt><dd className="text-emerald-300">{wonToMan(stats.tender.cash)}만원</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">카드</dt><dd className="text-emerald-300">{wonToMan(stats.tender.card)}만원</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">이체</dt><dd className="text-emerald-300">{wonToMan(stats.tender.transfer)}만원</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">티켓 <span className="text-2xs">({stats.ticket.toLocaleString(undefined, { maximumFractionDigits: 1 })}T{stats.ticketUnpaid > 0 ? ` +미수 ${stats.ticketUnpaid.toLocaleString(undefined, { maximumFractionDigits: 1 })}T` : ''})</span></dt><dd className="text-accent-200">{wonToMan(stats.tender.ticket)}만원</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">가게지원 <span className="text-2xs">({stats.support}건)</span></dt><dd className="text-indigo-300">{wonToMan(stats.tender.support)}만원</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">미수</dt><dd className="text-danger-light">{wonToMan(stats.tender.unpaid)}만원</dd></div>
            {(() => {
              const t = stats.tender;
              const sum = t.cash + t.card + t.transfer + t.ticket + t.support + t.unpaid;
              const ok = Math.abs(sum - stats.value) < 1;
              return (
                <div className={['flex justify-between border-t border-border-subtle pt-1 font-bold', ok ? 'text-ink-primary' : 'text-danger-light'].join(' ')}>
                  <dt className="flex items-center gap-1">합계 {ok ? '· 순 바인액과 일치' : <><Icon name="alert" size={12} className="shrink-0" />순 바인액과 불일치</>}</dt>
                  <dd>{wonToMan(sum)}만원</dd>
                </div>
              );
            })()}
          </dl>
          <p className="mt-1.5 text-2xs text-ink-muted">
            완납 매출(실수령) = 현금+카드+이체 = <b className="tabular-nums text-emerald-300">{wonToMan(stats.revenue)}만원</b>.
            티켓·가게지원은 자리를 채웠지만 현금이 오가지 않은 몫이라 매출과 따로 섭니다.
          </p>
        </div>

        {stats.addon.count > 0 && (
          <div data-testid="close-addon" className="rounded-input border border-border-default bg-surface-low/60 p-2.5 text-xs">
            <p className="mb-1.5 text-2xs font-bold text-ink-secondary">애드온 {stats.addon.count}건 — 바인·엔트리와 따로 셉니다</p>
            <dl className="space-y-0.5 tabular-nums">
              <div className="flex justify-between"><dt className="text-ink-muted">완납(현금·카드·이체)</dt><dd className="text-emerald-300">{wonToMan(stats.addon.revenue)}만원</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">티켓</dt><dd className="text-accent-200">{wonToMan(stats.addon.ticketWon)}만원</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">미수</dt><dd className="text-danger-light">{wonToMan(stats.addon.unpaid)}만원</dd></div>
            </dl>
          </div>
        )}

        {/* 제외를 걸었으면 **위 숫자가 무엇을 뺀 결과인지**와 제외 전 원본을 나란히 세운다.
            둘 중 하나만 보여 주면 나중에 "그날 진짜 몇 엔트리였지?"에 답할 수 없다. */}
        {stats.removed.count > 0 && (
          <div className="rounded-input border border-danger/30 bg-danger/6 p-2.5">
            <p className="mb-1 flex items-center gap-1 text-2xs font-bold text-danger-light">
              <Icon name="filter" size={12} className="shrink-0" />{exNote || '정산 제외'}
            </p>
            <p className="text-2xs text-ink-secondary">
              위 숫자는 <b>바인 {stats.removed.count}건</b>을 뺀 정산 기준입니다
              {` (엔트리 −${stats.removed.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })} · 총바인 −${wonToMan(stats.removed.value)}만원`}
              {stats.removed.revenue > 0 ? ` · 매출 −${wonToMan(stats.removed.revenue)}만원` : ''}).
            </p>
            <p className="mt-1 text-2xs text-ink-muted">
              제외 전 원본 — 바인 <b className="tabular-nums text-ink-secondary">{stats.all.totalBuyins}회</b>
              {` · 엔트리 `}<b className="tabular-nums text-ink-secondary">{stats.all.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })}</b>
              {` · 완납 매출 `}<b className="tabular-nums text-ink-secondary">{wonToMan(stats.all.revenue)}만원</b>
              {`. 바인 기록 자체는 지워지지 않습니다.`}
            </p>
          </div>
        )}

        {/* #20: 할인은 '덜 받은 돈'이라 매출 옆에 같이 서야 한다.
            예전엔 마감정산 어디에도 없어서, 5만 할인 20건(=100만)이 그냥 매출 미달로만 보였다.
            할인 엔트리 수와 총 할인액을 같이 세워야 '왜 덜 들어왔는가'가 그 자리에서 끝난다. */}
        <div className="rounded-input border border-accent-400/30 bg-accent-300/6 p-2.5">
          <p className="mb-1.5 flex items-center gap-1 text-2xs font-bold text-accent-300">
            <Icon name="gift" size={12} className="shrink-0" />금일 할인
          </p>
          {stats.discount.count === 0 ? (
            <p className="py-1 text-center text-2xs text-ink-muted">적용된 할인이 없습니다</p>
          ) : (
            <>
              {/* 할인은 **바이인 횟수는 그대로 두고 엔트리만** 깎는다 — 그 깎인 양이 '엔트리 차감' 이다(오너 규칙 2026-09-11).
                  '할인 바인 N건'(횟수)과 '엔트리 차감'(금액 기준)을 나란히 두어야 둘이 다른 수임이 보인다. */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryStat label="할인 바인" value={`${stats.discount.count}건`} />
                <SummaryStat label="엔트리 차감" value={`−${stats.discount.entryLoss.toLocaleString(undefined, { maximumFractionDigits: 1 })}`} tone="danger" />
                <SummaryStat label="총 할인액" value={`${wonToMan(stats.discount.total)}만원`} tone="danger" />
                <SummaryStat label="적용 후 금액" value={`${wonToMan(Math.max(0, stats.gross - stats.discount.total))}만원`} />
              </div>
              <p className="mt-1.5 text-2xs text-ink-muted">
                {/* ⚠ cashTotal 이다(total 아님) — 티켓·가게지원은 할인해도 받을 현금이 0원이라
                    매출이 줄지 않는다. total 을 쓰면 없던 매출을 있었던 것처럼 부풀린다. */}
                할인이 없었다면 완납 매출은 <b className="tabular-nums text-ink-secondary">{wonToMan(stats.revenue + stats.discount.cashTotal)}만원</b>입니다.
                {stats.discount.total !== stats.discount.cashTotal && (
                  <span className="block text-ink-muted">
                    (깎아 준 총액 {wonToMan(stats.discount.total)}만원 중 현금으로 덜 받은 것은 {wonToMan(stats.discount.cashTotal)}만원 —
                    나머지는 티켓·가게지원·미수라 현금이 오가지 않습니다)
                  </span>
                )}
              </p>
            </>
          )}
        </div>

        {stats.ticketUnpaid > 0 && (
          <p className="text-2xs font-semibold text-danger-light">티켓 미수 {stats.ticketUnpaid.toLocaleString(undefined, { maximumFractionDigits: 1 })}T — 사용 이용권 집계에서 빠져 있습니다.</p>
        )}

        {/* 미수자 리스트 */}
        <div className="rounded-input border border-danger/30 bg-danger/5 p-2.5">
          <p className="mb-1 text-2xs font-bold text-danger-light">미수자 {unpaidPlayers.length}명</p>
          {unpaidPlayers.length === 0 ? (
            <p className="py-1 text-center text-2xs text-ink-muted">미수자가 없습니다</p>
          ) : (
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {unpaidPlayers.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">{p.name}</span>
                  <span className="shrink-0 font-bold text-danger-light tabular-nums">{wonToMan(p.unpaid)}만원</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="block">
          <span className="block text-2xs text-ink-muted mb-0.5">마감 메모(수기 비고) · 선택</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={300}
            placeholder="예) 미수 3건은 내일 정산 예정" className="input w-full text-sm resize-none" />
        </label>
        <p className="text-2xs text-danger-light">마감하면 해당 날짜 장부는 읽기전용으로 잠깁니다. (업주만 해제 가능)</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost text-sm flex-1">취소</button>
          <HoldToConfirmButton onConfirm={() => onConfirm(memo)} className="btn-primary text-sm flex-1">
            꾹 눌러 마감 확정
          </HoldToConfirmButton>
        </div>
      </div>
    </Overlay>
  );
}

// ── 장부 삭제 확인 모달 ───────────────────────────────────────────────────────
// 왜 confirm 이 아니라 이 모달인가: 삭제는 복구 수단이 0인데(하드 삭제 RPC) 되돌릴 수 있는 '마감'보다
// 확인이 약했다. 잃는 실수치를 먼저 보여주고, 마감과 같은 꾹-누르기로 강도를 맞춘다.
// 수치 로딩 중에는 확정을 막는다 — 무엇을 잃는지 모른 채 누르는 것이 이 결함의 핵심이라 그 상태를 재현하면 안 된다.
function DeleteSessionModal({ label, loss, lossErr, busy, hasPw, pw, onPw, onClose, onConfirm }: {
  label: string;
  loss: LedgerLossSummary | null;
  lossErr: boolean;
  busy: boolean;
  /** 취소 비밀번호가 설정된 매장 — 바인이 있는 장부는 서버(delete_ledger_session)가 비밀번호를 본다(20260925g N19) */
  hasPw: boolean;
  pw: string;
  onPw: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  // 바인이 있다고 확인됐으면 비밀번호 없이는 못 누른다(빈 값으로 보내면 서버가 '틀림' 으로 세어 잠금 카운터가 오른다).
  // 하지만 lossErr(수치 조회 실패)일 때도 바인이 0건인지는 모른다 —
  // 빈 비밀번호('')를 그대로 보내면 비밀번호가 설정된 매장에서도
  // 잠김 카운터가 오른다(D8, 2026-09-26). 칸이 보이는 조건과 동일하게 강제한다.
  const pwRequired = hasPw && (lossErr || !loss || loss.buyins > 0);
  return (
    <Overlay title={`${label} 장부 삭제`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm font-bold text-danger-light">삭제하면 아래 기록이 영구히 사라집니다. 되돌릴 수 없습니다.</p>
        {loss ? (
          <div className="grid grid-cols-2 gap-2">
            <SummaryStat label="바인 기록" value={`${loss.buyins}건`} />
            <SummaryStat label="명단 인원" value={`${loss.people}명`} />
            <SummaryStat label="완납 매출" value={`${wonToMan(loss.revenue)}만원`} tone="emerald" />
            <SummaryStat label="미수금 기록" value={`${wonToMan(loss.unpaid)}만원`} tone="danger" />
          </div>
        ) : lossErr ? (
          <p className="rounded-input border border-danger/30 bg-danger/5 p-2.5 text-2xs text-danger-light">
            잃는 기록의 양을 불러오지 못했습니다(네트워크). 수치를 확인하지 못한 채로도 삭제는 가능하지만, 확인 후 진행을 권합니다.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[58px] animate-pulse rounded-input bg-surface-high" />)}
          </div>
        )}
        <p className="text-2xs text-ink-muted">마감은 해제할 수 있지만 삭제는 복구 불가. 보관만 원하면 마감을 쓰세요.</p>
        {hasPw && (lossErr || !loss || loss.buyins > 0) && (
          <label className="block space-y-1">
            <span className="text-2xs text-ink-secondary">{pwRequired ? '바인 기록이 있는 장부라 취소 비밀번호가 필요합니다' : '바인 기록이 있으면 취소 비밀번호가 필요합니다'}</span>
            <input type="password" inputMode="numeric" value={pw} onChange={(e) => onPw(e.target.value)} placeholder="취소 비밀번호"
              aria-label="취소 비밀번호" disabled={busy} className="input w-full text-sm" />
          </label>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost text-sm flex-1 disabled:opacity-50">취소</button>
          {/* #8(2026-09-25) — btn-danger 기본색(246,70,93) 위 흰 글자 3.5:1. 되돌릴 수 없는 버튼이라 글자가 확실히 읽혀야 한다 → 한 단계 진한 빨강. */}
          <HoldToConfirmButton onConfirm={onConfirm} disabled={busy || (!loss && !lossErr) || (pwRequired && !pw)}
            className="btn-danger bg-rose-700! hover:bg-rose-800! text-sm flex-1 disabled:opacity-50">
            {busy ? '삭제 중…' : '꾹 눌러 영구 삭제'}
          </HoldToConfirmButton>
        </div>
      </div>
    </Overlay>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'danger' }) {
  const c = tone === 'emerald' ? 'text-emerald-400' : tone === 'danger' ? 'text-danger-light' : 'text-ink-primary';
  // #4(2026-09-25) — '8,887.38만원' 이 98px 칸에서 '8,887.38만 / 원' 두 줄로 쪼개졌다(1440 정산 마감 모달 실측).
  //   단위(만원·건·명·회)는 작게 떼고 줄바꿈을 막는다. 숫자가 길면(7자+) 한 단계 작게 — 칸 폭은 그대로다.
  const m = /^(.*?)([가-힣]+)$/.exec(value);
  const num = m ? m[1] : value;
  const unit = m ? m[2] : '';
  return (
    <div className="rounded-input bg-surface-low border border-border-subtle py-2 text-center">
      <p className={['whitespace-nowrap font-extrabold tabular-nums leading-6', num.length >= 7 ? 'text-sm' : 'text-base', c].join(' ')}>
        {num}{unit && <span className="ml-px text-2xs font-bold">{unit}</span>}
      </p>
      <p className="text-2xs text-ink-muted mt-0.5">{label}</p>
    </div>
  );
}

// ── 정산 제외 필터 ────────────────────────────────────────────────────────────
// 오너 지시(2026-09-05): "가게지원은 바인엔 포함되지만 정산 때 관계자·신규처럼 빼고 정산 가능하게",
//                       "티켓·현금·카드 등도 뺄 수 있게".
// 축이 둘(방문자 유형 × 결제수단)뿐이라 별도 화면을 만들지 않고 정산바 바로 위에 접어 둔다 —
// 지금 보는 숫자가 '무엇을 뺀 결과'인지 같은 시야에서 읽혀야 오정산이 안 난다.
function SettleFilter({ exKeys, setExKeys, counts, removed, players, part = 'all', open, setOpen }: {
  /** all = 접힘 줄 + 펼친 내용(모바일) · toggle = 접힘 줄만(PC 숫자 줄 왼쪽 칸) · panel = 펼친 내용만(PC 숫자 줄 위) */
  part?: 'all' | 'toggle' | 'panel';
  open: boolean;
  setOpen: (f: (v: boolean) => boolean) => void;
  exKeys: Set<string>;
  setExKeys: (f: (prev: Set<string>) => Set<string>) => void;
  counts: Map<string, number>;
  removed: { count: number; entries: number; value: number; revenue: number };
  players: LedgerPlayer[];
}) {
  const toggle = (k: string) => setExKeys((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // 유형은 고정 4종 + 매장이 손으로 적은 커스텀 값까지(로스터에 실제로 있는 것만 보여준다).
  const visitorKeys = useMemo(() => {
    const seen = new Set<string>();
    for (const p of players) if (p.visitorType) seen.add(p.visitorType);
    for (const k of ['new', 'regular', 'staff', 'other']) if (counts.has(`visitor:${k}`)) seen.add(k);
    return [...seen];
  }, [players, counts]);

  const methodKeys: PaymentMethod[] = ['cash', 'card', 'transfer', 'ticket', 'support'];
  const chip = (k: string, label: string) => {
    const c = counts.get(k) ?? 0;
    if (c === 0) return null; // 없는 것을 고르게 두면 '뺐는데 안 변한다'는 혼란만 남는다
    const on = exKeys.has(k);
    return (
      <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={on}
        className={['rounded-badge border px-2 py-1 text-2xs font-semibold tabular-nums transition-colors',
          on ? 'border-danger/50 bg-danger/15 text-danger-light line-through'
             : 'border-border-default text-ink-secondary hover:text-ink-primary'].join(' ')}>
        {label} {c}
      </button>
    );
  };

  if (part === 'panel' && !open) return null;
  return (
    <div className={part === 'toggle' ? undefined : 'pb-1'}>
      <div className="rounded-input border border-border-subtle bg-surface-low/70 px-2.5 py-1.5">
        {part !== 'panel' && <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className={['flex min-h-[24px] w-full items-center gap-1.5 text-left text-2xs font-bold text-ink-secondary', part === 'toggle' ? 'flex-wrap' : ''].join(' ')}>
          <Icon name="filter" size={12} className={['shrink-0 transition-transform', open ? '' : '-rotate-90'].join(' ')} />
          정산 제외
          {exKeys.size === 0
            ? <span className="font-normal text-ink-muted">— 전부 포함</span>
            : (
              <span className="text-danger-light">
                {exKeys.size}개 · 바인 {removed.count}건 · 엔트리 −{removed.entries.toLocaleString(undefined, { maximumFractionDigits: 1 })} · −{wonToMan(removed.value)}만
              </span>
            )}
        </button>}

        {part !== 'toggle' && <Fold open={open}>
          <div className={['space-y-1.5', part === 'panel' ? '' : 'mt-1.5 border-t border-border-subtle pt-1.5'].join(' ')}>
            <div className="flex flex-wrap items-center gap-1">
              <span className="w-14 shrink-0 text-2xs text-ink-muted">방문 유형</span>
              {visitorKeys.map((v) => chip(`visitor:${v}`, visitorLabel(v)))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="w-14 shrink-0 text-2xs text-ink-muted">결제수단</span>
              {methodKeys.map((m) => chip(`method:${m}`, METHOD_LABEL[m]))}
            </div>
            {/* 무엇이 빠지는지 숫자로 밝힌다 — 모르고 정산하면 배분이 틀어진다 */}
            <p className="text-2xs text-ink-muted">
              제외한 항목은 총 엔트리·총바인·매출·미수에서 모두 빠집니다.
              바인 기록 자체는 지워지지 않고, 무엇을 뺐는지는 마감 메모에 자동으로 적힙니다.
              {' '}분납은 <b className="text-ink-secondary">쓰인 수단이 전부 제외 대상일 때만</b> 빠집니다.
            </p>
            {exKeys.size > 0 && (
              <button type="button" onClick={() => setExKeys(() => new Set())}
                className="text-2xs font-semibold text-accent-300 hover:text-accent-200">전부 포함으로 되돌리기</button>
            )}
          </div>
        </Fold>}
      </div>
    </div>
  );
}
