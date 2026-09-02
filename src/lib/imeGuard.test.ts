// 한글 조합(IME) 중의 Enter 를 '제출'로 오인하지 않는다 — 계약을 순수 함수로 고정.
//
// 왜 이 테스트가 필요한가: 이 결함은 **영문으로 테스트하면 절대 재현되지 않는다**.
//   한글 입력기는 조합 중(예: '이용ㄱ') Enter 로 조합을 확정하는데, 브라우저는 그 확정용 Enter 도
//   keydown 으로 key='Enter' 를 그대로 던진다. 그래서 `if (e.key === 'Enter') submit()` 는
//   덜 친 값으로 한 번 실행되고, 사용자가 진짜 제출하려고 Enter 를 또 누르면 두 번째로 실행된다.
//   실제 피해: 장부 명단에 이름이 두 번 들어가고, 이용권 발급 화면에서는
//   화살표로 고르지도 않은 후보에게 이용권이 나갔다.
//
// 핸들러 자체는 컴포넌트 안에 있어 직접 부르기 어렵다 —
// 대신 '어떤 keydown 을 제출로 볼 것인가'라는 판정만 떼어내 여기서 못 박는다.
import { describe, it, expect } from 'vitest';

/** 컴포넌트들이 실제로 쓰는 판정과 동일한 규칙(가드 한 줄 + Enter 검사) */
function isSubmitKey(e: { key: string; nativeEvent: { isComposing: boolean } }): boolean {
  if (e.nativeEvent.isComposing) return false;
  return e.key === 'Enter';
}

const ev = (key: string, isComposing = false) => ({ key, nativeEvent: { isComposing } });

describe('IME 조합 가드', () => {
  it('🔴 조합 중 Enter 는 제출이 아니다. 이게 없어서 이름이 두 번 들어갔다', () => {
    expect(isSubmitKey(ev('Enter', true))).toBe(false);
  });

  it('조합이 끝난 뒤의 Enter 는 제출이다', () => {
    expect(isSubmitKey(ev('Enter', false))).toBe(true);
  });

  it('영문 입력은 조합 단계가 없어 항상 통과한다(그래서 영문 테스트로는 결함이 안 잡힌다)', () => {
    expect(isSubmitKey(ev('Enter'))).toBe(true);
  });

  it('Enter 가 아닌 키는 조합 여부와 무관하게 제출이 아니다', () => {
    for (const k of ['a', 'ㄱ', 'ArrowDown', 'Escape', ' ']) {
      expect(isSubmitKey(ev(k, true)), k).toBe(false);
      expect(isSubmitKey(ev(k, false)), k).toBe(false);
    }
  });

  it('한글 한 글자를 완성하는 전형적 흐름에서 제출은 정확히 1회', () => {
    // '누리' 입력 → 조합확정 Enter(무시) → 실제 제출 Enter(1회)
    const seq = [ev('ㄴ', true), ev('ㅜ', true), ev('Enter', true), ev('Enter', false)];
    expect(seq.filter(isSubmitKey)).toHaveLength(1);
  });
});
