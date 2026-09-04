// src/api/ledger.ts — NURI POS 장부 시스템 API
import { supabase, IS_MOCK } from '../lib/supabase';
import { currentUser } from './_session';
import type { ClockConfig as ClockConfigT } from './clock'; // 타입 전용 — 런타임 순환 없음

export type PaymentMethod = 'ticket' | 'cash' | 'transfer' | 'card' | 'support';
export type EarlyType = 'double' | 'single' | 'none'; // 더블얼리 / 1얼리 / 없음
/** 할인 프리셋. amount: 원.
 *  level: 이 할인이 '자동 적용'되는 마감 레벨(1-based, 0/미지정=자동 적용 없음).
 *  예) 「1레벨 5만 할인」 = { label:'1레벨', amount:50_000, level:1 } — 1레벨 안에 바인하면 자동 선택.
 *  ⚠ jsonb 컬럼이라 필드 추가에 마이그레이션이 필요 없다. 기존 행은 level 없음 = 수기 선택(구 동작). */
export interface DiscountPreset { label: string; amount: number; level?: number }
/** 고정 유형 코드 + 그 외(기타/직접입력)는 자유 텍스트로 저장 */
export type VisitorType = 'new' | 'regular' | 'staff' | 'other';
const VISITOR_KNOWN: Record<string, string> = { new: '신규방문', regular: '기존손님', staff: '관계자', other: '기타' };
/** 저장값(코드 또는 커스텀 텍스트) → 표시 라벨 */
export function visitorLabel(v: string | null | undefined): string {
  if (!v) return '';
  return VISITOR_KNOWN[v] ?? v;
}

/** 하루 안에서 메인(1)/사이드(2,3…) 게임을 구분하는 시퀀스. 기존 데이터는 전부 1(메인). */
export const MAIN_GAME_SEQ = 1;

export interface LedgerBuyin {
  id: string;
  venueId: string;
  sessionDate: string;
  gameSeq: number;              // 게임 구분(1=메인, 2+=사이드)
  playerName: string;
  entryNo: number;
  paymentMethod: PaymentMethod;
  isUnpaid: boolean;
  buyinAt: string;
  // 분납/할인 (is_split=true 일 때 금액 분해)
  isSplit: boolean;
  cashAmount: number;
  cardAmount: number;
  transferAmount: number;
  ticketCount: number;
  unpaidAmount: number;
  discountLevel: number;
  discountIndex: number;        // 적용 할인 프리셋(0=없음, 1~5)
  earlyOverride: EarlyType | null; // 얼리 수기지정(null=시각 기준 자동판정)
}

/** C2: 마감 시 저장하는 클락 최종 보정 수치(통계 보조 표기용). 장부 바인과 별개 기준. */
export interface ClockSnapshot { entries: number; alive: number; eliminations: number; rebuys: number; earlies: number; addons: number }

// PL3: 마감 시점 회차 스냅샷 — 그 게임 설정이 완성된 유일한 순간의 클락 설정을 함께 보존.
// clock_states 는 (venue,game_seq)당 1행이라 다음 게임이 시작되면 덮이므로, 마감 순간에 캡처해야
// '지난 게임 그대로 열기'가 클락(블라인드·얼리·프라이즈)까지 복원할 수 있다.
// 저장 위치: 기존 ledger_sessions.clock_snapshot(jsonb)에 gameSnapshot 키 추가 — 스키마 마이그레이션 불필요.
// ⚠ ClockConfig 는 타입 전용 임포트(clock.ts 가 이 파일을 런타임 임포트하므로 순환 방지).
export interface GameRoundSnapshot { capturedAt: string; clockConfig?: ClockConfigT | null }
/** 마감 스냅샷 = 기존 카운트(ClockSnapshot) + 선택적 회차 스냅샷. 카운트 없는 스냅샷은 쓰지 않는다
 *  (통계 clockAgg 가 non-null 스냅샷을 게임 수로 집계 — 카운트 없는 행이 평균을 왜곡). */
export type LedgerCloseSnapshot = ClockSnapshot & { gameSnapshot?: GameRoundSnapshot }

export interface LedgerSession {
  venueId: string;
  sessionDate: string;
  gameSeq: number;              // 게임 구분(1=메인, 2+=사이드) — (venue,date,game_seq) = 장부 1개
  buyinAmount: number;          // 현금단가
  cardAmount: number | null;    // 카드단가(미입력 시 현금단가 적용)
  gameType: 'gtd' | 'entry';    // GTD(보장) / 엔트리 게임
  targetEntries: number;        // 기준 엔트리(GTD용 통계 기준)
  maxEntries: number;           // 맥스 엔트리(엔트리 게임용, 0=무제한/미설정)
  isAddon: boolean;             // 애드온 게임 여부
  addonStack: number;           // 애드온 스택(애드온 게임일 때만)
  title?: string;               // 금일 게임 내용
  eventMemo?: string;           // 이벤트 등 비고
  dealers?: string;             // 금일 딜러 명단(줄바꿈 구분, 선택)
  scheduleId?: string | null;   // 연결된 포스터(대회) 일정
  discounts: DiscountPreset[];  // 할인 프리셋(최대 5)
  earlyDoubleMin: number;       // 스타트 후 ~분까지 더블얼리
  earlySingleMin: number;       // 스타트 후 ~분까지 1얼리
  tournamentStart?: string | null; // 토너먼트 스타트 시각(ISO, 없으면 openedAt 기준)
  openedBy?: string | null;     // 담당직원 대표(프로필 id, 하위호환)
  operators?: string[];         // 담당직원 목록(최대 10) — 직원 장부 접근 권한 기준
  openedAt?: string | null;
  regClosed: boolean;           // 레지(레지스트리) 마감
  regClosedAt?: string | null;
  closed: boolean;              // 정산 마감(읽기전용 스냅샷)
  closedAt?: string | null;
  closeMemo?: string | null;
  voucherIssued?: number;       // 매장이용권 발행/시상 장수(당일)
  voucherAccrualPerBin?: number; // 바인 1회당 매장이용권 적립 수(0=off)
  clockSnapshot?: LedgerCloseSnapshot | null; // C2: 마감 시 클락 최종 스냅샷(통계 보조 + PL3 회차 스냅샷)
}

export interface LedgerPlayer {
  id: string;
  venueId: string;
  sessionDate: string;
  gameSeq: number;              // 게임 구분(1=메인, 2+=사이드)
  name: string;
  visitorType: string | null;   // 코드(new/regular/staff/other) 또는 커스텀 텍스트
  note: string | null;
  sortOrder: number;
}

const today = () => new Date().toLocaleDateString('en-CA'); // 로컬 날짜(YYYY-MM-DD) — UTC 자정 넘김 방지
/**
 * KST(Asia/Seoul) 기준 오늘 — YYYY-MM-DD.
 * 왜 today() 를 안 쓰나: 위 today() 는 브라우저 로컬 TZ 라 해외·시계 오설정 기기에서 하루가 어긋난다.
 * 서버 RPC(request_buyin·check_in)는 (now() at time zone 'Asia/Seoul')::date 로 날짜를 정하므로,
 * '오늘만 가능한' 게이트는 서버와 같은 기준으로 판단해야 화면과 서버가 따로 놀지 않는다.
 * now 인자는 테스트에서 자정 경계(15:00Z)를 고정하려고 열어둔 것.
 */
export const kstToday = (now: number = Date.now()): string =>
  new Date(now + 9 * 3600_000).toISOString().slice(0, 10);

