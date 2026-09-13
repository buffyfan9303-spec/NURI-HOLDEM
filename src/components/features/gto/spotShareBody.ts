// src/components/features/gto/spotShareBody.ts — 공유 확인 시트가 보여 줄 **실제 본문**
//
// 왜 여기 한 벌 더 있는가(F16, 2026-09-13):
//   공개 글의 본문은 `src/api/spots.ts` 의 `shareBody(spot)` 가 짓는다. 그 함수는 모듈 내부
//   비공개라 화면에서 부를 수 없고, 지금은 그 파일의 편집자가 따로 있다(계약상 손대지 않는다).
//   그래서 **같은 문자열을 짓는 순수 함수**를 이쪽에 두고, 두 벌이 어긋나면 테스트가 깨지게 했다
//   (spotShareBody.test.ts 가 spots.ts 의 shareBody 원문을 읽어 같은 템플릿인지 대조한다).
//   ⚠ 어느 한쪽을 고치면 **반드시 양쪽을 같이** 고쳐라 — 미리보기가 거짓말을 하면
//     이 기능(올라갈 내용을 먼저 보여 준다)이 통째로 무의미해진다.
//
// ⚠ 스트리트 표기가 `spotSummary()` 와 다르다(프리플랍만 한글, 나머지는 영문 식별자).
//   그것이 **지금 실제로 올라가는 문자열**이라 미리보기도 그대로 따른다 — 여기서 몰래
//   예쁘게 고치면 미리보기와 게시물이 달라진다.
import type { SpotReview } from '../../../lib/spot';

/** 메모가 없을 때 본문 뒤에 붙는 기본 질문 */
export const SHARE_BODY_FALLBACK = '이 자리에서 어떻게 하시겠어요?';

/** 본문 첫 줄 — 자리·스택·스트리트 */
export function shareBodyHead(spot: SpotReview): string {
  return `${spot.heroPos} vs ${spot.villainPos} · ${spot.effectiveBb}BB · ${spot.street === 'preflop' ? '프리플랍' : spot.street}`;
}

/**
 * 게시될 본문 전문. `note` 는 사용자가 확인 시트에서 고친 값을 그대로 받는다 —
 * 비우면 기본 질문으로 떨어지고, 그때는 스팟 스냅샷(jsonb)에도 메모가 실리지 않는다
 * (`toJSON` 이 빈 문자열을 떨어뜨린다).
 */
export function buildShareBody(spot: SpotReview, note: string | undefined): string {
  const head = shareBodyHead(spot);
  const n = note?.trim();
  return n ? `${head}\n\n${n}` : `${head}\n\n${SHARE_BODY_FALLBACK}`;
}

/** 확인 시트에서 게시할 스팟 — 메모는 시트에서 고친 값으로 갈아끼운다(본문·스냅샷 양쪽에 같은 값). */
export function spotWithNote(spot: SpotReview, note: string): SpotReview {
  return { ...spot, note: note.trim() };
}
