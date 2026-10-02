// 게시판 SPOT 공유 화면(시안 A · 2026-10-01 오너 선택)의 **표시용 뷰 모델**.
// 계산하지 않는다(팟·승률·핸드 강도 없음). 적힌 값만 옮기고, 빈 값은 항목째 뺀다.
// 원본: 시안 브랜치 NURI/spot-share-design-1001(b8982254) 의 shareView.ts — 투표 보기(voteChoices·fitPollOptions)를 더했다.
import type { SpotReview, SpotActionType, Street, SpotPosition } from '../../../../lib/spot';
import { actionLabel, actorPos, streetLabel, EXTRA_LETTERS, committedBb, hasStackPair, liveVillains } from '../../../../lib/spot';

const RANK_ORDER = 'AKQJT98765432';

/** 'As','Ks' → 'AKs' · 'Ah','Jd' → 'AJo' · 'Qh','Qd' → 'QQ'. 두 장이 아니면 null. */
export function handClass(cards: string[]): string | null {
  if (cards.length !== 2) return null;
  const [a, b] = [...cards].sort((x, y) => RANK_ORDER.indexOf(x[0]) - RANK_ORDER.indexOf(y[0]));
  if (a[0] === b[0]) return a[0] + b[0];
  return a[0] + b[0] + (a[1] === b[1] ? 's' : 'o');
}

export interface ViewVillain { letter: string; label: string; pos: SpotPosition; cards: string[] }
export interface ViewAction { pos: SpotPosition; who: string; isHero: boolean; type: SpotActionType; label: string; sizeBb?: number }
export interface ViewStreet { street: Street; label: string; board: string[]; actions: ViewAction[] }

export interface ShareView {
  heroPos: SpotPosition;
  hero: string[];
  heroClass: string | null;
  villains: ViewVillain[];
  /** 맥락 칩 — 빈 값은 애초에 넣지 않는다 */
  context: string[];
  board: string[];
  street: Street;
  streetName: string;
  /** 결정 직전 마지막 액션 한 줄. 없으면 null(=프리플랍 첫 액션 등) */
  facing: string | null;
  /** 액션이 있는 스트리트만. 프리플랍·액션 0 이면 빈 배열 */
  streets: ViewStreet[];
  note?: string;
  /** 공개된 경우에만 채운다 */
  heroAction: { label: string; sizeBb?: number } | null;
  result: { won: boolean } | null;
  hidden: boolean;
  tableSize: number;
  /** 이 자리에서 실제로 고를 수 있는 것 — 투표 보기 */
  choices: string[];
}

const BOARD_AT: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

export function shareView(s: SpotReview, revealed: boolean): ShareView {
  const villains: ViewVillain[] = [
    { letter: 'A', label: 'Villain A', pos: s.villainPos, cards: revealed ? s.villain : [] },
    ...s.extra.map((v, i) => {
      const letter = EXTRA_LETTERS[i] ?? '?';
      return { letter, label: `Villain ${letter}`, pos: v.pos, cards: revealed ? v.cards : [] };
    }),
  ];
  const who = (pos: SpotPosition, isHero: boolean) =>
    isHero ? '나' : (villains.find((v) => v.pos === pos)?.label ?? pos);

  const streets: ViewStreet[] = [];
  for (const st of ['preflop', 'flop', 'turn', 'river'] as Street[]) {
    const acts = s.actions.filter((a) => a.street === st).map((a): ViewAction => {
      const pos = actorPos(s, a);
      const isHero = a.actor === 'hero';
      return { pos, who: who(pos, isHero), isHero, type: a.type, label: actionLabel(a.type), sizeBb: a.sizeBb };
    });
    // 그 스트리트에 새로 깔린 카드만 — 플랍 3장 · 턴 1장 · 리버 1장
    const board = st === 'preflop' ? [] : s.board.slice(st === 'flop' ? 0 : BOARD_AT[st] - 1, BOARD_AT[st]);
    if (acts.length || (board.length && BOARD_AT[st] <= BOARD_AT[s.street])) {
      streets.push({ street: st, label: streetLabel(st), board, actions: acts });
    }
  }
  const last = s.actions[s.actions.length - 1];
  const facing = last
    ? `${who(actorPos(s, last), last.actor === 'hero')} ${actionLabel(last.type)}${last.sizeBb !== undefined ? ` ${last.sizeBb}BB` : ''}`
    : null;

  const context = [
    s.format === 'mtt' ? '토너먼트' : '캐시',
    `${s.tableSize}인`,
    `${s.effectiveBb}BB`,
    ...(s.anteBb > 0 ? [`BB앤티 ${s.anteBb}BB`] : []),
  ];

  const hidden = !revealed;
  return {
    heroPos: s.heroPos, hero: s.hero, heroClass: handClass(s.hero), villains, context,
    board: s.board, street: s.street, streetName: streetLabel(s.street), facing, streets,
    note: s.note?.trim() || undefined,
    // 조건을 뒤집어 쓴다: 부정 접두사가 붙은 hidden 이 공백 앞에 오면 Tailwind 평문 스캔이 클래스 후보로 읽어 전역 CSS 에 죽은 규칙을 만든다(PR #99 실측).
    heroAction: hidden || !s.heroAction ? null : { label: actionLabel(s.heroAction), sizeBb: s.heroActionSizeBb },
    // §28: 손익(deltaBb)은 공유 화면에 싣지 않는다 — 이김/짐만.
    result: hidden || !s.result ? null : { won: s.result.won },
    hidden, tableSize: s.tableSize,
    choices: voteChoices(s),
  };
}

