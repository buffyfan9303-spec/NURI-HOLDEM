// 공지 — 접힌 한 줄 바(N07) + 상세 본문 구조화(UI-01) + 아우라 구분선(UI-03) 실화면 게이트 (2026-09-13).
//
// 이 파일이 보는 것
//   ① 게시판 공지 섹션은 기본 접힘에서 **한 바**다: 높이 44~56 CSS px(모바일), 3단(헤더·행·더보기)이 아니다.
//      대표 제목 버튼과 펼치기 버튼이 **형제**(중첩 button 없음), aria-expanded 가 뒤집히고 펼치면 전부 보인다.
//      키보드(Enter)로 펼친다. 큰 카드(card-aura)·transform 애니메이션이 없다.
//   ② 상세 본문: 원문의 번호 항목이 항목(li)으로, 문단이 p 로 갈리고 **모든 줄 내용이 화면에 그대로**(원문 보존) —
//      `1.5시간` 이 항목으로 쪼개지지 않고, 긴 URL 이 가로로 넘치지 않는다. 줄 높이는 1.75 그대로.
//      메타→본문 사이에 아우라 구분선 1개. 확인 버튼이 닫는다.
//   ③ WCAG 텍스트 간격 재정의(line-height 1.5 · 문단 뒤 2em · letter-spacing .12em · word-spacing .16em)에서
//      내용·확인 버튼이 사라지거나 잘리지 않는다(내성 검사 — 기본값 강제가 아니다).
//   ④ 폭 320·360·390·412·430·768·1280·1440 × 다크/라이트에서 바가 가로로 넘치지 않고 높이가 44~56(모바일)·≤56(PC) 안이다.
// 공지 조회는 page.route 로 응답을 만든다 — 운영 DB 에 쓰지 않는다(_fixtures 가드).
// 실행: E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/notice-bar.spec.ts
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

const LONG_URL = 'https://example.com/tournaments/2026/seoul-main-event-registration-and-schedule?utm_source=nuri&utm_campaign=verylongparam';
const BODY_LINES = [
  '안녕하세요. NURI HOLDEM 운영팀입니다.',
  '아래 내용을 확인해 주세요.',
  '',
  '1) 참가비는 1.5배 이벤트 기간에도 그대로입니다.',
  '   자세한 안내는 매장 페이지를 참고하세요.',
  '2) 만 19세 미만은 이용할 수 없습니다 (도박문제 상담 1336).',
  '3. 문의: ' + LONG_URL,
  '',
  '1.5시간 이상 지연 시 환불 규정은 별도 안내드립니다.',
];
const BODY = BODY_LINES.join('\n');
const row = (i: number, type: 'pinned' | 'event' | 'caution', title: string, body = '본문') => ({
  id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
  type, title, body, author_name: '운영자', board: 'all', sort_order: 0,
  created_at: new Date(Date.now() - i * 86_400_000).toISOString(),
});
const TOP = '🛒 중고장터 거래 안내 및 주의 (필독)';
const NOTICES = [
  row(0, 'pinned', '🎉 NURI HOLDEM 정식 오픈 — 전국 홀덤 대회 일정과 매장 정보를 한 곳에서 (필독)'),
  row(1, 'pinned', '📌 NURI HOLDEM 커뮤니티 이용 안내 (필독)'),
  row(2, 'caution', TOP, BODY),
];

async function openBoard(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t as string); } catch { /* 차단 */ } }, theme);
  await page.route(/\/rest\/v1\/marketplace_notices\?/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NOTICES) }));
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  const sec = page.locator('section[data-notice-bar]').first();
  await expect(sec, '공지 바가 없다').toBeVisible({ timeout: 15_000 });
  return sec;
}

const TEXT_SPACING = `* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }`;

