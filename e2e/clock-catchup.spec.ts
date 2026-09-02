// 클락 자동 전진 / TV 표시 보정 E2E — 2026-07 'TV 00:00 얼음' 사건의 실동작 검증.
//
// 왜 유닛테스트로 부족한가: 이 결함의 본질은 '화면이 안 보일 때 무슨 일이 일어나는가' 였다.
//   levelCatchUp/effectiveLevel 의 계산은 유닛테스트로 고정했지만, 그 값이 실제로 손님이 보는
//   TV 화면(?display=)까지 도달하는지는 진짜 렌더러로만 확인할 수 있다.
//
// 픽스처: **테스트가 직접 심는다.**
//   ⚠ 예전에는 사람이 SQL 로 넣어둔 '밀린 클락' 행을 전제하고, 없으면 skip 했다.
//     그 행은 결국 사라졌고(0행), 스위트는 초록인 채로 이 게이트만 조용히 꺼져 있었다.
//     '실패하지 않는 것' 과 '지키고 있는 것' 은 다르다 — 그래서 픽스처를 코드로 옮겼다.
//   레벨 1분 × 8, current_index=0, ends_at = now − 3분 30초 → 기대: L4 전후, 잔여 30초 전후.
//
//   ⚠ game_seq=2 를 쓴다. clock-watchdog 스펙이 같은 매장의 game_seq=1 을 점유하는데,
//     Playwright 는 파일을 병렬로 돌리므로 같은 행을 쓰면 서로의 픽스처를 덮어쓴다.
//     (PK 가 (venue_id, game_seq) 라 seq 만 갈라 두면 완전히 격리된다.)
//
// 실행: npx playwright test e2e/clock-catchup.spec.ts
import { test, expect } from '@playwright/test';
import { loginAs, restAs, type E2ESession } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const GAME_SEQ = 2;          // 워치독(seq 1)과 겹치지 않게
const LEVEL_MIN = 1;         // 1분 블라인드
const BEHIND_MS = 3.5 * 60_000; // 3분 30초 밀린 상태 → 4번째 레벨 언저리

let VENUE = process.env.E2E_CLOCK_VENUE ?? '';

/** 1분짜리 레벨 8개 */
function oneMinuteLevels() {
  return Array.from({ length: 8 }, (_, i) => ({
    kind: 'level' as const, sb: 100 * (i + 1), bb: 200 * (i + 1), ante: 0, minutes: LEVEL_MIN,
  }));
}

/** 업주 자격으로 '밀린' 클락을 심는다 */
async function seedStaleClock(session: E2ESession): Promise<string> {
  const uid = (session.user as { id: string }).id;
  const venueId = VENUE
    || (await restAs(session, `venues?select=id&owner_id=eq.${uid}&limit=1`) as { id: string }[])[0]?.id;
  if (!venueId) throw new Error('테스트 계정이 소유한 매장을 찾지 못했다 — E2E_CLOCK_VENUE 로 직접 지정하라');

  await restAs(session, 'clock_states', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: {
      venue_id: venueId, game_seq: GAME_SEQ,
      session_date: new Date().toLocaleDateString('en-CA'),
      title: '⏱ 검증용 1분 블라인드',
      running: true, current_index: 0,
      ends_at: new Date(Date.now() - BEHIND_MS).toISOString(), // ← 한참 지난 시각 = '밀린' 상태
      remaining_ms: 0,
      config: {
        title: '⏱ 검증용 1분 블라인드', startStack: 30000, rebuyStack: 30000, addonStack: 30000,
        isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0,
        regCloseLevel: 99, maxLevel: 8, earlyDoubleLevel: 0, earlySingleLevel: 0,
        earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
        prizes: [], levels: oneMinuteLevels(),
      },
    },
  });
  return venueId;
}

test.describe('TV 디스플레이 — 낡은 클락 행에서도 실효 레벨을 보여준다', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 미설정 — 픽스처를 심을 수 없다');

  let session: E2ESession;

  test.beforeEach(async ({ page }) => {
    session = await loginAs(page, EMAIL!, PASSWORD!);
    VENUE = await seedStaleClock(session);
    await page.goto(`/?display=${VENUE}&g=${GAME_SEQ}`);
    // 2026-09-02 라벨이 '레벨 N'(한국어)으로 바뀌며 텍스트 결합을 끊었다 — data-testid 앵커(clk-level · clk-timer)
    await expect(page.getByTestId('clk-level'), 'TV 화면에 클락이 안 뜬다 — 픽스처 심기가 실패했을 수 있다')
      .toBeVisible({ timeout: 20_000 });
  });

  test.afterEach(async () => {
    // 켜진 채 남기면 라이브 목록에 '유령 대회' 가 뜬다
    if (session && VENUE) {
      await restAs(session, `clock_states?venue_id=eq.${VENUE}&game_seq=eq.${GAME_SEQ}`, {
        method: 'PATCH', body: { running: false },
      }).catch(() => { /* 정리 실패는 무시 */ });
    }
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
    const levelMatch = (await page.getByTestId('clk-level').innerText()).match(/(\d+)/);
    expect(levelMatch, `레벨 표기를 찾지 못함. 화면: ${text.slice(0, 400)}`).toBeTruthy();
    const level = Number(levelMatch![1]);
    expect(level, `DB 는 LEVEL 1 인데 화면도 1 이면 표시 보정이 안 걸린 것(실제 ${level})`).toBeGreaterThan(1);
    expect(level, `레벨 수(8)를 넘어 전진하면 무한 전진 가드가 깨진 것(실제 ${level})`).toBeLessThanOrEqual(8);

    // ② 타이머가 00:00 에 얼어 있으면 안 된다
    const mmss = (await page.getByTestId('clk-timer').innerText()).match(/\b(\d{1,2}):(\d{2})\b/);
    expect(mmss, `타이머 표기를 찾지 못함. 화면: ${text.slice(0, 400)}`).toBeTruthy();
    const secs = Number(mmss![1]) * 60 + Number(mmss![2]);
    expect(secs, '00:00 으로 얼어 있으면 안 된다(표시 보정 미작동)').toBeGreaterThan(0);
    expect(secs, '1분 레벨이므로 잔여는 60초 이하여야 한다').toBeLessThanOrEqual(60);

    // ③ 1초 뒤 실제로 카운트다운이 흐르는가(정지 화면이 아님)
    const before = secs;
    await page.waitForTimeout(2200);
    const after2 = (await page.getByTestId('clk-timer').innerText()).match(/\b(\d{1,2}):(\d{2})\b/);
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

    await page.goto(`/?display=${VENUE}&g=${GAME_SEQ}`);
    await expect(page.getByTestId('clk-level')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(3000); // 워치독 주기(1초)보다 충분히 길게

    expect(writes, `TV 화면이 clock_states 에 쓰기를 시도했다: ${writes.join(' | ')}`).toHaveLength(0);
  });
});
