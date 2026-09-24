// src/lib/nicknameCooldown.ts — '30일에 한 번' 변경 제한의 화면 쪽 판정 한 곳.
//
// 서버가 정본이다: 트리거 trg_profiles_nickname_rules(20260924k)가 profiles.nickname_changed_at 으로 판정한다
// (그 전에는 name 기준 enforce_nickname_cooldown · 20260603f). 식은 같다 —
//   관리자 면제 · 기록(changed_at)이 없으면 바로 가능 · 있으면 그 시각 + 30일부터 가능.
// 화면은 그 식을 미러해 입력칸을 막고 날짜를 알려 줄 뿐, 막는 것은 서버다.

export const NICK_COOLDOWN_DAYS = 30;
const COOLDOWN_MS = NICK_COOLDOWN_DAYS * 86_400_000;

/** 다음 변경 가능 시각(ms). 지금 바꿀 수 있으면 null. */
export function nextChangeAt(changedAt: string | null | undefined, isAdmin: boolean, now: number = Date.now()): number | null {
  if (isAdmin || !changedAt) return null;
  const t = new Date(changedAt).getTime() + COOLDOWN_MS;
  return Number.isFinite(t) && now < t ? t : null;
}

/** KST 기준 'M월 D일' — 서버 오류 문구(Asia/Seoul)와 같은 날짜가 나오게 로컬 시간대를 쓰지 않는다. */
export function kstMonthDay(ms: number): string {
  const d = new Date(ms + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 입력칸 아래 공지 한 줄. subject 는 조사까지(예: '닉네임은'). */
export function cooldownNotice(subject: string, next: number | null): string {
  return `${subject} ${NICK_COOLDOWN_DAYS}일에 한 번 변경할 수 있어요${next ? ` · 다음 변경 가능: ${kstMonthDay(next)}` : ''}`;
}
