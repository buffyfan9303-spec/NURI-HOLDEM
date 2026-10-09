// R2P-01·R2P-02(2026-10-09 출시 전 2회차 점검) — '조회 실패'를 '없음'으로 위장하던 두 자리의 배선 계약.
//
// R2P-01  api/auth.getMyAccountSummary 가 두 count 조회의 error 를 안 보고 `count ?? 0` 을 돌려줘,
//         탈퇴 확인창의 '보유 이용권·작성 글 수를 확인하지 못했습니다' 분기(ProfileModal sumFailed)가 절대 안 떴다.
// R2P-02  App 의 알림 조회 5곳이 전부 `getMyNotifications()...catch(() => {})` 라 실패가 '새 알림이 없습니다'로 보였다.
//         지금은 App.loadNotifications 한 곳이 실패를 notifErr 로 남기고, 패널이 쪽지 목록처럼 LoadErrorCard·다시 시도를 그린다.
//         실패 시 setNotifications 를 부르지 않으므로 배지·목록은 이전 값 그대로다.
//
// 못 보는 것: 문장의 존재만 본다. 렌더·대비는 하네스(audit-open-1009/r2/profile/fix/fx.cjs) 몫.
// 음성 대조: auth.ts 의 `if (v.error || p.error) throw` 줄을 지우면 첫 검사가, App.tsx 에 `getMyNotifications().then(...).catch(() => {})`
//   를 한 곳 되살리면 둘째 검사가, NotificationPanel 의 `loadError != null && notifications.length === 0` 분기를 지우면 셋째 검사가 실패한다.
// 실행: npx vitest run src/components/features/profileNotifLoadFailure.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
const read = (p: string) => strip(readFileSync(join(__dirname, p), 'utf-8'));
const AUTH = read('../../api/auth.ts');
const APP = read('../../App.tsx');
const PANEL = read('NotificationPanel.tsx');

describe('조회 실패를 없음으로 위장하지 않는다', () => {
  it('R2P-01 getMyAccountSummary 는 count 조회 오류를 던진다', () => {
    const s = AUTH.indexOf('export async function getMyAccountSummary(');
    expect(s).toBeGreaterThan(-1);
    const body = AUTH.slice(s, AUTH.indexOf('\n}', s));
    expect(body).toMatch(/if \(v\.error \|\| p\.error\) throw /);
  });

  it('R2P-02 App 은 알림 조회 실패를 삼키지 않는다 — 전부 loadNotifications 를 거친다', () => {
    const calls = APP.match(/getMyNotifications\(\)/g) ?? [];
    expect(calls.length, 'getMyNotifications() 직접 호출은 loadNotifications 정의 한 곳뿐이어야 한다').toBe(1);
    expect(APP).toMatch(/const loadNotifications = useCallback\(\(\) => getMyNotifications\(\)\s*\.then\(forAccount\([\s\S]{0,120}setNotifErr\(null\)[\s\S]{0,40}\.catch\(forAccount\(setNotifErr\)\)/);
    expect(APP).toMatch(/notifError=\{notifErr\}/);
    expect(APP).toMatch(/loadError=\{notifError\}/);
  });

  it('R2P-02 패널은 목록이 비었고 실패했으면 빈 상태 대신 실패 카드를 그린다', () => {
    expect(PANEL).toMatch(/loadError != null && notifications\.length === 0 \? \([\s\S]{0,300}<LoadErrorCard error=\{loadError\} what="알림" onRetry=\{onRetry\}/);
  });
});
