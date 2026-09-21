// FINAL-QR#PRINT-A-B (2026-09-21) — 매장 비치 QR 인쇄의 A→B 경합 판정 **한 곳**.
//
// 무엇이 고장나 있었나 (VoucherManageModal.tsx printQr, 종전):
//   const forVenue = venueId;                 // ← 이 렌더의 클로저 값
//   const imgs = await Promise.all(...);
//   if (forVenue !== venueId) { ...막음... }   // ← venueId 도 **같은 클로저의 같은 변수**
//   두 피연산자가 한 렌더 안에서 얼어붙은 동일 값이라 관리자가 A→B 로 바꿔도 비교는 **영원히 거짓**이었다.
//   가드 문장은 있는데 막는 것은 0이다. `qrVenueGuard.contract.test.ts:55-60` 은 `forVenue !== venueId`
//   라는 **문자열이 있는지만** 봤기 때문에 이 거짓 통과를 그대로 초록으로 보고했다.
//
// 그래서 `await` 뒤에 볼 값은 **호출 시점에 평가되는 getter**여야 한다. 그게 이 함수의 전부다 —
// 여기서만 `current()` 를 부르고, 소비처는 최신 ref 를 읽는 getter 를 넘긴다(언마운트면 null).
//
// 왜 별도 모듈인가: 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다(jsdom·@testing-library 모두 미설치,
//   vitest environment='node'). 컴포넌트 안에 두면 "역순 resolve 로 A 를 실제로 낡게 만드는" 행동 검증을
//   **영원히 할 수 없다**. 판정만 떼어 내면 deferred Promise 두 개로 진짜 경합을 재현할 수 있다
//   (venueQrPrint.test.ts). 남은 배선(컴포넌트가 이 함수를 쓰는가 · `window.open` 이 가드 뒤인가)은
//   qrVenueGuard.contract.test.ts 의 소스 계약이 잠근다.

/**
 * `jobs` 를 모두 실행하되, **끝난 시점의 매장**이 `captured` 와 다르면 결과를 버리고 `null`.
 *
 * @param captured 인쇄 버튼을 누른 순간의 매장 id.
 * @param current  **호출될 때마다** 지금 매장을 돌려주는 getter. 언마운트됐으면 `null`.
 *                 ⚠ 값(string)이 아니라 함수여야 한다 — 값으로 받으면 위의 클로저 버그가 그대로 재현된다.
 * @returns 같은 매장이면 결과 배열, 바뀌었거나 언마운트됐으면 `null`.
 */
export async function buildQrForVenue<T>(
  captured: string,
  current: () => string | null,
  jobs: readonly (() => Promise<T>)[],
): Promise<T[] | null> {
  const out = await Promise.all(jobs.map((job) => job()));
  return current() === captured ? out : null;
}
