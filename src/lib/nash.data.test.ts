// 푸시·폴드 차트 'BB 선택' 계약 — 데이터가 실제로 가진 깊이만 고르게 하고, 없는 조합은 정직하게 비운다.
// 2026-09-17 오너 지시 4건도 여기서 잠근다: 스택 한 줄(슬라이더) · 토글은 행동 말 · 빅 앤티 고정 · 앤티 설명 제거.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HAND_ORDER, NASH_BIG_ANTE, NASH_KS, NASH_STACKS, hasNashRange, nashRange, type NashKind } from './nash.data';
import { makeQuiz } from './preflopQuiz';

describe('nash.data — BB 깊이별 표 존재 계약', () => {
  it('shove·callBB 는 8자리 × 12깊이 × 앤티 온/오프 전부 표가 있고, 값이 전부 0 인 표는 없다', () => {
    for (const kind of ['shove', 'callBB'] as NashKind[]) for (const ante of [false, true]) for (const k of NASH_KS) for (const s of NASH_STACKS) {
      expect(hasNashRange(kind, k, s, ante), `${kind} ante=${ante} k=${k} ${s}bb`).toBe(true);
      expect(nashRange(kind, k, s, ante).some((v) => v > 0), `${kind} ante=${ante} k=${k} ${s}bb 가 전부 0`).toBe(true);
    }
  });

  it('callSB 는 k>=2 에만 있고 k=1(SB 가 셔버 본인)은 없다고 말한다 — 없는 표를 0 으로 꾸며 주지 않는다', () => {
    for (const ante of [false, true]) for (const s of NASH_STACKS) {
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
    expect(src).toMatch(/const hasData = hasNashRange\(effView, k, stack, NASH_BIG_ANTE\)/);
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
    expect(src).toContain("callBB: '빅블라인드(BB)가 콜할 수 있는 핸드', callSB: '스몰블라인드(SB)가 콜할 수 있는 핸드'"); // 약어는 문장이 푼다
    expect(src).toMatch(/data-testid="pushfold-readback">\s*\{pos\.label\} · \{stack\}bb · 빅 앤티 — \{VIEW_SENTENCE\[effView\]\}/);
    expect(src).not.toContain('lightbulb'); // 설명 문단 추가 금지 — 글자 수 최소(오너)
  });

  it('③ 빅 앤티 고정 — 앤티 토글·상태가 없고 데이터는 ante=on 만 읽는다 · ④ "앤티 = …" 설명이 없다', () => {
    expect(NASH_BIG_ANTE).toBe(true);
    expect(src).not.toMatch(/const BIG_ANTE\b/);                        // 화면 안 사본 금지 — 공용 상수만
    expect(src).toMatch(/nashRange\(effView, k, stack, NASH_BIG_ANTE\)/);
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
      expect(s, `${name} 가 ante 리터럴로 표를 읽는다`).not.toMatch(/nashRange\([^)]*,\s*(true|false)\s*\)/);
      expect(s, `${name} 가 공용 상수를 안 쓴다`).toMatch(/nashRange\([^)]*NASH_BIG_ANTE\)/);
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
