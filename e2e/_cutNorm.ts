// e2e/_cutNorm.ts — tab-handoff-gate ④·⑥ 의 '한 프레임 컷' 판정(순수 함수 · Playwright 의존 없음).
//
// 왜 정규화하나(2026-10-03 L-3 · main CI 5c223417 ⑥ 390l#0 cut=6.2):
//   컷 = 연속한 두 screencast 프레임의 썸네일 차 최댓값(기준 6). 같은 페이드도 프레임 사이가 벌어지면 한 걸음이 커진다.
//   로컬(16~18ms)은 최대 3.9 인데, 느린 러너(25~35ms)는 같은 페이드가 한 걸음에 2배로 찍혀 6.2~7.3 이 됐다.
//   화면 결함이 아니라 '프레임 간격' 에 따라 값이 달라지는 판정 기준 문제다 → 걸음 ÷ (간격 ÷ 16.7ms). 기준 6 은 그대로다.
//
// 기준 시각(onset) = 떠나는 판의 퇴장 페이드가 시작된 순간(스펙의 Element.animate 스파이가 [data-pane-leaving] 안에서 처음 본 시각, epoch ms).
//   그 전에는 불투명(.999)한 복제본이 새 판을 가리고 있어, 새 판이 한 번에 드러나는 '컷' 이 있을 수 없다.
//   screencast 는 화면이 바뀔 때만 프레임을 내므로 '누르기 전 마지막 프레임 → 첫 변화 프레임' 간격은 수백 ms 일 수 있다.
//   그 간격을 그대로 나누면 어떤 컷도 사라지고, 안 나누면 전환과 무관한 변화(로컬 ④#0 — 하단바가 숨은 채 첫 탭을 누르면 복제본이 선 뒤
//   페이드 시작 110~250ms 앞서 옛 판이 6px 어긋나며 6.2 로 찍힌다. CI 는 5.5)가 컷으로 읽힌다. 그래서:
//   ① onset 보다 앞선 걸음(프레임 시각 기준 1프레임 여유)은 세지 않는다 — 전환이 시작되기 전의 화면 변화는 '판이 한 번에 바뀐 컷' 이 아니다.
//   ② 그 뒤 걸음의 간격은 max(이전 프레임, onset) 부터 잰다 — 정지 화면의 대기 시간이 간격에 섞이지 않는다.
//   ③ onset 이 없으면(떠나는 판이 안 섰다 = 즉시 교체. 9433f190 빌드: cut 9~17) 정규화도 건너뛰기도 하지 않고 원값 그대로 센다.
//   ④ 간격이 3프레임(≈50ms)을 넘으면 정규화하지 않는다 — 러너 속도가 아니라 한 번 멈췄다 튄 보이는 점프다.
//   ⑤ 간격이 1프레임보다 짧으면 1 로 나눈다(작은 간격이라고 걸음을 키우지 않는다).
export const FRAME_MS = 1000 / 60;
const MAX_NORMALIZED_FRAMES = 3;

/** 걸음 하나의 정규화 배율 — 위 ④⑤ */
export function stepScale(gapMs: number): number {
  if (!(gapMs > FRAME_MS)) return 1;
  if (gapMs > MAX_NORMALIZED_FRAMES * FRAME_MS) return 1;
  return gapMs / FRAME_MS;
}

/** 정규화한 컷(연속 프레임 걸음의 최댓값). pre 는 누르기 직전 마지막 프레임, post 는 그 뒤 프레임(시간순), onset 은 위 설명. */
export function normalizedCut<F extends { t: number }>(pre: F | undefined, post: F[], diff: (a: F, b: F) => number, onset?: number): number {
  let cut = 0;
  let prev = pre;
  for (const f of post) {
    if (prev) {
      const raw = diff(prev, f);
      if (onset === undefined) cut = Math.max(cut, raw);
      else if (f.t + FRAME_MS >= onset) cut = Math.max(cut, raw / stepScale(f.t - Math.max(prev.t, onset)));
    }
    prev = f;
  }
  return cut;
}