export const WON_PER_MAN = 10000;
/** 원 → 만원 표시 문자열 (예: 310000 → "31", 77000 → "7.7") */
export function wonToMan(won: number): string {
  return (won / WON_PER_MAN).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** 카드 결제에 적용할 단가(카드단가 미설정 시 현금단가) */
export function cardUnit(s: { buyinAmount: number; cardAmount: number | null }): number {
  return s.cardAmount && s.cardAmount > 0 ? s.cardAmount : s.buyinAmount;
}

export interface BuyinFinance {
  paid: number; unpaid: number; entry: number; ticketPaid: number; ticketUnpaid: number; support: number;
  /** 이 바인의 **가치**(원) — '총바인' 열이 쓴다. 매출(paid)과 다른 개념이다.
   *  매출은 '실제 받은 현금'이라 티켓·지원이 0인 게 맞지만, 총바인은 '만들어진 바인의 가치'다.
   *  대부분 value/단가 === entry 다(아래 각 분기 참고). 예외는 레거시 스냅샷 현금 행뿐 —
   *  거기서는 실제 받은 금액(스냅샷)을 존중하고 entry 는 세션 단가로 계산되기 때문이다. */
  value: number;
}

/** 바인 1건의 매출/미수/엔트리(할인 반영). 엔트리 = (단가 - 할인)/단가. */
export function buyinFinance(b: LedgerBuyin, s: { buyinAmount: number; cardAmount: number | null; discounts?: DiscountPreset[] }): BuyinFinance {
  const entryUnit = s.buyinAmount;
  const z: BuyinFinance = { paid: 0, unpaid: 0, entry: 0, ticketPaid: 0, ticketUnpaid: 0, support: 0, value: 0 };
  if (b.isSplit) {
    // 분납 = 결제수단 쪼개기(예: 카드 4만 + 티켓 1장). 실제 받은 현금성 금액이 매출, 미수는 별도 입력값.
    // 할인 이벤트가 걸리면 그만큼 덜 받으므로 할인분은 애초에 입력 금액에 포함되지 않는다.
    // ⚠ 과거의 discountLevel(레벨 수 숫자)은 계산 어디에도 반영되지 않는 죽은 값이었다.
    //   할인은 discountIndex(할인 프리셋)로 일원화한다 — 분납도 동일.
    // ⚠ 티켓(이용권)은 현금 매출이 아니지만 '참가'는 했으므로 엔트리에 포함해야 한다.
    //   과거엔 ticketCount가 엔트리·티켓 집계에서 통째로 빠져, 티켓만으로 참가한 손님이
    //   '회수 티켓 1장인데 엔트리 0'으로 잡히는 모순이 있었다(빠른입력 티켓은 엔트리 1).
    //   비분납 티켓 결제와 동일하게 1장 = 바인 1회(엔트리 1)로 환산한다.
    const paid = b.cashAmount + b.cardAmount + b.transferAmount;
    // 티켓 1장 = 바인 1회 상당(액면가). 분납은 현금·카드 칸에 **이미 할인이 빠진 실수령액**이
    // 들어오므로 여기서 할인을 또 빼면 이중 차감이 된다 — 그래서 액면가 그대로 쓴다.
    // ⚠ 남아 있는 어긋남: `티켓만 1장 + 할인` 분납은 entry 1 인데, 같은 조합을 빠른입력으로
    //   찍으면 0.5 다(비분납은 할인을 탄다). 분납에서 티켓만 골라 놓고 할인까지 고르는 조합이라
    //   실사용 빈도가 낮고(운영 DB: 분납 0건·할인 0건), 올바른 규칙이 하나로 정해지지 않아 남겨 둔다.
    const ticketWon = b.ticketCount * entryUnit;
    const total = paid + b.unpaidAmount + ticketWon;
    const isTicketUnpaid = b.unpaidAmount > 0 && paid === 0 && b.ticketCount > 0;
    return {
      ...z,
      paid,
      unpaid: b.unpaidAmount,
      entry: entryUnit > 0 ? total / entryUnit : (total > 0 ? 1 : 0),
      ticketPaid: isTicketUnpaid ? 0 : b.ticketCount,
      ticketUnpaid: isTicketUnpaid ? b.ticketCount : 0,
      value: total, // 현금성 + 미수 + 티켓 환산 — 분납은 total 이 곧 가치다

    };
  }
  const disc = (s.discounts && b.discountIndex > 0 && s.discounts[b.discountIndex - 1]) ? s.discounts[b.discountIndex - 1].amount : 0;
  const entry = entryUnit > 0 ? Math.max(0, entryUnit - disc) / entryUnit : 1;
  // 가게지원 = 매장이 참가비를 대신 부담. 할인 이벤트가 걸려 있으면 매장이 그만큼 덜 부담하므로
  // 가치도 단가−할인이다(entry 와 정확히 같은 비율 — value/단가 === entry).
  if (b.paymentMethod === 'support') return { ...z, entry, support: 1, value: Math.max(0, entryUnit - disc) };
  // 티켓 1장 = 바인 1회. 가치는 **단가 전액이 기본**이되, 할인이 입력돼 있으면 그만큼 뺀다.
  //   (오너 정정 2026-09-05: "할인이 걸리면 할인은 따로 입력할 테니까,
  //    티켓이라고 무조건 10으로 입력하면 안 되지.")
  //   즉 '1T = 단가' 는 할인이 없을 때의 이야기다. 할인은 운영자가 따로 넣는 값이라 그대로 반영한다.
  //   ⚠ 이전 결함은 '할인'이 아니라 **가치가 통째로 0원**이던 것이었다(총바인 열이 0만으로 찍힘).
  //     그 수정은 value 로 유지되고, 여기서 되돌리는 것은 할인 무시뿐이다.
  //   가게지원과 같은 규칙이 된다 — 둘 다 '현금은 안 받았지만 자리는 찼다'.
  if (b.paymentMethod === 'ticket') {
    return { ...z, entry, ticketPaid: b.isUnpaid ? 0 : 1, ticketUnpaid: b.isUnpaid ? 1 : 0,
             value: Math.max(0, entryUnit - disc) };
  }
  // 스냅샷 우선(2026-08-18 전환): 기록 시점 net 금액이 amounts 칸에 저장돼 있으면 그 값이 정본 —
  // 이후 세션 단가·할인을 고쳐도 과거 기록이 소급 변형되지 않는다(실제 받은 현금 = 장부).
  // 저장 금액이 0인 행은 전환 이전 레거시 — 기존처럼 세션 참조로 계산(하위호환).
  const stored = b.cashAmount + b.cardAmount + b.transferAmount;
  const payUnit = b.paymentMethod === 'card' ? cardUnit(s) : s.buyinAmount;
  const effPay = stored > 0 ? stored : Math.max(0, payUnit - disc);
  return b.isUnpaid ? { ...z, entry, unpaid: effPay, value: effPay } : { ...z, entry, paid: effPay, value: effPay };
}

/** 기록 시점 확정 금액(스냅샷) — 비분납 현금/카드/이체는 net(단가−할인)을 amounts 칸에 저장한다.
 *  buyinFinance 가 저장 금액을 우선하므로, 이후 세션 단가·할인 수정이 과거 기록에 소급되지 않는다.
 *  (서버 approve_buyin_request 는 처음부터 이 방식 — 클라 기록을 같은 원리로 정렬) */
export function nonSplitSnapshot(method: PaymentMethod, discountIndex: number,
  s: { buyinAmount: number; cardAmount: number | null; discounts?: DiscountPreset[] },
): { cash_amount: number; card_amount: number; transfer_amount: number } {
  const z = { cash_amount: 0, card_amount: 0, transfer_amount: 0 };
  if (method !== 'cash' && method !== 'card' && method !== 'transfer') return z;
  const disc = discountAmountOf(s, discountIndex);
  const unit = method === 'card' ? cardUnit(s) : s.buyinAmount;
  const eff = Math.max(0, unit - disc);
  if (method === 'cash') return { ...z, cash_amount: eff };
  if (method === 'card') return { ...z, card_amount: eff };
  return { ...z, transfer_amount: eff };
}

/** 할인 적용 후 표시용 금액(원). */
export function discountAmountOf(s: { discounts?: DiscountPreset[] }, idx: number): number {
  return (s.discounts && idx > 0 && s.discounts[idx - 1]) ? s.discounts[idx - 1].amount : 0;
}

/** 바인 시점 레벨에 자동 적용할 할인 프리셋 자리번호(1-based, 0=없음) — #20.
 *  규칙: level 이 붙은 프리셋 중 `levelNo <= level` 인 것들 가운데 **가장 좁은(작은) level** 이 이긴다.
 *  예) 1레벨 5만 · 2레벨 3만 → 1레벨 바인은 5만, 2레벨 바인은 3만, 3레벨 바인은 할인 없음.
 *  왜 '가장 작은 level' 인가: 얼리(더블→1얼리)와 같은 계단 규칙이라 운영자가 두 번 배우지 않아도 된다.
 *  ⚠ 자동은 어디까지나 초기값이다 — 결제 모달에서 언제든 다른 할인/없음으로 바꿀 수 있어야 한다(오너 #20). */
export function autoDiscountIndex(discounts: DiscountPreset[] | undefined, levelNo: number): number {
  if (!discounts?.length || levelNo <= 0) return 0;
  let best = 0, bestLv = Number.POSITIVE_INFINITY;
  for (let i = 0; i < discounts.length; i++) {
    const d = discounts[i];
    const lv = d?.level ?? 0;
    if (lv <= 0 || (d?.amount ?? 0) <= 0) continue;
    if (levelNo > lv) continue;
    if (lv < bestLv) { bestLv = lv; best = i + 1; }
  }
  return best;
}

/** 금일 할인 집계(#20) — 마감정산에 '할인 엔트리 수 · 총 할인액'을 띄우기 위한 단일 소스.
 *  count  = 할인이 걸린 바인(=할인 엔트리) 건수
 *  total  = 그 할인액의 합(원)
 *  entryLoss = 할인으로 깎인 엔트리 환산량(10만 게임 5만 할인 = 0.5)
 *  ⚠ 분납도 discountIndex 로 일원화돼 있어 동일하게 잡힌다(2026-07 '레벨 할인' 사건의 교훈). */
export interface DiscountSummary { count: number; total: number; entryLoss: number }
/**
 * 정산 제외 판정 — 이 바인이 정산에서 빠지는가.
 * 키 형식: `visitor:<유형>` · `method:<결제수단>` (오너 지시 2026-09-05
 * "관계자·신규처럼 빼고 정산", "티켓·현금·카드도 뺄 수 있게").
 *
 * 제외는 **행 단위**다 — 금액만 반쪽으로 빼면 엔트리와 금액이 어긋난다.
 * 분납은 수단이 섞여 있으므로 **쓰인 수단이 전부 제외 대상일 때만** 뺀다:
 * 현금+티켓 분납에서 '티켓'만 제외했을 때 그 행을 뺄지 말지는 정답이 없어, 남기는 쪽을 고른다
 * (덜 빼는 실수가 더 빼는 실수보다 되돌리기 쉽다).
 *
 * visitorOf 는 이름 → 방문자 유형. 바인 행에는 유형이 없어 로스터에서 잇는다.
 */
export function isBuyinExcluded(
  b: LedgerBuyin,
  exKeys: ReadonlySet<string>,
  visitorOf: (playerName: string) => string | null | undefined,
): boolean {
  if (exKeys.size === 0) return false;
  const vt = visitorOf(b.playerName);
  if (vt && exKeys.has(`visitor:${vt}`)) return true;
  if (b.isSplit) {
    const used: PaymentMethod[] = [];
    if (b.cashAmount > 0) used.push('cash');
    if (b.cardAmount > 0) used.push('card');
    if (b.transferAmount > 0) used.push('transfer');
    if (b.ticketCount > 0) used.push('ticket');
    return used.length > 0 && used.every((m) => exKeys.has(`method:${m}`));
  }
  return exKeys.has(`method:${b.paymentMethod}`);
}

export function discountSummary(
  buyins: LedgerBuyin[],
  s: { buyinAmount: number; discounts?: DiscountPreset[] },
): DiscountSummary {
  let count = 0, total = 0;
  for (const b of buyins) {
    const amt = discountAmountOf(s, b.discountIndex);
    if (b.discountIndex > 0 && amt > 0) { count++; total += amt; }
  }
  return { count, total, entryLoss: s.buyinAmount > 0 ? total / s.buyinAmount : 0 };
}

export interface LedgerLossSummary { buyins: number; people: number; revenue: number; unpaid: number }

/** 장부 삭제 확인창에 띄울 '잃는 양' 요약.
 *  왜 별도 함수인가: 확인창 숫자가 실제 장부와 다르면 "별거 없네" 하고 지우게 돼 경고 자체가 거짓말이 된다.
 *  마감 모달과 같은 buyinFinance 규칙을 강제로 재사용해 두 화면이 갈리지 않게 한다.
 *  인원은 '명단 ∪ 바인 기록 이름' — 보드도 명단에 없는 바인만 있는 손님을 행으로 보여주기 때문. */
export function ledgerLossSummary(
  buyins: LedgerBuyin[],
  players: { name: string }[],
  s: { buyinAmount: number; cardAmount: number | null; discounts?: DiscountPreset[] },
): LedgerLossSummary {
  let revenue = 0, unpaid = 0;
  const names = new Set<string>(players.map((p) => p.name));
  for (const b of buyins) {
    const f = buyinFinance(b, s);
    revenue += f.paid; unpaid += f.unpaid;
    names.add(b.playerName);
  }
  return { buyins: buyins.length, people: names.size, revenue, unpaid };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToBuyin = (r: any): LedgerBuyin => ({
  id: r.id, venueId: r.venue_id, sessionDate: r.session_date, gameSeq: r.game_seq ?? MAIN_GAME_SEQ,
  playerName: r.player_name, entryNo: r.entry_no,
  paymentMethod: r.payment_method as PaymentMethod, isUnpaid: !!r.is_unpaid,
  buyinAt: r.buyin_at,
  isSplit: !!r.is_split,
  cashAmount: r.cash_amount ?? 0, cardAmount: r.card_amount ?? 0, transferAmount: r.transfer_amount ?? 0,
  ticketCount: r.ticket_count ?? 0, unpaidAmount: r.unpaid_amount ?? 0, discountLevel: r.discount_level ?? 0,
  discountIndex: r.discount_index ?? 0,
  earlyOverride: (r.early_override ?? null) as EarlyType | null,
});

/** 바인 1건의 얼리 유형 — 수기지정 우선, 없으면 (바인시각 − 스타트) 경과분으로 자동판정 */
export function earlyTypeOf(
  b: LedgerBuyin,
  s: { earlyDoubleMin?: number; earlySingleMin?: number; tournamentStart?: string | null; openedAt?: string | null },
): EarlyType {
  // 얼리는 첫 바이인(entryNo=1)에만. 2번째부터는 리바인 — 얼리 아님(리바인 스택).
  if (b.entryNo !== 1) return 'none';
  if (b.earlyOverride === 'double' || b.earlyOverride === 'single' || b.earlyOverride === 'none') return b.earlyOverride;
  const dMin = s.earlyDoubleMin ?? 0, sMin = s.earlySingleMin ?? 0;
  const start = s.tournamentStart || s.openedAt;
  if (!start || (dMin <= 0 && sMin <= 0)) return 'none';
  const mins = (new Date(b.buyinAt).getTime() - new Date(start).getTime()) / 60_000;
  if (mins < 0) return 'none';
  if (dMin > 0 && mins <= dMin) return 'double';
  if (sMin > 0 && mins <= sMin) return 'single';
  return 'none';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToSession = (venueId: string, date: string, d: any): LedgerSession => ({
  venueId, sessionDate: date, gameSeq: d?.game_seq ?? MAIN_GAME_SEQ,
  buyinAmount: d?.buyin_amount ?? 0,
  cardAmount: d?.card_amount ?? null,
  gameType: (d?.game_type === 'entry' ? 'entry' : 'gtd'),
  targetEntries: d?.target_entries ?? 0,
  maxEntries: d?.max_entries ?? 0,
  isAddon: !!d?.is_addon,
  addonStack: d?.addon_stack ?? 0,
  title: d?.title ?? undefined,
  eventMemo: d?.event_memo ?? undefined,
  dealers: d?.dealers ?? undefined,
  scheduleId: d?.schedule_id ?? null,
  openedBy: d?.opened_by ?? null,
  operators: Array.isArray(d?.operators) ? d.operators : [],
  openedAt: d?.opened_at ?? null,
  regClosed: !!d?.reg_closed,
  regClosedAt: d?.reg_closed_at ?? null,
  closed: !!d?.closed,
  closedAt: d?.closed_at ?? null,
  closeMemo: d?.close_memo ?? null,
  discounts: Array.isArray(d?.discounts) ? d.discounts : [],
  earlyDoubleMin: d?.early_double_min ?? 0,
  earlySingleMin: d?.early_single_min ?? 0,
  tournamentStart: d?.tournament_start ?? null,
  voucherIssued: d?.voucher_issued ?? 0,
  voucherAccrualPerBin: d?.voucher_accrual_per_bin ?? 0,
  clockSnapshot: (d?.clock_snapshot ?? null) as LedgerCloseSnapshot | null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToPlayer = (r: any): LedgerPlayer => ({
  id: r.id, venueId: r.venue_id, sessionDate: r.session_date, gameSeq: r.game_seq ?? MAIN_GAME_SEQ,
  name: r.name, visitorType: (r.visitor_type ?? null) as VisitorType | null,
  note: r.note ?? null, sortOrder: r.sort_order ?? 0,
});

const emptySession = (venueId: string, date: string, gameSeq = MAIN_GAME_SEQ): LedgerSession => ({
  venueId, sessionDate: date, gameSeq, buyinAmount: 0, cardAmount: null,
  gameType: 'gtd', targetEntries: 0, maxEntries: 0, isAddon: false, addonStack: 0,
  operators: [],
  regClosed: false, closed: false, discounts: [],
  earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: null,
  voucherIssued: 0,
  voucherAccrualPerBin: 0,
});

// ── 권한 ──────────────────────────────────────────────────────────────────────
export async function canAccessLedger(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data, error } = await supabase.rpc('can_access_ledger', { p_venue_id: venueId });
  if (error) return false;
  return !!data;
}
export async function canManagePos(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data, error } = await supabase.rpc('can_manage_pos', { p_venue_id: venueId });
  if (error) return false;
  return !!data;
}

// ── 세션(매장+날짜+게임) ───────────────────────────────────────────────────────
export async function getLedgerSession(venueId: string, date = today(), gameSeq = MAIN_GAME_SEQ): Promise<LedgerSession> {
  if (IS_MOCK) return emptySession(venueId, date, gameSeq);
  // ⚠ 여기서 error 를 버리면 조회 실패가 '오늘 게임 없음'(emptySession)으로 둔갑한다.
  //    화면은 세팅 폼을 띄우고, 사장님이 열면 진행 중인 장부의 마감·단가·할인이 덮인다.
  //    빈 장부와 조회 실패는 완전히 다른 상태다.
  const { data, error } = await supabase.from('ledger_sessions')
    .select('*').eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq).maybeSingle();
  if (error) throw error;
  return data ? rowToSession(venueId, date, data) : emptySession(venueId, date, gameSeq);
}

/** 특정 날짜의 게임(메인+사이드) 목록 — game_seq 오름차순(1=메인). 게임 선택기/생성용. */
export interface LedgerGame {
  gameSeq: number;
  title?: string;
  buyinAmount: number;
  openedAt?: string | null;
  regClosed: boolean;
  closed: boolean;
  scheduleId?: string | null;
}
export async function getLedgerGames(venueId: string, date = today()): Promise<LedgerGame[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_sessions')
    .select('game_seq, title, buyin_amount, opened_at, reg_closed, closed, schedule_id')
    .eq('venue_id', venueId).eq('session_date', date)
    .order('game_seq', { ascending: true });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({
    gameSeq: d.game_seq ?? MAIN_GAME_SEQ, title: d.title ?? undefined, buyinAmount: d.buyin_amount ?? 0,
    openedAt: d.opened_at ?? null, regClosed: !!d.reg_closed, closed: !!d.closed, scheduleId: d.schedule_id ?? null,
  }));
}

/** 다음 사이드 게임 번호 — 그 날짜의 max(game_seq)+1 (없으면 메인=1). */
export async function nextGameSeq(venueId: string, date: string): Promise<number> {
  if (IS_MOCK) return MAIN_GAME_SEQ;
  const { data } = await supabase.from('ledger_sessions')
    .select('game_seq').eq('venue_id', venueId).eq('session_date', date)
    .order('game_seq', { ascending: false }).limit(1).maybeSingle();
  const max = (data as { game_seq?: number } | null)?.game_seq ?? 0;
  return Math.max(MAIN_GAME_SEQ, max + 1);
}

export interface LedgerSessionListItem {
  sessionDate: string;
  gameSeq: number;
  title?: string;
  openedAt?: string | null;
  regClosed: boolean;
  closed: boolean;
  buyinAmount: number;
  operators: string[];
}

/** 매장의 게임(세션) 목록 — 최신 날짜순(같은 날은 game_seq 오름차순). 장부 진입 시 리스트업 용. */
export async function getLedgerSessionList(venueId: string, limit = 90): Promise<LedgerSessionListItem[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_sessions')
    .select('session_date, game_seq, title, opened_at, reg_closed, closed, buyin_amount, operators')
    .eq('venue_id', venueId).order('session_date', { ascending: false }).order('game_seq', { ascending: true }).limit(limit);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({
    sessionDate: d.session_date, gameSeq: d.game_seq ?? MAIN_GAME_SEQ, title: d.title ?? undefined,
    openedAt: d.opened_at ?? null, regClosed: !!d.reg_closed, closed: !!d.closed,
    buyinAmount: d.buyin_amount ?? 0,
    operators: Array.isArray(d.operators) ? d.operators : [],
  }));
}

