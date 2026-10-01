// SPOT 작성 내용(SpotDetails) — 줄·칸 정렬이 소비 화면마다 같은가 (2026-10-01 오너)
//
// 오너: "상대카드 앞에 A가 왜 있는지 모르겠고 …" → "villan A 이런식으로 표기하고 위아래 줄, 칸간격 맞춰주면 되잖아"
// 고친 것(SpotDetails.tsx):
//   · 상대 이름표 'A' → 'Villain A'(여럿이면 Villain B …). 자리 줄도 같은 이름 'Villain A (BB)'.
//   · 줄이 `items-baseline` 이라 **카드 칩 줄만 키가 컸고** 라벨이 칩 글자 기준선에 붙어 흔들렸다 →
//     모든 줄을 같은 한 줄 높이(22px + 위아래 3px)로, 칩도 22px 로 맞췄다.
// 그래서 여기서 잰다(computed — getBoundingClientRect):
//   ① 모든 줄의 **값 열 시작 x 가 같다**
//   ② 텍스트만 있는 줄(판)과 카드 칩 줄(내 카드·상대 카드)의 **줄 높이가 같다** — 예전엔 칩 줄만 컸다
//   ③ 라벨과 값의 첫 줄 위쪽이 같다(라벨이 위아래로 흔들리지 않는다)
//   ④ 'Villain X' 이름표와 옆 카드 칩의 **세로 가운데선이 같다**
//   ⑤ 칩 사이 간격이 내 카드 줄과 상대 카드 줄에서 같다
//   + 측정 대상이 0건이면 실패한다(빈 검사로 초록이 되지 않게).
// 소비 화면: 내 스팟 상세(펼침) · 그 스팟을 '수정하기' 로 다시 연 작성 화면(확인 단계).
//   ⚠ 2026-10-01 시안 A(오너 선택)로 **게시글 상세의 공유 카드는 SpotDetails 를 쓰지 않는다**(테이블 그림 —
//     community/spotShare/SpotTable.tsx). 그래서 '게시글 상세' 케이스를 뺐다. 그 화면의 계약은 e2e/nuri-spot-board.spec.ts 가 본다.
//   ⚠ 드릴(트레이너)·게시판 목록 행은 SpotDetails 를 쓰지 않는다(소스 import 0 — 2026-10-01 grep).
// ⚠ 운영 DB 무접촉: stubLogin + page.route fixture. _fixtures 가 비-GET 을 끊는다.
import { test, expect } from './_fixtures';
import { type Locator, type Page, type Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

/** 상대 1명 — 오너 스크린샷의 그 판(토너먼트 6인 · BTN AsKs vs BB QhQd · 프리플랍) */
const SPOT_ONE = {
  v: 3, game: 'nlhe', format: 'mtt', tableSize: 6, sbBb: 0.5, anteBb: 0, effectiveBb: 100,
  heroPos: 'BTN', villainPos: 'BB', hero: ['As', 'Ks'], villain: ['Qh', 'Qd'],
  board: [], street: 'preflop', actions: [],
};
/** 상대 3명 + 보드 — 와이어 v3: 카드는 villain 안 string[][](A..C), 자리는 extraPos */
const SPOT_THREE = {
  v: 3, game: 'nlhe', format: 'mtt', tableSize: 8, sbBb: 0.5, anteBb: 1, effectiveBb: 35,
  heroStackBb: 42, villainStackBb: 35,
  heroPos: 'CO', villainPos: 'BB', hero: ['Ah', 'Kd'],
  villain: [['Qc', 'Qs'], [], ['9h', '9d']], extraPos: ['BTN', 'SB'],
  board: ['Kh', '7c', '2d'], street: 'flop',
  actions: [
    { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.2 },
    { street: 'preflop', actor: 'villain', pos: 'BTN', type: 'call', sizeBb: 2.2 },
    { street: 'preflop', actor: 'villain', pos: 'SB', type: 'call', sizeBb: 1.7 },
    { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 1.2 },
    { street: 'flop', actor: 'villain', pos: 'SB', type: 'check' },
    { street: 'flop', actor: 'villain', type: 'check' },
  ],
  heroAction: 'bet', heroActionSizeBb: 4.5,
};
/** 상대 5명 · 9인 · 턴 — 독립 검토 10-02(review-share-a3-1002.md §3 경미 2)의 판: '자리' 줄에서
 *  'Villain B' 와 '(BTN)' 이 서로 다른 줄로 갈라졌다(360 다크). 그 검토의 픽스처 그대로다. */
const SPOT_FIVE = {
  v: 3, game: 'nlhe', format: 'mtt', tableSize: 9, sbBb: 0.5, anteBb: 1, effectiveBb: 35, heroStackBb: 42, villainStackBb: 35,
  heroPos: 'CO', villainPos: 'BB', hero: ['Ah', 'Kd'], villain: [['Qc', 'Qs'], [], ['9h', '9d'], ['7c', '7d'], []], extraPos: ['BTN', 'SB', 'UTG', 'HJ'],
  board: ['Kh', '7c', '2d', '5s'], street: 'turn', note: '긴 메모가 두 줄 이상으로 넘어가는지 확인하려고 적은 문장입니다. 줄 정렬을 봅니다.',
  actions: [
    { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.2 },
    { street: 'preflop', actor: 'villain', pos: 'BTN', type: 'call', sizeBb: 2.2 },
    { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 1.2 },
    { street: 'flop', actor: 'villain', type: 'check' },
    { street: 'turn', actor: 'villain', type: 'bet', sizeBb: 5 },
  ],
  heroAction: 'call', heroActionSizeBb: 5,
};
const CASES = [
  { name: '상대 1명', spot: SPOT_ONE, villains: 1 },
  { name: '상대 3명·보드', spot: SPOT_THREE, villains: 3 },
  { name: '상대 5명·9인', spot: SPOT_FIVE, villains: 5 },
] as const;
const VIEWS = [
  { name: '390 다크', width: 390, height: 844, theme: 'dark' },
  { name: '390 라이트', width: 390, height: 844, theme: 'light' },
  { name: '320 다크', width: 320, height: 720, theme: 'dark' },
] as const;

async function boot(page: Page, view: (typeof VIEWS)[number]) {
  await page.setViewportSize({ width: view.width, height: view.height });
  await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t); } catch { /* */ } }, view.theme);
  await stubLogin(page);
  await stabilizeBackstack(page);
}

