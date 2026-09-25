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
async function mockAll(page: Page, external: string[], rows: unknown[] = ROWS) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    external.push(`${route.request().method()} ${url}`);
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/rest\/v1\/schedules/.test(url)) return json(rows);
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
      // 🔴 2026-09-20 — 값 판정을 **글자에서 구조로** 옮긴다. 새 카드에서 지표는 `<Metric>` 이라
      //   라벨('참가비')과 값('10T')이 **다른 요소**로 쪼개졌다. 옛 정규식 `참가비 ?[\d—]` 는
      //   둘이 한 덩어리일 때만 맞으므로, 그대로 두면 **값이 잘려도 안 잡힌다**(라벨만 있는 요소에는
      //   숫자가 없고, 값만 있는 요소에는 '참가비' 가 없다). 라벨이 '등록 마감' → '레지마감' 으로
      //   바뀐 것도 같은 구멍이다. `[data-metrics]` 안은 **전부 값 취급**한다 — 이름이 아니라 수치다.
      const 지표안 = !!el.closest('[data-metrics]');
      // ⚠ 새 라벨('레지마감')을 이 정규식에 **넣지 마라.** `textContent` 는 자손 글자를 다 포함해서
      //   카드 전체·가운데 덩어리 같은 **조상**까지 걸린다(실측: 한 번 넣었다가 10건이 거짓 실패했다).
      //   지표 칸은 위 `지표안` 이 **구조로** 이미 덮는다 — 이름으로 다시 잡을 필요가 없다.
      //   아래 이름들은 지표 줄 **밖**(PC 표 ScheduleTable·그리드 카드)에서 쓰는 말이라 남긴다.
      if (cut && (지표안 || /마감까지|등록 마감|GTD|예상 상금/.test(text))) {
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
    // 🔴 좌우 값이 **같은 줄에 서 있는가**(2026-09-18 12차 오너: "줄 맞춰줘").
    //   잘림 검사로는 이걸 못 본다 — 값이 다른 줄로 떠도 글자는 하나도 안 잘린다.
    //   flex 3열 시절에는 열마다 따로 쌓여 제목 top 328 / GTD top 308.4 로 어긋나 있었다.
    //   지금은 grid 라 행을 격자가 정한다. 이 검사는 **격자가 유지되는지**를 본다.
    cols: cards.map((c) => {
      const pick = (sel: string) => {
        const el = c.querySelector<HTMLElement>(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top * 10) / 10, bot: Math.round(r.bottom * 10) / 10,
          w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
        };
      };
      // 🔴 2026-09-20 — 카드 구조가 바뀌었다(오너 목업). 격자(`col-start-*`/`row-start-*`)가 아니라
      //   `[로고] [매장 / 제목 / 지표3칸] [시작+시각]` 의 flex 다. 옛 셀렉터는 **전부 null 이 되어**
      //   아래 단언들이 조용히 빈손이 된다 — 그래서 손잡이를 새 구조로 옮긴다(단언은 안 푼다).
      //   `[data-metrics]` 는 그 용도로 카드에 일부러 박아 둔 계측 손잡이다.
      const metrics = c.querySelector('[data-metrics]');
      const cell = (n: number) => {
        const box = metrics?.children[n] as HTMLElement | undefined;
        if (!box) return null;
        const r = box.getBoundingClientRect();
        return { top: Math.round(r.top * 10) / 10, bot: Math.round(r.bottom * 10) / 10,
                 w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
      };
      return {
        title: pick('h3'),
        // 지표 3칸 — 이 셋이 **한 줄에 서는가**가 오너가 목업으로 요구한 계약이다.
        // 🔴 2026-09-25 SCHEDULE-ROW-E — `[data-metrics]` 는 이제 **오른쪽 금액 칸**이다: [보장 금액|데일리] / 참가비 2칸.
        m1: cell(0), m2: cell(1),
        metricsN: metrics ? metrics.children.length : 0,
        /** 금액 칸의 세로선(왼쪽 모서리) — 줄마다 같은 x 여야 한다(오너 E안). */
        divX: metrics ? Math.round(metrics.getBoundingClientRect().left * 100) / 100 : null,
        cardLeft: Math.round(c.getBoundingClientRect().left * 10) / 10,
        time:  pick('[data-testid="schedule-start-time"]'),
      };
    }),
    // 🔴 제목 줄과 그 아래(참가비·등록마감) 줄이 **겹치지 않는가**.
    //   오너가 "줄간격을 붙여 / 더 올려" 를 반복 요청해 그 줄에 **음수 마진**이 들어갔다(2026-09-18).
    //   음수 마진은 줄상자를 겹치게 만드는데, 잘림 게이트는 이걸 **구조적으로 못 본다** —
    //   넘침(scrollHeight > clientHeight)이 아니라 겹침이라서다. 여기서 따로 잰다.
    //   기준은 글자 크기에 비례한다(200% 확대에서 같은 비율로 커지므로 px 고정이면 거짓 실패가 난다).
    titleGap: cards.map((c) => {
      const h3 = c.querySelector('h3');
      // ⚠ `nextElementSibling` 을 쓰면 안 된다 — grid 로 바꾼 뒤 제목 **다음 형제는 같은 행의 GTD** 다.
      //   재려는 것은 '아랫줄과의 간격' 이므로 3행 2열(참가비·메타)을 직접 집는다.
      // 🔴 2026-09-20 — 제목 아랫줄은 이제 지표 3칸이다(옛 `row-start-3` 은 존재하지 않아
      //   null 이 되고, 그러면 이 카드가 통째로 검사에서 빠져 **겹침을 못 잡는다**).
      // 🔴 2026-09-25 SCHEDULE-ROW-E — 제목 아랫줄은 매장·지역 줄이다(금액은 오른쪽 칸으로 갔다).
      const next = h3?.nextElementSibling;
      if (!h3 || !next) return null;
      const a = h3.getBoundingClientRect(); const b = next.getBoundingClientRect();
      return {
        gap: Math.round((b.top - a.bottom) * 10) / 10,
        fs: Math.round(parseFloat(getComputedStyle(h3).fontSize) * 10) / 10,
      };
    }),
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
      // 🔴 2026-09-20 오너 지시: "그런 사람 없어 앞으로 200% 확대 다 빼".
      //   루트 글자 17→34px 로 흉내 내던 200% 확대 케이스를 **전부 제거**했다.
      //   ⚠ 되살리지 마라 — 오너가 사용자 분포를 보고 내린 결정이다.
      //   ⚠ 100% 케이스는 그대로 둔다. 긴 한글 이름에서 생기는 잘림·겹침은 거기서 계속 잡는다
      //     (확대가 잡아주던 레이아웃 취약점의 상당수가 100%의 320·360 최악 데이터에도 나온다).
      for (const zoom of [false]) {
        test(`${w}px · ${theme} · ${zoom ? '200%' : '100%'} — 가로·세로 잘림 0`, async ({ page }) => {
          test.setTimeout(60_000);
          const external: string[] = [];
          await mockAll(page, external);
          await openHome(page, w, theme, zoom);
          const r = await measure(page);
          // 우회 금지 — 잴 것이 실제로 있는지 먼저 단정한다
          expect(r.cards, '일정 카드가 렌더되지 않았다 — 잴 것이 없으면 통과가 아니다').toBeGreaterThan(0);
          console.log(`[${w}/${theme}/${zoom ? 200 : 100}] cards=${r.cards} h=${r.cardH.join(',')} clamp=${r.clamped.length} ellip=${r.ellipsis.length}`);
          // 격자 기하를 **항상** 찍는다 — 어긋남은 통과/실패보다 먼저 눈에 보여야 원인을 짚는다.
          console.log(`  제목 ${r.cols.map((c) => `${c.title?.top}~${c.title?.bot}`).join(' ')}`);
          console.log(`  금액칸 ${r.cols.map((c) => `[${c.m1?.top}~${c.m1?.bot} / ${c.m2?.top}~${c.m2?.bot}] x=${c.divX} n=${c.metricsN}`).join(' ')}`);
          console.log(`  시각 ${r.cols.map((c) => `${c.time?.top}~${c.time?.bot}`).join(' ')}`);
          expect(r.clippedValues, `🔴 값이 잘렸다 — 이름은 줄여도 금액·등록 마감은 못 줄인다:\n${r.clippedValues.join('\n')}`).toEqual([]);
          expect(r.hiddenScroll, `등록 마감·참가비가 숨은 가로 스크롤 안에 있다:\n${r.hiddenScroll.join('\n')}`).toEqual([]);
          expect(
            r.overflow.map((o) => `${o.tag} "${o.text}" ${o.clientW}/${o.scrollW} × ${o.clientH}/${o.scrollH} :: ${o.cls}`),
            '카드 안에서 잘린 요소가 있다',
          ).toEqual([]);
          expect(r.docScrollX, '문서가 가로로 스크롤된다').toBeLessThanOrEqual(0);

          // 🔴 제목 ↔ 참가비 줄 겹침 상한. 음수 마진으로 줄을 당기는 것 자체는 허용하되(오너 지시),
          //   글자끼리 부딪히는 선을 넘지 못하게 막는다. 한계는 제목 글자 크기의 **1/3**이다 —
          //   leading-tight(1.25배)의 아래쪽 여유가 대략 그만큼이고, 그 안에서는 글리프가 안 닿는다
          //   (실측 2026-09-18: 320px 제목 2줄에서 gap −4.2px / 글자 15.9px → 한계 −5.3px, 안 닿음).
          const 겹침 = r.titleGap
            .map((g, i) => ({ i, g }))
            .filter(({ g }) => g && g.gap < -g.fs / 3)
            .map(({ i, g }) => `${i + 1}번째 카드: 간격 ${g!.gap}px (제목 ${g!.fs}px · 한계 ${Math.round(-g!.fs / 3 * 10) / 10}px)`);
          expect(
            겹침,
            '제목과 아래 줄의 글자가 겹친다 — 음수 마진이 줄상자 여유를 넘었다:\n'
            + 겹침.join('\n')
            + '\n→ 더 붙이려면 마진이 아니라 `leading-*`(줄높이) 를 줄여라. 그쪽은 글리프를 안 건드린다.',
          ).toEqual([]);

          // 🔴 **줄 맞음** — 오너가 스크린샷을 주며 요구한 계약이다(2026-09-18 12차 "줄 맞춰줘").
          //   [제목 | GTD] 가 한 줄, [참가비·메타 | 날짜·시각] 이 한 줄이어야 한다.
          //   같은 줄인지는 **세로로 겹치는가**로 판정한다 — 글자 크기가 달라(15.9 vs 19.1px)
          //   top 이나 bottom 을 맞대면 정상인데도 어긋난 것처럼 나온다. 밑선 정렬이라 상자는 어긋난다.
          // ⚠ **글자 100% 에서만** 단언한다. 200% 확대에서 값이 아랫줄로 접히는 것은
          //   설계된 탈출구다 — 행이 flex 라 폭이 모자라면 GTD·시각이 스스로 줄을 내려
          //   글자가 잘리지 않는다. 3열 격자로 만들었을 때는 이 길이 없어 값이 잘렸다(실측 24/81).
          //
          // ⚠ **모든 카드가 맞아야 한다고 요구하지 않는다.** 이 스펙의 픽스처는 일부러 최악 조합이라
          //   (매장명 28자·제목 27자) 좁은 폭에서 GTD 가 스스로 아랫줄로 내려간다 — 그게 탈출구다.
          //   대신 **한 장이라도 한 줄로 서는가**를 본다. 하나도 못 서면 구조가 깨진 것이다
          //   (예: 행이 flex 가 아니거나 형제 관계가 끊어져 값이 늘 아래로 떨어지는 상태).
          //   그래서 **자리가 넉넉한 폭(768 이상)에서만** 단언한다. 거기서도 안 맞으면 폭 문제가 아니라
          //   구조 문제다 — 제목과 GTD 가 형제가 아니거나 justify-between 이 빠진 것이다.
          const 겹치나 = (a: { top: number; bot: number } | null, b: { top: number; bot: number } | null) =>
            !!a && !!b && a.top < b.bot && b.top < a.bot;
          // 🔴 2026-09-20 — 계약의 **대상**이 바뀌었다. [제목|GTD]·[메타|시각] 짝은 구조에서 사라졌고
          //   (GTD 가 지표 줄로 갔다), 오너가 목업으로 요구한 '한 줄' 은 이제 **지표 3칸**이다.
          //   단언을 없애는 게 아니라 같은 성질(줄 맞음)을 지금 있는 대상에 건다.
          //   ⚠ **모든 카드가 한 줄이어야 한다고 요구하지 않는다.** 바로 위 옛 단언이 쓰던 판정과 같다 —
          //     이 스펙의 픽스처는 일부러 최악 조합이라(참가비 `1,234,567원`) 390px 에서도 마지막 칸이
          //     스스로 아랫줄로 내려간다. 그게 **설계된 탈출구**다(2026-09-20: 그 탈출구가 없어서
          //     레지마감 칸이 30/33 으로 잘리고 있었다 → `flex-wrap` 을 넣어 고쳤다).
          //     대신 **한 장이라도 3칸이 한 줄로 서는가**를 본다. 하나도 못 서면 구조가 깨진 것이다
          //     (예: 균등 3등분으로 바뀌어 늘 접히는 상태).
          //   ⚠ 200% 확대는 뺀다 — 글자가 2배면 전부 접히는 것이 정상이다.
          // 🔴 2026-09-25 SCHEDULE-ROW-E(오너 E안) — 지표 3칸 한 줄 계약을 **교체**했다(그 줄 자체가 없어졌다).
          //   같은 성질('값이 흩어지지 않고 한 자리에 선다')을 지금 있는 대상에 건다:
          //     ① 금액 칸은 2칸(금액|데일리 · 참가비)이고 위아래로 겹치지 않는다
          //     ② 세로선 x 가 같은 목록 열 안에서 **모든 줄이 같다**(고정 폭 칸 — 오너 요구)
          const 칸수틀림 = r.cols
            .map((c, i) => ({ i, n: c.metricsN }))
            .filter(({ n }) => n !== 2)
            .map(({ i, n }) => `${i + 1}번째 카드: 금액 칸이 2개(금액·참가비)가 아니라 ${n}개다`);
          expect(칸수틀림, `🔴 금액 칸 구성이 틀렸다:\n${칸수틀림.join('\n')}`).toEqual([]);
          const 겹친칸 = r.cols.filter((c) => 겹치나(c.m1, c.m2)).length;
          expect(겹친칸, '금액과 참가비가 위아래로 겹친다').toBe(0);
          const 열별 = new Map<number, number[]>();
          for (const c of r.cols) if (c.divX !== null) 열별.set(c.cardLeft, [...(열별.get(c.cardLeft) ?? []), c.divX]);
          for (const [left, xs] of 열별) {
            expect(Math.max(...xs) - Math.min(...xs),
              `🔴 목록 열(left ${left})에서 금액 칸 세로선 x 가 줄마다 다르다: ${xs.join(', ')} — 칸 폭 고정이 풀렸다`)
              .toBeLessThanOrEqual(0.5);
          }

          // 🔴 잴 것이 실제로 있었는가 — 마크업이 바뀌면 위 검사가 **빈 통과**가 된다.
          const 못찾음 = r.cols
            .map((c, i) => ({ i, miss: ['title', 'm1', 'm2', 'time'].filter((k) => !c[k as keyof typeof c]) }))
            .filter(({ miss }) => miss.length)
            .map(({ i, miss }) => `${i + 1}번째 카드: ${miss.join('/')} 없음`);
          expect(
            못찾음,
            '🔴 카드 손잡이를 못 찾았다 — 이 검사는 지금 아무것도 안 재고 있다'
            + '(마크업이 바뀌었으면 셀렉터를 옮겨라. 단언을 지우지 마라):\n'
            + `${못찾음.join('\n')}`,
          ).toEqual([]);
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
    // 🔴 2026-09-25 SCHEDULE-ROW-E — 'GTD' 라벨 글자가 없어졌다(오너 E안: 금색 금액 = 보장). 요지(반올림 금지·표시 유지)는
    //   보장 금액 칸(testid)의 값으로 본다. 보장이 없는 행은 금액 대신 '데일리' 다.
    const money = await page.evaluate(() => ({
      prizes: [...document.querySelectorAll('main[data-tab="browse"] [data-testid="schedule-prize"]')].map((e) => (e.textContent || '').trim()),
      dailies: document.querySelectorAll('main[data-tab="browse"] [data-testid="schedule-daily"]').length,
      buyins: [...document.querySelectorAll('main[data-tab="browse"] [data-testid="schedule-buyin"]')].map((e) => (e.textContent || '').trim()),
    }));
    expect(money.prizes, '보장 1,000만이 안 보인다(§28 가격 정보는 표시 유지)').toContain('1,000만');
    expect(money.dailies, '보장이 없는 행(엔트리·데일리)에 "데일리" 표시가 없다').toBeGreaterThan(0);
    expect(money.buyins, '참가비 미입력이 "—" 가 아니다').toContain('—');
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
  // 🔴 2026-09-22 — `tag`/`tid` 를 함께 싣는다. 종전에는 **텍스트로만** 핵심 값을 골라서,
  //   주석이 '읽어야 할 값' 으로 적어 둔 **대회명(h3)** 이 어느 패턴에도 안 걸려 한 번도 검사되지 않았다.
  //   구조로 짚으면 픽스처 문구가 바뀌어도 계속 잡힌다.
  const out: { text: string; fg: string; bg: string; ratio: number; size: string; tag: string; tid: string }[] = [];
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
    out.push({
      text: el.textContent.trim().slice(0, 24), fg, bg, size: s.fontSize,
      ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100,
      tag: el.tagName.toLowerCase(), tid: el.getAttribute('data-testid') ?? '',
    });
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
    // 🔴 2026-09-20 — 카드가 재설계되면서 **읽어야 할 글자의 이름이 전부 바뀌었다.**
    //   옛 목록(`^상금`·`^등록 마감`·`토요일`)으로는 3개도 못 찾아 이 검사가 빈손이 됐다(실측 2개).
    //   바뀐 것: 라벨이 `상금`/`예상 상금`·`참가비`·`레지마감`·`시작` 으로 쪼개졌고(값은 따로 leaf),
    //   날짜(`토요일`·`9/18(금)`)는 화면에서 **빠졌다**(오너 지시).
    //   ⚠ `^상금` 만 두면 '예상 상금'(엔트리 비례 표기)이 빠진다 — 둘은 다른 말이라 둘 다 적는다.
    //   ⚠ 값 쪽도 같이 본다: `원$`(1,234,567원) · `T$`(10T) · `만$`(1,000만) · 시각(`\d:\d`).
    // 🔴 2026-09-22 — `^시작` 을 뺐다(오너가 그 라벨을 없앴다). 대신 **구조로** 두 가지를 더 잡는다:
    //   ① 대회명(h3) — 주석이 처음부터 '읽어야 할 값' 으로 적어 뒀는데 텍스트 패턴에 안 걸려 빠져 있었다.
    //   ② 라이브 필드 현황(생존/엔트리) — 있으면 반드시 읽혀야 하는 값이다(이 픽스처엔 클락이 없어 보통 없다).
    const key = rows.filter((r) => r.tag === 'h3' || /^schedule-(field-count|prize|daily|buyin|start-time)$/.test(r.tid)
      || /원$|T$|만$|^\d{1,2}:\d{2}$|상금|^참가비|^등록 마감|^레지마감|^예약|누리홀덤/.test(r.text));
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

// ── 2026-09-22 요구 C + HIT-1 ────────────────────────────────────────────────
// 오너 요구: ① 제목은 목록에서 한 줄 ② 하트를 빼고 그 자리에 등급 배지 ③ 매장명 링크는
// 카드 높이를 키우지 않고 WCAG 2.2 AA(24px)만 충족.
//
// 이 픽스처에는 legacy 장문 제목(23자·grade series), 짧은 제목(grade daily), grade 없음이 모두 있다 —
// "12자 상한 이전에 저장된 행이 카드 높이를 흔들지 않는가" 를 그대로 잰다.
for (const w of [320, 360, 390, 412]) {
  test(`🔴 요구 C — ${w}px: 제목 1줄 · 하트 0 · 등급 배지 0(데일리는 금액 칸) · 매장명 AA 24px`, async ({ page }) => {

    const external: string[] = [];
    await mockAll(page, external);
    await openHome(page, w, 'dark', false);
    await page.waitForSelector('main[data-tab="browse"] article.cv-card-list', { timeout: 10_000 });

    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>('main[data-tab="browse"] article.cv-card-list')]
        .filter((c) => c.getBoundingClientRect().height > 0);
      const out = {
        cardCount: cards.length,
        titleLines: [] as { text: string; len: number; lines: number; h: number; clamp: string; cut: boolean }[],
        badgesInTitle: 0,
        badgesRight: 0,
        hearts: 0,
        dailies: 0,
        venueHits: [] as { text: string; box: number; effective: number; titleStealsHit: boolean }[],
        cardHeights: [] as number[],
      };
      for (const c of cards) {
        out.cardHeights.push(+c.getBoundingClientRect().height.toFixed(2));
        const h3 = c.querySelector<HTMLElement>('h3');
        if (h3) {
          // 🔴 줄 수는 `Range.getClientRects()` 로 세면 안 된다 — `-webkit-line-clamp` 는 **시각적으로만**
          //   자르고 라인 박스 자체는 남아 있어서, 화면에 한 줄만 보여도 rect 는 2~3개가 나온다(실측).
          //   실제로 보이는 줄 수는 **차지한 높이 ÷ line-height** 다.
          const cs = getComputedStyle(h3);
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
          const lines = Math.round(h3.getBoundingClientRect().height / lh);
          out.titleLines.push({
            text: (h3.textContent || '').trim().slice(0, 18), len: (h3.textContent || '').trim().length, lines,
            cut: h3.scrollHeight - h3.clientHeight > 1 || h3.scrollWidth - h3.clientWidth > 1 || cs.textOverflow === 'ellipsis',
            h: +h3.getBoundingClientRect().height.toFixed(2),
            clamp: cs.webkitLineClamp || 'none',
          });
          if (h3.querySelector('[data-testid="schedule-grade-badge"]')) out.badgesInTitle += 1;
        }
        out.badgesRight += c.querySelectorAll('[data-testid="schedule-grade-badge"]').length - (h3?.querySelectorAll('[data-testid="schedule-grade-badge"]').length ?? 0);
        out.dailies += c.querySelectorAll('[data-testid="schedule-daily"]').length;
        // 하트: aria-label 에 '단골' 이 들어가는 버튼(옛 구현의 접근 이름)
        out.hearts += [...c.querySelectorAll('button')].filter((b) => /단골/.test(b.getAttribute('aria-label') || '')).length;

        // 매장명 링크의 **실효 히트 높이** — 의사요소 확장은 rect 로 안 잡히므로 elementFromPoint 로 잰다.
        const venue = [...c.querySelectorAll<HTMLElement>('button')].find((b) => /tap-up-24/.test(b.className));
        if (venue) {
          const vr = venue.getBoundingClientRect();
          const cx = vr.left + vr.width / 2, cy = vr.top + vr.height / 2;
          const owns = (el: Element | null) => !!el && (el === venue || venue.contains(el));
          let up = 0, down = 0;
          for (let d = 1; d <= 40; d++) { if (owns(document.elementFromPoint(cx, cy - d))) up = d; else break; }
          for (let d = 1; d <= 40; d++) { if (owns(document.elementFromPoint(cx, cy + d))) down = d; else break; }
          // 제목 중심을 매장명 링크가 가로채면 목적지가 뒤바뀐다(매장 페이지 ≠ 일정 상세).
          let titleStealsHit = false;
          if (h3) {
            const tr = h3.getBoundingClientRect();
            titleStealsHit = owns(document.elementFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2));
          }
          out.venueHits.push({
            text: (venue.textContent || '').trim().slice(0, 14),
            box: +vr.height.toFixed(2), effective: up + down + 1, titleStealsHit,
          });
        }
      }
      return out;
    });

    // 🔴 대상 도달 — 카드가 0개면 아래 단언이 전부 공허하게 통과한다.
    expect(r.cardCount, '카드를 못 찾았다 — 검사가 아무것도 재지 않는다').toBeGreaterThan(0);
    expect(r.titleLines.length, '제목(h3)을 못 찾았다').toBeGreaterThan(0);
    expect(r.venueHits.length, '매장명 링크를 못 찾았다 — tap-up-24 가 안 붙었다').toBeGreaterThan(0);

    // ① 🔴 2026-09-24 오너 지시(HOME-LAYOUT-STRETCH · 일정 탭에도 적용 — 리드 판정)로 **계약이 바뀌었다**:
    //   종전 "legacy 23자여도 한 줄(line-clamp-1 말줄임)" → 이제 "**글자를 숨기지 않는다**(말줄임·잘림 0)".
    //   · 입력 상한(12자) 이하 제목은 여전히 **한 줄**이어야 한다 — 카드 높이 고정의 근거가 그대로 산다.
    //   · 12자를 넘는 옛 제목은 어절 단위로 접혀 전부 보인다(줄 수 상한 없음 · 잘림 0).
    for (const t of r.titleLines) {
      expect(t.clamp, `제목 "${t.text}" 에 line-clamp 가 남아 있다 — 글자를 숨기면 안 된다(오너 2026-09-24)`).toBe('none');
      expect(t.cut, `제목 "${t.text}" 이 잘렸거나 말줄임이다`).toBe(false);
      if (t.len <= 12) expect(t.lines, `12자 이하 제목 "${t.text}" 이 ${t.lines}줄(높이 ${t.h}px)이다 — 한 줄이어야 카드 높이가 고정된다`).toBe(1);
    }
    expect(r.titleLines.some((t) => t.len > 12), '12자 넘는 옛 제목 픽스처가 없다 — 줄바꿈 경로를 한 번도 안 쟀다').toBe(true);
    // ② 하트 0 · 등급은 제목 밖 우측에
    expect(r.hearts, '목록 카드에 하트가 남아 있다').toBe(0);
    expect(r.badgesInTitle, '등급 배지가 제목 안에 있다 — 12자 제목의 폭을 먹는다').toBe(0);
    // 🔴 2026-09-25 SCHEDULE-ROW-E — 목록 줄에서 등급·게임 형식 배지를 **뺐다**(오너 E안: "데일리는 오른쪽 칸이 말한다").
    //   종전 '우측 등급 배지 ≥1' 을 '배지 0 · 보장 없는 행에 데일리 ≥1' 로 교체한다(픽스처에 grade=daily·보장 없음 행이 있다).
    expect(r.badgesRight, '목록 줄에 등급 배지가 남아 있다(오너 E안에서 뺐다)').toBe(0);
    expect(r.dailies, '보장이 없는 행에 "데일리" 표시가 없다').toBeGreaterThan(0);
    // ③ 매장명 링크 AA 24px · 제목 침범 0
    for (const v of r.venueHits) {
      expect(v.effective, `매장명 "${v.text}" 실효 히트 ${v.effective}px — WCAG 2.2 AA 24px 미달(박스 ${v.box}px)`).toBeGreaterThanOrEqual(24);
      expect(v.titleStealsHit, `매장명 링크의 히트 영역이 제목을 덮었다 — 카드 탭이 매장 페이지로 샌다`).toBe(false);
    }
  });
}

