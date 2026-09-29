// src/lib/ledgerSettlement.ts — 하루치 정산 리포트를 **한 곳에서** 계산한다.
//
// 오너 2026-09-08: "5번 정산을 누르면 그날 정산이 나와야 … 신규손님, 기존손님, 바인을 많이한 손님,
//   머니인을 한 순위, 미수, 총 매출, 기준엔트리 대비 매출 및 손익 등등 필요한 모든 것".
//
// ── 왜 컴포넌트 밖인가 ──────────────────────────────────────────────────────
// 이 숫자는 업주가 돈을 맞출 때 보는 숫자다. 화면 없이 검증할 수 있어야 하고,
// **장부 화면과 한 글자도 갈리면 안 된다** — 그래서 금액 계산은 전부 buyinFinance 로만 한다.
// (예전에 CRM 이 '단가 × 건수'로 따로 합산했다가 통계와 갈린 적이 있다 — ledger.ts 주석 F04.)
//
// ── 하루 = 게임 여러 개 ─────────────────────────────────────────────────────
// 한 날짜에 메인(1)·사이드(2,3…) 장부가 여럿이다. '그날 정산'은 그 전부의 합이고,
// 게임별 내역도 함께 낸다 — 합계만 주면 어느 게임이 적자인지 알 수 없다.
//
// ── 손익을 어디까지 말하는가 ────────────────────────────────────────────────
// 상금·인건비·임대료는 장부에 없다. 그래서 여기서 말하는 '손익'은 **기준 엔트리 대비**다:
//   기준 매출 = 기준 엔트리 × 현금 단가,  차액 = 완납 매출 − 기준 매출.
// 이걸 순이익이라 부르지 않는다 — 없는 비용을 아는 척하면 그 숫자로 오판한다.
import {
  addonFinance, buyinFinance, discountSummary, isBuyinExcluded, ledgerCounts, ZERO_TENDER,
  type AddonFinance, type LedgerBuyin, type LedgerPlayer, type LedgerSession, type Tender, type DiscountSummary,
} from '../api/ledger';

/** 손님 한 명 줄 — 순위 세 개(바인 수 · 머니인 · 미수)가 같은 행을 공유한다. */
export interface SettlePlayer {
  name: string;
  /** 방문자 유형 코드(신규/기존/관계자/기타 또는 직접입력). 명단에 없으면 null */
  visitorType: string | null;
  /** 바인 건수(정산 제외 행 포함하지 않는다 — 정산 화면이므로 정산 기준으로 센다) */
  buyins: number;
  /** 머니인 — 이 손님이 게임에 넣은 **가치**(티켓·지원 포함). 현금과 다르다. */
  moneyIn: number;
  /** 실제 수납된 현금성 금액 */
  paid: number;
  /** 아직 못 받은 금액 */
  unpaid: number;
}

export interface VisitorBreakdown {
  /** 저장값(코드 또는 직접입력 텍스트). 명단에 유형이 없으면 '' */
  key: string;
  people: number;
  buyins: number;
  moneyIn: number;
}

