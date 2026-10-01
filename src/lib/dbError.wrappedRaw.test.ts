// 2026-10-01 독립 검토 반례 — 한글 접두로 감싼 시스템 원문이 msgOf 를 통과하던 구멍(review-dberror-1001.md §2(a)).
//   검토 시점: `저장 실패: function public.claim_voucher(uuid, integer) does not exist` 류 14개 중 12개가 그대로 화면에 나갔다
//   (한글이 한 글자라도 있으면 통과, 뒤를 막는 건 금지 목록뿐이었고 목록이 Postgres 원문 형태를 다 못 덮었다).
//   음성 대조: dbError.ts 의 SYSTEM_SIGNATURE 추가분·ENGLISH_RUN·SNAKE_IDENT·UUID 를 지우면 아래 ① 이 빨개진다.
//   양성 대조: ② 서버의 정상 한국어 문장은 계속 통과한다(아무것도 안 보이는 고장은 음성만으론 안 잡힌다).
//   기본 규칙·시스템 원문 일반은 dbError.rawHygiene.test.ts.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { msgOf } from './dbError';

afterEach(() => { vi.restoreAllMocks(); });

const FB = '저장하지 못했습니다';

describe('① 🔴 한글 접두 + 시스템 원문 — 한글이 있어도 시스템 서명이 보이면 막는다', () => {
  const WRAPPED: [string, string][] = [
    // 검토자 반례 14개(전부 code 없음 — new Error(`한글: ${error.message}`) 로 감싼 모양)
    ['함수 시그니처', '저장 실패: function public.claim_voucher(uuid, integer) does not exist'],
    ['PGRST203 함수 후보 둘', '저장에 실패했습니다: Could not choose the best candidate function between: public.unblind(p_id => uuid), public.unblind(p_id => uuid, p_mode => text)'],
    ['컬럼 모호', '저장 실패: column reference "venue_id" is ambiguous'],
    ['record 필드', '저장 실패: record "new" has no field "venue_id"'],
    ['enum 타입', '저장 실패: invalid input value for enum voucher_status: "x"'],
    ['FK 컬럼·값·테이블', '저장 실패: Key (venue_id)=(8f1c2d3e-4a5b-4c6d-8e7f-1234567890ab) is not present in table "venues".'],
    ['ON CONFLICT 제약 없음', '저장 실패: there is no unique or exclusion constraint matching the ON CONFLICT specification'],
    ['연산자 타입', '저장 실패: operator does not exist: uuid = text'],
    ['PostgREST 필터 구문', '조회 실패: "failed to parse filter (eq.)" (line 1, column 4)'],
    ['길이 초과', '저장 실패: value too long for type character varying(30)'],
    ['서브쿼리 다중 행', '저장 실패: more than one row returned by a subquery used as an expression'],
    ['Storage 크기 초과', '이미지 업로드 실패: The object exceeded the maximum allowed size'],
    ['not-null (원래 가려짐)', '저장 실패: null value in column "phone" of relation "profiles" violates not-null constraint'],
    ['RLS (원래 가려짐)', '이미지 업로드 실패: new row violates row-level security policy'],
    // 금지 목록에 없어도 형태로 막히는 것 — 새 원문이 생겨도 한글 접두로는 못 빠져나간다
    ['uuid 가 낀 한국어 문장', '매장 8f1c2d3e-4a5b-4c6d-8e7f-1234567890ab 을 찾을 수 없습니다'],
    ['목록에 없는 새 영문 원문(3단어 이상)', '저장 실패: deadlock detected while waiting for lock'],
    ['snake_case 식별자(컬럼·함수명)', '이 작업은 admin_grant_points 로만 할 수 있습니다'],
  ];

  for (const [name, text] of WRAPPED) {
    it(name, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      for (const err of [{ message: text }, new Error(text), { code: 'P0001', message: text }]) {
        const out = msgOf(err, FB);
        expect(out).toBe(FB);
        expect(out).not.toMatch(/venue_id|claim_voucher|voucher_status|unblind|constraint|ambiguous|uuid|public\./);
      }
      expect(warn).toHaveBeenCalled();                            // 원문은 버리지 않는다 — 콘솔에 남는다
    });
  }

  it('details·hint 에 한글로 감싼 시스템 원문이 실려도 꼬리로 안 붙는다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(msgOf({ details: '저장 실패: column reference "venue_id" is ambiguous' }, '등록 실패')).toBe('등록 실패');
    expect(msgOf({ hint: '참고: function public.x(uuid) does not exist' }, '등록 실패')).toBe('등록 실패');
  });
});

describe('② 🔴 양성 대조 — 서버의 정상 한국어 메시지는 그대로 나온다', () => {
  const GOOD = [
    // 서버 RAISE 7종(dbError.rawHygiene.test.ts ② 와 같은 문장)
    '마감된 장부입니다. 마감을 해제한 뒤 수정해 주세요',
    '이용권으로 승인한 바인은 삭제할 수 없습니다. 이용권 내역에서 먼저 취소해 주세요',
    '이미 종료된 대회입니다. 예약할 수 없습니다',
    '12초 뒤에 다시 올릴 수 있습니다',
    '해당 매장을 찾을 수 없습니다',
    '이미 사용된 이용권입니다',
    'QR 출석은 매장 안에서만 할 수 있습니다',
    // 영문 고유어·기호가 섞인 흔한 변형
    'NURI SPOT 은 로그인 후 저장할 수 있습니다',
    '링크는 영문 소문자·숫자·하이픈(-)으로 2~20자여야 합니다',
    '사용할 수 없는 이용권입니다',
  ];

  for (const g of GOOD) {
    it(g, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(msgOf({ code: 'P0001', message: g }, FB)).toBe(g);
      expect(msgOf(new Error(g), FB)).toBe(g);
      expect(warn).not.toHaveBeenCalled();
    });
  }
});