/** 포스터(스케줄)와 연결된 장부 매핑 — scheduleId → sessionDate. 게임관리 '장부' 바로가기용. */
export async function getLedgerScheduleLinks(venueId: string): Promise<Record<string, string>> {
  if (IS_MOCK) return {};
  const { data } = await supabase.from('ledger_sessions')
    .select('schedule_id, session_date')
    .eq('venue_id', venueId).not('schedule_id', 'is', null)
    .order('session_date', { ascending: false }).limit(200);
  const map: Record<string, string> = {};
  for (const d of (data ?? []) as { schedule_id: string; session_date: string }[]) {
    if (!map[d.schedule_id]) map[d.schedule_id] = d.session_date; // 같은 포스터에 여럿이면 최신 장부
  }
  return map;
}

/** 포스터(스케줄) 하나에 연결된 장부 전체 — 멀티데이/사이드 운영 대응(최신순). */
export interface ScheduleLedgerItem { date: string; gameSeq: number; title: string | null; closed: boolean }
export async function getScheduleLedgers(venueId: string, scheduleId: string): Promise<ScheduleLedgerItem[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('ledger_sessions')
    .select('session_date, game_seq, title, closed')
    .eq('venue_id', venueId).eq('schedule_id', scheduleId)
    .order('session_date', { ascending: false }).order('game_seq', { ascending: true }).limit(30);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((d: any) => ({ date: d.session_date, gameSeq: d.game_seq ?? MAIN_GAME_SEQ, title: d.title ?? null, closed: !!d.closed }));
}

