// src/components/features/gto/useDeepGto.test.ts
// §3.4 근거·채점 신뢰성 (2026-09-12) — actionFromEquity 는 솔버 산출이 아니다. 이 테스트는
//   ① 그 사실이 함수 자체(주석)에 명시돼 있고
//   ② 화면(GtoDeepPanel)이 이 결과를 'solver'/'GTO 정답'류로 표시하지 않으며
//   ③ 죽은 데이터였던 GtoDeepSituation(사람이 쓴 "약 40% 빈도로 3-Bet" 예시)이 되살아나지 않는다
// 는 것을 잠근다. 되돌리면(가드 주석·SourceBadge 제거) 실패해야 하는 음성 대조 포함.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { actionFromEquity } from './useDeepGto';

const ROOT = join(__dirname, '..', '..', '..', '..');
const HOOK = readFileSync(join(ROOT, 'src/components/features/gto/useDeepGto.ts'), 'utf-8');
const PANEL = readFileSync(join(ROOT, 'src/components/features/gto/GtoDeepPanel.tsx'), 'utf-8');
const TYPES = readFileSync(join(ROOT, 'src/components/features/gto/gto.deep.types.ts'), 'utf-8');

describe('actionFromEquity — 승률 임계값 눈금이지 솔버 결과가 아니다', () => {
  it('빈도 합이 1 근처다(정규화 이전 원값 계약)', () => {
    for (const eq of [0.9, 0.6, 0.5, 0.4, 0.1]) {
      const a = actionFromEquity(eq);
      expect(a.raise! + a.call! + a.fold!).toBeCloseTo(1, 5);
    }
  });

  it('경계값에서 분포가 단조롭게 강해진다(구간 상수 눈금 자체는 유지)', () => {
    expect(actionFromEquity(0.62).raise).toBeGreaterThan(actionFromEquity(0.52).raise!);
    expect(actionFromEquity(0.1).fold).toBeGreaterThan(actionFromEquity(0.6).fold!);
  });

  it('음성 대조 — 함수 자체엔 "솔버 아님" 경고 주석이 없으면 실패', () => {
    // 가드 주석을 지우면(과거 상태로 되돌리면) 실패한다.
    expect(HOOK).toMatch(/actionFromEquity[^\n]*\n[^\n]*솔버 산출이 아니다|솔버 산출이 아니다/);
  });
});

describe('GtoDeepPanel — 참고 액션을 GTO 빈도 막대처럼 보여주지 않는다', () => {
  it("MixBar 결과 옆에 kind='heuristic' 출처 배지가 붙어 있다", () => {
    expect(PANEL).toMatch(/<SourceBadge kind="heuristic"/);
  });

  it("kind='solver' 를 쓰지 않는다 — 이 도구엔 솔버 데이터가 없다", () => {
    expect(PANEL).not.toMatch(/kind=["']solver["']/);
  });

  it('솔버 아님을 명시하는 하단 고지 문구가 남아 있다', () => {
    expect(PANEL).toContain('솔버 아님');
  });

  it("화면 문구에 'GTO 정답'·'최선의 선택' 같은 근거 없는 정밀함이 없다", () => {
    const ui = PANEL.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
    for (const banned of ['GTO 정답', '최선의 선택', '이론(GTO) 기준 수치']) {
      expect(ui, `금지 문구 발견: ${banned}`).not.toContain(banned);
    }
  });
});

describe('GtoDeepSituation 죽은 데이터 — 되살아나면 안 된다', () => {
  it('gto.deep.data.ts 를 다시 만들지 않는다(사람이 쓴 "약 40% 빈도" 예시 프리셋)', () => {
    expect(existsSync(join(ROOT, 'src/components/features/gto/gto.deep.data.ts'))).toBe(false);
  });

  it('useDeepGto 훅이 situation 선택 API 를 다시 노출하지 않는다(렌더되지 않던 죽은 표면)', () => {
    const code = HOOK.split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');
    expect(code).not.toMatch(/selectSituation|DEEP_SITUATIONS/);
  });

  it('GtoResult 타입에 baseline/villainAdjustments(사람이 적어 넣은 빈도 예시)가 없다', () => {
    const code = TYPES.split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');
    expect(code).not.toMatch(/villainAdjustments|interface GtoDeepSituation/);
  });
});
