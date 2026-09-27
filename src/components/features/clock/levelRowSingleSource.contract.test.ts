// 블라인드 레벨 행(SB·BB·ANTE·시간·삭제)은 한 정본(LiveLevelsEditor 의 LEVEL_ROW·LEVEL_NUM)을 쓴다.
//
// 왜: 8afa1724 가 LiveLevelsEditor 하나만 좁은 폭 2줄 배치 + px-2 로 고쳤고, 같은 행을 따로 그리던
//   클락 설정(TournamentClock ClockSettings)·프리셋 편집기(BlindLevelsEditor)는 그대로 남아 360 에서
//   입력 글자 공간이 14.5px(값 43.6px 필요)였다(design-reviewer 2026-09-28). 같은 결함의 재발이다.
//   레벨 입력칸을 새로 그리는 곳이 생기면 이 목록에 넣고 정본을 쓰게 하라.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const SITES = ['TournamentClock.tsx', 'BlindLevelsEditor.tsx', 'LiveLevelsEditor.tsx'];

describe('블라인드 레벨 행 단일 정본', () => {
  it('LiveLevelsEditor 가 LEVEL_ROW·LEVEL_NUM 을 내보낸다(좁은 폭 2줄 · px-2)', () => {
    const s = read('./LiveLevelsEditor.tsx');
    expect(s).toMatch(/export const LEVEL_NUM = '[^']*\bpx-2\b[^']*'/);
    expect(s).toMatch(/export const LEVEL_ROW = 'grid grid-cols-\[1\.75rem_repeat\(3,minmax\(0,1fr\)\)\][^']*sm:grid-cols-/);
  });
  for (const f of SITES) {
    it(`${f}: SB·BB·ANTE 입력이 정본 클래스를 쓴다`, () => {
      const s = read(`./${f}`);
      // 한 줄 = 입력 하나(onChange 의 `=>` 때문에 `<input[^>]*>` 로는 못 자른다)
      const inputs = s.split(/\r?\n/).filter((l) => /<input\b/.test(l) && /placeholder="(?:SB|BB|ANTE)"/.test(l));
      expect(inputs.length, `${f} 에서 SB/BB/ANTE 입력을 못 찾았다(정규식이 빗나가면 거짓 통과)`).toBe(3);
      for (const t of inputs) expect(t, `${f} 의 레벨 입력이 정본 밖 클래스를 쓴다`).toMatch(/className=\{(?:LEVEL_NUM|NUM)\}/);
      if (f !== 'LiveLevelsEditor.tsx') {
        expect(s).toContain("from './LiveLevelsEditor'");
        expect(s, `${f} 의 레벨 행이 LEVEL_ROW 를 안 쓴다`).toMatch(/className=\{LEVEL_ROW\}/);
        expect(s, `${f} 가 자기 NUM 을 따로 정의한다`).not.toMatch(/const NUM = 'input/);
      }
    });
  }
});
