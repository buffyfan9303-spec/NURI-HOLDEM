// 서버가 준 실패 이유를 사람이 읽을 수 있는 한 문장으로 — 단일 소스.
//
// 왜 필요한가: 앱 곳곳(148+곳)이 `e instanceof Error ? e.message : '저장 실패'` 로 오류를 읽는다.
//   그런데 Supabase 가 던지는 PostgrestError 는 **평범한 객체**라 instanceof Error 가 false 다.
//   결과적으로 서버가 알려준 진짜 이유(권한 없음 / 이미 등록됨 / 레지 마감 / 네트워크 끊김)가
//   전부 '저장 실패' 한 문장으로 뭉개졌다 — 현장에서 '다시 누르면 되는 상황'인지
//   '눌러도 소용없는 상황'인지 구분할 수 없었다.
//
// 설계 원칙:
//  · 서버가 의도적으로 쓴 메시지(plpgsql raise exception, code P0001)는 **그대로 보여준다**.
//    '이미 종료된 대회입니다' 같은 문장은 이미 사용자를 향해 쓰인 것이라 번역하면 오히려 나빠진다.
//  · 사용자가 바꿀 수 없는 기술 코드(42501 등)만 행동 가능한 문장으로 옮긴다.
//  · 모르는 오류는 삼키지 말고 원문을 남긴다 — 재현 안 되는 버그를 잡을 유일한 단서다.

/** Supabase/PostgREST 오류의 알려진 모양(전부 optional — 어떤 필드가 올지 보장되지 않는다) */
interface DbErrorish {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  error_description?: unknown;
  status?: unknown;
}

const asRecord = (e: unknown): DbErrorish => (e && typeof e === 'object' ? e as DbErrorish : {});
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** 네트워크 자체가 끊긴 경우 — 이건 '다시 시도하면 되는' 유일한 부류라 따로 구분한다 */
export function isOffline(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = str(asRecord(e).message) || (e instanceof Error ? e.message : '');
  return /failed to fetch|networkerror|network request failed|load failed|ERR_INTERNET/i.test(m);
}

/**
 * 오류 → 사용자에게 보여줄 한 문장.
 * @param fallback 아무 단서도 없을 때 쓸 기본 문구(호출부의 맥락을 담아 넘길 것 — 예: '장부 저장 실패')
 */
export function msgOf(e: unknown, fallback = '요청을 처리하지 못했습니다'): string {
  if (e == null) return fallback;
  if (isOffline(e)) return '네트워크가 끊겼습니다. 연결을 확인하고 다시 시도해 주세요';

  const r = asRecord(e);
  const code = str(r.code);
  const raw = str(r.message) || (e instanceof Error ? e.message : '') || str(r.error_description);

  switch (code) {
    // 서버가 사용자를 향해 직접 쓴 문장(plpgsql raise exception) — 번역하지 않는다
    case 'P0001':
      return raw || fallback;
    case '42501':
      return '권한이 없습니다. 매장 담당자 계정인지 확인해 주세요';
    case '23505':
      return '이미 등록된 값입니다';
    case '23503':
      return '연결된 정보가 없어 처리하지 못했습니다(먼저 상위 항목을 만들어 주세요)';
    case '23514':
      return '입력값이 허용 범위를 벗어났습니다';
    case '22P02':
      return '입력 형식이 올바르지 않습니다';
    case 'PGRST301':
      return '로그인이 만료되었습니다. 다시 로그인해 주세요';
    case 'PGRST202':
      // 앱 버전과 서버 함수가 어긋난 상태. 사용자가 할 수 있는 건 새로고침뿐이다.
      return '앱이 최신이 아닙니다. 새로고침 후 다시 시도해 주세요';
    default:
      break;
  }

  // 코드가 없더라도 서버가 남긴 문장이 있으면 그게 가장 정확하다.
  if (raw) return raw;
  // 모르는 오류를 '실패'로 뭉개면 원인 추적이 끊긴다 — 단서를 최소한 남긴다.
  const detail = str(r.details) || str(r.hint);
  return detail ? `${fallback} (${detail})` : fallback;
}
