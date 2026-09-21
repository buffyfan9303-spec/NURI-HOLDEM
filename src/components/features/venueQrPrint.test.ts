// FINAL-QR#PRINT-A-B — **행동 검증**. A 를 지연시키고 B 로 바꾼 뒤 A 를 늦게 resolve 하는
// 진짜 역순 경합을 재현한다(문자열 검사가 아니다).
//
// 왜 이 파일이 따로 필요했나: 종전 `qrVenueGuard.contract.test.ts:55-60` 은
//   `expect(src).toMatch(/forVenue\s*!==\s*venueId/)` — **그 문자열이 있는지만** 봤다.
//   실제 코드는 `const forVenue = venueId; await …; if (forVenue !== venueId)` 로
//   **한 클로저의 같은 값 두 개**를 비교해 A→B 전환 뒤에도 항상 거짓이었는데, 문자열은 있으니 PASS.
//   초록불이 0건 차단을 0건 차단이라고 말해 주지 않은 전형이다.
//
// 음성 대조(실행함): venueQrPrint.ts 의 `current() === captured` 를 `captured === captured` 로
//   되돌리면 아래 ①③④ 가 빨개진다. 되돌린 뒤 실제로 돌려 빨간 것을 확인하고 원복했다.
// 실행: npx vitest run src/components/features/venueQrPrint.test.ts
import { describe, it, expect } from 'vitest';
import { buildQrForVenue } from './venueQrPrint';

/** 손으로 resolve 하는 Promise — 완료 **순서**를 시험이 직접 정한다. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('buildQrForVenue — 인쇄 준비 중 매장 전환', () => {
  it('🔴 ① A 로 시작해 B 로 바뀐 뒤 A 가 늦게 끝나면 결과를 버린다(null)', async () => {
    let now: string | null = 'A';
    const dA = deferred<string>();
    const run = buildQrForVenue('A', () => now, [() => dA.promise]);

    now = 'B';          // 관리자가 관리 매장을 A→B 로 바꿨다(이 시점엔 A 요청이 아직 진행 중)
    dA.resolve('A-qr'); // 그제서야 A 의 QR 생성이 끝난다

    await expect(run).resolves.toBeNull();
  });

  it('🔴 ② 매장이 그대로면 정상적으로 이미지를 돌려준다(가드가 정상 인쇄를 막지 않는다)', async () => {
    const now: string | null = 'A';
    const dA = deferred<string>();
    const run = buildQrForVenue('A', () => now, [() => dA.promise]);
    dA.resolve('A-qr');
    await expect(run).resolves.toEqual(['A-qr']);
  });

  it('🔴 ③ 역순 완료 — B 가 먼저 끝나고 A 가 나중에 끝나도 A 는 절대 열리지 않는다', async () => {
    let now: string | null = 'A';
    const dA = deferred<string>();
    const dB = deferred<string>();

    const runA = buildQrForVenue('A', () => now, [() => dA.promise]); // A 인쇄 누름 — 느림
    now = 'B';
    const runB = buildQrForVenue('B', () => now, [() => dB.promise]); // B 로 바꾸고 다시 누름

    dB.resolve('B-qr');  // B 가 **먼저** 끝난다
    dA.resolve('A-qr');  // A 가 **나중에** 끝난다 — 여기서 A 가 새어 나오면 종이에 A QR 이 찍힌다

    const [a, b] = await Promise.all([runA, runB]);
    expect(a, 'A 세대 결과가 살아 나왔다 — B 라벨 밑에 A 의 QR 이 찍힌다').toBeNull();
    expect(b, 'B 에서 새로 누른 인쇄가 막혔다 — 정상 인쇄까지 죽었다').toEqual(['B-qr']);
  });

  it('🔴 ④ 언마운트(=지금 매장 없음)도 A 결과를 버린다', async () => {
    let now: string | null = 'A';
    const dA = deferred<string>();
    const run = buildQrForVenue('A', () => now, [() => dA.promise]);
    now = null;          // 창이 닫혔다 — venueIdRef.current = null
    dA.resolve('A-qr');
    await expect(run).resolves.toBeNull();
  });

  it('🔴 ⑤ 묶음 중 하나라도 늦으면 **묶음 전체**가 한 세대다 — 일부만 살려 보내지 않는다', async () => {
    // 가입 QR(매장 무관)과 매장 QR 을 같이 고른 경우. 종이 한 장에 같이 찍히므로 세대도 하나다.
    let now: string | null = 'A';
    const fast = deferred<string>();
    const slow = deferred<string>();
    const run = buildQrForVenue('A', () => now, [() => fast.promise, () => slow.promise]);
    fast.resolve('signup-qr');   // 매장 무관 QR 은 먼저 끝났다
    now = 'B';
    slow.resolve('A-voucher-qr');
    await expect(run).resolves.toBeNull();
  });

  it('🔴 ⑥ 생성이 실패하면 reject 를 그대로 올린다(가드가 오류를 삼켜 빈 창을 남기지 않게)', async () => {
    const now: string | null = 'A';
    const dA = deferred<string>();
    const run = buildQrForVenue('A', () => now, [() => dA.promise]);
    dA.reject(new Error('QR 생성 실패'));
    await expect(run).rejects.toThrow('QR 생성 실패');
  });

  it('🔴 ⑦ `current` 는 **await 뒤에** 평가된다 — 값으로 받으면 옛 버그가 그대로 재현된다', async () => {
    // 이 시험이 지키는 것은 시그니처다: getter 를 값(string)으로 바꾸면 ①③④⑤ 가 전부 통과해 버린다.
    const calls: string[] = [];
    let now: string | null = 'A';
    const dA = deferred<string>();
    const run = buildQrForVenue('A', () => { calls.push('read'); return now; }, [() => dA.promise]);
    expect(calls, 'await 전에 이미 현재 매장을 읽었다 — 그러면 전환을 못 본다').toEqual([]);
    now = 'B';
    dA.resolve('A-qr');
    await run;
    expect(calls, 'await 뒤에 현재 매장을 한 번 읽어야 한다').toEqual(['read']);
  });
});