/** 장부 시작 알림 — 담당 직원(본인 제외)에게 "장부가 시작됐어요" 알림(서버 RPC, 권한 검증). */
export async function notifyLedgerOpen(venueId: string, title: string, operatorIds: string[]): Promise<void> {
  if (IS_MOCK || operatorIds.length === 0) return;
  await supabase.rpc('notify_ledger_open', { p_venue_id: venueId, p_title: title, p_operator_ids: operatorIds });
}

/** 게임관리 운영 현황판 — 연결 장부의 바인 수·매출(만)·마감·순위입력 여부(scheduleId 키). */
export interface PosterOpsSummary {
  date: string;
  closed: boolean;
  buyinCount: number;
  revenueMan: number;   // 실수금 합(만원 환산) — 통계와 동일한 buyinFinance 규칙(DB 금액은 원 단위)
  hasRankings: boolean; // 그 날짜에 순위 입력이 1건이라도 있는지
}
export async function getPosterOpsSummaries(venueId: string): Promise<Record<string, PosterOpsSummary>> {
  if (IS_MOCK) return {};
  const { data: ss } = await supabase.from('ledger_sessions')
    .select('schedule_id, session_date, game_seq, closed, buyin_amount, card_amount, discounts')
    .eq('venue_id', venueId).not('schedule_id', 'is', null)
    .order('session_date', { ascending: false }).limit(100);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (ss ?? []) as any[];
  if (!sessions.length) return {};
  const gkey = (d: string, g: number) => `${d}#${g}`;
  const byKey = new Map(sessions.map((s) => [gkey(s.session_date as string, s.game_seq ?? MAIN_GAME_SEQ), s]));
  const dates = [...new Set(sessions.map((s) => s.session_date as string))];
  const [bRes, rRes] = await Promise.all([
    supabase.from('ledger_buyins').select('*').eq('venue_id', venueId).in('session_date', dates),
    supabase.from('venue_rankings').select('ranking_date').eq('venue_id', venueId).in('ranking_date', dates),
  ]);
  const rankedDates = new Set(((rRes.data ?? []) as { ranking_date: string }[]).map((r) => r.ranking_date));
  // (날짜,게임)별 바인 집계(매출은 그 게임 단가 기준 buyinFinance)
  const agg = new Map<string, { cnt: number; rev: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (bRes.data ?? []) as any[]) {
    const b = rowToBuyin(row);
    const k = gkey(row.session_date as string, row.game_seq ?? MAIN_GAME_SEQ);
    const s = byKey.get(k);
    if (!s) continue;
    const fin = buyinFinance(b, { buyinAmount: s.buyin_amount ?? 0, cardAmount: s.card_amount ?? null, discounts: s.discounts ?? [] });
    const cur = agg.get(k) ?? { cnt: 0, rev: 0 };
    cur.cnt += 1;
    cur.rev += fin.paid;
    agg.set(k, cur);
  }
  const out: Record<string, PosterOpsSummary> = {};
  for (const s of sessions) {
    if (out[s.schedule_id]) continue; // 최신 장부 우선
    const a = agg.get(gkey(s.session_date as string, s.game_seq ?? MAIN_GAME_SEQ)) ?? { cnt: 0, rev: 0 };
    out[s.schedule_id] = {
      date: s.session_date, closed: !!s.closed,
      buyinCount: a.cnt, revenueMan: Math.round(a.rev / WON_PER_MAN),
      hasRankings: rankedDates.has(s.session_date),
    };
  }
  return out;
}

