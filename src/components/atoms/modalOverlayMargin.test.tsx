// Modal 의 고정 오버레이 래퍼는 **바깥 여백 0** 이다 — 2026-10-04 재점검 2회차 하-1.
// Modal 은 포털이 아니라 호출부 DOM 안에서 그려진다. `space-y-*` 묶음(특이도 0,3,0) 안에 놓이면 `fixed inset-0` 래퍼에
// margin-top 이 붙어 딤이 화면 위에서 6.375px 내려왔다(미수 받기 창). 클래스로는 그 특이도를 못 이기니 인라인으로 못 박는다.
// 실제 화면 판정(딤 top=0 · 맨 위 2px 이 배경 버튼)은 재점검 하네스가 한다 — 여기는 세 변형 모두에 인라인 0 이 실리는지만 잠근다.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Modal from './Modal';

const first = (variant: 'page' | 'sheet' | 'center') => {
  const h = renderToStaticMarkup(<Modal open onClose={() => {}} title="t" variant={variant}><p>본문</p></Modal>);
  return h.slice(0, h.indexOf('>') + 1);
};

describe('Modal — 고정 오버레이 래퍼의 margin 은 0', () => {
  for (const v of ['sheet', 'center', 'page'] as const) {
    it(`${v} 변형`, () => {
      const tag = first(v);
      // ⚠ 정규식에 래퍼 클래스 문자열을 통째로 쓰지 않는다 — fullscreenSafeArea 계약이 src 의 .tsx 코드에서 그 문자열을 '전면 오버레이'로 센다.
      expect(tag, `${v}: 첫 요소가 고정 래퍼가 아니다 — 검사가 엉뚱한 요소를 본다`).toMatch(/class="[^"]*\bfixed\b[^"]*\binset-0\b/);
      expect(tag, `${v}: 래퍼에 인라인 margin:0 이 없다 — space-y 묶음 안에서 딤이 내려온다`).toMatch(/style="[^"]*margin:0/);
    });
  }
});
