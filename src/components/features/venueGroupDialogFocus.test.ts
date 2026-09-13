// U06(2026-09-12) — 매장/그룹 상세 오버레이 focus·접근성 계약.
//
// design-reviewer 실측(390 dark, 로티아레나 진입):
//  ① VenuePage·GroupPage 모두 `.focus()` 가 0곳 — role="dialog" 는 있어도 focus 가 안 들어간다.
//  ② GroupPage 는 role="dialog"·aria-modal 자체가 없다(VenuePage 와 계약이 다르다).
//  ③ 배경 focusable 28개가 탭 순서에 그대로 남는다 — Modal.tsx 의 트랩을 공유해야 한다.
//
// 렌더 트리 테스트로 잡기 어렵다(카카오맵 SDK·auth·community API 를 다 채워야 한다) —
// clock/remoteContract.test.ts 와 같은 소스 계약 방식으로 잠근다.
// 실행: npx vitest run src/components/features/venueGroupDialogFocus.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const venueSrc = readFileSync(join(__dirname, 'VenuePage.tsx'), 'utf-8');
const groupSrc = readFileSync(join(__dirname, 'GroupPage.tsx'), 'utf-8');
const hookSrc = readFileSync(join(__dirname, '..', 'atoms', 'useDialogFocus.ts'), 'utf-8');
const modalSrc = readFileSync(join(__dirname, '..', 'atoms', 'Modal.tsx'), 'utf-8');

describe('U06 · VenuePage·GroupPage 는 Modal 과 같은 focus 계약을 공유한다(새로 만들지 않는다)', () => {
  it('둘 다 atoms/useDialogFocus 를 import 해서 쓴다', () => {
    expect(venueSrc).toMatch(/import\s*\{\s*useDialogFocus\s*\}\s*from\s*'\.\.\/atoms\/useDialogFocus'/);
    expect(groupSrc).toMatch(/import\s*\{\s*useDialogFocus\s*\}\s*from\s*'\.\.\/atoms\/useDialogFocus'/);
  });

  it('둘 다 useDialogFocus(...) 를 실제로 호출한다(호출 없이 import 만 하면 계약이 죽는다)', () => {
    expect(venueSrc).toMatch(/useDialogFocus\(/);
    expect(groupSrc).toMatch(/useDialogFocus\(/);
  });

  it('Modal.tsx 는 자체 포커스 트랩 로직을 다시 구현하지 않고 같은 훅을 쓴다(로직 이원화 금지)', () => {
    expect(modalSrc).toMatch(/useDialogFocus\(/);
    // 예전엔 여기 모듈 스코프 스택이 있었다 — 지금은 useDialogFocus.ts 로 옮겨졌다.
    expect(modalSrc).not.toMatch(/const openModals: HTMLElement\[\] = \[\];/);
  });

  it('공유 훅에 열기 직전 포커스 기억 → 복원 계약이 있다(ESC 가 focus 를 BODY 로 흘리던 결함)', () => {
    expect(hookSrc).toMatch(/const opener = document\.activeElement/);
    expect(hookSrc).toMatch(/opener[^\n]*\)\.focus\(|opener\.focus\(/);
  });

  // 2026-09-12 실측(E2E): 딥링크(`/?v=<id>`)로 바로 열면 **opener 가 BODY** 라
  // `body.focus()` 가 아무 일도 하지 않아 닫은 뒤 포커스가 허공에 남았다.
  // 돌려보낼 곳이 없으면 **뒤에 남는 화면의 첫 조작 요소**로 보낸다.
  it('🔴 opener 가 BODY 면 되돌리지 않고 뒤 화면의 첫 조작 요소로 보낸다', () => {
    expect(hookSrc).toMatch(/opener !== document\.body/);
    expect(hookSrc, '되돌릴 곳이 없을 때의 대체 경로가 없다').toMatch(/next\?\.focus\(/);
  });

  it('공유 훅에 Tab 트랩(keydown) + 새는 포커스 되잡기(focusin) 가 둘 다 있다', () => {
    expect(hookSrc).toMatch(/addEventListener\('keydown', onKey\)/);
    expect(hookSrc).toMatch(/addEventListener\('focusin', onFocusIn\)/);
  });

  // focusin 만으로는 **BODY 로 떨어지는 경로**를 못 잡는다 — BODY 는 포커스 대상이 아니라
  // 포커스가 그리로 흘러내릴 때 아무 이벤트도 오지 않는다(위 다이얼로그가 닫히거나 요소가 제거될 때).
  it('🔴 focusout 으로 BODY 로 떨어진 포커스도 되잡는다', () => {
    expect(hookSrc, 'focusout 가드가 없어 BODY 낙하를 못 잡는다').toMatch(/addEventListener\('focusout', onFocusOut\)/);
    expect(hookSrc).toMatch(/a !== document\.body/);
  });

  it('공유 훅은 "맨 위 다이얼로그만" 되잡는다(부모 위 자식 모달의 포커스를 뺏지 않는다)', () => {
    expect(hookSrc).toMatch(/isTop\(\)/);
  });
});

describe('U06 · GroupPage 는 VenuePage 와 같은 dialog 계약을 쓴다(3번 결함: role·aria-modal 부재)', () => {
  it('GroupPage 루트에 role="dialog" 와 aria-modal="true" 가 있다', () => {
    expect(groupSrc).toMatch(/role="dialog"/);
    expect(groupSrc).toMatch(/aria-modal="true"/);
  });

  it('VenuePage 루트에도 role="dialog" 와 aria-modal="true" 가 있다(계약 대칭 확인)', () => {
    expect(venueSrc).toMatch(/role="dialog"/);
    expect(venueSrc).toMatch(/aria-modal="true"/);
  });
});

describe('U06 부록 · 다크 모드 대비(accent-300 on surface-base = 3.33:1, AA 미달)', () => {
  it('VenuePage 안에는 실제 text-accent-300 사용이 없다(주석 언급은 허용)', () => {
    const withoutComments = venueSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/text-accent-300/);
  });

  it('GroupPage 안에는 실제 text-accent-300 사용이 없다(주석 언급은 허용)', () => {
    const withoutComments = groupSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/text-accent-300/);
  });
});
