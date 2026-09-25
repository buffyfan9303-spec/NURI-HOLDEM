// NURI SPOT '이 스팟 날짜' — 오늘(KST) 이후는 오늘로 접는다.
// 🔴 2026-09-25 전수 스윕(design-reviewer): 작성 단계 <input type=date max=오늘> 은 프로그램·키보드 입력 2099-12-31 을
//   그대로 저장했고(validity.valid=false 를 아무도 안 봤다), 내 스팟 행 입력에는 max 자체가 없었다. 서버 CHECK 는 2000~2100 뿐.
//   두 화면(SpotReport·MySpotList)이 저장 직전에 이 한 함수를 거친다 — 날짜 규칙을 두 벌 두면 또 갈린다.
import { kstToday } from './kst';

/** YYYY-MM-DD 가 아니거나 비었으면 오늘, 오늘 이후면 오늘. (ISO 날짜 문자열은 사전순 비교가 곧 날짜 비교다.) */
export function clampSpotDate(v: string | null | undefined, now: number = Date.now()): string {
  const today = kstToday(now);
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return today;
  return v > today ? today : v;
}
