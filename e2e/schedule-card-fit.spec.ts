// e2e/schedule-card-fit.spec.ts — 일정 목록 카드가 **가로·세로 어느 축으로도 잘리지 않는가**.
//
// 왜 이 스펙이 필요했나(2026-09-12 진단 P1-C):
//   home 320 에서 매장명이 client 52 / scroll 205 — **25% 만** 보였다. 시간 고정 열(w-20=85px)과
//   안 줄어드는 가격 열 사이에 낀 중앙 열이 ~170px 밖에 못 받았기 때문이다.
//   그리고 등록 마감·유형은 `overflow-x-auto` 한 줄 안으로 **숨은 가로 스크롤**에 들어가 있었다.
//
// ⚠ 두 축을 **둘 다** 잰다. 과거에 `truncate` → `line-clamp-2` 로 바꾸고 "고쳤다"고 한 적이 있는데
//   그건 가로 잘림을 **세로 잘림으로 옮긴 것**이었다(ToolsPanel, 2026-09-12). scrollWidth 만 보는
//   스펙은 그 부류를 구조적으로 못 잡는다.
// ⚠ 목킹은 **핸들러 하나**다. 여러 개를 겹치면 route.continue() 가 조용히 실네트워크로 새어
//   "목킹했다고 믿는데 운영에 나가는" 상태가 된다(2026-09-12 실제 유출 8건). 첫 테스트가 유출 0 을 증명한다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { kstToday } from '../src/lib/kst';

const VENUE_ID = '11111111-1111-4111-8111-111111111111';
// KST(Asia/Seoul) 기준 날짜 — toISOString()(UTC) 을 쓰면 한국 시간 00:00~09:00 구간에서
// 픽스처 날짜가 화면 날짜와 하루 어긋난다(앱은 KST 로 일정을 배치한다). src/lib/kst.ts 의
// 기존 헬퍼를 그대로 쓴다(같은 로직을 스펙 안에 새로 만들지 않는다).
const day = (offset: number) => kstToday(Date.now() + offset * 86_400_000);

/** 화면에 실제로 나오는 최악 조합 — 긴 한국어 제목·매장명 · 정확한 큰 금액 · 예정/진행/종료 */
const ROWS = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    title: '토요일 나이트 딥스택 메인 토너먼트 시즌 파이널 라운드',
    venue_id: VENUE_ID, pub_name: '누리홀덤 의정부 로티아레나 본점', region: '경기 의정부',
    address: '경기도 의정부시 평화로 123 누리빌딩 4층',
    date: day(0), start_time: '18:00:00', duration: '6시간', format: 'NLH',
    guaranteed: true, prize_pool: 10_000_000, prize_percent: null,
    is_competition: true, grade: 'series', blinds: null,
    buy_in: { amount: 55_000, gameType: '홀덤', rebuy: 55_000 },
    display_order: 0, is_premium: true, owner_id: VENUE_ID, approved: true,
    unread_qna_count: 0, view_count: 12, premium_until: null, reg_close_time: '14LV 00:12',
    structure: { lateRegLevels: 14, startingChips: 30_000 },
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    title: '데일리 터보', venue_id: VENUE_ID, pub_name: '누리홀덤 강남점', region: '서울 강남',
    address: '서울 강남구 테헤란로 1', date: day(1), start_time: '19:30:00', duration: '3시간',
    format: 'NLH', guaranteed: false, prize_pool: null, prize_percent: 50,
    is_competition: false, grade: 'daily', blinds: null,
    buy_in: { amount: 1_234_567, gameType: '홀덤' },
    display_order: 1, is_premium: false, owner_id: VENUE_ID, approved: true,
    unread_qna_count: 0, view_count: 3, premium_until: null, reg_close_time: null,
    structure: null,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000003',
    title: '상금·참가비 정보가 아직 없는 대회', venue_id: VENUE_ID,
    pub_name: '누리홀덤 부산 해운대 센텀시티점', region: '부산 해운대',
    address: '부산 해운대구 센텀중앙로 9', date: day(3), start_time: '20:00:00', duration: '4시간',
    format: 'PLO', guaranteed: false, prize_pool: null, prize_percent: null,
    is_competition: false, grade: null, blinds: null,
    buy_in: { amount: 0 },
    display_order: 2, is_premium: false, owner_id: VENUE_ID, approved: true,
    unread_qna_count: 0, view_count: 0, premium_until: null, reg_close_time: null,
    structure: null,
  },
];

