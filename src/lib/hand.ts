// src/lib/hand.ts
// 커뮤니티 글에 "핸드"(내 핸드/상대 핸드)를 첨부하기 위한 경량 인코딩.
// 별도 컬럼 없이 본문 끝에 마커로 저장하고, 표시할 때 분리해 카드로 렌더한다.
// 카드 표기: gto.types 와 동일하게 `${rank}${suit}` (예: 'As','Th','9c').

export interface HandSel {
  hero: string[];    // 내 핸드 (카드 0~2장)
  villain: string[]; // 상대 핸드 (카드 0~2장)
}

const MARKER = /\n*\[\[HAND:([^\]]*)\]\]\s*$/;

/** 본문 끝에 핸드 마커를 덧붙인다. 선택된 카드가 없으면 원본 그대로 반환. */
export function encodeHand(content: string, hand: HandSel | null): string {
  if (!hand) return content;
  const hero = hand.hero.filter(Boolean);
  const villain = hand.villain.filter(Boolean);
  if (hero.length === 0 && villain.length === 0) return content;
  const payload = `hero=${hero.join(',')};villain=${villain.join(',')}`;
  return `${content}\n\n[[HAND:${payload}]]`;
}

/** 본문에서 핸드 마커를 분리한다. 마커가 없으면 hand=null. */
export function parseHand(content: string): { text: string; hand: HandSel | null } {
  const m = content.match(MARKER);
  if (!m) return { text: content, hand: null };
  const text = content.replace(MARKER, '').trimEnd();
  const hero: string[] = [];
  const villain: string[] = [];
  for (const seg of m[1].split(';')) {
    const [k, v] = seg.split('=');
    const cards = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (k === 'hero') hero.push(...cards);
    else if (k === 'villain') villain.push(...cards);
  }
  if (hero.length === 0 && villain.length === 0) return { text, hand: null };
  return { text, hand: { hero, villain } };
}
