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

/** 9인 기준 포지션 이름. 테이블 인원이 적으면 앞자리부터 빠진다(POSITIONS_FOR). */
export type SpotPosition = 'UTG' | 'UTG1' | 'MP' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
const POSITION_ORDER: readonly SpotPosition[] = ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/** 테이블 인원 → 실제로 존재하는 포지션. 9인 순서에서 **뒤(BTN·블라인드)를 남기고 앞을 자른다**. */
export function positionsFor(tableSize: number): SpotPosition[] {
  const n = Math.max(2, Math.min(9, Math.round(tableSize)));
  return POSITION_ORDER.slice(POSITION_ORDER.length - n);
}

export type SpotActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';
export const ACTION_TYPES: readonly SpotActionType[] = ['fold', 'check', 'call', 'bet', 'raise'];
/** 금액이 따라붙는 액션 — check/fold 에 sizeBb 가 오면 입력 오류다. */
const SIZED: ReadonlySet<SpotActionType> = new Set<SpotActionType>(['call', 'bet', 'raise']);

export type SpotActor = 'hero' | 'villain';

export interface SpotAction {
  street: Street;
  actor: SpotActor;
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
  /** 스키마 버전 — 늘어나면 마이그레이션 지점이 여기 하나다. */
  v: 1;
  game: 'nlhe';
  format: 'mtt' | 'cash';
  tableSize: number;        // 2~9
  /** 스몰블라인드(BB 단위). 보통 0.5 */
  sbBb: number;
  /** 앤티(BB 단위, 1인당). 없으면 0 */
  anteBb: number;
  /** 유효 스택(BB) — 둘 중 짧은 쪽 */
  effectiveBb: number;
  heroPos: SpotPosition;
  villainPos: SpotPosition;
  /** 'As' 형식. 0~2장 */
  hero: string[];
  /** 선택 — 모르면 빈 배열. 공유 시 기본 비공개 */
  villain: string[];
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
  if (!finite(s.tableSize) || s.tableSize < 2 || s.tableSize > 9) {
    out.push({ field: 'table', level: 'blocker', message: '테이블 인원은 2~9명으로 입력해 주세요.' });
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

  // 카드 형식
  const groups: [SpotIssue['field'], string[]][] = [
    ['cards', s.hero], ['cards', s.villain], ['board', s.board],
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
  for (const c of [...s.hero, ...s.villain, ...s.board]) {
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
  const antes = (finite(s.anteBb) ? s.anteBb : 0) * Math.max(0, s.tableSize);
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
    .map((a) => `${a.street[0]}${a.actor[0]}${a.type}${SIZED.has(a.type) ? round2(a.sizeBb ?? 0) : ''}`)
    .join('.');
  const hero = s.heroAction
    ? `${s.heroAction}${SIZED.has(s.heroAction) ? round2(s.heroActionSizeBb ?? 0) : ''}`
    : '-';
  return [
    `v${s.v}`, s.game, s.format,
    `t${s.tableSize}`, `sb${round2(s.sbBb)}`, `an${round2(s.anteBb)}`, `ef${round2(s.effectiveBb)}`,
    `${s.heroPos}v${s.villainPos}`, s.street,
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
    hero: s.hero, villain: s.villain, board: s.board,
    street: s.street,
    actions: s.actions.map((a) => (a.sizeBb === undefined
      ? { street: a.street, actor: a.actor, type: a.type }
      : { street: a.street, actor: a.actor, type: a.type, sizeBb: a.sizeBb })),
    heroAction: s.heroAction,
  };
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
      if (SIZED.has(type) && finite(a.sizeBb)) out.sizeBb = a.sizeBb as number;
      return [out];
    })
    : [];

  const heroAction = (ACTION_TYPES as readonly string[]).includes(String(o.heroAction))
    ? (o.heroAction as SpotActionType) : null;

  const s: SpotReview = {
    v: 1, game: 'nlhe',
    format: o.format === 'cash' ? 'cash' : 'mtt',
    tableSize: num('tableSize', 6),
    sbBb: num('sbBb', 0.5),
    anteBb: num('anteBb', 0),
    effectiveBb: num('effectiveBb', 100),
    heroPos: (POSITION_ORDER as readonly string[]).includes(str('heroPos', '')) ? (o.heroPos as SpotPosition) : 'BTN',
    villainPos: (POSITION_ORDER as readonly string[]).includes(str('villainPos', '')) ? (o.villainPos as SpotPosition) : 'BB',
    hero: cards('hero').slice(0, 2),
    villain: cards('villain').slice(0, 2),
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

// ── URL 공유(#spot=) ──────────────────────────────────────────────────────────
// base64url(JSON). 기존 #gto= 는 카드만 담아 짧았지만, 구조화된 스팟은 필드가 많아
// 자체 문법을 새로 만들면 파서를 하나 더 유지해야 한다 — JSON 한 벌로 끝낸다.

const b64urlEncode = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const b64urlDecode = (s: string): string | null => {
  try {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch { return null; }
};

export function encodeSpotCode(s: SpotReview): string {
  return b64urlEncode(JSON.stringify(toJSON(s)));
}

export function decodeSpotCode(code: string): SpotReview | null {
  const json = b64urlDecode(code ?? '');
  if (!json) return null;
  try { return fromJSON(JSON.parse(json)); } catch { return null; }
}

/** location.hash 에서 `#spot=` 코드 추출. 없으면 null. */
export function readSpotHash(hash: string): string | null {
  const m = (hash ?? '').match(/#spot=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ── 기본값 · 레거시 어댑터 ────────────────────────────────────────────────────

/** 빈 스팟 — 입력 화면의 시작점. 6맥스 100bb BTN vs BB 가 가장 흔한 학습 스팟이다. */
export function emptySpot(): SpotReview {
  return {
    v: 1, game: 'nlhe', format: 'mtt', tableSize: 6,
    sbBb: 0.5, anteBb: 0, effectiveBb: 100,
    heroPos: 'BTN', villainPos: 'BB',
    hero: [], villain: [], board: [],
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

/** 목록·카드에 쓰는 한 줄 요약. 'BTN vs BB · 100BB · 플랍' */
export function spotSummary(s: SpotReview): string {
  return `${s.heroPos} vs ${s.villainPos} · ${round2(s.effectiveBb)}BB · ${streetLabel(s.street)}`;
}
