// 포스터 등록/수정 — '상금 형태'·'대회 등급' 선택 상태를 스크린리더가 읽을 수 있게 한다(오너 2026-09-26 모바일 디버깅 잔여#2).
//
// 이전엔 checked/active 상태가 className(색·테두리) 으로만 표현돼 접근성 트리에 선택 여부가 없었다.
// 렌더 테스트가 불가한 저장소라(jsdom 없음) 이미 쓰는 소스 문자열 계약 방식으로 고정한다.
// 음성 대조: role="radio"/"radiogroup"·aria-checked 를 지우면 이 테스트가 실패한다.
// 실행: npx vitest run src/components/features/PosterFormModalRadioAria.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'PosterFormModal.tsx'), 'utf-8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('상금 형태 — RadioCard 두 장은 radiogroup/radio 로 선택 상태를 알린다', () => {
  it('그룹 wrapper 가 role="radiogroup" 이다', () => {
    expect(code).toMatch(/<div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="상금 형태">/);
  });
  it('RadioCard 버튼이 role="radio" aria-checked={checked} 를 갖는다', () => {
    const i = code.indexOf('function RadioCard(');
    expect(i, 'RadioCard 정의를 찾지 못했다').toBeGreaterThan(-1);
    const bodyEnd = code.indexOf('\n}', code.indexOf('return (', i));
    expect(bodyEnd, 'RadioCard 본문 끝을 찾지 못했다').toBeGreaterThan(i);
    const body = code.slice(i, bodyEnd);
    expect(body).toMatch(/<button type="button" role="radio" aria-checked=\{checked\} onClick=\{onClick\}/);
  });
});

describe('대회 등급 — 4버튼 그룹도 radiogroup/radio 로 선택 상태를 알린다', () => {
  it('그룹 wrapper 가 role="radiogroup" 이다', () => {
    expect(code).toMatch(/<div className="grid grid-cols-4 gap-1\.5" role="radiogroup" aria-label="대회 등급">/);
  });
  it('각 등급 버튼이 role="radio" aria-checked={form.grade === v} 를 갖는다', () => {
    expect(code).toMatch(/<button key=\{l\} type="button" role="radio" aria-checked=\{form\.grade === v\} onClick=\{\(\) => update\('grade', v\)\}/);
  });
});
