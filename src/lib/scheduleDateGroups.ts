/**
 * 일정 목록의 **날짜 구분 머리말** — 경계 판정 정본.
 *
 * 왜 필요한가 (2026-09-20)
 *   오너 지시로 목록 카드에서 날짜 표기를 뺐다(커밋 aa35d60). 그 결과 홈·일정탐색이
 *   **날짜 구분이 없는 평면 목록**이 됐다 — 실측: 홈 3장이 9/20 · 9/20 · 9/21 인데 화면상 구분이 없다.
 *   오너가 목업을 보고 "날짜 그룹 머리말 추가" 를 골랐다.
 *
 * 🔴 왜 컴포넌트 안이 아니라 여기인가
 *   경계 판정은 "**이전 항목과 날짜가 다른가**" 라서 카드 하나만 봐서는 못 한다 — 배열을 도는
 *   `map` 레벨에서만 알 수 있다. 소비처가 3곳(홈 · 일정탐색 리스트 · 표모드 모바일 대체)이라
 *   각자 구현하면 곧바로 정본이 셋이 된다(`.claude/skills/nuri-single-source`).
 *
 * ⚠ 그리드 카드와 PC 표는 **대상이 아니다.** 둘은 날짜를 지금도 그대로 보여 준다
 *   (ScheduleCard.tsx GridCard 하단 오버레이 · ScheduleTable 의 '일시' 열).
 *   2026-09-20 의 '날짜를 빼라' 지시는 목록 카드(ListCard) 한 곳에만 적용됐다.
 */

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** `2026-09-20` → `9/20 (일)`. 오너가 고른 목업의 표기를 그대로 쓴다. */
export function dateHeaderLabel(iso: string): string {
  // ⚠ `new Date('2026-09-20')` 은 **UTC 자정**으로 파싱된다 — KST(+9)에서는 같은 날이지만
  //   이 저장소는 KST 경계에서 하루가 밀리는 사고를 여러 번 겪었다(CI 시간대 기록 참고).
  //   그래서 문자열을 직접 쪼개 로컬 날짜로 만든다 — 시간대에 영향받지 않는다.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${m}/${d} (${DOW[new Date(y, m - 1, d).getDay()]})`;
}

/**
 * `i` 번째 항목 **위에** 머리말을 그려야 하면 그 라벨을, 아니면 `null`.
 *
 * @param enabled 끄면 항상 `null`. 🔴 **'가까운 순'(거리 정렬)에서는 반드시 꺼라** —
 *   `lib/scheduleSort.ts` 의 거리 우선 정렬은 날짜를 **비단조**로 만든다. 그대로 두면
 *   같은 날짜 머리말이 목록 중간에 여러 번 반복되고 그룹이 잘게 쪼개진다(반증 지적).
 *   날짜로 묶는 것이 의미가 있으려면 **날짜순으로 정렬돼 있어야** 한다.
 */
export function dateHeaderAt(
  list: readonly { date: string }[],
  i: number,
  enabled = true,
): string | null {
  if (!enabled) return null;
  const cur = list[i]?.date;
  if (!cur) return null;
  // 첫 항목은 항상 머리말을 단다 — 없으면 첫 그룹만 이름이 없어 "이건 무슨 날짜지?" 가 된다.
  if (i === 0) return dateHeaderLabel(cur);
  return list[i - 1]?.date === cur ? null : dateHeaderLabel(cur);
}

/**
 * 이 배열에 머리말이 **몇 개** 붙는지. 스켈레톤이 자리를 예약할 때 쓴다.
 * ⚠ 데이터가 오기 전에는 그룹 수를 알 수 없다 — 그래서 스켈레톤은 이 값이 아니라
 *   '있을 수 있다' 는 여유폭 근사를 쓴다(소비처 주석 참고).
 */
export function countDateHeaders(list: readonly { date: string }[], enabled = true): number {
  if (!enabled || list.length === 0) return 0;
  let n = 1;
  for (let i = 1; i < list.length; i++) if (list[i].date !== list[i - 1].date) n++;
  return n;
}