const RES_COUNTS = [
  { schedule_id: ROWS[0].id, cnt: 12 },
  { schedule_id: ROWS[1].id, cnt: 3 },
];

/** 단일 핸들러 — 이 스펙이 내보내는 **모든** 요청이 여기를 지난다.
 *  로컬 preview(앱 번들·이미지)만 통과시키고, 그 밖의 외부 주소는 전부 여기서 끝낸다(실네트워크 0). */
async function mockAll(page: Page, external: string[]) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    external.push(`${route.request().method()} ${url}`);
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/rest\/v1\/schedules/.test(url)) return json(ROWS);
    if (/\/rest\/v1\/rpc\/schedule_reservation_counts/.test(url)) return json(RES_COUNTS);
    if (/\/rest\/v1\/venues/.test(url)) return json([{
      id: VENUE_ID, name: '누리홀덤 의정부 로티아레나 본점', region: '경기 의정부',
      address: '경기도 의정부시 평화로 123', approved: true, status: 'active',
      is_paid_ad: false, display_order: 1, follower_count: 10, rating: 4.8,
    }]);
    if (/\/rest\/v1\/rpc\//.test(url)) return json([]);
    if (/\/rest\/v1\//.test(url)) return json([]);
    if (/supabase\.co/.test(url)) return json({});
    return route.abort('blockedbyclient');
  });
}

type Overflow = { tag: string; text: string; cls: string; clientW: number; scrollW: number; clientH: number; scrollH: number };

/** 카드 안 모든 요소의 두 축 넘침. line-clamp(설계된 2줄 요약)는 별도로 센다. */
const measure = (page: Page) => page.evaluate(() => {
  // 일정 탐색 탭의 카드만 잰다 — 홈 탭은 keep-alive 라 display:none 으로 살아 있다
  const cards = [...document.querySelectorAll<HTMLElement>('main[data-tab="browse"] article.cv-card-list')]
    .filter((c) => c.getBoundingClientRect().height > 0);
  const overflow: Overflow[] = [];
  const clamped: string[] = [];
  /** `text-overflow: ellipsis` 로 **설계된** 줄임(매장명·지역 → 상세로 연결). 값이 아니라 이름에만 쓴다. */
  const ellipsis: string[] = [];
  /** 🔴 값이 잘린 것 — 이름과 달리 **절대 허용하지 않는다.** */
  const clippedValues: string[] = [];
  const hiddenScroll: string[] = [];
  for (const card of cards) {
    for (const el of [card, ...card.querySelectorAll<HTMLElement>('*')]) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const text = (el.textContent || '').trim().slice(0, 40);
      if (/auto|scroll/.test(s.overflowX)) hiddenScroll.push(`${text} :: overflow-x:${s.overflowX}`);
      const dx = el.scrollWidth - el.clientWidth;
      const dy = el.scrollHeight - el.clientHeight;
      const cut = dx > 1 || dy > 1;
      // 🔴 순서가 계약이다 — `home-flow-fit.spec.ts` 와 **같은 3단계**를 쓴다(두 스펙이 다른 규칙을
      //   쓰면 한쪽에서만 잡히는 구멍이 생긴다. 실제로 그랬다: 매장명이 길어진 날 이쪽만 25건 빨개졌다).
      //  ① line-clamp 는 설계된 요약이다(대회명 2줄) — 먼저 빼지 않으면 제목이 값 잘림으로 오판된다.
      //  ② 그다음 **값**을 본다. ellipsis 보다 **먼저** 봐야 한다 — `truncate` 로 '등록 마감'을 지워 놓고
      //     "말줄임은 설계"라고 넘어가면 이 검사는 아무것도 못 잡는다.
      //  ③ 나머지 말줄임(이름)은 설계로 인정한다 — 전체 이름은 상세에서 보인다(§5).
      //     ⚠ 이건 게이트를 푸는 것이 아니다. '…'이 보이는 줄임은 유저가 잘렸다는 걸 **안다**.
      //       위험한 것은 `overflow:hidden` 만 걸려 **말없이** 사라지는 쪽이고, 그건 아래 overflow 가 그대로 잡는다.
      if (s.webkitLineClamp && s.webkitLineClamp !== 'none') { clamped.push(text); continue; }
      if (cut && /마감까지|등록 마감|참가비 ?[\d—]|GTD|예상 상금/.test(text)) {
        clippedValues.push(`${text} ${el.clientWidth}/${el.scrollWidth} × ${el.clientHeight}/${el.scrollHeight}`);
        continue;
      }
      if (s.textOverflow === 'ellipsis') { ellipsis.push(text); continue; }
      if (cut) {
        overflow.push({
          tag: el.tagName.toLowerCase(), text, cls: el.className.toString().slice(0, 90),
          clientW: el.clientWidth, scrollW: el.scrollWidth, clientH: el.clientHeight, scrollH: el.scrollHeight,
        });
      }
    }
  }
  const doc = document.scrollingElement as HTMLElement;
  return {
    cards: cards.length, overflow, clamped, ellipsis, clippedValues, hiddenScroll,
    docScrollX: doc.scrollWidth - doc.clientWidth,
    cardH: cards.map((c) => Math.round(c.getBoundingClientRect().height)),
    // 화면에 실제로 그려진 문자열 — 반올림·거짓 배지 회귀를 같은 캡처에서 함께 본다
    texts: cards.map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim()),
  };
});