// ── SCHEDULE-ROW-E: 일정 목록 줄 오른쪽 금액 칸 (2026-09-25 오너 확정 E안) ─────────────────
//
// 🔴 R8(2026-09-22 '우측 열 = 시각·배지·필드현황의 chevron 기준 우측 정렬')을 **교체**했다 — 그 우측 열이 없어졌다.
//   시각은 가운데 셋째 줄(`18:00 시작 · 레지 …`)로 갔고, 오른쪽은 세로선 + [보장 금액|데일리] / 참가비 고정 칸이다.
//
// 지금 재는 것(오너 E안 문장 그대로):
//   ① 세로선 위치가 **모든 줄에서 같다**(칸 폭 고정) — 같은 목록 열 안에서 편차 0.5px 이하.
//   ② 가장 긴 금액 표기가 **한 줄**이다 — 금액 포맷(formatPrize)이 만원 단위 입력에서 내는 최장형 `9억 9,999만`.
//   ③ 12자(`SCHEDULE_TITLE_MAX`) 제목이 360·390·412 에서 **한 줄**이다(글자 폭이 가장 넓은 한글 12자, 공백 없음).
//   ④ 금액·참가비가 칸 안에서 오른쪽 모서리를 같이 쓴다 · 꺾쇠·등급 배지·`시작` 라벨이 없다 · 문서 가로 넘침 0.
//   ⑤ PC(1024·1280·1440)도 같은 구조다.
// 음성 대조(2026-09-25): 금액 칸의 `w-[5.125rem]` 을 빼면 ① 이 금액 길이만큼(최대 23px) 어긋나 FAIL.
const ROWS_E = [
  { ...ROWS[0], id: 'eeeeeeee-0000-4000-8000-000000000001', title: '토요일나이트딥스택메인전', prize_pool: 999_990_000,
    grade: null, is_premium: false, start_time: '23:00:00', reg_close_time: 'Lv12', buy_in: { amount: 100_000, gameType: '홀덤' } },
  { ...ROWS[0], id: 'eeeeeeee-0000-4000-8000-000000000002', title: '위클리 딥스택 1억', prize_pool: 130_000_000,
    grade: null, is_premium: false, start_time: '23:10:00' },
  { ...ROWS[1], id: 'eeeeeeee-0000-4000-8000-000000000003', date: day(0), start_time: '23:20:00' },
  { ...ROWS[0], id: 'eeeeeeee-0000-4000-8000-000000000004' },
];
for (const w of [360, 390, 412, 1024, 1280, 1440]) {
  test(`🔴 SCHEDULE-ROW-E — ${w}px: 세로선 x 동일 · 최장 금액 한 줄 · 12자 제목 한 줄`, async ({ page }) => {
    const external: string[] = [];
    await mockAll(page, external, ROWS_E);
    await openHome(page, w, 'dark', false);
    await page.waitForSelector('main[data-tab="browse"] article.cv-card-list', { timeout: 10_000 });

    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>('main[data-tab="browse"] article.cv-card-list')]
        .filter((c) => c.getBoundingClientRect().height > 0);
      const lines = (el: HTMLElement) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
      return {
        rows: cards.map((c) => {
          const money = c.querySelector<HTMLElement>('[data-testid="schedule-money"]');
          const amount = c.querySelector<HTMLElement>('[data-testid="schedule-prize"], [data-testid="schedule-daily"]');
          const buy = c.querySelector<HTMLElement>('[data-testid="schedule-buyin"]');
          const h3 = c.querySelector<HTMLElement>('h3');
          const R = (el: Element | null) => (el ? +el.getBoundingClientRect().right.toFixed(2) : null);
          return {
            layout: c.dataset.layout ?? '',
            cardLeft: +c.getBoundingClientRect().left.toFixed(1),
            divX: money ? +money.getBoundingClientRect().left.toFixed(2) : null,
            border: money ? getComputedStyle(money).borderLeftWidth : null,
            amount: amount ? (amount.textContent || '').trim() : null,
            amountLines: amount ? lines(amount) : null,
            amountCut: amount ? amount.scrollWidth - amount.clientWidth > 1 || (money ? money.scrollWidth - money.clientWidth > 1 : false) : null,
            rightSpread: amount && buy ? Math.abs(R(amount)! - R(buy)!) : null,
            title: h3 ? (h3.textContent || '').trim() : '',
            titleLines: h3 ? lines(h3) : 0,
            chevrons: c.querySelectorAll('svg.lucide-chevron-right').length,
            badges: c.querySelectorAll('[data-testid="schedule-grade-badge"], [data-testid="schedule-game-type"]').length,
          };
        }),
        startLabels: document.querySelectorAll('[data-testid="schedule-start-label"]').length,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    console.log(`[ROW-E ${w}]`, JSON.stringify(r).slice(0, 900));

    // 🔴 빈 통과 방지 — 잴 대상이 실제로 있었는지 먼저 못박는다.
    expect(r.rows.length, '카드를 하나도 못 찾았다 — 아래 단언이 무의미하다').toBeGreaterThanOrEqual(3);
    for (const row of r.rows) {
      expect(row.layout, '일정 탐색 목록이 시간표형(timetable)이 아니다').toBe('timetable');
      expect(row.divX, '금액 칸(schedule-money)이 없다').not.toBeNull();
      expect(row.border, '금액 칸 왼쪽 세로선이 없다').not.toBe('0px');
      expect(row.amountLines, `금액 "${row.amount}" 이 ${row.amountLines}줄이다 — 한 줄이어야 한다`).toBe(1);
      expect(row.amountCut, `금액 "${row.amount}" 이 칸 밖으로 넘친다`).toBe(false);
      expect(row.rightSpread!, '금액과 참가비의 오른쪽 모서리가 어긋났다').toBeLessThanOrEqual(1);
      expect(row.chevrons, '꺾쇠가 되살아났다').toBe(0);
      expect(row.badges, '등급·게임 형식 배지가 되살아났다(오너 E안에서 뺐다)').toBe(0);
    }
    const byCol = new Map<number, number[]>();
    for (const row of r.rows) byCol.set(row.cardLeft, [...(byCol.get(row.cardLeft) ?? []), row.divX!]);
    for (const [left, xs] of byCol) {
      expect(Math.max(...xs) - Math.min(...xs), `목록 열(left ${left}) 세로선 x 가 줄마다 다르다: ${xs.join(', ')}`).toBeLessThanOrEqual(0.5);
    }
    // 최장 금액 픽스처가 실제로 그려졌는가(대상 도달)
    expect(r.rows.map((x) => x.amount), '최장 금액 9억 9,999만 픽스처가 안 보인다').toContain('9억 9,999만');
    expect(r.rows.map((x) => x.amount), '1억 3,000만 픽스처가 안 보인다').toContain('1억 3,000만');
    expect(r.rows.map((x) => x.amount), '보장 없는 행의 "데일리" 가 안 보인다').toContain('데일리');
    const t12 = r.rows.find((x) => x.title === '토요일나이트딥스택메인전');
    expect(t12, '12자 제목 픽스처가 안 보인다').toBeTruthy();
    expect(t12!.titleLines, `12자 제목이 ${t12!.titleLines}줄이다 — 360~ 에서 한 줄이어야 한다`).toBe(1);
    expect(r.startLabels, '`시작` 라벨(옛 우측 열)이 되살아났다').toBe(0);
    expect(r.docOverflow, '문서 가로 overflow 가 생겼다').toBeLessThanOrEqual(0);
  });
}
