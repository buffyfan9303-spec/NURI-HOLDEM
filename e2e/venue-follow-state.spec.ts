// e2e/venue-follow-state.spec.ts — C1(오너 2026-09-24) 매장 팔로우 버튼 상태 구별 회귀 가드.
//
// 오너 신고: "매장 페이지의 팔로잉 알약이 팔로우가 된 건지 안 된 건지 헷갈린다."
// 원인: 예전 버튼은 '팔로잉'(팔로우 중)이 채운 보라색, '팔로우'(미팔로우)가 회색 윤곽이었다 —
//   인스타그램·X·유튜브 구독 버튼과 **정반대**라, 채운 버튼을 '아직 눌러야 할 행동'으로 읽었다.
// 계약: 미팔로우 = 채운 강조 + '+' 아이콘 + '팔로우' / 팔로우 중 = 중립 윤곽 + '✓' 아이콘 + '팔로잉'.
//   상태는 aria-pressed 로 노출, 이름('매장 팔로우')은 고정. 토글해도 버튼 폭이 흔들리지 않는다.
// 음성 대조: VenuePage.tsx FollowButton 의 두 색 분기를 예전처럼 뒤바꾸면 '미팔로우가 채운 강조' 단언이,
//   `border-transparent` 를 빼면 폭 불변 단언이 빨개진다.
// ⚠ 운영 DB 무접촉 — 로그인은 stubLogin(로컬 세션), venue_follows 쓰기는 page.route 로 받아 인자만 단언한다.
// 스크린샷이 필요하면 FOLLOW_SHOT_DIR=<폴더> 를 주고 돌린다(없으면 찍지 않는다).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, stubLogin } from './_session';

const VENUE_ID = '77777777-1111-4111-8111-777777777777';
const VENUE_ROW = {
  id: VENUE_ID, name: '팔로우 검증 홀덤', region: '서울', address: '서울 어딘가 1',
  approved: true, status: 'active', verification_status: 'verified', is_paid_ad: false, display_order: 1,
  follower_count: 12, rating: null,
};
const ACCENT = 'rgb(99, 68, 206)'; // --accent-300 (다크·라이트 동일)
const SHOT_DIR = process.env.FOLLOW_SHOT_DIR;

interface Writes { posts: unknown[]; deletes: string[] }

