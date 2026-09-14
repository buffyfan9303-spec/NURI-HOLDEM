// 오너 #5 (2026-09-15) — "프로필 카드 프레임 보면 이름과 마크가 겹쳐 있다."
//
// ── 무엇이 겹쳤나 (Chromium 실측, `900 64px Arial`) ──────────────────────────
//   마크(스페이드) 아래끝 454.0 · 한글 닉네임 글자 위 436.8  → **17.2px 겹침**
//   라틴 'A' 도 446.8 → 7.2px 겹침. 짧은 이름이든 긴 이름이든 항상 겹쳤다.
//   원인은 두 좌표가 **서로를 모르는 매직 넘버**였던 것이다:
//     스페이드 `sy = H*0.30, s = 1.9` (= 150.0 ~ 454.0) ↔ 이름 `baseline = H*0.56` (= 492.8)
//
// ── 지금 배치 (오너가 시안 C 를 고른 뒤 · 2026-09-15) ────────────────────────
//   카드가 **상장(인증서)** 이 되면서 마크는 오른쪽 아래 **원형 인장**으로 내려갔다
//   (이름 baseline 300 · 인장 위끝 638). 세로로도 가로로도 떨어져 있어 겹칠 여지가 없다.
//   그래도 계약을 남기는 이유: 다음 리디자인이 마크를 다시 이름 쪽으로 올릴 수 있기 때문이다.
//   같은 파일에서 함께 고친 것 — 닉네임은 20자까지 허용되는데(AuthModal maxLength=20)
//   64px 로는 20자 = 1,280px 라 640px 카드를 통째로 뚫었다. 이제 폭에 맞춰 줄인다.
//
// 왜 캔버스가 아니라 이 모양인가: vitest 환경이 node 라 canvas 2D 가 없다.
//   그래서 겹침을 만드는 **기하 계산만** 순수 함수로 빼내 여기서 잰다. 실제 그림·대비는
//   scratchpad 하네스(Chromium + 실제 profileCard.ts 번들)로 떴다.
//
// ── 음성 대조 (해당 줄만 손으로 되돌렸다가 즉시 복원 — `git stash`·`checkout` 금지) ──
//   2026-09-15 실측. 네 개 전부 **실제로 빨개지는 것을 확인**했다:
//     · CARD_SPADE_GAP 24 → 0            → '간격' 1건 실패
//     · CARD_SPADE_TOP 638 → 300 (인장을 이름 자리로) → 2건 실패
//     · CARD_NICK_BASE 300 → 620 (이름을 인장 자리로) → 1건 실패
//     · fitNickSize 의 while 삭제        → 2건 실패
//   ⚠ 처음 판은 **죽은 계약이었다**: 인장이 멀리 내려간 뒤로는 CARD_SPADE_GAP 을 0 으로 내려도
//     `gap >= 0` 이 참이라 그냥 통과했다. 그래서 간격 **하한 자체**(>= 24)와 **실제 간격 수치**를
//     따로 못 박았다. "고쳤더니 초록" 은 검사가 살아 있다는 증거가 아니다.
//
// 실행: npx vitest run src/lib/profileCardOverlap.test.ts
import { describe, it, expect } from 'vitest';
import {
  CARD_NICK_BASE, CARD_SPADE_TOP, CARD_SPADE_GAP, CARD_NICK_DESCENT_RATIO,
  CARD_NICK_MAX_W, CARD_NICK_MIN_SIZE, CARD_SEAL_R,
  nickBottomFor, spadeTopFor, fitNickSize, frameOf,
} from './profileCard';

/** Chromium 실측값: `900 64px Arial` 의 한글 actualBoundingBoxAscent = 56.0, 라틴 대문자 = 46.0 */
const ASCENT_HANGUL_AT_64 = 56.0;
const ASCENT_LATIN_AT_64 = 46.0;

