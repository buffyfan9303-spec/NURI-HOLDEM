// 조사 선택 — `을(를)` 을 화면에서 없앤다.
//
// 이 규칙이 틀리면 실패 화면·확인창처럼 **이미 불안한 순간**에 어색한 문장이 나온다.
// 판단 불가일 때 `을(를)` 로 돌아가지 않는 것(조사를 생략한다)까지 계약이다.
import { describe, it, expect } from 'vitest';
import { josa, withJosa } from './josa';

describe('한글 받침', () => {
  it('🔴 받침이 있으면 을·은·이·과·으로', () => {
    expect(withJosa('이벤트판', '을')).toBe('이벤트판을');
    expect(withJosa('직원', '은')).toBe('직원은');
    expect(withJosa('장부', '이')).toBe('장부가');   // 부 = 받침 없음
    expect(withJosa('클락', '이')).toBe('클락이');
    expect(withJosa('이용권', '과')).toBe('이용권과');
    expect(withJosa('현금', '으로')).toBe('현금으로');
  });

  it('🔴 받침이 없으면 를·는·가·와·로', () => {
    expect(withJosa('이벤트', '을')).toBe('이벤트를');   // 보고된 버그: '이벤트을(를)' 로 나왔다
    expect(withJosa('매장', '을')).toBe('매장을');
    expect(withJosa('포스터', '을')).toBe('포스터를');
    expect(withJosa('데이터', '은')).toBe('데이터는');
    expect(withJosa('시드', '과')).toBe('시드와');
    expect(withJosa('카드', '으로')).toBe('카드로');
  });

  it('종성 주기 경계 — 가(받침 없음)와 각(받침 있음)', () => {
    expect(josa('가', '을')).toBe('를');
    expect(josa('각', '을')).toBe('을');
    expect(josa('힣', '을')).toBe('을');
  });

  it('뒤 공백은 무시한다 — 템플릿에서 흔히 섞인다', () => {
    expect(withJosa('이벤트 ', '을')).toBe('이벤트 를');
  });
});

describe('숫자·영문으로 끝나는 이름 — 읽는 소리로 판단한다', () => {
  it('🔴 숫자', () => {
    // 0영 1일 3삼 6육 7칠 8팔 = 받침 있음 / 2이 4사 5오 9구 = 없음
    expect(josa('테이블 1', '이')).toBe('이');
    expect(josa('테이블 2', '이')).toBe('가');
    expect(josa('시즌 3', '을')).toBe('을');
    expect(josa('레벨 5', '을')).toBe('를');
    expect(josa('레벨 6', '을')).toBe('을');
    expect(josa('레벨 9', '을')).toBe('를');
  });

  it('🔴 영문 — 알파벳 이름의 소리(L엘 M엠 N엔 R아르)', () => {
    expect(josa('GTO', '을')).toBe('를');
    expect(josa('NURI', '을')).toBe('를');
    expect(josa('SMALL', '을')).toBe('을');
    expect(josa('QR', '을')).toBe('을');
    expect(josa('btn', '을')).toBe('을');   // 소문자도 같다
  });
});

describe('🔴 판단할 수 없으면 조사를 생략한다 — 괄호 표기로 돌아가지 않는다', () => {
  it('기호·이모지·빈 문자열', () => {
    for (const w of ['', '   ', '이벤트!', "'매장'", '이벤트(임시)', '🎴']) {
      expect(josa(w, '을'), `'${w}' 에서 조사를 만들어냈다`).toBe('');
    }
  });

  it('withJosa 는 낱말만 돌려준다 — 문장이 깨지지 않는다', () => {
    expect(withJosa('이벤트!', '을')).toBe('이벤트!');
  });

  it('어떤 입력에도 "(" 가 섞이지 않는다 — 이 파일의 존재 이유', () => {
    const words = ['이벤트', '매장', 'GTO', '테이블 2', '🎴', '', '클락'];
    for (const w of words) {
      for (const k of ['을', '은', '이', '과', '으로'] as const) {
        expect(withJosa(w, k), `'${w}' + ${k}`).not.toContain('(');
      }
    }
  });
});
