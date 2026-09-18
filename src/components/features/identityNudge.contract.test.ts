// 상단 본인인증 유도 배너 — 한 줄 · 닫기 · 계정별 기억 계약 (2026-09-19 오너 지시).
//
// 오너 문장 그대로: "본인인증이 안되어 있는 계정의 경우 위에 본인인증을 하세요 표기가 뜨는데
//   그걸 x 눌러서 끌 수도 있게 해주고 글이 2줄이라 깨져서 나와 줄을 줄여서 한줄로 만들어".
//
// 실측(고치기 전, 프로덕션 빌드 · stubLogin 미인증 계정):
//   320 / 360 / 390 **전부 2줄**(span 높이 32px = 줄높이 15.94 × 2).
//   390 에서는 둘째 줄이 `주세요.` 하나뿐인 **33px 고아줄**이었다. 닫기 버튼은 0개.
// 실측(고친 뒤): 세 폭 모두 **1줄**(span 16px), 320 에서 글자 137px / 칸 170px — 여유 33px.
//
// 🔴 왜 e2e 가 아니라 소스 계약인가 — 이 저장소에서 가장 중요한 이유다.
//   배너 조건에 `PORTONE_CONFIGURED`(= VITE_PORTONE_STORE_ID·CHANNEL_KEY)가 들어 있는데
//   `.github/workflows/ci.yml` 은 VITE_SUPABASE_* 두 개만 넘긴다. 즉 **CI 빌드에서는 이 배너가
//   아예 렌더되지 않는다.** 여기서 e2e 를 쓰면 '찾지 못했으니 넘어감' 으로 영원히 초록인
//   빈 검사가 된다(이 저장소 최다 함정). 그래서 렌더가 보장되는 소스 쪽을 잠근다.
//   브라우저 실측은 위 숫자로 남기고, 재현 방법은 아래 주석에 적는다.
//   재현: VITE_PORTONE_STORE_ID=x VITE_PORTONE_CHANNEL_KEY=y npm run build 뒤 미인증 계정으로 열기.
//
// 음성 대조(이 검사가 정말 그걸 보고 있는가 — 실제로 되돌려 확인했다):
//   · 문구를 옛 두 문장으로 되돌리면 ②가 실패한다.
//   · `truncate` 를 빼면 ②가 실패한다.
//   · 닫기 버튼을 지우면 ③이 실패한다.
//   · 저장 값을 계정 id 대신 '1' 같은 플래그로 되돌리면 ④가 실패한다.
// 실행: npx vitest run src/components/features/identityNudge.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
const APP = strip(readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf-8'));

/**
 * 배너 블록만 잘라 본다 — App.tsx 어딘가 다른 곳의 비슷한 문구에 속지 않게.
 * ⚠ 끝을 `)}` 로 잡으면 안 된다 — 안쪽 `onClick={() => openMeCb('security')}` 에서 먼저 끊겨
 *   **닫기 버튼이 있는데도 없다고 말하는** 거짓 실패가 난다(실제로 처음에 그랬다).
 *   블록을 닫는 것은 같은 들여쓰기(6칸)의 `)}` 한 줄이라 그걸 앵커로 쓴다.
 */
const BANNER = (() => {
  const i = APP.indexOf('!user.verified && PORTONE_CONFIGURED');
  if (i === -1) return '';
  const start = APP.lastIndexOf('{user', i);
  const end = APP.indexOf('\n      )}', i);
  return end === -1 ? '' : APP.slice(start, end + 9);
})();

describe('상단 본인인증 유도 배너', () => {
  it('🔴 잴 것이 실제로 있다 — 배너 블록을 못 찾으면 아래 검사는 전부 빈 통과다', () => {
    expect(BANNER, 'App.tsx 에서 본인인증 배너 블록을 찾지 못했다 — 조건식이 바뀌었으면 이 앵커부터 고쳐라')
      .not.toBe('');
    expect(BANNER).toMatch(/PORTONE_CONFIGURED/);
  });

  it('🔴 ② 한 줄이다 — 문장은 하나, 줄바꿈은 truncate 가 구조적으로 막는다', () => {
    // 오너가 지운 것은 뒷문장이다. '안전한 이용을 위해 인증해 주세요' 는 바로 옆 '인증하기 →' 가
    // 이미 말하고 있어 지워도 잃는 정보가 없었다(그 문장이 고아줄의 원인이었다).
    expect(BANNER, '두 문장짜리 옛 문구로 돌아갔다 — 390px 에서 `주세요.` 33px 고아줄이 다시 생긴다')
      .not.toMatch(/안전한 이용을 위해/);
    expect(BANNER).toMatch(/휴대폰 본인인증이 필요합니다/);

    // 🔴 글자 수 예산 — '한 줄' 을 소스에서 지킬 수 있는 유일한 방법이다.
    //   실측 근거(320px, text-2xs=11.6875px): 문구 칸 170px · 지금 문구 137px(14자) → 여유 33px.
    //   글자당 약 11.7px 이므로 한 칸 더 써도 안전한 상한은 15자다. 그 위는 말줄임으로 잘린다.
    //   ⚠ 클래스 이름에도 점(`bg-accent-300/[0.08]`)이 있어 블록 전체에서 마침표를 세면 안 된다 —
    //     처음에 그렇게 썼다가 3개가 잡혀 거짓 실패했다. **보이는 글자만** 꺼내서 잰다.
    const copy = (BANNER.match(/text-accent-300">([^<{]+)<\/span>/) ?? [])[1]?.trim() ?? '';
    expect(copy, '배너 문구를 소스에서 꺼내지 못했다 — 마크업이 바뀌었으면 이 앵커부터 고쳐라').not.toBe('');
    expect(copy.length, `배너 문구가 ${copy.length}자다("${copy}") — 320px 한 줄 예산은 15자다`).toBeLessThanOrEqual(15);
    expect(copy, '문장이 둘이 됐다 — 뒷문장이 390px 에서 고아줄을 만들던 그 원인이다').not.toMatch(/\.\s*\S/);
    expect(BANNER, 'truncate 가 빠졌다 — 문구가 길어지는 순간 다시 줄이 늘어난다')
      .toMatch(/truncate[^"]*text-2xs|text-2xs[^"]*truncate/);
    expect(BANNER, 'truncate 는 min-w-0 이 있어야 flex 안에서 실제로 줄어든다').toMatch(/min-w-0/);
  });

  it('🔴 ③ 닫기(x) 가 있고, 셸은 button 이 아니다(중첩 button 금지)', () => {
    expect(BANNER, '닫기 버튼이 없다 — 오너가 요청한 x 다').toMatch(/aria-label="본인인증 안내 닫기"/);
    expect(BANNER).toMatch(/onClick=\{dismissVerifyNudge\}/);
    // button 안의 button 은 무효 HTML 이라 중첩된 쪽 클릭이 브라우저마다 갈린다.
    // 위 푸시 온보딩 배너와 같은 문법(div 셸 + 형제 버튼 둘)이어야 한다.
    expect(BANNER.slice(0, BANNER.indexOf('\n', BANNER.indexOf('<'))), '배너 셸이 아직 button 이다 — 안에 x 를 넣으면 중첩 button 이 된다')
      .not.toMatch(/<button/);
    expect(BANNER).toMatch(/<div className="flex items-center gap-2/);
    // 44px 히트영역은 푸시 배너와 같은 `hit` 유틸로 확보한다(작은 x 를 손가락으로 누른다).
    expect(BANNER, '닫기 버튼에 hit(44px 히트영역)가 없다 — 14px 아이콘은 손가락으로 못 누른다').toMatch(/className="hit /);
  });

  it('🔴 ④ 닫기는 **계정별**로 기억한다 — 공용 PC 에서 다음 손님까지 감추면 안 된다', () => {
    const i = APP.indexOf('const dismissVerifyNudge');
    expect(i, 'dismissVerifyNudge 가 없다').toBeGreaterThan(-1);
    const fn = APP.slice(i, i + 400);
    // 값이 '1' 같은 플래그면 로그아웃 후 다른 계정이 로그인해도 배너가 안 뜬다(계정 간 누수).
    expect(fn, "닫기 상태를 플래그로 저장한다 — 공용 PC 에서 다음 손님의 배너까지 꺼진다").not.toMatch(/setItem\('nuri:verify-nudge-off', '1'\)/);
    expect(fn).toMatch(/const id = user\?\.id \?\? '';/);
    expect(fn).toMatch(/setItem\('nuri:verify-nudge-off', id\)/);
    // 표시 조건도 같은 계정 id 로 대조해야 짝이 맞는다.
    expect(BANNER, '표시 조건이 계정 id 를 대조하지 않는다').toMatch(/verifyNudgeOffFor !== user\.id/);
  });

  it('🔴 ⑤ 배너를 껐다고 인증이 면제되지는 않는다 — 게이트·진입점은 그대로', () => {
    // 이 배너는 '안내' 다. 민감 기능 차단은 VerifyGateSheet 가, 인증 진입점은 내 정보>보안이 맡는다.
    // 둘 중 하나라도 배너 조건에 묶이면 x 한 번이 인증 자체를 우회시킨다.
    expect(APP).toMatch(/<VerifyGateSheet onStart=\{\(\) => openMeCb\('security'\)\} \/>/);
    expect(BANNER).toMatch(/openMeCb\('security'\)/);
    const gateIdx = APP.indexOf('<VerifyGateSheet');
    expect(APP.slice(Math.max(0, gateIdx - 300), gateIdx), 'VerifyGateSheet 가 배너 닫힘 상태에 묶였다 — 안내를 끄면 차단까지 풀린다')
      .not.toMatch(/verifyNudgeOffFor/);
  });
});
