// src/lib/spot.ts — NURI SPOT 의 구조화된 스팟 데이터 (2026-09-11 오너 지시)
//
// ── 왜 새 타입이 필요했나 ────────────────────────────────────────────────────
// 기존 ReplayData(src/lib/hand.ts)는 **재생용**이다: 카드·보드 + 스트리트별 자유문자 한 줄.
//   { pre: 'BTN 2.5bb 오픈, BB 콜' } 같은 문자열은 사람이 읽을 수는 있어도
//   누가 · 무엇을 · 얼마나 했는지 기계가 알 수 없다. 그래서 지금까지 분석은
//   '내 카드 2장 + 보드' 만 보고 판단했고, 포지션·스택·액션은 통째로 유실됐다.
//
// 여기서 정의하는 SpotReview 는 **분석 가능한 최소 구조**다.
//   · 액션은 순서를 보존한 배열 — 누가(actor) 무엇을(type) 얼마나(sizeBb)
//   · 모든 금액은 BB 단위 하나로 통일 — 원·만원·칩이 섞이지 않는다
//   · 결정 지점(street + heroAction)이 명시된다 — '무엇을 평가할 것인가'가 데이터에 있다
//
// ⚠ 이 파일은 **포커 게임 엔진이 아니다.** 합법성 검증은 분석에 필요한 최소한까지만 한다
//   (중복 카드·보드 장수·음수/NaN·스택 초과·포지션 누락). 베팅 라운드 완결성이나
//   사이드팟 계산은 하지 않는다 — 그건 이 기능이 하려는 일이 아니다.
import { canonicalizeHand } from '../components/features/gto/useGtoCalculator';
import { RANKS, SUITS, type Rank, type Suit } from '../components/features/gto/gto.types';
import type { ReplayData } from './hand';

// ── 도메인 ────────────────────────────────────────────────────────────────────

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river'];

/** 스트리트별 보드 장수 — 검증의 단일 소스 */
export const BOARD_LEN: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

