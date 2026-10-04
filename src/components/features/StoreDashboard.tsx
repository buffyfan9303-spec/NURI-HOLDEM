import { resolveDiscountIndex } from '../../api/discountIndex';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { lazyWithReload } from '../../lib/lazyWithReload';
import CountUp from '../atoms/CountUp';
import Icon, { type IconName } from '../atoms/Icon';
import { Fold, useReveal } from '../atoms/Fold';
import { useIsMdUp } from '../../lib/responsive';
import { getVenueWeeklyFunnel, type WeeklyFunnel } from '../../api/schedules';
import { getMyStaffWage, type MyWage } from '../../api/staffSchedule';
import type { Schedule } from '../../api/schedules';
import { listStaleOpenSessions,
  getLedgerSession, getLedgerBuyins, getLedgerPlayers, getLedgerRange, getDowAvgBuyins, buyinFinance, ledgerMoney, addonFinance, ticketUsedT, wonToMan, visitorLabel, subscribeLedger,
  getPosterOpsSummaries, getPendingBuyinRequests, subscribeBuyinRequests, approveBuyinRequest, rejectBuyinRequest, voucherShortOf,
  getLastClosedRound, MAIN_GAME_SEQ, kstToday, type LastClosedRound, type PosterOpsSummary,
  type LedgerSession, type LedgerBuyin, type LedgerPlayer, type BuyinRequest, type VoucherUse, ledgerCounts,} from '../../api/ledger';
import { useToast } from '../atoms/Toast';
import { getClockState, getVenueClocks, subscribeClock, effectiveLevel, syncClockLedgerStats, type ClockState } from '../../api/clock';
import { levelNumberAt, formatCountdown } from '../../lib/clockLevel';
import { useClockSecond } from '../../lib/clockTick';
import { getReservationCounts, getVenueRegulars, subscribeReservations, type VenueRegular } from '../../api/reservations';
import { getVenueRankings } from '../../api/rankings';
import { hasRankingForGame } from '../../lib/rankingGame'; // 순위 완료 판정은 (날짜, 게임) 단위 — F02
import { isDaySettled } from '../../lib/ledgerSettlement'; // '정산' 칩 ✓ 와 '오늘 운영 완료'의 단일 판정(dummy-1003 D3)
import { voucherLeftover, voucherLeftoverText } from '../../lib/buyinApproval';
import { ledgerGameLabel } from '../../lib/ledgerLink';
import type { StoreGoto, StoreStepMap } from '../../lib/storeDestination'; // 이동 목적지 계약(날짜·게임·event·정산)
import { Skeleton } from '../atoms/Skeleton';
import LoadErrorCard from '../atoms/LoadErrorCard';
import { isDenied, msgOf } from '../../lib/dbError';
// 딜러 급여는 dealer_shifts 에 **행마다 시급**이 붙어 있다(staff_wage 와 별개 시스템).
// 합산하지 않으면 딜러를 로테이션으로만 굴리는 매장의 '총 인건비'가 통째로 0원이 된다.
import { getDealerShifts, type DealerShift } from '../../api/dealerShifts';
import { usePayRules } from '../../api/payrollRules';
import { hoursValue, laborSummary, weekStartOf } from '../../lib/staffPay';
import VoucherManageModal from './VoucherManageModal';
import { countVenueVouchersSent, subscribeVenueVouchers } from '../../api/vouchers';
import RegularsModal from './RegularsModal';
import CheckinModal from './CheckinModal';
// 🔴 2026-09-29 M단계 — 대시보드 유틸 줄 '딜러 로테이션·급여' 에서만 여는 모달을 지연 청크로 뺐다. VenueManageTab 청크가
//   상한(119KB gz) 경계 5B 앞이라 펼침 모션(Fold)이 들어갈 자리가 없었다. **상시 마운트**(open 은 prop)라 대시보드가 뜰 때
//   청크를 받기 시작하고, 로드 전에 눌러도 폴백은 null(불투명 판 번쩍임 0 — 닫힌 모달은 원래 아무것도 안 그린다).
//   셋(단골·딜러·출석)을 다 빼면 청크는 114KB 로 내려가지만 작은 청크 셋이 따로 압축돼 JS 합계가 +4.4KB 늘어 하나만 뺐다.
//   이름을 그대로 둔 것은 이 파일을 읽는 계약 테스트(laborLoadFailure)의 JSX 문자열을 바꾸지 않기 위해서다.
const DealerShiftsModal = lazyWithReload(() => import('./DealerShiftsModal'));
import Modal from '../atoms/Modal';
import { getAppSetting, BOOST_CONTACT_EMAIL_KEY, BOOST_CONTACT_PHONE_KEY } from '../../api/settings';
import { getStaffSchedule, getStaffWages, subscribeStaffSchedule, type StaffShift, type StaffWage } from '../../api/staffSchedule';
import { getUpcomingBirthdays } from '../../api/crm';
import { relativeTime } from '../../lib/relativeTime';
// 늦게 도착한 응답이 **지금 보고 있는 매장**을 덮지 않게(N01 계약). 매장 전환은 이 컴포넌트를
// 언마운트하지 않는다(VenueManageTab 는 key 없이 재사용한다) — 데이터·오류·로딩·'HH:MM 기준'을
// 한 세대로 묶지 않으면 A 매장 응답이 B 화면에 숫자/오류 배너/시각으로 남는다.
import { isStaleResponse, type RequestStamp } from '../../lib/staleResponse';
import { useBusinessDate } from '../../lib/businessDate';
import { useResyncOnWake } from '../../lib/realtimeResync';

// '오늘'·'최근 N일'은 전부 **KST** — 장부·서버(ledger_business_date · kstToday)와 같은 달력이어야 한다.
// 예전엔 브라우저 로컬 TZ(toLocaleDateString)라, KST 보다 뒤진 기기(해외 로밍·시계 오설정·UTC 러너)에서
// 한국 자정~오전 9시 사이엔 **어제** 장부를 '오늘'로 읽어 '미시작' 배지와 [장부 시작하기]가 떴다.
// 정산 단계만 VenueManageTab 에서 kstToday 로 우회하고 있었다 — 근원을 한 곳으로 맞춘다.
const kstDaysAgo = (n: number) => kstToday(Date.now() - n * 86_400_000);
const lastN = (n: number) => Array.from({ length: n }, (_, i) => kstDaysAgo(n - 1 - i));
/** 'YYYY-MM-DD' 다음 날(달력 계산만 — 시간대 무관) */
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const last7 = () => lastN(7);
const last14 = () => lastN(14);
const last28 = () => lastN(28);
const monthRange = () => {
  const n = new Date();
  return {
    start: new Date(n.getFullYear(), n.getMonth(), 1).toLocaleDateString('en-CA'),
    end: new Date(n.getFullYear(), n.getMonth() + 1, 0).toLocaleDateString('en-CA'),
    label: `${n.getMonth() + 1}월`,
  };
};

// PC 밀도 규약(오너 #5, 2026-08-30) — 이 파일의 모든 간격은 아래 4단만 쓴다.
//  1rem = 17px(index.css html) 이라 실제 렌더값은 괄호 안 값이다.
//   gap-1 / mt-1   (4.25px)  라벨↔값 · 아이콘↔글자 · 리스트 행 사이
//   gap-2          (8.5px)   카드 안 요소 그룹 사이
//   gap-3 / p-3    (12.75px) 카드 패딩 · 카드 사이 · 최상위 블록 사이
//   gap-5 / p-5    (21.25px) 섹션 경계 · 빈 상태 박스
//  0.5(2.125) · 1.5(6.375) · 2.5(10.625) · 3.5(14.875) 는 블록 간격으로 쓰지 않는다 —
//  같은 위계가 6.375 와 8.5 로 갈리던 것이 '지저분함'의 정체였다(1440 실측).
//  행간은 §T1 역할표(index.css)를 따른다:
//   설명문·빈 상태 안내 = t-desc(12.75/19.13) + break-keep(한글 어절 중간 줄바꿈 방지)
//   행 안 메타·캡션·뱃지 = text-2xs 기본(11.69/15.94) — leading-* 를 덧붙이지 않는다
//  text-[8px]/[9px]/[11px] 같은 사다리 밖 임의 px 금지(§T1 규칙 2).
//  예외 1가지: rounded-badge 의 내부 패딩(px-1.5 py-0.5)은 뱃지 토큰이라 이 4단의 대상이 아니다
//  — 블록 사이·카드 패딩만 4단으로 통제한다.
export interface DashCaps {
  ledger: boolean; manage: boolean;
  /** 이용권 **열람** — 카드·목록을 그릴까(업주 또는 열람권 직원). */
  voucher: boolean;
  /** 🔴 이용권 **발급** — 액션 버튼을 그릴까. 서버 `can_manage_pos` 와 같은 선이다
   *  (라이브 pg_proc 확인 2026-09-20: admin ∪ 소유자 ∪ **승인 공동운영자**).
   *  ⚠ 열람권(`voucher`)으로 발급을 게이트하면 열람만 가진 직원에게 **죽은 버튼**이 보인다. */
  issueVoucher: boolean;
  posters: boolean; staff: boolean;
}

interface Props {
  venueId: string;
  /** 매장 이름(venues.name) — 없으면 포스터의 pubName, 그것도 없으면 '내 매장'.
   *  2026-09-24: 포스터가 없는 매장은 표지판 줄이 '내 매장' 으로 떠 앱 헤더의 '내 매장' 과 같은 말을 두 번 했다. */
  venueName?: string;
  schedules: Schedule[];
  /** 이동. 문자열이면 예전대로 '지금 화면'을, 객체면 날짜·게임·event·정산 문맥까지 데려간다. */
  onGoto: StoreGoto;
  onCreatePoster: () => void;
  /** 직원 권한에 따라 카드/바로가기 노출 게이팅(업주·운영자는 전부 true). */
  caps: DashCaps;
  /** 현재 보이는 탭일 때만 true — 숨김 상태에서 라이브 1초 틱을 멈춰 백그라운드 리렌더 방지. */
  active?: boolean;
  /** 오늘 5단계의 완료·목적지를 상위 단계 알약 바로 올린다(대시보드 안 숫자 스트립의 후계). */
  onProgress?: (steps: StoreStepMap | null) => void;
  /** 모바일(<1024) 머리 칸 '오늘 장부 요약' 제목 줄의 오른쪽 자리(VenueManageTab). 있으면 갱신 시각·라이브·새로고침을 그리로 보낸다.
   *  오너 10-02 「중복 줄을 빈칸으로 올리기」 — 모바일에선 아래 표지판 줄(매장 · 날짜)이 위 요약 줄을 되풀이해 숨긴다. */
  refreshSlot?: HTMLElement | null;
}

/**
 * 매장 대시보드 — 오늘 장부·클락·예약·출근 + 최근 7일 추세·객단가 + 미수 알림 + 인건비·손님유형을 실시간 요약.
 * 모든 카드는 해당 운영 화면으로 바로가기. 직원은 부여된 권한(caps)의 카드만 노출 — 권한 없는 화면으로의 dead-end 방지.
 */
