// 매장 쪽 파기 경로 두 곳(오너 2026-09-25 DATA-RETENTION) — 목킹 업주 · 운영 DB 쓰기 0.
//
//   ① 단골 관리(CRM)의 '손님 정보 삭제' — 확인창을 거쳐 customer_profiles 를 **실제 DELETE** 한다.
//      확인창을 취소하면 요청이 한 건도 나가면 안 된다(반례).
//   ② 매장 영구 삭제(킬스위치) 모달 — 지우기 전에 '먼저 자료를 내려받으세요' + 묶음 4개(장부·이용권 이력·근무·급여·손님 목록).
//      받은 파일이 실제로 그 매장 행을 담고 있고(BOM·구획 머리줄·행), 최종 확인 단계가 아직 안 받은 묶음을 말한다.
// 버튼 글자는 한 줄이어야 한다(오너: 버튼 줄바꿈 0) — 글자 줄 수를 Range.getClientRects 로 잰다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const GUEST = '홍길동';

/** 버튼 안 글자가 몇 줄로 그려졌는가(1 이어야 한다). */
const textLines = (page: Page, sel: string) => page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)].map((b) => {
  // 글자 노드만 잰다(아이콘 svg 는 줄이 아니다).
  const tops = new Set<number>();
  const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const r = document.createRange(); r.selectNodeContents(n);
    for (const x of r.getClientRects()) if (x.width > 0) tops.add(Math.round(x.top));
  }
  return { t: b.textContent?.trim(), lines: tops.size };
}), sel);

test('CRM — 손님 정보 삭제는 확인 후 customer_profiles 를 지우고, 취소하면 아무것도 안 보낸다', async ({ page }) => {
  test.setTimeout(120_000);
  const deletes: string[] = [];
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_buyins\?/, (r) => r.request().method() === 'GET'
        ? r.fulfill(json([{ player_name: GUEST, session_date: MOCK_DAY }])) : r.fallback());
      await p.route(/\/rest\/v1\/coupons\?/, (r) => r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback());
      await p.route(/\/rest\/v1\/customer_profiles\?/, (r) => {
        const m = r.request().method();
        if (m === 'DELETE') { deletes.push(decodeURIComponent(r.request().url())); return r.fulfill(json([{ id: 'c1' }])); }
        if (m !== 'GET') return r.fallback();
        const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        const row = { id: 'c1', venue_id: MOCK_VENUE, name: GUEST, birthday: '1990-03-04', phone: null, memo: null };
        return r.fulfill(json(single ? row : [row]));
      });
    },
  });
  await openMyStore(page);
  await page.getByRole('button', { name: /고객·단골/ }).first().click({ timeout: 20_000 });
  const dlg = page.getByRole('dialog', { name: '단골 관리' });
  await dlg.getByRole('button', { name: new RegExp(GUEST) }).first().click();
  const del = dlg.getByTestId('crm-delete-customer');
  await expect(del, '저장된 손님 정보가 있는데 삭제 버튼이 없다').toBeVisible({ timeout: 10_000 });
  expect((await textLines(page, '[data-testid="crm-delete-customer"]'))[0].lines, '삭제 버튼 글자가 두 줄이다').toBe(1);

  // 반례: 취소 → 요청 0
  page.once('dialog', (d) => d.dismiss());
  await del.click();
  await page.waitForTimeout(500);
  expect(deletes, '확인창을 취소했는데 DELETE 가 나갔다').toEqual([]);

  // 확인 → DELETE 1건(이 매장 · 이 이름), 성공 뒤 버튼이 사라진다
  let msg = '';
  page.once('dialog', (d) => { msg = d.message(); void d.accept(); });
  await del.click();
  await expect(del).toBeHidden({ timeout: 10_000 });
  expect(msg).toContain('장부·쿠폰 기록은 남습니다');
  expect(deletes).toHaveLength(1);
  expect(deletes[0]).toContain(`venue_id=eq.${MOCK_VENUE}`);
  expect(deletes[0]).toContain(`name=eq.${GUEST}`);
});

test('킬스위치 — 삭제 전 자료 내려받기: 4묶음 · 실제 행이 든 CSV · 최종 확인이 안 받은 묶음을 말한다', async ({ page }) => {
  test.setTimeout(120_000);
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/kill_switch_is_set/, (r) => r.fulfill(json(true)));
      // 내려받기용 GET — 이 매장 필터가 붙었는지 URL 로 확인하고 행 하나씩 준다.
      for (const t of ['ledger_sessions', 'ledger_players', 'ledger_buyins']) {
        await p.route(new RegExp(`/rest/v1/${t}\\?`), (r) => {
          const u = decodeURIComponent(r.request().url());
          if (r.request().method() !== 'GET' || !u.includes('select=*') || !u.includes(`venue_id=eq.${MOCK_VENUE}`)) return r.fallback();
          return r.fulfill(json(t === 'ledger_buyins' ? [{ id: 'b1', player_name: '=HYPERLINK("x")', cash_amount: 50000, session_date: MOCK_DAY }] : []));
        });
      }
    },
  });
  await openMyStore(page);
  await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')].find((b) => b.textContent?.includes('매장 설정'))?.click());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 800)));
  await page.evaluate(() => (document.querySelector('[data-tab-id="danger"]') as HTMLElement | null)?.click());
  await page.getByRole('button', { name: '매장 전체 영구 삭제' }).click({ timeout: 20_000 });

  const box = page.getByTestId('kill-export');
  await expect(box).toBeVisible();
  await expect(box).toContainText('먼저 자료를 내려받으세요');
  const btns = box.getByRole('button');
  await expect(btns).toHaveCount(4);
  const lines = await textLines(page, '[data-testid="kill-export"] button');
  console.log('[내려받기 버튼 줄 수]', JSON.stringify(lines));
  expect(lines.map((x) => x.t)).toEqual(['장부', '이용권 이력', '근무·급여', '손님 목록']);
  for (const l of lines) expect(l.lines, `${l.t} 버튼 글자가 줄바꿈됐다`).toBe(1);

  const [dl] = await Promise.all([page.waitForEvent('download'), btns.filter({ hasText: '장부' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^NURI-장부-\d{8}\.csv$/);
  const body = await (await import('node:fs/promises')).readFile((await dl.path())!, 'utf-8');
  expect(body.charCodeAt(0), 'BOM 이 없다 — 엑셀에서 한글이 깨진다').toBe(0xfeff);
  expect(body).toContain('# ledger_sessions (0행)');
  expect(body).toContain('# ledger_players (0행)');
  expect(body).toContain('# ledger_buyins (1행)');
  expect(body).toContain(`"'=HYPERLINK(""x"")"`); // 수식 주입 차단
  expect(body).toContain('50000');

  // 최종 확인 단계: 아직 안 받은 3묶음을 말한다
  await page.getByPlaceholder('실명 입력').fill('업주');
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByPlaceholder('비밀번호').fill('x');
  await page.getByRole('button', { name: '다음' }).click();
  await expect(page.getByText('아직 내려받지 않은 자료: 이용권 이력 · 근무·급여 · 손님 목록')).toBeVisible();
});
