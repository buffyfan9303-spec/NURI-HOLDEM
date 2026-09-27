// 글자 대비 계약(리드 2026-09-27, design-reviewer 실측) — 홈·공용 영역.
//   ① 구분점 '·' 은 글자다: 경계선 토큰(라이트 3.16~3.38:1 · 다크 카드 2.71~2.96:1)이 아니라 ink-muted(라이트 4.99~5.35 · 다크 5.42~6.41).
//      경계선 토큰 자체는 UI 경계용이라 그대로 둔다(값을 올리면 모든 경계가 진해진다).
//   ② 흰 글자 알림 배지: danger 기본(#F6465D 위 흰 글자 3.53:1) 대신 danger-dark(5.03:1 — UnreadBadge atom 과 같은 값).
// 커뮤니티·장부·내 매장 쪽은 각 팀 담당이라 여기서 세지 않는다.
// ⚠ 클래스 이름을 이 파일에 그대로 쓰지 않는다 — Tailwind 가 주석·문자열에서도 CSS 를 만든다(CLAUDE.md 참고 메모). 조립해서 쓴다.
// 실행: npx vitest run src/components/separatorBadgeContrast.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const WEAK = ['text', 'border', 'strong'].join('-');
const FILES = [
  'components/features/BusinessFooter.tsx',
  'components/features/ListingDetailModal.tsx',
  'components/features/MarketplaceTab.tsx',
  'components/features/ProfileModal.tsx',
  'components/features/UserManagementTab.tsx',
  'pages/legal/LegalNotice.tsx',
];

describe('구분점 · 대비', () => {
  for (const f of FILES) {
    it(`${f} — 글자에 경계선 토큰 색을 쓰지 않는다`, () => {
      expect(src(f).split('\n').filter((l) => l.includes(WEAK)).map((l) => l.trim().slice(0, 100))).toEqual([]);
    });
  }
});

describe('흰 글자 알림 배지 대비', () => {
  const weakBadge = new RegExp(`\\b${['bg', 'danger'].join('-')}\\s[^"]*\\btext-white\\b`);
  it('헤더 미읽음 배지(App)·관리자 메뉴 배지(AdminTab) — danger 기본 위 흰 글자가 아니다', () => {
    const app = src('App.tsx').split('\n').filter((l) => /tabular-nums/.test(l) && /rounded-full/.test(l) && weakBadge.test(l));
    const admin = src('components/features/AdminTab.tsx').split('\n').filter((l) => /\{badge\}/.test(l) && weakBadge.test(l));
    expect([...app, ...admin].map((l) => l.trim().slice(0, 100))).toEqual([]);
  });
});
