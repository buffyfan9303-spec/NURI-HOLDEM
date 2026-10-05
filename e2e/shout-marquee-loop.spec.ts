// 유료 외치기 방송 줄 전광판 — 끊김 없는 순환 (오너 2026-10-04: "문구가 끝나면 뚝 끊긴 다음 다시 흐른다 → 이어서 반복돼 계속 흐르게")
//
// 실측 원인(수정 전 빌드): 방송이 다음 차례로 바뀌면 MarqueeText 의 트랙 span 이 재사용돼 애니메이션이 이어서 돌았다 —
//   새 문구가 처음이 아니라 **−235px(중간)** 에서 나타나고 주기만 15s→17s 로 바뀌었다. 같은 문구 안의 순환 자체는 이음새가 없었다.
// 이 파일이 보는 것
//   ① 같은 문구의 순환 경계 전후 프레임에서 글자 위치(복제 세트 폭 기준 위상)가 연속이다(점프 0) · 칸이 비는 프레임 0.
//      재생 속도를 8배로 올려 4초 안에 경계를 여러 번 지나게 한다(위상 판정은 속도와 무관하다).
//   ② 방송이 다음 차례로 바뀌면 새 문구는 처음(x≈0)부터 흐른다 — 수정 전 빌드는 여기서 실패한다.
//   ③ (2026-10-05) 안내 문구·칸보다 짧은 문구도 흐르고 루프 경계에서 점프가 없다. ④ 동작 줄이기에서는 흐르지 않는다(정적 말줄임).
// 외침 목록은 목킹(운영 community_shouts 는 2026-10-04 기준 0건이다).
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

const LONG = '오늘 저녁 강남 홀덤펍 메인 이벤트 같이 가실 분 구합니다 연락 주세요';
const NEXT = '다음 방송 내일 위클리 토너먼트 참가자 모집합니다 환영합니다';

