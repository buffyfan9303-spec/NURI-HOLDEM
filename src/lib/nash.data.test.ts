// 푸시·폴드 차트 'BB 선택' 계약 — 데이터가 실제로 가진 깊이만 고르게 하고, 없는 조합은 정직하게 비운다.
// 2026-09-17 오너 지시 4건도 여기서 잠근다: 스택 한 줄(슬라이더) · 토글은 행동 말 · 빅 앤티 고정 · 앤티 설명 제거.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAND_ORDER, NASH_BIG_ANTE, NASH_KS, NASH_STACKS, hasNashRange, isNashQuarantined, nashRange, type NashKind } from './nash.data';
import { makeQuiz } from './preflopQuiz';

describe('nash.data — BB 깊이별 표 존재 계약', () => {
  it('shove·callBB 는 8자리 × 12깊이 × 앤티 온/오프 전부 표가 있고, 값이 전부 0 인 표는 없다', () => {
    // ⚠ **빅 앤티 k≥2 의 2~10BB 는 일부러 뺀다.** 표는 파일에 그대로 있지만 값이 못 미더워
    //   `NASH_ANTE_QUARANTINE` 으로 격리했다(2026-09-17 역전 발견 → 2026-09-19 재산출로 범위 확대).
    //   여기서 예외로 두지 않고 격리를 풀면 "K2o 100% 올인" 이 다시 라이브로 나간다.
    //   격리가 **실제로 걸려 있는지**는 `ranges.test.ts` 의 격리 계약이 따로 잠근다(여기서 되풀이하지 않는다).
    for (const kind of ['shove', 'callBB'] as NashKind[]) for (const ante of [false, true]) for (const k of NASH_KS) for (const s of NASH_STACKS) {
      if (isNashQuarantined(s, ante, k, kind)) continue;   // kind 별 격리 — 지금 살아 있는 kind 전용 목록은 **노앤티 3bb 의 BB 콜 하나뿐**이다
        //   (2026-09-19: 빅앤티 7~9bb 는 NASH_CALLBB_QUARANTINE.ante 에서 빠지고 NASH_ANTE_QUARANTINE 이 통째로 막는다)
      expect(hasNashRange(kind, k, s, ante), `${kind} ante=${ante} k=${k} ${s}bb`).toBe(true);
      expect(nashRange(kind, k, s, ante).some((v) => v > 0), `${kind} ante=${ante} k=${k} ${s}bb 가 전부 0`).toBe(true);
    }
  });

  it('callSB 는 k>=2 에만 있고 k=1(SB 가 셔버 본인)은 없다고 말한다 — 없는 표를 0 으로 꾸며 주지 않는다', () => {
    for (const ante of [false, true]) for (const s of NASH_STACKS) {
      if (isNashQuarantined(s, ante, undefined, 'callSB')) continue; // 격리 구간(빅앤티 k≥2 의 2~10BB) — 위 계약과 같은 이유
      expect(hasNashRange('callSB', 1, s, ante)).toBe(false);
      for (const k of NASH_KS) if (k >= 2) expect(hasNashRange('callSB', k, s, ante), `callSB k=${k} ${s}bb`).toBe(true);
    }
    // 데이터에 없는 깊이(11bb)는 어느 표에서도 '있다'고 하지 않는다 — UI 가 가까운 값으로 몰래 대체할 수 없게
    expect(hasNashRange('shove', 2, 11, false)).toBe(false);
  });
});

