// view-transition-name 만 붙이고 **규칙을 안 준 요소** 재발 방지 계약 (2026-09-17)
//
// 무엇을 막는가
//   요소에 `view-transition-name` 을 주면 전환마다 그 요소가 **top layer 의 독립 스냅샷**으로 뜬다.
//   그 스냅샷에는 자기 배경이 없어서, 아무 규칙도 안 주면 기본 크로스페이드가 돌며
//   `::view-transition` 루트 배경(다크 테마에서 근흑색)이 그대로 비친다 — 눈에는 **깜빡임**으로 보인다.
//   이름을 주는 것은 "이 요소를 따로 그리겠다"는 선언이라, **어떻게 그릴지까지 말해야 끝난다.**
//
// 실제로 났던 일 (전부 오너 리포트)
//   · 2026-09-11 "글자가 pill 을 따라가"        → 활성 라벨에 이름만 주고 목록 등록을 빠뜨림
//   · 2026-09-14 "알림 박스가 검은색이 되었다 돌아와" → notif-panel 이 지면색 목록에 묶여 있었음
//   · 2026-09-17 "읽음 안읽음 이런 것들 보면 블링크 되면서 너무 깜빡여" → notif-actions 누락
//     그날 전수 조사에서 **4건이 더 나왔다**: notif-actions · admin-active · mystore-active · mystore-rail.
//   세 번 다른 얼굴로 돌아왔다. 그래서 개별 이름이 아니라 **전수**로 잠근다.
//
// 무엇을 '규칙이 있다'로 보는가
//   `::view-transition-old/new/group(<이름>)` 을 고르는 블록에 아래 중 하나라도 있으면 통과:
//     · animation   — 크로스페이드를 끄거나(none) 제 키프레임을 지정한 것
//     · background  — 스냅샷에 배경을 준 것(겹침·비침 방지)
//     · object-fit / overflow — 돌출 가드(2026-09-17 의 17개 패널 전수 작업)
//
// 이 검사가 못 보는 것
//   · 규칙이 **맞는지**는 안 본다(잘못된 배경색을 줘도 통과한다 — 그건 notifPanelBg 계약의 몫이다).
//   · JS 로 동적 부여하는 이름(현재 0곳). CSS 선언만 센다.
// 실행: npx vitest run src/components/vtNameCoverage.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

/** `view-transition-name: X;` 로 선언된 이름 전부. `none` 은 **해제**라 대상이 아니다. */
function declaredNames(): string[] {
  const out = new Set<string>();
  for (const m of CSS.matchAll(/view-transition-name:\s*([a-zA-Z0-9_-]+)\s*;/g)) {
    if (m[1] !== 'none') out.add(m[1]);
  }
  return [...out].sort();
}

/** 그 이름을 고르는 블록 중 하나라도 실제 지시(animation/background/클립)를 담고 있는가. */
function hasRule(name: string): boolean {
  const sel = new RegExp(`::view-transition-(?:old|new|group)\\(${name}\\)`, 'g');
  for (const m of CSS.matchAll(sel)) {
    const open = CSS.indexOf('{', m.index!);
    const close = CSS.indexOf('}', m.index!);
    if (open < 0 || close < 0 || open > close) continue;
    const body = CSS.slice(open, close);
    if (/animation|background|object-fit|overflow/.test(body)) return true;
  }
  return false;
}

describe('view-transition-name 을 준 요소는 그리는 법까지 정해져 있다', () => {
  it('이름만 있고 규칙이 없는 요소가 없다 — 그 자리가 전환마다 깜빡인다', () => {
    const names = declaredNames();
    expect(names.length, 'index.css 에서 이름을 하나도 못 찾았다 — 정규식이 낡았다').toBeGreaterThan(30);
    const naked = names.filter((n) => !hasRule(n));
    expect(
      naked,
      `이름만 붙고 규칙이 없다(전환마다 루트 배경이 비쳐 깜빡인다): ${naked.join(', ')}\n` +
      '→ 바·컨테이너면 animation: none 목록에, 활성 라벨이면 라벨 목록에, 뜨는 카드면 배경 규칙에 등록해라.',
    ).toEqual([]);
  });

  it('2026-09-17 에 실제로 샜던 넷이 등록돼 있다', () => {
    // 일반 검사가 있어도 이 넷은 따로 못 박는다 — 어떤 얼굴로 돌아왔는지 다음 사람이 알아야 한다.
    for (const n of ['notif-actions', 'admin-active', 'mystore-active', 'mystore-rail']) {
      expect(hasRule(n), `${n} 이 다시 규칙을 잃었다`).toBe(true);
    }
  });
});
