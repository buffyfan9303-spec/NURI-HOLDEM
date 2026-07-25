// 대회의 '지금 상태'(예정/진행 중/종료) 단일 판정 — 카드·상세·예약 박스가 같은 기준을 쓰게 한다.
//
// 왜 '날짜'가 아니라 '시작시각 + 고정 윈도'인가:
//   · 실데이터의 대회는 19:30 시작에 레지 마감이 '16LV 01:44'(익일 새벽)다.
//     날짜만 보면 자정을 넘는 순간 '어제 대회'가 되어, 현장에서 레이트 레지 중인 손님의 예약을 막는다.
//   · 반대로 날짜만 보면 새벽에 끝난 대회를 다음날 밤까지 예약할 수 있어 유령 예약이 쌓인다.
//   · duration('25/15')·regCloseTime('16LV 01:44')은 자유 텍스트라 게이트로 파싱할 수 없다.
//   → 시작 + 10시간(19:30 → 익일 05:30)을 실질 종료로 본다. 서버 _schedule_ended 와 같은 값이라
//     '앱에선 예약 가능인데 서버가 거절'하는 어긋남이 생기지 않는다.
//     (서버는 여기에 더해 '대회 당일에는 절대 막지 않는다'는 완화가 하나 더 있다 — 화면이 서버보다
//      약간 엄격한 방향이라, 화면이 막았는데 서버가 통과시키는 반대 사고는 나지 않는다.)
export const TOURNEY_OPEN_HOURS = 10;

export type ScheduleStatus = 'upcoming' | 'live' | 'ended';

/** 시작 시각(epoch ms).
 *  왜 '+09:00' 을 문자열에 박나: 기기 시간대가 KST 가 아니어도 서버(Asia/Seoul) 판정과
 *  어긋나지 않게 하기 위함. (앱의 다른 today() 류는 기기 로컬 기준이지만, 여기는 서버와 짝을 맞춰야 한다.) */
export function startAtMs(date: string, startTime?: string | null): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const m = String(startTime ?? '').match(/^(\d{1,2}):(\d{2})/);
  // 시작시각 미입력 포스터 폴백 19:00 — 서버 _schedule_ended 의 coalesce(start_time, '19:00') 과 같은 값
  const hhmm = m ? `${m[1].padStart(2, '0')}:${m[2]}` : '19:00';
  const t = Date.parse(`${date}T${hhmm}:00+09:00`);
  return Number.isNaN(t) ? null : t;
}

/** 날짜/시작시각이 깨져 판정 불가면 'upcoming'(열어둠) — 화면을 잠그기보다 서버 게이트에 맡긴다. */
export function scheduleStatus(date: string, startTime?: string | null, now: number = Date.now()): ScheduleStatus {
  const start = startAtMs(date, startTime);
  if (start === null) return 'upcoming';
  if (now >= start + TOURNEY_OPEN_HOURS * 3_600_000) return 'ended';
  return now >= start ? 'live' : 'upcoming';
}