describe('PushFoldChart 화면 계약(소스)', () => {
  const src = readFileSync(join(__dirname, '../components/features/tools/PushFoldChart.tsx'), 'utf-8');

  it('표가 없는 조합에서 행렬 대신 "데이터가 없습니다" 를 그린다', () => {
    // 2026-09-21: 5번째 인자 `true` 는 allowApprox(추정 구간 표시 허용)다 — 앤티 리터럴이 아니다(nash.data.ts NASH_ANTE_APPROX).
    expect(src).toMatch(/const hasData = hasNashRange\(effView, k, stack, NASH_BIG_ANTE, true\)/);
    expect(src).toMatch(/\{hasData\s*\?\s*<RangeMatrix13/);
    expect(src).toContain('데이터가 없습니다');
  });

  it('① 스택은 한 줄 슬라이더(44px 트랙) + 실제 깊이 눈금 — 칩 두 줄이 아니다', () => {
    expect(src).toMatch(/<input type="range" min=\{0\} max=\{NASH_STACKS\.length - 1\} step=\{1\} value=\{stackIdx\}/);
    expect(src).toContain('h-[44px] accent-accent-300');
    expect(src).toMatch(/aria-hidden="true">\s*\{NASH_STACKS\.map/);
    expect(src).not.toContain('flex-wrap'); // 두 줄로 접히는 칩 레일 금지
  });

  it('② 알약 라벨은 4글자 이내 + nowrap(줄바꿈 구조적 불가), 뜻은 차트 위 한 줄 문장이 말한다', () => {
    const m = src.match(/const VIEW_LABEL: Record<View, string> = \{ shove: '([^']*)', callBB: '([^']*)', callSB: '([^']*)' \};/);
    expect(m, 'VIEW_LABEL 형태가 바뀌었다').not.toBeNull();
    for (const label of m!.slice(1, 4)) expect(label.length, `알약 라벨 "${label}" 이 4글자를 넘는다 — 375px 에서 두 줄로 쪼개진다(오너 2026-09-17)`).toBeLessThanOrEqual(4);
    expect(src).toContain('className="w-full [&_button]:whitespace-nowrap"');   // 세그먼트 알약 nowrap
    expect(src).toMatch(/flex-1 min-w-0[^\n]*whitespace-nowrap/);            // 스택 눈금 nowrap(min-w-[24px] 는 320px 에서 288>259 로 넘쳤다)
    expect(src).toMatch(/aria-pressed=\{on\} title=\{p\.desc\}[\s\S]{0,200}whitespace-nowrap/); // 자리 버튼 nowrap
    expect(src).toMatch(/data-testid="pushfold-readback">\s*\{pos\.label\} · \{stack\}bb · 빅 앤티 — \{VIEW_SENTENCE\[effView\]\}/);
    expect(src).not.toContain('lightbulb'); // 설명 문단 추가 금지 — 글자 수 최소(오너)
  });

  it('②-2 차트 위 한 줄 문장은 세 갈래 모두 10글자 이내 + nowrap — 알약을 눌러도 높이가 안 변한다', () => {
    // 2026-09-17 실측: '빅블라인드(BB)가 콜할 수 있는 핸드' 는 320px 에서 두 줄(38px), 올인은 한 줄(19px) — 알약마다 판이 튀었다.
    // 고친 뒤 실측: UTG(9인)(가장 긴 자리) × 올인·BB 콜·SB 콜 × 375·320·1280 = 전부 19px 한 줄, 넘침 0.
    const m = src.match(/const VIEW_SENTENCE: Record<View, string> = \{ shove: '([^']*)', callBB: '([^']*)', callSB: '([^']*)' \};/);
    expect(m, 'VIEW_SENTENCE 형태가 바뀌었다').not.toBeNull();
    const [shove, callBB, callSB] = m!.slice(1, 4);
    for (const s of [shove, callBB, callSB]) {
      expect(s.length, `문장 "${s}" 이 10글자를 넘는다 — 320px·UTG(9인) 에서 한 줄(259px)에 안 들어간다`).toBeLessThanOrEqual(10);
      expect(s, `"${s}" — 약어를 다시 풀지 않는다(알약과 같은 말)`).not.toMatch(/블라인드/);
    }
    expect(callBB.length).toBe(callSB.length); // 콜 두 갈래는 글자 수까지 같다
    expect(src).toMatch(/data-testid="pushfold-readback"/);
    expect(src).toMatch(/className="[^"]*whitespace-nowrap[^"]*" data-testid="pushfold-readback"/); // 어떤 조합이든 한 줄 높이
  });

  it('③ 빅 앤티 고정 — 앤티 토글·상태가 없고 데이터는 ante=on 만 읽는다 · ④ "앤티 = …" 설명이 없다', () => {
    expect(NASH_BIG_ANTE).toBe(true);
    expect(src).not.toMatch(/const BIG_ANTE\b/);                        // 화면 안 사본 금지 — 공용 상수만
    expect(src).toMatch(/nashRange\(effView, k, stack, NASH_BIG_ANTE, true\)/);   // 5번째 true = allowApprox(2026-09-21)
    expect(src).not.toMatch(/useState[^\n]*[Aa]nte/);   // const [ante, setAnte] 금지
    expect(src).not.toContain("'없음'");                 // 앤티 '없음' 선택지 금지
    expect(src).not.toContain('앤티 = ');                // 부가설명 제거
    expect(src).toContain('bb · 빅 앤티 — '); // 차트 위 한 줄이 '빅 앤티 기준'을 말한다
  });
});

describe('차트와 드릴은 같은 Nash 표(공용 NASH_BIG_ANTE)를 읽는다', () => {
  const quizSrc = readFileSync(join(__dirname, 'preflopQuiz.ts'), 'utf-8');
  const chartSrc = readFileSync(join(__dirname, '../components/features/tools/PushFoldChart.tsx'), 'utf-8');

  it('두 소스 어디에도 ante 리터럴(true/false)로 nashRange 를 부르는 곳이 없다', () => {
    for (const [name, s] of [['preflopQuiz.ts', quizSrc], ['PushFoldChart.tsx', chartSrc]] as const) {
      // 4번째 인자(ante)가 리터럴이면 안 된다. 5번째 인자(allowApprox, 2026-09-21)는 리터럴 true 가 맞다 — 그래서 4번째 자리만 본다.
      expect(s, `${name} 가 ante 리터럴로 표를 읽는다`).not.toMatch(/nashRange\(\s*[^,()]+,\s*[^,()]+,\s*[^,()]+,\s*(true|false)\s*[,)]/);
      expect(s, `${name} 가 공용 상수를 안 쓴다`).toMatch(/nashRange\([^)]*NASH_BIG_ANTE(, true)?\)/);
    }
  });

  it('드릴이 낸 올인·콜 문제의 정답 빈도는 차트가 그리는 값과 같다(빅 앤티 표)', () => {
    for (let i = 0; i < 30; i++) {
      const q = makeQuiz(i % 2 ? 'push' : 'call');
      const [, situ] = q.key.split('|');
      const parts = situ.split('-');
      const kind = q.mode === 'push' ? 'shove' : parts[0] === 'sb' ? 'callSB' : 'callBB';
      const k = Number(parts[q.mode === 'push' ? 0 : 1]);
      const stack = Number(parts[q.mode === 'push' ? 1 : 2]);
      expect(q.situ, '드릴 화면에 기준이 보여야 한다').toContain('빅 앤티');
      // 드릴은 빈도를 소수 2자리로 반올림해 낸다 — 반올림 오차(≤0.005)만 허용, 표가 다르면 그보다 훨씬 크게 벌어진다
      expect(Math.abs(q.acts[0].freq - nashRange(kind, k, stack, NASH_BIG_ANTE)[HAND_ORDER.indexOf(q.hand)])).toBeLessThanOrEqual(0.005 + 1e-9);
    }
  });
});
