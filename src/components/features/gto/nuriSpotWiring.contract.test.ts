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
  // 2026-09-14: 저장 목록에 '게시판에 공유'가 생기면서 진입점이 둘(열기·공유)이 됐다.
  // 그래서 인라인 핸들러를 openSaved 한 곳으로 뽑았고, 계약도 그 모양을 따라간다 —
  // **약화가 아니라 강화**다: 이제 두 진입점이 같은 함수를 지나는 것까지 잠근다.
  // (진입점마다 핸들러를 따로 쓰면 한쪽이 hb.setAll 을 빠뜨려 F10 이 그대로 재발한다.)
  it('openSaved 가 setSpot 과 hb.setAll 을 함께 호출한다', () => {
    const m = code.match(/const openSaved = useCallback\([\s\S]*?\}, \[hb\]\);/);
    expect(m, 'openSaved 를 찾지 못했다').not.toBeNull();
    const body = m![0];
    expect(body).toContain('setSpot(s)');
    // 이게 빠지면 리포트만 B, 카드 그리드는 A 로 남는다(F10).
    expect(body).toContain('hb.setAll(');
  });

  it('열기·공유 두 진입점이 모두 openSaved 를 지난다', () => {
    const m = code.match(/<MySpotList[\s\S]*?\/>/);
    expect(m, 'MySpotList 사용처를 찾지 못했다').not.toBeNull();
    const body = m![0];
    expect(body, 'onOpen 이 openSaved 가 아니다').toMatch(/onOpen=\{openSaved\}/);
    expect(body, 'onShare 가 openSaved 를 지나지 않는다').toContain('openSaved(s)');
  });

  it('저장 목록은 게시 RPC 를 직접 부르지 않는다 — 확인 시트를 우회하는 두 번째 경로 금지', () => {
    const list = readFileSync(join(__dirname, 'MySpotList.tsx'), 'utf-8');
    expect(list, 'MySpotList 가 직접 게시한다(F16 우회)').not.toContain('shareSpotPost');
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