/** 직전(가장 최근) 세션 설정 — 다음 게임 열 때 단가/게임명/딜러 등을 바로 이어쓰기 위함 */
export async function getLastLedgerSettings(venueId: string, beforeDate: string): Promise<Partial<LedgerSession> | null> {
  if (IS_MOCK) return null;
  const { data } = await supabase.from('ledger_sessions')
    .select('buyin_amount, card_amount, target_entries, title, dealers, event_memo, discounts')
    .eq('venue_id', venueId).lt('session_date', beforeDate)
    .order('session_date', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return {
    buyinAmount: data.buyin_amount ?? 0,
    cardAmount: data.card_amount ?? null,
    targetEntries: data.target_entries ?? 0,
    title: data.title ?? undefined,
    dealers: data.dealers ?? undefined,
    eventMemo: data.event_memo ?? undefined,
    discounts: Array.isArray(data.discounts) ? data.discounts as DiscountPreset[] : [],
  };
}

/** 게임 프리셋 — 과거 세션에서 게임명 기준으로 중복 제거한 최근 설정 묶음(클릭 시 자동입력용). */
export interface LedgerPreset {
  title: string;
  buyinAmount: number;
  cardAmount: number | null;
  targetEntries: number;
  dealers?: string;
  eventMemo?: string;
  discounts: DiscountPreset[];
}
export async function getLedgerPresets(venueId: string, limit = 8): Promise<LedgerPreset[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('ledger_sessions')
    .select('session_date, title, buyin_amount, card_amount, target_entries, dealers, event_memo, discounts')
    .eq('venue_id', venueId).not('title', 'is', null)
    .order('session_date', { ascending: false }).limit(50);
  const seen = new Set<string>();
  const out: LedgerPreset[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (data ?? []) as any[]) {
    const t = String(d.title ?? '').trim();
    if (!t || (d.buyin_amount ?? 0) <= 0) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: t,
      buyinAmount: d.buyin_amount ?? 0,
      cardAmount: d.card_amount ?? null,
      targetEntries: d.target_entries ?? 0,
      dealers: d.dealers ?? undefined,
      eventMemo: d.event_memo ?? undefined,
      discounts: Array.isArray(d.discounts) ? (d.discounts as DiscountPreset[]) : [],
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** PL3: 가장 최근 '마감된' 회차 — '지난 게임 그대로 열기' 1탭 프리필의 재료.
 *  세션 전체 필드 + (마감 때 동봉해 둔) 클락 설정 스냅샷을 함께 돌려준다.
 *  같은 날짜에 게임이 여럿이면 메인(game_seq 낮은 쪽)을 대표로 삼는다. */
export interface LastClosedRound { session: LedgerSession; clockConfig: ClockConfigT | null }
export async function getLastClosedRound(venueId: string, beforeDate: string): Promise<LastClosedRound | null> {
  if (IS_MOCK) return null;
  const { data } = await supabase.from('ledger_sessions')
    .select('*')
    .eq('venue_id', venueId).eq('closed', true).lt('session_date', beforeDate)
    .order('session_date', { ascending: false }).order('game_seq', { ascending: true })
    .limit(1).maybeSingle();
  if (!data) return null;
  const session = rowToSession(venueId, (data as { session_date: string }).session_date, data);
  return { session, clockConfig: session.clockSnapshot?.gameSnapshot?.clockConfig ?? null };
}

/** 세션 편집 저장(단가/게임내용/이벤트/딜러/기준엔트리). 마감/담당직원 필드는 건드리지 않음. */
export async function saveLedgerSession(s: LedgerSession): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions').upsert({
    venue_id: s.venueId, session_date: s.sessionDate, game_seq: s.gameSeq ?? MAIN_GAME_SEQ,
    buyin_amount: s.buyinAmount, card_amount: s.cardAmount,
    target_entries: s.targetEntries, title: s.title ?? null,
    game_type: s.gameType ?? 'gtd', max_entries: s.maxEntries ?? 0, is_addon: !!s.isAddon, addon_stack: s.addonStack ?? 0,
    operators: (s.operators ?? []) as unknown as object,
    event_memo: s.eventMemo ?? null, dealers: s.dealers ?? null, schedule_id: s.scheduleId ?? null,
    discounts: (s.discounts ?? []) as unknown as object,
    early_double_min: s.earlyDoubleMin ?? 0, early_single_min: s.earlySingleMin ?? 0, tournament_start: s.tournamentStart ?? null,
    voucher_issued: s.voucherIssued ?? 0,
    voucher_accrual_per_bin: s.voucherAccrualPerBin ?? 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,session_date,game_seq' });
  if (error) throw error;
}

/** 장부 입장(세션 오픈) — 담당직원/오픈시각 기록 + 편집 필드 저장. closed=false 로 리셋. */
export async function openLedgerSession(s: LedgerSession, operatorId?: string | null): Promise<void> {
  if (IS_MOCK) return;
  const user = await currentUser();
  const { error } = await supabase.from('ledger_sessions').upsert({
    venue_id: s.venueId, session_date: s.sessionDate, game_seq: s.gameSeq ?? MAIN_GAME_SEQ,
    buyin_amount: s.buyinAmount, card_amount: s.cardAmount,
    target_entries: s.targetEntries, title: s.title ?? null,
    game_type: s.gameType ?? 'gtd', max_entries: s.maxEntries ?? 0, is_addon: !!s.isAddon, addon_stack: s.addonStack ?? 0,
    operators: (s.operators ?? []) as unknown as object,
    event_memo: s.eventMemo ?? null, dealers: s.dealers ?? null, schedule_id: s.scheduleId ?? null,
    discounts: (s.discounts ?? []) as unknown as object,
    early_double_min: s.earlyDoubleMin ?? 0, early_single_min: s.earlySingleMin ?? 0, tournament_start: s.tournamentStart ?? null,
    voucher_issued: s.voucherIssued ?? 0,
    voucher_accrual_per_bin: s.voucherAccrualPerBin ?? 0,
    opened_by: operatorId ?? user?.id ?? null, opened_at: new Date().toISOString(),
    reg_closed: false, reg_closed_at: null,
    closed: false, closed_at: null, close_memo: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,session_date,game_seq' });
  if (error) throw error;
}

/** 레지(레지스트리) 마감 — 신규 등록/엔트리 중단(정산 마감과 별개) */
export async function setRegistrationClosed(venueId: string, date: string, closed: boolean, gameSeq = MAIN_GAME_SEQ): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions')
    .update({ reg_closed: closed, reg_closed_at: closed ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq);
  if (error) throw error;
}

/** 장부 정산 마감 — 읽기전용 스냅샷 + 마감 메모. PL3: 스냅샷에 gameSnapshot(클락 설정) 동봉 가능. */
export async function closeLedgerSession(venueId: string, date: string, memo: string, gameSeq = MAIN_GAME_SEQ, clockSnapshot?: LedgerCloseSnapshot | null): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_sessions')
    .update({ closed: true, closed_at: new Date().toISOString(), close_memo: memo || null, clock_snapshot: clockSnapshot ?? null, updated_at: new Date().toISOString() })
    .eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq);
  if (error) throw error;
}

/** 마감 해제(업주 전용 — 서버 RPC가 can_manage_pos 로 강제, UI 게이트와 이중) */
export async function reopenLedgerSession(venueId: string, date: string, gameSeq = MAIN_GAME_SEQ): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('reopen_ledger_session', { p_venue_id: venueId, p_date: date, p_game_seq: gameSeq });
  if (error) throw new Error(error.message);
}

/** 장부(세션) 통째 삭제 — 바인·명단·세션 일괄 제거. POS 관리 권한 필요(SECURITY DEFINER RPC). */
export async function deleteLedgerSession(venueId: string, date: string, gameSeq = MAIN_GAME_SEQ): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('delete_ledger_session', { p_venue_id: venueId, p_date: date, p_game_seq: gameSeq });
  if (error) throw error;
}

