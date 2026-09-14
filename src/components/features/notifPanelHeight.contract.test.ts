// 알림 패널 쪽지⇄알림 전환 시 박스 높이 리사이즈 회귀 게이트 (2026-09-14).
//
// 왜: design 실측(2026-09-14, 390px 모바일) — 빈 상태 159.5px, 쪽지 2건 128.5px(!), 알림 3건 240.9px.
//   빈 상태보다 **실제 대화가 있는 쪽이 더 짧은 역전**이 있었고(행 1개 63.75px × 2 < 빈 상태 159.5px),
//   쪽지⇄알림 전환마다 최대 112px 리사이즈가 났다. 처방은 두 목록(`[data-notif-panel]`)에
//   `min-h-[160px]`(빈 상태 실측값과 같다) — 아래는 그 근거.
//   ⚠ 240px 이상으로 올리지 않는다: 그러면 빈 상태(가장 흔한 첫 화면)가 지금보다 커진다(오너 요구
//   "첫 화면을 지금보다 더 먹으면 안 된다"). 이 바닥은 "빈 상태보다 짧아지는 역전"만 없애고,
//   3건 이상의 자연스러운 목록 성장(160px 초과)은 그대로 둔다 — 실측: 2건→160(교정), 3건→193.25(그대로).
//
// 못 보는 것: 실제 렌더 픽셀(브라우저 실측 몫). 이 테스트는 소스의 클래스 계약만 잠근다.
// 음성 대조(2026-09-14 실행 확인): 두 `min-h-[160px]` 중 하나라도 지우면 아래가 빨개진다.
// 실행: npx vitest run src/components/features/notifPanelHeight.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'src', 'components', 'features', 'NotificationPanel.tsx'), 'utf8');

describe('알림 패널(notif-panel) 목록 최소 높이 — 쪽지·알림 두 탭 동일 바닥', () => {
  const ulLines = SRC.split('\n').filter((l) => l.includes('data-notif-panel'));

  it('두 목록(쪽지·알림) 모두 data-notif-panel 을 그린다(전수 확인의 최소 증거)', () => {
    expect(ulLines.length).toBe(2);
  });

  it.each(ulLines)("'%s' 가 min-h-[160px] 를 쓴다", (line) => {
    expect(line, '쪽지·알림 목록에 min-h-[160px] 가 없으면 빈 상태보다 적은 항목(1~2건)이 더 짧아지는 역전이 되살아난다').toContain('min-h-[160px]');
  });

  it('두 목록이 같은 바닥값을 쓴다(하나만 고치면 탭 전환마다 그 차이만큼 다시 튄다)', () => {
    const values = ulLines.map((l) => l.match(/min-h-\[(\d+)px\]/)?.[1]);
    expect(values.every((v) => v != null), `min-h 값을 하나 이상 못 찾았다: ${ulLines.join(' | ')}`).toBe(true);
    expect(new Set(values).size, `쪽지·알림 min-h 값이 서로 다르다: ${values.join(', ')}`).toBe(1);
  });
});
