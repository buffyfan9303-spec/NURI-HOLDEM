// 공유 본문 빌더 — 미리보기가 **실제로 올라가는 문자열과 같은가**.
//
// 이 파일이 지키는 것은 둘이다:
//  ① buildShareBody 자체의 동작(메모 있음/없음/공백만).
//  ② 그것이 `src/api/spots.ts` 의 비공개 shareBody() 와 **같은 규칙**인가.
//     미리보기는 그 함수를 부를 수 없어(모듈 비공개) 한 벌을 더 두었다 — 두 벌이 어긋나면
//     화면이 거짓말을 하므로, 여기서 원문을 읽어 대조한다.
// 실행: npx vitest run src/components/features/gto/spotShareBody.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptySpot } from '../../../lib/spot';
import { buildShareBody, shareBodyHead, spotWithNote, SHARE_BODY_FALLBACK } from './spotShareBody';

describe('buildShareBody', () => {
  const spot = { ...emptySpot(), heroPos: 'BTN' as const, villainPos: 'BB' as const, effectiveBb: 100 };

  it('메모가 없으면 기본 질문이 붙는다', () => {
    expect(buildShareBody(spot, undefined)).toBe(`BTN vs BB · 100BB · 프리플랍\n\n${SHARE_BODY_FALLBACK}`);
  });

  it('공백만 적은 메모는 없는 것과 같다 — 빈 줄만 올라가지 않는다', () => {
    expect(buildShareBody(spot, '   \n  ')).toBe(buildShareBody(spot, undefined));
  });

  it('메모가 있으면 그것이 본문이 된다 — 앞뒤 공백은 떨어진다', () => {
    expect(buildShareBody(spot, '  3벳이 무서웠다  ')).toBe(`${shareBodyHead(spot)}\n\n3벳이 무서웠다`);
  });

  it('spotWithNote 가 메모를 갈아끼운다 — 비우면 스냅샷에서도 빠진다', () => {
    expect(spotWithNote({ ...spot, note: '혼잣말' }, '').note).toBe('');
    expect(spotWithNote({ ...spot, note: '혼잣말' }, ' 고친 메모 ').note).toBe('고친 메모');
  });
});

// ── 원문 대조 ────────────────────────────────────────────────────────────────
// 정규식은 "문장이 있는가" 만 본다. 그래서 **shareBody 함수 본문만** 잘라 내
// 그 안에서 위치·개수까지 확인한다(이웃 함수의 같은 문장을 줍지 않게).
describe('src/api/spots.ts 의 shareBody 와 같은 규칙인가', () => {
  const API = readFileSync(join(__dirname, '../../../api/spots.ts'), 'utf-8');
  const m = API.match(/function shareBody\(spot: SpotReview\): string \{[\s\S]*?\n\}/);

  it('앵커가 1회만 맞는다', () => {
    expect(m, 'spots.ts 에서 shareBody 를 찾지 못했다 — 이름이 바뀌었으면 미리보기도 같이 봐야 한다').not.toBeNull();
    expect(API.match(/function shareBody\(/g)).toHaveLength(1);
  });

  it('첫 줄 템플릿이 글자 하나까지 같다', () => {
    const head = '`${spot.heroPos} vs ${spot.villainPos} · ${spot.effectiveBb}BB · '
      + "${spot.street === 'preflop' ? '프리플랍' : spot.street}`";
    const MINE = readFileSync(join(__dirname, 'spotShareBody.ts'), 'utf-8');
    expect(m![0], 'spots.ts 의 본문 첫 줄이 바뀌었다 — spotShareBody.ts 도 같이 고쳐라').toContain(head);
    expect(MINE, '미리보기의 첫 줄이 실제 본문과 다르다').toContain(head);
    expect(m![0].split(head)).toHaveLength(2);   // 1회만
  });

  it('메모 유무 분기와 기본 질문이 같다', () => {
    expect(m![0]).toContain('spot.note?.trim() ?');
    expect(m![0], '기본 질문 문구가 바뀌었다 — SHARE_BODY_FALLBACK 도 같이 고쳐라').toContain(SHARE_BODY_FALLBACK);
    expect(m![0].split(SHARE_BODY_FALLBACK)).toHaveLength(2);
  });
});
