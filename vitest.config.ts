import { defineConfig } from 'vitest/config';

// 단위 테스트 설정 — 순수 로직(금액 계산 등)만 담당한다.
// e2e/ 는 Playwright 전용이라 반드시 제외해야 한다(vitest가 집으면
// "Playwright Test did not expect test.describe() to be called here" 로 실패).
export default defineConfig({
  test: {
    // api/ 의 Vercel 함수는 순수 JS 라 tsc 밖이다 — 테스트만 여기서 집는다(health 엔드포인트 계약).
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.js'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
    expect: {
      // 🔴 단언이 **0개**인 테스트를 실패로 만든다(2026-09-17 신설).
      //
      //   이 저장소가 반복해서 밟은 '거짓 초록' 중 가장 조용한 부류다 — 테스트는 초록인데
      //   실제로는 아무것도 검사하지 않는다. 켜자마자 **12건**이 나왔다:
      //     · src/lib/tdaSearch.test.ts — 본문이 빈 껍데기(리팩터가 단언만 지우고 제목을 남김, 6일간 초록)
      //     · src/lib/subTabTransition.test.ts — `if (hasPill) return;` 조기 반환으로 11개 스코프가 무단언 통과
      //   둘 다 같은 커밋에서 고쳤다. 이제 같은 모양이 다시 들어오면 **그 자리에서** 빨개진다.
      //
      //   ⚠ 이건 '테스트를 더 쓰라'는 규율이 아니라 **이미 쓴 테스트가 진짜로 검사하는지**를 보는 장치다.
      //     커버리지로는 안 잡힌다 — 코드는 실행되지만 결과를 아무도 안 보는 상태이기 때문이다.
      //   ⚠ 일부러 단언 없이 '터지지만 않으면 통과'를 재고 싶다면 그 테스트 안에서
      //     `expect(() => …).not.toThrow()` 처럼 **의도를 단언으로 적어라**. 조용한 무단언은 허용하지 않는다.
      requireAssertions: true,
    },
  },
});
