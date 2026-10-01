// 도구 검색 토큰 AND 매칭 + 즐겨찾기 탈락 안내(2026-10-01). 실행: npx vitest run src/lib/toolSearch.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchesToolQuery } from './toolSearch';
import { josa } from './josa';

const SRC = readFileSync('src/components/features/ToolsPanel.tsx', 'utf-8');
/** 실제 TOOLS 레지스트리 한 줄에서 name·desc·keywords 를 읽는다(손으로 베껴 두면 어긋난다). */
function entry(key: string) {
  const line = SRC.split('\n').find((l) => l.includes(`{ key: '${key}', cat:`)) ?? '';
  const g = (f: string) => line.match(new RegExp(`${f}: '([^']*)'`))?.[1];
  return [g('name'), g('desc'), g('keywords')];
}

describe('matchesToolQuery', () => {
  const mdf = entry('mdf');
  it("실제 MDF 도구 항목을 읽었다(빈 검사 방지)", () => expect(mdf[0]).toBe('MDF 계산기'));
  it("'MDF 블러프' 가 MDF 도구에 적중한다(옛 이름 'MDF · 블러프 계산기')", () => {
    expect(matchesToolQuery(mdf, 'MDF 블러프')).toBe(true);
    expect(matchesToolQuery(mdf, 'mdf  블러프 ')).toBe(true);
  });
  it('엉뚱한 토큰이 하나라도 섞이면 적중하지 않는다', () => {
    expect(matchesToolQuery(mdf, 'MDF 족보')).toBe(false);
    expect(matchesToolQuery(mdf, '블러프 푸시')).toBe(false);
  });
  it('기존 단일어·부분일치 동작은 그대로다', () => {
    expect(matchesToolQuery(mdf, 'MDF 계산기')).toBe(true);
    expect(matchesToolQuery(mdf, '블러프')).toBe(true);
    expect(matchesToolQuery(entry('icm'), 'icm')).toBe(true);
    expect(matchesToolQuery(entry('icm'), '딜')).toBe(true);
    expect(matchesToolQuery(entry('pot'), '푸시')).toBe(false);
  });
  it('빈 질의는 적중 없음', () => expect(matchesToolQuery(mdf, '   ')).toBe(false));
});

describe('즐겨찾기 7번째 — 소스 계약', () => {
  it('넘칠 때 빠지는 항목 이름을 담은 toast 를 띄운다', () => {
    expect(SRC).toContain('const FAV_MAX = 6;');
    expect(SRC).toMatch(/toast\.show\(`즐겨찾기는 최대 \$\{FAV_MAX\}개입니다\. 가장 오래된/);
  });
});

describe('즐겨찾기 탈락 안내 — 조사(을/를)', () => {
  // 도구 이름 31개 전체의 기대 조사. 이름 마지막 글자의 받침으로 손으로 정했다(josa 구현을 재사용하지 않는다).
  const EXPECT: Record<string, '을' | '를'> = {
    tda: '을', drill: '을', range: '를', pushfold: '를', trainer: '를', postflop: '를', wrongnote: '를', aggro: '를',
    glossary: '을', handrank: '를', startrank: '를', spot: '을', replay: '를', gto: '을', rvr: '를', pot: '를', outs: '을',
    mdf: '를', icm: '를', deal: '를', spr: '를', ev: '를', combo: '를', mzone: '를', bankroll: '를', variance: '을',
    chip: '를', sim: '을', blindgen: '를', payout: '를', endtime: '을',
  };
  it('실제 TOOLS 31개 전부에 대해 조사가 맞다', () => {
    const keys = Object.keys(EXPECT);
    expect(keys).toHaveLength(31);
    for (const key of keys) {
      const name = entry(key)[0];
      expect(name, `TOOLS 에 ${key} 없음`).toBeTruthy();
      expect(josa(name!, '을'), `${key} '${name}'`).toBe(EXPECT[key]);
    }
    expect(keys.filter((k) => EXPECT[k] === '을')).toHaveLength(9);
    // 도구가 추가·삭제돼 표와 어긋나면 여기서 걸린다.
    expect((SRC.match(/^\s*\{ key: '[a-z]+', cat:/gm) ?? []).length).toBe(31);
  });
  it('toast 가 josa() 를 거치고 괄호 표기를 쓰지 않는다', () => {
    expect(SRC).toMatch(/\$\{josa\(droppedName, '을'\)\} 뺐습니다/);
    expect(SRC).not.toContain('을(를) 뺐습니다');
  });
});
