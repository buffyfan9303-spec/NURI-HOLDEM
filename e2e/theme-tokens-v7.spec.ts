// §7 양 테마 + §B1 버튼 사다리 회귀 (2026-09-12, home-team)
//
// 이 파일이 잠그는 것은 **전역 토큰의 계약**이다. 화면 하나의 모양이 아니라,
// 모든 화면이 함께 쓰는 값이 되돌아가지 않게 한다.
//
//  ① 하단 탭바 아이콘이 루트 확대를 **따라간다**. 알약(h-7 rem)은 커지는데 아이콘만
//     절대 21px 이라 둘이 따로 놀던 결함(P0-B 후속 3건 중 3번)의 회귀 가드다.
//     ⚠ 크기 단언만으로는 안 된다 — `21px` 을 적어도 100% 에서는 통과한다.
//       **루트를 34px 로 키워 비례가 유지되는지**가 이 테스트의 핵심이다.
//  ② 다크에서 액센트 '글자'는 채운 버튼 색(#6344CE)이 아니라 텍스트 단계로 승격된다.
//     승격이 없으면 지면 대비 3.10 으로 본문 AA(4.5) 미달이다.
//  ③ 라이트 달력 주말 표시(`text-sky-400/60`·`text-danger-light/70`)는 알파 변형이라
//     라이트 보정 목록에서 **조용히 빠져 있었다**(실측 2.00 / 2.08).
//  ④ 버튼 크기 사다리 세 단이 서로 충분히 떨어져 있다(1.7px 차 = '대충 만든 것').
//     동시에 **`.btn` 기본값이 안 바뀌었다**는 것도 함께 잠근다 — 다른 팀의 호출부 241곳이
//     그대로 살아야 하므로, 기본값 변경은 통과시키면 안 되는 회귀다.
//  ⑤ 비활성 버튼이 활성 버튼과 시각적으로 구별된다(§7-1 '비활성 버튼까지 각각 확인').
//  ⑥ 라이트 지면에 '옅은 보라'를 반복하지 않는다(§7 · §4 '페이지 전체를 색 번짐으로 채우지 않음').
//
// 목킹은 **단일 '**' 핸들러**다. 핸들러가 겹치면 route.continue() 가 실네트워크로 나간다.
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
// KST 날짜 헬퍼 — 같은 로직을 스펙 안에 새로 만들지 않는다(두 벌이 되는 순간 그게 버그다).
import { kstToday } from '../src/lib/kst';

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):/;

/** ⚠ 핸들러는 **하나만** 등록한다. 두 개가 겹치면 앞 핸들러의 route.continue() 가 실네트워크로 나간다.
 *  ⚠ PostgREST 응답은 **맨 배열**이다. `{"data":[]}` 로 주면 supabase-js 가 파싱에 실패해
 *    목킹한 행이 **한 장도 렌더되지 않는다**(home-cls.spec 이 "목킹 행이 e2e 에서 안 그려진다"고
 *    적어 둔 함정이 정확히 이것이다 — 그러면 스켈레톤끼리 비교하며 조용히 통과한다). */
async function offline(ctx: BrowserContext, rest: Record<string, unknown[]> = {}) {
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (LOCAL.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (/\.(png|jpg|jpeg|webp|gif|svg|avif)(\?|$)/i.test(url)) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' });
    }
    const table = /\/rest\/v1\/([a-z_]+)\?/.exec(url)?.[1];
    const body = table ? (rest[table] ?? []) : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

const VENUE_ID = '11111111-1111-4111-8111-111111111111';
const TITLES = ['데일리 터보', '위클리 메인이벤트', '새틀라이트', '미드나잇 딥스택'];
const scheduleRows = () => Array.from({ length: 8 }, (_, i) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
  title: TITLES[i % 4], venue_id: VENUE_ID, pub_name: i % 2 ? '홀덤펍 서초점' : '누리홀덤 강남점',
  region: '서울 강남', address: '서울 강남구 테헤란로 1길 23',
  // KST 기준 오늘/내일. toISOString()(UTC) 을 쓰면 한국 시간 00:00~09:00 구간에 '오늘' 행이 KST 어제로 찍히고,
  // 05:00 이후엔 `시작(19:00)+10h` 를 넘겨 scheduleStatus 가 'ended' 로 판정한다 → browse 의 hideEnded
  // (App.tsx:2141, 검색어·날짜 미선택이면 기본 활성)가 **8행 중 4행을 조용히 지운다**.
  // 실측(2026-09-13 05:26 KST): 현행 = 카드 8개(전부 내일치) / 고친 뒤 = 16개(8행 × 카드 2개).
  // ⚠ 아래 ⑦ 단언(n > 2, 높이 최빈값)은 절반이 사라져도 통과한다 — 즉 **실패가 아니라 거짓 통과**였다.
  //   이 파일 246행이 "목킹한 행이 실제로 렌더돼야 한다" 고 스스로 적어 둔 바로 그 조건이 깨져 있었다.
  date: kstToday(Date.now() + (i % 2) * 86_400_000),
  start_time: '19:00:00', duration: '4시간', format: 'NLH', guaranteed: true,
  prize_pool: 10_000_000, prize_percent: null, is_competition: true, grade: 'daily', blinds: null,
  buy_in: { amount: 1_000_000, rebuy: 1_000_000, addon: 500_000 },
  display_order: i, is_premium: false, owner_id: VENUE_ID, approved: true,
  unread_qna_count: 0, view_count: 12, premium_until: null, reg_close_time: '22:00:00',
}));

