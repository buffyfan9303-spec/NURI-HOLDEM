// src/api/_mustAffect.ts — "쓰기가 실패했는데 화면이 '성공'이라고 말한다" 부류의 단일 통로
//
// PostgREST 는 RLS 가 막은 UPDATE/DELETE 를 **오류가 아니라 0행**으로 돌려준다(HTTP 200 · error: null).
// `.select()` 없이 쓰면 클라이언트는 성공으로 읽는다. 이 저장소에서 같은 결함이 두 번 났다:
//   ① approveOwner(2026-09-12) — 회원 승인이 0행 200 으로 통과해 관리자 화면만 '승인됨'이었다.
//   ② deletePost(F15, 2026-09-13) — 권한 없는 운영자가 눌러도 '삭제되었습니다' 가 뜨고
//      낙관적 갱신으로 화면에서도 사라져 새로고침 전까지 아무도 몰랐다.
// 두 번 났다는 것은 개별 수정이 아니라 **전수와 계약**이 필요하다는 뜻이다. 그래서 통로를 하나로 모으고,
// `mutationAffected.contract.test.ts` 가 src/api 의 `.update(`/`.delete(` 전수를 이 통로(또는 사유가 적힌
// 허용 목록)에 못 박는다. 새 변이를 추가하면 그 테스트가 먼저 묻는다: "0행이면 사용자가 거짓을 믿는가?"
//
// 왜 `.select()`(= *) 이고 `.select('id')` 가 아닌가: clock_states·staff_wage·venue_follows·post_reactions 같은
//   복합키 테이블은 id 컬럼이 없을 수 있다. `RETURNING id` 가 42703 으로 터지면 **쓰기 자체가 롤백**돼
//   기능이 죽는다(CLAUDE.md 3: 기능 보존). 행 수만 필요하므로 컬럼 이름에 의존하지 않는다.
// 왜 error 를 그대로 던지나: PostgrestError 는 Error 를 상속한다(postgrest-js/src/PostgrestError.ts).
//   호출부의 `e instanceof Error ? e.message : …` 도, msgOf 도 종전과 같은 문장을 본다.
// 왜 결과를 돌려주지 않나: 호출부가 행을 쓰기 시작하면 `.select()` 컬럼이 계약이 되고, 그러면 위 id 함정이 돌아온다.

export const NO_ROWS_MESSAGE = '권한이 없거나 이미 바뀐 항목입니다. 화면을 새로 불러와 확인해 주세요';

/** 서버가 오류 없이 0행을 돌려줬다 — 권한 거부·이미 지워짐·대상 없음. 화면이 성공을 말하면 안 된다. */
export class NoRowsAffectedError extends Error {
  constructor(message = NO_ROWS_MESSAGE) {
    super(message);
    this.name = 'NoRowsAffectedError';
  }
}

/** `.update(…)….eq(…)` / `.delete()….eq(…)` 필터 빌더 — `.select()` 로 반영 행을 돌려받을 수 있으면 된다. */
interface Mutation {
  select(): PromiseLike<{ data: unknown[] | null; error: Error | null }>;
}

/**
 * UPDATE/DELETE 를 보내고 **실제로 바뀐 행이 있는지**까지 확인한다.
 *  · 서버 오류 → 그대로 던진다(종전 `if (error) throw error` 와 동일).
 *  · 0행     → NoRowsAffectedError(한국어 한 문장 · msgOf 를 그대로 통과).
 * @param message 맥락이 필요한 자리만 넘긴다(예: 장부 마감). 기본 문장이 대부분의 화면에 맞는다.
 */
export async function mustAffect(q: Mutation, message?: string): Promise<void> {
  const { data, error } = await q.select();
  if (error) throw error;
  if (!data || data.length === 0) throw new NoRowsAffectedError(message);
}

/**
 * 멱등 토글의 **끄는 쪽** 전용 통로 — 찜 해제·언팔로우·반응 취소·차단 해제.
 *
 * 왜 따로 있나(2026-09-13 검증 FAIL ①): 켜는 쪽은 upsert / 23505 무시로 "이미 켜져 있음" 을 성공으로 흡수하는데,
 *   끄는 쪽만 mustAffect 로 "0행 = 실패" 를 적용하니 **되돌림이 서버와 반대 방향**을 그렸다 — 다른 기기·탭에서
 *   먼저 해제된 찜을 다시 해제하면 호출부가 setLiked(!next) 로 되돌려 하트가 '찜함' 으로 되살아났다(서버엔 찜이 없다).
 *   "화면이 거짓을 말하지 않게" 하려던 스윕이 같은 부류의 거짓을 반대 방향으로 만든 것이다.
 *   **OFF 의 0행은 "이미 그 상태"** 다. 켜기와 대칭이 되려면 성공으로 흡수해야 한다.
 *  · 서버 오류 → 그대로 던진다(mustAffect 와 같다 — error 로 오는 거부는 여전히 드러난다).
 *  · 0행     → 성공. false 를 돌려준다(실제로 지운 행이 없었다).
 *  · 1행 이상 → 성공. true.
 *
 * ⚠ **본인 행**(user_id = auth.uid() 로 필터한 행)에만 쓴다. 남의 행·매장 행의 삭제는 RLS 거부가 0행으로
 *   위장하므로 mustAffect 로 남긴다. 새 사용처는 mutationAffected.contract.test.ts 의 IDEMPOTENT_OFF 에
 *   **켜는 쪽 짝**을 적어야 통과한다 — 허용 목록에 그냥 올리는 것과는 다르다(짝이 없으면 대칭이 아니다).
 */
export async function idempotentOff(q: Mutation): Promise<boolean> {
  const { data, error } = await q.select();
  if (error) throw error;
  return !!data && data.length > 0;
}