interface Measure {
  rows: { label: string; valueLeft: number; rowH: number; labelTop: number; valueTop: number; labelH: number; valueH: number }[];
  villainMid: { label: string; dy: number }[];
  heroGaps: number[];
  villainGaps: number[];
  text: string;
  /** '자리' 줄의 'Villain X (자리)' 항목마다 몇 줄에 걸쳐 그려졌는가 — 1 이어야 한다 */
  seatItems: { item: string; lines: number }[];
}

/** 한 SpotDetails 를 잰다 — 숫자만 돌려주고 판정은 아래 assertAligned 가 한다. */
async function measure(root: Locator): Promise<Measure> {
  await root.scrollIntoViewIfNeeded();
  await root.page().waitForTimeout(500);   // 시트·펼침(Fold) 전환이 끝난 뒤에 잰다
  return root.evaluate((el) => {
    const r = (e: Element) => e.getBoundingClientRect();
    const rows = [...el.querySelectorAll('[data-spot-row]')].map((row) => {
      const lab = row.querySelector('[data-spot-label]')!;
      const val = row.querySelector('[data-spot-value]')!;
      return { label: lab.textContent ?? '', valueLeft: r(val).left, rowH: r(row).height, labelTop: r(lab).top, valueTop: r(val).top, labelH: r(lab).height, valueH: r(val).height };
    });
    const villainMid = [...el.querySelectorAll('[data-spot-villain]')].flatMap((g) => {
      const lab = g.querySelector('[data-spot-villain-label]');
      const chip = g.querySelector('[data-spot-chip]');
      if (!lab || !chip) return [];
      const a = r(lab), b = r(chip);
      return [{ label: lab.textContent ?? '', dy: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) }];
    });
    const gaps = (box: Element | null | undefined) => {
      const chips = box ? [...box.querySelectorAll('[data-spot-chip]')] : [];
      return chips.slice(1).map((c, i) => r(c).left - r(chips[i]).right);
    };
    const heroRow = [...el.querySelectorAll('[data-spot-row]')].find((row) => row.querySelector('[data-spot-label]')?.textContent === '내 카드');
    const villainBox = el.querySelector('[data-spot-villain] [data-spot-cards]');
    // '자리' 줄 — 글자 위치로 잰다(마크업과 무관하게: 고치기 전 빌드에서도 같은 방법으로 FAIL 이 나야 한다).
    const seatItems: { item: string; lines: number }[] = [];
    const seatVal = [...el.querySelectorAll('[data-spot-row]')]
      .find((row) => row.querySelector('[data-spot-label]')?.textContent === '자리')?.querySelector('[data-spot-value]');
    if (seatVal) {
      const nodes: { n: Text; at: number }[] = [];
      let txt = '';
      const walker = document.createTreeWalker(seatVal, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { nodes.push({ n: n as Text, at: txt.length }); txt += n.textContent ?? ''; }
      const at = (i: number, end: boolean) => {
        const k = nodes.findIndex((x) => (end ? i > x.at : i >= x.at) && i <= x.at + (x.n.textContent ?? '').length);
        return { node: nodes[k].n, off: i - nodes[k].at };
      };
      for (const m of txt.matchAll(/Villain [A-E] \([A-Z0-9]+\)/g)) {
        const range = document.createRange();
        const a = at(m.index!, false), b = at(m.index! + m[0].length, true);
        range.setStart(a.node, a.off); range.setEnd(b.node, b.off);
        const tops = new Set([...range.getClientRects()].filter((q) => q.width > 0.5).map((q) => Math.round(q.top)));
        seatItems.push({ item: m[0], lines: tops.size });
      }
    }
    return { rows, villainMid, heroGaps: gaps(heroRow?.querySelector('[data-spot-cards]')), villainGaps: gaps(villainBox), text: el.textContent ?? '', seatItems };
  });
}

