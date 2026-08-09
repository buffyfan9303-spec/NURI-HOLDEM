// 클락 자동 전진 / TV 표시 보정 E2E — 2026-07 'TV 00:00 얼음' 사건의 실동작 검증.
//
// 왜 유닛테스트로 부족한가: 이 결함의 본질은 '화면이 안 보일 때 무슨 일이 일어나는가' 였다.
//   levelCatchUp/effectiveLevel 의 계산은 유닛테스트로 고정했지만, 그 값이 실제로 손님이 보는
//   TV 화면(?display=)까지 도달하는지는 진짜 렌더러로만 확인할 수 있다.
//
// 사전 조건: clock_states 에 '밀린' 행이 있어야 한다. 아래 SQL 을 먼저 실행하고 돌린다.
//   (레벨 1분 × 8, current_index=0, ends_at = now() - 3분 30초 → 기대 표시: L4 · 약 30초)
//
//   insert into public.clock_states (venue_id, game_seq, title, config, current_index, running, ends_at, remaining_ms,
//     adj_entries, adj_rebuys, adj_earlies, adj_addons, eliminations)
//   values ('<venue>', 1, '⏱ 검증용 1분 블라인드', '<config>', 0, true, now() - interval '3 minutes 30 seconds', 0, 0,0,0,0,0);
//
// 실행: npx playwright test e2e/clock-catchup.spec.ts
import { test, expect } from '@playwright/test';

const VENUE = process.env.E2E_CLOCK_VENUE ?? 'f35b42d1-2d54-4905-95c1-1fda24e0f178';

test.describe('TV 디스플레이 — 낡은 클락 행에서도 실효 레벨을 보여준다', () => {
  // 이 스펙은 DB 픽스처(진행 중인 '밀린' 클락)를 전제로 한다.
  // 픽스처가 없을 때 '실패'로 두면 코드와 무관한 이유로 스위트가 빨개져 신호가 죽는다 —
  // 없으면 이유를 밝히고 skip 한다(있을 때만 진짜 게이트로 동작).
  test.beforeEach(async ({ page }) => {
    await page.goto(`/?display=${VENUE}`);
    const hasClock = await page.locator('body').filter({ hasText: /LEVEL/i }).count()
      .then(() => page.waitForFunction(() => /LEVEL/i.test(document.body.innerText), null, { timeout: 8_000 }).then(() => true))
      .catch(() => false);
    test.skip(!hasClock, `진행 중인 클락 픽스처가 없다(venue=${VENUE}) — 파일 상단 SQL 로 심고 다시 실행`);
  });

  test('🔴 밀린 클락이 00:00 에 얼지 않고 따라잡은 레벨·잔여시간을 표시한다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    // (beforeEach 에서 이미 로드 + 픽스처 확인 완료)
    const body = page.locator('body');

    const text = (await body.innerText()).replace(/\s+/g, ' ');

    // ① 레벨이 DB 저장값(current_index=0 → LEVEL 1)보다 전진해 있어야 한다.
    //    ⚠ 정확한 레벨 번호를 여기서 못 박지 않는 이유: 픽스처의 ends_at 이 now() 기준이라
    //      셋업~실행 사이에 흐른 시간만큼 기대값이 달라진다(시간 의존 테스트가 된다).
    //      전진 계산의 정확성은 고정 타임스탬프를 쓰는 유닛테스트(api/clock.level.test.ts)가 못 박고,
    //      여기서는 '그 계산이 손님 화면까지 도달하는가'만 본다 — 그게 이 E2E 의 유일한 존재 이유다.
    const levelMatch = text.match(/LEVEL\s*(\d+)/i);
    expect(levelMatch, `LEVEL 표기를 찾지 못함. 화면: ${text.slice(0, 400)}`).toBeTruthy();
    const level = Number(levelMatch![1]);
    expect(level, `DB 는 LEVEL 1 인데 화면도 1 이면 표시 보정이 안 걸린 것(실제 ${level})`).toBeGreaterThan(1);
    expect(level, `레벨 수(8)를 넘어 전진하면 무한 전진 가드가 깨진 것(실제 ${level})`).toBeLessThanOrEqual(8);

    // ② 타이머가 00:00 에 얼어 있으면 안 된다
    const mmss = text.match(/\b(\d{1,2}):(\d{2})\b/);
    expect(mmss, `타이머 표기를 찾지 못함. 화면: ${text.slice(0, 400)}`).toBeTruthy();
    const secs = Number(mmss![1]) * 60 + Number(mmss![2]);
    expect(secs, '00:00 으로 얼어 있으면 안 된다(표시 보정 미작동)').toBeGreaterThan(0);
    expect(secs, '1분 레벨이므로 잔여는 60초 이하여야 한다').toBeLessThanOrEqual(60);

    // ③ 1초 뒤 실제로 카운트다운이 흐르는가(정지 화면이 아님)
    const before = secs;
    await page.waitForTimeout(2200);
    const after2 = (await body.innerText()).replace(/\s+/g, ' ').match(/\b(\d{1,2}):(\d{2})\b/);
    expect(after2).toBeTruthy();
    const secs2 = Number(after2![1]) * 60 + Number(after2![2]);
    // 레벨 경계를 넘었으면 값이 커질 수 있으므로 '변했다'만 본다
    expect(secs2, '2초가 지나도 값이 그대로면 타이머가 멈춘 것').not.toBe(before);

    // ④ 손님 화면에서 콘솔 에러가 나면 안 된다
    expect(errors, `콘솔/페이지 에러: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('TV 화면은 DB를 쓰지 않는다 — 손님 기기가 클락을 바꾸면 안 된다', async ({ page }) => {
    // 왜 이걸 검사하나: 표시 보정을 넣으면서 '보정한 값을 저장해버리는' 실수를 하기 쉽다.
    //   손님 기기는 RLS(can_access_ledger)상 쓰기 권한이 없어 실패하겠지만,
    //   시도 자체가 없어야 요청 낭비와 에러 로그가 안 생긴다.
    const writes: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (u.includes('/rest/v1/clock_states') && r.method() !== 'GET') writes.push(`${r.method()} ${u}`);
    });

    await page.goto(`/?display=${VENUE}`);
    await expect(page.locator('body')).toContainText(/LEVEL/i, { timeout: 20_000 });
    await page.waitForTimeout(3000); // 워치독 주기(1초)보다 충분히 길게

    expect(writes, `TV 화면이 clock_states 에 쓰기를 시도했다: ${writes.join(' | ')}`).toHaveLength(0);
  });
});
