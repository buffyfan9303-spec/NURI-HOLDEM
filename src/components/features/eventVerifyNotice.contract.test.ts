// EventPage — 본인인증·킬스위치 사전 안내 배선 계약 (2026-09-14, 오너 지시).
//
// 배경: 미인증 손님도 출석하면 참여권이 쌓이지만, 카드를 열려는 순간에야 서버가 거절 문구를 보여줬다.
//   오픈기념 이벤트는 신규 손님이 대부분이라 이 화면이 가장 자주 보인다 — 누르기 전에 미리 알린다.
// 지키는 것:
//   · 카드 타일은 여전히 av.canJoin(서버와 같은 판정) 하나로만 막힌다 — 배너가 클릭을 막지 않는다.
//   · 킬스위치 OFF 는 로그인·인증 여부와 무관하게 모두를 막는다(assertVoucherOn·20260914b 와 같은 조건) —
//     그래서 그 가지는 loggedIn 을 보지 않는다. 순서도 킬스위치가 먼저다(else 로 보면 로그인 상태를 몰라도 된다).
//   · 인증 배너는 loggedIn && !verified 일 때만 — 비로그인은 Hero 의 '로그인하고 참여하기'가 이미 말한다.
//   · 킬스위치·본인인증 훅은 새로 만들지 않고 identityFlag.ts·requireLogin.ts 를 그대로 재사용한다.
// 못 보는 것: 문장의 존재만 본다(정적 소스 계약). 렌더·클릭 동작은 e2e 몫.
// 음성 대조: `disabled={!canPlay}` 뒤에 `|| !idOn` 등을 붙이거나, `if (!idOn) {` 를
//   `if (loggedIn && !idOn) {` 로 바꾸면 아래 검사가 실패한다.
// 실행: npx vitest run src/components/features/eventVerifyNotice.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
const EP = strip(readFileSync(join(__dirname, 'EventPage.tsx'), 'utf-8'));

describe('EventPage · 본인인증·킬스위치 사전 안내', () => {
  it('🔴 새 판정을 만들지 않고 기존 훅·헬퍼를 재사용한다', () => {
    expect(EP).toMatch(/import \{ useIdentityEnabled \} from '\.\.\/\.\.\/lib\/identityFlag';/);
    expect(EP).toMatch(/import \{ ensureVerified \} from '\.\.\/\.\.\/lib\/requireLogin';/);
    expect(EP).toMatch(/const idOn = useIdentityEnabled\(\);/);
  });

  it('🔴 카드 타일은 여전히 av.canJoin 하나로만 막힌다 — 배너가 클릭을 막지 않는다', () => {
    expect(EP).toMatch(/disabled=\{!canPlay\}/);
    // canPlay 자체가 av.canJoin 그대로인지(본인인증/킬스위치가 새로 섞이지 않았는지)
    expect(EP).toMatch(/const canPlay = av\.canJoin;/);
  });

  it('🔴 킬스위치 OFF 는 로그인 여부와 무관하게 막는다 — 순서가 인증 검사보다 먼저다', () => {
    const i = EP.indexOf('function EventVerifyNotice(');
    expect(i, 'EventVerifyNotice 정의가 없다').toBeGreaterThan(-1);
    const body = EP.slice(i, EP.indexOf('\n}\n', i));
    const idxLive = body.indexOf('if (!live) return null;');
    const idxKill = body.indexOf('if (!idOn) {');
    const idxVerify = body.indexOf('if (loggedIn && !verified) {');
    expect(idxLive, "'if (!live) return null;' 가 없다").toBeGreaterThan(-1);
    expect(idxKill, "킬스위치 가지가 없다").toBeGreaterThan(-1);
    expect(idxVerify, "인증 가지가 없다").toBeGreaterThan(-1);
    expect(idxLive < idxKill && idxKill < idxVerify, '순서가 live → 킬스위치 → 인증이 아니다').toBe(true);
    // 킬스위치 가지가 loggedIn 을 보지 않는다(비로그인도 막아야 한다)
    const killBranch = body.slice(idxKill, idxVerify);
    expect(killBranch, '킬스위치 가지가 loggedIn 을 본다 — 비로그인에서 화면이 거짓말한다').not.toMatch(/loggedIn/);
  });

  it('🔴 인증 배너는 로그인 + 미인증일 때만 뜬다', () => {
    expect(EP).toMatch(/<EventVerifyNotice idOn=\{idOn\} live=\{av\.state === 'live'\} loggedIn=\{!!user\} verified=\{!!user\?\.verified\} \/>/);
  });
});