/** 포지션 이름. 9인까지는 뒤(BTN·블라인드)를 남기고 앞자리부터 빠진다(positionsFor). 10인은 UTG+2 가 낀다. */
export type SpotPosition = 'UTG' | 'UTG1' | 'UTG2' | 'MP' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
const POSITION_ORDER: readonly SpotPosition[] = ['UTG', 'UTG1', 'UTG2', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const MAX_TABLE = 10;
/** 저장값·스냅샷의 자리 문자열 검증 — 목록에 없는 문자열은 자리가 아니다. */
export const isPosition = (p: unknown): p is SpotPosition =>
  typeof p === 'string' && (POSITION_ORDER as readonly string[]).includes(p);

/**
 * 테이블 인원 → 실제로 존재하는 포지션.
 * 9인 이하는 9인 순서(UTG…BB)에서 **뒤를 남기고 앞을 자른다** — 그래서 이름이 같은 자리는 인원과 무관하게
 * 뒤에 남은 사람 수가 같고, 차트 매칭이 그 성질에 기댄다. 10인은 UTG1 과 MP 사이에 'UTG2' 가 **끼어든다**
 * (관례: UTG·UTG+1·UTG+2·MP…). 배열 끝에 붙이면 UTG2 가 BB 뒤로 가고, 9인 순서에 끼워 두면 꼬리 슬라이스가
 * 9인 이하를 전부 어긋나게 하므로 10인일 때만 포함한다.
 */
export function positionsFor(tableSize: number): SpotPosition[] {
  const n = Math.max(2, Math.min(MAX_TABLE, Math.round(tableSize)));
  return POSITION_ORDER.filter((p) => n === MAX_TABLE || p !== 'UTG2').slice(-n);
}

export type SpotActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';
export const ACTION_TYPES: readonly SpotActionType[] = ['fold', 'check', 'call', 'bet', 'raise'];
/** 금액이 따라붙는 액션 — check/fold 에 sizeBb 가 오면 입력 오류다. */
const SIZED: ReadonlySet<SpotActionType> = new Set<SpotActionType>(['call', 'bet', 'raise']);

export type SpotActor = 'hero' | 'villain';

/**
 * 빌런 B~E — `villainPos`/`villain`(빌런 A) 뒤에 붙는 상대. 카드는 0~2장, 모르면 빈 배열.
 * ⚠ 와이어(toJSON)에서는 카드가 이 객체 안에 실리지 **않는다** — `villain` 키 안에 A..E 순서로 들어간다.
 *   서버(`share_spot_post`, 20260911d:190)가 **최상위 `villain` 키만** 가리므로, 다른 키에 카드를 두면
 *   공유 글에 상대 카드가 그대로 공개된다(hidden_villain 설계 무력화). spot.test.ts 의 스포일러 계약이 이걸 잠근다.
 */
export interface SpotVillain { pos: SpotPosition; cards: string[] }
/** 빌런 A + 최대 4명 = 5명(오너 지시 2026-09-19 "빌런 A~E") */
export const MAX_EXTRA_VILLAINS = 4;
export const EXTRA_LETTERS = ['B', 'C', 'D', 'E'] as const;

export interface SpotAction {
  street: Street;
  actor: SpotActor;
  /** 빌런 B~E 의 액션이면 그 자리. 없으면 actor 의 기본 자리(hero→heroPos, villain→villainPos = 빌런 A). */
  pos?: SpotPosition;
  type: SpotActionType;
  /** 이 액션으로 **이번 스트리트에 추가로 넣은** 칩(BB). check/fold 는 없음. */
  sizeBb?: number;
}

export interface SpotResult {
  /** 히어로가 팟을 가져갔는가. 의사결정 품질과는 **별개**로 기록만 한다. */
  won: boolean;
  /** 손익(BB). 선택. */
  deltaBb?: number;
}

/** 구조화된 한 판. 저장·공유·분석의 단일 소스. */
export interface SpotReview {
  /**
   * 스키마 버전 — 늘어나면 마이그레이션 지점은 fromJSON 하나다.
   *  v1 (2026-09-11) anteBb = 1인당 앤티, potBb 가 인원을 곱했다
   *  v2 (2026-09-14) anteBb = BB앤티 총액. v1 값은 fromJSON 이 `× tableSize` 로 올린다(팟 동일)
   *  v3 (2026-09-19) 빌런 B~E(`extra`). 와이어는 자리를 `extraPos`, 카드를 `villain` 키 안 string[][] 로 싣는다.
   *     v2 이하의 `villain`(평면 string[]) 은 빌런 A 카드로 그대로 읽힌다.
   */
  v: 3;
  game: 'nlhe';
  format: 'mtt' | 'cash';
  tableSize: number;        // 2~10
  /** 스몰블라인드(BB 단위). 보통 0.5 */
  sbBb: number;
  /**
   * BB 앤티(BB 단위) — **한 명(BB)이 대표로 내는 총액**이지 1인당 금액이 아니다. 없으면 0.
   * ⚠ 2026-09-14 오너 확정으로 의미가 바뀌었다(v1 은 '1인당'). 옛 값은 fromJSON 의 v1→v2 변환이 받는다.
   */
  anteBb: number;
  /** 유효 스택(BB) — 둘 중 짧은 쪽 */
  effectiveBb: number;
  heroPos: SpotPosition;
  /** 빌런 A 의 자리 */
  villainPos: SpotPosition;
  /** 'As' 형식. 0~2장 */
  hero: string[];
  /** 빌런 A 카드. 선택 — 모르면 빈 배열. 공유 시 기본 비공개 */
  villain: string[];
  /** 빌런 B~E (0~4명). 카드가 없는 상대는 승률에서 무작위 핸드로 계산된다. 공유 시 카드는 기본 비공개 */
  extra: SpotVillain[];
  /** 0~5장. street 와 장수가 맞아야 한다 */
  board: string[];
  /** 분석할 결정 지점의 스트리트 */
  street: Street;
  /** 결정 지점까지의 액션. 순서 보존 */
  actions: SpotAction[];
  /** 사용자가 실제로 고른 액션. 없으면 아직 미선택 */
  heroAction: SpotActionType | null;
  heroActionSizeBb?: number;
  /** 사용자가 적은 팟(BB). 계산값과 다르면 **덮어쓰지 않고** 차이를 안내한다 */
  potBbInput?: number;
  /** 사용자 메모 */
  note?: string;
  /** 결과 — 선택이고 기본 비공개 */
  result?: SpotResult;
}

// ── 카드 ──────────────────────────────────────────────────────────────────────

const RANK_SET: ReadonlySet<string> = new Set(RANKS);
const SUIT_SET: ReadonlySet<string> = new Set(SUITS);

/** 'As' 형식인가(52장 안인가). gto.types 의 RANKS/SUITS 가 단일 소스. */
export function isCardCode(code: unknown): code is string {
  return typeof code === 'string' && code.length === 2
    && RANK_SET.has(code[0]) && SUIT_SET.has(code[1]);
}

const rankIdx = (r: string) => RANKS.indexOf(r as Rank);
/** 카드 정렬 — 랭크 내림차순, 같으면 무늬 순. 키 안정성을 위한 것이지 표시 순서가 아니다. */
const byCard = (a: string, b: string) =>
  rankIdx(a[0]) - rankIdx(b[0]) || SUITS.indexOf(a[1] as Suit) - SUITS.indexOf(b[1] as Suit);

/** 히어로 2장 → 표준 콤보 id('AKs' · 'TT' · '72o'). 2장이 아니면 null. */
export function heroComboId(hero: readonly string[]): string | null {
  if (hero.length !== 2 || !hero.every(isCardCode)) return null;
  const [a, b] = hero;
  const suited = a[1] === b[1] ? 'suited' : 'offsuit';
  return canonicalizeHand([a[0] as Rank, b[0] as Rank], suited)?.id ?? null;
}

// ── 검증 ──────────────────────────────────────────────────────────────────────

export interface SpotIssue {
  /** 화면에서 어느 칸을 짚어 줄지 */
  field: 'cards' | 'board' | 'street' | 'stack' | 'position' | 'actions' | 'table' | 'pot';
  /** blocker = 분석 불가 · warn = 분석은 되지만 알려야 함 */
  level: 'blocker' | 'warn';
  message: string;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * 분석에 필요한 최소 합법성 검증.
 *
 * blocker 가 하나라도 있으면 분석하지 않는다. warn 은 화면에 띄우되 분석은 진행한다
 * (팟 불일치처럼 '사용자 입력이 틀렸다고 단정할 수 없는' 것들).
 */
export function validateSpot(s: SpotReview): SpotIssue[] {
  const out: SpotIssue[] = [];

  // 테이블·블라인드·스택
  if (!finite(s.tableSize) || s.tableSize < 2 || s.tableSize > MAX_TABLE) {
    out.push({ field: 'table', level: 'blocker', message: `테이블 인원은 2~${MAX_TABLE}명으로 입력해 주세요.` });
  }
  if (!finite(s.sbBb) || s.sbBb <= 0) {
    out.push({ field: 'stack', level: 'blocker', message: '스몰블라인드는 0보다 커야 합니다.' });
  }
  if (!finite(s.anteBb) || s.anteBb < 0) {
    out.push({ field: 'stack', level: 'blocker', message: '앤티는 0 이상이어야 합니다.' });
  }
  if (!finite(s.effectiveBb) || s.effectiveBb <= 0) {
    out.push({ field: 'stack', level: 'blocker', message: '유효 스택(BB)을 입력해 주세요.' });
  }

  // 포지션
  const seats = positionsFor(s.tableSize);
  if (!seats.includes(s.heroPos)) {
    out.push({ field: 'position', level: 'blocker', message: `${s.tableSize}인 테이블에 ${s.heroPos} 자리가 없습니다.` });
  }
  if (!seats.includes(s.villainPos)) {
    out.push({ field: 'position', level: 'blocker', message: `${s.tableSize}인 테이블에 ${s.villainPos} 자리가 없습니다.` });
  }
  if (s.heroPos === s.villainPos) {
    out.push({ field: 'position', level: 'blocker', message: '내 자리와 상대 자리가 같습니다.' });
  }
  // 빌런 B~E — 자리는 테이블에 있어야 하고, 나·A·서로와 겹치면 안 된다(한 자리에 둘이 앉을 수 없다)
  if (s.extra.length > MAX_EXTRA_VILLAINS) {
    out.push({ field: 'position', level: 'blocker', message: `상대는 빌런 A 포함 ${MAX_EXTRA_VILLAINS + 1}명까지입니다.` });
  }
  const taken = new Set<SpotPosition>([s.heroPos, s.villainPos]);
  s.extra.forEach((v, i) => {
    const who = `상대 ${EXTRA_LETTERS[i] ?? i + 2}`;
    if (!seats.includes(v.pos)) {
      out.push({ field: 'position', level: 'blocker', message: `${s.tableSize}인 테이블에 ${v.pos} 자리가 없습니다(${who}).` });
    } else if (taken.has(v.pos)) {
      out.push({ field: 'position', level: 'blocker', message: `${who}의 자리 ${v.pos} 가 다른 사람과 겹칩니다.` });
    }
    taken.add(v.pos);
    if (v.cards.length > 2) out.push({ field: 'cards', level: 'blocker', message: `${who} 카드는 2장까지입니다.` });
  });

  // 카드 형식
  const groups: [SpotIssue['field'], string[]][] = [
    ['cards', s.hero], ['cards', s.villain], ['board', s.board],
    ...s.extra.map((v): [SpotIssue['field'], string[]] => ['cards', v.cards]),
  ];
  for (const [field, cards] of groups) {
    for (const c of cards) {
      if (!isCardCode(c)) out.push({ field, level: 'blocker', message: `카드 표기가 올바르지 않습니다: ${String(c)}` });
    }
  }
  if (s.hero.length > 2) out.push({ field: 'cards', level: 'blocker', message: '내 카드는 2장까지입니다.' });
  if (s.villain.length > 2) out.push({ field: 'cards', level: 'blocker', message: '상대 카드는 2장까지입니다.' });
  if (s.board.length > 5) out.push({ field: 'board', level: 'blocker', message: '보드는 5장까지입니다.' });

  // 중복 카드 — 한 덱에서 나온 카드는 같은 것이 둘일 수 없다
  const seen = new Map<string, number>();
  for (const c of [...s.hero, ...s.villain, ...s.board, ...s.extra.flatMap((v) => v.cards)]) {
    if (!isCardCode(c)) continue;
    seen.set(c, (seen.get(c) ?? 0) + 1);
  }
  const dup = [...seen.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  if (dup.length) {
    out.push({ field: 'cards', level: 'blocker', message: `같은 카드가 두 번 들어갔습니다: ${dup.join(', ')}` });
  }

  // 보드 장수 ↔ 스트리트
  const need = BOARD_LEN[s.street];
  if (need === undefined) {
    out.push({ field: 'street', level: 'blocker', message: '스트리트를 골라 주세요.' });
  } else if (s.board.length !== need) {
    out.push({
      field: 'board', level: 'blocker',
      message: need === 0
        ? '프리플랍은 보드가 없어야 합니다.'
        : `${streetLabel(s.street)}은 보드 ${need}장이 필요합니다 (현재 ${s.board.length}장).`,
    });
  }

  // 액션 — 스트리트 순서가 뒤로 가지 않고, 결정 지점을 넘지 않는다
  const limit = STREETS.indexOf(s.street);
  let cursor = 0;
  s.actions.forEach((a, i) => {
    const at = STREETS.indexOf(a.street);
    if (at < 0) {
      out.push({ field: 'actions', level: 'blocker', message: `${i + 1}번째 액션의 스트리트가 올바르지 않습니다.` });
      return;
    }
    if (at > limit) {
      out.push({ field: 'actions', level: 'blocker', message: `${streetLabel(a.street)} 액션이 결정 지점(${streetLabel(s.street)})보다 뒤에 있습니다.` });
    }
    if (at < cursor) {
      out.push({ field: 'actions', level: 'blocker', message: '액션 순서가 스트리트를 거슬러 올라갑니다.' });
    }
    cursor = Math.max(cursor, at);

    // 빌런 B~E 의 액션은 그 자리가 상대 목록에 있어야 한다 — 없는 사람의 액션은 팟을 부풀린다
    if (a.pos !== undefined && !s.extra.some((v) => v.pos === a.pos)) {
      out.push({ field: 'actions', level: 'blocker', message: `${i + 1}번째 액션의 자리(${a.pos})가 상대 목록에 없습니다.` });
    }

    if (SIZED.has(a.type)) {
      if (!finite(a.sizeBb) || (a.sizeBb as number) < 0) {
        out.push({ field: 'actions', level: 'blocker', message: `${i + 1}번째 액션(${a.type})의 크기를 BB로 입력해 주세요.` });
      } else if ((a.sizeBb as number) > s.effectiveBb + 1e-9) {
        out.push({ field: 'actions', level: 'blocker', message: `${i + 1}번째 액션이 유효 스택(${s.effectiveBb}BB)을 넘습니다.` });
      }
    } else if (a.sizeBb !== undefined) {
      out.push({ field: 'actions', level: 'blocker', message: `${a.type} 에는 금액이 붙지 않습니다.` });
    }
  });

  // 🔴 G1(2026-09-20) — **히어로의 누적 투입액**이 유효 스택을 넘을 수 없다.
  //
  //  종전에는 액션 **한 번의 증분**만 `effectiveBb` 와 비교했다. 그래서 BTN 100BB 가 `raise +80`
  //  한 뒤 플랍에 `bet +30`(누적 110) 을 넣어도 `validateSpot` 이 빈 배열을 돌려주고, 그 위에서
  //  팟 190.5·콜 30·필요 지분 13.6054% 라는 **그럴듯한 거짓 수치**가 그대로 화면에 나갔다.
  //
  //  ⚠ 상대(빌런)에게는 같은 차단을 걸지 않는다. `effectiveBb` 는 **두 사람 중 작은 쪽**이라
  //    상대가 더 깊으면 그 초과 베팅 자체는 합법이다(NLHE 는 자기 칩 전부까지 벳 가능).
  //    넘은 금액은 아무도 콜할 수 없어 돌려받을 뿐이다(TDA Rule 16B/67A) — 그 처리는
  //    `spotEvaluate.ts` 의 `contestableMath` 가 팟에서 덜어내는 것으로 한다. 여기서 막으면
  //    합법적인 오버벳 기록까지 '입력 오류' 가 된다.
  //
  //  ⚠ 히어로는 정의상 `effectiveBb` 를 넘을 수 없다 — 유효 스택이 두 사람 중 작은 쪽이므로
  //    히어로의 실제 스택은 언제나 `effectiveBb` 이상이지만, 넘겨 봐야 상대가 커버하지 못한다.
  //    즉 "히어로가 100 을 넘게 넣었다" 는 원장은 어떤 스택 조합으로도 성립하지 않는다.
  if (finite(s.effectiveBb) && s.effectiveBb > 0) {
    let heroIn = s.heroPos === 'BB' ? 1 + (finite(s.anteBb) ? s.anteBb : 0)
      : s.heroPos === 'SB' ? (finite(s.sbBb) ? s.sbBb : 0) : 0;
    for (const a of s.actions) {
      if (!SIZED.has(a.type)) continue;
      const pos = a.actor === 'hero' ? s.heroPos : (a.pos ?? s.villainPos);
      if (pos !== s.heroPos) continue;
      heroIn += finite(a.sizeBb) ? (a.sizeBb as number) : 0;
    }
    if (s.heroAction && SIZED.has(s.heroAction) && finite(s.heroActionSizeBb)) {
      heroIn += s.heroActionSizeBb as number;
    }
    if (heroIn > s.effectiveBb + 1e-9) {
      out.push({
        field: 'actions', level: 'blocker',
        message: `내가 넣은 금액의 합(${Math.round(heroIn * 100) / 100}BB)이 유효 스택(${s.effectiveBb}BB)을 넘습니다 — 이 원장은 성립하지 않습니다.`,
      });
    }
  }

  // 히어로 선택 액션
  if (s.heroAction && SIZED.has(s.heroAction)) {
    if (!finite(s.heroActionSizeBb) || (s.heroActionSizeBb as number) < 0) {
      out.push({ field: 'actions', level: 'blocker', message: '내가 고른 액션의 크기를 BB로 입력해 주세요.' });
    } else if ((s.heroActionSizeBb as number) > s.effectiveBb + 1e-9) {
      out.push({ field: 'actions', level: 'blocker', message: '내가 고른 액션이 유효 스택을 넘습니다.' });
    }
  }

  // 팟 — 계산값과 다르면 **조용히 덮어쓰지 않고** 알린다
  if (s.potBbInput !== undefined) {
    if (!finite(s.potBbInput) || s.potBbInput < 0) {
      out.push({ field: 'pot', level: 'blocker', message: '팟은 0 이상의 숫자여야 합니다.' });
    } else {
      const calc = potBb(s);
      if (Math.abs(calc - s.potBbInput) > 0.05) {
        out.push({
          field: 'pot', level: 'warn',
          message: `입력한 팟 ${round2(s.potBbInput)}BB 와 액션에서 계산한 ${round2(calc)}BB 가 다릅니다. 둘 다 그대로 두고 분석은 계산값을 씁니다.`,
        });
      }
    }
  }

  return out;
}

export const hasBlocker = (issues: readonly SpotIssue[]): boolean => issues.some((i) => i.level === 'blocker');

export function streetLabel(s: Street): string {
  return s === 'preflop' ? '프리플랍' : s === 'flop' ? '플랍' : s === 'turn' ? '턴' : '리버';
}

export function actionLabel(a: SpotActionType): string {
  return a === 'fold' ? '폴드' : a === 'check' ? '체크' : a === 'call' ? '콜' : a === 'bet' ? '벳' : '레이즈';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 결정 지점 직전까지의 팟(BB) — 블라인드 + 앤티 + 기록된 액션의 합.
 * ⚠ 사이드팟·데드머니 정산은 하지 않는다. '대략 이만큼이 가운데 있다' 를 계산할 뿐이고,
 *   사용자가 적은 값과 다르면 validateSpot 이 warn 으로 알린다(덮어쓰지 않는다).
 */
export function potBb(s: SpotReview): number {
  const blinds = (finite(s.sbBb) ? s.sbBb : 0) + 1;                    // SB + BB(=1)
  const antes = finite(s.anteBb) ? s.anteBb : 0;                       // BB 앤티 총액 — 인원을 곱하지 않는다
  const bets = s.actions.reduce((sum, a) => sum + (SIZED.has(a.type) && finite(a.sizeBb) ? (a.sizeBb as number) : 0), 0);
  return round2(blinds + antes + bets);
}

// ── canonical key ─────────────────────────────────────────────────────────────

/**
 * 같은 스팟이면 같은 문자열, 의미가 다르면 다른 문자열.
 * 사전 계산 데이터 조회 키이자 계산 결과 캐시 키다.
 *
 * 정규화 규칙(의도적):
 *  · **프리플랍(보드 0장)은 무늬가 서로 바뀌어도 같은 스팟**이다 — AsKh 와 AdKc 는 둘 다 'AKo'.
 *    그래서 보드가 없으면 히어로를 콤보 id 로 접는다.
 *  · 보드가 있으면 무늬가 전략에 영향을 준다(플러시 드로 등) — 그때는 카드 코드를 그대로 쓴다.
 *    단 **플랍 3장은 동시에 깔리므로 순서가 의미 없어** 정렬하고, 턴·리버는 자리를 지킨다.
 *  · note·result·potBbInput 은 전략과 무관하므로 키에서 뺀다.
 *  · 빌런 카드는 전략 결정에 쓰이지 않으므로(상대는 내 카드를 모른다) 키에서 뺀다.
 */
export function canonicalSpotKey(s: SpotReview): string {
  const board = s.board.slice(0, 3).filter(isCardCode).sort(byCard).concat(s.board.slice(3).filter(isCardCode));
  const heroPart = board.length === 0
    ? (heroComboId(s.hero) ?? s.hero.slice().sort(byCard).join(''))
    : s.hero.slice().sort(byCard).join('');
  const acts = s.actions
    .map((a) => `${a.street[0]}${a.actor[0]}${a.pos ?? ''}${a.type}${SIZED.has(a.type) ? round2(a.sizeBb ?? 0) : ''}`)
    .join('.');
  const hero = s.heroAction
    ? `${s.heroAction}${SIZED.has(s.heroAction) ? round2(s.heroActionSizeBb ?? 0) : ''}`
    : '-';
  // 빌런 B~E 는 자리만 키에 든다 — 카드는 A 와 같은 이유로 뺀다
  const extra = s.extra.length ? `+${s.extra.map((v) => v.pos).join(',')}` : '';
  return [
    `v${s.v}`, s.game, s.format,
    `t${s.tableSize}`, `sb${round2(s.sbBb)}`, `an${round2(s.anteBb)}`, `ef${round2(s.effectiveBb)}`,
    `${s.heroPos}v${s.villainPos}${extra}`, s.street,
    `h:${heroPart}`, `b:${board.join('')}`,
    `a:${acts}`, `x:${hero}`,
  ].join('|');
}

// ── 직렬화 ────────────────────────────────────────────────────────────────────
// DB(jsonb)에는 객체 그대로 넣는다. URL 공유(#spot=)만 압축이 필요하다.

/** 저장·전송용 평문 객체 — 불필요한 undefined 를 떨어뜨려 jsonb 크기를 줄인다. */
export function toJSON(s: SpotReview): Record<string, unknown> {
  const o: Record<string, unknown> = {
    v: s.v, game: s.game, format: s.format, tableSize: s.tableSize,
    sbBb: s.sbBb, anteBb: s.anteBb, effectiveBb: s.effectiveBb,
    heroPos: s.heroPos, villainPos: s.villainPos,
    hero: s.hero,
    // 🔴 상대 카드는 **전부 `villain` 키 안에** 둔다(빌런 B~E 포함, A..E 순서의 string[][]).
    //    서버가 최상위 `villain` 키를 통째로 빼내 hidden_villain 에 넣는다 — 다른 키에 두면 가려지지 않는다.
    //    빌런이 A 뿐이면 v2 와 같은 평면 string[] 이라 옛 읽기 경로·픽스처가 그대로 맞는다.
    villain: s.extra.length ? [s.villain, ...s.extra.map((v) => v.cards)] : s.villain,
    board: s.board,
    street: s.street,
    actions: s.actions.map((a) => ({
      street: a.street, actor: a.actor, type: a.type,
      ...(a.pos !== undefined ? { pos: a.pos } : {}),
      ...(a.sizeBb !== undefined ? { sizeBb: a.sizeBb } : {}),
    })),
    heroAction: s.heroAction,
  };
  if (s.extra.length) o.extraPos = s.extra.map((v) => v.pos);   // 자리만 — 카드는 위 villain 안
  if (s.heroActionSizeBb !== undefined) o.heroActionSizeBb = s.heroActionSizeBb;
  if (s.potBbInput !== undefined) o.potBbInput = s.potBbInput;
  if (s.note) o.note = s.note;
  if (s.result) o.result = s.result;
  return o;
}

/** 저장된 값 → SpotReview. 모르는 필드는 버리고 빠진 필드는 기본값으로 채운다(구버전 내성). */
export function fromJSON(raw: unknown): SpotReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const str = (k: string, d: string) => (typeof o[k] === 'string' ? (o[k] as string) : d);
  const num = (k: string, d: number) => (finite(o[k]) ? (o[k] as number) : d);
  const cards = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter(isCardCode) : []);

  const street = (STREETS as readonly string[]).includes(str('street', '')) ? (o.street as Street) : 'preflop';
  const actions: SpotAction[] = Array.isArray(o.actions)
    ? (o.actions as unknown[]).flatMap((x) => {
      if (!x || typeof x !== 'object') return [];
      const a = x as Record<string, unknown>;
      if (!(STREETS as readonly string[]).includes(String(a.street))) return [];
      if (!(ACTION_TYPES as readonly string[]).includes(String(a.type))) return [];
      const actor: SpotActor = a.actor === 'villain' ? 'villain' : 'hero';
      const type = a.type as SpotActionType;
      const out: SpotAction = { street: a.street as Street, actor, type };
      if (actor === 'villain' && isPosition(a.pos)) out.pos = a.pos;
      if (SIZED.has(type) && finite(a.sizeBb)) out.sizeBb = a.sizeBb as number;
      return [out];
    })
    : [];

  const heroAction = (ACTION_TYPES as readonly string[]).includes(String(o.heroAction))
    ? (o.heroAction as SpotActionType) : null;

  // v1 → v2: anteBb 가 '1인당' 에서 'BB앤티 총액' 이 됐다. 옛 값 × 인원 = 옛 팟 그대로 —
  // 항등 변환이지 지어낸 값이 아니다(0.125×8 = 1). v 가 없으면 v1 로 본다.
  const v = finite(o.v) ? (o.v as number) : 1;
  const tableSize = num('tableSize', 6);
  const anteBb = v < 2 ? round2(num('anteBb', 0) * Math.max(0, tableSize)) : num('anteBb', 0);

  // 상대 카드 — 와이어 v3 는 `villain` 이 string[][](A..E), v2 이하는 평면 string[](A). 모양으로 가른다(버전이 아니라).
  // 서버가 `villain` 키를 통째로 뺀 공유 스팟은 여기서 전부 빈 카드가 된다(가림이 곧 부재).
  const rawV = Array.isArray(o.villain) ? (o.villain as unknown[]) : [];
  const nested = rawV.length > 0 && rawV.every(Array.isArray);
  const villainSets: string[][] = nested
    ? rawV.map((x) => (x as unknown[]).filter(isCardCode).slice(0, 2))
    : [rawV.filter(isCardCode).slice(0, 2)];
  // 빌런 B~E 자리 — 와이어는 `extraPos`, 메모리 스냅샷(writeSnap 은 메모리 모양을 그대로 쓴다)은 `extra:[{pos,cards}]`.
  // 둘 다 받아야 초안 복원에서 B~E 가 조용히 사라지지 않는다.
  let extra: SpotVillain[] = [];
  if (Array.isArray(o.extra)) {
    extra = (o.extra as unknown[]).flatMap((x) => {
      if (!x || typeof x !== 'object') return [];
      const e = x as Record<string, unknown>;
      if (!isPosition(e.pos)) return [];
      return [{ pos: e.pos, cards: (Array.isArray(e.cards) ? (e.cards as unknown[]) : []).filter(isCardCode).slice(0, 2) }];
    });
  } else if (Array.isArray(o.extraPos)) {
    extra = (o.extraPos as unknown[]).flatMap((p, i) => (isPosition(p) ? [{ pos: p, cards: villainSets[i + 1] ?? [] }] : []));
  }

  const s: SpotReview = {
    v: 3, game: 'nlhe',
    format: o.format === 'cash' ? 'cash' : 'mtt',
    tableSize,
    sbBb: num('sbBb', 0.5),
    anteBb,
    effectiveBb: num('effectiveBb', 100),
    heroPos: isPosition(o.heroPos) ? o.heroPos : 'BTN',
    villainPos: isPosition(o.villainPos) ? o.villainPos : 'BB',
    hero: cards('hero').slice(0, 2),
    villain: villainSets[0] ?? [],
    extra: extra.slice(0, MAX_EXTRA_VILLAINS),
    board: cards('board').slice(0, 5),
    street,
    actions,
    heroAction,
  };
  if (finite(o.heroActionSizeBb)) s.heroActionSizeBb = o.heroActionSizeBb as number;
  if (finite(o.potBbInput)) s.potBbInput = o.potBbInput as number;
  if (typeof o.note === 'string' && o.note) s.note = o.note;
  if (o.result && typeof o.result === 'object') {
    const r = o.result as Record<string, unknown>;
    s.result = { won: r.won === true, ...(finite(r.deltaBb) ? { deltaBb: r.deltaBb as number } : {}) };
  }
  return s;
}

// ── URL 공유는 두지 않는다 ────────────────────────────────────────────────────
// 한때 encodeSpotCode/decodeSpotCode/readSpotHash(base64url JSON)가 있었다. 지웠다:
//   · 상대 카드·결과가 URL 에 평문으로 실린다. base64 는 암호가 아니다 —
//     서버가 hidden_* 컬럼 권한으로 가려 둔 스포일러(20260911d)를 링크 한 줄이 우회하고,
//     그러면 '먼저 골라 보고 분포를 확인' 하는 투표가 통째로 무의미해진다.
//   · 대표 스팟 1건이 943자(메모가 길면 2122자)라 메신저 공유에 현실적이지 않았다.
//   · 배선된 적이 한 번도 없다(프로덕션 호출자 0). 같은 왕복은 게시판 공유가 닫는다:
//     share_spot_post → `?post=<36자>` → SpotPostCard → '이 스팟 분석하기'.
// 다시 만들 거라면 **가릴 것을 뺀 뒤** 인코딩하는 것부터 설계해라.

// ── 기본값 · 레거시 어댑터 ────────────────────────────────────────────────────

/** 빈 스팟 — 입력 화면의 시작점. 6맥스 100bb BTN vs BB 가 가장 흔한 학습 스팟이다. */
export function emptySpot(): SpotReview {
  return {
    v: 3, game: 'nlhe', format: 'mtt', tableSize: 6,
    sbBb: 0.5, anteBb: 0, effectiveBb: 100,
    heroPos: 'BTN', villainPos: 'BB',
    hero: [], villain: [], extra: [], board: [],
    street: 'preflop', actions: [], heroAction: null,
  };
}

/**
 * 레거시 [[REPLAY:...]] → SpotReview.
 *
 * ⚠ 자유문자 액션은 **구조로 승격하지 않는다.** 'BTN 2.5bb 오픈, BB 콜' 을 파싱해
 *   액션 배열을 지어내면 없는 정보를 만드는 것이고, 그 위에서 분석하면 틀린 근거가 된다.
 *   원문은 note 에 그대로 옮겨 사람이 읽게 하고, 분석은 '액션 없음' 으로 본다.
 *   (그래서 레거시 게시물은 대개 math_only 또는 unsupported 로 떨어진다 — 의도된 결과다.)
 */
export function spotFromReplay(r: ReplayData): SpotReview {
  const s = emptySpot();
  s.hero = r.hero.filter(isCardCode).slice(0, 2);
  s.villain = r.villain.filter(isCardCode).slice(0, 2);
  s.board = r.board.filter(isCardCode).slice(0, 5);
  s.street = s.board.length >= 5 ? 'river' : s.board.length >= 4 ? 'turn' : s.board.length >= 3 ? 'flop' : 'preflop';
  const lines = (['pre', 'flop', 'turn', 'river'] as const)
    .map((k) => (r.actions[k]?.trim() ? `${k === 'pre' ? '프리플랍' : streetLabel(k as Street)}: ${r.actions[k]!.trim()}` : ''))
    .filter(Boolean);
  if (r.pot?.trim()) lines.unshift(`팟: ${r.pot.trim()}`);
  if (lines.length) s.note = lines.join('\n');
  return s;
}

/** 레거시 #gto= 공유 코드(카드만) → SpotReview. 포지션·스택·액션은 기본값이다. */
export function spotFromCards(hero: string[], villain: string[], board: string[]): SpotReview {
  const s = emptySpot();
  s.hero = hero.filter(isCardCode).slice(0, 2);
  s.villain = villain.filter(isCardCode).slice(0, 2);
  s.board = board.filter(isCardCode).slice(0, 5);
  s.street = s.board.length >= 5 ? 'river' : s.board.length >= 4 ? 'turn' : s.board.length >= 3 ? 'flop' : 'preflop';
  return s;
}

/** 상대 자리 목록 한 줄 — 'BB' · 'BB·CO·SB'. 요약·공유 본문이 같은 함수를 쓴다(두 벌이면 한쪽이 틀린다). */
export function villainsLabel(s: SpotReview): string {
  return [s.villainPos, ...s.extra.map((v) => v.pos)].join('·');
}

/** 액션을 한 사람의 자리. B~E 는 `pos`, 그 밖은 actor 의 기본 자리. */
export function actorPos(s: SpotReview, a: Pick<SpotAction, 'actor' | 'pos'>): SpotPosition {
  if (a.actor === 'hero') return s.heroPos;
  return a.pos ?? s.villainPos;
}

/**
 * 결정 지점에 **아직 팟에 남아 있는 상대**(A + B~E) — 마지막 액션이 폴드인 사람은 뺀다.
 * 승률은 이 사람들과 겨루는 값이다. 액션이 하나도 없는 상대(뒤에서 아직 안 움직인 블라인드 등)는 남아 있는 것으로 본다.
 */
export function liveVillains(s: SpotReview): SpotVillain[] {
  const all: SpotVillain[] = [{ pos: s.villainPos, cards: s.villain }, ...s.extra];
  return all.filter((v) => {
    const mine = s.actions.filter((a) => a.actor === 'villain' && actorPos(s, a) === v.pos);
    return mine.length === 0 || mine[mine.length - 1].type !== 'fold';
  });
}

/** 목록·카드에 쓰는 한 줄 요약. 'BTN vs BB · 100BB · 플랍' / 'BTN vs BB·CO · 100BB · 플랍' */
export function spotSummary(s: SpotReview): string {
  return `${s.heroPos} vs ${villainsLabel(s)} · ${round2(s.effectiveBb)}BB · ${streetLabel(s.street)}`;
}
