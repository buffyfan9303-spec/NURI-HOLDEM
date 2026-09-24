// 매장 영구 삭제 전 내려받기(CSV) — 칸 이스케이프와 엑셀 수식 주입 차단(오너 2026-09-25 DATA-RETENTION)
import { describe, it, expect } from 'vitest';
import { csvCell, csvSection } from './killswitch';

describe('csvCell', () => {
  it('쉼표·따옴표·줄바꿈은 따옴표로 감싼다', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('그가 "좋다"')).toBe('"그가 ""좋다"""');
    expect(csvCell('1\n2')).toBe('"1\n2"');
  });
  it('수식으로 읽히는 글자는 앞에 따옴표를 붙인다(숫자 음수는 그대로)', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+82')).toBe("'+82");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5000)).toBe('-5000');
  });
  it('null·객체', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe('csvSection', () => {
  it('머리줄·열 이름·행 — 행마다 다른 열도 합친다', () => {
    expect(csvSection('t', [{ a: 1 }, { a: 2, b: 'x' }])).toBe('# t (2행)\r\na,b\r\n1,\r\n2,x');
  });
  it('0행이면 머리줄만', () => {
    expect(csvSection('t', [])).toBe('# t (0행)');
  });
});