async function openHome(page: Page, w: number, theme: 'dark' | 'light', zoom: boolean) {
  await page.addInitScript(([k, v]: string[]) => {
    try { localStorage.setItem(k, v); } catch { /* 저장소 차단 환경 */ }
  }, ['nuri-theme', theme]);
  if (zoom) {
    // 200% = 루트 글자 확대(17 → 34px). 브라우저 확대와 달리 px 미디어쿼리는 그대로다 —
    // rem 기준 레이아웃이 스스로 접히는지 보는 축이다.
    await page.addInitScript(() => {
      const st = document.createElement('style');
      st.textContent = 'html{font-size:34px!important}';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
    });
  }
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // 홈은 '오늘·내일'만 보여주고 예약 수·별점·거리를 내려주지 않는다 —
  // 카드의 **모든 값**이 붙는 곳은 일정 탐색 탭이라 거기서 잰다(홈 '전체 일정' 버튼이 그 탭이다).
  const go = page.getByRole('button', { name: '전체 일정', exact: false }).first();
  await go.click({ timeout: 15_000 });
  const cards = page.locator('main[data-tab="browse"] article.cv-card-list');
  // 느린 러너에서 첫 클릭이 마운트 전에 떨어지는 일이 있다 — 한 번 더 누른다(계약은 그대로).
  await cards.first().waitFor({ timeout: 15_000 }).catch(async () => {
    await go.click({ timeout: 10_000 });
    await cards.first().waitFor({ timeout: 20_000 });
  });
  await page.waitForTimeout(800);
}

