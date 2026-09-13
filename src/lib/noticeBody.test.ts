// UI-01(2026-09-13) — 공지 본문 구조화 파서의 원문 보존 계약.
//
// 왜: NoticeDetailModal 은 본문을 단일 <p whitespace-pre-wrap> 으로 그려 문단·번호 항목이 한 덩어리였다.
//   실행문 §8.1 은 line-height 를 키우는 대신 문단과 번호 항목을 나누라고 했고, 동시에 **원문 보존**이 절대 조건이다:
//   빈 줄 = 문단 경계, 문장 안 개행은 보존, 줄 시작의 `1)`·`2.` 같은 확실한 항목만 구조화, 이어지는 줄은 같은 항목.
//   `1.5`·날짜·괄호 숫자·URL·문장 중간 숫자는 목록으로 쪼개지 않는다.
// 이 파일이 보는 것: ① 위 사례가 섞인 원문에서 **비어 있지 않은 줄의 내용·순서·번호가 전부 그대로**(라운드트립)
//   ② 항목/문단 경계가 의도대로 갈린다 ③ 위험 사례(소수·날짜·괄호·중간 숫자)가 항목이 되지 않는다.
// 못 보는 것: 화면의 간격·줄바꿈 — e2e/notice-body.spec.ts 가 실화면에서 본다.
// 음성 대조: noticeBody.ts 의 ITEM 정규식에서 `\s+` 를 `\s*` 로 바꾸면 '1.5' 케이스가, `\d{1,2}` 를 `\d+` 로 바꾸면 날짜 케이스가 실패한다.
// 실행: npx vitest run src/lib/noticeBody.test.ts
import { describe, it, expect } from 'vitest';
import { parseNoticeBody, noticeBlocksToLines } from './noticeBody';

const URL = 'https://example.com/tournaments/2026/seoul-main-event-registration-and-schedule?utm_source=nuri&utm_campaign=verylongparam';
const BODY = [
  '안녕하세요. NURI HOLDEM 운영팀입니다.',
  '2026. 9. 13 부터 아래 내용이 적용됩니다.',
  '',
  '',                                   // 연속 빈 줄 — 문단 경계 하나로만 읽힌다
  '1) 참가비는 1.5배 이벤트 기간에도 그대로입니다.',
  '   자세한 안내는 매장 페이지를 참고하세요.',   // 이어지는 줄(들여쓰기 포함) — 1) 에 속한다
  '2) 만 19세 미만은 이용할 수 없습니다 (도박문제 상담 1336).',
  '3. 문의: ' + URL,
  '',
  '1.5시간 이상 지연 시 환불 규정은 별도 안내드립니다.',
  '(2) 이런 괄호 숫자는 항목이 아닙니다. 3) 문장 중간의 번호도 아닙니다.',
  '12) 두 자리 번호는 항목입니다.',
  '',                                   // ⚠ 빈 줄이 없으면 아래 줄은 12) 의 이어지는 줄이 된다(그게 규칙이다)
  '123) 세 자리는 항목이 아닙니다.',
].join('\n');

describe('parseNoticeBody — 원문 보존', () => {
  it('🔴 비어 있지 않은 모든 줄이 내용·순서·번호 그대로 되돌아온다(라운드트립)', () => {
    const expected = BODY.split('\n').filter((l) => l.trim() !== '');
    expect(noticeBlocksToLines(parseNoticeBody(BODY))).toEqual(expected);
  });

  it('🔴 CRLF 원문도 같은 결과다(저장→조회 경로의 개행 차이에 흔들리지 않는다)', () => {
    expect(parseNoticeBody(BODY.replace(/\n/g, '\r\n'))).toEqual(parseNoticeBody(BODY));
  });

  it('빈 줄은 문단 경계이고, 연속 빈 줄은 경계 하나다 · 문장 안 개행은 문단 안에 남는다', () => {
    const blocks = parseNoticeBody(BODY);
    expect(blocks[0]).toEqual({ kind: 'p', lines: ['안녕하세요. NURI HOLDEM 운영팀입니다.', '2026. 9. 13 부터 아래 내용이 적용됩니다.'] });
    // 문단 → 목록 → 문단 → 목록(12) → 문단(123) 의 다섯 블록
    expect(blocks.map((b) => b.kind)).toEqual(['p', 'list', 'p', 'list', 'p']);
  });

  it('🔴 줄 시작의 `1)`·`2)`·`3.` 만 항목이고, 이어지는 줄은 같은 항목에 속한다', () => {
    const list = parseNoticeBody(BODY)[1];
    expect(list.kind).toBe('list');
    if (list.kind !== 'list') return;
    expect(list.items.map((i) => i.marker)).toEqual(['1)', '2)', '3.']);
    expect(list.items[0].lines).toEqual(['참가비는 1.5배 이벤트 기간에도 그대로입니다.', '   자세한 안내는 매장 페이지를 참고하세요.']);
    expect(list.items[2].lines[0]).toBe('문의: ' + URL);
  });

  it('🔴 소수(1.5)·날짜(2026.)·괄호 숫자·문장 중간 번호·세 자리 번호는 항목이 되지 않는다', () => {
    const blocks = parseNoticeBody(BODY);
    const p3 = blocks[2];
    expect(p3).toEqual({ kind: 'p', lines: [
      '1.5시간 이상 지연 시 환불 규정은 별도 안내드립니다.',
      '(2) 이런 괄호 숫자는 항목이 아닙니다. 3) 문장 중간의 번호도 아닙니다.',
    ] });
    expect(blocks[3]).toEqual({ kind: 'list', items: [{ marker: '12)', gap: ' ', indent: '', lines: ['두 자리 번호는 항목입니다.'] }] });
    expect(blocks[4]).toEqual({ kind: 'p', lines: ['123) 세 자리는 항목이 아닙니다.'] });
    // 첫 문단의 날짜 줄은 문단에 남아 있다
    expect(blocks[0].kind === 'p' && blocks[0].lines[1].startsWith('2026.')).toBe(true);
  });

  it('빈 본문·공백뿐인 본문은 블록 0개', () => {
    expect(parseNoticeBody('')).toEqual([]);
    expect(parseNoticeBody('\n  \n')).toEqual([]);
  });
});