async function boot(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((t) => { try { localStorage.setItem('nuri-theme', t as string); } catch { /* 저장소 차단 환경 */ } }, theme);
  await page.goto('/');
  await page.waitForTimeout(1200);
}

/** 실제 겹쳐진 배경(조상 알파 합성)과 최종 computed color 로 대비를 잰다 — 순백 기준이 아니다. */
const CONTRAST = `(sel) => {
  const px = (s) => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(/[,\\s\\/]+/).filter(Boolean).map(Number); return [p[0],p[1],p[2], p.length>3?p[3]:1]; };
  const over = (f,b) => { const a=f[3]; return [f[0]*a+b[0]*(1-a), f[1]*a+b[1]*(1-a), f[2]*a+b[2]*(1-a), 1]; };
  const el = document.querySelector(sel); if (!el) return null;
  const chain = []; let n = el;
  while (n && n !== document.documentElement) { chain.push(n); n = n.parentElement; }
  let bg = px(getComputedStyle(document.body).backgroundColor) || [255,255,255,1];
  for (let i = chain.length - 1; i >= 0; i--) { const c = px(getComputedStyle(chain[i]).backgroundColor); if (c && c[3] > 0) bg = over(c, bg); }
  const fgRaw = px(getComputedStyle(el).color);
  const fg = over(fgRaw, bg);
  const sr = (c) => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const lum = (c) => 0.2126*sr(c[0]) + 0.7152*sr(c[1]) + 0.0722*sr(c[2]);
  const l1 = lum(fg), l2 = lum(bg);
  return { cr: +(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2)),
           color: getComputedStyle(el).color, bg: bg.slice(0,3).map(Math.round) };
}`;

/** 지면 위에 검사용 노드를 심는다 — 토큰 계약을 화면 상태와 무관하게 잰다. */
async function probe(page: Page, html: string) {
  await page.evaluate((h) => {
    document.getElementById('nuri-v7-probe')?.remove();
    const d = document.createElement('div');
    d.id = 'nuri-v7-probe';
    d.innerHTML = h;
    document.body.appendChild(d);
  }, html);
}

test('① 하단 탭바 아이콘이 루트 확대를 따라간다 (알약과 같은 비율)', async ({ page, context }) => {
  await offline(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, 'dark');

  // ⚠ 2026-09-21 N2 로 선택 탭 아이콘에 상시 scale(1.04) 가 붙었다. 기본 진입 탭(홈)은 항상
  // aria-current="page" 라 첫 매치를 그대로 쓰면 100% 렌더 크기가 21→21.84px 로 늘어난 걸 이
  // 테스트가 "회귀"로 오판한다(허용오차 0.3px). 이 테스트가 원래 재려던 건 '루트 확대에 절대 px
  // 로 안 굳는가'이지 선택 탭의 강조 배율이 아니므로, 허용오차를 넓히는 대신 **비활성 탭**으로
  // 셀렉터를 좁힌다. 아이콘과 필(아이콘 래퍼)은 같은 버튼에서 함께 재야 비율이 맞는다.
  const read = () => page.evaluate(() => {
    const icon = document.querySelector("nav[aria-label='하단 내비게이션'] button[data-main-tab]:not([aria-current='page']) svg");
    const pill = document.querySelector("nav[aria-label='하단 내비게이션'] button[data-main-tab]:not([aria-current='page']) > span");
    if (!icon || !pill) return null;
    return { icon: icon.getBoundingClientRect().height, pill: pill.getBoundingClientRect().height,
             root: parseFloat(getComputedStyle(document.documentElement).fontSize) };
  });

  const at100 = await read();
  expect(at100, '하단 탭바 아이콘/알약을 찾지 못했다 — 셀렉터가 바뀌었는지 확인하라').not.toBeNull();
  await page.evaluate(() => { document.documentElement.style.fontSize = '34px'; });
  await page.waitForTimeout(400);
  const at200 = await read();

  console.log('NAV100 ' + JSON.stringify(at100) + '  NAV200 ' + JSON.stringify(at200));
  // 루트가 2배가 됐으면 아이콘도 2배여야 한다. 절대 px 이면 여기서 비율이 1.0 으로 떨어진다.
  const grow = at200!.icon / at100!.icon;
  expect(grow, `루트를 2배로 키웠는데 아이콘은 ${grow.toFixed(2)}배만 커졌다 — 절대 px 로 되돌아갔다`)
    .toBeGreaterThan(1.9);
  // 아이콘/알약 비율이 두 배율에서 같아야 '따로 놀지' 않는다.
  const r100 = at100!.icon / at100!.pill, r200 = at200!.icon / at200!.pill;
  expect(Math.abs(r100 - r200), `아이콘/알약 비율이 배율마다 다르다 (${r100.toFixed(3)} vs ${r200.toFixed(3)})`)
    .toBeLessThan(0.02);
  // 100% 렌더 크기는 종전과 같아야 한다(시각 회귀 0) — 21px.
  expect(Math.abs(at100!.icon - 21)).toBeLessThan(0.3);
});