/** 'BTN AKs vs BB' / 'CO AJs vs BTN·SB' — 카드가 없으면 자리만 */
export function matchupLine(v: ShareView): string {
  return `${v.heroPos}${v.heroClass ? ` ${v.heroClass}` : ''} vs ${v.villains.map((x) => x.pos).join('·')}`;
}

/** 결정 지점 한 줄 — '프리플랍 · 첫 액션' / '플랍 · Villain B 체크 뒤' */
export function decisionLine(v: ShareView): string {
  return `${v.streetName} · ${v.facing ? `${v.facing} 뒤` : '첫 액션'}`;
}

// ── 투표 보기 ────────────────────────────────────────────────────────────────
// 2026-10-01 README P9: 상대가 체크한 뒤 내 차례인데도 보기가 '폴드·콜·레이즈' 로 고정이었다.
//   결정 스트리트에 벳·레이즈가 있으면 마주한 벳이 있다 → 폴드·콜·레이즈.
//   없으면 프리플랍은 블라인드가 벳이라 그대로이되 BB(림프만 받음)는 체크·레이즈, 포스트플랍은 체크·벳.
// 2026-10-02 독립 검토 FAIL(review-share-a3-1002.md §2): 상대가 올인했거나 내 스택을 덮는 벳에도 '레이즈' 가 나왔다.
//   레이즈를 받을 수 없으면 폴드·콜만: ⓐ 콜할 금액 ≥ 내 남은 스택 ⓑ 팟에 남은 상대가 전원 올인(칩 0).
//   남은 스택 = 스택(두 스택이 있으면 내 스택, 없으면 유효 스택) − committedBb(내가 넣은 누적 · spot.ts).
//   상대 스택: Villain A 는 villainStackBb(없으면 유효 스택), B~E 는 따로 적지 않으므로 유효 스택으로 본다.
// ⚠ 서버 20261002c_spot_vote_allin.sql 의 _spot_vote_choices 가 **같은 규칙**이다. 한쪽을 바꾸면 둘 다 바꿔라.
//   두 쪽이 같은 답을 내는지는 그 파일 §3 의 사례표를 shareView.test.ts 가 이 함수로 다시 돌려 잠근다.
const LEGACY = ['폴드', '콜', '레이즈'];
const EPS = 1e-9;

export function voteChoices(s: SpotReview): string[] {
  const facing = s.actions.some((a) => a.street === s.street && (a.type === 'bet' || a.type === 'raise'));
  const base = facing ? LEGACY
    : s.street === 'preflop' ? (s.heroPos === 'BB' ? ['체크', '레이즈'] : LEGACY)
      : ['체크', '벳'];
  return base === LEGACY && !canRaise(s) ? ['폴드', '콜'] : base;
}

function canRaise(s: SpotReview): boolean {
  const pair = hasStackPair(s);
  const stackOf = (pos: SpotPosition) =>
    pair && pos === s.heroPos ? (s.heroStackBb as number) : pair && pos === s.villainPos ? (s.villainStackBb as number) : s.effectiveBb;
  const live = liveVillains(s);
  const toCall = Math.max(s.street === 'preflop' ? 1 : 0, ...live.map((v) => committedBb(s, v.pos, s.street))) - committedBb(s, s.heroPos, s.street);
  if (toCall >= stackOf(s.heroPos) - committedBb(s, s.heroPos) - EPS) return false;
  return live.some((v) => stackOf(v.pos) - committedBb(s, v.pos) > EPS);
}

/**
 * 서버가 보기를 고정값(폴드·콜·레이즈)으로 넣은 글 — 20261001o 적용 전 글 — 을 상황에 맞게 **보여 준다**.
 * 표는 보기 id 로 들어가므로 뜻이 같은 쪽으로만 이름을 바꾼다: 콜→체크(넘기기), 레이즈→벳/레이즈(올리기).
 * 고를 수 없는 보기(체크 자리의 폴드 · 올리기가 없는 자리의 레이즈)는 뺀다. 이미 표가 있으면 **표만 남기고 잠근다**(locked) —
 *   있던 표를 화면에서 지우지 않되, 새로 누를 수 있는 보기는 피드 줄(v.choices)과 **같다**.
 *   🔴 독립 검토 10-02 a5 ①-a: 예전엔 표 있는 '레이즈' 를 눌리는 채로 남겨 피드 '폴드 · 콜' / 상세 '폴드·콜·레이즈' 가 갈렸다.
 * 보기가 고정값이 아니면(서버 적용 뒤 글·직접 만든 투표) 손대지 않는다.
 */
export function fitPollOptions<T extends { idx: number; label: string; votes: number }>(opts: T[], choices: string[]): (T & { locked?: boolean })[] {
  const sorted = [...opts].sort((a, b) => a.idx - b.idx);
  if (sorted.map((o) => o.label).join() !== LEGACY.join() || choices.join() === LEGACY.join()) return opts;
  const passive = choices.includes('체크') ? '체크' : '콜';
  const aggressive = choices.find((c) => c === '벳' || c === '레이즈');
  const lockIfVoted = (o: T) => (o.votes > 0 ? [{ ...o, locked: true }] : []);
  return sorted.flatMap((o) => {
    if (o.label === '폴드') return choices.includes('폴드') ? [o] : lockIfVoted(o);
    if (o.label === '레이즈' && !aggressive) return lockIfVoted(o);
    return [{ ...o, label: o.label === '콜' ? passive : (aggressive as string) }];
  });
}
