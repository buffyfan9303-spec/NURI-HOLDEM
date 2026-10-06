// 약관 전수 재검토(legal-full-1006/review.md) 화면 계약 — 운영 DB 에는 쓰지 않는다(목킹 업주 + route).
//   P1-1 하단 '약관 및 정책' 창 = 가입 때 동의한 문서(16조 약관 · 제9조 매장 제공을 사실대로 쓴 처리방침 · 환불 정책 한 벌)
//   P1-5 매장 운영자 이용약관 — 공개 정적본 · 기존 업주는 내 매장을 열 때 동의 게이트(기록 RPC 를 부르면 닫힌다)
// 음성 대조: 이 PR 전 빌드(origin/NURI/legal-1006)에서 ① 은 '제16조' 가 없어(11조 손글씨 본문) 빨개진다 · ③ 은 게이트가 없어 빨개진다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';
import { bootOwner, openMyStore } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

test.describe('약관 전수 재검토 2026-10-06', () => {
  test('🔴 P1-1 하단 이용약관·처리방침·환불 = 동의한 바로 그 문서', async ({ page }) => {
    await stabilizeBackstack(page);
    await page.goto('/');
    const open = page.getByRole('button', { name: '이용약관' }).first();
    await open.scrollIntoViewIfNeeded();
    await open.click();
    const panel = page.locator('[data-legal-panel]');
    await expect(panel).toHaveAttribute('data-legal-doc', 'terms', { timeout: 10_000 });
    await expect(panel.getByRole('heading', { name: /^제16조 \(약관의 효력·변경, 준거법 및 분쟁의 해결\)$/ })).toBeAttached();
    await expect(panel.getByRole('heading', { name: /^제14조 \(손해배상 및 책임의 제한\)$/ })).toBeAttached();

    await page.locator('[data-legal-tabbar]').getByRole('tab', { name: '개인정보처리방침' }).click();
    await expect(panel).toHaveAttribute('data-legal-doc', 'privacy');
    await expect(panel.getByRole('heading', { name: /^제9조 \(개인정보의 제3자 제공\)$/ })).toBeAttached();
    await expect(panel).toContainText('가운데를 가린 휴대전화번호');
    await expect(panel).not.toContainText('원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다');

    await page.locator('[data-legal-tabbar]').getByRole('tab', { name: '취소·환불 정책' }).click();
    await expect(panel).toHaveAttribute('data-legal-doc', 'refund');
    await expect(panel).toContainText('매장 운영 도구 이용료');

    // 위치기반서비스는 종전대로 이 창의 원본(공개 정적본 없음)
    await page.locator('[data-legal-tabbar]').getByRole('tab', { name: '위치기반서비스' }).click();
    await expect(panel).toHaveAttribute('data-legal-doc', 'location');
    await expect(panel).toContainText('제2조(사업자 정보)');
  });

  test('P1-5 매장 운영자 이용약관 공개 정적본 — 처리위탁 조항 · 사업자 정보 · 19세·1336', async ({ page }) => {
    const res = await page.goto('/legal/owner-terms.html');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: '매장 운영자 이용약관' })).toBeVisible();
    await expect(page.locator('main')).toContainText('개인정보 보호법」 제26조');
    await expect(page.locator('footer')).toContainText('525-20-02937');
    await expect(page.locator('footer')).toContainText('1336');
  });

  test('🔴 P1-5 기존 업주 — 내 매장을 열면 동의 게이트, 동의하면 서버 기록 후 닫힌다', async ({ page }) => {
    const rec: unknown[] = [];
    let agreed = false;
    await bootOwner(page, {
      viewport: { width: 1280, height: 900 },
      extra: async (p) => {
        await p.route(/\/rest\/v1\/owner_terms_consents\?/, (r) => (r.request().method() === 'GET'
          ? r.fulfill(json(agreed ? [{ terms_version: 1 }] : [])) : r.abort()));
        await p.route(/\/rest\/v1\/rpc\/record_my_owner_terms_consent/, (r) => {
          rec.push(r.request().postDataJSON()); agreed = true;
          return r.fulfill(json('2026-10-06T03:00:00+00:00'));
        });
      },
    });
    await openMyStore(page);
    const gate = page.getByTestId('owner-terms-gate');
    await expect(gate, '동의 기록이 없는 업주에게 게이트가 안 떴다').toBeVisible({ timeout: 20_000 });
    const go = page.getByRole('button', { name: '동의하고 계속' });
    await expect(go).toBeDisabled();
    await page.getByTestId('owner-terms-agree').check();
    await go.click();
    await expect(gate).toBeHidden({ timeout: 10_000 });
    expect(rec).toEqual([{ p_version: 1, p_source: 'gate' }]);
  });
});