test('② 다크에서 액센트 글자가 본문 AA 를 넘는다 (버튼 면 색과 분리)', async ({ page, context }) => {
  await offline(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, 'dark');
  await probe(page, '<span id="p-acc" class="text-accent-300">액센트 글자</span>'
                  + '<span id="p-acc90" class="text-accent-300/90">액센트 글자</span>');

  for (const sel of ['#p-acc', '#p-acc90']) {
    const r = await page.evaluate(`(${CONTRAST})(${JSON.stringify(sel)})`) as { cr: number; color: string; bg: number[] } | null;
    console.log(`ACCENT ${sel} ` + JSON.stringify(r));
    expect(r, `${sel} 를 찾지 못했다`).not.toBeNull();
    expect(r!.cr, `다크 ${sel} 대비 ${r!.cr} — 채운 버튼 색이 글자에 그대로 쓰이고 있다 (color=${r!.color})`)
      .toBeGreaterThanOrEqual(4.5);
  }

  // 같은 토큰의 '면' 역할은 그대로여야 한다 — 승격이 배경까지 바꾸면 흰 글자 대비가 무너진다.
  await probe(page, '<span id="p-bg" class="bg-accent-300 text-white">채운 버튼</span>');
  const fill = await page.evaluate(() => getComputedStyle(document.querySelector('#p-bg')!).backgroundColor);
  console.log('ACCENT-FILL ' + fill);
  expect(fill.replace(/\s/g, ''), '채운 면까지 텍스트 단계로 바뀌었다').toBe('rgb(99,68,206)');
});

test('③ 라이트 달력 주말 표시가 보인다 (알파 변형도 보정된다)', async ({ page, context }) => {
  await offline(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, 'light');
  await probe(page, '<span id="p-sat" class="text-sky-400/60">토</span>'
                  + '<span id="p-sun" class="text-danger-light/70">일</span>');

  for (const [sel, name] of [['#p-sat', '토'], ['#p-sun', '일']] as const) {
    const r = await page.evaluate(`(${CONTRAST})(${JSON.stringify(sel)})`) as { cr: number; color: string } | null;
    console.log(`WEEKEND ${name} ` + JSON.stringify(r));
    expect(r!.cr, `라이트 '${name}' 대비 ${r!.cr} — 알파 변형(text-x/60)이 라이트 보정을 못 받고 있다 (color=${r!.color})`)
      .toBeGreaterThanOrEqual(4.5);
  }
});

