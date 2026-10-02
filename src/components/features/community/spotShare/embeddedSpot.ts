// 목록 쿼리에 끼워 받은 post_spots 한 행(api/community.ts 의 POST_LIST_SELECT) → 화면용 스팟.
//
// ⚠ 가리는 일은 서버가 한다(20260911d·20260922a): 공유 시점에 상대 카드·결과·글쓴이 선택을 spot 본문에서 빼서
//   hidden_* 컬럼(컬럼 SELECT 회수)에 넣는다. 아래 지우기는 그 계약이 깨졌을 때의 **이중 방어**로,
//   api/spots.ts fetchPostSpot 과 같은 규칙이다 — 지우지 마라. (두 벌이다: spots.ts 를 이 함수로 합치는 일은 후속.)
import { fromJSON, type SpotReview } from '../../../../lib/spot';

export interface EmbeddedSpot { spot: SpotReview; revealVillain: boolean; revealResult: boolean }

export function spotFromEmbed(row: unknown): EmbeddedSpot | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as { spot?: unknown; reveal_villain?: unknown; reveal_result?: unknown };
  const spot = fromJSON(r.spot);
  if (!spot) return null;
  const revealVillain = r.reveal_villain === true;
  const revealResult = r.reveal_result === true;
  if (!revealVillain) { spot.villain = []; spot.extra = spot.extra.map((v) => ({ ...v, cards: [] })); }
  if (!revealResult) { delete spot.result; spot.heroAction = null; delete spot.heroActionSizeBb; }
  return { spot, revealVillain, revealResult };
}
