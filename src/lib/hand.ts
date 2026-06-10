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

// ── 핸드 리플레이 ─────────────────────────────────────────────────────────────
// 보드(플랍~리버)와 스트리트별 액션까지 담아 글에서 단계별로 재생한다.
// 마커: [[REPLAY:hero=..;villain=..;board=..;pot=..;pre=..;flop=..;turn=..;river=..]]

export interface ReplayData {
  hero: string[];            // 내 핸드 0~2장
  villain: string[];         // 상대 핸드 0~2장(쇼다운에서 공개)
  board: string[];           // 보드 0~5장
  pot?: string;              // 팟(자유 표기: '12.5bb', '34만' 등)
  actions: { pre?: string; flop?: string; turn?: string; river?: string };
}

const REPLAY_MARKER = /\n*\[\[REPLAY:([^\]]*)\]\]\s*$/;

/** 본문 끝에 리플레이 마커를 덧붙인다. 카드가 하나도 없으면 원본 그대로. */
export function encodeReplay(content: string, r: ReplayData | null): string {
  if (!r) return content;
  const hero = r.hero.filter(Boolean);
  const villain = r.villain.filter(Boolean);
  const board = r.board.filter(Boolean);
  if (hero.length === 0 && board.length === 0) return content;
  const segs = [
    `hero=${hero.join(',')}`,
    `villain=${villain.join(',')}`,
    `board=${board.join(',')}`,
  ];
  if (r.pot?.trim()) segs.push(`pot=${encodeURIComponent(r.pot.trim())}`);
  (['pre', 'flop', 'turn', 'river'] as const).forEach((k) => {
    const v = r.actions[k]?.trim();
    if (v) segs.push(`${k}=${encodeURIComponent(v)}`);
  });
  return `${content}\n\n[[REPLAY:${segs.join(';')}]]`;
}

/** 본문에서 핸드/리플레이 마커를 한 번에 분리한다. */
export function parseAttachments(content: string): { text: string; hand: HandSel | null; replay: ReplayData | null } {
  const rm = content.match(REPLAY_MARKER);
  if (rm) {
    const text = content.replace(REPLAY_MARKER, '').trimEnd();
    const r: ReplayData = { hero: [], villain: [], board: [], actions: {} };
    for (const seg of rm[1].split(';')) {
      const i = seg.indexOf('=');
      if (i < 0) continue;
      const k = seg.slice(0, i);
      const v = seg.slice(i + 1);
      const cards = v.split(',').map((s) => s.trim()).filter(Boolean);
      if (k === 'hero') r.hero = cards;
      else if (k === 'villain') r.villain = cards;
      else if (k === 'board') r.board = cards;
      else if (k === 'pot') r.pot = decodeURIComponent(v);
      else if (k === 'pre' || k === 'flop' || k === 'turn' || k === 'river') r.actions[k] = decodeURIComponent(v);
    }
    if (r.hero.length === 0 && r.board.length === 0) return { text, hand: null, replay: null };
    return { text, hand: null, replay: r };
  }
  const { text, hand } = parseHand(content);
  return { text, hand, replay: null };
}
