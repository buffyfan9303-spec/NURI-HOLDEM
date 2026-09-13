// 포스터의 등록 마감 '레벨' 파싱 — 정의는 여기 한 곳이다 (2026-09-13).
//
// 왜 여기에 모으나: 포스터는 등록 마감을 `regCloseTime` 자유 텍스트('16LV 00:12')에 담는데,
//   이 문자열에서 레벨 숫자를 뽑는 코드가 이미 두 벌로 갈려 있었고 **규칙이 서로 달랐다**:
//     · ScheduleCard.regCloseText      — /(\d+)\s*LV/i  (LV 형태만)
//     · ScheduleDetailModal.BlindStructure — /\d+/      (아무 숫자나 → '22:00' 을 22레벨로 읽었다)
//   그리고 세 번째 소비처가 될 gameInherit(포스터→클락 상속)이 이 파싱을 또 만들 참이었다.
//   msToRegClose 가 세 벌로 갈려 F2 수정이 한 벌에만 들어간 사고와 같은 부류다(regStatus.contract.test.ts).
//
// 규칙(둘로 갈려 있던 것을 좁은 쪽으로 통일한다): **'NNLv' 형태에서만** 레벨을 뽑는다.
//   시각만 있는 형태('22:00')는 레벨이 아니라 시각이다 — 레벨로 읽으면 22레벨이라고 단언해 버린다.
//
// ⚠ 의존성 없음(순수 문자열). 첫 화면 임계 경로에서도 안전하게 import 할 수 있다.

/** `regCloseTime`('16LV 00:12') → 등록 마감 레벨. 'NNLv' 형태가 없으면 null(= 판정 불가, 마감 아님). */
export function regCloseLevelFromText(regCloseTime: string | null | undefined): number | null {
  const m = String(regCloseTime ?? '').match(/(\d+)\s*LV/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 포스터 1건의 등록 마감 **레벨 정본** — 소비처 전부가 이 하나를 쓴다 (2026-09-13).
 *
 *  왜 우선순위가 `regCloseTime` 인가(뒤집은 이유):
 *   · `regCloseTime` 은 앱이 실제로 쓰는 **유일한** 입력이다 — PosterFormModal.submit 이
 *     `[레벨?'NNLV':'', 시각].join(' ')` 로 조립해 저장하고, 업주가 유저에게 광고하는 값이며
 *     카드(regCloseText)·상세 '레지 마감' 줄이 그대로 보여 준다.
 *   · `structure.lateRegLevels` 를 **쓰는 앱 코드는 없다**(2026-09-13 실측: src/mock/data.ts 뿐).
 *     실데이터에서는 항상 undefined 라 폴백으로만 의미가 있다.
 *   · 뒤집기 전에는 소비처마다 답이 갈렸다(실측: 카드 16 · 블라인드 표 16 · 상세 InfoRow 20 ·
 *     상속 20). 유저가 보는 쪽(카드)이 정본이므로 그쪽으로 통일한다.
 *
 *  없으면 null — 소비처는 **키를 만들지 않거나** 자기 기본값으로 떨어진다
 *  (`{ ...baseCfg, ...patch }` 에 undefined 를 실으면 업주 수기값을 덮는다). */
export function regCloseLevelOf(
  sc: { regCloseTime?: string | null; structure?: { lateRegLevels?: number } | null } | null | undefined,
): number | null {
  const fromText = regCloseLevelFromText(sc?.regCloseTime);
  if (fromText) return fromText;
  const n = sc?.structure?.lateRegLevels;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}
