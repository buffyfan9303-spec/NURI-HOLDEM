// 내 정보 '내 업적' — 조회 실패를 섹션 소실로도, 거짓 '0/12' 로도 그리지 않는다 (UI-08 후속 · e2e account-isolation 회귀, 2026-09-13).
//
// 왜: UI-08 에서 getMyBadgeStats 가 오류를 던지게 되자 CustomerDashboardPage 의 `.catch(() => {})` 가 **죽은 코드에서 실행되는
//   코드**로 바뀌어 badgeStats 가 null 로 남고 섹션이 통째로 사라졌다(dealerShifts 때와 같은 부류). 실패는 헤더를 남긴 채
//   LoadErrorCard(이유 + 재시도)로 말한다. 실제 화면 확인은 e2e/account-isolation.spec.ts(픽스처가 venue_rankings 를 route) 가 한다.
// 음성 대조: `.catch((e: unknown) => { if (alive) setBadgeErr(e); })` 를 `.catch(() => {})` 로 되돌리면 ①이 실패한다.
// 실행: npx vitest run src/components/features/customerDashboardBadges.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'CustomerDashboardPage.tsx'), 'utf8').replace(/\r\n/g, '\n');
const CODE = SRC.replace(/^\s*\/\/.*$/gm, '');

describe('CustomerDashboardPage · 내 업적 실패 처리', () => {
  it('① 조회 실패를 badgeErr 로 받는다 — 조용한 catch 가 없다', () => {
    const i = CODE.indexOf('getMyBadgeStats(user.nickname');
    expect(i).toBeGreaterThan(-1);
    const call = CODE.slice(i, CODE.indexOf('return () => { alive = false; };', i));
    expect(call).toMatch(/\.catch\(\(e: unknown\) => \{ if \(alive\) setBadgeErr\(e\); \}\)/);
    expect(call).not.toMatch(/\.catch\(\(\) => \{\}\)/);
  });
  it('② 실패 갈래도 "내 업적" 헤더를 남기고 LoadErrorCard(재시도)를 그린다 — 거짓 0/12 없음', () => {
    expect(CODE).toMatch(/badgeErr != null && !badgeStats && \(/);
    expect(CODE).toMatch(/<LoadErrorCard error=\{badgeErr\} what="내 업적" onRetry=\{\(\) => setBadgeTick\(\(t\) => t \+ 1\)\} compact \/>/);
    // 성공 갈래의 달성 수는 badgeStats 가 있을 때만 — 실패 상태에서 0/12 를 계산하는 코드가 없다
    expect(CODE).not.toMatch(/badgeErr[^\n]*BADGES\.filter/);
  });
  it('③ 계정 경계 리셋에 badgeErr 도 들어간다(A 의 오류 카드가 B 에게 남지 않는다)', () => {
    expect(CODE).toMatch(/setBadgeStats\(null\); setBadgeErr\(null\);/);
    expect(CODE).toMatch(/\}, \[open, user, badgeTick\]\);/);
  });
});
