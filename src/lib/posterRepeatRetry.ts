// H03-07 / SP05 — 포스터 반복 등록의 부분 실패 재시도가 성공한 날짜를 다시 넣던 결함.
//
// 서버(schedules)에는 날짜·매장·제목 unique 도, 클라이언트 멱등키도 없다(마이그레이션 전수 grep — unique 는
// ledger_*·staff_schedule·checkin 뿐). 그래서 "날짜별 정확히 1건" 은 **클라이언트가** 지켜야 한다:
//   ① 이미 성공한 날짜는 다시 보내지 않는다(savedDates).
//   ② 지난 시도에서 실패로 끝난 날짜는 응답만 잃고 서버엔 저장됐을 수 있다 → 다시 읽은 목록에 같은
//      (매장·작성자·날짜·제목·시작 시각) 행이 있으면 '이미 저장됨' 으로 본다. 첫 시도에는 적용하지 않는다
//      (같은 날 같은 제목을 일부러 두 번 여는 경우를 막지 않기 위해).

export interface RepeatTwinKey { venueId: string; ownerId: string; title: string; startTime: string }
interface ScheduleLike { venueId?: string | null; ownerId?: string | null; title: string; startTime: string; date: string }

/** 이번 시도에 실제로 보낼 날짜 — 이미 성공한 날짜와, 지난 실패가 서버엔 들어간 날짜를 뺀다. */
export function planRepeatDates(
  dates: readonly string[],
  savedDates: readonly string[] = [],
  retryDates: readonly string[] = [],
  serverRows: readonly ScheduleLike[] = [],
  key?: RepeatTwinKey,
): { send: string[]; landed: string[] } {
  const saved = new Set(savedDates);
  const retry = new Set(retryDates);
  const send: string[] = [];
  const landed: string[] = [];
  // 서버는 assertScheduleTitle 로 trim 한 제목을 저장한다 — 폼 원문 그대로 비교하면 ' 데일리 ' 가 늘 빗나가 중복 insert.
  const title = key?.title.trim();
  for (const d of new Set(dates)) {           // 같은 날짜가 두 번 들어와도 한 번만
    if (saved.has(d)) continue;
    if (key && retry.has(d) && serverRows.some((s) =>
      (s.venueId ?? '') === key.venueId && (s.ownerId ?? '') === key.ownerId
      && s.title.trim() === title && s.startTime === key.startTime && dayOf(s.date) === d)) {
      landed.push(d);
      continue;
    }
    send.push(d);
  }
  return { send, landed };
}

function dayOf(date: string): string { return date.length > 10 ? date.slice(0, 10) : date; }
