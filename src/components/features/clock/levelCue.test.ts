// M07 — 레벨 경계 1회 빛(levelCue.ts) 계약.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { levelCueKey, shouldPlayLevelCue, LEVEL_CUE_BOOT_MS } from './levelCue';

const A = 'venue-a';
const later = LEVEL_CUE_BOOT_MS + 1;

describe('shouldPlayLevelCue', () => {
  it('같은 게임에서 레벨 인덱스가 바뀌면 한 번 켠다', () => {
    expect(shouldPlayLevelCue(levelCueKey(A, 1, 3), levelCueKey(A, 1, 4), later, false)).toBe(true);
    expect(shouldPlayLevelCue(levelCueKey(A, 1, 4), levelCueKey(A, 1, 3), later, false)).toBe(true); // 되돌리기도 레벨 변경
  });
  it('같은 키(매초 틱 리렌더)에서는 켜지 않는다 — 매초 펄스 금지', () => {
    expect(shouldPlayLevelCue(levelCueKey(A, 1, 3), levelCueKey(A, 1, 3), later, false)).toBe(false);
  });
  it('prefers-reduced-motion 이면 0', () => {
    expect(shouldPlayLevelCue(levelCueKey(A, 1, 3), levelCueKey(A, 1, 4), later, true)).toBe(false);
  });
  it('게임·매장 전환은 레벨이 넘어간 것이 아니다', () => {
    expect(shouldPlayLevelCue(levelCueKey(A, 1, 3), levelCueKey(A, 2, 4), later, false)).toBe(false);
    expect(shouldPlayLevelCue(levelCueKey(A, 1, 3), levelCueKey('venue-b', 1, 4), later, false)).toBe(false);
  });
  it('부팅 직후 첫 상태 수신(빈 상태 → 실제 레벨)은 재생하지 않는다', () => {
    expect(shouldPlayLevelCue(levelCueKey(A, 1, 0), levelCueKey(A, 1, 7), LEVEL_CUE_BOOT_MS - 1, false)).toBe(false);
  });
});

describe('ClockStage 배선', () => {
  const src = readFileSync(new URL('./ClockStage.tsx', import.meta.url), 'utf8');
  const cue = readFileSync(new URL('./levelCue.ts', import.meta.url), 'utf8');
  it('LEVEL 줄과 CURRENT 블라인드가 같은 키(같은 실효 레벨)로 빛을 받는다', () => {
    const uses = src.match(/useLevelCue<HTMLSpanElement>\(levelCueKey\(g\.venueId, g\.gameSeq, eff\.index\)\)/g) ?? [];
    expect(uses.length).toBe(2);
  });
  it('빛 판은 글자 상자 안(inset-0)·평소 opacity 0 — 레이아웃 불변', () => {
    const spans = src.match(/<span ref=\{cue\}[^>]*\/>/g) ?? [];
    expect(spans.length).toBe(2);
    for (const s of spans) {
      expect(s).toContain('className={CUE_CLS}');
      expect(s).toContain('aria-hidden');
    }
    const cls = src.match(/const CUE_CLS = '([^']*)'/)?.[1] ?? '';
    expect(cls).toContain('absolute inset-0');
    expect(cls).toContain('opacity-0');
    expect(cls).toContain('pointer-events-none');
  });
  it('WAAPI 는 opacity 만 움직이고 반복하지 않는다', () => {
    const kf = cue.slice(cue.indexOf('el.animate('), cue.indexOf('anim.current = a;'));
    expect(kf).toMatch(/opacity/);
    expect(kf).not.toMatch(/transform|scale|filter|iterations/);
  });
});
