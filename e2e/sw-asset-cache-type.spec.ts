/**
 * PR #206(#205 검토 P3-5) — 서비스워커는 /assets 응답을 JS·CSS·폰트·이미지일 때만 캐시에 담는다.
 * 배포 공백에 옛 청크 주소로 요청하면 Vercel 재작성 때문에 200 text/html(index.html)이 온다 — 그것이 나중 청크 재시도
 * (?r=n — iconsExtraLoader·sbRealtimeLazy)마다 주소별로 쌓여 셸 자산을 밀어냈다(검토 실측 31건).
 * 실제 브라우저 SW 로 확인한다: 앱이 등록한 /sw.js 가 페이지를 제어하게 된 뒤, 옛 청크 자리(html)와 정상 JS 를 받아 캐시를 본다.
 * 거짓 통과 방지: ① 페이지가 SW 제어 아래에 있다 ② 같은 조건의 JS 응답은 실제로 담겼다(캐시가 동작한다).
 */
import { test, expect } from './_fixtures';

test.use({ serviceWorkers: 'allow' });

test('SW 는 /assets 의 200 text/html 을 ?r= 주소마다 담지 않고, JS 는 담는다', async ({ page, context }) => {
  test.setTimeout(60_000);
  // SW 의 fetch 도 context.route 를 거친다(Chromium). 옛 청크 자리 = index.html, 정상 청크 = JS.
  await context.route(/\/assets\/zz-gone-/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html></html>' }));
  await context.route(/\/assets\/zz-live-/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: 'export default 1;' }));

  await page.goto('/');
  // ① SW 가 이 페이지를 제어할 때까지(activate 의 clients.claim)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000, message: 'SW 제어 없음(시나리오 불성립)' }).toBe(true);

  const keys = await page.evaluate(async () => {
    for (let n = 1; n <= 3; n++) await fetch(`/assets/zz-gone-OLD.js?r=${n}`);
    await fetch('/assets/zz-live-NEW.js');
    const c = await caches.open('nuri-shell-v2');
    return (await c.keys()).map((k) => new URL(k.url).pathname + new URL(k.url).search).filter((u) => u.includes('/zz-'));
  });
  // ② JS 는 담겼고 ③ html 은 하나도 없다
  expect(keys).toContain('/assets/zz-live-NEW.js');
  expect(keys.filter((u) => u.includes('zz-gone')), `text/html 이 담겼다: ${keys.join(', ')}`).toEqual([]);
});
