// 15-ⓐ — 공개 화면 상태 배지는 **잰 것만 '진행 중'이라 부른다**.
//
// 왜 계약으로 잠그나: `liveBadge()` 의 마지막 `return` 은 오래 '진행 중' 이었다. 그런데 거기 오는 카드는
// **매칭되는 클락이 없는** 카드다 — 앱이 아는 것은 `scheduleStatus` 가 준 '예정 시작 시각이 지났다' 뿐이고
// 대회가 실제로 돌고 있는지는 모른다(HANDOFF R3-1). 추론을 사실처럼 말하던 자리다.
// 반대로 `regInfo` 가 있는데 `msLeft === null` 인 카드는 **클락이 실제로 매칭돼 있다** — 그건 실측이라 '진행 중' 이 맞다.
// 이 둘이 다시 한 문자열로 합쳐지면 여기서 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { liveBadge } from './ScheduleCard';

// 🔴 2026-09-22 — `RegInfo` 에 필드 현황(생존/엔트리)이 더해졌다(일정 카드가 시각 아래에 적는다).
//   이 스펙이 보는 것은 **배지 문구**뿐이라 필드 값은 배지 판정에 영향이 없어야 한다 — 0 으로 둔다.
//   (값을 넣어도 문구가 바뀌면 그건 결함이다. 그 경계는 아래 배지 단언들이 그대로 지킨다.)
const reg = (msLeft: number | null) => ({ msLeft, running: true, gameSeq: 1, alive: 0, entries: 0, hasField: false });

describe('liveBadge — 실측과 추론을 같은 문구로 부르지 않는다', () => {
  it('클락 실측이 없으면 "진행 중"이라 말하지 않는다', () => {
    const b = liveBadge(undefined);
    expect(b.text).not.toBe('진행 중');
    expect(b.text).toBe('시작 시각 지남');
    // 모르는 것을 반대 방향으로 단정하지도 않는다
    expect(b.closed).toBe(false);
    expect(b.text).not.toMatch(/종료|끝|마감/);
  });

  it('클락이 매칭됐으면(마감 레벨 미설정) "진행 중"은 실측 근거가 있다', () => {
    expect(liveBadge(reg(null)).text).toBe('진행 중');
  });

  it('레지 판정이 있으면 종전 문구를 그대로 쓴다', () => {
    expect(liveBadge(reg(0))).toEqual({ text: '등록 마감', closed: true });
    expect(liveBadge(reg(60_000))).toEqual({ text: '등록 가능', closed: false });
  });
});

// ── 형제 호출부가 다시 갈라지지 않게 잠근다 (리드 추가, 2026-09-21) ─────────────
//
// community-team 이 그리드 카드를 고친 직후, 같은 대회를 **상세 모달은 여전히 '진행 중'** 이라
// 불렀다. 한 화면만 정직해지면 두 화면이 서로 다르게 말하게 되고, 그건 고치기 전보다 나쁘다.
// 판정을 liveBadge() 한 곳으로 모았으니, 모달이 다시 자기 추론을 들고 오면 여기서 빨개진다.
//
// ⚠ 소스 문자열 검사인 이유: 이 저장소엔 컴포넌트 렌더 테스트 인프라가 없다
//   (@testing-library·jsdom 미설치 · vitest environment:'node'). 그래서 '행동' 대신 '배선'을 잠근다.
//   같은 부류의 약한 검사(qrVenueGuard)가 거짓 통과한 적이 있으므로, **무엇이 있으면 실패인지**를
//   함께 단언해 검사가 헛돌지 않게 한다.
describe('상세 모달이 같은 판정을 쓴다', () => {
  const src = readFileSync(new URL('./ScheduleDetailModal.tsx', import.meta.url), 'utf8');

  it('모달이 liveBadge 를 import 해서 쓴다', () => {
    expect(src).toContain("liveBadge } from './ScheduleCard'");
    expect(src).toContain('liveBadge(regInfo)');
  });

  it('모달이 자기 추론으로 "진행 중"을 단정하지 않는다', () => {
    // 종전 코드: `: regInfo && regInfo.msLeft !== null ? '진행 중 · 등록 가능' : '진행 중'`
    // regInfo 가 없을 때 바로 '진행 중' 으로 떨어지는 분기가 있으면 실패다.
    expect(src).not.toMatch(/regInfo && regInfo\.msLeft !== null \? '진행 중/);
    expect(src).not.toMatch(/regInfo && regInfo\.msLeft === 0 \? '진행 중/);
  });

  it('이 검사가 헛돌지 않는다 — 대조 문자열이 실재한다', () => {
    // 파일을 못 읽거나 경로가 틀리면 위 두 단언이 조용히 통과한다. 그걸 막는다.
    expect(src.length).toBeGreaterThan(10_000);
    expect(src).toContain('ScheduleDetailModal');
    expect(src).toContain('badge.text');
  });
});
