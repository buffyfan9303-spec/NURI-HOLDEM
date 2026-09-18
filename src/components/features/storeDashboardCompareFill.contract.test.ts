// S3(2026-09-19, 오너): "전주 대비" 카드가 같은 행의 '최근 7일 추세'(차트+2줄)에 맞춰 grid
// align-items:stretch 로 늘어나는데, 내용은 2줄뿐이라 빈 칸이 많이 남았다.
// "칸이 많이 남잖아 절반을 기준으로 하던 해서 상하 XY축 줄간격 및 좌우 간격 조정".
//
// 고침: DashCard 에 옵트인 center prop — 타이틀은 위 고정(shrink-0), 본문은 flex-1 로 남는 높이를
// 받아 세로 중앙 정렬한다. 모바일(grid-cols-1)은 같은 행에 형제가 없어 늘어날 높이 자체가 없으므로
// flex-1 이 자연히 0 으로 수렴한다 — 폭별 분기 없이 CSS 성질만으로 안전하다(리드가 모바일을 짚어서
// 확인 항목으로 남긴다).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const src = strip(readFileSync(join(process.cwd(), 'src/components/features/StoreDashboard.tsx'), 'utf8'));

describe('DashCard center 옵트인 — 다른 카드는 그대로', () => {
  it('DashCard 가 center prop 을 받고 기본값은 false 다(다른 ~10개 카드 영향 없음)', () => {
    expect(src).toMatch(/center\s*=\s*false\s*\}\s*:\s*\{/);
  });
  it('center 일 때만 section 이 flex flex-col, 본문이 flex-1 로 감싸진다', () => {
    expect(src).toMatch(/'rounded-aura border card-aura p-3',\s*center && 'flex flex-col'/);
    expect(src).toMatch(/\{center \? <div className="flex flex-1 flex-col justify-center">\{children\}<\/div> : children\}/);
  });
  it("'전주 대비' 카드만 center 를 켰다(다른 카드 호출부는 안 건드림)", () => {
    const m = /title="전주 대비" onClick=\{\(\) => onGoto\('stats'\)\} center\b/;
    expect(src).toMatch(m);
    // 다른 DashCard 호출부에는 center 가 없다 — '전주 대비' 한 곳만 옵트인했는지 개수로 확인.
    // ⚠ JSX 여는 태그 안 화살표 함수(`=>`)가 literal `>` 를 품고 있어 `[^>]*` 로는 태그 경계를 못 잡는다
    //   — DashCard 호출을 다음 `<DashCard` 전까지로 통째로 잘라서 본다.
    const calls = src.split(/(?=<DashCard[\s>])/).filter((s) => s.trimStart().startsWith('<DashCard'));
    // bare JSX 불리언 prop 만 잡는다 — "justify-center" 같은 Tailwind 클래스는 하이픈 뒤라 \b 만으론 못 거른다.
    const centerCalls = calls.filter((c) => /[^-"'\w]center\s*\n/.test(c.slice(0, 300)));
    expect(centerCalls.length, `center 를 쓰는 DashCard 호출 수: ${centerCalls.length}`).toBe(1);
  });
});
