// 운영 분석 표면 계약 — 만들지 않기로 한 분석이 코드에 들어오지 않게 잠근다 (오너 지시 2026-09-11)
//
// 오너 지시 원문 요지:
//   "인원이 부족했던 시간대 · 인원이 과도했던 시간대 · 근무 인원 적정성 판단 ·
//    근무 인원 증원·감축 추천 · 시간대별 인력 최적화 · 직원 배치가 부족하거나 많았다는 추론
//    — 대시보드, 무료 통계, 유료 운영 리포트, PDF, 관리자 화면 어디에도 만들지 마라."
//
// 사실 데이터(근무 기록·근무시간·급여·인건비 합계)는 **유지한다**. 금지되는 것은 그 데이터로
// '몇 명이 필요했는지'를 판단하거나 배치를 추천하는 것뿐이다. 그래서 이 테스트는
// 'staff'·'wage' 같은 단어가 아니라 **판단·추천 어휘**를 찾는다.
//
// 왜 자동화하나: 이 부류는 리뷰에서 놓치기 쉽다. 통계 화면에 한 줄 추가하는 것만으로
// "금요일 저녁에 딜러가 부족했습니다" 같은 문장이 생기고, 그건 근거도 없고 오너가 금지한 것이다.
// 2026-09-11 시점 실측: 저장소 전체 0건 — 지금 상태를 계약으로 굳힌다.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');
const FUNCS = join(ROOT, 'supabase', 'functions');

function walk(dir: string, out: string[] = []): string[] {
  let names: string[];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');

/** 히스토리를 적은 주석까지 막으면 '왜 없는지'를 기록할 수 없다 — 실제 코드·문자열만 본다. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * 금지 패턴 — **판단·추천** 어휘만 잡는다.
 * 단순 사실 표시('근무 인원 3명', '인건비 120만원')는 걸리지 않아야 하므로
 * '부족/과다/적정/증원/감축/최적화/추천' 같은 판단어가 인원·인력·직원·딜러와 **붙어 있을 때만** 잡는다.
 */
const BANNED: { re: RegExp; why: string }[] = [
  { re: /(인원|인력|직원|딜러|스태프)[^\n]{0,12}(부족|과도|과다|모자|남아)/, why: '인원 부족·과다 판단' },
  { re: /(부족|과도|과다)[^\n]{0,12}(인원|인력|직원|딜러|스태프)/, why: '인원 부족·과다 판단' },
  { re: /(적정|필요)[^\n]{0,6}(인원|인력)/, why: '근무 인원 적정성 판단' },
  { re: /(인원|인력|직원|딜러)[^\n]{0,12}(증원|감축|충원|늘리|줄이)(세요|기|를|는|자|십시오)/, why: '증원·감축 추천' },
  { re: /(시간대|타임)[^\n]{0,12}(인력|인원)[^\n]{0,12}(최적화|배치)/, why: '시간대별 인력 최적화' },
  { re: /(인력|직원|딜러)[^\n]{0,8}배치[^\n]{0,12}(추천|제안|권장|필요)/, why: '직원 배치 추천' },
  { re: /\b(understaff|overstaff|staffing[ _-]?(level|recommend|optim))/i, why: '영문 인력 판단 표현' },
];

describe('운영 분석 표면 — 인력 판단·추천은 어디에도 만들지 않는다', () => {
  const files = [...walk(SRC), ...walk(FUNCS)].filter((p) => !p.endsWith('opsAnalysisSurface.test.ts'));

  it('src 와 엣지 함수 전체에 인력 부족·과다·증원 추천 문구가 없다', () => {
    const hits: string[] = [];
    for (const p of files) {
      const code = stripComments(readFileSync(p, 'utf-8'));
      for (const { re, why } of BANNED) {
        const m = code.match(re);
        if (m) hits.push(`${rel(p)} — ${why}: "${m[0].trim().slice(0, 60)}"`);
      }
    }
    expect(hits, `금지된 인력 판단 분석이 들어왔습니다(오너 지시 2026-09-11):\n${hits.join('\n')}`).toEqual([]);
  });

  it('사실 데이터(근무 기록·급여·인건비)는 그대로 살아 있다 — 이 계약이 기능을 지우지 않는다', () => {
    // 금지된 것은 '판단'이지 '표시'가 아니다. 인건비 요약이 사라지면 그건 이 테스트의 오작동이다.
    const dash = readFileSync(join(SRC, 'components', 'features', 'StoreDashboard.tsx'), 'utf-8');
    expect(dash).toContain('인건비');
    expect(dash).toContain('getStaffWages');
    expect(dash).toContain('오늘 출근');
  });
});
