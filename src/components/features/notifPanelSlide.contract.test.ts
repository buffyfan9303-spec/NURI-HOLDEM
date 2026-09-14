// 알림 패널 쪽지⇄알림 전환 시 박스가 팝업 밖으로 삐져나가는 회귀 게이트 (2026-09-14).
//
// 왜: `[data-notif-panel]`(NotificationPanel.tsx 의 목록 <ul>)에 view-transition-name 이 붙어
//   (index.css `data-vt-scope='notif-tab'`) 전환마다 별도 스냅샷으로 top layer 에 뜬다. 전에는
//   다른 서브탭과 같은 공동 규칙(vt-panel-in-r/out-l 등, ±18px translateX)을 그대로 물려썼는데,
//   top layer 스냅샷은 카드의 overflow-hidden·rounded-card 클립을 안 받는다 — 실측(390px 모바일):
//   팝업 카드는 좌우 17px 여백만 두고 뜨는데(left 17 · right 373 · viewport 390) 18px 를 밀면
//   그 여백보다 커서 카드 테두리를 넘어 화면 가장자리까지 삐져나갔다(오너 리포트 2026-09-14:
//   "박스가 팝업 밖으로 왼쪽으로 갔다가 오른쪽으로 갔다가").
//   admin-secpanel·venue-tab·rank-tab 등 나머지는 전부 뷰포트 폭을 쓰는 전체화면 패널이라 같은
//   18px 가 안 보였다 — notif-panel 만 좁고 테두리 있는 뜨는 카드라서 나는 문제였다.
//   처방: notif-panel 만 공동 목록에서 빼고 가로 이동이 없는 자체 규칙(old 만 페이드아웃, new 는
//   애니메이션 없이 즉시 자리를 지킨다)으로 바꿨다. new 에 페이드를 안 넣는 이유는 검은 번쩍임 수정 때
//   지킨 것과 같다 — new 도 반투명이면 old 와 겹쳐 글자가 두 벌로 보이던 옛 버그가 돌아온다.
//
// 못 보는 것: 실제 렌더 픽셀(design 실측 몫). 이 테스트는 소스의 CSS 계약만 잠근다.
// 음성 대조(2026-09-14 실행 확인): `::view-transition-new(notif-panel) { animation: none; }` 를
//   지우고 `vt-panel-in-r` 공동 목록에 notif-panel 을 다시 넣으면 두 번째·세 번째 테스트가 빨개진다.
// 실행: npx vitest run src/components/features/notifPanelSlide.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

describe('알림 패널(notif-panel) 전환 — 가로 이동(translateX) 없음', () => {
  it('notif-panel 이 공동 방향성 푸시 목록(vt-panel-in-r/out-l 등)에 없다', () => {
    // 공동 목록은 `html[data-vt-dir='...']::view-transition-{old,new}(notif-panel)` 형태로 등장한다.
    // 이게 하나라도 있으면 ±18px translateX 가 되살아난 것이다.
    expect(CSS).not.toMatch(/data-vt-dir='(forward|back)'\]::view-transition-(old|new)\(notif-panel\)/);
  });

  it('new 스냅샷은 애니메이션이 없다(즉시 불투명 — old 위에서 곧바로 가린다)', () => {
    expect(CSS).toMatch(/::view-transition-new\(notif-panel\)\s*\{\s*animation:\s*none;?\s*\}/);
  });

  it('old 스냅샷은 페이드아웃만 한다(가로 이동 키프레임을 안 쓴다)', () => {
    const m = CSS.match(/::view-transition-old\(notif-panel\)\s*\{\s*animation:\s*([a-z0-9-]+)/);
    expect(m, 'old 스냅샷 애니메이션 규칙을 찾지 못했다').toBeTruthy();
    expect(m![1], 'old 스냅샷이 여전히 가로 이동 키프레임(vt-panel-*)을 쓴다').not.toMatch(/^vt-panel-/);
  });

  it('페이드아웃 키프레임 자체가 opacity 만 바꾼다(transform 없음)', () => {
    const m = CSS.match(/@keyframes\s+vt-fade-out\s*\{([^}]*)\}/);
    expect(m, 'vt-fade-out 키프레임을 찾지 못했다').toBeTruthy();
    expect(m![1]).toMatch(/opacity:\s*0/);
    expect(m![1], 'vt-fade-out 에 transform 이 섞여 있다 — 다시 가로로 밀리게 된다').not.toMatch(/transform/);
  });
});
