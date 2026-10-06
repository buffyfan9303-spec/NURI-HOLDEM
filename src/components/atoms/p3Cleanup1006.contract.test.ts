// P3 정리 2건(2026-10-06) — 죽은 CSS 클래스 삭제 · 로고 주석의 낡은 주장 교정.
// ⚠ 지운 클래스 이름은 조립해서 쓴다 — Tailwind content 가 평문을 스캔해 주석·테스트에 적힌 이름도 CSS 를 만든다(CLAUDE.md 참고 메모).
// 음성 대조: index.css 에 그 클래스를 다시 넣으면 첫 줄이, NuriClassicLogo.tsx 머리말에 '두 테마 같은 색' 을 되살리면 둘째 줄이 실패한다.
// 실행: npx vitest run src/components/atoms/p3Cleanup1006.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('P3 정리', () => {
  it('사용처 0 이던 타일용 황동 면 클래스는 index.css 와 소스 어디에도 없다', () => {
    const name = 'surface-brass' + '-tile';
    expect(read('../../index.css')).not.toContain(name);
    for (const f of ['../features/ToolsPanel.tsx', '../features/gto/NuriSpotPanel.tsx', '../../App.tsx']) {
      expect(read(f)).not.toContain(name);
    }
  });
  it('C안 로고 머리말은 라이트 HOLDEM 이 --achieve 라고 말하고, 코드·정적 셸도 같다', () => {
    const tsx = read('./NuriClassicLogo.tsx');
    const head = tsx.slice(0, tsx.indexOf('*/'));
    expect(head).not.toContain('오너 판단 대기');
    expect(head).not.toMatch(/골드 'HOLDEM'·다이아는 두 테마 같은 색/);
    expect(head).toContain('--achieve');
    expect(tsx).toContain('[html.light_&]:[--holdem:rgb(var(--achieve))]');
    expect(read('../../../index.html')).toContain('[html.light_&]:[--holdem:rgb(var(--achieve))]');
  });
});