test.describe('공지 — 접힌 한 줄 바(N07)', () => {
  test('🔴 390: 한 바 44~56px · 대표/펼치기 형제 버튼 · 펼치면 전부 · 키보드 · card-aura 없음', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const sec = await openBoard(page);
    const g = await sec.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const btns = Array.from(el.querySelectorAll('button'));
      return {
        h: r.height, w: r.width, vw: document.documentElement.clientWidth,
        overflowX: el.scrollWidth - el.clientWidth,
        nested: btns.some((b) => b.parentElement?.closest('button') != null),
        buttons: btns.length,
        cardAura: el.classList.contains('card-aura') || el.querySelector('.card-aura') != null,
        anims: el.getAnimations({ subtree: true }).filter((a) => ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).some((k) => 'transform' in k)).length,
        items: el.querySelectorAll('li').length,
      };
    });
    expect(g.h, `바 높이 ${g.h}px — 44~56 밖(3단 구조가 남았다)`).toBeGreaterThanOrEqual(44);
    expect(g.h).toBeLessThanOrEqual(56);
    expect(g.overflowX).toBeLessThanOrEqual(1);
    expect(g.nested, '중첩 button 이 있다').toBe(false);
    expect(g.cardAura, '큰 카드(card-aura)가 남았다').toBe(false);
    expect(g.anims).toBe(0);
    expect(g.items, '접힘 상태는 대표 1건만').toBe(1);

    // 대표 제목 버튼 = 상세, 펼치기 = 목록 — 별개 동작
    const top = sec.getByRole('listitem').first().getByRole('button');
    expect(await top.getAttribute('aria-label')).toContain(TOP);
    const more = sec.getByRole('button', { name: /공지 전체 3건 펼치기/ });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    const mb = (await more.boundingBox())!;
    expect(mb.height, '펼치기 터치 높이').toBeGreaterThanOrEqual(44);
    await more.focus();
    await page.keyboard.press('Enter');
    await expect(sec.getByRole('button', { name: '공지 목록 접기' })).toHaveAttribute('aria-expanded', 'true');
    await expect(sec.getByRole('listitem')).toHaveCount(3);
    // 펼친 목록의 각 행이 상세로 가는 버튼이다(전부 읽을 수 있다)
    for (const n of NOTICES) await expect(sec.getByRole('button', { name: new RegExp(n.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
    // 접기
    await sec.getByRole('button', { name: '공지 목록 접기' }).click();
    await expect(sec.getByRole('listitem')).toHaveCount(1);
    // 대표 제목 → 상세
    await top.click();
    await expect(page.getByRole('dialog').filter({ hasText: TOP })).toBeVisible({ timeout: 10_000 });
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`🔴 폭 8종 × ${theme}: 바가 넘치지 않고 높이가 한 줄 범위`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 390, height: 844 });
      const sec = await openBoard(page, theme);
      for (const w of [320, 360, 390, 412, 430, 768, 1280, 1440]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(250);
        const g = await sec.evaluate((el) => ({ h: el.getBoundingClientRect().height, ox: el.scrollWidth - el.clientWidth, right: el.getBoundingClientRect().right, vw: document.documentElement.clientWidth }));
        expect(g.ox, `${w}px: 가로 넘침 ${g.ox}`).toBeLessThanOrEqual(1);
        expect(g.right, `${w}px: 바가 뷰포트 밖`).toBeLessThanOrEqual(g.vw + 1);
        expect(g.h, `${w}px: 높이 ${g.h}`).toBeGreaterThanOrEqual(44);
        expect(g.h, `${w}px: 높이 ${g.h} — 한 줄 바가 아니다`).toBeLessThanOrEqual(56);
      }
    });
  }
});

test.describe('공지 상세 — 문단·번호 구조(UI-01) + 아우라 구분선(UI-03)', () => {
  test('🔴 원문 보존 · 번호 항목 li · 1.5 는 항목 아님 · URL 넘침 없음 · 줄 높이 1.75 · 구분선 1개 · 확인 닫힘', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const sec = await openBoard(page);
    await sec.getByRole('listitem').first().getByRole('button').click();
    const dialog = page.getByRole('dialog').filter({ hasText: TOP }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const body = dialog.locator('[data-notice-body]');
    await expect(body).toBeVisible();
    const g = await body.evaluate((el) => {
      const cs = getComputedStyle(el);
      const lis = Array.from(el.querySelectorAll('li')).map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim());
      const ps = Array.from(el.querySelectorAll(':scope > p')).map((p) => p.textContent ?? '');
      const clipped = Array.from(el.querySelectorAll('*')).filter((n) => n.scrollWidth - n.clientWidth > 1).length;
      const dialog = el.closest('[role="dialog"]')!;
      return {
        lh: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), lis, ps,
        text: (el.textContent ?? ''), ox: el.scrollWidth - el.clientWidth, clipped,
        hr: dialog.querySelectorAll('hr.divider-aura').length,
        wb: cs.wordBreak,
      };
    });
    expect(g.lh).toBeGreaterThanOrEqual(1.7); expect(g.lh).toBeLessThanOrEqual(1.8);
    // 원문 보존 — 비어 있지 않은 모든 줄의 내용이 화면 텍스트에 그대로 있다
    for (const l of BODY_LINES.filter((l) => l.trim())) expect(g.text, `원문 줄이 사라졌다: ${l}`).toContain(l.trim());
    expect(g.lis, '항목 3개(1) 2) 3.)').toHaveLength(3);
    expect(g.lis[0]).toMatch(/^1\) 참가비는 1\.5배 이벤트 기간에도 그대로입니다\. 자세한 안내는/);   // 이어지는 줄이 같은 항목
    expect(g.lis[2]).toMatch(/^3\. 문의:/);
    expect(g.ps.some((p) => p.startsWith('1.5시간')), '`1.5시간` 문단이 항목으로 쪼개졌다').toBe(true);
    expect(g.ox, '본문이 가로로 넘친다(긴 URL)').toBeLessThanOrEqual(1);
    expect(g.clipped).toBe(0);
    expect(g.wb, '전역 break-all 로 해결하지 않는다').not.toBe('break-all');
    expect(g.hr, '메타→본문 아우라 구분선').toBe(1);
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('🔴 텍스트 간격 재정의 내성 — 내용·확인 버튼이 남고 잘리지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const sec = await openBoard(page);
    await page.addStyleTag({ content: TEXT_SPACING });
    await sec.getByRole('listitem').first().getByRole('button').click();
    const dialog = page.getByRole('dialog').filter({ hasText: TOP }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const body = dialog.locator('[data-notice-body]');
    const text = await body.textContent();
    for (const l of BODY_LINES.filter((l) => l.trim())) expect(text ?? '').toContain(l.trim());
    expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const ok = dialog.getByRole('button', { name: '확인', exact: true });
    await ok.scrollIntoViewIfNeeded();
    await expect(ok).toBeVisible();
    const bb = (await ok.boundingBox())!;
    expect(bb.height).toBeGreaterThanOrEqual(40);
    // 공지 바도 간격 재정의에서 내용이 사라지지 않는다
    await ok.click();
    await expect(sec.getByRole('listitem').first().getByRole('button')).toBeVisible();
  });
});