describe('오너 #5 · 이름과 마크가 겹치지 않는다', () => {
  it('🔴 마크(인장)는 이름 글자 아래로 CARD_SPADE_GAP 이상 떨어져 있다', () => {
    // ⚠ 간격 **하한 자체**를 먼저 잠근다. 이게 없으면 CARD_SPADE_GAP 을 0 으로 내리는 것만으로
    //   아래 검사가 통째로 무의미해진다(2026-09-15 음성 대조에서 실제로 초록이었다 — 죽은 계약이었다).
    expect(CARD_SPADE_GAP, '간격 하한을 낮춰 계약을 무력화하지 마라').toBeGreaterThanOrEqual(24);
    for (const size of [64, 50, 36, CARD_NICK_MIN_SIZE]) {
      const gap = spadeTopFor() - nickBottomFor(size);
      expect(gap, `${size}px 이름과 인장의 세로 간격`).toBeGreaterThanOrEqual(CARD_SPADE_GAP);
    }
    // 지금의 실제 간격을 수치로 박아 둔다 — 이름이나 인장을 옮기면 여기가 먼저 터진다.
    expect(+(spadeTopFor() - nickBottomFor(64)).toFixed(2)).toBe(331.98);
  });

  it('🔴 실측 ascent 로 재도 파고들지 않는다 — 종전 배치는 여기서 17.2px 겹쳤다', () => {
    // 종전(다크 카드): 마크 아래끝 454.0 vs 한글 글자 위 436.8 → −17.2px.
    // 인증서 배치에서는 마크가 이름 **아래**로 내려갔으므로 부호가 반대여야 한다.
    expect(spadeTopFor()).toBeGreaterThan(CARD_NICK_BASE + 0);
    expect(spadeTopFor()).toBeGreaterThan(CARD_NICK_BASE - ASCENT_HANGUL_AT_64);
    expect(spadeTopFor()).toBeGreaterThan(CARD_NICK_BASE - ASCENT_LATIN_AT_64);
  });

  it('🔴 인장은 이름과 **가로로도** 떨어져 있다 — 세로만 보면 리디자인에서 다시 겹친다', () => {
    // 인장 중심 x = W-158, 반지름 CARD_SEAL_R. 이름은 카드 가로 중앙 정렬이고 폭 상한이 CARD_NICK_MAX_W.
    const sealLeft = (640 - 158) - CARD_SEAL_R;
    const nickRight = 320 + CARD_NICK_MAX_W / 2;
    // 세로가 이미 갈려 있으므로 가로가 겹쳐도 그림은 깨지지 않는다. 다만 둘이 **같은 띠**에 놓이면
    // 그때는 이 값이 유일한 방어라, 지금 값을 기록해 두고 움직이면 사람이 보게 한다.
    expect(sealLeft).toBe(420);
    expect(nickRight).toBe(592);
  });

  it('🔴 인장이 카드 안에 있다(겹침을 피하려다 테두리 밖으로 밀지 않았다)', () => {
    const ox = 640 - 158, oy = CARD_SPADE_TOP + CARD_SEAL_R;
    expect(ox - CARD_SEAL_R).toBeGreaterThan(34);        // 이중 괘선(34) 안쪽
    expect(ox + CARD_SEAL_R).toBeLessThan(640 - 34);
    expect(oy + CARD_SEAL_R).toBeLessThan(880 - 34);
    expect(CARD_NICK_DESCENT_RATIO).toBeGreaterThan(0);  // descent 를 0 으로 두면 위 간격 검사가 무의미해진다
  });
});

describe('오너 #5 · 같은 자리에서 고친 긴 닉네임 넘침', () => {
  /** 한글은 `900 <size>px Arial` 에서 글자당 폭이 거의 정확히 size 다(실측: 64px × 6자 = 384.0) */
  const hangul = (chars: number) => (size: number) => chars * size;

  it('🔴 20자(최대 길이) 닉네임이 카드 폭을 뚫지 않는다 — 종전 64px 는 1,280px 였다', () => {
    expect(20 * 64, '고치기 전의 폭').toBeGreaterThan(CARD_NICK_MAX_W);
    const size = fitNickSize(hangul(20));
    expect(size * 20).toBeLessThanOrEqual(CARD_NICK_MAX_W);
    expect(size).toBeGreaterThanOrEqual(CARD_NICK_MIN_SIZE);
  });

  it('🔴 짧은 이름은 64px 그대로다 — 안 넘치는 카드의 그림이 바뀌면 그건 회귀다', () => {
    expect(fitNickSize(hangul(3))).toBe(64);
    expect(fitNickSize(hangul(6))).toBe(64);
    // 8자(512px)까지가 64px 로 들어가는 한계다(9자 576px > 544).
    expect(fitNickSize(hangul(8))).toBe(64);
    expect(fitNickSize(hangul(9))).toBeLessThan(64);
  });
});

describe('회귀 방지 — 프레임 선택은 종전 계약 그대로', () => {
  it('🔴 모르는 키·null 은 기본 프레임으로 떨어진다(카드가 비거나 터지지 않는다)', () => {
    expect(frameOf('frame_neon')).toBe('frame_neon');
    expect(frameOf('frame_없는것')).toBe('frame_gold');
    expect(frameOf(null)).toBe('frame_gold');
  });
});