// ── 명단(roster) ──────────────────────────────────────────────────────────────
export async function getLedgerPlayers(venueId: string, date = today(), gameSeq = MAIN_GAME_SEQ): Promise<LedgerPlayer[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_players')
    .select('*').eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq)
    .order('sort_order').order('created_at');
  if (error) throw error;
  return (data ?? []).map(rowToPlayer);
}

export async function addLedgerPlayer(input: {
  venueId: string; sessionDate: string; gameSeq?: number; name: string;
  visitorType?: string | null; sortOrder?: number;
}): Promise<void> {
  if (IS_MOCK) return;
  const user = await currentUser();
  const { error } = await supabase.from('ledger_players').insert({
    venue_id: input.venueId, session_date: input.sessionDate, game_seq: input.gameSeq ?? MAIN_GAME_SEQ, name: input.name,
    visitor_type: input.visitorType ?? null, sort_order: input.sortOrder ?? 0,
    created_by: user?.id ?? null,
  });
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('이미 추가된 플레이어입니다');
    throw error;
  }
}

export async function updateLedgerPlayer(id: string, patch: {
  visitorType?: string | null; note?: string | null; sortOrder?: number; name?: string;
}): Promise<void> {
  if (IS_MOCK) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = {};
  if (patch.visitorType !== undefined) p.visitor_type = patch.visitorType;
  if (patch.note !== undefined) p.note = patch.note;
  if (patch.sortOrder !== undefined) p.sort_order = patch.sortOrder;
  if (patch.name !== undefined) p.name = patch.name;
  const { error } = await supabase.from('ledger_players').update(p).eq('id', id);
  if (error) throw error;
}

/** 플레이어 이름 변경 — 로스터와 해당 세션 바인 기록(player_name 키)을 함께 갱신(오기 수정용) */
export async function renameLedgerPlayer(input: {
  id: string; venueId: string; sessionDate: string; gameSeq?: number; oldName: string; newName: string;
}): Promise<void> {
  if (IS_MOCK) return;
  const newName = input.newName.trim();
  if (!newName || newName === input.oldName) return;
  // 원자 RPC(20260818g) — 명단+바인이 단일 트랜잭션. 예전 2단계 갱신은 중간 실패 시
  // '명단 이름 다르고 바인은 옛 이름'인 반쪽 상태를 조용히 남겼다.
  const { error } = await supabase.rpc('rename_ledger_player', { p_player_id: input.id, p_new_name: newName });
  if (error) throw new Error(error.message);
}

/** 플레이어 + 그 세션의 바인 전건을 단일 트랜잭션으로 삭제(바인 있으면 서버가 취소 비밀번호 검증) */
export async function deleteLedgerPlayerAtomic(id: string, password?: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('delete_ledger_player', { p_player_id: id, p_password: password ?? null });
  if (error) throw new Error(error.message);
}

export async function removeLedgerPlayer(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_players').delete().eq('id', id);
  if (error) throw error;
}

/** 미마감 지난 장부 — 마감을 안 하면 순위→시즌→전적 하류 전체가 막힌다(대시보드 넛지용) */
export async function listStaleOpenSessions(venueId: string): Promise<{ sessionDate: string; gameSeq: number; title: string | null }[]> {
  if (IS_MOCK) return [];
  const { data } = await supabase.from('ledger_sessions')
    .select('session_date, game_seq, title')
    .eq('venue_id', venueId).eq('closed', false).lt('session_date', kstToday())
    .order('session_date', { ascending: false }).limit(5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ sessionDate: r.session_date, gameSeq: r.game_seq ?? 1, title: r.title ?? null }));
}

// 바인 추가 시 가입계정 연동 — 이름/닉네임으로 누리홀덤 가입자 검색(실명·닉네임·이 매장 방문횟수).
export interface RegisteredPlayer { userId: string; realName: string | null; nickname: string | null; visits: number; }
export async function searchRegisteredPlayers(venueId: string, query: string): Promise<RegisteredPlayer[]> {
  if (IS_MOCK || !query.trim()) return [];
  const { data, error } = await supabase.rpc('search_registered_players', { p_venue_id: venueId, p_query: query.trim() });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ userId: r.user_id, realName: r.real_name ?? null, nickname: r.nickname ?? null, visits: Number(r.visits) || 0 }));
}

// ── 바이인(셀) ────────────────────────────────────────────────────────────────
export async function getLedgerBuyins(venueId: string, date = today(), gameSeq = MAIN_GAME_SEQ): Promise<LedgerBuyin[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_buyins')
    .select('*').eq('venue_id', venueId).eq('session_date', date).eq('game_seq', gameSeq)
    .order('player_name').order('entry_no');
  if (error) throw error;
  return (data ?? []).map(rowToBuyin);
}