test('④ 버튼 크기 사다리 3단 — 그리고 .btn 기본값은 그대로다', async ({ page, context }) => {
  await offline(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, 'dark');
  await probe(page, '<button id="b-sm" class="btn btn-sm">버튼</button>'
                  + '<button id="b-md" class="btn">버튼</button>'
                  + '<button id="b-lg" class="btn btn-lg">버튼</button>'
                  + '<button id="b-pl" class="btn-primary btn-lg">버튼</button>');

  const m = await page.evaluate(() => {
    const g = (id: string) => {
      const el = document.querySelector('#' + id) as HTMLElement;
      const cs = getComputedStyle(el);
      return { h: +el.getBoundingClientRect().height.toFixed(2), fs: +parseFloat(cs.fontSize).toFixed(3) };
    };
    return { sm: g('b-sm'), md: g('b-md'), lg: g('b-lg'), primaryLg: g('b-pl') };
  });
  console.log('BTN ' + JSON.stringify(m));

  // .btn 기본값 고정 — 다른 팀의 호출부 241곳이 이 값 위에 서 있다. 바뀌면 그 자체가 회귀다.
  expect(m.md.h, '.btn 기본 높이가 40.8 에서 움직였다').toBeCloseTo(40.8, 1);
  expect(m.md.fs, '.btn 기본 글자 크기가 14.875 에서 움직였다').toBeCloseTo(14.875, 2);

  // 세 단은 '위계'로 읽혀야 한다 — 1.7px 차는 위계가 아니라 '대충 만든 것'이다.
  expect(m.sm.h, `btn-sm(${m.sm.h})과 btn(${m.md.h}) 차이가 6px 미만이다`).toBeLessThanOrEqual(m.md.h - 6);
  expect(m.lg.h, `btn(${m.md.h})과 btn-lg(${m.lg.h}) 차이가 5px 미만이다`).toBeGreaterThanOrEqual(m.md.h + 5);
  expect(m.sm.fs).toBeLessThan(m.md.fs);
  expect(m.lg.fs).toBeGreaterThan(m.md.fs);
  // 색 변형과 함께 써도 크기 변형이 이겨야 한다(선언 순서 계약).
  expect(m.primaryLg.h, 'btn-primary 와 함께 쓰면 btn-lg 가 무시된다 — 선언 순서가 뒤집혔다')
    .toBeCloseTo(m.lg.h, 1);
  // 터치 목표(44px) — btn-lg 는 그 자체로 충족한다.
  expect(m.lg.h).toBeGreaterThanOrEqual(44);
});

test('⑤ 비활성 버튼이 활성 버튼과 구별된다', async ({ page, context }) => {
  await offline(context);
  await boot(page, 'dark');
  await probe(page, '<button id="b-on" class="btn-primary">저장</button>'
                  + '<button id="b-off" class="btn-primary" disabled>저장</button>'
                  + '<input id="i-on" class="input" value="값" />'
                  + '<input id="i-off" class="input" value="값" disabled />');
  const r = await page.evaluate(() => {
    const g = (id: string) => {
      const cs = getComputedStyle(document.querySelector('#' + id)!);
      return { opacity: +cs.opacity, cursor: cs.cursor, bg: cs.backgroundColor, border: cs.borderTopColor };
    };
    return { on: g('b-on'), off: g('b-off'), iOn: g('i-on'), iOff: g('i-off') };
  });
  console.log('DISABLED ' + JSON.stringify(r));
  expect(r.off.opacity, '비활성 버튼이 활성 버튼과 똑같이 보인다').toBeLessThan(r.on.opacity);
  expect(r.off.cursor).toBe('not-allowed');
  // 입력칸도 같은 부류다 — 실측에서 비활성 입력이 활성과 **픽셀 단위로 같았다**.
  expect(r.iOff.bg, '비활성 입력칸이 활성 입력칸과 같은 면이다').not.toBe(r.iOn.bg);
  expect(r.iOff.cursor).toBe('not-allowed');
});

test('⑥ 라이트 지면에 옅은 보라를 반복하지 않는다', async ({ page, context }) => {
  await offline(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, 'light');
  const a = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { a1: parseFloat(cs.getPropertyValue('--aura-a1')), a2: parseFloat(cs.getPropertyValue('--aura-a2')),
             a3: parseFloat(cs.getPropertyValue('--aura-a3')) };
  });
  console.log('LIGHT-BLOOM ' + JSON.stringify(a));
  // --aura-a2 는 .aura-bg 의 전면 블룸이자 **모든 sticky 서브탭 바**가 미리 섞는 보라의 계수다.
  // 여기가 높으면 '모든 박스가 옅은 보라' 라는 인상이 지면과 바 양쪽에서 동시에 만들어진다.
  expect(a.a2, '라이트 블룸 알파가 되돌아갔다 — 지면과 모든 서브탭 바가 다시 보라로 물든다').toBeLessThanOrEqual(0.06);
  expect(a.a1).toBeLessThanOrEqual(0.06);
  expect(a.a3).toBeLessThanOrEqual(0.05);

  // 다크는 반대다 — 어두운 지면에서 블룸은 얼룩이 아니라 깊이라 내리지 않았다.
  await page.evaluate(() => { document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark'); });
  const dark = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--aura-a2')));
  console.log('DARK-BLOOM a2=' + dark);
  expect(dark, '다크 블룸까지 같이 내려갔다 — 다크는 대상이 아니다').toBeGreaterThan(0.1);
});

