/**
 * 번들 감축 PR B — 실시간 청크(realtime-js + phoenix)를 첫 channel() 때 받는다(src/lib/sbRealtimeLazy.ts).
 * 그 청크를 부팅 중에 못 받아도, 망이 돌아오면 **새로고침 없이** 홈 일정 구독이 붙는다.
 *
 * 왜 e2e 인가: 재시도는 빌드 산출물의 `import("./RealtimeClient-<해시>.js")` 를 읽어 `?r=n` 새 주소로 받는다 — vitest 에는 그 문자열이 없다.
 *   브라우저는 실패한 동적 import 를 같은 주소로는 다시 받지 않는다(PR #205 실측, e2e/icons-extra-retry.spec.ts).
 * 거짓 통과 방지: ① 차단이 실제로 요청을 끊었다(hits) ② 끊긴 동안 소켓 join 0 ③ 회복 요청이 다른 주소(?r=)였다
 *   ④ 새로고침으로 회복한 것이 아니다(창 표식 유지).
 * 소켓은 가짜 서버(routeWebSocket) — 운영 realtime 으로 나가지 않는다.
 */
import { test, expect } from './_fixtures';

test.use({ viewport: { width: 390, height: 844 } });

const NAV = 'nav[aria-label="하단 내비게이션"]';

test('실시간 청크가 부팅 중에만 실패해도 새로고침 없이 홈 일정 구독이 붙는다', async ({ page, context }) => {
  test.setTimeout(90_000);
  let block = true;
  let hits = 0;
  const urls: string[] = [];
  await context.route(/\/assets\/RealtimeClient-[^/?]+\.js(\?.*)?$/, (r) => {
    urls.push(r.request().url());
    if (!block) return r.continue();
    hits++;
    return r.abort('internetdisconnected');
  });
  const joins: string[] = [];
  const replies: string[] = [];
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    ws.onMessage((raw) => {
      try {
        const [jr, ref, topic, event, payload] = JSON.parse(String(raw)) as [string, string, string, string, { config?: { postgres_changes?: object[] } }];
        if (event === 'phx_join') {
          joins.push(topic);
          const pgc = (payload?.config?.postgres_changes ?? []).map((c, i) => ({ ...c, id: 1 + i }));
          ws.send(JSON.stringify([jr, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: pgc } }]));
          replies.push(topic);
        } else {
          ws.send(JSON.stringify([jr, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
        }
      } catch { /* 이진 프레임 등 무시 */ }
    });
  });

  await page.goto('/');
  await page.waitForSelector(NAV, { timeout: 30_000 });
  await page.evaluate(() => { (window as unknown as { __noReload?: 1 }).__noReload = 1; });

  // ①② 끊김이 실제로 걸렸고 그동안 소켓 join 은 없다(홈은 부팅 직후 일정 구독을 연다)
  await expect.poll(() => hits, { timeout: 30_000, message: '실시간 청크 요청이 없었다(시나리오 불성립)' }).toBeGreaterThan(0);
  expect(joins, '청크 없이 join 이 나갔다').toEqual([]);

  block = false;   // 망 복구 — 클릭·online 없이 타이머 재시도만으로
  await expect.poll(() => joins.filter((t) => t.startsWith('realtime:schedules_all_')).length, {
    timeout: 40_000, message: '청크 복구 뒤에도 홈 일정 구독(schedules_all_)이 붙지 않았다',
  }).toBeGreaterThan(0);
  // ③ 회복은 다른 주소로 받았다
  expect(urls.some((u) => /\?r=\d+$/.test(u)), `재시도 주소: ${urls.join(' , ')}`).toBe(true);
  // ④ 새로고침이 아니다
  expect(await page.evaluate(() => (window as unknown as { __noReload?: 1 }).__noReload)).toBe(1);
});