/** 기간 통계용 — 날짜 범위의 세션 + 바인 일괄 조회 */
export async function getLedgerRange(venueId: string, from: string, to: string): Promise<{ sessions: LedgerSession[]; buyins: LedgerBuyin[] }> {
  if (IS_MOCK) return { sessions: [], buyins: [] };
  const [sRes, bRes] = await Promise.all([
    supabase.from('ledger_sessions').select('*').eq('venue_id', venueId).gte('session_date', from).lte('session_date', to),
    supabase.from('ledger_buyins').select('*').eq('venue_id', venueId).gte('session_date', from).lte('session_date', to),
  ]);
  // 통계는 '0원'과 '못 불러옴'이 시각적으로 같아서 특히 위험하다 — 매출이 0으로 보이면 사장님이 오판한다.
  if (sRes.error) throw sRes.error;
  if (bRes.error) throw bRes.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (sRes.data ?? []).map((d: any) => rowToSession(venueId, d.session_date, d));
  const buyins = (bRes.data ?? []).map(rowToBuyin);
  return { sessions, buyins };
}

/** 다른 기기가 같은 셀을 먼저 기록했을 때(23505) — 호출측이 안내 후 reload 하도록 식별 가능한 에러 */
export const CELL_TAKEN = 'CELL_TAKEN';

/** 셀 결제 입력/수정.
 *  신규(existingId 없음)는 INSERT — 두 직원이 같은 리바인 칸을 동시에 찍으면 늦은 쪽이
 *  조용히 덮어쓰던(=현금 1건 증발) upsert 를 버리고 충돌을 표면화한다.
 *  수정(existingId)은 id 기반 UPDATE — buyin_at·created_by 를 보존해 얼리 자동판정·
 *  감사기록·'직전과 동일' 정렬이 수정 한 번에 무너지지 않게 한다.
 *  티켓/가게지원은 항상 완납 처리(미수 불가). 반환 = 바인 id(신규 되돌리기용). */
export async function upsertBuyin(input: {
  venueId: string; sessionDate: string; gameSeq?: number; playerName: string; entryNo: number;
  paymentMethod: PaymentMethod; isUnpaid: boolean; discountIndex?: number; earlyOverride?: EarlyType | null;
  existingId?: string | null;
  /** 기록 시점 세션 단가·할인 — 전달 시 net 금액을 스냅샷으로 저장(소급 변형 차단) */
  snapshot?: { buyinAmount: number; cardAmount: number | null; discounts?: DiscountPreset[] } | null;
}): Promise<string> {
  if (IS_MOCK) return 'mock';
  const user = await currentUser();
  // 가게지원은 항상 완납. 티켓은 미수(가불) 허용.
  const unpaid = input.paymentMethod === 'support' ? false : input.isUnpaid;
  const snap = input.snapshot
    ? nonSplitSnapshot(input.paymentMethod, input.discountIndex ?? 0, input.snapshot)
    : { cash_amount: 0, card_amount: 0, transfer_amount: 0 };
  const fields = {
    payment_method: input.paymentMethod, is_unpaid: unpaid,
    is_split: false, ...snap,
    ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: input.discountIndex ?? 0,
    early_override: input.earlyOverride ?? null,
  };
  if (input.existingId) {
    const { error } = await supabase.from('ledger_buyins').update(fields).eq('id', input.existingId);
    if (error) throw error;
    return input.existingId;
  }
  const { data, error } = await supabase.from('ledger_buyins').insert({
    venue_id: input.venueId, session_date: input.sessionDate, game_seq: input.gameSeq ?? MAIN_GAME_SEQ,
    player_name: input.playerName, entry_no: input.entryNo,
    ...fields,
    created_by: user?.id ?? null, // buyin_at 은 DB default now() — 기록 시각의 단일 출처
  }).select('id').single();
  if (error) throw new Error(error.code === '23505' ? CELL_TAKEN : error.message);
  return (data as { id: string }).id;
}

/** 기존 바인의 얼리 유형만 수기 변경(자동=null) */
export async function setBuyinEarly(buyinId: string, override: EarlyType | null): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('ledger_buyins').update({ early_override: override }).eq('id', buyinId);
  if (error) throw error;
}

/** 분납/할인 상세 입력 — 현금/카드/이체 금액 + 미수금액 + 티켓장수 + 레벨할인 */
export async function upsertBuyinSplit(input: {
  venueId: string; sessionDate: string; gameSeq?: number; playerName: string; entryNo: number;
  cashAmount: number; cardAmount: number; transferAmount: number;
  ticketCount: number; unpaidAmount: number;
  /** 적용 할인 이벤트(세션 할인 프리셋 1~5, 0=없음) — 분납도 단순결제와 동일하게 기록한다 */
  discountIndex?: number;
  /** undefined=기존 값 보존(수정), 값/null=바인 시점 확정 기록(신규) */
  earlyOverride?: EarlyType | null;
  existingId?: string | null;
}): Promise<string> {
  if (IS_MOCK) return 'mock';
  const user = await currentUser();
  // 대표 결제수단(셀 표기/정렬용): 금액이 큰 수단. 전부 0이고 티켓만이면 ticket.
  const primary: PaymentMethod =
    input.ticketCount > 0 && (input.cashAmount + input.cardAmount + input.transferAmount) === 0 ? 'ticket'
    : input.cardAmount >= input.cashAmount && input.cardAmount >= input.transferAmount && input.cardAmount > 0 ? 'card'
    : input.transferAmount > input.cashAmount && input.transferAmount > 0 ? 'transfer'
    : 'cash';
  const fields = {
    payment_method: primary, is_unpaid: input.unpaidAmount > 0,
    is_split: true,
    cash_amount: input.cashAmount, card_amount: input.cardAmount, transfer_amount: input.transferAmount,
    // ⚠ 과거엔 discount_index를 0으로 덮어써 분납 시 할인 이벤트 기록이 사라졌다(정산·통계 누락).
    ticket_count: input.ticketCount, unpaid_amount: input.unpaidAmount, discount_level: 0, discount_index: input.discountIndex ?? 0,
    ...(input.earlyOverride !== undefined ? { early_override: input.earlyOverride } : {}),
  };
  if (input.existingId) {
    const { error } = await supabase.from('ledger_buyins').update(fields).eq('id', input.existingId);
    if (error) throw error;
    return input.existingId;
  }
  const { data, error } = await supabase.from('ledger_buyins').insert({
    venue_id: input.venueId, session_date: input.sessionDate, game_seq: input.gameSeq ?? MAIN_GAME_SEQ,
    player_name: input.playerName, entry_no: input.entryNo,
    ...fields,
    created_by: user?.id ?? null,
  }).select('id').single();
  if (error) throw new Error(error.code === '23505' ? CELL_TAKEN : error.message);
  return (data as { id: string }).id;
}

/** 본인이 '방금(90초)' 기록한 바인 되돌리기 — 비밀번호 불요(서버가 created_by·시각 검증) */
export async function cancelMyRecentBuyin(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('cancel_my_recent_buyin', { p_id: id });
  if (error) throw new Error(error.message);
}

/** 바이인 취소(삭제) — 업주 설정 비밀번호 필요 */
export async function cancelBuyin(id: string, password: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('cancel_ledger_buyin', { p_id: id, p_password: password });
  if (error) throw error;
}

