// src/lib/seenCount.ts — "지난 방문에 이 목록이 몇 줄이었나"를 기억해 **스켈레톤 자리를 그만큼 예약**한다.
//
// 왜 필요한가: 스켈레톤을 고정 개수로 그리면 실제가 그보다 많든 적든 데이터 도착 순간 그 차이만큼
//   아래가 통째로 밀린다(CLS). 2026-09-10 용량·모션 점검에서 '툭'의 최대 단일 원인으로 지목됐고,
//   홈은 그때 이 조리법으로 고쳤다. 2026-09-17 감사에서 **일정 탐색이 같은 병을 그대로 갖고 있는 것**이
//   확인돼(스켈레톤 6행 고정 642px vs 실제 232px) 조리법을 여기로 꺼낸다.
//
// 왜 lib 인가: 같은 계산이 두 벌이 되는 순간 한쪽만 고쳐지는 날이 온다(`nuri-single-source`).
//   홈의 `upcomingSeenCount`·`openNowSeenCount` 와 일정 탐색이 **같은 함수**를 쓴다.
//
// ⚠ 저장소 읽기는 반드시 try/catch 다 — 사파리 프라이빗·쿠키 차단에서 `localStorage` 접근 자체가
//   던진다(`nuri-async-guard` 가 기록한 흰 화면 부류). 실패하면 조용히 기본값으로 떨어진다.

export interface SeenCountOptions {
  /** 저장된 값이 없거나 못 읽을 때 쓸 값. **지금까지의 동작과 같은 수**를 넣어야 회귀가 없다. */
  fallback: number;
  /** 아래로 자를 값(보통 0 또는 1). */
  min: number;
  /** 위로 자를 값 — 스켈레톤이 화면을 넘길 만큼 길어지는 것을 막는다. */
  max: number;
}

/** 지난 방문의 줄 수를 읽는다. 범위를 벗어나거나 숫자가 아니면 `fallback`. */
export function readSeenCount(key: string, { fallback, min, max }: SeenCountOptions): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  } catch {
    return fallback;
  }
}

/** 이번에 실제로 그린 줄 수를 기억한다. 범위 밖 값은 저장하지 않는다(다음 방문에 되살아나므로). */
export function writeSeenCount(key: string, n: number, { min, max }: Omit<SeenCountOptions, 'fallback'>): void {
  if (!Number.isFinite(n)) return;
  try {
    localStorage.setItem(key, String(Math.min(Math.max(n, min), max)));
  } catch {
    /* 저장 못 해도 화면은 그대로 돈다 — 다음 방문에 기본값을 쓸 뿐이다. */
  }
}