test.describe('일정 목록 카드 — 잘림 0', () => {
  test('🔴 목킹 유출 0 — 이 스펙은 외부로 실요청을 내보내지 않는다', async ({ page }) => {
    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, 390, 'dark', false);
    const leaked = external.filter((u) => !/supabase\.co/.test(u));
    expect(leaked, `목 핸들러를 지나지 않은 외부 요청이 있다:\n${leaked.join('\n')}`).toEqual([]);
    // supabase 주소로 간 것들은 전부 fulfill 로 끝났다(route.continue 없음) — 실네트워크 0
    expect(external.length, '외부 주소 요청이 한 건도 없다면 목킹 자체가 안 걸린 것이다').toBeGreaterThan(0);
  });

  for (const w of [320, 360, 390, 412, 768, 1280, 1440]) {
    for (const theme of ['dark', 'light'] as const) {
      for (const zoom of [false, true]) {
        test(`${w}px · ${theme} · ${zoom ? '200%' : '100%'} — 가로·세로 잘림 0`, async ({ page }) => {
          test.setTimeout(60_000);
          const external: string[] = [];
          await mockAll(page, external);
          await openHome(page, w, theme, zoom);
          const r = await measure(page);
          // 우회 금지 — 잴 것이 실제로 있는지 먼저 단정한다
          expect(r.cards, '일정 카드가 렌더되지 않았다 — 잴 것이 없으면 통과가 아니다').toBeGreaterThan(0);
          console.log(`[${w}/${theme}/${zoom ? 200 : 100}] cards=${r.cards} h=${r.cardH.join(',')} clamp=${r.clamped.length} ellip=${r.ellipsis.length}`);
          expect(r.clippedValues, `🔴 값이 잘렸다 — 이름은 줄여도 금액·등록 마감은 못 줄인다:\n${r.clippedValues.join('\n')}`).toEqual([]);
          expect(r.hiddenScroll, `등록 마감·참가비가 숨은 가로 스크롤 안에 있다:\n${r.hiddenScroll.join('\n')}`).toEqual([]);
          expect(
            r.overflow.map((o) => `${o.tag} "${o.text}" ${o.clientW}/${o.scrollW} × ${o.clientH}/${o.scrollH} :: ${o.cls}`),
            '카드 안에서 잘린 요소가 있다',
          ).toEqual([]);
          expect(r.docScrollX, '문서가 가로로 스크롤된다').toBeLessThanOrEqual(0);
        });
      }
    }
  }

  test('🔴 금액이 반올림되지 않고, 예약 인원만으로 "마감 임박"을 붙이지 않는다', async ({ page }) => {
    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, 390, 'dark', false);
    // 예약 수는 카드가 그려진 뒤 한 왕복 늦게 도착한다(App 이 schedule_reservation_counts 를 따로 부른다).
    // 기다리지 않고 재면 부하에 따라 '예약 12명'이 아직 없어 거짓 실패가 난다 — 계약이 아니라 계측 문제다.
    await page.waitForFunction(
      () => /예약 12명/.test(document.querySelector('main[data-tab="browse"]')?.textContent || ''),
      undefined, { timeout: 15_000 },
    );
    const r = await measure(page);
    const all = r.texts.join(' | ');
    expect(r.cards).toBeGreaterThan(0);
    // 2026-09-18 오너: "참가비 100,000 이거 빼 10T 이런식으로 변경".
    //   55,000원은 1T=10,000원으로 **정확히 5.5T** 라 T 로 적는다 — 이건 축약이지 반올림이 아니다.
    //   이 검사의 요지(가격을 바꿔 적지 않는다)는 아래 1,234,567원이 지킨다: T 로 정확히 떨어지지
    //   않는 금액은 원 단위 전액 그대로여야 한다. 그래서 **둘 다** 본다 — 하나만 보면 반쪽이다.
    expect(all, '5.5T 로 정확히 떨어지는 참가비가 T 로 안 적혔다').toContain('5.5T');
    expect(all, '🔴 참가비 1,234,567원이 T 로 반올림됐다 — 가격을 바꿔 적으면 안 된다').toContain('1,234,567원');
    expect(all, 'T 로 안 떨어지는 금액에 T 가 붙었다').not.toMatch(/12[0-9.]*T/);
    // 라벨 '상금 보장' → 'GTD'(2026-09-18 오너). 금액 표시 유지라는 요지는 그대로.
    expect(all, 'GTD 1,000만이 안 보인다(§28 가격 정보는 표시 유지)').toContain('GTD 1,000만');
    expect(all, '예약 12명은 정원 근거가 없다 — "마감 임박"으로 부풀리면 안 된다').not.toContain('마감 임박');
    expect(all, '예약 인원은 사실 그대로 표시한다').toContain('예약 12명');
    // 참가비 미입력(0)을 '무료'·'0원'으로 만들지 않는다
    expect(all, '참가비 미입력이 0원/무료로 표시됐다').not.toMatch(/참가비\s*0원|무료/);
  });
});

