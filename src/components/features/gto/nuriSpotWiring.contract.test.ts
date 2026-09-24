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

// 🔴 2026-09-22 요구 A — 아래 두 블록(F11 에퀴티 세대·재계산 키 / MixBar 의 absent 표기)은
//   **반전됐다.** 오너가 NURI SPOT 을 '작성·저장·공유' 중심으로 바꾸면서 이 화면의
//   10,000회 멀티웨이 에퀴티 배선과 액션 빈도 막대(MixBar)를 통째로 걷어냈기 때문이다.
//
//   ⚠ 계약을 **지우지 않고 뒤집는다.** 지우면 누군가 "성능 개선" 이라며 워커 호출을 되살렸을 때
//     아무도 못 잡는다. 지금 잠글 것은 "그 배선이 이 화면에 없다" 는 사실이다.
//   ⚠ 엔진 자체(`equityClient`·`equityRequest`·워커)와 다른 GTO 도구의 에퀴티는 **그대로 살아 있다.**
//     여기서 보는 것은 `NuriSpotPanel`/`SpotReport` 두 파일뿐이다.
describe('요구 A · 작성 화면에서 에퀴티 배선과 빈도 막대가 빠졌다', () => {
  const REPORT = readFileSync(join(__dirname, 'SpotReport.tsx'), 'utf-8');
  const report = REPORT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('재료가 실제로 있다 — 정규식이 죽어 빈 검사가 되는 것을 막는다', () => {
    expect(code.length, 'NuriSpotPanel 소스를 못 읽었다').toBeGreaterThan(5_000);
    expect(report.length, 'SpotReport 소스를 못 읽었다').toBeGreaterThan(1_000);
    expect(code, '스팟 패널이 아닌 파일을 읽고 있다').toContain('NuriSpotInit');
  });

  it('🔴 작성 화면이 더 이상 에퀴티 워커를 부르지 않는다', () => {
    expect(code, '10,000회 멀티웨이 에퀴티 호출이 되살아났다').not.toContain('equityMultiAsync(');
    expect(code, '2인 전용 에퀴티 호출이 들어왔다').not.toMatch(/\bequityAsync\(/);
    expect(code, '에퀴티 요청 세대 관리(planEquity)가 되살아났다 — 부를 것이 없으면 필요 없다').not.toContain('planEquity(');
    expect(code, 'equityCardsKey 재계산 키가 되살아났다').not.toContain('equityCardsKey(');
  });

  it('🔴 evaluateSpot 은 그대로 돈다 — 저장 스냅샷 스키마 호환(coverage_kind·dataset_version)', () => {
    // 지운 것은 '화면 표시' 이지 '저장 계약' 이 아니다. 이게 빠지면 기존 행·RPC 와 어긋난다.
    expect(code, 'evaluateSpot 호출이 사라졌다 — 저장·공유 스냅샷이 깨진다').toMatch(/evaluateSpot\(spot, \{ heroEquity: null \}\)/);
    // 2026-09-25 SPOT-DATE: saveMySpot 이 playedOn(날짜) 세 번째 인자를 받게 됐다 — evaluation 이 계속
    // 두 번째 인자인 것까지 그대로 잠근다(약화 아님, 새 인자를 인지하도록 강화).
    expect(report, 'saveMySpot 이 evaluation 을 안 받는다').toMatch(/saveMySpot\(spot, evaluation, playedOn\)/);
  });

  it('🔴 작성 화면에 빈도 막대·판정 줄이 없다', () => {
    expect(report, 'MixBar(액션 빈도 막대)가 되살아났다').not.toContain('MixBar');
    expect(report, 'MathBlock(수학 지표)이 되살아났다').not.toContain('MathBlock');
    expect(code, 'VerdictLine(판정 한 줄)이 되살아났다').not.toContain('VerdictLine');
  });

  it('🔴 그 자리에 작성 내용이 실제로 들어갔다 — 전부 지우고 끝낸 것이 아니다', () => {
    expect(report, 'SpotDetails 를 쓰지 않는다 — 작성 내용을 보여 줄 것이 없다').toMatch(/<SpotDetails[^>]*mode="owner"/);
    expect(report, '저장 버튼이 사라졌다').toContain('내 스팟에 저장');
    expect(report, '공유 버튼이 사라졌다').toContain('스팟 토론에 공유');
  });
});


// ── 빌런 B~E (2026-09-19) — 배선 셋 ──────────────────────────────────────────
describe('빌런 B~E 배선', () => {
  it('슬롯 수는 스팟(자리 목록)이 정본이다 — hb.setExtraCount 가 spot.extra.length 를 따라간다', () => {
    // 이게 빠지면 자리 단계에서 상대를 추가해도 카드 단계에 슬롯이 안 생기고, 지우면 유령 슬롯의 카드가 승률에 남는다
    expect(code).toMatch(/if \(extraSlots !== spot\.extra\.length\) setExtraCount\(spot\.extra\.length\);/);
  });

  // 🔴 2026-09-22 요구 A — 'VerdictLine 이 evaluation 을 그대로 읽는가' 계약은 **대상이 사라져**
  //   위 '요구 A' 블록의 반전 계약(판정 줄 되살아남 금지)으로 옮겼다. 여기서 지우기만 하면
  //   되살아났을 때 아무도 못 잡으므로, 금지는 그쪽이 잠근다.

  it('공유 스팟을 읽을 때 가려진 상대는 B~E 카드까지 비운다(이중 방어) — A 만 비우면 B 의 카드가 새어 나간다', () => {
    const api = readFileSync(join(__dirname, '../../../api/spots.ts'), 'utf-8');
    expect(api).toMatch(/if \(!data\.reveal_villain\) \{ spot\.villain = \[\]; spot\.extra = spot\.extra\.map\(\(v\) => \(\{ \.\.\.v, cards: \[\] \}\)\); \}/);
  });
});
