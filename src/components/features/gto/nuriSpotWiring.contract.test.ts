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
    // 2026-09-19 멀티웨이: 키는 **남아 있는 상대 전원**(liveVillains)의 카드로 만든다. 상대마다 ';' 로 끝맺어
    // 상대 수·누가 빈손인지·누가 폴드로 빠졌는지까지 키가 바뀐다 — 안 그러면 B 를 지워도 옛 승률이 남는다(F11 재발).
    expect(code).toContain("equityCardsKey(hb.ids.hero, live.map((v) => `${v.cards.join('')};`), hb.ids.board)");
    expect(code).toMatch(/const live = useMemo\(\(\) => liveVillains\(spot\), \[spot\]\);/);
    expect(code).not.toContain('canonicalSpotKey');
  });

  it('멀티웨이 엔진을 부르고, 상대 카드가 비어도 계산한다(무작위 핸드) — 2인 전용 equityAsync 로 되돌리지 않는다', () => {
    expect(m![0]).toContain('equityMultiAsync(h, villains, hb.boardCards, 10000)');
    expect(m![0]).not.toContain('hb.villainCards.length === 2');
    expect(code).not.toMatch(/\bequityAsync\(/);
  });
});

describe('🔴 표가 말하지 않는 갈래를 0% 로 그리지 않는다 (2026-09-17)', () => {
  const REPORT = readFileSync(join(__dirname, 'SpotReport.tsx'), 'utf-8');
  const report = REPORT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // 왜 계약으로 잠그나: 엔진(spotEvaluate)이 `absent` 를 만든 이유가 **잔여를 지어내지 않기 위해서**인데,
  //   화면이 그걸 안 읽으면 `mix` 의 0 이 그대로 "0%" 로 나가 같은 거짓말이 복원된다.
  //   실측(Fable 검증 2026-09-17): `CO vs LJ · JJ · 콜` 에서 "정확 일치" 배지 + "콜 0% · 폴드 0%".
  //   3벳 표 23장과 SB 얼리 수비 3장이 전부 이 경로다 — 드문 구석이 아니라 기본 동선이다.
  it('MixBar 가 absent 를 받아 — 로 그린다', () => {
    expect(report, 'MixBar 호출부가 absent 를 안 넘긴다').toMatch(/<MixBar[^>]*absent=\{evaluation\.absent\}/);
    expect(report, 'MixBar 가 absent 를 안 받는다').toMatch(/function MixBar\(\{[^}]*absent[^}]*\}/);
    expect(report, "absent 갈래를 '—' 로 그리는 자리가 없다").toContain("'—'");
  });

  it('aria-label 에도 0% 라고 말하지 않는다 — 스크린리더에게만 거짓말하지 않는다', () => {
    const label = report.match(/aria-label=\{`기준 빈도 — \$\{text\}`\}/);
    expect(label, 'aria-label 형태가 바뀌었다 — 계약을 같이 고쳐라').not.toBeNull();
    expect(report, 'text 가 absent 를 반영하지 않는다').toMatch(/silent\(k\) \? '표에 없음'/);
  });
});

// ── 빌런 B~E (2026-09-19) — 배선 셋 ──────────────────────────────────────────
describe('빌런 B~E 배선', () => {
  it('슬롯 수는 스팟(자리 목록)이 정본이다 — hb.setExtraCount 가 spot.extra.length 를 따라간다', () => {
    // 이게 빠지면 자리 단계에서 상대를 추가해도 카드 단계에 슬롯이 안 생기고, 지우면 유령 슬롯의 카드가 승률에 남는다
    expect(code).toMatch(/if \(extraSlots !== spot\.extra\.length\) setExtraCount\(spot\.extra\.length\);/);
  });

  it('내 선택 아래 판정 줄(VerdictLine)은 evaluation 을 그대로 읽는다 — 다시 계산하지 않는다(정본은 하나)', () => {
    const m = code.match(/function VerdictLine\([\s\S]*?\n\}/);
    expect(m, 'VerdictLine 을 찾지 못했다').not.toBeNull();
    expect(m![0]).not.toContain('evaluateSpot(');
    expect(m![0]).toContain('VERDICT_LABEL[v]');
    // 리포트의 판정 배지와 같은 조건 — 내 선택이 없으면 판정할 것도 없다
    expect(m![0]).toContain('if (spot.heroAction === null) return null;');
  });

  it('공유 스팟을 읽을 때 가려진 상대는 B~E 카드까지 비운다(이중 방어) — A 만 비우면 B 의 카드가 새어 나간다', () => {
    const api = readFileSync(join(__dirname, '../../../api/spots.ts'), 'utf-8');
    expect(api).toMatch(/if \(!data\.reveal_villain\) \{ spot\.villain = \[\]; spot\.extra = spot\.extra\.map\(\(v\) => \(\{ \.\.\.v, cards: \[\] \}\)\); \}/);
  });
});