export interface GameSettlement {
  gameSeq: number;
  title: string;
  closed: boolean;
  /** 완납 매출 = **현금성 수납**(현금 + 카드 + 이체). 이용권·매장지원·미수는 여기 없다.
   *  '수납 완료 가치' 는 revenue + ticketWon 이다 — 이용권은 바인 가치는 같지만 현금성 매출이 아니다. */
  revenue: number;
  unpaid: number;
  /** 회수 이용권(원 환산). 1T = 1만원 — 바인 가치는 현금과 같지만 **현금성 수납과는 별도 항목**이다. */
  ticketWon: number;
  /** 가게지원 **건수**(원이 아니다). 지원 금액은 tender.support 에 있다. */
  support: number;
  /** 총 정상가(원) — 할인 전 */
  gross: number;
  /** 할인 합계(원) */
  disc: number;
  /** 할인 적용 후 총 바인 가치(원) = gross − disc = 수납완료 + 미수 + 매장지원 */
  value: number;
  /**
   * **엔트리 — 금액 기준 기여도의 합.** 소수가 될 수 있다(오너 규칙 2026-09-11).
   * 10만 게임에 5만 할인 손님 1명 = **0.5 엔트리**. `기준 엔트리(GTD 목표)` 대비 달성률의 분자가 이 값이다.
   * 항등식: `entries × 세션 현금단가 === value`(정상 기록 기준).
   * ⚠ 횟수가 아니다 — 횟수는 {@link GameSettlement.buyinCount} 다.
   */
  entries: number;
  /** 고유 플레이어 수 */
  players: number;
  /** 그 게임에서 처음 앉은 횟수(= 그 게임의 고유 플레이어 수). ledgerCounts 가 센다. */
  firstBuyins: number;
  /** 리바인 횟수 = buyinCount − firstBuyins */
  rebuys: number;
  /** **총 바이인 횟수** — 정산에 들어간 유효 기록 수. 언제나 정수. 할인·결제수단·미수와 무관. */
  buyinCount: number;
  tender: Tender;
  discount: DiscountSummary;
  /** 기준 엔트리(세션 설정). 0 이면 미설정 — 화면이 '대비'를 말하지 않는다. */
  targetEntries: number;
  /** 기준 매출 = 기준 엔트리 × 현금 단가. targetEntries 가 0 이면 0. */
  targetRevenue: number;
  /** 정산에서 빠진 것 — 무엇이 빠졌는지 밝히지 않으면 합계가 거짓말이 된다.
   *  count 는 **횟수**, entries 는 **금액 엔트리**(소수 가능)다. */
  removed: { count: number; entries: number; value: number; revenue: number };
  /** 애드온(2026-09-28) — 바인과 **따로** 센다. revenue·unpaid·value·entries·buyinCount 어디에도 섞이지 않는다.
   *  화면이 '완납 매출' 을 말할 때는 revenue + addon.revenue, '미수금' 은 unpaid + addon.unpaid 다. */
  addon: AddonFinance;
}

export interface SettlementReport {
  date: string;
  games: GameSettlement[];
  /** 그날 전체 합계 */
  total: Omit<GameSettlement, 'gameSeq' | 'title' | 'closed'>;
  /** 참여 인원(이름 기준, 게임 사이 중복 제거) */
  people: number;
  players: SettlePlayer[];
  visitors: VisitorBreakdown[];
  newPeople: number;
  regularPeople: number;
  /** 바인을 많이 한 손님 — 건수 내림차순 */
  topByBuyins: SettlePlayer[];
  /** 머니인 순위 — 넣은 가치 내림차순 */
  topByMoneyIn: SettlePlayer[];
  /** 미수가 남은 손님 — 금액 내림차순 */
  unpaidPlayers: SettlePlayer[];
  /** 아직 안 닫힌 게임이 하나라도 있는가 */
  allClosed: boolean;
}

const zeroGame = (): Omit<GameSettlement, 'gameSeq' | 'title' | 'closed'> => ({
  revenue: 0, unpaid: 0, ticketWon: 0, support: 0, gross: 0, disc: 0, value: 0,
  entries: 0, players: 0, firstBuyins: 0, rebuys: 0, buyinCount: 0,
  tender: { ...ZERO_TENDER },
  discount: { count: 0, total: 0, cashTotal: 0, entryLoss: 0 },
  targetEntries: 0, targetRevenue: 0,
  removed: { count: 0, entries: 0, value: 0, revenue: 0 },
  addon: { count: 0, revenue: 0, unpaid: 0, ticketWon: 0, tender: { ...ZERO_TENDER } },
});

/**
 * #9(오너 결정 2026-09-29) — 정산 '받은 방법' 대차표는 **바인 + 애드온 한 벌**이다.
 *
 * 오너 결정은 "'매장이용권' 타일 값에 애드온 포함" 이다. 그 타일 하나만 애드온을 더하면 대차가 깨진다(critical 확인):
 *   · 같은 '수납 완료' 줄의 현금·카드·이체 타일은 바인만이라, 타일 넷의 합 ≠ 아래 '수납 완료' 행(애드온 이용권만큼 차이).
 *   · 아래 '애드온 이용권' 타일에 같은 돈이 한 번 더 보여 두 곳을 더하면 이중 계상이 된다.
 * 그래서 대차표 전체(수단 타일·미수·총 정상가·적용 후·수납 완료·현금성)를 같은 모집단(바인 + 애드온)으로 옮기고,
 * 애드온 칸은 '그중 애드온'(부분집합)으로 읽게 한다. 맨 위 KPI(완납 매출·미수금)는 이미 바인 + 애드온이다.
 *
 * 항등식(애드온은 할인이 없다 → 정상가 = 받은/받을 돈):
 *   gross − disc = value = cash + card + transfer + ticket + support + unpaid,  received = cash + card + transfer + ticket
 * ⚠ 엔트리·바인 횟수·기준 대비(entries·buyinCount·targetRevenue)에는 여전히 섞지 않는다 — 여기는 돈의 대차표만이다.
 */
