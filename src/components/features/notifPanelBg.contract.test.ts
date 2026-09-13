// 알림 패널 쪽지⇄알림 전환 시 배경색 "검은 번쩍임" 회귀 게이트 (2026-09-14).
//
// 왜: `[data-notif-panel]`(NotificationPanel.tsx 의 목록 <ul>, 자체 배경 클래스 없음 — 부모
//   div(bg-surface-mid 카드)에 얹혀 보인다)에 view-transition-name 이 붙어 있어(index.css
//   `data-vt-scope='notif-tab'`), 쪽지⇄알림 전환마다 이 영역이 별도 스냅샷으로 top layer 에 뜬다.
//   스냅샷 자신은 배경이 없어(반투명 겹침 방지 조리법, index.css:1881 주석) 명시적으로 칠해야 하는데,
//   예전엔 legal-panel·crm-panel 등 **전체화면 패널**(bg-surface-base)과 한 셀렉터로 묶여
//   --surface-base 를 그대로 물려받았다. notif-panel 은 그 목록에서 유일하게 **뜨는 카드**(bg-surface-mid)
//   라 다크 테마에서 지면색(#06080F)과 카드색(#151C30) 차이가 커, 전환마다 목록 박스가 검게
//   번쩍였다 정상으로 돌아왔다(오너 리포트 2026-09-14: "그 알림이 들어있는 박스가 검은색이 되었다가 돌아와").
//
// 못 보는 것: 실제 프레임 단위 색 검증(디자인 리뷰 실측 몫). 이 테스트는 소스 텍스트 계약만 잠근다.
// 음성 대조(2026-09-14 실행 확인): notif-panel 전용 규칙의 --surface-mid 를 --surface-base 로
//   되돌리면 첫 번째·두 번째 테스트가 빨개지고, notif-panel 을 다시 공동 목록에 넣으면 세 번째가 빨개진다.
// 실행: npx vitest run src/components/features/notifPanelBg.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

describe('알림 패널(notif-panel) VT 스냅샷 배경 — 카드색(--surface-mid) 고정', () => {
  it('new 스냅샷이 --surface-mid 를 쓴다(--surface-base 아님)', () => {
    const m = CSS.match(/::view-transition-new\(notif-panel\)\s*\{\s*background-color:\s*rgb\(var\((--surface-\w+)\)\)/);
    expect(m, 'notif-panel new 스냅샷 전용 background-color 규칙을 찾지 못했다').toBeTruthy();
    expect(m![1], 'notif-panel 은 뜨는 카드(bg-surface-mid)다 — 지면색(--surface-base)을 쓰면 다크에서 검게 번쩍인다').toBe('--surface-mid');
  });

  it('old 스냅샷도 같은 값을 쓴다(나가는 방향 전환에서도 검게 안 보이게)', () => {
    const m = CSS.match(/::view-transition-old\(notif-panel\),\s*\r?\n\s*::view-transition-new\(notif-panel\)\s*\{\s*background-color:\s*rgb\(var\((--surface-\w+)\)\)/);
    expect(m, 'notif-panel old 스냅샷 규칙을 찾지 못했다 — old 쪽이 비면 ::view-transition 루트 배경(--surface-base)이 새어 나온다').toBeTruthy();
    expect(m![1]).toBe('--surface-mid');
  });

  it('notif-panel 은 전체화면 패널들의 공동 --surface-base 목록에 더 이상 없다', () => {
    const sharedBlock = CSS.match(/::view-transition-new\(admin-secpanel\)[\s\S]*?background-color: rgb\(var\(--surface-base\)\); \}/);
    expect(sharedBlock, '공동 --surface-base 규칙 블록의 앵커(admin-secpanel)를 못 찾았다 — 리팩터로 구조가 바뀌었는지 확인').toBeTruthy();
    expect(sharedBlock![0]).toContain('crm-panel'); // 앵커 확인 — 다른 전체화면 패널은 그대로 --surface-base 여야 한다
    expect(sharedBlock![0], 'notif-panel 이 다시 --surface-base 공동 목록에 섞여 들어갔다').not.toContain('notif-panel');
  });
});
