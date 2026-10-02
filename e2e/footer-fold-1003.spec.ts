// 법정 푸터 접기(오너 2026-10-03 "footer 법적고지도 전부 펼쳐놓지 말고 필요없는 건 접기").
//
// 근거(law.go.kr 원문, 2026-10-03 확인 — BusinessFooter.tsx 주석):
//   전자상거래법 §10① 1~6호 · 시행령 §11의4(호스팅 제공자) → 시행규칙 §7① '초기 화면 표시'(5호 이용약관만 연결 화면 허용)
//   개인정보보호법 §30② · 시행령 §31② → 처리방침 '지속적 게재'
//   공정위 전자상거래 소비자보호 지침 Ⅲ.4.가 → 약관 개정 공지는 '초기화면 또는 연결화면'
// 그래서 ① 법정 표시사항(상호·대표자·주소·전화·전자우편·사업자번호·호스팅)·약관·처리방침·19세·1336 은 펼치지 않아도 보이고,
//       ② 위치기반 약관·계정 삭제 안내·라이선스·개정 안내만 '더보기' 안에 있으며,
//       ③ 접힌 내용은 키보드로 열리고 스크린리더에 펼침 상태가 드러나며,
//       ④ 펼침 상태를 기억하지 않는다(새로 열면 접힌 채).
// 🔴 음성 대조: 판정을 새 testid 가 아니라 '사업자번호가 든 footer' 로 잡는다 — 수정 전 빌드는 ①의 호스팅·전자우편(접혀 있었음)과
//   ②의 위치기반 약관(펼쳐져 있었음)에서 실패해야 한다(기억 legal-overlay-footer-0929 #3: testid 판정은 음성 대조를 거짓으로 만든다).
// 운영 DB 쓰기 0 · 로그인 0.
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const BIZ_NO = '525-20-02937';
const ALWAYS = ['엔에이치홀딩스', '김윤혜', BIZ_NO, '다산중앙로82번안길', '070-8098-1727', 'ace@nuriholdem.com', 'Vercel Inc.', '만 19세 미만은 이용할 수 없습니다', '1336(24시간·무료)'];

async function docFooter(page: Page) {
  await page.goto('/');
  await expect(page.locator('button[aria-label^="알림"]').first()).toBeVisible({ timeout: 20_000 });
  // 문서 끝 푸터(오버레이 안 사본이 아닌 것) — 사업자번호로 찾는다
  const footer = page.locator('footer').filter({ hasText: BIZ_NO }).filter({ visible: true }).last();
  await footer.scrollIntoViewIfNeeded();
  return footer;
}

for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test.describe(`법정 푸터 접기 ${vp.width}`, () => {
    test.use({ viewport: vp });

    test('① 법정 표시사항·약관·처리방침·19세·1336 은 펼치지 않아도 보인다', async ({ page }) => {
      const footer = await docFooter(page);
      for (const t of ALWAYS) await expect(footer.getByText(t, { exact: false }).first(), `'${t}' 가 접힌 상태에서 안 보인다`).toBeVisible();
      for (const name of ['이용약관', '개인정보처리방침', '취소·환불 정책']) {
        await expect(footer.getByRole('button', { name, exact: true }), `'${name}' 가 초기 화면에 없다`).toBeVisible();
      }
    });

    test('② 접힌 것은 위치기반 약관·계정 삭제·라이선스·개정 안내뿐이고, 열면 보인다', async ({ page }) => {
      const footer = await docFooter(page);
      const folded = [
        footer.getByRole('button', { name: '위치기반서비스 이용약관', exact: true }),
        footer.getByRole('link', { name: '계정 삭제 안내' }),
        footer.getByRole('link', { name: '오픈소스 라이선스' }),
        footer.getByText('약관·개인정보처리방침 개정 안내'),
      ];
      for (const l of folded) await expect(l, '접혀야 할 항목이 처음부터 보인다').toBeHidden();
      await footer.locator('summary').filter({ hasText: '더보기' }).click();
      for (const l of folded) await expect(l, '펼쳤는데 안 보인다').toBeVisible();
      // 열어도 법정 표시사항은 그대로 보인다(위치가 바뀌지 않았다)
      await expect(footer.getByText('Vercel Inc.')).toBeVisible();
    });

    test('③ 키보드로 열고 닫히며, 스크린리더에 펼침 상태가 드러난다', async ({ page }) => {
      const footer = await docFooter(page);
      const summary = footer.locator('summary').filter({ hasText: '더보기' });
      // Playwright 의 getByRole 은 summary 를 generic 으로 계산한다(자체 ARIA 계산기) — 스크린리더가 실제로 받는 것은
      //   브라우저 접근성 트리다. CDP 로 Chromium 의 AX 노드를 직접 읽어 역할·이름·펼침 상태를 단언한다.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('DOM.enable');
      await cdp.send('Accessibility.enable');
      const ax = async () => {
        const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
        const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'footer summary' });
        for (const nodeId of nodeIds) {
          const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
          const n = nodes.find((x) => !x.ignored) ?? nodes[0];
          const name = String(n.name?.value ?? '');
          if (!name.includes('더보기')) continue;
          return { role: String(n.role?.value ?? ''), name, expanded: n.properties?.find((p) => p.name === 'expanded')?.value?.value as boolean | undefined };
        }
        return null;
      };
      const closed = await ax();
      console.log(`[footer ③ ${vp.width}] AX closed ${JSON.stringify(closed)}`);
      expect(closed, '접근성 트리에 더보기 요약줄이 없다').not.toBeNull();
      expect(closed!.role, '요약줄이 펼침 단추 역할이 아니다').toBe('DisclosureTriangle');
      expect(closed!.expanded, '접힌 상태가 접근성 트리에 안 드러난다').toBe(false);
      await summary.focus();
      await expect(summary).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(footer.getByRole('link', { name: '사용설명서' }), 'Enter 로 안 열렸다').toBeVisible();
      const opened = await ax();
      expect(opened?.expanded, '펼친 상태가 접근성 트리에 안 드러난다').toBe(true);
      await page.keyboard.press('Tab');
      await expect(footer.getByRole('link', { name: '사용설명서' }), 'Tab 이 펼친 첫 링크로 안 간다').toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(summary).toBeFocused();
      await page.keyboard.press('Space');
      await expect(footer.getByRole('link', { name: '사용설명서' }), 'Space 로 안 닫혔다').toBeHidden();
      expect((await ax())?.expanded, '닫은 상태가 접근성 트리에 안 드러난다').toBe(false);
    });

    test('④ 펼침 상태를 기억하지 않는다 — 새로 열면 접힌 채', async ({ page }) => {
      let footer = await docFooter(page);
      await footer.locator('summary').filter({ hasText: '더보기' }).click();
      await expect(footer.getByRole('link', { name: '계정 삭제 안내' })).toBeVisible();
      await page.reload();
      await expect(page.locator('button[aria-label^="알림"]').first()).toBeVisible({ timeout: 20_000 });
      footer = page.locator('footer').filter({ hasText: BIZ_NO }).filter({ visible: true }).last();
      await footer.scrollIntoViewIfNeeded();
      await expect(footer.getByRole('link', { name: '계정 삭제 안내' }), '새로 열었는데 펼친 채다').toBeHidden();
    });
  });
}