// 2026-09-25 MYSTORE-FULL-AUDIT #9 — T(회수 이용권)는 금액 비례라 소수가 된다. 무포맷이면 '501.8268 T' 처럼
// 소수 4자리·천단위 없이 떴다. 장부 바(NuriPosLedger '티켓')와 **같은 표기**(소수 1자리 + 천단위)로 맞춘다.
const fmtT = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function StoreDashboard({ venueId, venueName: venueNameProp, schedules, onGoto, onCreatePoster, caps, active = true, onProgress, refreshSlot }: Props) {
  const toast = useToast();
  // B1(2026-09-28) — '오늘'은 매장 **영업일**이다(서버 ledger_business_date 와 같은 값). 자정을 넘긴 토너에서
  //   달력 오늘을 쓰면 00:30 에 '미시작'이 뜨고 손님 바인 요청(날짜=어제 영업일)이 대기열에서 사라졌다.
  const d = useBusinessDate(venueId, active);
  const days = last7();
  const d14 = last14();
  const mr = monthRange();
  // 지금 화면이 '어느 매장의 어느 날짜'인가 — 응답이 도착했을 때 이 값과 다르면 남의 화면 것이다.
  // 렌더 본문에서 동기로 갱신한다(schedulesRef 와 같은 이유 — effect 한 틱을 기다리면 그 사이 응답이 들어온다).
  // ⚠ 아래 1회성 effect(생일·요일 평균·지난 회차)들도 이 값을 쓰므로 **선언 위치가 맨 위여야 한다**.
  const ownerRef = useRef(`${venueId}#${d}`);
  ownerRef.current = `${venueId}#${d}`;
  const genRef = useRef(0);       // 전체 reload 세대
  const rangeGenRef = useRef(0);  // 14일 range 세대 — '다시 시도'가 전체 reload 와 독립적으로 돈다
  const resGenRef = useRef(0);    // 예약 카운트 좁은 재조회 세대(realtime 이 부른다)
  /** 이 매장·이 날짜의 응답일 때만 콜백을 실행한다(세대 없는 1회성 effect 용). */
  const ownerOnly = <T,>(owner: string, fn: (v: T) => void) => (v: T) => { if (ownerRef.current === owner) fn(v); };
  const [session, setSession] = useState<LedgerSession | null>(null);
  const [buyins, setBuyins] = useState<LedgerBuyin[]>([]);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [venueClocks, setVenueClocks] = useState<ClockState[]>([]); // 위젯 멀티게임 — 매장 전체 게임 클락(메인+사이드)
  const [widgetGame, setWidgetGame] = useState(1); // 위젯에서 보고 있는 게임(game_seq)
  const [wHeads, setWHeads] = useState<number | null>(null); // 위젯 사이드 게임 장부 **인원**(생존 폴백용)
  const [dowStats, setDowStats] = useState<{ avg: number | null; weeks: { label: string; entries: number }[] }>({ avg: null, weeks: [] }); // 같은 요일 4주(평균+주차별)
  const [dowOpen, setDowOpen] = useState(false); // 요일 추세 드릴다운(주차 막대) 펼침
  /** 마지막으로 데이터가 도착한 시각 — 운영자가 '지금 보는 숫자가 언제 것인지' 알아야 새로고침을 판단한다.
   *  라이브 구독이 붙어 있어도 구독은 숨김(다른 탭) 동안 꺼지므로 이 표시가 곧 신뢰도다. */
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingReqs, setPendingReqs] = useState<BuyinRequest[]>([]); // 라이브 위젯: 대기중 바인 요청
  const [reqBusy, setReqBusy] = useState<string | null>(null); // 인라인 승인/거절 진행 중 요청 id
  const [payFor, setPayFor] = useState<string | null>(null); // 인라인 승인 결제수단 팝오버(✓ 길게 누르기)
  const [payAmt, setPayAmt] = useState(0); // 팝오버 바인 금액(수정 가능)
  const [splitOpen, setSplitOpen] = useState(false); // 분할 결제 입력 모드
  const [splitVals, setSplitVals] = useState({ cash: 0, card: 0, transfer: 0 }); // 분할 금액
  const [payOrder, setPayOrder] = useState<('cash' | 'card' | 'transfer')[]>(['cash', 'card', 'transfer']); // 결제수단 순서(자주 쓰는 것 먼저 — 학습)
  const [resCounts, setResCounts] = useState<Record<string, number>>({});
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [monthShifts, setMonthShifts] = useState<StaffShift[]>([]);
  const [wages, setWages] = useState<StaffWage[]>([]);
  // ⚠ 시급 조회 실패와 '시급 0원'은 다르다 — 예전엔 catch(() => {}) 라 조회가 죽으면
  //   '총 인건비 0만원'이 금색 숫자로 정상처럼 떴다(2026-09-11 감사).
  const [wageErr, setWageErr] = useState(false);
  const [monthDealers, setMonthDealers] = useState<DealerShift[]>([]);
  const [dealerErr, setDealerErr] = useState(false);
  const [shiftErr, setShiftErr] = useState(false);
  // 인건비는 급여 정산 화면과 같은 규칙(휴게·주휴·5인 가산 설정)으로 센다 — 두 화면의 합계가 달라지면 안 된다.
  const payRules = usePayRules(venueId);
  const [players, setPlayers] = useState<LedgerPlayer[]>([]);
  const [range, setRange] = useState<{ sessions: LedgerSession[]; buyins: LedgerBuyin[] }>({ sessions: [], buyins: [] });
  // #6(2026-09-29) — 이용권 카드 '전송' 수 = 실제로 보낸 장수(store_vouchers). null = 아직/실패(화면은 '—').
  const [sent, setSent] = useState<{ week: number; today: number } | null>(null);
  const [sentErr, setSentErr] = useState<unknown>(null);
  // ⚠ 14일 장부 조회 실패와 '장부가 없다'는 다르다 — 예전엔 catch(() => {}) 라 이 한 번의 실패가
  //   '최근 7일 장부 데이터가 없습니다' · '비교할 장부 데이터가 없습니다' · 이용권 7일 **0장** ·
  //   '오늘 게임' 표 통째 소실로 위장됐다(wageErr·resCountsErr 와 같은 모양으로 갈라놓는다).
  const [rangeErr, setRangeErr] = useState<unknown>(null);
  const [regulars, setRegulars] = useState<VenueRegular[]>([]);
  const [regOpen, setRegOpen] = useState(false);
  const [dealerOpen, setDealerOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  // IA3a 대시보드 다이어트 — 기본 6카드(지금 할 일·라이브·오늘 장부·최근7일·예약·단골)만 노출,
  // 나머지는 '더 보기' 뒤로. 카드 옷을 입은 순수 링크 5장은 제거/유틸 줄로 강등.
  // PC 는 펴고 시작한다 — 오너 2026-09-17: "대시보드에 정보가 샘플 준 것에 비해 너무 없고".
  //   실측 구조: 카드 그리드가 `xl:grid-cols-3` 인데 기본 노출은 3장뿐(최근 7일 추세·다가오는 예약·고객·단골)
  //   → PC 에서 **딱 한 줄**로 끝나고 아래가 통째로 빈다. 접혀 있는 7장(클락·전주 대비·오늘 출근·
  //   인건비·매장이용권·생일 단골·손님 유형)은 **이미 데이터를 받아 그리고 있는 카드**다 —
  //   없는 정보를 만드는 게 아니라 펴는 것이라 새 쿼리가 0건이다.
  // 업주 = PC 99%(CLAUDE.md '플랫폼'), 모바일은 종전대로 접는다 — 거기선 스크롤이 실제 비용이다.
  // 토글은 그대로 살아 있어 언제든 '간단히 보기' 로 접을 수 있다.
  // ⚠ 마운트 1회 판정이다(리사이즈를 따라가지 않는다). 업주가 창을 줄여도 접히지 않지만,
  //   접기는 토글로 되고 매 리사이즈마다 펴고 접는 쪽이 더 놀랍다.
  const [moreOpen, setMoreOpen] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)')?.matches === true);
  // 펼침 칸은 토글 **위** 그리드에 끼어든다 — 누른 토글은 제자리(스크롤 보정), 칸은 투명도로 들고 난다(2026-09-29 감사 #1: 열면 +400px 밀렸다).
  const moreShown = useReveal(moreOpen);
  // 운영 가이드 배너 — 베테랑 매장에도 영구 노출되던 것을 닫기 가능으로(닫으면 기억)
  const [guideHidden, setGuideHidden] = useState(() => {
    try { return localStorage.getItem('nuri:guide-banner-dismissed') === '1'; } catch { return false; }
  });
  const dismissGuide = () => {
    setGuideHidden(true);
    try { localStorage.setItem('nuri:guide-banner-dismissed', '1'); } catch { /* noop */ }
  };
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherPrefill, setVoucherPrefill] = useState(''); // 단골 행 '이용권 보내기' 프리필
  // 오늘 저장된 순위 event 이름들(null=아직 모름/실패). 완료 판정은 (날짜, 게임) 단위라 목록을 그대로 들고 있는다 — F02
  const [rankEventsToday, setRankEventsToday] = useState<string[] | null>(null);
  const [funnel, setFunnel] = useState<WeeklyFunnel | null>(null); // 주간 흐름(조회→예약→방문) — '퍼널' 용어는 UI 에서 금지(오너: 일반인 모름)
  const [staleOpen, setStaleOpen] = useState<{ sessionDate: string; gameSeq: number; title: string | null }[]>([]); // 미마감 지난 장부
  // 마감됐는데 순위 미입력인 지난 대회(밀린 것) — 같은 날 게임이 둘이면 어느 게임인지 라벨로 구분한다(F02)
  const [pendingRanks, setPendingRanks] = useState<PosterOpsSummary[]>([]);
  // 다가오는 생일 단골(7일 내) — CRM 생일 필드 기반
  const [bdays, setBdays] = useState<{ name: string; birthday: string; dday: number }[]>([]);
  useEffect(() => {
    if (!caps.manage) return;
    // §9-1: 매장 A 의 늦은 응답이 B 화면의 '생일 단골'로 남지 않게 소유자를 확인한다.
    const owner = `${venueId}#${d}`;
    getUpcomingBirthdays(venueId).then(ownerOnly(owner, setBdays)).catch(() => {});
  }, [venueId, d, caps.manage]);
  // 같은 요일 평소 엔트리(최근 4주 동일 요일 평균) — 위젯 미니 추세용. 핫 리로드와 분리해 매장당 1회만 로드(28일 데이터).
  useEffect(() => {
    if (!caps.ledger) return;
    const owner = `${venueId}#${d}`;
    // 오너 2026-10-03 Q3 · 리드 F2 — 직원(can_manage_pos 아님)은 날짜별 횟수를 받지 않는다(횟수 × 단가 = 그날 매출).
    //   서버가 평균 하나만 준다(ledger_dow_avg_buyins). 주차별 막대는 업주만 — 직원 위젯은 '오늘 vs 평소' 한 줄.
    //   (직원에게 바인 행은 영업일·미수 행만 보이므로 아래 28일 range 로 세면 평소가 0 에 가깝게 틀린다.)
    // verifier 2026-10-03 경고 2 — 권한 확인 중(caps.manage 거짓)에 나간 평균 응답이 업주 경로(주차별 막대)보다 늦게 오면
    //   같은 owner 키라 ownerOnly 가 못 거르고 weeks 를 [] 로 덮었다. 권한이 바뀌면 앞 갈래 응답은 버린다.
    let alive = true;
    if (!caps.manage) {
      getDowAvgBuyins(venueId).then(ownerOnly(owner, (avg: number | null) => { if (alive) setDowStats({ avg, weeks: [] }); })).catch(() => {});
      return () => { alive = false; };
    }
    const d28 = last28();
    const todayDow = new Date(d + 'T00:00:00').getDay();
    getLedgerRange(venueId, d28[0], d28[27]).then(ownerOnly(owner, ({ sessions, buyins: bs }: Awaited<ReturnType<typeof getLedgerRange>>) => {
      if (!alive) return;
      // ⚠ 세션은 (날짜 + 게임)이 키다. 날짜만으로 매핑하면 사이드 게임이 있는 날
      //   메인 바인이 사이드 단가로 계산돼 엔트리·매출이 통째로 틀어진다(통계 화면과 값이 갈림).
      const byGame = new Map<string, LedgerSession>();
      sessions.forEach((s) => { byGame.set(`${s.sessionDate}#${s.gameSeq}`, s); });
      const weeks: { label: string; entries: number }[] = [];
      for (const day of d28) {
        if (day === d || new Date(day + 'T00:00:00').getDay() !== todayDow) continue;
        let e = 0; let has = false;
        for (const b of bs) {
          if (b.sessionDate !== day) continue;
          const s = byGame.get(`${b.sessionDate}#${b.gameSeq}`);
          if (!s) continue;
          has = true;
          e += 1;   // 요일 비교는 **바이인 횟수** 기준
        }
        if (!has) continue;
        weeks.push({ label: day.slice(5).replace('-', '/'), entries: Math.round(e) });
      }
      const avg = weeks.length > 0 ? Math.round(weeks.reduce((a, w) => a + w.entries, 0) / weeks.length) : null;
      setDowStats({ avg, weeks });
    })).catch(() => {});
    return () => { alive = false; };
  }, [venueId, d, caps.ledger, caps.manage]);
  // 결제수단 기본값 학습 — 매장이 자주 쓰는 결제수단을 팝오버 첫 버튼으로(localStorage 카운트 기반)
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(`nuri:paymethod:${venueId}`) || '{}');
      setPayOrder((['cash', 'card', 'transfer'] as const).slice().sort((a, b) => (c[b] || 0) - (c[a] || 0)));
    } catch { setPayOrder(['cash', 'card', 'transfer']); }
  }, [venueId]);
  const [loading, setLoading] = useState(true);
  // 오늘 장부 3종(세션·바인·명단) 조회 실패 — '미시작'과 갈라놓기 위한 세 번째 상태.
  // 이게 없을 때 대시보드는 실패를 '미시작'으로 위장했고, '지금 할 일'이 그 거짓 근거로
  // [장부 시작하기]를 권했다(누르면 진행 중이던 장부의 마감·단가·할인이 덮인다).
  const [loadErr, setLoadErr] = useState<unknown>(null);
  // 오늘 장부 조회 실패의 원문은 화면 대신 콘솔·Sentry 로(보안 표준 6). Sentry 는 DSN 이 있을 때만 init 되고, 없으면 capture 는 no-op.
  useEffect(() => {
    if (!loadErr || isDenied(loadErr)) return;
    console.error('[store-dashboard] 오늘 장부 조회 실패', loadErr);
    if (import.meta.env.VITE_SENTRY_DSN) import('@sentry/react').then((S) => { S.captureException(loadErr); }).catch(() => {});
  }, [loadErr]);

  const upcoming = schedules
    .filter((s) => s.venueId === venueId && s.date >= d)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  // 스티키 상단 바 매장명 — 이 매장 포스터의 pubName 재사용(추가 조회 없음). 포스터가 없으면 일반 명칭 폴백.
  const venueName = venueNameProp || schedules.find((s) => s.venueId === venueId)?.pubName || '내 매장';

  // C08(2026-09-12) — reload 는 [venueId, d] 로만 재생성되는데 예전엔 그 안에서 `schedules`(props)를
  // 직접 읽어 예약 id 목록을 만들었다. schedules 가 바뀌어도(포스터 추가·삭제) reload 함수 자체는
  // 재생성되지 않으므로, 구독 콜백(subscribeLedger/Clock/BuyinRequests/StaffSchedule)이 부르는 reload 는
  // **reload 가 마지막으로 새로 만들어졌을 때(=venueId·d 바뀔 때)의 낡은 포스터 목록**으로 예약 인원을 조회했다
  // — 화면엔 새 포스터가 보이는데 예약 카운트만 옛 목록 기준이었다. ref 는 매 렌더 본문에서 동기로 갱신되므로
  // (effect 를 안 거친다) reload 의 정체성은 그대로 두면서도 항상 최신 schedules 를 읽는다 —
  // deps 에 schedules 를 넣으면 ledger/clock/buyin/staff 구독까지 매번 재구독되는 부작용이 생긴다.
  const schedulesRef = useRef(schedules);
  schedulesRef.current = schedules;
  // 예약 인원 조회 실패 — '0명'과 갈라놓는다(대시보드의 다른 실패-위장 결함들과 같은 원칙).
  const [resCountsErr, setResCountsErr] = useState<unknown>(null);
  // 예약 realtime 이벤트 하나 때문에 급여·28일 통계까지 통째로 재조회하지 않도록,
  // 예약 카운트만 다시 읽는 좁은 재조회(narrow reload)를 따로 둔다(요청 수 절감).
  const reloadReservations = useCallback(() => {
    const ids = schedulesRef.current.filter((s) => s.venueId === venueId && s.date >= d).map((s) => s.id);
    if (!ids.length) { setResCounts({}); setResCountsErr(null); return Promise.resolve(); }
    // §9-1: realtime 이 연달아 부르는 좁은 재조회다 — 데이터도 오류도 이 세대 것만 쓴다.
    const stamp: RequestStamp<string> = { seq: resGenRef.current + 1, owner: ownerRef.current };
    resGenRef.current = stamp.seq;
    const rFresh = () => !isStaleResponse(stamp, { seq: resGenRef.current, owner: ownerRef.current });
    return getReservationCounts(ids)
      .then((c) => { if (rFresh()) { setResCounts(c); setResCountsErr(null); } })
      .catch((e) => { if (rFresh()) setResCountsErr(e); });
  }, [venueId, d]);

  /** 14일 장부(최근 7일 추세·전주 대비·오늘 게임 표·이용권 7일)만 다시 읽는 좁은 재조회.
   *  성공 여부를 돌려준다 — 실패한 재조회가 '갱신 시각'을 올리지 않게 호출부가 이 값을 본다. */
  const reloadRange = useCallback(() => {
    const stamp: RequestStamp<string> = { seq: rangeGenRef.current + 1, owner: ownerRef.current };
    rangeGenRef.current = stamp.seq;
    const stale = () => isStaleResponse(stamp, { seq: rangeGenRef.current, owner: ownerRef.current });
    // d 는 KST 오늘 = 14일 창의 마지막 날(d14[13]).
    const ledger = getLedgerRange(venueId, kstDaysAgo(13), d).then(
      (r) => { if (stale()) return true; setRange(r); setRangeErr(null); return true; },
      // 낡은(다른 매장·이전 세대) 실패는 지금 화면의 실패가 아니다 — 배너도 띄우지 않고 시각도 막지 않는다.
      (e) => { if (stale()) return true; setRangeErr(e); return false; },
    );
    // #6 — 이용권 카드의 7일·오늘 전송 수. 이용권 카드를 못 보는 사람은 세지 않는다(RLS 0 을 '0장' 으로 보이지 않게).
    const wk = last7();
    const sentLoad = !caps.voucher ? Promise.resolve(true) : Promise.all([
      countVenueVouchersSent(venueId, wk[0], nextDay(wk[wk.length - 1])),
      countVenueVouchersSent(venueId, d, nextDay(d)),
    ]).then(
      ([week, today]) => { if (stale()) return true; setSent({ week, today }); setSentErr(null); return true; },
      (e) => { if (stale()) return true; setSent(null); setSentErr(e); return false; },
    );
    return Promise.all([ledger, sentLoad]).then(([a, b]) => a && b);
  }, [venueId, d, caps.voucher]);

  const reload = useCallback(() => {
    const stamp: RequestStamp<string> = { seq: genRef.current + 1, owner: `${venueId}#${d}` };
    genRef.current = stamp.seq;
    const fresh = () => !isStaleResponse(stamp, { seq: genRef.current, owner: ownerRef.current });
    // §9-1: **이 세대의 응답만** 화면에 쓴다. 예전엔 아래 setter 들이 전부 무가드라
    // 매장 A 의 늦은 응답이 B 화면에 숫자로 남았다(그리고 오류·로딩·갱신 시각도 같이).
    // 콜백을 이 helper 로 감싸는 것이 규칙이다 — 감싸지 않은 setter 는 계약 테스트가 잡는다.
    const guard = <T,>(fn: (v: T) => void) => (v: T) => { if (fresh()) fn(v); };
    // 이번 세대에서 **표시되는 실패**가 하나라도 있었는가 — 있으면 'HH:MM 기준'을 올리지 않는다.
    // (숫자는 옛 값으로 굳었는데 시각만 방금으로 갱신되면 그 시각 자체가 거짓말이다.)
    let ok = true;
    const ids = schedulesRef.current.filter((s) => s.venueId === venueId && s.date >= d).map((s) => s.id);
    if (!ids.length) { setResCounts({}); setResCountsErr(null); }
    // ⚠ 오늘 장부 3종만은 실패를 삼키지 않는다 — 이 화면의 모든 거짓 요약('미시작'·'지금 할 일')의 근원이다.
    const core = Promise.all([
      getLedgerSession(venueId, d).then(guard(setSession)),
      getLedgerBuyins(venueId, d).then(guard(setBuyins)),
      getLedgerPlayers(venueId, d).then(guard(setPlayers)),
      // '지금 할 일' 1·2순위의 근거도 core 다 — 이 둘이 실패를 []로 위장하면 두 달치 미마감이 쌓여 있어도
      // 카드는 '오늘 운영 완료'를 말하고 '순위 미입력' 카드가 사라진다. 실패는 아래 LoadErrorCard + 재시도로.
      // ⚠ src/api/ledger.ts 의 두 함수가 { error } 를 버리고 [] 를 돌려주는 동안은 여기까지 오지 않는다 —
      //   그쪽이 throw 하도록 바뀌면 이 자리가 그 실패를 받는다(같은 계약: getLedgerSession).
      listStaleOpenSessions(venueId).then(guard(setStaleOpen)),
      getPosterOpsSummaries(venueId).then(guard((sums: Awaited<ReturnType<typeof getPosterOpsSummaries>>) => {
        const list = Object.values(sums).filter((s) => s.closed && !s.hasRankings && s.date < d).sort((a, b) => b.date.localeCompare(a.date));
        setPendingRanks(list);
      })),
      // 장부 권한이 없는 직원은 애초에 이 3종을 볼 수 없다(RLS 거절이 정상) — 그 거절을
      // 장애로 띄우면 포스터·출근 안내까지 같이 사라진다. 실패 분기는 장부를 보는 사람에게만.
    ]).then(
      () => { if (fresh()) setLoadErr(null); },
      (e) => { if (!fresh()) return; const err = caps.ledger ? e : null; if (err) ok = false; setLoadErr(err); },
    );
    // ⚠ 종전엔 promise 를 띄운 **직후 동기로** setLoading(false) 였다. 그래서 매 진입마다
    //   로딩이 데이터보다 먼저 끝나고, 스켈레톤 뒤에 초기값(0·없음) 화면이 한 번 확정돼 보였다.
    //   ('이번 주 엔트리 0' · '단골 없음' · '오늘 근무 없음' — 전부 이 한 줄이 원인)
    return Promise.all([
      core,
      getClockState(venueId).then(guard(setClock)).catch(() => {}),
      getVenueClocks(venueId).then(guard(setVenueClocks)).catch(() => {}),
      getPendingBuyinRequests(venueId, d).then(guard(setPendingReqs)).catch(() => {}),
      // 독립 검증 B(2026-09-13): 출근 조회 실패를 삼키면 딜러 인건비만의 값이 '총 인건비 N만원' 으로 뜬다 — wageErr·dealerErr 와 같은 모양.
      getStaffSchedule(venueId, d, d).then(guard((ss: StaffShift[]) => { setShifts(ss); setShiftErr(false); })).catch(guard(() => { setShifts([]); setShiftErr(true); })),
      getStaffSchedule(venueId, weekStartOf(mr.start), mr.end).then(guard((ss: StaffShift[]) => { setMonthShifts(ss); setShiftErr(false); })).catch(guard(() => { setMonthShifts([]); setShiftErr(true); })),
      getStaffWages(venueId).then(guard((w: StaffWage[]) => { setWages(w); setWageErr(false); })).catch(guard(() => { setWages([]); setWageErr(true); })),
      // F6: getDealerShifts 가 이제 실패를 던진다 — 빈 배열로 받으면 '딜러 인건비 0' 이 정상값처럼 보인다. wageErr 와 같은 모양.
      getDealerShifts(venueId, weekStartOf(mr.start), mr.end).then(guard((ds: DealerShift[]) => { setMonthDealers(ds); setDealerErr(false); })).catch(guard(() => { setMonthDealers([]); setDealerErr(true); })),
      // ⚠ 실패를 삼키지 않는다 — 실패하면 rangeErr 가 켜지고 이번 세대의 '갱신 시각'도 올리지 않는다(F14).
      reloadRange().then((good) => { if (!good) ok = false; }),
      getVenueRegulars(venueId).then(guard(setRegulars)).catch(() => {}),
      getVenueRankings(venueId, d).then(guard(({ entries }: Awaited<ReturnType<typeof getVenueRankings>>) => setRankEventsToday(entries.map((e) => e.eventName ?? '')))).catch(() => {}),
      getVenueWeeklyFunnel(venueId).then(guard(setFunnel)).catch(() => {}),
      // 예약 인원도 화면에 '—' 로 실패가 보이는 값이다 — 이번 세대의 갱신 시각을 올리지 않는다.
      ids.length ? getReservationCounts(ids).then(guard((c: Record<string, number>) => { setResCounts(c); setResCountsErr(null); })).catch(guard((e: unknown) => { ok = false; setResCountsErr(e); })) : Promise.resolve(),
    ]).then(() => {
      if (!fresh()) return;   // 매장을 바꿨거나 더 새 요청이 나갔다 — 이 응답으로 화면을 끝내지 않는다
      setLoading(false);
      if (ok) setRefreshedAt(new Date());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId, d, reloadRange]);

  // 오늘 장부(메인)의 순위 입력 여부 — 날짜 Set 으로 보면 사이드만 저장돼도 메인이 '완료'로 뭉쳤다(F02).
  const hasRankToday = useMemo(
    () => (rankEventsToday === null ? null : hasRankingForGame({ gameSeq: session?.gameSeq ?? MAIN_GAME_SEQ, title: session?.title }, rankEventsToday)),
    [rankEventsToday, session?.gameSeq, session?.title],
  );

  useEffect(() => { setLoading(true); reload(); }, [reload]);
  // 숨김(다른 섹션·다른 탭 keep-alive) 동안 구독이 꺼져 있어 이벤트를 놓친다 —
  // 다시 보일 때(active 상승) 한 번 재검증해 마운트-당시 데이터로 굳는 것을 막는다.
  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (active && !prevActiveRef.current) reload();
    prevActiveRef.current = active;
  }, [active, reload]);
  // ⚡ 실시간 구독은 대시보드를 실제로 보고 있을 때만(active) — 숨은 탭이 채널을 물고 있지 않게.
  // F(2026-09-28) — 다른 접수대의 바인 취소·플레이어 삭제(DELETE)와 손님 요청 취소·만료(DELETE)도 받는다.
  //   filter 구독은 DELETE 를 못 받아 대시보드 매출·바인·대기열이 취소 전 숫자로 남았다. 지금 화면에 있는 행 id 만 고른다.
  const ownIdsRef = useRef<{ b: Set<string>; p: Set<string>; r: Set<string> }>({ b: new Set(), p: new Set(), r: new Set() });
  ownIdsRef.current = {
    b: new Set([...buyins.map((x) => x.id), ...range.buyins.map((x) => x.id)]),
    p: new Set(players.map((x) => x.id)),
    r: new Set(pendingReqs.map((x) => x.id)),
  };
  const ownsRow = useCallback((t: 'ledger_buyins' | 'ledger_players', id: string) => (t === 'ledger_buyins' ? ownIdsRef.current.b : ownIdsRef.current.p).has(id), []);
  const ownsReq = useCallback((id: string) => ownIdsRef.current.r.has(id), []);
  useEffect(() => { if (active) return subscribeLedger(venueId, reload, { ownsRow }); }, [venueId, reload, active, ownsRow]);
  useEffect(() => { if (active) return subscribeClock(venueId, reload); }, [venueId, reload, active]);
  // R3-02 — '매장이용권' 카드(7일·오늘 전송 수)는 reloadRange 안에서만 갱신됐다. 다른 접수대·기기의 발급·회수·삭제도 따라가게 구독한다.
  //   (이 화면의 모달에서 보낸 것은 아래 onClose 의 reloadRange 가 즉시 메운다 — realtime 이 늦거나 끊겨도 닫는 순간 맞는다.)
  useEffect(() => { if (active && caps.voucher) return subscribeVenueVouchers(venueId, reloadRange); }, [venueId, reloadRange, active, caps.voucher]);
  useEffect(() => { if (active) return subscribeBuyinRequests(venueId, reload, { ownsId: ownsReq }); }, [venueId, reload, active, ownsReq]);
  // 창 복귀·네트워크 복귀 때 다시 읽는다(realtime 은 끊긴 동안의 변경을 다시 보내 주지 않는다 — lib/realtimeResync).
  useResyncOnWake(reload, active);
  // 예약은 내 매장의 다가오는 포스터만 서버 필터로 수신(전 매장 예약 수신 방지)
  const upcomingIds = useMemo(
    () => schedules.filter((s) => s.venueId === venueId && s.date >= d).map((s) => s.id),
    [schedules, venueId, d],
  );
  // C08 — 예약 이벤트 하나 때문에 급여·28일 통계까지 통째로 재조회하지 않는다(narrow reload).
  useEffect(() => { if (active) return subscribeReservations(reloadReservations, upcomingIds); }, [reloadReservations, upcomingIds, active]);
  // 이 줄만 active 게이트가 빠져 있어 숨은 탭에서도 채널을 물고 reload 를 돌렸다(다른 4개와 규칙을 맞춘다).
  useEffect(() => { if (active) return subscribeStaffSchedule(venueId, reload); }, [venueId, reload, active]);
  // 🔴 K3(2026-09-29 실측) — 업주가 대시보드에만 있을 때도 TV 인원·평균 스택이 따라가게, 장부가 움직이면 연동 클락의
  //   **장부 몫** 스냅샷을 다시 쓴다(장부·클락·리모컨과 같은 작성기 writeLedgerStats 한 벌, 같으면 안 씀).
  //   예전엔 장부·클락 화면만 썼다 — 대시보드 QR 승인·다른 접수대 바인 뒤 4초가 지나도 쓰기 0회, TV 5/5 그대로(4A ①).
  const clocksRef = useRef(venueClocks);
  clocksRef.current = venueClocks;
  const linkedKey = venueClocks.filter((c) => c.sessionDate).map((c) => `${c.gameSeq}@${c.sessionDate}`).join(',');
  useEffect(() => {
    if (!active || !caps.ledger || !linkedKey) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { for (const c of clocksRef.current) if (c.sessionDate) void syncClockLedgerStats(c).catch(() => {}); }, 400);
    };
    run();
    const off = subscribeLedger(venueId, run, { ownsRow });
    return () => { off(); if (t) clearTimeout(t); };
  }, [venueId, active, caps.ledger, linkedKey, ownsRow]);

  // ── 오늘 장부 집계 ──
  // fin.entry 는 **금액 엔트리**(소수), cnt 는 **횟수·인원**. 라벨과 반드시 짝을 맞춘다(오너 규칙 2026-09-11).
  const cnt = ledgerCounts(buyins);
  // F1(2026-09-29) — 돈은 ledgerMoney(바인 + 애드온)로 센다. 정산 KPI 와 같은 정의다.
  const fin = session ? ledgerMoney(buyins, session) : { paid: 0, unpaid: 0, value: 0, entry: 0, ticket: 0 };
  // 🔴 fin.ticket 은 **T 합계**다(2026-09-20 오너: "10만원짜리 3건이면 30T 잖아. T로 표기해.") —
  //   ledgerMoney 가 ticketPaid 를 그대로 더한다. 건수(`ticketPaid > 0 ? 1 : 0`)로 되돌리지 마라.
  //   ⚠ 아래 `weekTicket` 도 같은 척도여야 한다 — 한쪽만 바꾸면 '같은 라벨 다른 척도' 버그가 되돌아온다.
  const started = !!session?.openedAt;
  // PL3①: 마지막 마감 회차 — '지난 게임 그대로 열기' 1탭(오늘 장부 미시작일 때 지금 할 일 후보)
  // 2026-10-03 D1 재검토 D-a — 응답이 **이 매장·날짜의 것인지**를 값과 함께 들고 있는다. '아직 모름'과 '없음(null)'을 갈라야
  //   아래 '지금 할 일' 자리가 지난 회차 응답을 기다리는 동안 스켈레톤으로 자리를 지킨다(늦게 생기며 아래 격자를 72px 밀던 것).
  const [lastRoundRes, setLastRoundRes] = useState<{ owner: string; v: LastClosedRound | null } | null>(null);
  const lastRoundReady = !caps.ledger || lastRoundRes?.owner === `${venueId}#${d}`;
  const lastRound = lastRoundRes?.owner === `${venueId}#${d}` ? lastRoundRes.v : null;
  useEffect(() => {
    if (!caps.ledger) return;
    // §9-1: 매장 A 의 '지난 회차'가 B 화면의 [지난 게임 그대로 열기] 에 남으면 남의 단가·구조로 장부를 연다.
    const owner = `${venueId}#${d}`;
    getLastClosedRound(venueId, d).then(ownerOnly(owner, (v: LastClosedRound | null) => setLastRoundRes({ owner, v })))
      .catch(ownerOnly(owner, () => setLastRoundRes({ owner, v: null })));
  }, [venueId, d, caps.ledger]);
  // 장부 탭이 인텐트를 읽어 오늘 시작 화면에 지난 회차를 1회 자동 적용한다(파일 간 계약: nuri:last-round-intent)
  const gotoLedgerWithLastRound = () => {
    try { localStorage.setItem('nuri:last-round-intent', JSON.stringify({ venueId, at: Date.now() })); } catch { /* noop */ }
    onGoto('ledger');
  };
  // ⚠ 아직 못 읽은 동안 '미시작'이라고 단언하지 않는다 — 본문은 스켈레톤인데 배지만 결론을 말하면
  //   그 배지가 곧 '장부 시작하기'를 정당화하는 거짓 근거가 된다.

  // 오늘 장부 KPI 값 한 칸 — 확인 중엔 자리만(값 visibility:hidden + 같은 크기 스켈레톤), 미시작은 흐린 0(아래 밴드 주석).
  //   ⚠ 컴포넌트가 아니라 함수 호출이다 — 렌더마다 새 컴포넌트를 만들면 안의 CountUp 이 매번 다시 마운트된다.
  const kv = (tone: string, children: ReactNode) => (
    <span className="relative mt-1 block">
      {loading && <span aria-hidden className="skeleton rounded-input absolute inset-0" />}
      <span style={loading ? { visibility: 'hidden' } : undefined}
        className={`block text-lg font-extrabold leading-none tabular-nums lg:text-2xl ${!loading && !dayStarted ? 'text-ink-muted' : tone}`}>
        <span data-kpi-fit className="inline-block origin-left whitespace-nowrap">{children}</span>
      </span>
    </span>
  );
  // 2026-10-03 D1 디자인 재검토 — 모바일 한 줄 4칸(칸 약 66px@360)에서 큰 값이 줄바꿈됐다: 390 '1,025 만'/'원', 소수 '2,779.'/'63',
  //   360 바인 4자리의 '회'(+19px, 정착 뒤 아래가 밀림). 숫자·단위를 한 덩어리(nowrap)로 묶고, 칸보다 넓으면 **transform 으로만** 줄인다
  //   — 레이아웃 높이는 그대로라 칸 높이가 값에 따라 변하지 않는다. CountUp 이 숫자를 바꿀 때마다 ResizeObserver 가 다시 맞춘다.
  const kpiGridRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const grid = kpiGridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const els = [...grid.querySelectorAll<HTMLElement>('[data-kpi-fit]')];
    const fit = () => {
      for (const el of els) {
        const avail = el.parentElement?.clientWidth ?? 0;
        const need = el.offsetWidth; // transform 은 offsetWidth 에 영향이 없다
        el.style.transform = avail > 0 && need > avail ? `scale(${(avail - 1) / need})` : ''; // 1px 여유 — 정수 반올림으로 칸 끝을 넘지 않게
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    els.forEach((el) => ro.observe(el));
    ro.observe(grid);
    return () => ro.disconnect();
  }, [loadErr]);
  const ledgerStatusCls = loading || !started
    ? 'bg-surface-float text-ink-muted'
    : session?.closed ? 'bg-ink-muted/20 text-ink-secondary'
    : session?.regClosed ? 'bg-amber-400/15 text-amber-400'
    : 'bg-emerald-500/15 text-emerald-400';

  // ── 클락 ──
  // K6(2026-09-29) — 레벨·남은 시간은 **실효 레벨**(effectiveLevel) 한 벌. 예전엔 raw current_index 라 전진자가 없는 운영에서
  //   TV 는 레벨 2 인데 대시보드는 '레벨 1 · 0:00' 이었다(5A 실측).
  const cEff = clock ? effectiveLevel(clock) : null;
  const lvl = clock && cEff ? clock.config.levels[cEff.index] : undefined;
  const clockActive = !!clock && (clock.running || clock.currentIndex > 0 || clock.endsAt != null);
  const levelNo = clock && cEff ? levelNumberAt(clock.config.levels, cEff.index) : 0;
  // ── 위젯 멀티게임 — 활성 클락 게임 목록 + 선택 게임(widgetGame)의 라이브 값 ──
  const activeClocks = venueClocks.filter((c) => c.running || c.currentIndex > 0 || c.endsAt != null).sort((a, b) => a.gameSeq - b.gameSeq);
  const wClock = venueClocks.find((c) => c.gameSeq === widgetGame) ?? clock;
  const wActive = !!wClock && (wClock.running || wClock.currentIndex > 0 || wClock.endsAt != null);
  const wEff = wClock ? effectiveLevel(wClock) : null;
  const wLvl = wClock && wEff ? wClock.config.levels[wEff.index] : undefined;
  const wLevelNo = wClock && wEff ? levelNumberAt(wClock.config.levels, wEff.index) : 0;
  const clockRemainMs = wActive && wEff ? wEff.remainingMs : 0;
  // 생존: 클락 liveStats 우선 → 없으면 **인원 − 탈락**.
  // ⚠ 폴백의 기준은 금액 엔트리도 바이인 횟수도 아니라 **사람 수**다(2026-09-07 장부에서 고친 것과 같은 결함).
  //   예전엔 엔트리 합 + adjRebuys 를 썼다 — 리바인은 새 사람이 아니라서 6명이 리바인을 돌린 판에
  //   '생존 41' 이 나왔고, 클락이 붙는 순간 실집계로 6 이 되며 같은 타일이 튀었다.
  //   clock.ts computeLiveStats 도 alive = entries(인원) − eliminations 로 정의한다 — 정의를 맞춘다.
  const wHeadsEff = widgetGame === 1 ? cnt.players : wHeads;
  const survivors = wClock
    ? (wClock.liveStats?.alive ?? Math.max(0, (wHeadsEff ?? 0) + wClock.adjEntries - wClock.eliminations))
    : 0;
  // 요청 게임의 바인 금액(결제 팝오버 표시) — 해당 게임 클락 liveStats 우선, 없으면 메인 세션
  const buyinAmountFor = (gameSeq: number | null) => venueClocks.find((c) => c.gameSeq === (gameSeq ?? 1))?.liveStats?.buyInAmount ?? session?.buyinAmount ?? null;
  const liveWidget = caps.ledger && (clockActive || activeClocks.length > 0 || pendingReqs.length > 0); // 진행 클락(메인/사이드) 또는 대기 요청
  // 2026-10-03 B — '라이브 운영 현황'은 응답(클락·요청)이 와야 서는데, 확인 중엔 자리가 없어 정착 순간 그 높이만큼(PC 175 · 390 263px)
  //   아래 할 일·카드 격자를 밀었다(main 에도 있던 이동). 응답 전엔 클락이 켜져 있는지 모르므로 **이 기기에서 이 매장이 마지막으로 보인 높이**만큼
  //   확인 중에 자리를 잡는다(순위 미입력의 기기 기억과 같은 조리법). 처음 보는 매장·상태가 바뀐 날은 한 번 움직인다.
  // 2026-10-03 settle-fix 후속 ② — 높이에 **날짜**를 붙인다({h, d}). 매장의 하루는 '밤 클락 켬 → 다음 날 아침 꺼짐'이라
  //   날짜 없이 기억하면 다음 날 아침 첫 방문마다 어제 높이만큼 예약했다가 접혀 한 번 움직였다(review-settle-fix-1003 B ③ −175/−263).
  //   오늘 적은 높이만 예약한다. 옛 숫자 형식(날짜 없음)은 '오늘 것이 아님'으로 읽는다.
  const liveKey = `nuri:dash-live-h:${venueId}`;
  const liveRef = useRef<HTMLElement>(null);
  const liveReserveH = useMemo(() => {
    if (!loading) return 0;
    try {
      const v = JSON.parse(localStorage.getItem(liveKey) || 'null') as { h?: unknown; d?: unknown } | null;
      return v && v.d === d ? Number(v.h) || 0 : 0;
    } catch { return 0; }
  }, [loading, liveKey, d]);
  useLayoutEffect(() => {
    if (loading || !active) return; // 숨은 판(keep-alive)의 높이 0 을 '위젯 없음'으로 적지 않는다
    const h = liveWidget ? Math.round(liveRef.current?.getBoundingClientRect().height ?? 0) : 0;
    if (liveWidget && h === 0) return;
    try { if (h > 0) localStorage.setItem(liveKey, JSON.stringify({ h, d })); else localStorage.removeItem(liveKey); } catch { /* 차단 환경 — 예약만 못 한다 */ }
  }, [loading, active, liveWidget, liveKey, d, activeClocks.length, pendingReqs.length]);

  // ── 오늘 게임별 운영 표(§5 다섯 번째 행) ─────────────────────────────────────
  //   새 조회를 만들지 않는다 — range 는 이미 14일치 전 게임을 담고 있고, venueClocks 도 이미 있다.
  //   ⚠ 집계는 반드시 정본 함수로: 횟수·인원은 ledgerCounts, 금액은 ledgerMoney(buyinFinance + addonTotals).
  //     표시용으로 여기서 합산식을 새로 만들면 장부·정산과 숫자가 갈린다(오너 규칙 2026-09-11).
  //   ⚠ 이 값은 아래 stepInfo 5번(정산) 칩의 판정에도 쓰이므로 stepInfo **앞**에 있어야 한다(TDZ).
  const todayGames = useMemo(() => {
    const rows = range.sessions.filter((x) => x.sessionDate === d).sort((a, b) => a.gameSeq - b.gameSeq);
    return rows.map((sx) => {
      const bs = range.buyins.filter((b) => b.sessionDate === d && b.gameSeq === sx.gameSeq);
      const c = ledgerCounts(bs);
      const { value, unpaid, paid, entry, ticket } = ledgerMoney(bs, sx); // 애드온 포함(F1)
      const ck = venueClocks.find((x) => x.gameSeq === sx.gameSeq) ?? null;
      const ckLive = !!ck && (ck.running || ck.currentIndex > 0 || ck.endsAt != null);
      return { sx, c, value, unpaid, paid, entry, ticket, ck, ckLive };
    });
  }, [range, d, venueClocks]);
  // C1 D-7(2026-10-02) — 모바일(<768)에서 데일리 펍 15게임이면 표가 1,320px 였다. 진행 중 게임만 먼저 보이고 마감 게임은 '더 보기'로 편다.
  //   진행 중이 하나도 없거나 마감이 2개 이하면 접지 않는다(표가 비거나 접어 봐야 짧다). PC 는 종전대로 전부.
  const cardGridRef = useRef<HTMLDivElement>(null);
  useEffect(() => fitLastCard(cardGridRef.current));
  const isMdUp = useIsMdUp();
  const [allGames, setAllGames] = useState(false);
  const closedGames = todayGames.filter((g) => g.sx.closed).length;
  const foldGames = !isMdUp && !allGames && closedGames >= 3 && closedGames < todayGames.length;
  // B4(2026-09-28) — '오늘 장부' KPI 는 **그날 전 게임 합산**이다(정산 하루 합계·주간 리포트와 같은 범위).
  //   예전엔 메인 한 판(getLedgerBuyins 기본 game 1)만 세서 사이드가 있는 날 매출·바인·미수가 정산보다 작게 나왔고,
  //   그렇다는 표시도 없었다. 합산 재료는 이미 받은 14일 range(todayGames)라 새 조회 0건.
  //   range 가 아직 없거나 실패하면(rows 0) 메인 한 판 값으로 떨어진다 — 조회 실패가 0원으로 위장되지 않게.
  const day = todayGames.length > 0
    ? todayGames.reduce((a, g) => ({
        paid: a.paid + g.paid, unpaid: a.unpaid + g.unpaid, entry: a.entry + g.entry, ticket: a.ticket + g.ticket,
        totalBuyins: a.totalBuyins + g.c.totalBuyins, games: a.games + 1,
      }), { paid: 0, unpaid: 0, entry: 0, ticket: 0, totalBuyins: 0, games: 0 })
    : { ...fin, totalBuyins: cnt.totalBuyins, games: started ? 1 : 0 };
  const dayStarted = started || todayGames.some((g) => !!g.sx.openedAt);
  // 오늘 하루 정산 끝 — 아래 '정산' 칩(stepInfo.settle)과 '지금 할 일'의 '오늘 운영 완료'가 **이 값 하나**를 본다(dummy-1003 D3:
  //   할 일 카드만 메인 마감을 보고 미수 11만이 남았는데 '오늘 운영 완료'를 말했다).
  const daySettled = isDaySettled(session ? { closed: !!session.closed, unpaid: fin.unpaid } : null,
    todayGames.map((g) => ({ closed: !!g.sx.closed, unpaid: g.unpaid })));
  // ⚠ 아직 못 읽은 동안 '미시작'이라고 단언하지 않는다 — 본문은 스켈레톤인데 배지만 결론을 말하면
  //   그 배지가 곧 '장부 시작하기'를 정당화하는 거짓 근거가 된다.
  // 2026-10-03 settle-fix 후속 ④ — 메인 마감만 보고 '정산 마감'이라 했다(사이드가 열려 있거나 미수가 남아도). D3 와 같은 뿌리라
  //   아래 할 일·'정산' 칩과 같은 판정(daySettled)으로 가른다.
  const ledgerStatus = loading ? '확인 중' : !started ? '미시작'
    : session?.closed ? (daySettled ? '정산 마감' : todayGames.some((g) => !g.sx.closed) ? '마감 · 열린 게임' : '마감 · 미수')
    : session?.regClosed ? '레지 마감' : '진행중';
  /* 오늘 파이프라인 5단계(포스터 → 장부 → 클락 → 순위 → 정산).
     예전엔 이 값으로 대시보드 안에 숫자 스트립을 그렸다. 지금은 **위의 알약 탭바 하나**가 그 역할을
     겸한다(오너 2026-09-08: "두 개를 2번으로 통일해서 한 페이지에서 왔다갔다") — 같은 파이프라인을
     두 벌의 UI 로 그리면 어느 쪽이 진짜인지 알 수 없고, 실제로 그게 "눌렀는데 다른 데로 간다"였다.
     판정값은 전부 이미 로드된 것을 재사용 — 새 쿼리 0건. */
  const stepInfo = useMemo<StoreStepMap | null>(() => {
    if (loading || loadErr || !caps.ledger) return null;
    const closed = !!session?.closed;
    const seq = session?.gameSeq;
    return {
      posters: { done: schedules.some((x) => x.venueId === venueId && x.date === d && x.approved), dest: 'posters' },
      // 🔴 2026-09-20 — `date: started ? d : undefined` 였다. 즉 **오늘 장부를 아직 안 연 상태**
      //   (하루 중 가장 흔한 시작 시점)에서는 날짜 없는 목적지를 줬다. 그 결과 두 가지가 깨졌다:
      //   ① `VenueManageTab` 의 `onPick` 이 `if (fromDash) return onGotoStore(fromDash)` 로
      //      **먼저 잡아채서**, 바로 아래 있는 `date: ledgerSeed?.date ?? kstToday()` 폴백을 건너뛴다.
      //      그 폴백은 오너가 2026-09-07 에 "단계를 눌렀는데 장부 탭으로 간 게 아니다" 라고 지적해
      //      넣은 것이다 — 대시보드 경로에서만 그 수정이 무력화돼 있었다(실측 재현).
      //   ② 시드가 없으면 `goStep('ledger')` 이 `setLedgerSeed(null)` 만 하고, `NuriPosLedger` 의
      //      시드 effect 는 `if (!seed) return` 이라 **아무것도 안 한다**. keep-alive 라 직전에 보던
      //      **다른 날짜 보드가 그대로 남는다** — '오늘 장부' 를 눌렀는데 9/1 숫자를 보게 된다(실측 재현).
      //      다른 날짜 데이터를 오늘 것으로 오인하는 건 단순 이동 버그가 아니다.
      //   → 날짜를 **항상** 싣는다. 이 카드의 라벨('오늘 장부')·안내와도 그래야 맞는다.
      //   ⚠ 종전 주석은 "시작 전이면 목록에서 고르게 둔다" 였는데, 목록은 보드 상단 DateBar 의
      //     '← 목록' 으로 언제든 갈 수 있다. 오너 지적은 그 반대 방향이었다.
      ledger: { done: started, dest: { section: 'ledger', date: d, gameSeq: seq } },
      clock: { done: clockActive || closed, dest: { section: 'clock', gameSeq: seq } },
      ranking: { done: hasRankToday === true, dest: { section: 'ranking', date: d, gameSeq: seq, title: session?.title } },
      // 정산은 별도 화면이 아니라 **장부의 마감**이다 — 미수가 남아 있으면 아직 끝난 게 아니다.
      // F12(2026-09-13) — 1~4번은 '오늘 메인 세션 한 판'의 파이프라인이지만 5번이 여는 판만
      // 2026-09-08 오너 결정으로 **날짜 단위 정산**(전 게임 합산 · '미마감 N게임' 배지)으로 승격됐다.
      // 판정도 그 판과 같은 하루 범위로 맞춘다 — 사이드가 열려 있는데 ✓ 가 뜨면 칩이 여는 화면과 어긋난다.
      // ⚠ todayGames 는 14일 range 에서 나온다. 아직 안 왔거나 조회가 실패했으면 rows 가 비고
      //   every([])=true 라 **예전대로 메인 기준**으로 떨어진다 — 조회 실패가 ✓ 를 지우지 않는다
      //   (실패 자체는 rangeErr 배너가 말한다: F14). 5번 칩 하나만 바꾼다 — KPI 밴드는 단일 세션 그대로.
      settle: {
        done: daySettled,
        dest: { section: 'ledger', date: d, gameSeq: seq, settle: true },
      },
    };
  }, [loading, loadErr, caps.ledger, session, started, clockActive, hasRankToday, daySettled, schedules, venueId, d]);
  useEffect(() => { onProgress?.(stepInfo); }, [stepInfo, onProgress]);
  // '오늘 장부'를 뜻하는 이동(KPI 밴드·장부 보기·미수금·바인 요청 전체 관리·빠른 작업 장부)은 전부 이 하나로.
  // bare 'ledger' 는 resolveDest 규약상 시드를 만들지 않아 goStep 이 ledgerSeed 를 지우고, 장부 판이 처음이면
  // 목록(검색) 모드로 열려 사장님이 오늘 날짜·게임을 다시 골라야 했다(단계 바 '장부'는 2026-09-07 에 같은
  // 이유로 고쳐졌는데 대시보드 카드는 그대로였다). stepInfo.ledger.dest 가 이미 { 오늘, 지금 게임 } 을 든다 —
  // 시작 전(date 없음)이면 예전대로 목록 모드다(그때는 고를 대상이 아직 없다).
  const gotoTodayLedger = () => onGoto(stepInfo?.ledger.dest ?? 'ledger');
  // 위젯에서 보는 게임이 비활성이면 첫 활성 게임으로 자동 전환
  useEffect(() => {
    if (activeClocks.length > 0 && !activeClocks.some((c) => c.gameSeq === widgetGame)) setWidgetGame(activeClocks[0].gameSeq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueClocks]);
  // 위젯 사이드 게임 생존 정밀화 — 선택 게임이 사이드면 그 게임 장부 엔트리 합산(메인은 fin 사용, liveStats 없을 때 폴백)
  useEffect(() => {
    if (widgetGame === 1) { setWHeads(null); return; }
    let alive = true;
    // 생존 폴백에 쓰이므로 **인원**을 센다(엔트리 합이 아니다 — 위 survivors 주석 참고).
    getLedgerBuyins(venueId, d, widgetGame)
      .then((bs) => { if (alive) setWHeads(ledgerCounts(bs).players); })
      .catch(() => { if (alive) setWHeads(null); });
    return () => { alive = false; };
  }, [venueId, d, widgetGame]);
  // 라이브 + 보이는 탭일 때만 초 갱신(카운트다운·"분 전") — 숨김/평상시엔 멈춰 백그라운드 리렌더 방지.
  //   K9 — 공용 틱(lib/clockTick): 위젯 클락이 TV·보드와 같은 순간에 넘어간다. 정지 중에도 초마다 다시 그려 "분 전" 이 흐른다.
  useClockSecond(wClock, liveWidget && active);
  const fmtClock = formatCountdown;   // K9 — 시간 글자 한 벌(올림)
  const gameLabel = (g: number | null) => g == null ? '미지정' : g <= 1 ? '메인' : `사이드${g - 1}`;
  // 위젯 인라인 승인/거절 — 장부로 안 넘어가고 즉시 처리(승인=요청 게임에 추가, 결제 기록은 장부에서 별도)
  // #8(2026-09-29) — 이용권 요청은 접수대가 용도를 고른다(애드온 게임일 때만 '애드온' 버튼). 서버도 같은 조건으로 막는다.
  const gameIsAddon = (seq: number | null) => {
    const s = seq ?? MAIN_GAME_SEQ;
    return !!todayGames.find((g) => g.sx.gameSeq === s)?.sx.isAddon || (session?.gameSeq === s && !!session?.isAddon);
  };
  const quickApprove = async (r: BuyinRequest, voucherUse: VoucherUse = 'buyin') => {
    setReqBusy(r.id);
    // ⚠ 이용권 요청이면 서버가 **티켓 바인을 자동 기록**한다(record_buyin=false 여도). 그때도 할인 자리번호가
    //   쓰이므로 여기서도 넘겨야 한다 — 안 넘기면 0(정가)으로 굳어 discountSummary 가 그 바인을 못 센다.
    try {
      const seq = r.requestedGameSeq ?? MAIN_GAME_SEQ;
      await approveBuyinRequest(r.id, seq, false, 'cash', undefined, await resolveDiscountIndex(venueId, r.sessionDate, seq), voucherUse);
      setPendingReqs((p) => p.filter((x) => x.id !== r.id)); toast.show(voucherUse === 'addon' ? `${r.playerName} 애드온 승인(이용권)` : `${r.playerName} 참가 승인`, 'success');
      // S-15 — 남은 이용권 요청 장수를 알린다(목록 자체는 실시간 구독이 맞춘다 — 여기서 덮으면 매장 전환 경합이 생긴다).
      if (r.voucherId) {
        // 매장 전환 뒤 도착한 A 손님 안내가 B 화면 토스트로 뜨지 않게 같은 소유자 확인(§9-1 ownerOnly)
        getPendingBuyinRequests(venueId, r.sessionDate).then(ownerOnly(`${venueId}#${d}`, (rs: BuyinRequest[]) => {
          const n = voucherLeftover(r, rs);
          if (n > 0) toast.show(voucherLeftoverText(r.playerName, n), 'info');
        })).catch(() => {});
      }
    }
    catch (e) {
      // 20260930i — 이용권이 모자라면 서버가 숫자를 실어 준다. 남은 금액 결제 선택은 장부 접수대 카드에 있다.
      const s = voucherShortOf(e);
      toast.show(s ? `이용권이 모자랍니다 — ${s.have}장 + 남은 ${s.remainder.toLocaleString()}원은 장부 접수대에서 결제 방법을 골라 승인하세요` : msgOf(e, '승인 실패'), 'error');
    }
    finally { setReqBusy(null); }
  };
  const quickReject = async (r: BuyinRequest) => {
    setReqBusy(r.id);
    try { await rejectBuyinRequest(r.id); setPendingReqs((p) => p.filter((x) => x.id !== r.id)); toast.show(`${r.playerName} 요청 거절`, 'info'); }
    catch (e) { toast.show(msgOf(e, '거절 실패'), 'error'); }
    finally { setReqBusy(null); }
  };
  // ✓ 길게 누르기 → 결제수단(현금/카드/이체) 팝오버 → 바인 기록까지 승인. 짧게 탭 = 결제 기록 없이 게임 추가
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFired = useRef(false);
  const cancelLP = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } };
  const startLP = (r: BuyinRequest) => {
    lpFired.current = false; cancelLP();
    lpTimer.current = setTimeout(() => {
      lpFired.current = true;
      const amt = buyinAmountFor(r.requestedGameSeq) ?? 0; // 기본 금액 프리필(수정 가능)
      setPayAmt(amt); setSplitOpen(false); setSplitVals({ cash: amt, card: 0, transfer: 0 });
      setPayFor(r.id);
    }, 480);
  };
  // 자주 쓰는 결제수단 학습 — 카운트++ 후 순서 갱신
  const bumpPay = (method: 'cash' | 'card' | 'transfer') => {
    try {
      const key = `nuri:paymethod:${venueId}`;
      const c = JSON.parse(localStorage.getItem(key) || '{}');
      c[method] = (c[method] || 0) + 1;
      localStorage.setItem(key, JSON.stringify(c));
      setPayOrder((['cash', 'card', 'transfer'] as const).slice().sort((a, b) => (c[b] || 0) - (c[a] || 0)));
    } catch { /* noop */ }
  };
  // 승인 + 바인 기록. 우세 결제수단 학습.
  //
  // 🔴 2026-09-17 — `method` 가 있으면 **split 을 서버에 보내지 않는다.** 이게 이 함수의 핵심이다.
  //   서버 `approve_buyin_request` 는 두 갈래다(pg_get_functiondef 실측):
  //     · 비분할: `v_net := greatest(0, v_unit - v_disc)` — **서버가 대상 게임의 단가·할인을 직접 계산**하고
  //       discount_index 도 서버가 찍는다.
  //     · 분할:   `insert … values (…, true, p_cash, p_card, p_transfer, v_idx …)` — **검증이 0이다.**
  //   예전엔 단일 결제수단 3버튼도 split 객체를 넘겨(`p_split = !!split = true`) 분할 갈래로 들어갔다.
  //   그래서 대시보드에서 기록된 **모든** 바인이 is_split=true · discount_index=0 · 화면 입력값 그대로가 됐다.
  //   같은 손님을 장부 화면에서 승인하면 할인이 적용된 **다른 금액**이 찍힌다 — 접수 창구에 따라 매출이 갈렸다.
  //   여파는 금액만이 아니다: discount_index=0 이면 `api/ledger.ts` 의 discountSummary 가 그 바인을 못 세고,
  //   buyinFinance 의 disc=0 때문에 엔트리가 0.5 대신 1.0 으로 잡힌다.
  //   ⚠ 라이브 노출은 오늘 0이다(할인 프리셋을 등록한 세션 0건). **첫 할인 프리셋을 만드는 날 켜질 잠복 결함**이라
  //     그 전에 닫는다 — 4a66248 이 장부 쪽에 같은 이유로 넣은 가드와 짝이다.
  const doApprove = async (
    r: BuyinRequest,
    split: { cash: number; card: number; transfer: number },
    method?: 'cash' | 'card' | 'transfer',
  ) => {
    const sum = split.cash + split.card + split.transfer;
    if (sum <= 0) { toast.show('금액을 입력하세요', 'error'); return; }
    setPayFor(null); setReqBusy(r.id);
    try {
      // method 경로 = 서버 계산(split 미전달). 분할 경로만 화면이 정한 금액을 보낸다.
      // 🔴 2026-09-17: 여기 9번째 인자가 **없었다** → 서버 기본값 0(할인 없음)으로 들어가,
      //   1레벨 5만 할인 프리셋이 있는 게임에서 장부 승인은 5만, 대시보드 승인은 10만으로 갈렸다.
      //   판정은 장부와 **같은 함수**를 쓴다(resolveDiscountIndex) — 두 벌로 두면 또 갈린다.
      const seq = r.requestedGameSeq ?? MAIN_GAME_SEQ;
      const discIdx = await resolveDiscountIndex(venueId, r.sessionDate, seq);
      await approveBuyinRequest(r.id, seq, true, method ?? 'cash', method ? undefined : split, discIdx);
      bumpPay(method ?? (split.cash >= split.card && split.cash >= split.transfer ? 'cash' : split.card >= split.transfer ? 'card' : 'transfer'));
      setPendingReqs((p) => p.filter((x) => x.id !== r.id));
      // ⚠ 서버가 계산한 경로에서는 **금액을 말하지 않는다** — 화면의 프리필은 대상 게임에 클락이 없으면
      //   메인 게임 단가로 떨어지므로, 그 숫자를 성공 토스트에 적으면 틀린 금액을 사실처럼 알리게 된다.
      toast.show(method ? `${r.playerName} 승인 · 바인 기록` : `${r.playerName} 승인 · 바인 ${wonToMan(sum)}만`, 'success');
    } catch (e) { toast.show(msgOf(e, '승인 실패'), 'error'); }
    finally { setReqBusy(null); }
  };
  const PM_LABEL: Record<'cash' | 'card' | 'transfer', string> = { cash: '현금', card: '카드', transfer: '이체' };

  // ── 예약 / 출근 ──
  const totalRes = upcoming.reduce((a, g) => a + (resCounts[g.id] ?? 0), 0);
  const workedStaff = shifts.filter((s) => s.checkIn);

  // ── 최근 7일 추세 + 객단가 ──
  // ⚠ 통계 패널과 동일하게 (날짜 + 게임) 키로 페어링 — 날짜만 쓰면 사이드 게임이 있는 날
  //   메인 바인이 사이드 단가로 계산돼 대시보드와 통계가 다른 숫자를 보여준다.
  const sessByGame = new Map<string, LedgerSession>();
  range.sessions.forEach((s) => { sessByGame.set(`${s.sessionDate}#${s.gameSeq}`, s); });
  const perDay = days.map((day) => {
    let entry = 0, paid = 0;
    for (const b of range.buyins) {
      if (b.sessionDate !== day) continue;
      const s = sessByGame.get(`${b.sessionDate}#${b.gameSeq}`);
      if (!s) continue;
      const f = buyinFinance(b, s);
      entry += 1; paid += f.paid + addonFinance(b).revenue;   // entry 는 여기서 **횟수**다(막대·객단가용). 매출은 애드온 포함(통계 완납액과 같은 정의)
    }
    return { day, dow: DOW[new Date(day + 'T00:00:00').getDay()], entry: Math.round(entry), paid };
  });
  const weekEntry = perDay.reduce((a, x) => a + x.entry, 0);
  /** '최근 7일 추세' 카드가 숫자 없는 빈 틀(확인 중·실패·데이터 없음)인가 — 그 카드의 렌더 분기와 이웃 높이 맞춤이 같이 쓴다. */
  const trendBlank = caps.manage && (loading || !!rangeErr || weekEntry === 0);
  /** 이웃('대회 클락'·'전주 대비') 높이 맞춤은 **정착 뒤** 빈 틀(데이터 없음·실패)일 때만 — 확인 중에도 늘리면 데이터 매장(대부분)에서
   *  171 로 늘었다가 정착에 98.7/121 로 줄었다(review-mystore-followup-1003 1-d). 빈 매장은 정착 때 늘어나지만 줄 높이는 7일 카드(171)가
   *  이미 정하고 있어 아래 줄은 움직이지 않는다. */
  const trendFill = trendBlank && !loading;
  const weekPaid = perDay.reduce((a, x) => a + x.paid, 0);
  const maxEntry = Math.max(1, ...perDay.map((x) => x.entry));
  const bestDay = perDay.reduce((a, x) => (x.entry > a.entry ? x : a), perDay[0]);
  // 객단가는 **횟수**로 나눈다 — 금액 엔트리로 나누면 매출 ≈ 엔트리 × 단가 라서 언제나 단가가 나온다.
  const avgSpend = weekEntry > 0 ? Math.round(weekPaid / weekEntry) : 0; // 원 / 바이인 1회

  // ── 위젯 미니 추세: 오늘 엔트리 vs 같은 요일 평소(최근 4주 동일 요일 평균 — dowStats 별도 로드) ──
  const todayDow = new Date(d + 'T00:00:00').getDay();
  const sameDowAvg = dowStats.avg;
  const todayEntries = day.totalBuyins;   // 같은 요일 비교 — 횟수 기준(위 weeks 와 같은 척도 = 그날 전 게임 바인 횟수)
  const dowDelta = sameDowAvg && sameDowAvg > 0 ? Math.round(((todayEntries - sameDowAvg) / sameDowAvg) * 100) : null;

  // ── 전주 대비(직전 7일) ──
  const prevDays = d14.slice(0, 7);
  const prevSet = new Set(prevDays);
  // ⚠ 이번 주(weekEntry)는 **바이인 횟수**(위 perDay 의 entry += 1)다. 전주도 같은 척도로 세야 한다 —
  //   여기만 금액 엔트리(f.entry)를 쓰면 할인·티켓이 있는 주에 전주가 실제보다 작게 잡혀 증감률이 부풀려진다.
  //   (2026-09-11 오전에 이번 주만 횟수로 바꾸면서 이 줄이 남아 척도가 갈렸다.)
  let prevBuyins = 0, prevPaid = 0;
  for (const b of range.buyins) {
    if (!prevSet.has(b.sessionDate)) continue;
    const s = sessByGame.get(`${b.sessionDate}#${b.gameSeq}`);
    if (!s) continue;
    prevBuyins += 1; prevPaid += buyinFinance(b, s).paid + addonFinance(b).revenue; // 이번 주(perDay)와 같은 척도 — 애드온 포함
  }
  const entryDelta = prevBuyins > 0 ? Math.round(((weekEntry - prevBuyins) / prevBuyins) * 100) : null;
  const paidDelta = prevPaid > 0 ? Math.round(((weekPaid - prevPaid) / prevPaid) * 100) : null;

  // (오늘 게임별 운영 표 todayGames 는 stepInfo 5번 칩과 같은 값을 쓰므로 위쪽으로 옮겼다 — F12)

  // ── 매장이용권(회수 티켓) 최근 7일 ──
  let weekTicket = 0;
  for (const b of range.buyins) {
    if (!days.includes(b.sessionDate)) continue;
    // 분납 티켓도 buyinFinance가 ticketPaid에 포함해 반환한다(과거엔 대시보드만 누락)
    const s = sessByGame.get(`${b.sessionDate}#${b.gameSeq}`);
    if (s) weekTicket += ticketUsedT(buyinFinance(b, s), addonFinance(b)); // T 합계(바인 + 애드온) — 위 fin.ticket 과 **같은 척도**여야 한다(2026-09-20 오너 결정)
  }
  // #6(2026-09-29) — 이용권 전송 수 7일 / 오늘 = 실제로 보낸 장수(store_vouchers, 전송 취소 제외). 장부 수기 칸(voucher_issued)이 아니다.
  const weekVoucher = sent?.week ?? 0;
  const todayVoucher = sent?.today ?? 0;
  const sentBad = !!sentErr || sent === null;

  // ── 고객·단골 상위(바인·방문 횟수 기준, 관계자[직원] 제외) ──
  const staffNames = new Set(wages.map((w) => w.name.trim()));
  const topRegulars = regulars.filter((r) => !staffNames.has(r.name.trim())).slice(0, 5);

  // (2026-09-11) AI 운영 요약 제거 — 이 화면이 이 앱에서 **자동으로** 외부 모델을 부르던 유일한 자리였고,
  //   프롬프트에 단골 손님 실명 5명(이름·바인 수·방문 수)이 그대로 실렸다. 매장 운영 데이터와 고객명을
  //   외부로 보내지 않는다. 같이 사라진 것: nuri:ai-weekly:* 로컬 캐시, 월·화 첫 진입 자동 생성.
  //   운영 분석이 필요하면 '통계' 화면의 운영 리포트(LedgerStatsPanel.buildOpsReport)를 쓴다 —
  //   그쪽은 처음부터 외부 호출 없이 로컬 집계로만 문장을 만든다.

  // ── 인건비(이번 달) — 직원·딜러 모두 staffPay.laborSummary(급여 정산 화면과 같은 함수·같은 설정) ──
  // 기록은 첫 주 월요일부터 읽는다(주 40h·주휴). 이 달 밖의 날 금액은 laborSummary 가 넣지 않는다.
  const labor = laborSummary({ from: mr.start, to: mr.end, today: d, rules: payRules.rules, staff: monthShifts,
    wages: Object.fromEntries(wages.map((w) => [w.name, w.hourlyWage])), dealers: monthDealers });
  const laborTotal = labor.total, laborHours = labor.netMin / 60, dealerPay = labor.dealerPay;
  // 시급이든 딜러 근무든 못 불러왔으면 합계는 숫자가 아니다 — '0만원' 이 정상값처럼 읽힌다(F6). 급여 설정도 같다.
  const laborErr = wageErr || dealerErr || shiftErr || !!payRules.err;

  // ── 손님 유형 비중(오늘 명단) ──
  const typeCount: Record<string, number> = {};
  for (const p of players) {
    const key = visitorLabel(p.visitorType) || '기타';
    typeCount[key] = (typeCount[key] ?? 0) + 1;
  }
  const typeEntries = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);
  const playerTotal = players.length;

  // 직원 권한에 따른 노출 — 운영 권한이 0이어도 **본인 것**은 볼 수 있어야 한다(오너 지시 2026-09-15 ④:
  //   "일반 직원들의 경우 본인의 스케쥴을 볼 수 있는 메뉴와 본인 인건비, 출퇴근을 볼 수 있어야").
  //   예전엔 여기가 막다른 안내 한 장이라 일반 직원에게 내 매장이 **아무 쓸모가 없었다.**
  const anyCap = caps.ledger || caps.manage || caps.voucher || caps.posters || caps.staff;
  if (!anyCap) return <MyStaffCard venueId={venueId} />;
  // settle-fix 후속 ③ — 할 일이 '미수 회수' 갈래로 그려졌는지. 아래 JSX 에서 할 일 카드가 빨간 미수 배너보다 **먼저** 평가되며 이 값을 세운다
  //   (같은 렌더 안 순서). 같은 사실(미수 N만)을 KPI·할 일·배너 세 번 말하던 것을 줄이고, 배너가 빠지면 1280·1366 에서 할 일 설명 폭이 돌아온다.
  let todoOwedShown = false;

  return (
    <div className="space-y-3">
      {/* 고객·단골(CRM). 이용권 보내기는 권한이 있을 때만 넘긴다 — 없으면 버튼 자체가 그려지지 않는다.
          모달을 겹치지 않고 교체한다: 시트 위 시트는 뒤로가기 스택이 꼬이고 반투명이 두 겹 쌓인다. */}
      <RegularsModal open={regOpen} onClose={() => setRegOpen(false)} venueId={venueId} exclude={[...staffNames]} money={caps.manage}
        onSendVoucher={caps.issueVoucher ? (name) => { setRegOpen(false); setVoucherPrefill(name); setVoucherOpen(true); } : undefined} />
      <Suspense fallback={null}>
      <DealerShiftsModal open={dealerOpen} onClose={() => setDealerOpen(false)} venueId={venueId} monthKey={mr.start.slice(0, 7)} />
      </Suspense>
      <VoucherManageModal open={voucherOpen} onClose={() => { setVoucherOpen(false); setVoucherPrefill(''); void reloadRange(); }} venueId={venueId} prefillReceiver={voucherPrefill} canIssue={caps.issueVoucher} />
      {/* canIssue: 출석 명단에서 바로 이용권을 보낼 수 있게 한다(오너 2026-09-18). 권한 최종 판정은 서버(issue_voucher).
          🔴 2026-09-20 — 종전엔 `caps.voucher`(**열람권 포함**)였다. 열람만 가진 직원에게 발급 버튼이 보이고
             누르면 서버가 거절했다 — 누를 수 있는 척하는 죽은 버튼. `caps.issueVoucher`(= 서버 can_manage_pos)로 바꾼다. */}
      <CheckinModal open={checkinOpen} onClose={() => { setCheckinOpen(false); void reloadRange(); }}venueId={venueId} canIssue={caps.issueVoucher} />
      <BoostContactModal open={boostOpen} onClose={() => setBoostOpen(false)} />

      {/* ① 공지 스트립 — 업주 운영 가이드(전폭·dismissible). 슬라이드(새 탭)·PDF. 닫으면 기억(IA3a) */}
      {/* ⚠ 375 에서 라벨이 '운영 가이'로 잘려 있었다 — 버튼 3개가 shrink-0 이라 라벨 폭이 먼저 죽는다.
          한 줄에 못 담으면 버튼 줄이 아래로 내려가게(flex-wrap) 바꿔 글자가 잘리지 않게 한다.
          PC(1280·1440)는 폭이 남아 예전과 똑같이 한 줄이다. */}
      {/* 레이아웃 (오너 2026-09-07 "줄간격이랑 정돈"):
          · 종전엔 제목과 버튼 묶음이 한 줄에서 justify-between 이었고, 375 에서 버튼 줄이 아래로 내려가면
            ml-auto 가 그 줄을 오른쪽으로 밀어 **왼쪽에 큰 빈칸**이 생겼다(들쭉날쭉해 보이는 주범).
          · 닫기 ✕ 는 액션 버튼들과 같은 줄에서 경쟁했다 — 성격이 다른 버튼이라 제목 줄 오른쪽으로 올린다.
          · order 로 순서만 바꿔 마크업은 하나로 둔다(버튼을 두 벌 그리지 않는다).
            모바일: 제목 ─ ✕ / 버튼 3개가 다음 줄을 꽉 채움(flex-1 로 등간격)
            sm+   : 제목 ─ 버튼 3개 ─ ✕ 한 줄(종전과 동일)
          · 2026-09-18 오너 스크린샷: 모바일 첫 줄이 '운영 가이드 ……… ✕' 로 **38px 높이의 빈 줄**처럼 보였다
            (설명 span 은 sm 미만에서 원래 안 그려지고, ✕ 의 h-9 상자가 첫 줄 높이를 정했다 — 실측 첫 줄 38.3px 중 라벨 17px).
            ✕ 에 -my-2 로 세로 여백을 상쇄해 첫 줄을 라벨 캡션 높이로 접는다(히트 상자 38px 는 그대로,
            카드 py-2 안에서만 겹친다). sm+ 는 한 줄이라 my‑0 으로 되돌린다.
          · 2026-09-24 히트영역 44px(오너 지시) — h-9/min-h-9(38.25px, 루트 폰트 17px 기준)는 44px 미달이라
            h-[44px]/min-h-[44px] 로 올린다. ✕ 는 히트 상자만 키우고 첫 줄 압축은 유지해야 해서
            -my-2 → -my-3 으로 다시 맞췄다(44 − 2×12.75 ≈ 18.5px, 종전 21.25px 캡션 자리와 비슷하다).
          · P-09(2026-10-01) — PC(lg+)는 상자를 걷고 세 버튼을 밑줄 링크(보이는 32px)로. 누름은 before 로 위아래 7px 씩 보태 44 이상
            (6px 이면 이웃에 가려 실효 42 였다 — 리드 10-01 조건). ✕ 는 세로 여백 −6px 로 줄 높이를 34px 로 접는다. */}
      {!guideHidden && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border-subtle bg-surface-low px-3 py-2 lg:border-transparent lg:bg-transparent lg:p-0">
        <span className="order-1 flex min-w-0 flex-1 items-center gap-2 text-xs text-ink-secondary">
          <Icon name="bookmark" size={13} className="shrink-0 text-ink-muted" />
          <b className="text-ink-primary">운영 가이드</b><span className="hidden sm:inline">포스터→장부→클락→순위→정산 한눈에</span>
        </span>
        <button type="button" onClick={dismissGuide} aria-label="가이드 배너 닫기"
          className="order-2 -my-3 grid h-[44px] w-[44px] shrink-0 place-items-center rounded-input text-ink-muted transition-colors hover:bg-surface-float/60 hover:text-ink-primary sm:order-3 sm:my-0 lg:my-[-6px]">
          <Icon name="close" size={14} strokeWidth={2.4} />
        </button>
        {/* min-h-[44px](종전 min-h-9=38.25px, 그 전 py-1=26px): sm+ 에서는 내용 폭 그대로. */}
        <span className="order-3 flex w-full shrink-0 items-center gap-2 sm:order-2 sm:w-auto">
          <button type="button" onClick={() => window.open('/guide/manual.html', '_blank', 'noopener')}
            className="min-h-[44px] flex-1 rounded-input border border-accent-400/40 bg-accent-300/10 px-3 text-2xs font-bold text-accent-300 transition-colors hover:bg-accent-300/20 sm:flex-none lg:min-h-[32px] lg:border-transparent lg:bg-transparent lg:px-[8px] lg:underline lg:underline-offset-3 lg:relative lg:before:absolute lg:before:inset-x-0 lg:before:inset-y-[-7px]">
            사용설명서
          </button>
          <button type="button" onClick={() => window.open('/guide/owner.html', '_blank', 'noopener')}
            className="min-h-[44px] flex-1 rounded-input border border-border-default px-3 text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary sm:flex-none lg:min-h-[32px] lg:border-transparent lg:bg-transparent lg:px-[8px] lg:underline lg:underline-offset-3 lg:relative lg:before:absolute lg:before:inset-x-0 lg:before:inset-y-[-7px]">
            가이드
          </button>
          <a href="/guide/owner.pdf" download="NURI-HOLDEM-업주가이드.pdf"
            className="grid min-h-[44px] flex-1 place-items-center rounded-input border border-border-default px-3 text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary sm:flex-none lg:min-h-[32px] lg:border-transparent lg:bg-transparent lg:px-[8px] lg:underline lg:underline-offset-3 lg:relative lg:before:absolute lg:before:inset-x-0 lg:before:inset-y-[-7px]">
            PDF
          </a>
        </span>
      </div>
      )}

      {/* ② 스티키 상단 바 — 매장명 + 라이브 인디케이터 + 날짜. 컬럼 스코프 sticky(--stack-top 아래) */}
      {/* 모바일: 배경 없음 — 글자와 하단 헤어라인만(오너 2026-09-07 "덮혀있는 검은 색 부분 전체 제거").
            이 바가 배경을 갖고 있던 유일한 이유는 sticky 라 스크롤 내용이 비치면 안 돼서였다.
            폰에서는 상단 앱 헤더가 이미 '내 매장'을 계속 말해 주므로 이 줄까지 붙들어 둘 이유가 없다
            → sticky 를 풀면 배경이 필요 없어지고, 요청대로 '글자 + 줄 하나'만 남는다.
            (bg-surface-base 는 평평한 #06080F 라 아우라 블룸이 깔린 주변 위에서 검은 상자로 떴고,
             블룸을 섞은 subbar-aura 로 바꿔 보니 이번엔 보라 띠가 돼 더 도드라졌다 — 실측 확인.)
          PC(lg+): 종전 그대로 sticky + 불투명 배경 — 업주는 밀도가 우선이라 표지판을 붙들어 둔다. */}
      {/* 🔴 오너 10-02 「중복 줄을 빈칸으로 올리기」 — 모바일은 아래 표지판 줄(위 요약 줄과 같은 말)을 숨기고,
          갱신 시각·라이브·새로고침만 머리 칸 '오늘 장부 요약' 오른쪽(refreshSlot)으로 portal 한다. 상태·동작은 여기 그대로.
          자리가 없으면(머리 칸 미렌더) 종전대로 표지판 줄을 보인다 — 새로고침이 사라지는 경로는 없다. PC 는 종전 그대로. */}
      {refreshSlot && createPortal(
        <>
          {/* F3: 320px + 라이브 칩이면 제목과 2.1px 겹쳤다 — 그 폭에서만 시각을 접는다(라이브 칩·새로고침이 우선) */}
          <span className={`text-2xs tabular-nums text-ink-muted${liveWidget ? ' max-[339px]:hidden' : ''}`} data-dash-refreshed="">
            {refreshedAt ? `${String(refreshedAt.getHours()).padStart(2, '0')}:${String(refreshedAt.getMinutes()).padStart(2, '0')} 기준` : loadErr ? '불러오지 못함' : '불러오는 중'}
          </span>
          {liveWidget && (
            <span className="flex shrink-0 items-center gap-1 rounded-chip border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-2xs font-bold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />라이브
            </span>
          )}
          {/* 머리 칸 action 은 버튼을 h-8 로 맞춘다 — 누름 상자는 before 로 사방 7px 를 보태 46px(2026-09-24 히트영역 44 · 2026-10-05 루트 16px 에서
              h-8 이 34 → 32px 라 종전 5px 로는 42px 였다. px 고정 · 소수 좌표 반올림 여유 2px). */}
          <button type="button" title="새로고침" aria-label="대시보드 새로고침"
            disabled={refreshing || loading}
            onClick={() => { setRefreshing(true); void Promise.resolve(reload()).finally(() => setRefreshing(false)); }}
            className="relative grid w-8 place-items-center px-0! rounded-input text-ink-muted transition-colors before:absolute before:-inset-[7px] hover:bg-surface-float/60 hover:text-ink-primary disabled:opacity-40">
            <Icon name="refresh" size={13} className={refreshing ? 'animate-spin' : undefined} />
          </button>
        </>, refreshSlot)}
      <div className={`border-b border-border-subtle py-2 ${refreshSlot ? 'max-lg:hidden ' : ''}lg:sticky lg:top-[calc(var(--stack-top,6.0625rem)-1px)] lg:z-20 lg:-mb-1 lg:bg-surface-base lg:before:pointer-events-none lg:before:absolute lg:before:inset-x-0 lg:before:-top-3 lg:before:h-3 lg:before:bg-surface-base`}>
        {/* 이 줄은 파이프라인의 '지금 어디' 표지판이다 — 매장 · 진행 여부 · 날짜.
            2026-09-04 오너 지시로 다듬음. 원칙 3가지:
             ① **한 줄 유지** — 스티키라 높이를 늘리면 PC 대시보드의 세로를 영구히 먹는다(업주는 밀도 우선).
             ② 위계: 매장명(주인공) > 라이브(상태) > 날짜(맥락). 종전엔 셋이 같은 평면에 있었고
                날짜는 11.7px 회색이라 '오늘 무슨 요일 장부를 보는 중인지'가 안 읽혔다.
             ③ 아우라 문법 편입 — 주변이 전부 card-aura 인데 이 줄만 아무 처리가 없어 떠 보였다.
                타일(tile-grad)은 Head 패턴 그대로. 글로우는 쓰지 않는다(화면당 1곳 규칙 — 대시보드는 KPI 밴드가 주인공). */}
        {/* 한 덩어리로 왼쪽 정렬 — justify-between 이면 넓은 화면에서 날짜만 수백 px 떨어진
            오른쪽 끝에 홀로 남는다(2026-09-06 오너 스크린샷). 이 줄은 "지금 어디" 표지판이라
            매장 · 날짜 · 상태가 서로 붙어 있어야 한 호흡에 읽힌다. */}
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-input tile-grad" aria-hidden>
              <Icon name="store" size={13} />
            </span>
            <span className="truncate text-base font-bold leading-none text-ink-primary">{venueName}</span>
            {/* 날짜는 매장명 **옆**. 우측 끝 블록으로 두면 좁은 폭에선 '로티아레나 ……… 09.05 금' 으로 찢어지고
                (오너 2026-09-05), 넓은 폭에선 날짜만 오른쪽 끝에 홀로 떨어져 더 크게 치우친다(오너 2026-09-06).
                두 폭 모두 '이름 바로 옆' 하나가 답이라 분기를 없애고 한 요소로 합쳤다 — '오늘'만 좁은 폭에서 접는다. */}
            <span className="shrink-0 text-2xs tabular-nums text-ink-muted">
              · <span className="hidden font-semibold text-ink-secondary sm:inline">오늘 </span>
              {d.slice(5).replace('-', '.')} <span className={['font-semibold', todayDow === 0 ? 'text-danger-light' : todayDow === 6 ? 'text-accent-200' : 'text-ink-secondary'].join(' ')}>{DOW[todayDow]}</span>
            </span>
            {liveWidget && (
              /* 상태는 '글자'가 아니라 '칩' — 스티키에 상시 떠 있으므로 형태로도 구분돼야 스캔된다 */
              <span className="flex shrink-0 items-center gap-1 rounded-chip border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-2xs font-bold text-emerald-400">
                <span className="relative flex h-1.5 w-1.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                라이브
              </span>
            )}
          </span>
          {/* 2026-09-11 PC 개편: '마지막 갱신 + 새로고침'. 이 줄은 스티키라 높이를 늘리면 안 되므로
              같은 줄 오른쪽 끝에 붙인다(ml-auto). 시각은 PC 에서만 — 360px 에선 매장명이 먼저다. */}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className="hidden text-2xs tabular-nums text-ink-muted lg:inline">
              {refreshedAt ? `${String(refreshedAt.getHours()).padStart(2, '0')}:${String(refreshedAt.getMinutes()).padStart(2, '0')} 기준` : loadErr ? '불러오지 못함' : '불러오는 중'}
            </span>
            {/* 2026-09-24 모바일 44px — 종전 h-8(34px). 음수 세로 여백으로 이 표지판 줄 높이는 그대로 둔다(py-2 안에서 겹침).
                PC(lg)는 종전 h-8 그대로. */}
            <button type="button" title="새로고침" aria-label="대시보드 새로고침"
              disabled={refreshing || loading}
              onClick={() => { setRefreshing(true); void Promise.resolve(reload()).finally(() => setRefreshing(false)); }}
              className="-my-2.5 grid h-[44px] w-[44px] place-items-center lg:my-0 lg:h-8 lg:w-8 rounded-input text-ink-muted transition-colors hover:bg-surface-float/60 hover:text-ink-primary disabled:opacity-40">
              <Icon name="refresh" size={13} className={refreshing ? 'animate-spin' : undefined} />
            </button>
          </span>
        </div>
      </div>

      {/* ③ KPI 헤드라인 — 오늘 장부 핵심 숫자를 헤더로 격상(eyebrow 상태 pill + 큰 숫자). 탭하면 장부로. */}
      {caps.ledger && (loadErr ? (
        /* 실패는 '미시작'이 아니다 — 배지·숫자·[장부로 이동]을 통째로 걷어내고 못 불러왔다고 말한다.
           (카드 안 '다시 시도' 버튼이 button 중첩이 되지 않게 밴드 자체를 대체한다) */
        /* 🔴 2026-10-01(보안 표준 6) — 종전엔 error 를 그대로 넘겨 카드가 PostgREST 원문
           ('JSON object requested, multiple (or no) rows returned')을 화면에 그렸다(msgOf 는 PGRST* 원문을 통과시킨다).
           화면엔 사용자 문구만: 권한 거부일 때만 error 를 넘긴다(msgOf 가 '이 계정에는 권한이 없습니다'로 옮긴다).
           원문은 아래 effect 가 콘솔·Sentry 로만 남긴다. */
        <LoadErrorCard error={isDenied(loadErr) ? loadErr : undefined} what="오늘 장부"
          hint="잠시 후 다시 시도해 주세요"
          onRetry={() => { setLoading(true); reload(); }} />
      ) : (
        <button type="button" onClick={gotoTodayLedger}
          className="section-alt block w-full rounded-card p-3 text-left transition-colors hover:border-border-default">{/* v6.3 KPI 밴드(레퍼런스 교차 밴드) — 대시보드 1곳 한정 */}
          <span className="flex items-center gap-2">
            <span className="text-2xs font-bold text-ink-muted">오늘 장부</span>
            <span className={`rounded-badge px-1.5 py-0.5 text-2xs font-bold ${ledgerStatusCls}`}>{ledgerStatus}</span>
            {/* 2026-10-03 — 합산 안내를 머리 줄 안으로: 별도 줄이면 로딩 뒤에 생겨 아래 카드를 밀었다. */}
            {!loading && day.games > 1 && <span data-testid="dash-kpi-games" className="text-2xs text-ink-muted">게임 {day.games}개 합산</span>}
          </span>
          {/* 2026-10-03 (C1 후속 R-dash · D1 재검토 D-b) — 확인 중·미시작·진행 중 **세 상태가 같은 높이**다.
              종전엔 확인 중 = 스켈레톤(카드 107px) → 미시작 = 숫자 칸 없음(48px)으로 접혀 아래 카드 격자가 약 60px 올라갔다
              (첫 진입·매장 전환 모두, CLS 1440 0.017 · 390 0.029). 이제 격자를 늘 그린다.
              · 확인 중: 값은 visibility 로 가리고(자리 유지·지난 매장 숫자 차단) 그 위에 같은 크기 스켈레톤 막대를 겹친다.
                ⚠ 지난 매장 숫자가 안 비치는 것은 매장 전환 때 판이 다시 마운트되는 덕도 있다(VenueManageTab shellBusy) —
                CountUp 은 이제 로딩 동안 언마운트되지 않으므로, 그 재마운트를 없애면 B 확정 순간 A→B 카운트가 보일 수 있다.
              · 미시작: 0 이 사실이다(장부가 없으면 매출·바인·미수·이용권은 0). 흐린 색으로 '자리'임을 보이고 시선은 아래 할 일 CTA 로.
              · 모바일도 한 줄 4칸(text-lg) — 2×2 는 칸이 184px 라 360 에서 '순위 입력' 카드가 첫 화면 밖으로 밀렸다. */}
          {(
            /* C1 D-2 — items-start: 엔트리 보조줄이 붙은 칸만 높아져도 옆 칸 라벨 윗줄은 맞는다. */
            <span ref={kpiGridRef} data-testid="dash-kpi-grid" aria-busy={loading || undefined} className={`mt-2 grid ${caps.manage ? 'grid-cols-4' : 'grid-cols-3'} items-start gap-x-3 gap-y-3 lg:gap-x-6`}>
              {/* 오너 2026-10-03 Q3 — 직원(can_manage_pos 아님)에게는 매출 칸 자체가 없다(0 으로도 그리지 않는다). */}
              {caps.manage && (
              <span data-testid="dash-kpi-revenue" className="block min-w-0">
                <span className="block text-2xs text-ink-muted">완납 매출</span>
                {kv('text-ink-primary', <>{wonToMan(day.paid)}<span className="ml-1 text-2xs font-semibold text-ink-muted lg:text-sm">만원</span></>)}
              </span>
              )}
              <span className="block min-w-0">
                <span data-testid="dash-kpi-buyins" className="block text-2xs text-ink-muted">총 바인</span>
                {kv('stat-indigo', <>
                  <CountUp value={day.totalBuyins} /><span className="ml-1 text-2xs font-semibold text-ink-muted lg:text-sm">회</span>
                  {/* 엔트리는 금액 기준이라 소수가 된다 — CountUp 은 정수 애니라 옆에 그대로 적는다. */}
                  <span className="mt-1 block text-2xs font-semibold text-ink-muted">엔트리 {day.entry.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                </>)}
              </span>
              <span className="block min-w-0">
                <span className="block text-2xs text-ink-muted">미수금</span>
                {kv(day.unpaid > 0 ? 'text-danger-light' : 'text-ink-primary', <>{wonToMan(day.unpaid)}<span className="ml-1 text-2xs font-semibold text-ink-muted lg:text-sm">만원</span></>)}
              </span>
              <span className="block min-w-0">
                <span data-testid="dash-kpi-ticket" className="block text-2xs text-ink-muted">사용 이용권</span>
                {/* 2026-09-11: '장' 은 통계·정산의 'T' 와 같은 수를 다른 이름으로 불러 헷갈렸다 — 단위를 T 로 통일. */}
                {kv('stat-fuchsia', <>{fmtT(day.ticket)}<span className="ml-1 text-2xs font-semibold text-ink-muted lg:text-sm">T</span></>)}
              </span>
            </span>
          )}
        </button>
      ))}

      {/* 🔴 라이브 운영 현황 — 진행 클락 + 대기 바인요청을 한 카드에. 운영 중일 때만 노출(상황 인지형 커맨드센터)
          아우라 v6.5 '화면당 글로우 1곳'의 **이 탭 주인공**(오너 결정 2026-09-07).
          자격 근거: 조건(liveWidget)이 문자 그대로 '지금 진행 중'이라 상시 배경이 되지 않는다 —
          CalendarPanel.tsx:243 이 캘린더를 뺀 바로 그 기준을 통과한다. 대시보드의 다른 카드는 전부
          '지난 것·집계·안내'인데 이 카드만 실시간(1초 틱)이라 업주의 손이 실제로 가는 자리다.
          · 테두리는 절반으로(accent-400/40 → /20): 링 헤어라인이 테두리를 대신한다. 안 줄이면 3중선이 된다
            (LiveGamesTab.tsx:494 hero 와 같은 조리법).
          · box-shadow 는 자기 overflow-hidden 에 잘리지 않고, .ring-aura::before 는 inset:0 이라 범위 안이다.
          · 이 카드가 뜨는 동안 아래 '지금 할 일' CTA 는 보라 후광을 내려놓는다(그 카드 주석 참조) —
            안 그러면 같은 화면에 바이올렛 후광이 둘이 되어 '어느 쪽이 지금인가'가 사라진다. */}
      {loading && liveReserveH > 0 && <div aria-hidden data-testid="live-reserve" className="skeleton rounded-card" style={{ height: liveReserveH }} />}
      {!loading && liveWidget && (
        <section ref={liveRef} data-testid="live-widget" className="overflow-hidden rounded-card border border-accent-400/20 ring-aura ring-aura-glow bg-linear-to-br/srgb from-accent-300/[0.07] to-transparent">
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-bold text-ink-primary">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              라이브 운영 현황
            </span>
            <span className="text-2xs text-ink-muted tabular-nums">{d.slice(5).replace('-', '/')}</span>
          </div>
          {/* 멀티게임 탭 — 메인+사이드 동시 진행 시 게임 전환 */}
          {activeClocks.length >= 2 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle px-2 py-2">
              {activeClocks.map((c) => {
                const on = c.gameSeq === widgetGame;
                return (
                  <button key={c.gameSeq} type="button" onClick={() => setWidgetGame(c.gameSeq)}
                    className={['shrink-0 rounded-input px-2 py-1 text-2xs font-bold transition-colors', on ? 'bg-accent-300 text-white' : 'bg-surface-float text-ink-secondary hover:text-ink-primary'].join(' ')}>
                    {c.gameSeq <= 1 ? '메인' : `사이드${c.gameSeq - 1}`}{c.running ? '' : ' · 정지'}
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-1 divide-y divide-border-subtle sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {/* 진행 클락(선택 게임) */}
            <button type="button" onClick={() => onGoto('clock')} className="flex items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-white/2">
              <div className="min-w-0">
                <p className="mb-1 text-2xs text-ink-muted">{activeClocks.length >= 2 ? (widgetGame <= 1 ? '메인' : `사이드${widgetGame - 1}`) + ' 클락' : '대회 클락'}{wActive ? (wClock?.running ? ' · 진행' : ' · 일시정지') : ''}</p>
                {wActive && wLvl ? (
                  wLvl.kind === 'break' ? (
                    <p className="text-2xl font-extrabold leading-none text-ink-primary">BREAK</p>
                  ) : (
                    <>
                      <p className="text-xl font-extrabold leading-none text-ink-primary tabular-nums">{wLvl.sb.toLocaleString()}<span className="text-ink-muted">/</span>{wLvl.bb.toLocaleString()}</p>
                      <p className="mt-1 text-2xs text-ink-muted">레벨 {wLevelNo}{wLvl.ante > 0 ? ` · ante ${wLvl.ante.toLocaleString()}` : ''}</p>
                    </>
                  )
                ) : (
                  <p className="text-sm font-bold text-ink-secondary">클락 꺼짐 <span className="text-2xs font-normal text-ink-muted">눌러서 켜기</span></p>
                )}
              </div>
              {wActive && (
                <div className="shrink-0 text-right">
                  <p className={`text-3xl font-extrabold leading-none tabular-nums ${wClock?.running ? 'text-emerald-400' : 'text-amber-400'}`}>{fmtClock(clockRemainMs)}</p>
                  <p className="mt-1 text-2xs text-ink-muted">남은 인원 <b className="tabular-nums text-ink-primary">{survivors}</b></p>
                </div>
              )}
            </button>
            {/* 대기 바인요청 — 위젯에서 바로 ✓승인 / ✕거절(장부로 안 넘어감) */}
            <div className="flex flex-col p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xs text-ink-muted">대기중 바인 요청</p>
                <span className={`rounded-badge px-1.5 py-0.5 text-2xs font-bold ${pendingReqs.length > 0 ? 'bg-danger/15 text-danger-light' : 'bg-surface-float text-ink-muted'}`}>{pendingReqs.length}건</span>
              </div>
              {pendingReqs.length === 0 ? (
                <button type="button" onClick={gotoTodayLedger} className="flex-1 py-3 text-center text-2xs text-ink-muted hover:text-ink-secondary">대기중인 요청이 없습니다.</button>
              ) : (
                <>
                  <ul className="mt-2 space-y-1">
                    {pendingReqs.slice(0, 3).map((r) => (
                      <li key={r.id} className="relative flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate text-ink-secondary">{r.playerName}</span>
                        <span className="shrink-0 text-2xs tabular-nums text-ink-muted">{relativeTime(r.createdAt)}</span>
                        <span className="shrink-0 rounded-badge bg-surface-float px-1 py-0.5 text-2xs text-ink-secondary">{gameLabel(r.requestedGameSeq)}</span>
                        {/* ⚠ 승인(✓)과 거절(✕)이 24px 로 6px 간격에 붙어 있었다.
                            접수대에서 한 손으로 누르는 자리인데, 오탭하면 손님이 거절되거나
                            엉뚱한 사람이 명단에 들어간다 — 되돌리는 비용이 승인 1탭과 비대칭이다.
                            히트영역을 40px 로 키우고 둘 사이 간격을 벌려 손가락 하나 안에서 갈리지 않게 한다.
                            S-13(2026-10-01) — 예전엔 -my-2 로 줄 높이를 접어 42.5px 상자가 줄(25.5px) 밖으로 8.5px 씩 넘쳤다:
                            마지막 줄 버튼이 아래 '장부에서 전체 관리' 링크를 9px 덮고(1440·1280·1024 실측), 요청이 2건 이상이면
                            윗줄 ✓ 와 아랫줄 ✓ 가 서로 겹쳤다(오탭 = 엉뚱한 손님 승인). 음수 여백 없이 줄이 버튼 높이를 갖는다. */}
                        {r.voucherId != null && gameIsAddon(r.requestedGameSeq) && (
                          <button type="button" data-testid="dash-approve-voucher-addon" disabled={reqBusy === r.id} onClick={() => quickApprove(r, 'addon')}
                            title="이용권 → 최근 바인에 애드온(애드온 금액 ÷ 1만 장)"
                            className="shrink-0 flex h-10 items-center rounded-input bg-accent-300/15 px-2 text-2xs font-bold text-accent-300 hover:bg-accent-300/25 disabled:opacity-40">애드온</button>
                        )}
                        <button type="button" disabled={reqBusy === r.id}
                          onPointerDown={() => startLP(r)} onPointerUp={cancelLP} onPointerLeave={cancelLP} onPointerCancel={cancelLP}
                          onClick={() => { if (lpFired.current) { lpFired.current = false; return; } quickApprove(r); }}
                          title="탭: 승인(게임 추가) · 길게: 결제수단 선택해 바인 기록" aria-label="승인"
                          className="shrink-0 ml-0.5 flex h-10 min-w-10 items-center justify-center rounded-input bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 active:scale-95 disabled:opacity-40"><Icon name="check" size={15} strokeWidth={2.6} /></button>
                        <button type="button" disabled={reqBusy === r.id} onClick={() => quickReject(r)} title="거절" aria-label="거절"
                          className="shrink-0 ml-2 flex h-10 min-w-10 items-center justify-center rounded-input bg-danger/15 text-danger-light hover:bg-danger/25 active:scale-95 disabled:opacity-40"><Icon name="close" size={15} strokeWidth={2.6} /></button>
                        {payFor === r.id && (
                          <div className="absolute right-0 top-full z-30 mt-1 w-52 space-y-2 rounded-input border border-border-default bg-surface-float p-2 shadow-dialog">
                            {/* 바인 금액 직접 수정(리바인·할인) */}
                            <div className="flex items-center gap-1">
                              <span className="shrink-0 text-2xs text-ink-muted">바인</span>
                              <input type="number" inputMode="numeric" value={payAmt || ''} onChange={(e) => setPayAmt(Math.max(0, Number(e.target.value) || 0))}
                                className="min-w-0 flex-1 rounded-[5px] border border-border-default bg-surface-high px-1.5 py-1 text-xs tabular-nums text-ink-primary" placeholder="금액" />
                              <span className="shrink-0 text-2xs text-ink-muted">원</span>
                              <button type="button" onClick={() => setSplitOpen((v) => !v)} className={['shrink-0 rounded-[5px] px-1.5 py-1 text-2xs font-bold', splitOpen ? 'bg-accent-300 text-white' : 'bg-surface-high text-ink-secondary'].join(' ')}>분할</button>
                            </div>
                            {!splitOpen ? (
                              <div className="flex items-center gap-1">
                                {payOrder.map((m, i) => (
                                  <button key={m} type="button" onClick={() => doApprove(r, { cash: m === 'cash' ? payAmt : 0, card: m === 'card' ? payAmt : 0, transfer: m === 'transfer' ? payAmt : 0 }, m)}
                                    className={['flex-1 rounded-[5px] py-1 text-2xs font-bold', i === 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-high text-ink-secondary hover:text-accent-300'].join(' ')}>{PM_LABEL[m]}</button>
                                ))}
                                <button type="button" onClick={() => setPayFor(null)} aria-label="닫기" className="shrink-0 px-1 text-ink-muted hover:text-ink-secondary"><Icon name="close" size={12} /></button>
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-3 gap-1">
                                  {(['cash', 'card', 'transfer'] as const).map((m) => (
                                    <label key={m} className="flex flex-col gap-0.5">
                                      <span className="text-2xs text-ink-muted">{PM_LABEL[m]}</span>
                                      <input type="number" inputMode="numeric" value={splitVals[m] || ''} onChange={(e) => setSplitVals((s) => ({ ...s, [m]: Math.max(0, Number(e.target.value) || 0) }))}
                                        className="w-full rounded-[5px] border border-border-default bg-surface-high px-1 py-1 text-2xs tabular-nums text-ink-primary" placeholder="0" />
                                    </label>
                                  ))}
                                </div>
                                <div className="flex items-center justify-between gap-1">
                                  <span className={['text-2xs tabular-nums', (splitVals.cash + splitVals.card + splitVals.transfer) === payAmt && payAmt > 0 ? 'text-emerald-400' : 'text-ink-muted'].join(' ')}>합계 {(splitVals.cash + splitVals.card + splitVals.transfer).toLocaleString()}{payAmt ? ` / ${payAmt.toLocaleString()}` : ''}</span>
                                  <span className="flex items-center gap-1">
                                    {/* 🔴 합계가 금액과 맞아야 확정된다. 예전엔 `sum <= 0` 만 봐서 **합계가 안 맞아도 눌렸다** —
                                        분할 갈래는 서버 검증이 0이라 8만만 적힌 10만 게임이 그대로 저장되고, 미수 칸이 0이라
                                        사라진 2만이 장부 어디에도 남지 않는다. 바로 왼쪽 '합계' 글자색이 이미 같은 식을 계산하고 있었다 —
                                        눈에만 보여 주던 판정을 버튼에 연결한다(새 식 0개).
                                        ⚠ 금액 칸은 업주가 고칠 수 있으므로 프리필이 틀려도 막다른 길이 아니다
                                          (4a66248 의 '기준을 모르면 막지 않는다' 와 어긋나지 않는다 — 여기서는 기준을 업주가 정한다). */}
                                    <button type="button" onClick={() => doApprove(r, splitVals)}
                                      disabled={payAmt <= 0 || (splitVals.cash + splitVals.card + splitVals.transfer) !== payAmt}
                                      title={payAmt <= 0 ? '금액을 먼저 입력하세요' : (splitVals.cash + splitVals.card + splitVals.transfer) !== payAmt ? '분할 합계가 금액과 다릅니다' : undefined}
                                      className="rounded-[5px] bg-emerald-500/20 px-2 py-1 text-2xs font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40">승인</button>
                                    <button type="button" onClick={() => setPayFor(null)} aria-label="닫기" className="px-1 text-ink-muted hover:text-ink-secondary"><Icon name="close" size={12} /></button>
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={gotoTodayLedger} className="mt-auto pt-2 text-left text-2xs font-bold text-accent-300 hover:text-accent-200">{pendingReqs.length > 3 ? `외 ${pendingReqs.length - 3}건 · ` : ''}장부에서 전체 관리 →</button>
                </>
              )}
            </div>
          </div>
          {/* 미니 추세 — 오늘 vs 같은 요일 평소(4주 평균). 탭하면 주차별 막대 드릴다운 */}
          {/* 직원은 평균 하나만 받는다(weeks 빈 배열 — 리드 F2) → 주차별 막대 드릴다운이 없다. 줄은 버튼이 아니라 글줄. */}
          {(clockActive || activeClocks.length > 0) && sameDowAvg != null && (
            <div className="border-t border-border-subtle">
              <button type="button" onClick={() => setDowOpen((v) => !v)} disabled={dowStats.weeks.length === 0} data-testid="dash-dow-row"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-2xs transition-colors enabled:hover:bg-white/2 disabled:cursor-default">
                <span className="text-ink-muted">오늘 vs 평소 <b className="text-ink-secondary">{DOW[todayDow]}요일</b></span>
                <span className="tabular-nums text-ink-secondary">
                  오늘 <b className="text-ink-primary">{todayEntries}</b> · 평소 <b className="text-ink-primary">{sameDowAvg}</b>
                  {dowDelta != null && <span className={['ml-1 font-bold', dowDelta > 0 ? 'text-emerald-400' : dowDelta < 0 ? 'text-danger-light' : 'text-ink-muted'].join(' ')}>{dowDelta > 0 ? '▲' : dowDelta < 0 ? '▼' : '–'}{Math.abs(dowDelta)}%</span>}
                  {dowStats.weeks.length > 0 && <span className="ml-1 text-ink-muted">{dowOpen ? '▲' : '▼'}</span>}
                </span>
              </button>
              <Fold open={dowOpen && dowStats.weeks.length > 0}>{() => {
                const bars = [...dowStats.weeks, { label: '오늘', entries: todayEntries }];
                const max = Math.max(1, ...bars.map((b) => b.entries));
                return (
                  <div className="px-3 pb-3">
                    <p className="mb-2 text-2xs text-ink-muted">최근 {DOW[todayDow]}요일 바인 추이</p>
                    {/* 막대 트랙(h-16) + 4주 평균 점선 오버레이 */}
                    <div className="relative h-16">
                      {sameDowAvg != null && sameDowAvg > 0 && (
                        <div className="pointer-events-none absolute inset-x-0 z-10" style={{ bottom: `${Math.min(98, (sameDowAvg / max) * 100)}%` }}>
                          <div className="border-t border-dashed border-ink-secondary/60" />
                          <span className="absolute -top-2 right-0 bg-surface-low/85 px-1 text-2xs tabular-nums text-ink-secondary">평균 {sameDowAvg}</span>
                        </div>
                      )}
                      <div className="flex h-full items-end justify-between gap-2">
                        {bars.map((b, i) => {
                          const isToday = i === bars.length - 1;
                          return (
                            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
                              <div className={['w-full max-w-[26px] rounded-xs', isToday ? 'bg-accent-300' : 'bg-accent-300/40'].join(' ')} style={{ height: `${Math.max(4, (b.entries / max) * 100)}%` }} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* 라벨(날짜·엔트리) */}
                    <div className="mt-1 flex justify-between gap-2">
                      {bars.map((b, i) => (
                        <span key={i} className={['flex-1 text-center text-2xs tabular-nums', i === bars.length - 1 ? 'font-bold text-ink-primary' : 'text-ink-muted'].join(' ')}>{b.label}<br />{b.entries}</span>
                      ))}
                    </div>
                    <button type="button" onClick={() => onGoto('stats')} className="mt-2 text-2xs font-bold text-accent-300 hover:text-accent-200">통계에서 자세히 →</button>
                  </div>
                );
              }}</Fold>
            </div>
          )}
        </section>
      )}

      {/* 📊 주간 흐름(조회→예약→방문) — '왜 예약이 없는지'에 데이터로 답하는 첫 카드.
          조회수 추적(2026-08-17 신설)이 쌓이기 시작한 뒤부터 의미가 생긴다.
          ⚠ 카피에 '퍼널·전환율' 같은 외래 분석 용어 금지(오너 지시) — 자연스러운 한국어로 풀어 쓴다.
          v6 아우라(2026-09-04): card-elev(v4 수직 광원 background-image)와 card-aura(겹친 box-shadow)가
          한 뷰포트에 공존해 카드마다 테두리 밝기가 달라 보였다 — card-aura 로 통일한다.
          두 문법은 역할이 겹치므로 card-elev 는 반드시 **제거**한다. 이중이 되는 게 아니라 **사라진다** —
          box-shadow 는 합쳐지지 않고 교체되고, .card-elev(index.css 1585)가 .card-aura(136)보다 뒤에
          같은 특이도로 있어 겹친 그림자가 홑 inset 1줄로 덮인다(2026-09-04 GTO 탭 24장 실측).
          내부 3칸은 surface-high 라 손대지 않는다. */}
      {!loading && funnel && funnel.tournaments > 0 && (
        <section className="rounded-aura border card-aura p-3">
          {/* 감사 D-1(오너 지적) — items-baseline 이면 제목 h3 가 아이콘 든 flex 라 기준선이 아이콘 바닥이 되어 '통계 →' 가 3.1px 아래로 처졌다 */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-primary"><Icon name="filter" size={13} className="shrink-0 text-ink-muted" />최근 7일 흐름 <span className="font-normal text-ink-muted">조회→예약→방문 · 대회 {funnel.tournaments}개</span></h3>
            <button type="button" onClick={() => onGoto('stats')} className="hit shrink-0 text-2xs font-bold text-accent-300">통계 →</button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-center">
            <div className="min-w-0 flex-1 rounded-input bg-surface-high px-1 py-2">
              <p className="text-lg font-extrabold tabular-nums text-ink-primary">{funnel.views}</p>
              <p className="mt-1 text-2xs text-ink-muted">포스터 조회</p>
            </div>
            <span aria-hidden className="shrink-0 text-ink-muted">→</span>
            <div className="min-w-0 flex-1 rounded-input bg-surface-high px-1 py-2">
              <p className="text-lg font-extrabold tabular-nums text-ink-primary">
                {funnel.reservations}
                {funnel.views > 0 && funnel.reservations > 0 && (
                  // '전환율' 대신 자연어 설명 — 숫자는 그대로, 뜻만 풀어준다
                  <span className="ml-1 text-2xs font-bold text-ink-secondary" title="포스터를 본 사람 중 예약으로 이어진 비율">{Math.round((funnel.reservations / funnel.views) * 100)}%</span>
                )}
              </p>
              <p className="mt-1 text-2xs text-ink-muted">예약</p>
            </div>
            <span aria-hidden className="shrink-0 text-ink-muted">→</span>
            <div className="min-w-0 flex-1 rounded-input bg-surface-high px-1 py-2">
              <p className="text-lg font-extrabold tabular-nums text-ink-primary">{funnel.checkins}</p>
              <p className="mt-1 text-2xs text-ink-muted">출석</p>
            </div>
          </div>
          {funnel.views === 0 && (
            <p className="mt-2 t-desc break-keep text-ink-muted">조회수는 손님이 포스터 상세를 열 때 쌓여요.</p>
          )}
        </section>
      )}

      {/* ── §5 첫 번째 행 — 왼쪽 8: 지금 해야 할 일 · 오른쪽 4: 주의가 필요한 항목 ──────────
          PC 는 '지금 뭘 하지'와 '뭐가 위험하지'를 **동시에** 봐야 한다. 세로로 쌓으면 위험 항목이
          접힌 화면 아래로 내려가 스크롤해야 보인다. 모바일은 그대로 1열(순서: 할 일 → 위험).
          ⚠ 두 열은 내용이 없으면 `empty:hidden` 으로 접힌다 — 안 접으면 빈 칸이 grid 자리를 먹어
            오른쪽이 비었을 때 왼쪽 카드가 8/12 폭에 갇힌 채 옆이 허전해 보인다.
          ponytail: 둘 다 비면(할 일 없음 + 위험 없음) 부모 space-y 의 간격 한 칸이 남는다.
            '오늘 운영이 전부 끝난' 드문 상태라 그대로 둔다 — 없애려면 두 IIFE 의 null 조건을
            바깥으로 끌어내야 하고, 그 리팩터가 이 12.75px 보다 위험하다. */}
      {/* ⚠ 2026-09-16: 예전엔 xl 에서 12열 격자 + `col-span-8/4` 였다. 그런데 `empty:hidden` 으로 오른쪽이 사라져도
          `grid-column: span 8` 은 여전히 12열 중 8열이라 **좌측이 626px 에 갇히고 321.7px 이 빈 채 남았다**
          (실측: 패널 948px · 우측 empty 시 좌 626.3 / 공백 321.7). flex 로 바꾸면 이웃이 사라질 때 남은 쪽이 948 을 다 쓴다. */}
      <div className="space-y-3 xl:flex xl:items-start xl:gap-4 xl:space-y-0">
      <div className="space-y-3 empty:hidden xl:min-w-0 xl:flex-2">
      {/* 지금 할 일 — 시간대·운영 상태 인지형 다음 행동 카드(대시보드 = 행동 안내판) */}
      {(() => {
        // ⚠ 이 카드의 모든 분기가 session/started 를 근거로 삼는다. 못 불러왔으면 침묵한다 —
        //   '장부 시작하기'는 되돌릴 수 없는 조작이고, 위의 LoadErrorCard 가 이미 이유와 재시도를 준다.
        if (loadErr) return null;
        // 2026-10-03 D1 재검토 D-a — 확인 중(그리고 지난 회차 응답 대기)엔 카드와 같은 틀의 스켈레톤으로 자리를 잡는다.
        //   종전엔 null 이라 정착 순간 카드가 생기며 아래 격자를 PC 72px·390 104~125px 밀었다(실제 영업 매장은 거의 늘 할 일이 있다).
        //   정착 뒤 할 일이 없는 드문 경우(이력 없는 새 매장·정오 전)에만 접힌다.
        //   자리표시 문구는 실제 카드 중 가장 흔한 높이에 맞춘다(PC 한 줄 · 390 은 설명이 두 줄 — 실측 카드 91~93px).
        // 2026-10-03 E3 후속 — 같은 보이지 않는 틀을 실제 카드 칸에도 겹쳐 세운다(grid 한 칸) → 정착한 카드는 자리표시보다 **작아지지 않는다**.
        //   '순위 미입력' 갈래는 360 에서 자리표시(제목 두 줄 112.5px)보다 21px 작아 아래 격자가 올라갔다. 더 큰 갈래는 종전 그대로 자란다.
        // 2026-10-03 리드 판정(review-mystore-followup-1003 FAIL) — 밀린 순위가 오늘 할 일을 가리면 안 된다. 오늘 할 일이 주 카드이고
        //   밀린 순위는 같은 칸 안의 **보조 한 줄**이다. 그 줄 자리도 틀에 늘 잡아 두어(장부 권한) 줄이 있든 없든 칸 높이가 같다 —
        //   줄이 없으면 주 줄이 세로 가운데에 선다. 응답 전엔 밀린 건수를 모르므로 이 고정이 정착 이동 0 의 조건이다.
        // 2026-10-03 design-reviewer 대안 A — xl(≥1280)에서는 이 보조 줄을 **주 줄 안, CTA 왼쪽 칩**으로 둔다(칸 72.1px · 빈 띠 0).
        //   한 요소를 그대로 두고 자리만 바꾼다: 주 줄이 flex-wrap 이라 xl 미만은 order-last + basis-full 로 다음 줄(종전 보조 줄과 같은 높이),
        //   xl 은 DOM 순서대로 설명과 CTA 사이에 선다. 칩이 폭을 먹으니 xl 에서 설명은 한 줄로 자른다(1024 는 가장 긴 갈래가 18px 모자라 종전 방식 유지).
        const rankRow = (text: string, onClick?: () => void) => (
          // settle-fix 후속 ① — 칩은 DOM 에서 CTA **뒤**다(Tab 순서 = xl 미만의 화면 순서: CTA → 다음 줄 칩). xl 은 CTA 를 xl:order-last 로 칩 오른쪽에 보낸다.
          <span data-testid={onClick ? 'todo-rank' : undefined} className="mt-1.5 flex min-w-0 basis-full items-center gap-2 border-t border-border-default pt-1.5 xl:mt-0 xl:basis-auto xl:rounded-input xl:border xl:border-border-default xl:py-1 xl:pl-2 xl:pr-1">
            <Icon name="trophy" size={14} className="shrink-0 text-gold-300" />
            <span className="min-w-0 flex-1 truncate text-2xs font-semibold text-ink-secondary xl:flex-none">{text}</span>
            {onClick
              ? <button type="button" onClick={onClick} className="hit shrink-0 rounded-input bg-accent-300 px-2.5 py-0.5 text-2xs font-bold text-white hover:bg-accent-400">순위 입력</button>
              : <span className="shrink-0 rounded-input px-2.5 py-0.5 text-2xs font-bold">순위 입력</span>}
          </span>
        );
        // 틀의 버튼 글자는 가장 넓은 CTA('대회 등록하기')로 — 좁은 글자로 재면 360 에서 그 갈래 설명이 한 줄 더 꺾여 틀을 넘었다(보조 줄이 있을 때 19px).
        const ghost = (
          <span aria-hidden style={{ visibility: 'hidden', gridArea: '1 / 1' }} className="flex min-w-0 flex-col">
            <span className="flex min-w-0 flex-wrap items-center gap-x-3">
              <Icon name="refresh" size={22} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold xl:truncate">지난 게임 그대로 열기 · 00/00</span>
                <span className="mt-1 block t-desc break-keep xl:line-clamp-1">포스터를 올리면 일정 탐색에 노출되고 예약을 받을 수 있어요</span>
              </span>
              <span className="btn-primary shrink-0 px-4 py-2 text-xs xl:order-last">대회 등록하기</span>
              {caps.ledger && rankRow('순위 미입력 00건 · 최근 00/00')}
            </span>
          </span>
        );
        if (loading || !lastRoundReady) {
          if (!caps.ledger) return null;
          return (
            <div aria-hidden data-testid="todo-reserve" className="skeleton grid rounded-card border border-transparent p-3">{ghost}</div>
          );
        }
        const todayPoster = schedules.some((s) => s.venueId === venueId && s.date === d && s.approved);
        const goRanking = (p: PosterOpsSummary) => onGoto({ section: 'ranking', date: p.date, gameSeq: p.gameSeq, event: p.rankingEvent });
        const hour = new Date().getHours();
        // clamp — 설명이 서버 값(대회 이름)이라 길이를 모르는 갈래는 두 줄에서 자른다(자리표시와 같은 높이 — 360 에서 세 줄로 21px 커졌다).
        let todo: { icon: IconName; title: string; desc: string; cta: string; onClick: () => void; tone: 'warn' | 'gold' | 'ok'; clamp?: boolean; rank?: true } | null = null;
        if (caps.ledger && staleOpen.length > 0) {
          // 미마감 = 순위→시즌→머니인킹→전적 하류 전체 정지. 실제 라이브에서 두 달치가 쌓여 있었다.
          const list = staleOpen.slice(0, 3).map((x) => x.sessionDate.slice(5)).join(' · ');
          // ⚠ 문구를 사실에 맞춘다(2026-09-07). 종전 "마감해야 순위·시즌·전적에 반영되고" 는 거짓이었다 —
          //   운영 DB 실측: save_venue_rankings·current_season_standings·global_ranking_totals 어느 것도
          //   ledger_sessions·closed 를 참조하지 않고, ledger_sessions 의 트리거는 마감 권한 가드 하나뿐이다.
          //   마감이 실제로 하는 일은 '그날 장부를 읽기전용으로 잠그는 것'이고(해제는 업주만),
          //   순위는 마감이 아니라 **순위 입력**으로 들어간다. 다만 순위 입력 넛지가 closed 를 전제로 뜨므로
          //   (아래 분기) 마감이 그 흐름의 관문인 것은 맞다 — 그 관계만 정확히 말한다.
          // ⚠ 예전엔 onGoto('ledger') 라 **오늘** 장부가 열렸다 — 미마감 장부는 정의상 지난 날짜다.
          //   가장 오래된 것부터 그 날짜·그 게임으로 정확히 연다(여러 건이면 아래 목록에서 개별 선택).
          const first = staleOpen[0];
          todo = { icon: 'alert', title: `지난 장부 ${staleOpen.length}건이 미마감이에요`, // 카피는 짧게 — 이 문구가 길어서 폰(375px)에서 카드가 6줄까지 자랐다(오너 스크린샷 2026-09-07).
          //   '읽기전용 잠금(해제는 업주만)' 같은 세부는 마감 화면이 그 자리에서 다시 말해 준다.
          desc: `${list} · 마감하면 장부가 잠기고 순위 입력으로 이어집니다.`, cta:'마감하기', onClick: () => onGoto({ section: 'ledger', date: first.sessionDate, gameSeq: first.gameSeq, settle: true }), tone: 'warn' };
        } else if (caps.ledger && session?.closed && hasRankToday === false) {
          todo = { icon: 'trophy', title: '순위 입력이 비어 있어요', desc: '마감한 장부 명단으로 바로 채워요.', cta: '순위 입력하기', onClick: () => onGoto({ section: 'ranking', date: d, gameSeq: session?.gameSeq, title: session?.title }), tone: 'warn' };
        } else if (caps.ledger && started && !session?.closed && !clockActive) {
          // E3 L-2(2026-10-03) — 제목이 390 에서 두 줄이라 카드가 자리표시(91px)보다 21px 커져 아래를 밀었다. 제목을 한 줄로, '진행 중'은 설명으로.
          todo = { icon: 'clock', title: '클락이 꺼져 있어요', desc: `바인 ${day.totalBuyins}회 진행 중 · 클락을 켜면 라이브 탭에 송출됩니다.`, cta: '클락 켜기', onClick: () => onGoto('clock'), tone: 'gold' };
        } else if (caps.ledger && started && !session?.closed) {
          todo = { icon: 'cards', title: `게임 진행 중 · 바인 ${day.totalBuyins}회`, desc:'바인 입력은 장부에서, 타이머·블라인드는 클락에서.', cta: '장부 보기', onClick: gotoTodayLedger, tone: 'gold' };
        } else if (caps.ledger && !started && todayPoster) {
          todo = { icon: 'cards', title: '오늘 게임이 있어요', desc: '포스터 정보 그대로 장부를 시작할 수 있어요(게임명·바인 자동 입력).', cta: '장부 시작하기', onClick: () => onGoto({ section: 'ledger', date: d }), tone: 'gold' }; // 🔴 2026-09-20 (E2-A): 맨 문자열이라 '포스터 정보 그대로' 문구와 달리 오늘 장부 **목록**으로만 갔다 — 날짜 시드를 실어 보낸다
        } else if (caps.ledger && !started && !todayPoster && lastRound) {
          // PL3①: 매일 같은 게임을 여는 매장의 기본 동선 — 지난 회차(장부+클락 설정)를 1탭으로 그대로
          const lr = lastRound.session;
          todo = {
            icon: 'refresh',
            title: `지난 게임 그대로 열기 · ${lr.sessionDate.slice(5).replace('-', '/')} ${lr.title || '제목 없음'}`,
            desc: `단가·할인·딜러${lastRound.clockConfig ? '·블라인드·얼리' : ''}까지 한 번에 채워져요`,
            cta: '그대로 열기', onClick: gotoLedgerWithLastRound, tone: 'gold',
          };
        } else if (caps.posters && !started && !todayPoster && hour >= 12) {
          todo = { icon: 'plus', title: '오늘 등록된 대회가 없어요', desc: '포스터를 올리면 일정 탐색에 노출되고 예약을 받을 수 있어요.', cta: '대회 등록하기', onClick: onCreatePoster, tone: 'gold' };
        } else if (caps.ledger && session?.closed && !daySettled && todayGames.some((g) => !g.sx.closed)) {
          // dummy-1003 D3 변형 — 메인은 마감했지만 사이드가 아직 열려 있다. '오늘 운영 완료'가 아니라 그 게임을 마저 볼 차례다.
          const open = todayGames.filter((g) => !g.sx.closed);
          todo = { icon: 'cards', title: `아직 열린 게임 ${open.length}개`, desc: `${open.map((g) => ledgerGameLabel(g.sx.gameSeq)).join(' · ')} · 마감해야 오늘 정산이 끝나요.`,
            cta: '장부 보기', onClick: () => onGoto({ section: 'ledger', date: d, gameSeq: open[0].sx.gameSeq }), tone: 'gold' };
        } else if (caps.ledger && session?.closed && !daySettled) {
          todoOwedShown = true;
          // dummy-1003 D3 — 전부 마감했는데 미수가 남았다(종전엔 여기서 '오늘 운영 완료'). 미수가 있는 첫 게임의 장부·정산바로 연다
          //   ('정산' 칩 목적지와 같은 모양 — 메인만 열면 사이드에만 남은 미수가 0 으로 보인다).
          const owed = todayGames.filter((g) => g.unpaid > 0);
          todo = { icon: 'alert', title: `미수 ${wonToMan(day.unpaid || fin.unpaid)}만원이 남았어요`,
            desc: `${owed.length ? `${owed.map((g) => ledgerGameLabel(g.sx.gameSeq)).join(' · ')} · ` : ''}마감한 장부에 받지 못한 돈이 있어요.`,
            cta: '미수 회수', onClick: () => onGoto({ section: 'ledger', date: d, gameSeq: owed[0]?.sx.gameSeq ?? session?.gameSeq, settle: true }), tone: 'warn' };
        } else if (caps.manage && daySettled) {
          todo = { icon: 'check-circle', title: '오늘 운영 완료', desc: '수고하셨습니다. 주간 추세와 요일 분석을 확인해 보세요.', cta: '주간 리포트', onClick: () => onGoto('stats'), tone: 'ok' };
        } else if (caps.ledger && pendingRanks.length > 0) {
          // 2026-10-03 E3 후속 — 밀린 '순위 미입력'(마감했지만 순위가 빈 지난 대회)은 이 칸의 한 갈래다(오늘 할 일이 없을 때만 주 카드, 있으면 아래 보조 줄).
          //   종전엔 별도 카드라 확인 중엔 없다가 정착 순간 생기거나(첫 방문 82px) 접혀(1→0건 82px) 아래 격자를 밀었고,
          //   1건(버튼형)↔여러 건(목록형) 높이 차로 3→1건이 122px 움직였다(review-mystore-e3-1003 L-1 대안 2).
          //   이 칸은 확인 중에 같은 틀로 자리를 잡아 두므로(위 todo-reserve) 건수와 무관하게 높이가 같다.
          //   대상은 서버가 준 (date, gameSeq, rankingEvent) 그대로 — 가장 최근 것을 연다. 나머지는 순위 화면에서 날짜를 골라 이어서 입력한다.
          const p = pendingRanks[0];
          const lbl = (x: PosterOpsSummary) => `${x.date.slice(5).replace('-', '/')}${x.gameSeq > MAIN_GAME_SEQ ? ` ${ledgerGameLabel(x.gameSeq)}` : ''}`;
          const n = pendingRanks.length;
          todo = n === 1
            ? { icon: 'trophy', title: '순위 미입력 대회가 있어요', desc: `${lbl(p)}${p.rankingEvent ? ` · ${p.rankingEvent}` : ''} · 마감했지만 순위가 비어 있어요.`, cta: '순위 입력', onClick: () => goRanking(p), tone: 'warn', clamp: true, rank: true }
            : { icon: 'trophy', title: `순위 미입력 대회 ${n}개`, desc: `${pendingRanks.slice(0, 3).map(lbl).join(' · ')}${n > 3 ? ` 외 ${n - 3}건` : ''} · 최근 것부터 입력해요.`, cta: '순위 입력', onClick: () => goRanking(p), tone: 'warn', clamp: true, rank: true };
        }
        if (!todo) return null;
        const rankPrimary = todo.rank === true;
        const latest = pendingRanks[0];
        const toneCls = todo.tone === 'warn'
          ? 'border-amber-400/50 bg-amber-400/8'
          : todo.tone === 'ok' ? 'border-emerald-500/40 bg-emerald-500/6' : 'border-accent-400/40 bg-accent-300/6';
        const iconCls = todo.tone === 'warn' ? 'text-amber-400' : todo.tone === 'ok' ? 'text-emerald-400' : 'text-ink-secondary';
        return (
          <div data-testid="todo-card" className={`grid rounded-card border p-3 ${toneCls}`}>
          {ghost}
          <div style={{ gridArea: '1 / 1' }} className="flex min-w-0 flex-col justify-center">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3">
            <Icon name={todo.icon} size={22} className={`shrink-0 ${iconCls}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-primary xl:truncate" title={todo.title}>{todo.title}</p>
              <p className={`mt-1 t-desc break-keep text-ink-muted${todo.clamp ? ' line-clamp-2' : ''} xl:line-clamp-1`} title={todo.desc}>{todo.desc}</p>
            </div>

            {/* 라이브 운영 현황 카드가 글로우를 쓰는 동안(liveWidget)에는 이 CTA 가 **보라 후광을 내려놓는다**.
                btn-primary 의 그림자는 index.css:620 의 violet-500 이라, 그대로 두면 같은 화면에 같은 색
                후광이 둘이 되어 '지금 볼 곳'이 사라진다 — v3 가 조잡했던 정확한 메커니즘이고,
                ToolsPanel.tsx 가 GTO 히어로 옆에 btn-primary 를 두지 않는 이유와 같다(아우라 v6.5 화면당 1곳).
                단 'warn'(지난 장부 미마감·순위 누락)은 놓치면 하류가 통째로 멈추는 급한 알림이라
                골드 채움은 그대로 두고 **그림자만** 뺀다 — 위계를 낮추지 않으면서 색 경쟁만 없앤다. */}
            <button type="button" onClick={todo.onClick} data-testid="todo-cta"
              className={`${todo.tone === 'warn'
                ? `btn-primary shrink-0 px-4 py-2 text-xs bg-none! bg-amber-400! text-ink-inverse! hover:bg-amber-500!${liveWidget ? ' shadow-none!' : ''}`
                : liveWidget ? 'btn-ghost shrink-0 px-4 py-2 text-xs' : 'btn-primary shrink-0 px-4 py-2 text-xs'} xl:order-last`}>
              {todo.cta}
            </button>
            {/* 밀린 순위 보조 줄(xl 미만은 다음 줄 · xl 은 CTA 왼쪽 칩) — rankRow 주석. DOM 은 CTA 뒤(후속 ① Tab 순서). */}
            {caps.ledger && !rankPrimary && latest && rankRow(
              `순위 미입력 ${pendingRanks.length}건 · 최근 ${latest.date.slice(5).replace('-', '/')}${latest.gameSeq > MAIN_GAME_SEQ ? ` ${ledgerGameLabel(latest.gameSeq)}` : ''}`,
              () => goRanking(latest))}
          </div>
          </div>
          </div>
        );
      })()}

      </div>
      <div className="space-y-3 empty:hidden xl:min-w-0 xl:flex-1">
      {/* '순위 미입력' 지난 대회는 위 '지금 할 일' 칸의 한 갈래로 옮겼다(2026-10-03 E3 후속 — 별도 카드의 정착 이동 제거). */}
      {/* 미수·리스크 알림 (장부 권한) */}
      {caps.ledger && dayStarted && day.unpaid > 0 && !todoOwedShown && (
        <button type="button" onClick={gotoTodayLedger} data-testid="unpaid-cta"
          className="flex w-full items-center gap-2 rounded-card border border-danger/40 bg-danger/8 p-3 text-left hover:bg-danger/12 transition-colors">
          <Icon name="alert" size={18} className="shrink-0 text-danger-light" />
          <span className="text-xs text-danger-light">오늘 <b className="tabular-nums">{wonToMan(day.unpaid)}만원</b> 미수금이 있습니다. 장부에서 확인하세요.</span>
        </button>
      )}

      </div>
      </div>

      {/* 🔴 2026-09-18 오너 지시로 **뺐다**: "이 부분 뺄 수 있으면 빼 … 4개가 너무 큰 칸을 차지해".
          빠른 작업 4칸(새 대회·장부·클락·순위·포인트)은 **바로 위 단계 레일과 겹쳤다** —
          레일(GAME_STEPS: 포스터·장부·클락·순위·정산)이 장부·클락·순위를 이미 최상단에서 한 줄로 제공하고,
          '새 대회'는 GameChipBar 의 `+ 새 게임`(VenueManageTab.tsx:1124)과 포스터 섹션 버튼(:846)이 맡는다.
          → 없어지는 기능 0. 큰 타일 4칸(1360px 에서 한 칸 ~325px)이 화면 최상단에서 빠진다.
          ⚠ 되살릴 거면 레일과의 중복부터 정리해라 — 같은 목적지를 두 벌로 두는 것이 원래 문제였다. */}
      {/* 카드 사이 간격을 8.5 → 12.75 로. 카드도 최상위 블록과 같은 위계인데
          블록 사이만 12.75, 카드 사이는 8.5 로 갈려 있었다(1440 실측) — 한 값으로 맞춘다. */}
      {/* 2026-09-11 PC 개편: xl(1360px)에서 3열. 2열로 두면 카드 하나가 660px 까지 늘어나
          '한 카드 = 한 질문' 인 내용(숫자 2~3개)에 비해 빈 폭이 남고 세로만 길어진다. */}
      {/* C1 D-3·D-4(2026-10-02) — ① 등높이 격자라 빈 상태 카드(다가오는 예약·오늘 출근·인건비·생일 단골)가 옆 카드 높이까지 83~146px 비었다 → items-start.
          ② 3열 마지막 줄에 카드 1장만 남으면(1440: '손님 유형') 오른쪽 두 칸 ~630px 가 빈다 → 그 카드만 한 줄 전체(fitLastCard). */}
      <div ref={cardGridRef} className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {/* 오늘 장부 카드는 ③ KPI 헤드라인으로 격상(내용 동일 — 총 바이인·완납 매출·미수금·회수 이용권) */}
        {/* 클락 — 라이브 위젯이 클락을 표시 중(clockActive)이면 중복 방지 위해 숨김 */}
        {/* 2026-10-03 E3 후속 — 7일 장부가 없는 매장(새 매장)은 '최근 7일 추세'가 자리 그대로 171px 이고(L-2: 상태가 바뀌어도 높이 불변)
            옆 '대회 클락'·'전주 대비'는 99px 라 PC 첫 줄 아래 72px 빈 홈이 생겼다. 그 상태(확인 중·실패·데이터 없음)에서만 두 이웃을
            줄 높이로 늘리고 본문을 세로 가운데 둔다 — 셋 다 빈 안내라 줄이 고르게 선다. 데이터가 오면 이웃은 제 높이로 돌아가지만
            줄 높이는 7일 카드(171)가 그대로 정하므로 다른 카드는 움직이지 않는다. 데이터 있는 매장은 종전(items-start) 그대로다(C1 D-3). */}
        <DashCard more show={moreShown && caps.ledger && !clockActive} title="대회 클락" onClick={() => onGoto('clock')} center={trendFill} stretch={trendFill}
          badge={clockActive
            ? <span className={`rounded-badge px-1.5 py-0.5 text-2xs font-bold ${clock?.running ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-400/15 text-amber-400'}`}>{clock?.running ? '진행중' : '일시정지'}</span>
            : <span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-surface-float text-ink-secondary">미실행</span>}>
          {loading ? <Skeleton /> : !clockActive || !lvl ? (
            <p className="py-3 text-center text-2xs text-ink-muted">실행 중인 클락이 없습니다.</p>
          ) : lvl.kind === 'break' ? (
            <div className="py-2 text-center">
              <p className="text-lg font-extrabold text-ink-primary">BREAK</p>
              <p className="mt-1 text-2xs text-ink-muted">휴식 시간</p>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-2xs text-ink-muted">레벨 {levelNo}</p>
                <p className="text-xl font-extrabold text-ink-primary tabular-nums leading-tight">{lvl.sb.toLocaleString()}/{lvl.bb.toLocaleString()}</p>
                {lvl.ante > 0 && <p className="text-2xs text-ink-muted">ante {lvl.ante.toLocaleString()}</p>}
              </div>
              <div className="text-right">
                <p className="text-2xs text-ink-muted">남은 인원</p>
                <p className="text-lg font-bold text-ink-primary tabular-nums">{Math.max(0, cnt.players + clock!.adjEntries - clock!.eliminations)}</p>
              </div>
            </div>
          )}
        </DashCard>

        {/* 최근 7일 추세 + 객단가 */}
        <DashCard show={caps.manage} title="최근 7일 추세" onClick={() => onGoto('stats')}
          badge={<span data-testid="dash-stats-link" className="text-2xs font-bold text-ink-muted">통계·운영 분석</span>}>
          {/* 순서가 중요하다 — 실패를 '데이터 없음'보다 **먼저** 판정한다(F14). 조회가 죽으면 range 가
              빈 값이라 weekEntry 가 0 이고, 예전엔 그게 "7일간 손님이 없었다"로 읽혔다. */}
          {/* E3 L-2(2026-10-03) — 확인 중 뼈대(h-12)가 실제 본문(막대 + 두 줄, 카드 108→171px)보다 63px 짧아, 정착하는 순간
              PC 3열의 다음 줄 카드 3장이 63px 내려갔다(1440 CLS 0.0179). 뼈대·데이터 없음·실패 줄을 **모두** 실제 본문과 같은 틀
              (막대 칸 + 두 줄, 보이지 않는 대역)에 겹쳐 세워 상태가 바뀌어도 카드 높이가 그대로다 — 뼈대만 키우면 7일 장부가 없는 매장
              (매장 전환·새 매장)에서 171→99 로 접히며 반대로 올라갔다(D1 게이트 1440 전환). 문구는 그 칸 세로 가운데. */}
          {trendBlank ? (
            <div className={loading ? 'skeleton grid rounded-input' : 'grid'}>
              <div aria-hidden style={{ visibility: 'hidden', gridArea: '1 / 1' }}>
                <div className="mb-2 h-14" />
                <div className="border-t pt-2 text-2xs">0</div>
                <div className="mt-1 text-2xs">0</div>
              </div>
              <div style={{ gridArea: '1 / 1', alignSelf: 'center' }}>
                {loading ? null : rangeErr ? (
                  <LoadFailRow what="최근 7일 장부" onRetry={reloadRange} />
                ) : (
                  <p className="py-3 text-center text-2xs text-ink-muted">최근 7일 장부 데이터가 없습니다.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex h-14 items-end justify-between gap-1">
                {perDay.map((x) => (
                  <div key={x.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div className="w-full max-w-[18px] rounded-xs bg-accent-300/80" style={{ height: `${Math.max(4, (x.entry / maxEntry) * 100)}%` }} title={`${x.dow} ${x.entry}회`} />
                    <span className={`text-2xs ${x.day === d ? 'text-ink-primary font-bold' : 'text-ink-muted'}`}>{x.dow}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-2xs">
                <span className="text-ink-muted">7일 합계</span>
                <span className="text-ink-secondary tabular-nums"><b className="text-ink-primary">{weekEntry}</b>회 · <b className="text-ink-primary">{wonToMan(weekPaid)}</b>만</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-2xs">
                <span className="text-ink-muted">평균 객단가</span>
                <span className="text-ink-secondary tabular-nums"><b className="text-ink-primary">{wonToMan(avgSpend)}</b>만 / 바인{bestDay.entry > 0 && <> · 활발 <b className="text-ink-primary">{bestDay.dow}</b></>}</span>
              </div>
            </>
          )}
        </DashCard>

        {/* 전주 대비(주간 비교) — 오너 2026-09-19 "칸이 많이 남잖아 절반을 기준으로 하던 해서 상하 XY축
            줄간격 및 좌우 간격 조정": center(위 DashCard 참고)로 남는 높이를 받아 두 줄을 세로 중앙에 두고,
            CompareRow 내부 간격도 늘렸다(space-y-2→-4, gap-2→-3). */}
        <DashCard more show={moreShown && caps.manage} title="전주 대비" onClick={() => onGoto('stats')} center
          stretch={trendFill}
          badge={<span className="text-2xs font-bold text-ink-muted">주간 비교</span>}>
          {loading ? <Skeleton /> : rangeErr ? (
            <LoadFailRow what="비교할 14일 장부" onRetry={reloadRange} />
          ) : (weekEntry === 0 && prevBuyins === 0) ? (
            <p className="py-3 text-center text-2xs text-ink-muted">비교할 장부 데이터가 없습니다.</p>
          ) : (
            <div className="space-y-4 py-0.5">
              <CompareRow label="바인" now={weekEntry} prev={prevBuyins} delta={entryDelta} />
              <CompareRow label="매출" now={weekPaid} prev={prevPaid} delta={paidDelta} won />
            </div>
          )}
        </DashCard>

        {/* 다가오는 예약 — C08: 인원 조회 실패를 '0명'과 갈라놓는다(실패했는데 0명으로 보이면
            "예약이 없다"는 거짓 안심을 준다). */}
        <DashCard show={caps.posters} title="다가오는 예약" onClick={() => onGoto('posters')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums bg-surface-float text-ink-secondary">예약 {resCountsErr ? '—' : totalRes}</span>}>
          {loading ? <Skeleton /> : upcoming.length === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">예정된 게임이 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {!!resCountsErr && (
                <li className="flex items-center justify-between gap-2 rounded-input border border-amber-500/40 bg-amber-500/8 px-2 py-1.5 text-2xs font-semibold text-ink-secondary">
                  예약 인원을 불러오지 못했어요 — 0명과는 달라요.
                  <button type="button" onClick={(e) => { e.stopPropagation(); reloadReservations(); }}
                    className="hit shrink-0 rounded-input border border-amber-500/40 px-2 py-0.5 text-2xs font-bold text-ink-primary">다시 시도</button>
                </li>
              )}
              {upcoming.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink-secondary"><span className="text-2xs text-ink-muted tabular-nums mr-1">{g.date.slice(5).replace('-', '/')}</span>{g.title}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">예약 {resCountsErr ? '—' : (resCounts[g.id] ?? 0)}명</span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 고객·단골(바인·방문 횟수 · 직원 제외).
            ⚠ 이름을 '단골 TOP' 에서 바꾼 이유: 이 카드가 여는 것은 TOP 5 가 아니라 **매장 전체 고객 목록**이다.
               '유저' 같은 모호한 이름을 새로 만들지 않는다 — 직원은 '직원 관리', 고객은 '고객·단골',
               이용권 대상은 이용권 화면의 '받는 손님' 으로 역할이 갈린다. */}
        <DashCard show={caps.ledger} title="고객·단골" onClick={() => setRegOpen(true)}
          badge={<span className="text-2xs font-bold text-ink-muted">전체 보기</span>}>
          {loading ? <Skeleton /> : topRegulars.length === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">장부 바인 데이터가 아직 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {topRegulars.map((r, i) => (
                <li key={r.name} className="flex items-center gap-2 text-xs">
                  <span className={`w-4 shrink-0 text-center text-2xs font-bold tabular-nums ${i === 0 ? 'text-gold-300' : 'text-ink-muted'}`}>{i + 1}</span>
                  {/* 2026-09-25 MYSTORE-FULL-AUDIT #5 — 한 줄에 [이름 | 바인·방문·단골 | 보내기] 를 다 세우면 이름 열이
                      65px(1440, 카드 279px)만 남아 '이도현(포…' 처럼 잘렸다. 수치는 이름 아래 둘째 줄로 내린다. */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink-secondary" title={r.name}>{r.name}</span>
                    <span className="block text-2xs tabular-nums text-ink-muted">바인 <b className="text-ink-secondary">{r.buyins}</b> · 방문 <b className="text-ink-secondary">{r.visits}</b>{r.buyins >= 5 && <span className="ml-1 font-bold text-ink-secondary">단골</span>}</span>
                  </span>
                  {/* CRM 행동 버튼 — 고객에게 바로 매장이용권 발급(받는 사람 자동 입력).
                      DashCard 의 children 은 헤더 <button> 밖이라 진짜 <button> 을 쓸 수 있다 —
                      span[role=button] 은 Space 키가 안 먹고 폼 의미도 없어서 흉내에 그친다. */}
                  {/* 🔴 2026-09-20 — 발급/열람 분리를 RegularsModal·CheckinModal 에는 적용했는데 **여기를 놓쳤다**.
                      열람권만 가진 직원에게 '보내기' 가 보이고, 눌러도 발급 폼이 없는 모달만 열린다. */}
                  {caps.issueVoucher && (
                    <button type="button" title={`${r.name}님에게 매장이용권 전송`}
                      onClick={() => { setVoucherPrefill(r.name); setVoucherOpen(true); }}
                      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-badge border border-accent-400/40 bg-accent-300/10 px-2 text-2xs font-bold text-accent-300 transition-colors hover:bg-accent-300/20 active:opacity-80"
                    ><Icon name="gift" size={11} className="shrink-0" />전송</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 오늘 출근 */}
        <DashCard more show={moreShown && caps.staff} title="오늘 출근" onClick={() => onGoto('staff')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums bg-surface-float text-ink-secondary">{workedStaff.length}/{shifts.length} 출근</span>}>
          {loading ? <Skeleton /> : shiftErr ? (
            <p className="py-3 text-center text-2xs text-danger-light">출근 기록을 불러오지 못했습니다.</p>
          ) : shifts.length === 0 && !shiftErr ? (
            <p className="py-3 text-center text-2xs text-ink-muted">오늘 배정된 직원이 없습니다.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {shifts.map((s) => (
                <li key={s.name} className={`inline-flex items-center gap-0.5 rounded-badge px-2 py-0.5 text-2xs font-semibold ${s.checkIn ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-float text-ink-secondary'}`}>
                  {s.checkIn && <Icon name="check" size={10} strokeWidth={3} />}{s.name}
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        {/* 인건비 요약(이번 달) */}
        <DashCard more show={moreShown && caps.staff} title="인건비 요약" onClick={() => onGoto('staff')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold bg-surface-float text-ink-secondary">{mr.label}</span>}>
          {loading ? <Skeleton /> : (laborHours === 0 && !laborErr) ? (
            <p className="py-3 text-center text-2xs text-ink-muted">이번 달 출퇴근 기록이 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {/* 시급을 못 불러왔으면 숫자를 만들지 않는다 — '0만원'이 정상값처럼 읽힌다 */}
                <Stat label="총 인건비" value={laborErr ? '—' : wonToMan(laborTotal)} unit={laborErr ? '' : '만원'} gold />
                <Stat label="총 근무" value={dealerErr ? '—' : hoursValue(labor.netMin)} unit={dealerErr ? '' : '시간'} />
              </div>
              {wageErr && <p className="text-[11px] text-danger-light">시급을 불러오지 못해 금액을 계산할 수 없습니다.</p>}
              {dealerErr && <p className="text-[11px] text-danger-light">딜러 근무 기록을 불러오지 못해 합계를 계산할 수 없습니다.</p>}
              {shiftErr && <p className="text-[11px] text-danger-light">출근 기록을 불러오지 못해 합계를 계산할 수 없습니다.</p>}
              {!laborErr && dealerPay > 0 && (
                <p className="text-[11px] text-ink-muted tabular-nums">직원 {wonToMan(laborTotal - dealerPay)}만 · 딜러 {wonToMan(dealerPay)}만</p>
              )}
            </div>
          )}
        </DashCard>

        {/* 매장이용권(사용 이용권) */}
        <DashCard more show={moreShown && caps.voucher} title="매장이용권" onClick={() => setVoucherOpen(true)}
          badge={<span className="text-2xs font-bold text-ink-muted">전송·관리 →</span>}>
          {loading ? <Skeleton /> : (
            <>
              {/* 7일 두 칸만 14일 range 에서 온다 — 그 조회가 죽으면 '0장'이 아니라 '—'다(F14).
                  오늘 두 칸은 core(세션·바인)에서 오므로 그쪽 실패는 위 LoadErrorCard 가 말한다. */}
              {/* 직원은 '7일 사용' 칸이 없다(아래) — 3칸을 한 줄로. */}
              <div className={`grid ${caps.manage ? 'grid-cols-2' : 'grid-cols-3'} gap-x-3 gap-y-2`}>
                {/* 2026-09-18 오너 결정: "이용권은 T 단위로" — 발행도 T 로 맞춘다.
                    이 카드는 **업주 집계 화면**이라 통계·정산(`1T = 1만원`)과 같은 단위를 쓴다.
                    ⚠ 손님 지갑(MyVoucherSheet·EventPage)의 '장' 은 **그대로 둔다** —
                      "몇 장을 보낼까요?"·"한 장 줄이기" 처럼 세는 말이라 T 로 바꾸면 문장이 깨진다. */}
                <Stat label="7일 전송" value={sentBad ? '—' : `${weekVoucher}`} unit={sentBad ? '' : '장'} />
                <Stat label="오늘 전송" value={sentBad ? '—' : `${todayVoucher}`} unit={sentBad ? '' : '장'} />
                {/* 2026-09-18: 위 KPI(:843)가 같은 수(fin.ticket)를 'T' 로 부르는데 여기만 '장' 이었다 —
                    한 화면에서 같은 숫자가 '8T' 와 '8장' 으로 두 번 보였다(PC 전수조사 2026-09-18). */}
                {/* verifier 2026-10-03 — 7일 사용 T 는 14일 장부 행에서 센다. 직원(can_manage_pos 아님)에게는 지난 날의 바인 행이 미수 행만 와서(20261003h)
                    작은 숫자가 정상처럼 보였다 → 직원에게는 칸을 뺀다(이용권 전송 수·오늘 사용은 온전한 원천이라 남긴다). */}
                {caps.manage && <Stat label="7일 사용" value={rangeErr ? '—' : fmtT(weekTicket)} unit={rangeErr ? '' : 'T'} />}
                {/* 3-B(2026-09-29) — 위 KPI '사용 이용권'과 같은 범위(오늘 **전 게임**, day). 예전엔 메인 게임만(fin)이라 한 화면에서 두 수가 갈렸다(store-deep D2). */}
                <Stat label="오늘 사용" value={fmtT(day.ticket)} unit="T" />
              </div>
              {(!!rangeErr || !!sentErr) && <div className="mt-2"><LoadFailRow what="최근 7일 이용권" onRetry={reloadRange} /></div>}
              <p className="mt-2 t-desc break-keep text-ink-muted">전송 = 실제로 보낸 이용권 장수(전송 취소 제외) · 사용 = 이용권으로 낸 바인·애드온 금액(T)</p>
            </>
          )}
        </DashCard>

        {/* 🎂 생일 단골(7일 내) — 고객·단골의 고객정보에서 생일 등록 시 자동 표시 */}
        <DashCard more show={moreShown && caps.manage} title="생일 단골" onClick={() => setRegOpen(true)}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums bg-surface-float text-ink-secondary">7일 내 {bdays.length}명</span>}>
          {bdays.length === 0 ? (
            <p className="t-desc break-keep py-3 text-center text-ink-muted">7일 내 생일인 단골이 없습니다.<br />생일은 고객·단골 → 고객정보에서 등록해요.</p>
          ) : (
            <ul className="space-y-1">
              {bdays.slice(0, 5).map((b) => (
                <li key={b.name} className="flex items-center gap-2 text-2xs">
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">{b.name}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">{b.birthday}</span>
                  <span className={['inline-flex shrink-0 items-center gap-0.5 rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums', b.dday === 0 ? 'bg-amber-400/15 text-amber-400' : 'bg-surface-float text-ink-secondary'].join(' ')}>
                    {b.dday === 0 ? <><Icon name="gift" size={10} />오늘</> : `D-${b.dday}`}
                  </span>
                </li>
              ))}
              <li className="pt-0.5 text-2xs text-ink-muted">축하 쿠폰은 고객·단골 → 고객정보 → 쿠폰 발급으로 보내세요.</li>
            </ul>
          )}
        </DashCard>

        {/* 손님 유형 비중(오늘) */}
        <DashCard more show={moreShown && caps.manage} title="손님 유형" onClick={() => onGoto('stats')}
          badge={<span className="rounded-badge px-1.5 py-0.5 text-2xs font-bold tabular-nums bg-surface-float text-ink-secondary">{playerTotal}명</span>}>
          {loading ? <Skeleton /> : playerTotal === 0 ? (
            <p className="py-3 text-center text-2xs text-ink-muted">오늘 명단이 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {typeEntries.map(([k, n]) => (
                <li key={k} className="flex items-center gap-2 text-2xs">
                  <span className="w-14 shrink-0 text-ink-secondary">{k}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-surface-high overflow-hidden">
                    <span className="block h-full rounded-full bg-accent-300/80" style={{ width: `${Math.round((n / playerTotal) * 100)}%` }} />
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-ink-muted">{n}명 {Math.round((n / playerTotal) * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
        </DashCard>
      </div>

      {/* ── 오늘 게임·세션 운영 표(§5 다섯 번째 행 · 전체 폭) ──────────────────────
          PC 는 상세를 카드 나열보다 표로 본다 — 게임이 여럿이면 카드로는 대소 비교가 안 된다.
          모바일에서는 중요도가 낮은 열(첫 바인·리바인·클락)을 숨기고 표 자체가 내부 스크롤한다.
          ⚠ 페이지 전체 가로 스크롤이 생기지 않게 스크롤은 이 컨테이너 안에서만(overflow-x-auto + min-w). */}
      {/* F14 — 조회가 죽으면 이 표는 통째로 사라졌다('오늘 게임이 없다'와 구분 불가).
          실패했으면 섹션을 남기고 이유·재시도를 보인다. 실패했는데 옛 행이 남아 있으면 개수는 '—'다. */}
      {caps.ledger && (todayGames.length > 0 || !!rangeErr) && (
        <section className="rounded-aura border card-aura p-3" aria-labelledby="today-games-h">
          {/* 제목은 안 쪼개지고(shrink-0), 안내문(274px)은 폭이 모자라면 아랫줄로 내린다(flex-wrap).
              종전엔 제목 p 가 안내문에 밀려 390px 에서 '오늘/게임/· 4개' 세 줄로 찢어졌다(2026-09-18 실측). */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p id="today-games-h" className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-ink-primary">
              <Icon name="layers" size={14} className="shrink-0 text-ink-muted" />오늘 게임
              <span className="text-2xs font-normal text-ink-muted">· {rangeErr ? '—' : `${todayGames.length}개`}</span>
            </p>
            {caps.manage && <span className="text-2xs text-ink-muted">머니인 가치 = 게임에 투입된 총 가치(현금·카드·이체·이용권)</span>}
          </div>
          {!!rangeErr && <div className="mb-2"><LoadFailRow what="오늘 게임" onRetry={reloadRange} /></div>}
          {todayGames.length > 0 && (
          <div className="overflow-x-auto scrollbar-none">
            {/* C1 e(2026-10-02, W-3) — ≥1440 은 판이 넓어져(1920: 1636px) 게임 이름과 [장부] 버튼이 1500px 넘게 떨어졌다. 표는 1366 판 폭(960)에서 멈춘다. */}
            <table className="w-full min-w-136 text-left text-xs" style={{ maxWidth: 960 }}>
              <thead>
                <tr className="border-b border-border-subtle text-2xs text-ink-muted">
                  <th scope="col" className="py-1.5 pr-2 font-semibold">게임</th>
                  <th scope="col" className="py-1.5 px-2 font-semibold">상태</th>
                  <th scope="col" className="py-1.5 px-2 text-right font-semibold">플레이어</th>
                  <th scope="col" className="hidden py-1.5 px-2 text-right font-semibold sm:table-cell">첫 바인</th>
                  <th scope="col" className="hidden py-1.5 px-2 text-right font-semibold sm:table-cell">리바인</th>
                  {caps.manage && <th scope="col" className="py-1.5 px-2 text-right font-semibold">머니인 가치</th>}
                  <th scope="col" className="py-1.5 px-2 text-right font-semibold">미수</th>
                  <th scope="col" className="hidden py-1.5 px-2 font-semibold lg:table-cell">클락</th>
                  <th scope="col" className="py-1.5 pl-2 text-right font-semibold">작업</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {(foldGames ? todayGames.filter((g) => !g.sx.closed) : todayGames).map(({ sx, c, value, unpaid, ck, ckLive }) => {
                  const label = sx.gameSeq === MAIN_GAME_SEQ ? (sx.title || '메인') : (sx.title || `사이드 ${sx.gameSeq - 1}`);
                  // 상태는 색만으로 구분하지 않는다 — 라벨을 항상 함께 쓴다(§6 접근성).
                  // 2026-09-25 #7 — 라이트에서 emerald-600 은 틴트 위 3.0:1, amber-500 도 미달이었다. 라이트는 텍스트용 딥 단(700/800), 다크는 그대로.
                  const st = sx.closed ? { t: '마감', c: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30' }
                    : sx.regClosed ? { t: '레지 마감', c: 'text-amber-800 dark:text-amber-500 bg-amber-400/10 border-amber-400/30' }
                    : { t: '진행중', c: 'text-accent-300 bg-accent-300/10 border-accent-400/30' };
                  return (
                    <tr key={sx.gameSeq} className="border-b border-border-subtle/60 last:border-0 transition-colors hover:bg-surface-float/40">
                      <th scope="row" className="max-w-36 truncate py-2 pr-2 text-left font-semibold text-ink-primary">{label}</th>
                      <td className="py-2 px-2">
                        <span className={['inline-flex w-[4.4rem] justify-center rounded-badge border px-1.5 py-0.5 text-2xs font-bold', st.c].join(' ')}>{st.t}</span>
                      </td>
                      <td className="py-2 px-2 text-right text-ink-secondary">{c.players}</td>
                      <td className="hidden py-2 px-2 text-right text-ink-secondary sm:table-cell">{c.firstBuyins}</td>
                      <td className="hidden py-2 px-2 text-right text-ink-secondary sm:table-cell">{c.rebuys}</td>
                      {caps.manage && <td data-testid="dash-game-value" className="py-2 px-2 text-right font-bold text-ink-primary">{wonToMan(value)}<span className="ml-0.5 text-2xs font-semibold text-ink-muted">만</span></td>}
                      <td className={['py-2 px-2 text-right', unpaid > 0 ? 'font-bold text-danger-light' : 'text-ink-muted'].join(' ')}>{wonToMan(unpaid)}</td>
                      <td className="hidden py-2 px-2 lg:table-cell">
                        {ckLive
                          ? <span className="inline-flex items-center gap-1 text-2xs font-bold text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />{ck?.running ? '진행' : '일시정지'}</span>
                          : <span className="text-2xs text-ink-muted">미실행</span>}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button type="button"
                          onClick={() => onGoto({ section: 'ledger', date: d, gameSeq: sx.gameSeq })}
                          className="rounded-input border border-border-default px-2 py-1 text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent-300">
                          장부
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          {!isMdUp && closedGames >= 3 && closedGames < todayGames.length && (
            <button type="button" onClick={() => setAllGames((v) => !v)} aria-expanded={!foldGames} data-testid="dash-games-fold"
              className="mt-1 flex min-h-[44px] w-full items-center justify-center gap-1 text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary">
              {foldGames ? `마감 ${closedGames}개 더 보기` : '마감 게임 접기'}
            </button>
          )}
        </section>
      )}

      {/* 더 보기 토글(IA3a) — 클락·전주 대비·직원·이용권·생일·손님 유형은 접힌 상태가 기본 */}
      <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
        className="flex w-full items-center justify-center gap-2 rounded-card border border-border-subtle bg-surface-low px-3 py-2 text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary">
        {moreOpen ? '간단히 보기' : '더 보기 · 클락 · 주간 비교 · 직원 · 이용권'}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          className={['transition-transform', moreOpen ? 'rotate-180' : ''].join(' ')} aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {/* 유틸 줄(IA3a) — 카드 옷을 입던 순수 링크들. '그 자리에서 끝내거나, 유틸이거나' */}
      {caps.manage && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-1 text-2xs">
          <button type="button" onClick={() => setCheckinOpen(true)} className="font-bold text-ink-muted transition-colors hover:text-accent-300">출석·QR 명단</button>
          <span className="text-ink-muted" aria-hidden>·</span>
          <button type="button" onClick={() => setDealerOpen(true)} className="font-bold text-ink-muted transition-colors hover:text-accent-300">딜러 로테이션·급여</button>
          <span className="text-ink-muted" aria-hidden>·</span>
          <button type="button" onClick={() => setBoostOpen(true)} className="inline-flex items-center gap-1 font-bold text-ink-muted transition-colors hover:text-accent-300"><Icon name="flame" size={11} />포스터 상단 고정 문의</button>
        </div>
      )}
    </div>
  );
}

/** C1 D-3 — 격자 마지막 줄에 카드가 1장만 남으면 그 카드를 한 줄 전체로 편다(열 수는 실제 계산값으로 — sm 2열·xl 3열 모두).
 *  카드 수가 권한·'더 보기'로 바뀌므로 CSS 선택자 대신 그리고 나서 센다(전역 CSS 예산 0 바이트). 폭이 바뀌면 다시 센다. */
function fitLastCard(g: HTMLDivElement | null) {
  if (!g) return;
  const fit = () => {
    const kids = [...g.children] as HTMLElement[];
    kids.forEach((k) => { k.style.gridColumn = ''; });
    const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length;
    if (cols > 1 && kids.length % cols === 1) kids[kids.length - 1].style.gridColumn = '1 / -1';
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(g);
  return () => ro.disconnect();
}

function DashCard({ title, badge, onClick, children, show = true, more, stretch = false, center = false }: {
  title: string; badge?: ReactNode; onClick: () => void; children: ReactNode; show?: boolean;
  /** '더 보기' 칸 — useReveal 이 이 표시로 들고 나는 칸을 찾는다 */
  more?: boolean;
  /** S3(2026-09-19, 스윕): 이 카드의 콘텐츠가 형제 카드보다 짧으면(grid align-items:stretch 기본값이
   *  행 높이를 가장 큰 형제에 맞춰 늘린다) 아래에 빈 칸만 남는다("전주 대비"가 "최근 7일 추세" 옆에서
   *  이랬다). true 면 타이틀은 위에 고정, 본문은 남는 높이를 flex-1 로 받아 세로 중앙 정렬한다.
   *  모바일(grid-cols-1)은 같은 행에 형제가 없어 늘어날 높이 자체가 없다 — flex-1 이 자연스럽게
   *  0 으로 수렴해 폭별 분기 없이도 동작한다(실측 필요 없음, CSS 자체 성질). 기본 false — 다른 카드는
   *  전부 지금 그대로다(공용 컴포넌트라 옵트인으로 격리했다). */
  center?: boolean;
  /** 격자의 items-start 를 이 카드만 풀어 줄 높이로 늘린다(같은 줄 이웃과 높이 맞춤) — center 와 같이 쓴다. */
  stretch?: boolean;
}) {
  if (!show) return null;
  return (
    <section data-reveal={more} className={['rounded-aura border card-aura p-3', center && 'flex flex-col', stretch && 'self-stretch'].filter(Boolean).join(' ')}>
      <button type="button" onClick={onClick} className={['flex w-full items-center justify-between gap-2 mb-2 group', center && 'shrink-0'].filter(Boolean).join(' ')}>
        <span className="flex items-center gap-2 text-sm font-bold text-ink-primary">{title}</span>
        <span className="flex items-center gap-1">
          {badge}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-muted group-hover:text-accent-300 transition-colors" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
        </span>
      </button>
      {center ? <div className="flex flex-1 flex-col justify-center">{children}</div> : children}
    </section>
  );
}

/** 조회 실패 줄(F14) — '데이터가 없습니다'(성공했는데 빈 것)와 반드시 다르게 말한다.
 *  숫자 자리는 '—' 로 비우고 여기에 이유와 재시도를 붙인다. DashCard 의 children 은 헤더 button 밖이라
 *  진짜 <button> 을 쓸 수 있지만, 카드 전체 onClick 으로 새는 것은 stopPropagation 으로 막는다. */
function LoadFailRow({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-input border border-amber-500/40 bg-amber-500/8 px-2 py-1.5 text-2xs font-semibold text-ink-secondary">
      <span className="break-keep">{what}을(를) 불러오지 못했어요 — 0 과는 달라요.</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onRetry(); }}
        className="hit shrink-0 rounded-input border border-amber-500/40 px-2 py-0.5 text-2xs font-bold text-ink-primary">다시 시도</button>
    </div>
  );
}

// `gold` 는 금액 칸 표식으로 남는다 — 2026-10-04 오너 결정으로 금액은 본문 색(금색은 순위·성취 전용)이라 색을 바꾸지 않는다.
function Stat({ label, value, unit, danger }: { label: string; value: string; unit?: string; gold?: boolean; danger?: boolean }) {
  return (
    <div>
      <p className="text-2xs text-ink-muted">{label}</p>
      <p className={`font-extrabold tabular-nums leading-tight ${danger ? 'text-danger-light' : 'text-ink-primary'}`}>
        <span className="text-lg">{/^[\d,]+$/.test(value) ? <CountUp value={Number(value.replace(/,/g, ''))} /> : value}</span>{unit && <span className="ml-0.5 text-2xs font-semibold text-ink-muted">{unit}</span>}
      </p>
    </div>
  );
}

function CompareRow({ label, now, prev, delta, won }: { label: string; now: number; prev: number; delta: number | null; won?: boolean }) {
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;
  const fmt = (n: number) => (won ? `${wonToMan(n)}만` : `${n}`);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-2xs text-ink-muted">{label}</span>
      <span className="flex items-baseline gap-3 tabular-nums">
        <span className="text-sm font-bold text-ink-primary">{fmt(now)}</span>
        <span className="text-2xs text-ink-muted">전주 {fmt(prev)}</span>
        {delta != null && (
          <span className={`text-2xs font-bold ${up ? 'text-emerald-400' : down ? 'text-danger-light' : 'text-ink-muted'}`}>
            {up ? '▲' : down ? '▼' : '–'}{Math.abs(delta)}%
          </span>
        )}
      </span>
    </div>
  );
}

// card-sink(카드 깊이) — 이 타일은 surface-high 라 card-elev 금지 티어(index.css .card-elev 주석).
// 아래를 낮추는 방향이라 대비는 오히려 오른다(ink-secondary 6.52→7.04 실측).

// ── ⚡ 부스트(포스터 상단 고정) 문의 모달 ─────────────────────────────────────
// 연락처는 운영자가 관리자 설정 → 게시물 관리에서 입력(app_settings) — 미입력 시 준비 중 안내.
function BoostContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  useEffect(() => {
    if (!open) return;
    getAppSetting(BOOST_CONTACT_EMAIL_KEY).then((v) => setEmail(v ?? '')).catch(() => {});
    getAppSetting(BOOST_CONTACT_PHONE_KEY).then((v) => setPhone(v ?? '')).catch(() => {});
  }, [open]);
  const hasContact = !!(email.trim() || phone.trim());
  return (
    <Modal open={open} onClose={onClose} title="포스터 상단 고정(부스트)" maxWidth="sm" variant="sheet">
      <div className="space-y-3 p-4">
        <div className="rounded-card border border-accent-400/30 bg-accent-300/6 p-3 space-y-2">
          <p className="text-sm font-bold text-accent-300">이런 효과가 있어요</p>
          <ul className="space-y-1 text-sm leading-relaxed text-ink-secondary">
            <li>· 같은 시간대 일정 중에서 <b className="text-ink-primary">맨 앞</b>에 표시됩니다</li>
            {/* 🔴 2026-09-21 — 문구를 사실에 맞췄다. 종전 "일정탐색 맨 위에 고정" 은 거짓이었다:
                `src/lib/scheduleSort.ts:15-16` 의 `compareByStartThenBoost` 는
                  (a.date + a.startTime).localeCompare(...) || Number(b.isPremium) - Number(a.isPremium)
                이라 부스트는 **날짜·시각이 완전히 같을 때의 동점 처리**일 뿐이다.
                다음 주 부스트 포스터는 오늘 게임 아래에 그대로 남는다.
                문의를 열기 전에 먼저 고친다 — 돈을 받으면 과다·허위 고지가 되기 때문이다
                (src/lib/thirdPartyDisclosure.test.ts:44 "과다 고지도 위법 소지다" · 전자상거래법 §21①1).
                진짜 "맨 위 고정" 을 팔려면 정렬 계약부터 바꿔야 한다 — 그건 별도 요구 키다. */}
            <li>· 제목에 <b className="text-accent-300">TOP 뱃지</b>가 붙어 눈에 띕니다</li>
            <li>· 기간은 <b className="text-ink-primary">3 / 7 / 14 / 30일</b> 중 선택, 끝나면 자동 해제</li>
          </ul>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-low p-3 space-y-2">
          <p className="text-sm font-bold text-ink-primary">문의 방법</p>
          {hasContact ? (
            <div className="space-y-2">
              {email.trim() && (
                <a href={`mailto:${email.trim()}`} className="btn flex items-center gap-2 rounded-input border border-border-default bg-surface-high p-3 text-sm font-semibold text-ink-primary">
                  <Icon name="send" size={15} className="shrink-0 text-ink-muted" /> <span className="min-w-0 flex-1 truncate">{email.trim()}</span>
                  <span className="shrink-0 text-2xs text-accent-300">메일 보내기 →</span>
                </a>
              )}
              {phone.trim() && (
                <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="btn flex items-center gap-2 rounded-input border border-border-default bg-surface-high p-3 text-sm font-semibold text-ink-primary">
                  <Icon name="comment" size={15} className="shrink-0 text-ink-muted" /> <span className="min-w-0 flex-1 truncate">{phone.trim()}</span>
                  <span className="shrink-0 text-2xs text-accent-300">전화 걸기 →</span>
                </a>
              )}
            </div>
          ) : (
            <p className="py-2 text-center text-sm leading-relaxed text-ink-muted">문의 연락처를 준비하고 있습니다</p>
          )}
          <p className="text-xs text-ink-muted">문의 주시면 기간·비용 안내 후, 확인되는 대로 포스터를 상단에 올려드립니다.</p>
        </div>
      </div>
    </Modal>
  );
}

// Skeleton은 공용 atom(../atoms/Skeleton) 사용

/** 운영 권한이 없는 구성원이 보는 화면 — **본인 것만** 보여 준다.
 *
 *  서버는 `my_staff_wage` 로 `user_id` 가 **명시 연결된 줄만** 돌려준다(20260915i).
 *  그래서 결과가 없는 경우가 두 가지인데 **뜻이 다르다**:
 *    · 0행  → 업주가 아직 내 급여 줄을 연결하지 않았다(정상. 오류 아님)
 *    · 오류 → 조회 자체가 실패했다(네트워크·권한)
 *  둘을 같은 문장으로 말하면 직원이 "고장인가?" 하고 업주에게 헛되이 묻는다. 갈라 말한다.
 */
export function MyStaffCard({ venueId, preview = false }: {
  venueId: string;
  /** 관리자(마스터) 미리보기 — 직원 화면을 **보기만** 한다. 본인 급여 조회(my_staff_wage)를 부르지 않는다:
   *  관리자에게는 연결된 급여 줄이 없어 '업주가 연결하지 않았어요' 라는 거짓 안내가 뜬다(오너 2026-09-28). */
  preview?: boolean;
}) {
  const [wage, setWage] = useState<MyWage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (preview) return;
    let alive = true;
    setState('loading');
    getMyStaffWage(venueId)
      .then((w) => { if (alive) { setWage(w); setState('ready'); } })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [venueId, preview]);

  return (
    <div className="space-y-3">
      <div className="rounded-card border border-border-default bg-surface-low p-5 space-y-3">
        <p className="text-sm font-bold text-ink-primary">내 근무 정보</p>

        {preview && (
          <p className="t-desc break-keep text-ink-muted">업주가 연결한 시급·급여일·휴무가 표시됩니다</p>
        )}

        {!preview && state === 'loading' && <p aria-busy="true" className="t-desc text-ink-muted">불러오는 중…</p>}

        {!preview && state === 'error' && (
          <p className="t-desc break-keep text-ink-muted">
            인건비를 불러오지 못했어요. 잠시 후 다시 열어 주세요.
          </p>
        )}

        {!preview && state === 'ready' && wage && (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-badge bg-surface-high py-2">
              <dt className="text-2xs text-ink-muted">시급</dt>
              <dd className="text-sm font-bold text-ink-primary">{wage.hourlyWage.toLocaleString()}원</dd>
            </div>
            <div className="rounded-badge bg-surface-high py-2">
              <dt className="text-2xs text-ink-muted">급여일</dt>
              <dd className="text-sm font-bold text-ink-primary">{wage.payday ? `매월 ${wage.payday}일` : '미정'}</dd>
            </div>
            <div className="rounded-badge bg-surface-high py-2">
              <dt className="text-2xs text-ink-muted">휴무</dt>
              <dd className="text-sm font-bold text-ink-primary">{wage.weeklyOff || '미정'}</dd>
            </div>
          </dl>
        )}

        {!preview && state === 'ready' && !wage && (
          <p className="t-desc break-keep text-ink-muted">
            아직 업주가 내 급여 정보를 연결하지 않았어요.{' '}
            업주에게 <span className="font-semibold text-ink-primary">직원 연결</span>을 요청하면 여기에 표시됩니다.
          </p>
        )}
      </div>

      <div className="rounded-card border border-border-default bg-surface-low p-5 space-y-2">
        <p className="text-sm font-bold text-ink-primary">내 스케줄·출퇴근</p>
        <p className="t-desc break-keep text-ink-muted">
          <span className="max-lg:hidden">왼쪽</span><span className="lg:hidden">전체</span> 메뉴의 <span className="font-semibold text-ink-primary">출근 관리</span>에서 본인 일정을 보고 출퇴근을 기록할 수 있어요.
        </p>
      </div>

      <div className="rounded-card border border-border-default bg-surface-low p-5 space-y-2">
        <p className="text-sm font-bold text-ink-primary">더 필요한 권한이 있나요?</p>
        <p className="t-desc break-keep text-ink-muted">
          업주에게 <span className="font-semibold text-ink-primary">장부·순위</span>,{' '}
          <span className="font-semibold text-ink-primary">이용권 내역</span>,{' '}
          <span className="font-semibold text-ink-primary">스케줄 편성</span> 권한을 요청할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
