// 소셜 로그인 · 약관 시트 · 동의 게이트 — AUTH-01 · MODAL-03 · AUTH-04
//
// 잠그는 것 셋:
//  ① 로그인 창의 소셜 CTA 는 Google 하나다 — 카카오 로그인은 2026-09-10 오너 지시로 삭제(제공자 성공 이력 0건).
//     되살아나면(코드·환경변수 어느 쪽이든) 이 케이스가 잡는다.
//  ② 가입 폼의 약관 '보기' 시트가 열리면 포커스가 시트 안으로 들어오고, Tab 이 뒤쪽 폼으로 새지 않으며,
//     닫으면 '보기' 버튼으로 돌아온다(Modal 원자로 감싼 결과).
//  ③ agreed_to_terms=false 로 로그인한 회원(=소셜 첫 로그인, 20260909a 적용 후)에게 '서비스 이용 동의' 게이트가 뜨고
//     필수 4개를 체크하기 전엔 '동의하고 시작' 이 비활성이다.
// 운영 DB 에는 쓰지 않는다 — 세션은 가짜, profiles 는 page.route 로 만든다(voucher-sheet-open.spec 조리법).
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

async function openLogin(page: Page) {
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: '로그인' }).first().click();
  // 모달 안에서만 조작한다(auth-smoke 와 같은 계약) — 헤더는 이 시점에 배경 오버레이에 덮인다.
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('input[type="email"]') }).first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

test('🔴 로그인 창 — 소셜 CTA 는 Google 하나고 카카오 버튼은 없다(AUTH-01 · 2026-09-10 삭제)', async ({ page }) => {
  const dialog = await openLogin(page);
  await expect(dialog.getByRole('button', { name: /Google로/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /카카오/ }), '삭제한 카카오 로그인 버튼이 다시 렌더됐다').toHaveCount(0);
});

test('🔴 약관 시트 — 열리면 포커스가 안으로 들어오고 Tab 이 밖으로 새지 않으며 닫으면 보기 버튼으로 돌아온다(MODAL-03)', async ({ page }) => {
  const dialog = await openLogin(page);
  // 2026-09-11: 상단 3분할 탭 제거 — 로그인 화면 하단 '회원가입' 으로 들어가면 일반 회원이 기본이다.
  await dialog.getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '일반 회원' }), '가입 유형 세그먼트가 없다').toHaveAttribute('aria-pressed', 'true');
  // ⚠ exact 필수 — 2026-09-11 에 붙은 비밀번호 보기 토글(aria-label="비밀번호 보기")이
  //   부분일치로 함께 잡힌다. 느슨하게 두면 약관 시트 대신 비밀번호를 토글하고 지나간다.
  const view = dialog.getByRole('button', { name: '보기', exact: true }).first(); // 서비스 이용약관
  await view.click();

  const sheet = page.getByRole('dialog', { name: '서비스 이용약관' });
  await expect(sheet, '약관 시트가 dialog 이름으로 잡히지 않는다(부모 모달 제목으로 풀렸는지 확인)').toBeVisible({ timeout: 5_000 });
  // 첫 포커스 — Modal 원자는 열리고 50ms 뒤 첫 포커스 가능 요소(헤더 닫기)로 옮긴다
  await expect(sheet.getByRole('button', { name: '닫기' }), '시트가 열렸는데 포커스가 안으로 들어오지 않았다').toBeFocused({ timeout: 3_000 });
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  expect(await sheet.evaluate((el) => el.contains(document.activeElement)), 'Tab 3회 뒤 포커스가 시트 밖(가입 폼)으로 샜다').toBe(true);

  await sheet.getByRole('button', { name: '확인했습니다' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(view, '시트를 닫았는데 포커스가 보기 버튼으로 돌아오지 않았다').toBeFocused({ timeout: 3_000 });
});

// ── ③ 동의 게이트 — 가짜 세션 3종 세트(JWT 는 디코드 가능해야 한다: voucher-sheet-open.spec 참고) ──────────────
const KEY = 'sb-idsxiqspecrucvfvtgbw-auth-token';
const UID = '00000000-0000-4000-8000-0000000000a4';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'social@example.com',
          app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { name: '소셜' }, created_at: new Date().toISOString() },
};

test('🔴 동의 미이행 회원 — 로그인 직후 서비스 이용 동의 게이트가 뜨고 필수 4개 전엔 못 넘어간다(AUTH-04)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill(json(r.request().url().includes('/user') ? FAKE.user : FAKE)));
  // 20260909a 적용 후 소셜 첫 로그인 프로필 — 동의 3종 false · 동의 판 NULL
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: '소셜', nickname: '소셜_a4', role: 'user', status: 'active',
    agreed_to_terms: false, agreed_to_privacy: false, agreed_to_anti_gambling: false, agreed_to_marketing: false,
    consented_legal_version: null, terms_agreed_at: null,
    activity_points: 0, created_at: FAKE.user.created_at,
  })));
  await page.goto('/');

  // ⚠ dismissOverlays 를 부르지 않는다 — 그 헬퍼는 이 게이트를 '통과' 시키는 것이 일이다.
  //   dialog 이름 대신 제목으로 고른다: Modal 원자의 제목 id 가 고정이라 다른 모달이 함께 떠 있으면 이름이 흔들린다.
  const gate = page.locator('[role="dialog"]').filter({ has: page.getByRole('heading', { name: '서비스 이용 동의' }) }).first();
  await expect(gate, '동의 미이행(agreed_to_terms=false) 회원인데 동의 게이트가 뜨지 않았다').toBeVisible({ timeout: 15_000 });

  const go = gate.getByRole('button', { name: '동의하고 시작' });
  await expect(go, '필수 항목을 하나도 안 골랐는데 시작 버튼이 열려 있다').toBeDisabled();
  for (const label of [/만 19세 이상/, /서비스 이용약관/, /개인정보 수집·이용/, /불법 환전·사행성/]) {
    await gate.locator('label').filter({ hasText: label }).first().locator('input[type="checkbox"]').check();
  }
  await expect(go).toBeEnabled();
  // 선택 동의(마케팅·랭킹 공개)는 안 골랐다 — 그래도 열려야 한다(§22⑤ 동의 강제 금지)
  await expect(gate.locator('label').filter({ hasText: /마케팅 정보 수신/ }).locator('input[type="checkbox"]')).not.toBeChecked();
});
