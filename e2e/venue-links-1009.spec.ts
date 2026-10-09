// e2e/venue-links-1009.spec.ts — 매장 페이지 손님 화면(390) 오픈 점검 지적 VEN-02 · VEN-03 회귀 가드.
//
// VEN-02(P2): 매장 소개·매장 공지 안의 http(s) 링크와 전화번호가 눌리지 않는 그냥 글자였다(로티 '링크 모음: https://litt.ly/rotiarena').
//   계약 ① 소개의 URL·전화는 <a> 다 — URL 은 새 창(target=_blank, rel=noopener noreferrer nofollow), 전화는 tel:숫자.
//        ② 'javascript:'·'data:' 는 글자로 남는다(href 로 승격되는 <a> 0개). 줄바꿈은 그대로.
//        ③ 긴 URL 도 390 폭을 넘지 않는다(문서·시트 가로 넘침 0). ④ 링크 글자 대비 AA(4.5) — 다크·라이트, 실제 깔린 면 기준.
//        ⑤ 커뮤니티 탭 '매장 공지' 본문의 URL·전화도 <a> 다.
// VEN-03(P3): 포스터 탭 '금일 포스터' 안에 플랫폼 약관 공지(marketplace_notices)가 매장 공지처럼 나왔다.
//   계약 ⑥ 그 자리에는 이 매장 공지(venue_notices)가 나오고 플랫폼 공지 제목은 매장 페이지 어디에도 없다.
// 음성 대조(2026-10-09, origin/main 4d9253e8 같은 목 — scratchpad venue.cjs): 소개 링크 0개 · 공지 링크 0개 · 플랫폼 공지 노출 → ①⑤⑥ 실패.
// PR #258 독립 검증(2026-10-09) P2·P3 — 계약 ⑦ 매장 공지는 매장마다 한 번만 받는다(포스터↔소개↔커뮤니티 왕복에도 GET 1회).
//   ⑧ 공지가 600ms 넘게 늦게 와도 금일 포스터의 오늘 대회 카드(TODAY) 위치가 0px 변한다. ⑨ 포스터 탭 공지 본문의 링크·전화가 말줄임에 잘려 숨지 않는다.
//   음성 대조: 0a37cc62(포스터 탭 판이 열릴 때마다 공지를 받고 공지가 TODAY 위에 있던 판) — GET 3회 · TODAY 밀림 · 전화 링크가 잘림.
// ⚠ 운영 DB 무접촉 — 매장·일정·공지는 page.route 로 답한다. 로그인 없음.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';
import { kstDay } from './_schedules';

const VID = '00000000-0000-4000-8000-0000000000d9';
const OWNER = '00000000-0000-4000-8000-0000000000b9';
const LONG = `https://example.com/${'a'.repeat(90)}/${'b'.repeat(38)}?x=1`;
// 운영 로티아레나 소개(2026-10-09 읽기 전용 조회)의 링크 줄 + 위험 스킴 + 긴 URL.
const DESC = [
  '구리, 다산 탑클래스 홀덤 준도짱과 버블해랑의 로티생활', '',
  '■ 매일 진행하는 토너먼트 정보·이벤트: http://www.rotiarena.com',
  '■ 링크 모음: https://litt.ly/rotiarena',
  '■ 문의: 010-4679-5617',
  '■ 위험: javascript:alert(1) data:text/html,x',
  `■ 긴 주소: ${LONG}`,
].join('\n');
const VENUE_NOTICE = '♥️환영합니다♥️\n🌐 http://www.rotiarena.com에서\n확인하세요.\n📲010-5248-8587';
const PLATFORM_TITLE = '이용약관 제4판 개정 안내(플랫폼 공지)';
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');