// ⑦ 일정 목록 카드의 실제 높이와 --card-h-list 가 맞는가.
//   이 토큰은 두 곳이 함께 쓴다 — `.cv-card-list` 의 contain-intrinsic-size(화면 밖 행 추정치)와
//   HomeTab 의 일정 스켈레톤 `min-h`. 어긋나면 데이터가 도착할 때 아래가 통째로 밀린다.
//   실측(2026-09-12): 390px 에서 스켈레톤 116 vs 실제 182.2 → 4행이면 **265px 점프**였다.
//   ⚠ 이 테스트가 거짓 통과하지 않으려면 목킹한 행이 **실제로 렌더돼야** 한다 —
//     그래서 카드 개수를 먼저 assert 한다(`if (!cards.length) return` 같은 우회를 쓰지 않는다).
for (const { w, tol } of [{ w: 390, tol: 26 }, { w: 1440, tol: 22 }]) {
  test(`⑦ ${w}px — 일정 카드 실제 높이와 --card-h-list 가 맞는다`, async ({ page, context }) => {
    await offline(context, { schedules: scheduleRows() });
    await page.setViewportSize({ width: w, height: 900 });
    await page.addInitScript(() => { try { localStorage.setItem('nuri-theme', 'dark'); } catch { /* 차단 환경 */ } });
    await page.goto('/?tab=browse');
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.cv-card-list')];
      const hs = cards.map((c) => +c.getBoundingClientRect().height.toFixed(1)).filter((h) => h > 0);
      const cnt: Record<number, number> = {};
      hs.forEach((h) => { cnt[h] = (cnt[h] || 0) + 1; });
      const mode = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      return { n: cards.length, mode: mode ? +mode[0] : null,
               // 🔴 2026-09-20 — 전에는 카드 **글자**에서 '9/20' 을 찾았다. 오너 지시로 카드에서 날짜 표기를
               //   뺐으므로(ScheduleCard.tsx) 글자로는 더 못 본다. **계약은 그대로 두고 손잡이만 옮긴다** —
               //   `data-date` 는 그 게이트가 볼 값으로 카드에 일부러 남겨 둔 것이다.
               //   느슨하게 푸는 것(단언 삭제·부분일치 완화)이 아니라 같은 것을 다른 경로로 본다.
               dates: cards.map((c) => c.getAttribute('data-date')).filter(Boolean) as string[],
               token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-h-list')) };
    });
    console.log(`CARD-H ${w} ` + JSON.stringify({ n: m.n, mode: m.mode, token: m.token }));
    expect(m.n, '목킹한 일정 행이 한 장도 렌더되지 않았다 — PostgREST 응답 모양(맨 배열)을 확인하라')
      .toBeGreaterThan(2);
    // ⚠ 개수만으로는 부족하다. `n > 2` 는 **8행 중 4행이 사라져도 통과**했다(2026-09-13 실측) —
    //   픽스처가 UTC 날짜를 쓰던 시절 KST 05:00~09:00 구간에 hideEnded 가 '오늘' 행을 전부 지웠는데
    //   카드가 여전히 8개라 아무도 눈치채지 못했다. 그래서 **두 날짜가 다 보이는지**를 직접 본다.
    //   (카드 개수로 세지 않는 이유: 일정 1건이 `.cv-card-list` 를 2개 렌더해 개수는 구현 세부사항이다.)
    // 🔴 손잡이 자체가 사라지면 아래 루프가 **아무것도 못 보고 통과**한다 — 그걸 먼저 막는다.
    expect(m.dates.length,
      '카드에 `data-date` 가 하나도 없다 — 손잡이가 사라졌다면 아래 날짜 단언은 빈 검사다'
      + ' (ScheduleCard.tsx 의 `data-date={schedule.date}` 를 확인하라)').toBeGreaterThan(0);
    for (const off of [0, 1]) {
      const iso = kstToday(Date.now() + off * 86_400_000);
      expect(m.dates, `${iso} 일정 행이 한 장도 안 보인다 — 픽스처 날짜가 KST 기준이 아니거나 hideEnded 에 걸렸다`
        + ` (렌더된 날짜: ${JSON.stringify([...new Set(m.dates)])})`).toContain(iso);
    }
    expect(Math.abs(m.mode! - m.token),
      `--card-h-list(${m.token}) 가 실제 카드 높이(${m.mode})와 ${Math.abs(m.mode! - m.token).toFixed(1)}px 어긋난다`)
      .toBeLessThanOrEqual(tol);
  });
}