export interface SettlementReceipt { tender: Tender; gross: number; value: number; received: number; cashlike: number; addonTotal: number }
export function settlementReceipt(t: Pick<GameSettlement, 'tender' | 'gross' | 'value' | 'revenue' | 'ticketWon' | 'addon'>): SettlementReceipt {
  const a = t.addon;
  const addonTotal = a.revenue + a.unpaid + a.ticketWon;
  const tender: Tender = { ...t.tender };
  for (const k of Object.keys(tender) as (keyof Tender)[]) tender[k] += a.tender[k] ?? 0;
  return {
    tender, addonTotal,
    gross: t.gross + addonTotal,
    value: t.value + addonTotal,
    received: t.revenue + t.ticketWon + a.revenue + a.ticketWon,
    cashlike: t.revenue + a.revenue,
  };
}

function addAddon(into: AddonFinance, a: AddonFinance): void {
  into.count += a.count; into.revenue += a.revenue; into.unpaid += a.unpaid; into.ticketWon += a.ticketWon;
  for (const k of Object.keys(into.tender) as (keyof Tender)[]) into.tender[k] += a.tender[k];
}

/**
 * 하루치 정산 리포트.
 *
 * @param sessions 그 날짜의 장부 세션들(게임별)
 * @param buyins   그 날짜의 바인 전부(게임 섞여 있어도 된다 — gameSeq 로 가른다)
 * @param players  그 날짜의 명단 전부(게임 섞여 있어도 된다)
 * @param excludedBy 게임별 정산 제외 키 집합(`visitor:*` · `method:*`). 없으면 제외 없음.
 */