async function mount(page: Page, rows: (t0: number) => unknown[]) {
  const t0 = Date.now();
  await page.route('**/rest/v1/community_shouts*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows(t0)) }));
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await expect(page.getByTestId('shout-live')).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(500);
}
const row = (t0: number, id: string, nick: string, message: string, from: number, len: number) => ({
  id, user_id: `u-${id}`, nickname: nick, message, cost: 50, tier: 'basic', tier_rank: 1, color: null,
  created_at: new Date(t0 + from - 1000).toISOString(), plays_at: new Date(t0 + from).toISOString(), expires_at: new Date(t0 + from + len).toISOString(),
});

/** 매 프레임: 첫 복제본의 x(뷰포트 기준)·세트 폭·칸 덮임·애니메이션 시간 */
const record = (page: Page, ms: number, rate = 1) => page.evaluate(async ({ ms, rate }) => {
  const card = document.querySelector('[data-testid="shout-live"]')!;
  const out: { t: number; txt: string; x0: number; w: number; covered: boolean; ct: number; dur: number }[] = [];
  const t0 = performance.now();
  await new Promise<void>((done) => {
    const tick = () => {
      const track = card.querySelector<HTMLElement>('.marquee-loop');
      if (track) {
        const a = track.getAnimations()[0];
        if (a && a.playbackRate !== rate) a.playbackRate = rate;
        const v = track.parentElement!.getBoundingClientRect();
        const k = [...track.children].map((c) => c.getBoundingClientRect());
        out.push({
          t: performance.now() - t0, txt: (track.textContent ?? '').slice(0, 4), x0: k[0].left - v.left, w: k[0].width,
          covered: Math.min(...k.map((b) => b.left)) <= v.left + 0.5 && Math.max(...k.map((b) => b.right)) >= v.right - 0.5,
          ct: Number(a?.currentTime ?? -1), dur: Number(a?.effect?.getTiming().duration ?? 0),
        });
      }
      if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  return out;
}, { ms, rate });

test('① 같은 문구는 경계에서 이어서 순환 — 위상 점프 0 · 빈 칸 0', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, (t0) => [row(t0, 'a', '포커왕김씨', LONG, -1000, 300_000)]);
  const f = await record(page, 4000, 8);
  expect(f.length, '흐르는 트랙이 없다(문구가 칸보다 짧거나 정적)').toBeGreaterThan(60);
  // 순환 경계 = 첫 복제본 x 가 세트 폭만큼 되돌아간 프레임. 4초 × 8배면 여러 번 지나야 한다.
  const wraps = f.filter((x, i) => i > 0 && x.x0 - f[i - 1].x0 > x.w / 2).length;
  expect(wraps, '순환 경계를 한 번도 안 지났다 — 판정 대상이 없다').toBeGreaterThanOrEqual(1);
  let worst = 0;
  for (let i = 1; i < f.length; i++) {
    const w = f[i].w;
    let d = (((f[i].x0 % w) + w) % w) - (((f[i - 1].x0 % w) + w) % w);
    if (d > w / 2) d -= w; if (d < -w / 2) d += w;
    // 기대 이동 = 세트 폭 × (애니메이션 시간 변화 / 주기). 벽시계(rAF)가 아니라 애니메이션 시간으로 재야 8배속 프레임 지터가 안 섞인다.
    const expected = -(w / f[i].dur) * (f[i].ct - f[i - 1].ct);
    worst = Math.max(worst, Math.abs(d - expected));
  }
  expect(worst, `순환 위상 점프 ${worst.toFixed(2)}px`).toBeLessThanOrEqual(3);
  expect(f.filter((x) => !x.covered).length, '글자가 칸을 다 못 덮은(빈 구간) 프레임').toBe(0);
});

test('② 다음 차례로 바뀌면 새 문구는 처음부터 흐른다(중간에서 끼어들지 않는다)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, (t0) => [row(t0, 'a', '포커왕김씨', LONG, -1000, 4500), row(t0, 'b', '다음사람', NEXT, 3500, 20_000)]);
  const f = await record(page, 5500);
  const sw = f.findIndex((x, i) => i > 0 && x.txt !== f[i - 1].txt);
  expect(sw, '다음 차례로 안 바뀌었다').toBeGreaterThan(0);
  const before = f[sw - 1];
  const first = f[sw];
  expect(before.x0, '앞 문구가 흐르지 않았다(판정 대상 없음)').toBeLessThan(-20);
  expect(first.x0, `새 문구가 ${first.x0.toFixed(1)}px(중간)에서 시작했다`).toBeGreaterThan(-4);
  expect(first.ct, '새 문구의 애니메이션이 이어서 돌았다(처음부터가 아니다)').toBeLessThan(200);
});

// ③ 오너 2026-10-05 "외치기가 옆으로 움직이질 않고 고정되어 있어" — 문구 길이와 무관하게 흐른다.
//   수정 전: 안내 문구(운영 방송 0건일 때 보이는 줄)는 6b7e0b95 에서 정적 말줄임이 됐고, 유료 문구도 칸보다 짧으면 정적이었다.
//   2초 동안 트랙 translateX 가 계속 변하고(정지 프레임 없음), 8배속으로 루프 경계를 지나도 위상 점프가 없고, 매 프레임 글자가 칸 안에 보인다.
const flow = (page: Page, sel: string, ms: number, rate: number) => page.evaluate(async ({ sel, ms, rate }) => {
  const out: { txt: string; tx: number; x0: number; w: number; ct: number; dur: number; seen: boolean; cover: boolean }[] = [];
  const t0 = performance.now();
  await new Promise<void>((done) => {
    const tick = () => {
      const track = document.querySelector(sel)?.querySelector<HTMLElement>('.marquee-loop');
      if (track) {
        const a = track.getAnimations()[0];
        if (a && a.playbackRate !== rate) a.playbackRate = rate;
        const v = track.parentElement!.getBoundingClientRect();
        const kids = [...track.children] as HTMLElement[];
        const seen = kids.some((k) => { const r = document.createRange(); r.selectNodeContents(k); const b = r.getBoundingClientRect();
          return b.width > 0 && b.right > v.left + 1 && b.left < v.right - 1; });
        out.push({ txt: (track.textContent ?? '').slice(0, 8), tx: new DOMMatrix(getComputedStyle(track).transform).m41,
          x0: kids[0].getBoundingClientRect().left - v.left, w: kids[0].getBoundingClientRect().width, seen,
          // 트랙 오른쪽 끝이 칸 오른쪽을 늘 덮어야 −50% 경계에서 오른쪽에 글자가 '툭' 나타나지 않는다(복제본이 칸보다 짧으면 깨진다)
          cover: track.getBoundingClientRect().right >= v.right - 0.5,
          ct: Number(a?.currentTime ?? -1), dur: Number(a?.effect?.getTiming().duration ?? 0) });
      } else out.push({ txt: '', tx: NaN, x0: NaN, w: 0, ct: -1, dur: 0, seen: false, cover: false });
      if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  return out;
}, { sel, ms, rate });

for (const [name, sel, rows] of [
  ['운영 방송 0건 — 안내 문구', '[data-testid="shout-idle"]', () => []],
  ['칸보다 짧은 유료 문구', '[data-testid="shout-live"]', (t0: number) => [row(t0, 'a', '김', '안녕', -1000, 300_000)]],
] as const) {
  test(`③ ${name}도 옆으로 계속 흐르고 루프 경계에서 점프가 없다`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const t0 = Date.now();
    await page.route('**/rest/v1/community_shouts*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows(t0)) }));
    await stabilizeBackstack(page);
    await page.goto('/?tab=community');
    await dismissOverlays(page);
    await expect(page.locator(sel)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(500);
    // (a) 1배속 2초 — 트랙이 있고 translateX 가 매 프레임 바뀐다(안내 문구가 20초 격자로 바뀌는 프레임 쌍은 뺀다)
    const a = await flow(page, sel, 2000, 1);
    expect(a.filter((f) => !Number.isFinite(f.tx)).length, '흐르는 트랙(.marquee-loop)이 없다 — 정적 줄').toBe(0);
    const pairs = a.slice(1).map((f, i) => [a[i], f] as const).filter(([p, f]) => p.txt === f.txt);
    const still = pairs.filter(([p, f]) => Math.abs(f.tx - p.tx) < 0.01).length;
    expect(still / pairs.length, `정지 프레임 비율 ${still}/${pairs.length}`).toBeLessThan(0.1);
    // (b) 8배속 2초 — 루프 경계를 지나도 위상이 이어지고(점프 ≤3px), 칸에 글자가 안 보이는 프레임이 없다
    const f = await flow(page, sel, 2000, 8);
    const wraps = f.filter((x, i) => i > 0 && x.txt === f[i - 1].txt && x.x0 - f[i - 1].x0 > x.w / 2).length;
    expect(wraps, '루프 경계를 한 번도 안 지났다 — 판정 대상이 없다').toBeGreaterThanOrEqual(1);
    let worst = 0;
    for (let i = 1; i < f.length; i++) {
      if (f[i].txt !== f[i - 1].txt) continue;
      const w = f[i].w;
      let d = (((f[i].x0 % w) + w) % w) - (((f[i - 1].x0 % w) + w) % w);
      if (d > w / 2) d -= w; if (d < -w / 2) d += w;
      worst = Math.max(worst, Math.abs(d + (w / f[i].dur) * (f[i].ct - f[i - 1].ct)));
    }
    expect(worst, `루프 경계 위상 점프 ${worst.toFixed(2)}px`).toBeLessThanOrEqual(3);
    expect(f.filter((x) => !x.seen).length, '칸에 글자가 하나도 안 보이는 프레임').toBe(0);
    expect(f.filter((x) => !x.cover).length, '트랙이 칸 오른쪽을 못 덮은 프레임(경계에서 글자가 툭 나타남)').toBe(0);
  });
}

test.describe('④ 동작 줄이기', () => {
  test('긴 문구도 흐르지 않고 정적 말줄임', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mount(page, (t0) => [row(t0, 'a', '포커왕김씨', LONG, -1000, 300_000)]);
    const s = await page.getByTestId('shout-live').locator('.marquee-loop').evaluate((el) => {
      const r0 = el.getBoundingClientRect().left; const cs = getComputedStyle(el);
      return { name: cs.animationName, te: cs.textOverflow, ws: cs.whiteSpace, r0 };
    });
    expect(s.name).toBe('none');
    expect([s.te, s.ws]).toEqual(['ellipsis', 'nowrap']);
    await page.waitForTimeout(600);
    const r1 = await page.getByTestId('shout-live').locator('.marquee-loop').evaluate((el) => el.getBoundingClientRect().left);
    expect(r1, '동작 줄이기인데 움직였다').toBe(s.r0);
  });
});
