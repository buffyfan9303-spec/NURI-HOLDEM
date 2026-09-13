// NURI SPOT 배선 계약 — F10('다시 열기'가 카드 그리드를 갈아끼운다) · F11(세대·재계산 키).
//
// 왜 소스 계약인가: vitest 환경이 `node` 라 NuriSpotPanel 을 렌더할 수 없다(auth·toast·워커까지 붙는다).
//   판정 자체는 equityRequest.test.ts · useHandBoard.test.ts 가 순수 함수로 잠갔고,
//   **그 판정이 실제로 화면에 배선돼 있는지**만 여기서 본다
//   (clock/gameSwitchContract.test.ts · remoteContract.test.ts 와 같은 결).
// 실행: npx vitest run src/components/features/gto/nuriSpotWiring.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'NuriSpotPanel.tsx'), 'utf-8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('F10 · 저장 스팟 다시 열기가 spot 과 hb 를 같은 커밋에서 바꾼다', () => {
  it('MySpotList onOpen 이 setSpot 과 hb.setAll 을 함께 호출한다', () => {
    const m = code.match(/<MySpotList onOpen=\{[\s\S]*?\}\}\s*\/>/);
    expect(m, 'MySpotList onOpen 핸들러를 찾지 못했다').not.toBeNull();
    const body = m![0];
    expect(body).toContain('setSpot(s)');
    // 이게 빠지면 리포트만 B, 카드 그리드는 A 로 남는다(F10).
    expect(body).toContain('hb.setAll(');
  });

  it('useHandBoard 가 setAll 을 노출한다', () => {
    const hook = readFileSync(join(__dirname, 'useHandBoard.ts'), 'utf-8');
    expect(hook).toMatch(/setAll:\s*\(next\?: HandBoardInit\) => void;/);
    expect(hook).toMatch(/return \{[^}]*\bsetAll\b[^}]*\};/);
  });
});

describe('F11 · 에퀴티 이펙트의 세대와 재계산 키', () => {
  const m = code.match(/const canCalc = [\s\S]*?\}, \[cardsKey, blocked\]\);/);

  it('이펙트 본문을 찾을 수 있다(앵커가 1회만 맞는다)', () => {
    expect(m, '에퀴티 이펙트 본문을 찾지 못했다').not.toBeNull();
    expect(code.match(/\}, \[cardsKey, blocked\]\);/g)).toHaveLength(1);
  });

  it('세대 증가가 무효 조기 반환보다 먼저다 — 무효 전환도 in-flight 요청을 끊는다', () => {
    const body = m![0];
    const bump = body.indexOf('reqId.current = plan.gen');
    const bail = body.indexOf("plan.kind === 'clear'");
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bail).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThan(bail);
  });

  it('응답 반영은 canApplyEquity 가드를 통과해야 한다', () => {
    expect(m![0]).toMatch(/if \(!canApplyEquity\(my, reqId\.current\)\) return;[\s\S]{0,80}setEquity\(/);
  });

  it('재계산 키가 빌런 카드를 포함한다 — canonicalSpotKey 는 빌런을 빼므로 쓰지 않는다', () => {
    expect(code).toContain('equityCardsKey(hb.ids.hero, hb.ids.villain, hb.ids.board)');
    expect(code).not.toContain('canonicalSpotKey');
  });
});