// ── 실시간 동기화 (바이인 + 명단) ─────────────────────────────────────────────
export function subscribeLedger(venueId: string, onChange: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase
    .channel(`ledger:${venueId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ledger_buyins', filter: `venue_id=eq.${venueId}` },
      () => onChange())
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ledger_players', filter: `venue_id=eq.${venueId}` },
      () => onChange())
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'ledger_sessions', filter: `venue_id=eq.${venueId}` },
      () => onChange())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ── 손님 자가 바인(참가) 요청 — QR(?buyin=<venueId>) ───────────────────────────
export interface BuyinRequest {
  id: string; venueId: string; sessionDate: string; playerName: string;
  userId: string | null; note: string | null; status: 'pending' | 'approved' | 'rejected'; createdAt: string;
  requestedGameSeq: number | null;
  /** 이용권 사용 요청이면 원본 이용권 id — 서버가 티켓 바인을 자동 기록하므로 💵 패널은 숨긴다 */
  voucherId: string | null;
}
/** 손님 QR 진입 URL — venue_id만(비민감). 로그인 회원만 요청 가능. */
export function buyinRequestUrl(venueId: string, gameSeq?: number): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nuriholdem.com';
  return `${origin}/?buyin=${venueId}${gameSeq ? `&game=${gameSeq}` : ''}`;
}
/**
 * 손님: 오늘 이 매장 참가(바인) 요청 — 성공 시 매장명 반환. gameSeq=원하는 게임(선택).
 * expectedDate: 화면이 '이 날짜로 요청한다'고 믿은 날(YYYY-MM-DD). 서버가 KST 오늘과 대조해 다르면 거절한다.
 * 왜: 요청은 서버가 정한 KST '오늘' 장부로만 들어간다. 다른 날짜 포스터에서 눌린 요청이 오늘 장부를
 *     오염시키는 사고를 프런트 게이트 하나에만 맡기지 않기 위한 2중 방어(캐시된 구버전·공유된 QR 대비).
 *     현장 QR 경로는 언제나 '오늘'이라 넘기지 않는다 — 미지정이면 서버가 검사를 생략한다.
 */
export async function requestBuyin(venueId: string, gameSeq?: number | null, note?: string, expectedDate?: string): Promise<string> {
  if (IS_MOCK) return '데모 매장';
  const { data, error } = await supabase.rpc('request_buyin', { p_venue_id: venueId, p_note: note ?? null, p_game_seq: gameSeq ?? null, p_expected_date: expectedDate ?? null });
  if (error) throw new Error(error.message);
  return (data as string) ?? '';
}
/** 손님: 오늘 그 매장의 게임 목록(메인/사이드) — QR 요청 시 게임 선택용(공개 RPC). */
export async function venueTodayGames(venueId: string): Promise<{ gameSeq: number; title: string }[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('venue_today_games', { p_venue_id: venueId });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ gameSeq: r.game_seq, title: r.title }));
}
export interface MyBuyinRequest { id: string; venueId: string; venueName: string; status: 'pending' | 'approved' | 'rejected'; requestedGameSeq: number | null; gameSeq: number | null; rejectReason: string | null; }
/** 손님: 오늘 내가 보낸 바인 요청(매장명·상태) — 홈 배너용(RLS 본인 select). */
export async function getMyBuyinRequestsToday(): Promise<MyBuyinRequest[]> {
  if (IS_MOCK) return [];
  const u = await currentUser();
  if (!u) return [];
  const today = new Date().toLocaleDateString('en-CA');
  const { data, error } = await supabase.from('ledger_buyin_requests')
    .select('id, venue_id, status, requested_game_seq, game_seq, resolve_note, venues(name)')
    .eq('user_id', u.id).eq('session_date', today).order('created_at', { ascending: false });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, venueId: r.venue_id, venueName: r.venues?.name ?? '매장', status: r.status, requestedGameSeq: r.requested_game_seq ?? null, gameSeq: r.game_seq ?? null, rejectReason: r.resolve_note ?? null }));
}
/** 운영자: 그날 대기중(pending) 바인 요청 목록. */
export async function getPendingBuyinRequests(venueId: string, date: string): Promise<BuyinRequest[]> {
  if (IS_MOCK) return [];
  // 자정을 넘긴 운영: 서버는 요청을 영업일에 귀속시키지만(20260818f), 혹시 남은 교차 날짜
  // 요청도 어제 보드에서 보이도록 '보드 날짜 + KST 오늘' 두 날짜를 함께 조회한다.
  const dates = Array.from(new Set([date, kstToday()]));
  const { data, error } = await supabase.from('ledger_buyin_requests')
    .select('*').eq('venue_id', venueId).in('session_date', dates).eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, venueId: r.venue_id, sessionDate: r.session_date, playerName: r.player_name, userId: r.user_id, note: r.note ?? null, status: r.status, createdAt: r.created_at, requestedGameSeq: r.requested_game_seq ?? null, voucherId: r.voucher_id ?? null }));
}
/** 운영자: 요청 승인 → 해당 게임(gameSeq) 명단에 추가 + 요청 approved. */
export async function approveBuyinRequest(id: string, gameSeq = MAIN_GAME_SEQ, recordBuyin = false, payMethod: 'cash' | 'card' | 'transfer' = 'cash', split?: { cash: number; card: number; transfer: number }): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('approve_buyin_request', { p_request_id: id, p_game_seq: gameSeq, p_record_buyin: recordBuyin, p_pay_method: payMethod, p_split: !!split, p_cash: split?.cash ?? 0, p_card: split?.card ?? 0, p_transfer: split?.transfer ?? 0 });
  if (error) throw new Error(error.message);
}
/** 운영자: 요청 거절. */
export async function rejectBuyinRequest(id: string, reason?: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('reject_buyin_request', { p_request_id: id, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
}
/** 손님: 본인 대기 요청 취소. */
export async function cancelBuyinRequest(id: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('cancel_buyin_request', { p_request_id: id });
  if (error) throw new Error(error.message);
}
/** 운영자: 바인요청 운영지표(기간) — 요청수·승인율·평균 대기(분). */
export interface BuyinReqStats { total: number; approved: number; rejected: number; pending: number; approveRate: number; avgWaitMin: number | null; }
export async function getBuyinRequestStats(venueId: string, from: string, to: string): Promise<BuyinReqStats> {
  const empty: BuyinReqStats = { total: 0, approved: 0, rejected: 0, pending: 0, approveRate: 0, avgWaitMin: null };
  if (IS_MOCK) return empty;
  const { data, error } = await supabase.from('ledger_buyin_requests')
    .select('status, created_at, resolved_at').eq('venue_id', venueId).gte('session_date', from).lte('session_date', to);
  if (error || !data) return empty;
  let approved = 0, rejected = 0, pending = 0, waitSum = 0, waitN = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of data as any[]) {
    if (r.status === 'approved') approved++; else if (r.status === 'rejected') rejected++; else pending++;
    if (r.status === 'approved' && r.resolved_at && r.created_at) { waitSum += new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime(); waitN++; }
  }
  const resolved = approved + rejected;
  return { total: data.length, approved, rejected, pending, approveRate: resolved ? Math.round((approved / resolved) * 100) : 0, avgWaitMin: waitN ? Math.round(waitSum / waitN / 60000) : null };
}
/** 바인 요청 실시간 구독(매장별). */
export function subscribeBuyinRequests(venueId: string, cb: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`buyin_req:${venueId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_buyin_requests', filter: `venue_id=eq.${venueId}` }, () => cb())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
/** 손님 본인 바인요청 실시간 구독 — 운영자 승인/거절 즉시 반영(홈 배너). */
export function subscribeMyBuyinRequests(userId: string, cb: () => void): () => void {
  if (IS_MOCK) return () => {};
  const ch = supabase.channel(`my_buyin_req:${userId}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_buyin_requests', filter: `user_id=eq.${userId}` }, () => cb())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ── 취소 비밀번호 ─────────────────────────────────────────────────────────────
export async function posHasPassword(venueId: string): Promise<boolean> {
  if (IS_MOCK) return false;
  const { data } = await supabase.rpc('pos_has_password', { p_venue_id: venueId });
  return !!data;
}
export async function setPosCancelPassword(venueId: string, password: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_pos_cancel_password', { p_venue_id: venueId, p_password: password });
  if (error) throw error;
}

// ── 직원 장부 권한 ────────────────────────────────────────────────────────────
export async function getLedgerAccessUserIds(venueId: string): Promise<string[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.from('ledger_access').select('user_id').eq('venue_id', venueId);
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.user_id);
}
export async function grantLedgerAccess(venueId: string, userId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('grant_ledger_access', { p_venue_id: venueId, p_user_id: userId });
  if (error) throw error;
}
export async function revokeLedgerAccess(venueId: string, userId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('revoke_ledger_access', { p_venue_id: venueId, p_user_id: userId });
  if (error) throw error;
}
