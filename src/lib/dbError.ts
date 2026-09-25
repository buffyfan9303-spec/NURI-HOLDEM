// 서버가 준 실패 이유를 사람이 읽을 수 있는 한 문장으로 — 단일 소스.
//
// 왜 필요한가: 앱 곳곳(148+곳)이 `e instanceof Error ? e.message : '저장 실패'` 로 오류를 읽는다.
//   ⚠ 2026-09-13 실측 정정(독립 검증 C): 예전에 여기 "PostgrestError 는 평범한 객체라 instanceof Error 가 false" 라고 적혀
//   있었는데 **틀렸다.** 설치된 @supabase/postgrest-js 2.112.3 의 PostgrestError 는 `extends Error` 다
//   (node_modules/@supabase/postgrest-js/src/PostgrestError.ts:25 · 검사: src/lib/dbError.postgrestError.test.ts).
//   그래서 저 관용구는 두 방향으로 나쁘다 — PostgREST 오류는 instanceof 가 **참**이라 'permission denied for table …' 같은
//   DB 원문이 그대로 토스트에 나가고(보안 표준 6), 코드가 없는 객체형 오류는 여전히 '저장 실패' 로 뭉개진다.
//   서버가 알려준 진짜 이유(권한 없음 / 이미 등록됨 / 레지 마감 / 네트워크 끊김)를 사용자 문장으로 바꾸는 곳은 여기 하나다.
//   (148곳 전수 교체는 별도 작업 — 새로 쓰는 코드와 수정하는 자리에서만 msgOf 로 바꾼다.)
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

/** 인가 거부(RLS/권한) — '조회 실패'와도, '아직 없음'과도 다른 세 번째 상태.
 *  왜 따로 구분하나: 같은 빈 화면이라도 '못 불러왔다'는 다시 시도할 일이고,
 *  '권한이 없다'는 사용자가 잘못 누른 것이 아니라 계정에 권한을 받아야 하는 일이다.
 *  둘을 같은 문장으로 보여주면 직원이 자기 잘못인 줄 알고 같은 버튼을 계속 누른다. */
export function isDenied(e: unknown): boolean {
  if (e == null) return false;
  const r = asRecord(e);
  if (str(r.code) === '42501' || r.status === 403) return true;
  // 🔴 2026-09-25 FULL-ERROR-SWEEP-A ⑤: `new Error(error.message)` 로 감싼 호출부(api/auth.ts getMyLegalConsents 등)는 code 를
  //   버린다 — 그러면 여기가 false 가 되고 msgOf 는 원문 'permission denied for table legal_consents' 를 화면에 그렸다
  //   (보안 표준 6번, 보안 탭 실측). 원문 모양이 곧 42501 이므로 문장으로도 알아본다.
  return DENIED_RAW.test(rawOf(e));
}

/** Postgres 42501 원문의 모양 — code 가 버려진 뒤에도 이 문장은 남는다. */
const DENIED_RAW = /^permission denied for (?:table|function|schema|sequence|relation|view)\b/i;
const rawOf = (e: unknown): string => str(asRecord(e).message) || (e instanceof Error ? e.message : '') || str(asRecord(e).error_description);
/** 기본 fallback — 이 값 그대로면 호출부가 문맥을 안 준 것이라 권한 문장만 보여 준다. */
const DEFAULT_FALLBACK = '요청을 처리하지 못했습니다';

/**
 * Postgres 가 **스스로** 만든 오류인가 — 원문에 스키마 식별자·SQL 이 들어 있는 부류.
 *
 * SQLSTATE 는 5글자이고 앞 두 글자가 분류다. 여기 열거한 것은 전부 "서버 내부 사정"이라
 * 사용자가 문장을 읽어도 할 수 있는 일이 없다. 반대로 **제외**한 것들이 중요하다:
 *  · `P0001` — plpgsql `raise exception`, 우리가 사용자를 향해 직접 쓴 문장이다(위에서 이미 반환).
 *  · 코드가 아예 없는 오류 — 네트워크·SDK·직접 `throw new Error('…')` 는 우리가 쓴 문장이다.
 *  · `PGRST*` — PostgREST 계층. 위 switch 에서 다루고, 나머지는 식별자를 담지 않는다.
 */
