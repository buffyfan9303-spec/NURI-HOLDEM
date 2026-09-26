// 접수대 장부 — '가게지원 · 수납 없음' 버튼의 쓰기 실패도 다른 결제수단과 같은 토스트로 처리된다
// (오너 2026-09-26 모바일 디버깅 잔여#1: "쓰기 실패 시 토스트 대신 콘솔 uncaught TypeError").
//
// 조사 결과(2026-09-27): 가게지원 버튼은 완납/미수/직전과 동일 버튼과 **같은 onPick 핸들러**를 쓰고,
// 그 핸들러의 catch 는 이미 REDUCE_NEEDS_PW·CELL_TAKEN·noteServerAmountHint 외 모든 경우를
// `toast.show(e.message, 'error')` 로 잡는다(전용 핸들러가 따로 없다 → 별도 핸들러가 생기면 이 계약이
// 먼저 깨진다). 렌더 테스트가 불가한 저장소라 소스 문자열 계약으로 그 사실을 고정한다.
// 음성 대조: onPick={async 안의 try/catch 를 지우거나 가게지원 버튼이 onPick 이 아닌 다른 콜백을
// 쓰도록 바꾸면 이 테스트가 실패한다.
// 실행: npx vitest run src/components/features/NuriPosLedgerSupportErrorHandling.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'NuriPosLedger.tsx'), 'utf-8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('가게지원 버튼은 다른 결제수단 버튼과 같은 onPick 을 쓴다', () => {
  it('가게지원 버튼 onClick 이 onPick(\'support\', false, discIdx) 다', () => {
    expect(code).toMatch(/<button type="button" disabled=\{busy\} onClick=\{\(\) => onPick\('support', false, discIdx\)\}/);
  });

  it('완납\\/미수 결제수단 버튼도 같은 onPick 을 쓴다(전용 분기가 아니라 공용 핸들러다)', () => {
    expect(code).toMatch(/onClick=\{\(\) => onPick\(m\.key, unpaidMode, discIdx\)\}/);
  });

  it('onPick 의 catch 가 REDUCE_NEEDS_PW\\/CELL_TAKEN\\/서버 힌트 외 모든 오류를 토스트로 보여준다', () => {
    const i = code.indexOf("onPick={async (method, isUnpaid, discountIndex) => {");
    expect(i, 'onPick 정의를 찾지 못했다').toBeGreaterThan(-1);
    // onPickSplit 시작 전까지가 onPick 본문
    const j = code.indexOf('onPickSplit={async', i);
    expect(j).toBeGreaterThan(i);
    const body = code.slice(i, j);
    expect(body).toContain('} catch (e) {');
    expect(body).toMatch(/else toast\.show\(e instanceof Error \? e\.message : '저장 실패', 'error'\);/);
  });
});
