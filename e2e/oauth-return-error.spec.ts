// OAuth 복귀 오류(?error=…&error_code=…&error_description=…) — 화면에는 **고정 문장만** 나온다(2026-10-03 C2 후속 N2).
//
// 왜: 이 URL 은 누구나 링크로 만들 수 있다. 앱이 error_description 을 토스트에 그대로 싣고 있어, 정상 도메인의 링크 한 번으로
//   공식 앱 화면에 가짜 안내 문구("이 번호로 전화해 인증번호를 불러주세요")를 띄울 수 있었다(문구 위조). 제공자의 영문 원문도 그대로 샜다.
//   또 error_description 을 decodeURIComponent 로 한 번 더 풀다가 '100%25' 같은 값에서 던지면 catch 가 URL 정리까지 건너뛰어
//   파라미터가 남았다(새로고침마다 같은 토스트 재현 위험).
// 잠그는 것: ① 임의 문구가 화면 어디에도 없다 ② 코드는 표 문장, 모르는 코드(프로토타입 키 포함)는 고정 문구 ③ URL 정리는 디코딩 예외와 무관하게 된다.
// 거짓 통과 방지: 고정 문장이 **보이는 것을 먼저** 확인한 뒤에 임의 문구의 부재를 센다(토스트가 안 떠서 통과하는 길을 막는다).
// 음성 대조: App.tsx 의 OAuth 복귀 effect 를 `detail`(원문)을 토스트에 싣던 옛 코드로 되돌리면 ①이, 정리를 try/finally 밖으로 빼고
//   decodeURIComponent 를 되살리면 ③이 빨개진다(기준 빌드 c570e605 에서 FAIL → 수정 PASS 를 실측했다).
// 운영 DB 에 쓰지 않는다 — 읽기만 하고 `_fixtures` 가드가 쓰기를 끊는다. 비로그인이다.
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const FORGED = 'ZZPWN 계정 보호를 위해 010-0000-0000 번호로 전화해 인증번호를 불러주세요';
const TRANSIENT = '일시적인 오류입니다. 잠시 후 다시 시도해 주세요';
const FIXED = '로그인을 완료하지 못했습니다. 다시 시도해 주세요';

const hasErrorParams = (page: Page) => {
  const u = new URL(page.url());
  const h = new URLSearchParams(u.hash.replace(/^#/, ''));
  return ['error', 'error_code', 'error_description'].some((k) => u.searchParams.has(k) || h.has(k));
};

async function open(page: Page, path: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  // 앱 오류(pageerror)는 0 이어야 한다 — 디코딩 예외가 조용히 삼켜지는 것과 별개로 밖으로 새면 안 된다.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path);
  return errors;
}

test('코드가 표에 있으면 표 문장만 — 임의 error_description 은 화면에 없고 URL 은 정리된다', async ({ page }) => {
  const errors = await open(page, `/?error=server_error&error_code=unexpected_failure&error_description=${encodeURIComponent(FORGED)}`);
  await expect(page.getByText(TRANSIENT).first()).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body, '임의 문구가 화면에 그대로 나왔다').not.toContain('ZZPWN');
  expect(body).not.toContain('010-0000-0000');
  await expect.poll(() => hasErrorParams(page), { message: 'URL 의 오류 파라미터가 남았다' }).toBe(false);
  expect(errors).toEqual([]);
});

test('모르는 코드는 고정 문구 — 프로토타입 키(constructor)도 함수가 아니라 문구다', async ({ page }) => {
  for (const code of ['totally_unknown_provider_code', 'constructor']) {
    const errors = await open(page, `/?error=server_error&error_code=${code}&error_description=${encodeURIComponent(FORGED)}`);
    await expect(page.getByText(FIXED).first(), code).toBeVisible();
    expect(await page.locator('body').innerText(), code).not.toContain('ZZPWN');
    await expect.poll(() => hasErrorParams(page), { message: `${code}: URL 의 오류 파라미터가 남았다` }).toBe(false);
    expect(errors, code).toEqual([]);
  }
});

test('디코딩이 던지는 값(100%25 · 깨진 %)이어도 URL 정리는 된다', async ({ page }) => {
  for (const desc of ['100%25', '%E0%A4%A', '100%']) {
    const errors = await open(page, `/?error=server_error&error_code=unexpected_failure&error_description=${desc}`);
    await expect(page.getByText(TRANSIENT).first(), desc).toBeVisible();
    await expect.poll(() => hasErrorParams(page), { message: `${desc}: URL 의 오류 파라미터가 남았다` }).toBe(false);
    expect(errors, desc).toEqual([]);
  }
});

test('해시(#error=…)로 와도 같다 — 임의 문구 없음 · 주소 정리', async ({ page }) => {
  const errors = await open(page, `/#error=server_error&error_code=unexpected_failure&error_description=${encodeURIComponent(FORGED)}`);
  await expect(page.getByText(TRANSIENT).first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('ZZPWN');
  await expect.poll(() => hasErrorParams(page), { message: '해시의 오류 파라미터가 남았다' }).toBe(false);
  expect(errors).toEqual([]);
});

test('설명 문구로 사람 말 문장을 바꿔치기할 수 없다 — access_denied 는 고정 문장이고 원문은 없다', async ({ page }) => {
  await open(page, `/?error=access_denied&error_description=${encodeURIComponent(FORGED)}`);
  await expect(page.getByText('로그인이 취소되었거나 앱이 아직 승인되지 않았습니다').first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain('ZZPWN');
});
