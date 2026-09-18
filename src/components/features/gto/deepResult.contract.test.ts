// GTO 핸드 분석 — 계산 전에는 숫자를 만들지 않는다 (감사 2026-09-19 [high]).
//
// 잠그는 것
//  ① useDeepGto 의 result 는 에퀴티가 없으면 null 이다 — 자리표시자 34/33/33 이 '권장 액션: 레이즈 34%' 로 나가던 자리
//  ② GtoDeepPanel 은 참고 액션·권장 배지를 에퀴티 섹션과 같은 조건(계산 끝 + 값 있음)으로만 그린다
//  ③ HandReplayer 는 겹친 카드(손으로 적은 [[REPLAY:]] 마커)로 에퀴티·아웃츠를 부르지 않는다
// vitest 환경이 node 라 렌더할 수 없어 소스 계약으로 잠근다(nuriSpotWiring.contract 와 같은 결).
// 실행: npx vitest run src/components/features/gto/deepResult.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const HOOK = strip(readFileSync(join(__dirname, 'useDeepGto.ts'), 'utf-8'));
const PANEL = strip(readFileSync(join(__dirname, 'GtoDeepPanel.tsx'), 'utf-8'));
const REPLAYER = strip(readFileSync(join(__dirname, '../HandReplayer.tsx'), 'utf-8'));

describe('① 계산 전 자리표시자 없음', () => {
  it('result useMemo 는 equity 가 없으면 null 을 돌려준다', () => {
    const m = HOOK.match(/const result = useMemo<GtoResult \| null>\(\(\) => \{[\s\S]*?\}, \[inputReady, equity, equityKind\]\);/);
    expect(m, 'result useMemo 를 찾지 못했다').not.toBeNull();
    expect(m![0]).toContain('if (!equity) return null;');
    expect(m![0], '가짜 믹스 리터럴이 남아 있다').not.toMatch(/raise:\s*0\.3[34]/);
  });
  it('훅 어디에도 하드코딩 액션 믹스가 없다', () => {
    expect(HOOK).not.toMatch(/\{\s*raise:\s*0\.34,\s*call:\s*0\.33,\s*fold:\s*0\.33\s*\}/);
  });
});

describe('② 화면은 계산 중에 액션을 그리지 않는다', () => {
  it('결과 카드는 계산 중에도 서고(에퀴티 스피너가 보이게), 참고 액션은 값이 있고 계산이 끝났을 때만', () => {
    expect(PANEL).toMatch(/const showResult = [^\n]*\(deep\.calculating \|\| \(deep\.result && deep\.normalizedAction\)\)/);
    expect(PANEL).toMatch(/\{deep\.normalizedAction && !deep\.calculating \? \(\s*<>\s*<MixBar action=\{deep\.normalizedAction\} \/>/);
    expect(PANEL, '계산 중 상태 표시가 없다').toContain('data-testid="gto-action-pending"');
  });
  it('권장 액션 배지도 계산 중에는 없다 — 이전 핸드의 값이 지금 핸드의 권장으로 남지 않게', () => {
    expect(PANEL).toMatch(/const recommended = na && !deep\.calculating/);
  });
});

describe('③ 리플레이어 — 겹친 카드는 계산하지 않는다', () => {
  it('canEquity 가 카드 중복(hero∪villain∪board)을 함께 본다', () => {
    expect(REPLAYER).toMatch(/const canEquity = replay\.hero\.length === 2 && replay\.villain\.length === 2 && new Set\(allCards\)\.size === allCards\.length;/);
  });
});
