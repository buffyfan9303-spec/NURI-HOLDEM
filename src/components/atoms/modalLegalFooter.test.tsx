// Modal 의 법정 푸터는 **전체화면(page) 변형에만** 붙는다 — 2026-09-29 최종 점검 D1.
// page 는 불투명 전면 판이라 App 문서 끝 푸터를 덮어 판 안에 고지가 있어야 한다.
// 시트·가운데 대화상자·인라인(2-pane)은 뒤 화면·문서 끝 푸터가 그대로 있으니 붙으면 기존 화면이 바뀌는 회귀다.
// 실제 화면 판정(끝까지 스크롤·맨 위 가림)은 e2e/legal-overlay.spec.ts 가 한다 — 여기는 변형별 분기만 잠근다.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Modal from './Modal';

const BIZ = '525-20-02937';
const html = (p: { variant: 'page' | 'sheet' | 'center'; inline?: boolean }) =>
  renderToStaticMarkup(<Modal open onClose={() => {}} title="t" {...p}><p>본문</p></Modal>);

describe('Modal — 법정 푸터는 page 변형에만', () => {
  it('page(전체화면) 변형에는 사업자 정보 푸터가 있다', () => {
    const h = html({ variant: 'page' });
    expect(h).toContain('본문');
    expect(h, 'page 변형 본문 끝에 BusinessFooter 가 없다').toContain(BIZ);
  });
  for (const p of [{ variant: 'sheet' as const }, { variant: 'center' as const }, { variant: 'page' as const, inline: true }]) {
    it(`${p.variant}${p.inline ? '(inline)' : ''} 에는 푸터가 없다`, () => {
      const h = html(p);
      expect(h, '렌더가 비었다 — 이 검사가 아무것도 안 본다').toContain('본문');
      expect(h, `${p.variant}${p.inline ? ' inline' : ''} 에 법정 푸터가 붙었다 — 작은 모달·2-pane 이 바뀐다`).not.toContain(BIZ);
    });
  }
});
