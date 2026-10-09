// F-04·RECUR-P2-2(audit-open-1009) — 업주 대시보드 '포스터 상단 고정 문의' 는 유료 노출 스위치를 따른다.
//
// 스위치(lib/paidExposure)가 꺼지면 손님 화면의 TOP 배지·맨 앞 표시는 0 인데, 문의 링크·시트가 그 효과를 약속하며
// 문의를 받고 있었다(효과 없는 상품 안내). 링크와 시트 둘 다 스위치 뒤에 있어야 한다 — 하나만 막으면
//   · 링크만 막음: 다른 진입점이 생기면 시트가 그대로 약속한다
//   · 시트만 막음: 눌러도 아무것도 안 열리는 죽은 버튼이 남는다
// 음성 대조: StoreDashboard.tsx 의 `caps.manage && PAID_EXPOSURE_ON &&` 에서 스위치를 빼면 첫 번째 it 가 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/features/StoreDashboard.tsx', 'utf8');
/** 주석을 뺀 코드 */
const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('업주 대시보드 부스트 문의 — 유료 노출 스위치', () => {
  it('문의 링크(boost-inquiry)는 PAID_EXPOSURE_ON 가드 안에만 있다', () => {
    const at = code.indexOf('data-testid="boost-inquiry"');
    expect(at, '문의 링크가 사라졌다 — 스위치를 켜면 돌아와야 한다(기능 보존)').toBeGreaterThan(0);
    // 링크를 감싼 조건식: 직전의 `{caps.manage ... && (` 블록
    const head = code.slice(Math.max(0, at - 400), at);
    const cond = head.slice(head.lastIndexOf('{caps.manage'));
    expect(cond).toMatch(/^\{caps\.manage && PAID_EXPOSURE_ON && \(/);
  });

  it('문의 시트(BoostContactModal)도 스위치 뒤에서만 그린다', () => {
    const uses = [...code.matchAll(/<BoostContactModal\b/g)].map((m) => code.slice(Math.max(0, m.index! - 40), m.index!));
    expect(uses.length).toBe(1);
    expect(uses[0]).toMatch(/\{PAID_EXPOSURE_ON && $/);
  });

  it('스위치는 lib/paidExposure 한 곳에서 가져온다(로컬 상수로 복제하지 않는다)', () => {
    expect(src).toMatch(/import \{ PAID_EXPOSURE_ON \} from '\.\.\/\.\.\/lib\/paidExposure';/);
    expect(code).not.toMatch(/const PAID_EXPOSURE_ON\b/);
  });
});
