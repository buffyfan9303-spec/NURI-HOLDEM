// src/lib/spotAiLimits.ts — NURI SPOT AI 코칭의 하루 횟수·회당 활동 포인트(오너 2026-10-04: 30P 유지 + 하루 3회).
//
// 화면 안내용 단일 출처다. **강제는 서버가 한다** — 횟수는 _spot_ai_begin(p_limit, 엣지 spot-review 의 DAILY_LIMIT)이,
// 가격은 shop_skus('spot_ai').price 가 정한다. 화면은 가능하면 spot_ai_status() 가 돌려준 값을 쓰고, 이 값은 그 전·바깥
// (GTO 탭 카드 안내·기본값·문구)에서만 쓴다.
// 엣지 함수(Deno)·마이그레이션 SQL 은 이 파일을 import 할 수 없다 — 그 두 곳의 숫자가 여기와 같은지는
// src/api/spotReview.test.ts 의 계약이 잡는다. 바꿀 때는 DB(shop_skus·spot_ai_status 마이그레이션)부터.
// 일부러 의존성 0 — GTO 탭 첫 화면(ToolsPanel)이 이 숫자 때문에 SPOT 모듈을 끌어오지 않게.
export const SPOT_AI_DAILY_LIMIT = 3;
export const SPOT_AI_PRICE = 30;
