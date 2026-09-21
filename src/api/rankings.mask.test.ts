// 🔴 2026-09-21 — 실명 마스킹 계약. 뮤테이션 검증에서 이 함수의 분기가 **생존**했다(테스트가 하나도 없었다).
//
// 왜 중요한가: `maskRealName` 은 순위표에 이름을 내보내기 전에 가리는 마지막 관문이다
//   (`rankings.ts:57-58` — 닉네임이 없으면 실명을 마스킹해 내보내고, 실명 공개를 고른 사람은
//   닉네임 쪽을 마스킹한다). `n.length === 2` 를 `!==` 로 뒤집으면:
//     · 두 글자 이름 '나리' → else 분기로 떨어져 `나` + `*`.repeat(0) + `리` = **'나리' (마스킹 해제)**
//     · 세 글자 이름 '홍길동' → `홍*` (과잉 마스킹, 뜻도 틀림)
//   즉 **두 글자 실명이 그대로 공개된다.** 2026-09-15 에 실명 마스킹이 서버 쪽에서 풀려 있던 사고가 있었다.
import { describe, it, expect } from 'vitest';
import { maskRealName } from './rankings';

describe('maskRealName — 길이별 마스킹 규칙', () => {
  it.each([
    ['', ''],                 // 빈 값은 그대로
    ['가', '가'],             // 한 글자는 가릴 수 없다(가리면 정보가 0 이 된다)
    ['나리', '나*'],          // 🔴 두 글자 — 뒤집히면 '나리' 가 그대로 나간다
    ['홍길동', '홍*동'],
    ['남궁민수', '남**수'],
    ['김', '김'],
  ])('%s → %s', (input, want) => {
    expect(maskRealName(input)).toBe(want);
  });

  it('두 글자는 **반드시** 원본과 달라야 한다(마스킹이 풀렸는지 직접 본다)', () => {
    for (const n of ['나리', '민수', 'AB']) {
      const out = maskRealName(n);
      expect(out, `'${n}' 가 그대로 나왔다 — 마스킹이 풀렸다`).not.toBe(n);
      expect(out).toBe(`${n[0]}*`);
    }
  });

  it('앞뒤 공백은 지우고 잰다 — 공백 때문에 길이 분기가 밀리면 안 된다', () => {
    expect(maskRealName('  나리  ')).toBe('나*');
    expect(maskRealName(' 홍길동 ')).toBe('홍*동');
  });

  it('세 글자 이상은 가운데만 별이다(첫·끝 글자는 남는다)', () => {
    const out = maskRealName('남궁민수');
    expect(out.startsWith('남')).toBe(true);
    expect(out.endsWith('수')).toBe(true);
    expect(out.split('*').length - 1, '가운데 별 개수가 길이-2 가 아니다').toBe(2);
  });
});