// ── 대비(양 테마) — 카드에서 **금액·등록 마감·예약 인원**이 읽히는가 ────────────────────
// 포스터 위 배지와 달리 목록 카드는 테마 토큰 위에 그려진다. 라이트 전역 보정이 걸린 뒤의
// 실제 전경/배경을 재서 AA(본문 4.5:1)를 확인한다 — 눈대중이 아니라 computed 값으로.
const contrast = (page: Page) => page.evaluate(() => {
  const lum = (c: string) => {
    const m = c.match(/[\d.]+/g)!.map(Number);
    const [r, g, b] = m.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bgOf = (el: HTMLElement) => {
    let n: HTMLElement | null = el;
    while (n) {
      const c = getComputedStyle(n).backgroundColor;
      const a = c.match(/[\d.]+/g);
      if (a && (a.length < 4 || Number(a[3]) > 0.6)) return c;
      n = n.parentElement;
    }
    return 'rgb(255,255,255)';
  };
  const out: { text: string; fg: string; bg: string; ratio: number; size: string }[] = [];
  const card = document.querySelector<HTMLElement>('main[data-tab="browse"] article.cv-card-list');
  if (!card) return out;
  for (const el of card.querySelectorAll<HTMLElement>('p,span,h3')) {
    const s = getComputedStyle(el);
    // ⚠ display:none 인 **부모** 밑의 자식은 자기 computed display 가 'none' 이 아니다 —
    //   숨은 줄(min-[360px]:hidden)의 글자를 측정치에 넣지 않으려면 실제 사각형을 봐야 한다.
    const rc = el.getBoundingClientRect();
    if (rc.width === 0 || rc.height === 0 || !el.textContent?.trim()) continue;
    if (el.children.length) continue;            // 잎 노드만
    const fg = s.color, bg = bgOf(el);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    out.push({ text: el.textContent.trim().slice(0, 24), fg, bg, size: s.fontSize, ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100 });
  }
  return out;
});

for (const theme of ['dark', 'light'] as const) {
  test(`대비 — ${theme} 테마에서 카드 글자가 AA 를 넘는다`, async ({ page }) => {
    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, 390, theme, false);
    const rows = await contrast(page);
    expect(rows.length, '잎 텍스트를 하나도 못 찾았다 — 측정이 안 된 것이다').toBeGreaterThan(4);
    console.log(`[대비 ${theme}]`, rows.map((r) => `${r.text}=${r.ratio}(${r.size})`).join(' · '));
    // 읽어야 값인 것들: 참가비 금액 · 상금 · 등록 마감 · 예약 인원 · 대회명 · 매장명
    const key = rows.filter((r) => /원$|^상금|^등록 마감|^예약|토요일|누리홀덤/.test(r.text));
    expect(key.length, '핵심 값이 화면에 없다').toBeGreaterThan(3);
    const bad = key.filter((r) => r.ratio < 4.5).map((r) => `${r.text} ${r.ratio}:1 (${r.fg} on ${r.bg})`);
    expect(bad, `AA(4.5:1) 미달:\n${bad.join('\n')}`).toEqual([]);
  });
}

