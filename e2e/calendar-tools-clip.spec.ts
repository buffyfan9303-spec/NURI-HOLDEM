// e2e/calendar-tools-clip.spec.ts — 내 캘린더 하단 '뱅크롤 관리·분산 시뮬' 버튼의 부제가 잘리지 않는다(감사 audit-mystore-ui-1002 K-1, 2026-10-02).
//
// 실측(수정 전, 390 · Pixel 7): '게임별 권장 참가비 배수' scrollWidth 110 / clientWidth 94, '운 나쁠 때 잃을 폭 예측' 106 / 94 —
//   `truncate`(한 줄 + …)라 부제 끝이 잘렸다(360 은 79, 320 은 59). 2줄 clamp 로 바꿨고 문구는 그대로다(검색·툴팁이 계속 읽는다).
// 음성 대조: CalendarToolsPanel 의 부제 span 을 `block truncate` 로 되돌리면 세 폭 모두 빨개진다(위 수치 재현).
// 데이터는 로컬 목킹(개인 기록 = 본인만) — 운영 쓰기 0.
import { test, expect } from './_fixtures';

const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-00000000c01a';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), 'e2e'].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'cal@example.com', app_metadata: {}, user_metadata: { name: '캘린더' }, created_at: new Date().toISOString() },
};
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

for (const [w, h] of [[390, 844], [360, 780], [320, 640]] as const) {
  test(`내 캘린더 자금 도구 부제가 ${w}px 에서 잘리지 않는다`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } }, [KEY, JSON.stringify(FAKE)] as [string, string]);
    await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(FAKE.user)));
    await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({ id: UID, name: '캘린더', nickname: '캘린더', role: 'user', status: 'active', activity_points: 0, created_at: FAKE.user.created_at })));
    await page.route(/\/rest\/v1\/bankroll_entries\?/, (r) => r.fulfill(json([])));
    await page.goto('/?tab=calendar');
    const pane = page.locator('[data-tab="calendar"]');
    await expect(pane).toBeVisible({ timeout: 20_000 });
    await expect(pane.getByRole('button', { name: /뱅크롤 관리/ })).toBeVisible({ timeout: 20_000 });
    const rows = await pane.evaluate((root) => {
      const out: { text: string; scrollW: number; clientW: number; scrollH: number; clientH: number }[] = [];
      for (const b of root.querySelectorAll<HTMLElement>('button')) {
        if (!/뱅크롤 관리|분산 시뮬/.test(b.textContent ?? '')) continue;
        const d = [...b.querySelectorAll<HTMLElement>('span.text-2xs')].find((s) => /권장 참가비|잃을 폭/.test(s.textContent ?? ''));
        if (d) out.push({ text: d.textContent ?? '', scrollW: d.scrollWidth, clientW: d.clientWidth, scrollH: d.scrollHeight, clientH: d.clientHeight });
      }
      return out;
    });
    expect(rows.length, '부제 두 칸을 못 찾았다 — 셀렉터가 낡았다(0건 통과 방지)').toBe(2);
    for (const r of rows) {
      expect(r.scrollW, `가로로 잘림: ${JSON.stringify(r)}`).toBeLessThanOrEqual(r.clientW + 1);
      expect(r.scrollH, `세로로 잘림(2줄 초과): ${JSON.stringify(r)}`).toBeLessThanOrEqual(r.clientH + 1);
    }
  });
}
