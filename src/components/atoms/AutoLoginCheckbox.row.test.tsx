// 자동 로그인 — 줄 **전체**가 누름면이다(2026-09-28). 종전엔 13px 체크박스와 글자 폭만 눌렸고
// 44px 줄·카드 여백은 죽은 칸이었다. 한 줄(compact)은 e2e/tap-contrast-0928 가 실제 클릭으로 잠그고,
// 카드형(내 정보 로그인 랜딩)은 브라우저 경로가 무거워 여기서 구조로 잠근다: 바깥이 <label> 이고 그 안에 체크박스가 있다.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AutoLoginCheckbox from './AutoLoginCheckbox';

describe('AutoLoginCheckbox — 줄 전체 label', () => {
  for (const compact of [false, true]) {
    it(compact ? '한 줄형' : '카드형', () => {
      const html = renderToStaticMarkup(<AutoLoginCheckbox checked onChange={() => {}} compact={compact} />);
      expect(html.startsWith('<label'), `바깥 요소가 label 이 아니다: ${html.slice(0, 60)}`).toBe(true);
      expect(html.endsWith('</label>')).toBe(true);
      expect(html).toContain('data-testid="auto-login"');
      // label 안에는 구문(phrasing) 요소만 — div/p 가 들어가면 HTML 이 깨지고 브라우저가 label 을 쪼갠다
      expect(html).not.toMatch(/<(div|p)[\s>]/);
      // 라벨이 두 겹이면 한 번 눌러 두 번 토글된다
      expect(html.match(/<label/g)?.length).toBe(1);
    });
  }
});