async function setup(page: Page, theme: 'dark' | 'light', width: number): Promise<{ uid: string; writes: Writes }> {
  const writes: Writes = { posts: [], deletes: [] };
  let followed = false;
  await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t); } catch { /* 저장소 차단 */ } }, theme);
  await stabilizeBackstack(page);
  await page.route(/\/rest\/v1\/venues\?/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([VENUE_ROW]) }));
  await page.route(/\/rest\/v1\/venue_follows/, async (r) => {
    const req = r.request();
    const json = (b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
    if (req.method() === 'GET') return json(followed ? [{ venue_id: VENUE_ID }] : []);
    if (req.method() === 'POST') { writes.posts.push(JSON.parse(req.postData() ?? 'null')); followed = true; return json([], 201); }
    if (req.method() === 'DELETE') { writes.deletes.push(req.url()); followed = false; return json([{ venue_id: VENUE_ID }]); }
    return json({ message: 'blocked' }, 500);
  });
  const uid = await stubLogin(page);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?venue=${VENUE_ID}`);
  return { uid, writes };
}

async function measure(page: Page) {
  return page.getByTestId('venue-follow').evaluate((el) => {
    const lum = (c: string) => {
      const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
        const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const cs = getComputedStyle(el);
    // 배경이 투명하면 헤더 지면까지 거슬러 올라가 실제로 깔린 색으로 잰다(순백 기준 금지).
    let bgEl: Element | null = el; let bg = cs.backgroundColor;
    while (bgEl && /rgba\(.*, 0\)|transparent/.test(bg)) { bgEl = bgEl.parentElement; bg = bgEl ? getComputedStyle(bgEl).backgroundColor : 'rgb(0,0,0)'; }
    const [l1, l2] = [lum(cs.color), lum(bg)].sort((a, b) => b - a);
    const r = el.getBoundingClientRect();
    const after = getComputedStyle(el, '::after');
    // 적중: 44px 상자의 네 모서리 안쪽이 정말 이 버튼을 돌려주는지
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const probe = [[cx, cy - 21.5], [cx, cy + 21.5], [cx - Math.max(r.width, 44) / 2 + 0.5, cy], [cx + Math.max(r.width, 44) / 2 - 0.5, cy]];
    const hits = probe.map(([x, y]) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); });
    const svg = el.querySelector('svg');
    return {
      pressed: el.getAttribute('aria-pressed'), label: el.getAttribute('aria-label'), text: (el.textContent ?? '').trim(),
      bg: cs.backgroundColor, color: cs.color, border: `${cs.borderTopWidth} ${cs.borderTopColor}`,
      icon: svg?.getAttribute('class') ?? '', width: r.width, height: r.height,
      hitW: parseFloat(after.width), hitH: parseFloat(after.height), hits,
      contrast: (l1 + 0.05) / (l2 + 0.05),
    };
  });
}

for (const theme of ['dark', 'light'] as const) {
  for (const width of [390, 1440]) {
    test(`🔴 C1 매장 팔로우 — 두 상태가 아이콘·문구·색으로 갈리고 폭이 안 흔들린다 (${theme} ${width})`, async ({ page }) => {
      test.setTimeout(60_000);
      const { uid, writes } = await setup(page, theme, width);
      const btn = page.getByTestId('venue-follow');
      await expect(btn, '매장 페이지 헤더에 팔로우 버튼이 없다').toBeVisible({ timeout: 20_000 });
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
      await page.waitForTimeout(400); // 진입 애니메이션(0.25s) 정착

      const off = await measure(page);
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${theme}-${width}-1-before.png`, clip: { x: 0, y: 0, width, height: 260 } });

      await btn.click();
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      await expect(btn).toBeEnabled();
      await page.mouse.move(0, 800); // hover 색을 걷어낸다
      await page.waitForTimeout(250);
      const on = await measure(page);
      if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${theme}-${width}-2-after.png`, clip: { x: 0, y: 0, width, height: 260 } });

      console.log(JSON.stringify({ theme, width, off, on }));

      // 쓰기 인자 — 본인 id + 이 매장 id 한 건
      expect(writes.posts).toEqual([{ user_id: uid, venue_id: VENUE_ID }]);

      // 3중 구별: 색(미팔로우만 채운 강조) · 아이콘 · 문구
      expect(off.bg, '미팔로우가 채운 강조색이 아니다(예전 역전 상태)').toBe(ACCENT);
      expect(on.bg, '팔로우 중인데 여전히 강조색이다').not.toBe(ACCENT);
      expect(off.icon).toContain('lucide-plus');
      expect(on.icon).toContain('lucide-check');
      expect(off.text).toBe('팔로우');
      expect(on.text).toBe('팔로잉');
      // 이름은 고정, 상태는 aria-pressed
      expect(off.label).toBe('매장 팔로우');
      expect(on.label).toBe('매장 팔로우');
      // 폭 불변(문구·테두리 때문에 알약이 흔들리지 않게)
      expect(Math.abs(on.width - off.width), `토글 시 폭 변화 ${off.width}→${on.width}`).toBeLessThan(0.5);
      // 대비 AA · 터치 44px
      for (const [name, m] of [['미팔로우', off], ['팔로우 중', on]] as const) {
        expect(m.contrast, `${name} 글자 대비 ${m.contrast.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        expect(Math.min(m.hitW, m.hitH), `${name} 터치 상자 ${m.hitW}×${m.hitH}`).toBeGreaterThanOrEqual(44);
        expect(m.hits, `${name} 44px 상자 가장자리가 버튼을 돌려주지 않는다`).toEqual([true, true, true, true]);
      }

      // 해제 — 실수 방지 확인창은 원래 없었다(추가하지 않음). DELETE 는 본인·이 매장으로 한정.
      await btn.click();
      await expect(btn).toHaveAttribute('aria-pressed', 'false');
      expect(writes.deletes).toHaveLength(1);
      expect(writes.deletes[0]).toContain(`user_id=eq.${uid}`);
      expect(writes.deletes[0]).toContain(`venue_id=eq.${VENUE_ID}`);
    });
  }
}