// ── 상세 — 요약 그리드가 **기다리지 않고** 읽히는가 ────────────────────────────────
// 종전 SummaryCell 은 고정 h-14 + MarqueeText 라, 참가비·등록 마감·매장명을 읽으려면
// 글자가 흘러 지나가기를 기다려야 했다(§6-2). 지금은 자연 줄바꿈이라 전부 정지 상태로 보인다.
for (const w of [360, 1280]) {
  test(`상세 ${w}px — 요약 값이 마퀴 없이 전부 보인다`, async ({ page }) => {
    test.setTimeout(60_000);
    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, w, 'dark', false);
    // ⚠ 카드 **정중앙을 누르지 않는다** — 카드 안에는 매장 버튼 같은 중첩 타깃이 있고,
    //   카드 높이가 바뀌면 중앙점이 그 위로 옮겨가 **매장 페이지가 열린다**(2026-09-17 실측:
    //   카드 181→116px 로 낮아지자 정중앙이 "누리 테스트 홀덤펍·서울" 버튼 위가 됐다).
    //   이 테스트가 보려는 것은 '대회 상세의 요약 값'이지 '어디를 누르는가'가 아니므로
    //   제목(h3)을 눌러 의도를 그대로 말한다(§7-④ getByRole 로 좁혀라).
    await page.locator('main[data-tab="browse"] article.cv-card-list').first().getByRole('heading').click();
    await page.waitForSelector('[data-sched-panel]', { timeout: 15_000 });
    const r = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[data-sched-panel]');
      if (!panel) return null;
      const over: string[] = [];
      const marquee: string[] = [];
      for (const el of panel.querySelectorAll<HTMLElement>('*')) {
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 || rc.height === 0) continue;
        const s = getComputedStyle(el);
        if (s.animationName && s.animationName !== 'none' && /marquee/i.test(s.animationName)) {
          marquee.push((el.textContent || '').trim().slice(0, 30));
        }
        if (s.webkitLineClamp && s.webkitLineClamp !== 'none') continue;
        if (el.scrollWidth - el.clientWidth > 1 || el.scrollHeight - el.clientHeight > 1) {
          over.push(`${(el.textContent || '').trim().slice(0, 28)} ${el.clientWidth}/${el.scrollWidth} × ${el.clientHeight}/${el.scrollHeight}`);
        }
      }
      return { over, marquee, text: (panel.textContent || '').replace(/\s+/g, ' ') };
    });
    expect(r, '상세 본문을 찾지 못했다').not.toBeNull();
    expect(r!.text, '참가비 라벨이 없다').toContain('참가비');
    expect(r!.text, '등록 마감 라벨이 없다').toContain('등록 마감');
    expect(r!.text, '금액이 반올림 없이 그대로 보인다').toContain('55,000');
    expect(r!.marquee, `요약 값이 아직 마퀴로 흐른다:\n${r!.marquee.join('\n')}`).toEqual([]);
    expect(r!.over, '상세 본문에서 잘린 요소가 있다').toEqual([]);
  });
}

// ── PC 표 모드 — 열 폭이 명확하고, 카드와 **같은 값**을 보여주는가 ──────────────────
// 종전 표는 자기 regLabel 과 `Math.round(prizePool/10000)만` 을 따로 갖고 있어 같은 대회가
// 카드와 다른 문자열을 보여줬다(상금 반올림 포함). 지금은 ScheduleCard 의 포맷터 한 벌을 쓴다.
for (const w of [1280, 1440]) {
  test(`표 모드 ${w}px — 열 잘림 0 · 카드와 같은 값`, async ({ page }) => {
    test.setTimeout(60_000);
    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, w, 'dark', false);
    await page.getByRole('radio', { name: '표 보기' }).click({ timeout: 10_000 });
    await page.waitForSelector('main[data-tab="browse"] table', { timeout: 10_000 });
    const r = await page.evaluate(() => {
      const t = document.querySelector<HTMLElement>('main[data-tab="browse"] table');
      if (!t) return null;
      const over: string[] = [];
      for (const el of t.querySelectorAll<HTMLElement>('td,th,span,button')) {
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 || rc.height === 0) continue;
        if (el.scrollWidth - el.clientWidth > 1 || el.scrollHeight - el.clientHeight > 1) {
          over.push(`${(el.textContent || '').trim().slice(0, 26)} ${el.clientWidth}/${el.scrollWidth} × ${el.clientHeight}/${el.scrollHeight}`);
        }
      }
      return { over, text: (t.textContent || '').replace(/\s+/g, ' ') };
    });
    expect(r, '표가 렌더되지 않았다').not.toBeNull();
    expect(r!.text, '참가비 열 머리말이 없다').toContain('참가비');
    // 표도 카드와 **같은 buyInText** 를 쓴다(정본 하나) — 55,000원은 정확히 5.5T 다.
    //   요지는 '반올림하지 않는다' 이므로, T 로 안 떨어지는 금액이 원 단위 전액인지를 함께 본다.
    expect(r!.text, '표의 참가비가 T 표기가 아니다 — 카드와 표가 다른 문법을 쓰면 안 된다').toContain('5.5T');
    expect(r!.text, '🔴 표의 참가비 1,234,567원이 반올림됐다').toContain('1,234,567원');
    expect(r!.text, '상금이 반올림됐다(1,000만 보장이어야 한다)').toContain('1,000만');
    expect(r!.text, '등록 마감 배지가 카드와 같은 어휘가 아니다').toContain('등록 마감 14레벨');
    expect(r!.over, '표에서 잘린 칸이 있다').toEqual([]);
  });
}
