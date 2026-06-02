// src/components/features/gto/gtoShare.ts
// GTO 스팟(Hero/Villain/Board)을 URL 해시로 공유하기 위한 인코딩/디코딩.
// 카드 ID는 항상 2글자(랭크 1 + 무늬 1, 예: 'As','Th','9c').
import { RANKS, SUITS, type Card, type Rank, type Suit } from './gto.types';

export function cardIdStr(c: Card): string {
  return `${c.rank}${c.suit}`;
}

export function parseCardId(id: string): Card | null {
  if (!id || id.length < 2) return null;
  const rank = id.slice(0, 1).toUpperCase() as Rank;
  const suit = id.slice(1, 2).toLowerCase() as Suit;
  if (!(RANKS as readonly string[]).includes(rank)) return null;
  if (!(SUITS as readonly string[]).includes(suit)) return null;
  return { rank, suit };
}

function chunkCards(str: string, max: number): Card[] {
  const out: Card[] = [];
  for (let i = 0; i + 1 < str.length && out.length < max; i += 2) {
    const c = parseCardId(str.slice(i, i + 2));
    if (c) out.push(c);
  }
  return out;
}

/** Hero/Villain/Board 슬롯을 `hero-villain-board` 문자열로 인코딩(빈 슬롯 제외). */
export function encodeSpot(
  hero: readonly (Card | null)[],
  villain: readonly (Card | null)[],
  board: readonly (Card | null)[],
): string {
  const grp = (cs: readonly (Card | null)[]) =>
    cs.filter((c): c is Card => c !== null).map(cardIdStr).join('');
  return [grp(hero), grp(villain), grp(board)].join('-');
}

export interface DecodedSpot { hero: Card[]; villain: Card[]; board: Card[]; }

/** 공유 코드 → 카드 목록. 형식이 잘못되면 빈 목록. */
export function decodeSpot(code: string): DecodedSpot {
  const [h = '', v = '', b = ''] = (code ?? '').split('-');
  return {
    hero: chunkCards(h, 2),
    villain: chunkCards(v, 2),
    board: chunkCards(b, 5),
  };
}

/** location.hash 에서 `#gto=` 코드 추출. 없으면 null. */
export function readGtoHash(hash: string): string | null {
  const m = (hash ?? '').match(/#gto=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
