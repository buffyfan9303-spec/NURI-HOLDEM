// 이름이 붙은 레일은 **표식과 CSS 가 짝이 맞아야** 한다.
//
// 왜 계약이 필요한가 (2026-09-17)
//   index.css 의 `html[data-vt-scope='…'] [data-표식] { view-transition-name: … }` 는
//   표식이 사라지면 **아무것도 안 잡고 조용히 성공한다**. 셀렉터가 0개를 잡는 것은 CSS 에서 오류가 아니다.
//   그러면 그 요소는 다시 조상 스냅샷 안으로 빨려 들어가 패널과 함께 미끄러지는데,
//   테스트는 전부 초록이고 화면만 예전으로 돌아간다. 이 저장소에서 이미 두 번 그 부류를 밟았다.
//
// 이 파일이 지키는 짝
//   ① 내 매장 단계/설정 레일 — data-mystore-rail (2곳: GameStepBar · SettingsTabBar)
//      두 레일은 같은 `section` 값에서 갈려 **절대 공존하지 않으므로** 이름 한 벌을 나눠 쓴다.
//      공존하게 바뀌면 같은 view-transition-name 이 둘이 되어 **전환이 통째로 실패**한다 —
//      그래서 개수(정확히 2)까지 고정한다. 3이 되면 그 전제를 다시 확인하라는 신호다.
//   ② 알림 패널 헤더 우측 액션 묶음 — data-notif-actions (1곳)
//      쪽지↔알림에서 이 자리의 내용이 통째로 바뀌는데 얼어붙은 root 안에 있어
//      옛 이미지가 300ms 불투명하게 남았다(오너: "그냥 더러운 잔상").
//
//   ③ 라벨 등록 — *-label 이름은 세 목록(group/old/new)에 **모두** 들어가야 한다.
//      하나라도 빠지면 라벨이 옛 버튼에서 새 버튼으로 끌려간다(2026-09-11 오너 리포트의 그 증상).
//
// 이 저장소 vitest 는 environment: 'node' 라 렌더 테스트가 안 된다 → 소스 계약으로 잠근다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
/** 주석 안의 문구가 단언을 거짓 통과시키지 않도록 코드만 남긴다. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const CSS = read('../../index.css');
const VMT = codeOnly(read('./VenueManageTab.tsx'));
const NOTIF = codeOnly(read('./NotificationPanel.tsx'));

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

describe('VT 레일 표식 — 표식과 CSS 가 짝으로 산다', () => {
  it('정규식이 죽으면 조용히 통과하는 것을 막는다 — 재료가 실제로 있다', () => {
    expect(CSS.length).toBeGreaterThan(50_000);
    expect(VMT).toContain('GameStepBar');
    expect(NOTIF).toContain('SegmentedTabs');
  });

  it('🔴 내 매장 레일 표식이 정확히 2곳이다 — 공존하지 않는다는 전제가 이 숫자다', () => {
    expect(count(VMT, 'data-mystore-rail'), 'GameStepBar · SettingsTabBar 두 곳이어야 한다')
      .toBe(2);
  });

  it('🔴 알림 헤더 액션 표식이 정확히 1곳이다', () => {
    expect(count(NOTIF, 'data-notif-actions')).toBe(1);
  });

  it.each([
    ['mystore-sec', 'data-mystore-rail', 'mystore-rail', 'mystore-rail-pill', 'mystore-rail-label'],
    ['notif-tab', 'data-notif-actions', 'notif-actions', 'notiffilter-pill', 'notiffilter-label'],
  ])('🔴 %s: 바·알약·라벨 세 줄이 모두 있다', (scope, marker, bar, pill, label) => {
    // 정규식을 쓰지 않는다 — 이스케이프가 한 글자만 어긋나도 '통과하는데 아무것도 안 보는' 검사가 된다.
    const line = (sel: string, name: string) =>
      `html[data-vt-scope='${scope}'] [${marker}]${sel} { view-transition-name: ${name}; }`;
    expect(CSS, `${scope}: 바 이름 규칙이 없다`).toContain(line('', bar));
    expect(CSS, `${scope}: 알약 이름 규칙이 없다 — 알약이 바 스냅샷에 갇혀 순간이동한다`)
      .toContain(line(' [data-sliding-pill]', pill));
    expect(CSS, `${scope}: 활성 라벨 이름 규칙이 없다 — 알약 그룹이 글자를 덮는다`)
      .toContain(line(' [data-pill-active]', label));
  });

  it.each(['mystore-rail-label', 'notiffilter-label'])(
    '🔴 %s 가 라벨 세 목록(group·old·new)에 모두 등록돼 있다 — 하나만 빠져도 글자가 끌려간다',
    (label) => {
      for (const kind of ['group', 'old', 'new'] as const) {
        expect(CSS, `${label} 이 ::view-transition-${kind} 목록에 없다`)
          .toContain(`::view-transition-${kind}(${label})`);
      }
    },
  );

  it('🔴 옛 스냅샷을 얼릴 거면 반드시 같이 숨긴다 — 안 그러면 잔상·겹침이 된다', () => {
    // 레일·액션 자리는 **내용이 모드마다 통째로 바뀌고, 아예 사라지기도 한다**(설정→직원 처럼).
    //
    // ⚠ 이 단언은 2026-09-18 까지 **틀린 것을 보고 있었다.** 원래 조건은 "`animation: none` 이면 무조건
    //   실패" 였는데, 그때 실제 CSS 는 이름들을 **여러 줄에 걸친 공동 목록**으로 얼리고 있어서
    //   (`::view-transition-old(mystore-rail),` 한 줄에는 `{` 가 없다) 줄 단위 검사가 **못 봤다** —
    //   2026-09-17 에 mystore-rail·notif-actions 를 그 목록에 넣었는데 이 계약은 초록이었고,
    //   화면에서는 '매장 페이지' 위에 옛 레일이, 알림 우상단에 '글쓰기' 와 '읽음/안읽음' 이 겹쳤다.
    //
    // 올바른 기준은 '얼렸느냐' 가 아니라 **'얼렸으면 옛 것을 숨겼느냐'** 다:
    //   old { animation: none; opacity: 0 }  +  new { animation: none; opacity: 1 }   ← 라벨 조리법, 안전
    //   old { animation: none }                                                       ← 300ms 남는다, 금지
    // new 쪽은 `animation: none` 만으로 괜찮다 — 새 내용은 보여야 하는 것이 맞다.
    const bad: string[] = [];
    for (const name of ['mystore-rail', 'notif-actions', 'market-catbar', 'dealer-kindbar']) {
      const sel = `::view-transition-old(${name})`;
      let i = CSS.indexOf(sel);
      if (i < 0) { bad.push(`${name}: old 규칙 자체가 없다 — 이름만 있고 규칙이 없으면 UA 크로스페이드가 돈다`); continue; }
      while (i >= 0) {
        const open = CSS.indexOf('{', i);
        const close = CSS.indexOf('}', open);
        const body = open >= 0 && close > open ? CSS.slice(open, close) : '';
        if (/animation:\s*none/.test(body) && !/opacity:\s*0/.test(body)) {
          bad.push(`${name}: old 를 얼렸는데 opacity: 0 이 없다 → ${body.replace(/\s+/g, ' ').trim()}`);
        }
        i = CSS.indexOf(sel, i + sel.length);
      }
    }
    expect(
      bad,
      `옛 스냅샷이 전환 내내 남는다:\n  ${bad.join('\n  ')}\n` +
      '→ `::view-transition-old(이름) { animation: none; opacity: 0 }` 로 숨기고, new 에 opacity: 1 을 줘라.',
    ).toEqual([]);
  });
});
