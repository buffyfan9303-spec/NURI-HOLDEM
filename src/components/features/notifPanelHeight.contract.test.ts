// 알림 패널 본문 높이 계약 — 쪽지⇄알림·전체⇄안 읽음 전환에 카드 높이가 바뀌지 않는다.
//
// 이력: 2026-09-14 — 쪽지 2건이 빈 상태보다 짧아지는 역전을 두 목록 min-h-[160px] 로 막았다(빈 상태 실측 159.5px).
//   그래도 목록 길이만큼 카드가 자라서 탭을 옮길 때마다 카드가 커졌다 줄었다(2026-10-02 390 실측 679↔254px), 그 위에서
//   떠나는 목록 복제본이 카드 밖으로 425px 늘어진 채 걷혔다 — 오너 "쪽지함과 알림을 왔다갔다하면 드르륵 내려가는 모션".
// 오너 결정(2026-10-02): "목록을 길게 남기지 말고 줄여라. 스크롤해서 내려 보게 하고 한 번에 10개 정도."
//   → 본문 그릇([data-notif-body]) 하나가 두 탭의 높이를 정한다: max(160px, 쪽지 행수×행높이, 알림 전체 행수×행높이),
//     상한 약 10행(NOTIF_BODY_MAX), 화면이 낮으면 카드 max-h. 같은 식이라 탭을 옮겨도 높이가 같다.
//   빈 화면 바닥 160px 은 그대로다(오너 "첫 화면을 지금보다 더 먹으면 안 된다" — 빈 상태는 종전과 같다).
// 동작(프레임 실측)은 e2e/notif-revisit-motion.spec.ts 가 잰다. 이 테스트는 소스 계약만 잠근다.
// 음성 대조: 그릇 식에서 threads.length 를 빼거나(알림 탭 기준만) 목록에 min-h-0/overscroll-contain 을 빼면 빨개진다.
// 실행: npx vitest run src/components/features/notifPanelHeight.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'src', 'components', 'features', 'NotificationPanel.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('알림 패널 본문 — 두 탭 같은 높이 · 약 10행 상한 · 안에서 스크롤', () => {
  const ulLines = SRC.split('\n').filter((l) => l.includes('data-notif-panel'));
  const body = SRC.split('\n').find((l) => l.includes('data-notif-body')) ?? '';

  it('두 목록(쪽지·알림) 모두 data-notif-panel 을 그린다(전수 확인의 최소 증거)', () => {
    expect(ulLines.length).toBe(2);
  });

  it.each(ulLines)("'%s' 는 그릇 안에서 스크롤하고 끝에서 뒤 화면으로 새지 않는다", (line) => {
    expect(line).toMatch(/flex-1 min-h-0 overflow-y-auto overscroll-contain/);
    expect(line, '탭별 스크롤 기억이 빠졌다').toMatch(/ref=\{listRef\} onScroll=\{rememberScroll\}/);
    expect(line, '목록 자신의 최소 높이는 그릇이 정한다 — 목록마다 따로 두면 탭마다 달라진다').not.toMatch(/min-h-\[/);
  });

  it('그릇 높이 식이 두 목록 길이를 **함께** 보고(탭 무관), 바닥 160px · 상한 NOTIF_BODY_MAX 를 쓴다', () => {
    expect(body, 'data-notif-body 그릇이 없다').not.toBe('');
    expect(body).toMatch(/max\(160px, \$\{Math\.max\(threads\.length \* NOTIF_ROW_REM\.thread, notifications\.length \* NOTIF_ROW_REM\.notif\)\}rem\)/);
    expect(body).toMatch(/maxHeight: NOTIF_BODY_MAX/);
    expect(body, '안 읽음 필터 목록(visible)으로 높이를 재면 전체⇄안 읽음에서 튄다').not.toMatch(/visible\.length/);
    // 2026-10-05 글자 사다리 상향으로 알림 행 75 → 79px — 9행을 지키려 44 → 46rem.
    expect(SRC).toMatch(/const NOTIF_BODY_MAX = '46rem';/);
  });

  it('두 목록이 모두 그릇 안에 있다(그릇이 알림 목록 뒤에서 닫힌다)', () => {
    const open = SRC.indexOf('data-notif-body');
    const lastUl = SRC.lastIndexOf('data-notif-panel');
    const close = SRC.indexOf('</div>', SRC.indexOf('</ul>', lastUl));
    expect(open).toBeGreaterThan(0);
    expect(open).toBeLessThan(SRC.indexOf('data-notif-panel'));
    expect(SRC.slice(SRC.indexOf('</ul>', lastUl), close + 6)).toMatch(/<\/ul>\s*\)\}\s*<\/div>/);
  });
});