function assertAligned(m: Measure, villains: number, where: string) {
  // 빈 검사 방지 — 줄이 없으면 아래 단언이 전부 '공집합이라 참' 이 된다.
  expect(m.rows.length, `${where}: 측정한 줄이 없다(셀렉터가 빗나감)`).toBeGreaterThanOrEqual(6);
  expect(m.villainMid.length, `${where}: Villain 이름표+칩 묶음을 못 찾았다`).toBeGreaterThanOrEqual(1);
  expect(m.heroGaps.length, `${where}: 내 카드 칩을 못 찾았다`).toBeGreaterThanOrEqual(1);
  expect(m.villainGaps.length, `${where}: 상대 카드 칩을 못 찾았다`).toBeGreaterThanOrEqual(1);

  // ① 값 열 시작 x
  const xs = m.rows.map((r) => r.valueLeft);
  expect(Math.max(...xs) - Math.min(...xs), `${where}: 값 열 x 가 줄마다 다르다 ${JSON.stringify(m.rows.map((r) => [r.label, r.valueLeft]))}`).toBeLessThanOrEqual(0.5);
  // ③ 라벨 = 한 줄 높이, 라벨 위쪽 = 값 첫 줄 위쪽
  for (const r of m.rows) {
    expect(Math.abs(r.labelTop - r.valueTop), `${where}: '${r.label}' 라벨과 값의 위쪽이 어긋난다`).toBeLessThanOrEqual(0.5);
  }
  const labelHs = m.rows.map((r) => r.labelH);
  expect(Math.max(...labelHs) - Math.min(...labelHs), `${where}: 라벨 줄 높이가 다르다 ${JSON.stringify(labelHs)}`).toBeLessThanOrEqual(0.5);
  // ② 한 줄짜리 줄은 글자 줄이든 카드 칩 줄이든 키가 같다 — 예전엔 칩 줄만 컸다.
  //    좁은 폭에서 글자가 두 줄로 접히는 것은 정상이라, 값 높이 = 라벨 높이(한 줄)인 줄끼리만 비교한다.
  const one = m.rows.filter((r) => Math.abs(r.valueH - r.labelH) <= 0.5);
  const card = m.rows.find((r) => r.label === '내 카드');
  expect(card && Math.abs(card.valueH - card.labelH), `${where}: 내 카드 칩 줄이 한 줄 높이(${card?.labelH})가 아니다 — ${card?.valueH}`).toBeLessThanOrEqual(0.5);
  expect(one.length, `${where}: 한 줄짜리 줄이 너무 적다 ${JSON.stringify(m.rows.map((r) => [r.label, r.valueH]))}`).toBeGreaterThanOrEqual(3);
  const hs = one.map((r) => r.rowH);
  expect(Math.max(...hs) - Math.min(...hs), `${where}: 한 줄짜리 줄 높이가 다르다 ${JSON.stringify(one.map((r) => [r.label, r.rowH]))}`).toBeLessThanOrEqual(0.5);
  if (villains === 1) {
    const v = m.rows.find((r) => r.label === '상대 카드');
    expect(v && Math.abs(v.valueH - v.labelH), `${where}: 상대 1명인데 상대 카드 줄이 한 줄 높이가 아니다`).toBeLessThanOrEqual(0.5);
  }
  // ④ 이름표·칩 가운데선
  for (const v of m.villainMid) expect(v.dy, `${where}: '${v.label}' 이름표와 칩의 가운데선이 ${v.dy}px 어긋난다`).toBeLessThanOrEqual(1);
  // ⑤ 칩 간격
  const all = [...m.heroGaps, ...m.villainGaps];
  expect(Math.max(...all) - Math.min(...all), `${where}: 칩 간격이 줄마다 다르다 ${JSON.stringify({ hero: m.heroGaps, villain: m.villainGaps })}`).toBeLessThanOrEqual(0.5);
  // 표기 — 내부 이름표 'A' 가 아니라 'Villain A'. 자리 줄도 같은 이름.
  expect(m.text, `${where}: 'Villain A (BB)' 자리 표기가 없다`).toContain('Villain A (BB)');
  expect(m.text, `${where}: 옛 표기 '상대 A' 가 남았다`).not.toMatch(/상대 A/);
  if (villains === 3) expect(m.text, `${where}: Villain C 가 없다`).toContain('Villain C (SB)');
  // ⑥ '자리' 줄 — 'Villain B (BTN)' 한 항목이 두 줄로 갈라지지 않는다(독립 검토 10-02 경미 2). 0건 수집 금지.
  expect(m.seatItems.length, `${where}: '자리' 줄의 Villain 항목 수`).toBe(villains);
  const split = m.seatItems.filter((x) => x.lines !== 1);
  expect(split, `${where}: 항목이 줄바꿈으로 갈라졌다`).toEqual([]);
}