async function open(page: Page, theme: 'dark' | 'light', opt: { onNoticeGet?: () => Promise<void> } = {}) {
  await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t); } catch { /* 저장소 차단 */ } }, theme);
  await stabilizeBackstack(page);
  const row = {
    id: VID, name: '링크 매장', kind: 'venue', owner_id: OWNER, approved: true, status: 'active', region: '경기',
    address: '남양주시 다산동 6087 한강프라자 4층', description: DESC, images: [], image_url: null, follower_count: 0,
    is_paid_ad: false, display_order: 1, verification_status: 'verified', contact_phone: '010-0000-0000',
    contact_phones: [{ label: '대표', phone: '010-0000-0000' }], business_hours: 'OPEN 17:00', created_at: '2026-10-01T00:00:00Z',
  };
  await page.route(/\/rest\/v1\/venues\?/, (r) => {
    const url = r.request().url();
    if (r.request().method() !== 'GET' || (url.includes('id=eq.') && !url.includes(`id=eq.${VID}`))) return r.fallback();
    return r.fulfill(json(single(r) ? row : [row]));
  });
  await page.route(/\/rest\/v1\/schedules\?/, (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const s = {
      id: '00000000-0000-4000-8000-0000000000e9', title: '링크 매장 데일리', venue_id: VID, pub_name: row.name, region: '경기', address: row.address,
      date: kstDay(0), start_time: '23:30:00', duration: '5시간', format: 'MTT', guaranteed: false, prize_pool: 0, buy_in: { amount: 50_000 },
      approved: true, display_order: 1, is_premium: false, premium_until: null, owner_id: OWNER, unread_qna_count: 0, view_count: 0, is_competition: false, grade: null,
    };
    return r.fulfill(json(single(r) ? s : [s]));
  });
  await page.route(/\/rest\/v1\/marketplace_notices/, (r) => r.request().method() === 'GET'
    ? r.fulfill(json([{ id: 'p1', type: 'pinned', title: PLATFORM_TITLE, body: '플랫폼 공지 본문', author_name: '운영', created_at: '2026-10-08T00:00:00Z', board: 'all', sort_order: 3 }]))
    : r.fallback());
  await page.route(/\/rest\/v1\/venue_notices/, async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    await opt.onNoticeGet?.();
    return r.fulfill(json([{ id: 'vn1', venue_id: VID, author_id: OWNER, author_name: '링크 매장', content: VENUE_NOTICE, created_at: '2026-10-08T20:19:23Z' }]));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?venue=${VID}`);
  const dlg = page.getByRole('dialog', { name: /매장 페이지/ });
  await expect(dlg).toBeVisible({ timeout: 20_000 });
  await dismissOverlays(page);
  return dlg;
}

for (const theme of ['dark', 'light'] as const) {
  test(`🔴 VEN-02 소개 링크·전화가 눌리고 위험 스킴은 글자로 · 넘침 0 · 대비 AA (${theme} 390)`, async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const dlg = await open(page, theme);
    const desc = dlg.getByTestId('venue-description');
    await expect(desc).toBeVisible({ timeout: 15_000 });
    await desc.evaluate((p) => p.scrollIntoView({ block: 'center' }));

    const m = await desc.evaluate((p) => {
      const bgOf = (el: Element | null): string => {
        for (let e = el; e; e = e.parentElement) {
          const c = getComputedStyle(e).backgroundColor; const v = c.match(/[\d.]+/g);
          if (v && (v.length < 4 || Number(v[3]) > 0.9)) return c;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const lum = (c: string) => {
        const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((q, w) => w - q); return (x + 0.05) / (y + 0.05); };
      const scroller = p.closest('[role="dialog"]')!.querySelector('.overflow-y-auto') ?? p.closest('[role="dialog"]')!;
      return {
        links: [...p.querySelectorAll('a')].map((a) => ({
          text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'),
          right: a.getBoundingClientRect().right, contrast: ratio(getComputedStyle(a).color, bgOf(a)),
        })),
        text: p.textContent ?? '',
        riskyAnchors: document.querySelectorAll('a[href^="javascript:" i], a[href^="data:" i]').length,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sheetOverflow: scroller.scrollWidth - scroller.clientWidth,
        pRight: p.getBoundingClientRect().right, vw: window.innerWidth,
      };
    });
    console.log(`[venue-links ${theme}] ${JSON.stringify({ ...m, text: undefined })}`);

    const byHref = Object.fromEntries(m.links.map((l) => [l.href, l]));
    expect(Object.keys(byHref).sort(), '소개의 링크·전화가 <a> 로 그려지지 않았다').toEqual(
      ['http://www.rotiarena.com/', 'https://litt.ly/rotiarena', LONG, 'tel:01046795617'].sort());
    for (const l of m.links) {
      if (l.href!.startsWith('tel:')) { expect(l.target, '전화 링크는 새 창이 아니다').toBeNull(); continue; }
      expect(l.target, `${l.href} 새 창`).toBe('_blank');
      expect(l.rel?.split(' ').sort(), `${l.href} rel`).toEqual(['nofollow', 'noopener', 'noreferrer']);
    }
    expect(m.riskyAnchors, 'javascript:/data: 가 링크로 승격됐다').toBe(0);
    expect(m.text, '위험 스킴 글자는 그대로 남아야 한다').toContain('javascript:alert(1) data:text/html,x');
    expect(m.text, '줄바꿈이 보존돼야 한다').toContain('\n■ 링크 모음: ');
    expect(m.docOverflow, '문서 가로 넘침').toBeLessThanOrEqual(0);
    expect(m.sheetOverflow, '매장 시트 가로 넘침(긴 URL)').toBeLessThanOrEqual(0);
    for (const l of m.links) {
      expect(l.right, `${l.href} 가 화면 밖으로 나갔다`).toBeLessThanOrEqual(m.vw);
      expect(l.contrast, `${l.href} 글자 대비`).toBeGreaterThanOrEqual(4.5);
    }
    expect(errors, `페이지 오류: ${errors.join(' | ')}`).toEqual([]);
  });
}

test('🔴 VEN-03 포스터 탭에는 매장 공지만 · VEN-02 매장 공지의 링크·전화가 눌린다 (390)', async ({ page }) => {
  test.setTimeout(90_000);
  const dlg = await open(page, 'dark');

  await dlg.getByRole('tab', { name: '포스터' }).click();
  const toggle = dlg.getByRole('button', { name: /금일 포스터/ });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const notice = dlg.getByTestId('venue-poster-notice');
  await expect(notice, '금일 포스터에 이 매장 공지가 없다').toHaveCount(1, { timeout: 15_000 });
  await expect(notice).toContainText('환영합니다');
  await expect(notice.locator('a[href="tel:01052488587"]'), '포스터 탭 공지의 전화가 링크가 아니다').toHaveCount(1);
  await expect(dlg.getByText(PLATFORM_TITLE), '플랫폼 공지가 매장 포스터 탭에 매장 공지처럼 나온다').toHaveCount(0);

  await dlg.getByRole('tab', { name: '커뮤니티' }).click();
  const content = dlg.getByTestId('venue-notice-content');
  await expect(content).toHaveCount(1, { timeout: 15_000 });
  await expect(content.locator('a[href="http://www.rotiarena.com/"][target="_blank"]'), '공지 URL 이 링크가 아니다').toHaveCount(1);
  await expect(content.locator('a[href="tel:01052488587"]'), '공지 전화가 링크가 아니다').toHaveCount(1);
  // 한글이 바로 붙은 URL 은 한글 앞에서 끊긴다 — 링크 글자에 '에서' 가 섞이지 않는다
  await expect(content.locator('a[href^="http"]')).toHaveText('http://www.rotiarena.com');
  await expect(dlg.getByText(PLATFORM_TITLE)).toHaveCount(0);
});

test('🔴 매장 공지 — 탭 왕복에도 GET 1회 · 600ms 늦게 와도 TODAY 카드 0px · 포스터 탭 공지 링크가 잘려 숨지 않는다 (390)', async ({ page }) => {
  test.setTimeout(90_000);
  let gets = 0;
  let release!: () => void;
  const gate = new Promise<void>((res) => { release = res; });
  // 공지 응답을 붙잡아 둔다 — TODAY 위치를 잰 뒤에 놓아 준다(그 전에 600ms 이상 기다린다 = '늦게 오는 공지').
  const dlg = await open(page, 'dark', { onNoticeGet: async () => { gets += 1; await gate; } });

  await dlg.getByRole('tab', { name: '포스터' }).click();
  const toggle = dlg.getByRole('button', { name: /금일 포스터/ });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const today = dlg.getByText('TODAY', { exact: true });
  await expect(today).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(700); // 아코디언 펼침이 끝나고, 공지는 아직 붙잡혀 있다(600ms 넘게 늦는 공지)
  const topOf = () => today.evaluate((el) => el.getBoundingClientRect().top);
  const before = await topOf();
  release();
  const notice = dlg.getByTestId('venue-poster-notice');
  await expect(notice, '금일 포스터에 이 매장 공지가 없다').toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(700);
  const after = await topOf();
  console.log(`[notice-once] TODAY top ${before} → ${after} · GET ${gets}`);
  expect.soft(Math.abs(after - before), `늦게 온 공지가 오늘 대회 카드를 ${after - before}px 밀었다`).toBeLessThan(0.5);

  // ⑨ 공지 본문의 링크·전화가 말줄임 밖(잘린 줄)에 숨지 않는다 — 각 <a> 가 자기 문단 상자 안에 그려진다.
  const clipped = await notice.evaluate((li) => [...li.querySelectorAll('a')].filter((a) => {
    const ar = a.getBoundingClientRect(); const pr = (a.closest('p') as HTMLElement).getBoundingClientRect();
    return ar.bottom > pr.bottom + 0.5 || ar.top < pr.top - 0.5;
  }).map((a) => a.textContent));
  expect.soft(clipped, `말줄임에 잘려 숨은 링크: ${clipped.join(', ')}`).toEqual([]);
  await expect(notice.locator('a[href="tel:01052488587"]')).toBeVisible();

  // ⑦ 탭 왕복 — 소개 → 포스터 → 커뮤니티. 공지는 다시 받지 않는다.
  await dlg.getByRole('tab', { name: '매장 소개' }).click();
  await dlg.getByRole('tab', { name: '포스터' }).click();
  await expect(dlg.getByTestId('venue-poster-notice')).toHaveCount(1, { timeout: 15_000 });
  await dlg.getByRole('tab', { name: '커뮤니티' }).click();
  await expect(dlg.getByTestId('venue-notice-content')).toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(500);
  expect.soft(gets, `매장 공지 GET 이 ${gets}번 나갔다 — 탭을 열 때마다 다시 받는다`).toBe(1);
});