function isInternalSqlState(code: string): boolean {
  // 5글자 SQLSTATE 만 해당한다(PGRST202 같은 문자열 코드는 길이가 다르다).
  if (code.length !== 5) return false;
  return /^(0[89AB]|2[0-9BDEF]|3[0-9BDF]|4[02]|5[3-8]|F0|HV|P0[234]|XX)/.test(code);
}

/** 원문은 화면에서 빼되 **버리지는 않는다** — 재현 안 되는 버그의 유일한 단서다. */
function logInternal(code: string, raw: string): void {
  try { console.warn('[db]', code || '(no code)', raw); } catch { /* 콘솔이 막힌 환경 */ }
}

/**
 * 오류 → 사용자에게 보여줄 한 문장.
 * @param fallback 아무 단서도 없을 때 쓸 기본 문구(호출부의 맥락을 담아 넘길 것 — 예: '장부 저장 실패')
 */
export function msgOf(e: unknown, fallback = DEFAULT_FALLBACK): string {
  if (e == null) return fallback;
  if (isOffline(e)) return '네트워크가 끊겼습니다. 연결을 확인하고 다시 시도해 주세요';

  const r = asRecord(e);
  const code = str(r.code);
  const raw = rawOf(e);

  // 🔴 2026-09-25 FULL-ERROR-SWEEP-A ⑤ — 권한 거부는 **문맥별 문장**이다. 종전 고정 문구('매장 담당자 계정인지 확인')는
  //   손님 화면(이용권 지갑·동의 이력)에서 틀린 안내였다. 문맥은 호출부의 fallback 이 들고 있으니 그 앞에 붙인다.
  //   원문(테이블·함수 이름)은 화면에 안 그리고 콘솔에만 남긴다. code 가 버려진 원문(위 DENIED_RAW)도 같은 길이다.
  if (code === '42501' || (!code && DENIED_RAW.test(raw))) {
    logInternal(code || '42501', raw);
    const denied = '이 계정에는 권한이 없습니다';
    return fallback && fallback !== DEFAULT_FALLBACK ? `${fallback} — ${denied}` : denied;
  }

  switch (code) {
    // 서버가 사용자를 향해 직접 쓴 문장(plpgsql raise exception) — 번역하지 않는다
    case 'P0001':
      return raw || fallback;
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

  // ⚠ 보안 표준 6번: **에러 메시지에 내부 식별자·SQL 을 노출하지 않는다.**
  //   여기까지 온 코드는 '우리가 문장을 준비하지 않은' 것이다. 그중 Postgres 가 스스로 만든 오류는
  //   원문에 테이블·컬럼·제약·함수 이름이 그대로 들어 있다
  //   (42P01 relation "secret_settings" does not exist / 42703 column "ci_hash" ... ).
  //   그걸 화면에 그리면 공개 저장소 구조 위에서 **스키마를 그대로 알려 주는 꼴**이다.
  //   실제로 `LoadErrorCard` 가 이 값을 DOM 에 그리고 있고, 이벤트 판처럼 **비로그인도 닿는 화면**이 있다.
  //
  //   그렇다고 전부 삼키면 이 파일이 막으려던 '전부 저장 실패로 뭉개짐'이 되돌아온다. 그래서 나눈다:
  //   화면에는 행동 가능한 문장만, 원문은 **콘솔로만** 남겨 재현 안 되는 버그의 단서를 유지한다.
  if (raw && !isInternalSqlState(code)) return raw;
  if (raw) logInternal(code, raw);
  // 모르는 오류를 '실패'로 뭉개면 원인 추적이 끊긴다 — 단서를 최소한 남긴다.
  const detail = str(r.details) || str(r.hint);
  if (!detail) return fallback;
  // `details` 는 원문보다 더 노골적이다 — `Key (venue_id)=(…) is not present in table "venues"` 처럼
  // 컬럼·값·테이블을 한 줄에 담는다. 같은 기준으로 거른다.
  if (isInternalSqlState(code)) { logInternal(code, detail); return fallback; }
  return `${fallback} (${detail})`;
}