export function settlementReport(
  date: string,
  sessions: LedgerSession[],
  buyins: LedgerBuyin[],
  players: LedgerPlayer[],
  excludedBy: (gameSeq: number) => ReadonlySet<string> = () => new Set<string>(),
): SettlementReport {
  const daySessions = sessions.filter((s) => s.sessionDate === date).sort((a, b) => a.gameSeq - b.gameSeq);
  const dayBuyins = buyins.filter((b) => b.sessionDate === date);
  const dayPlayers = players.filter((p) => p.sessionDate === date);

  // 이름 → 방문자 유형. 같은 이름이 여러 게임 명단에 있으면 **먼저 정해진 유형**을 쓴다
  // (게임마다 유형이 다를 이유가 없고, 다르면 하루 집계에서 사람이 둘로 갈린다).
  const visitorOf = new Map<string, string | null>();
  for (const p of dayPlayers) if (!visitorOf.has(p.name)) visitorOf.set(p.name, p.visitorType ?? null);

  const byName = new Map<string, SettlePlayer>();
  const games: GameSettlement[] = [];
  const total = zeroGame();
  /** 하루 전체에서 정산에 남은 바인 — total.players 는 게임별 합이 아니라 **하루 단위 고유 인원**이다
   *  (한 사람이 메인·사이드 둘 다 치면 게임별로는 1+1 이지만 하루로는 1명이다). */
  const keptAll: LedgerBuyin[] = [];

  for (const s of daySessions) {
    const ex = excludedBy(s.gameSeq);
    const mine = dayBuyins.filter((b) => b.gameSeq === s.gameSeq);
    const g: GameSettlement = {
      ...zeroGame(),
      gameSeq: s.gameSeq,
      title: (s.title ?? '').trim() || (s.gameSeq === 1 ? '메인' : `사이드 ${s.gameSeq - 1}`),
      closed: s.closed,
      targetEntries: s.targetEntries || 0,
      targetRevenue: (s.targetEntries || 0) * s.buyinAmount,
    };
    const kept: LedgerBuyin[] = [];
    for (const b of mine) {
      const f = buyinFinance(b, s);
      if (isBuyinExcluded(b, ex, (n) => visitorOf.get(n))) {
        g.removed.count += 1; g.removed.entries += f.entry; g.removed.value += f.value; g.removed.revenue += f.paid;
        continue;
      }
      kept.push(b);
      keptAll.push(b);
      g.buyinCount += 1;
      g.entries += f.entry;      // 금액 엔트리(소수 가능) — 횟수는 바로 위 buyinCount 가 센다
      g.revenue += f.paid;
      g.unpaid += f.unpaid;
      g.ticketWon += f.tender.ticket;
      g.support += f.support;
      g.gross += f.gross;
      g.disc += f.disc;
      g.value += f.value;
      g.tender.cash += f.tender.cash; g.tender.card += f.tender.card; g.tender.transfer += f.tender.transfer;
      g.tender.ticket += f.tender.ticket; g.tender.support += f.tender.support; g.tender.unpaid += f.tender.unpaid;
      const a = addonFinance(b);
      addAddon(g.addon, a);

      const cur = byName.get(b.playerName) ?? {
        name: b.playerName, visitorType: visitorOf.get(b.playerName) ?? null,
        buyins: 0, moneyIn: 0, paid: 0, unpaid: 0,
      };
      // 손님 줄은 애드온까지 합친다 — 미수자 명단에서 애드온 미수가 빠지면 못 받는다. 바인 횟수(buyins)는 그대로.
      cur.buyins += 1; cur.moneyIn += f.value + a.revenue + a.unpaid + a.ticketWon;
      cur.paid += f.paid + a.revenue; cur.unpaid += f.unpaid + a.unpaid;
      byName.set(b.playerName, cur);
    }
    g.discount = discountSummary(kept, s);
    // 이 리포트 안의 횟수는 전부 ledgerCounts 로만 센다.
    // ⚠ 클락(deriveClockCounts)은 같은 함수를 쓰지만 **수기 보정(adjEntries)·정산 제외 미적용** 때문에
    //   숫자가 다를 수 있다. 그건 정의 차이지 버그가 아니다.
    const cnt = ledgerCounts(kept);
    g.players = cnt.players; g.firstBuyins = cnt.firstBuyins; g.rebuys = cnt.rebuys;
    games.push(g);

    total.revenue += g.revenue; total.unpaid += g.unpaid; total.ticketWon += g.ticketWon;
    total.support += g.support; total.value += g.value; total.entries += g.entries;
    total.gross += g.gross; total.disc += g.disc;
    total.firstBuyins += g.firstBuyins; total.rebuys += g.rebuys;
    total.buyinCount += g.buyinCount;
    total.targetEntries += g.targetEntries; total.targetRevenue += g.targetRevenue;
    total.tender.cash += g.tender.cash; total.tender.card += g.tender.card; total.tender.transfer += g.tender.transfer;
    total.tender.ticket += g.tender.ticket; total.tender.support += g.tender.support; total.tender.unpaid += g.tender.unpaid;
    total.discount.count += g.discount.count; total.discount.total += g.discount.total;
    total.discount.cashTotal += g.discount.cashTotal;
    total.removed.count += g.removed.count; total.removed.entries += g.removed.entries;
    total.removed.value += g.removed.value; total.removed.revenue += g.removed.revenue;
    addAddon(total.addon, g.addon);
  }

  total.players = ledgerCounts(keptAll).players;

  // 명단에만 있고 바인이 없는 손님도 '온 사람'이다 — 인원에는 넣되 금액은 0 이다.
  for (const p of dayPlayers) {
    if (byName.has(p.name)) continue;
    byName.set(p.name, { name: p.name, visitorType: p.visitorType ?? null, buyins: 0, moneyIn: 0, paid: 0, unpaid: 0 });
  }

  const list = [...byName.values()];
  const vmap = new Map<string, VisitorBreakdown>();
  for (const p of list) {
    const key = p.visitorType ?? '';
    const cur = vmap.get(key) ?? { key, people: 0, buyins: 0, moneyIn: 0 };
    cur.people += 1; cur.buyins += p.buyins; cur.moneyIn += p.moneyIn;
    vmap.set(key, cur);
  }

  // 정렬은 값 → 이름 순. 이름을 2차 키로 두지 않으면 같은 값에서 순서가 매번 바뀐다.
  const by = <K extends keyof SettlePlayer>(k: K) => (a: SettlePlayer, b: SettlePlayer) =>
    (Number(b[k]) - Number(a[k])) || a.name.localeCompare(b.name, 'ko');

  return {
    date,
    games,
    total,
    people: list.length,
    players: list.sort(by('moneyIn')),
    visitors: [...vmap.values()].sort((a, b) => b.people - a.people || a.key.localeCompare(b.key, 'ko')),
    newPeople: vmap.get('new')?.people ?? 0,
    regularPeople: vmap.get('regular')?.people ?? 0,
    topByBuyins: list.filter((p) => p.buyins > 0).sort(by('buyins')),
    topByMoneyIn: list.filter((p) => p.moneyIn > 0).sort(by('moneyIn')),
    unpaidPlayers: list.filter((p) => p.unpaid > 0).sort(by('unpaid')),
    allClosed: games.length > 0 && games.every((g) => g.closed),
  };
}