for (const view of VIEWS) {
  test.describe(`SpotDetails 정렬 — ${view.name}`, () => {
    for (const c of CASES) {
      test(`🔴 내 스팟 상세 → 재열기 작성 화면 · ${c.name}`, async ({ page }) => {
        test.setTimeout(60_000);
        await boot(page, view);
        await page.route(/\/rest\/v1\/spot_reviews\?/, (r: Route) => r.fulfill(json([{
          id: '00000000-0000-4000-8000-00000000cd01', spot: c.spot, coverage_kind: 'math_only', source_label: null,
          dataset_version: 'nuri-charts-2026-09-11', created_at: '2026-10-01T00:00:00Z', played_on: '2026-10-01',
        }])));
        await page.goto('/?tab=tools');
        await dismissOverlays(page);
        await page.getByTestId('spot-hero').getByRole('button', { name: '내 스팟', exact: true }).click();
        const dlg = page.getByRole('dialog').first();
        await expect(dlg).toBeVisible({ timeout: 20_000 });
        await dlg.getByRole('button', { name: '상세 보기' }).first().click();
        const details = dlg.getByTestId('spot-details');
        await expect(details, '내 스팟 상세가 안 펼쳐진다').toBeVisible({ timeout: 15_000 });
        assertAligned(await measure(details), c.villains, `내 스팟/${view.name}/${c.name}`);

        // 재열기 — '수정하기' 로 작성 화면에 다시 열고 확인 단계의 작성 내용(SpotReport)을 잰다.
        await dlg.getByRole('button', { name: '수정하기' }).first().click();
        await dlg.getByRole('group', { name: '입력 단계' }).getByRole('button', { name: /확인/ }).click();
        const report = dlg.getByLabel('작성 내용').getByTestId('spot-details');
        await expect(report, '다시 연 작성 화면에 작성 내용이 없다').toBeVisible({ timeout: 15_000 });
        assertAligned(await measure(report), c.villains, `작성(재열기)/${view.name}/${c.name}`);
      });
    }
  });
}
