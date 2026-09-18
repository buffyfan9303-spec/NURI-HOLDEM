// view-transition-name 만 붙이고 **규칙을 안 준 요소** 재발 방지 계약 (2026-09-17)
//
// 무엇을 막는가
//   요소에 `view-transition-name` 을 주면 전환마다 그 요소가 **top layer 의 독립 스냅샷**으로 뜬다.
//   그 스냅샷에는 자기 배경이 없어서, 아무 규칙도 안 주면 기본 크로스페이드가 돌며
//   `::view-transition` 루트 배경(다크 테마에서 근흑색)이 그대로 비친다 — 눈에는 **깜빡임**으로 보인다.
//   이름을 주는 것은 "이 요소를 따로 그리겠다"는 선언이라, **어떻게 그릴지까지 말해야 끝난다.**
//
// 실제로 났던 일 (전부 오너 리포트 — 하위 탭 VT 시절)
//   · 2026-09-11 "글자가 pill 을 따라가"        → 활성 라벨에 이름만 주고 목록 등록을 빠뜨림
//   · 2026-09-14 "알림 박스가 검은색이 되었다 돌아와" → notif-panel 이 지면색 목록에 묶여 있었음
//   · 2026-09-17 "읽음 안읽음 이런 것들 보면 블링크 되면서 너무 깜빡여" → notif-actions 누락
//     그날 전수 조사에서 **4건이 더 나왔다**: notif-actions · admin-active · mystore-active · mystore-rail.
//   세 번 다른 얼굴로 돌아왔다. 그래서 개별 이름이 아니라 **전수**로 잠근다.
//
//   2026-09-18 하위 탭 VT 를 걷어내며(src/lib/subTabTransition.ts) `html[data-vt-scope=…]` 가 주던
//   이름 62개가 전부 사라졌다. 위 사고의 이름들도 함께 갔지만 **원칙은 남은 이름에 그대로 적용된다** —
//   최상위 탭 전환은 여전히 VT 라, 지금 남은 app-header · app-tabbar · app-gnb(index.css) 와
//   vt-poster(tsx 인라인)가 규칙을 잃으면 같은 깜빡임이 그 자리에서 난다.
//
// 무엇을 '규칙이 있다'로 보는가
//   `::view-transition-old/new/group(<이름>)` 을 고르는 블록에 아래 중 하나라도 있으면 통과:
//     · animation   — 크로스페이드를 끄거나(none) 제 키프레임을 지정한 것
//     · background  — 스냅샷에 배경을 준 것(겹침·비침 방지)
//     · object-fit / overflow — 돌출 가드
//
// 이 검사가 못 보는 것
//   · 규칙이 **맞는지**는 안 본다(잘못된 배경색을 줘도 통과한다).
//   ⚠ 예전에 여기 "JS 로 동적 부여하는 이름(현재 0곳)" 이라고 적혀 있었는데 **사실이 아니었다** —
//     `vt-poster` 는 ScheduleCard/ScheduleDetailModal 이 인라인 스타일로 붙이는 이름이라 CSS 전수 검사에
//     **한 번도 안 잡혔다**. 아래 describe 가 tsx 쪽 이름도 같이 센다.
// 실행: npx vitest run src/components/vtNameCoverage.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** src 아래 모든 .tsx 경로(테스트 제외). */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsxFiles(full));
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) out.push(full);
  }
  return out;
}

// ⚠ **주석을 지우고** 읽는다. 이 저장소의 주석에는 실측 로그가 그대로 들어 있어
//   `::view-transition-group(vt-poster) :: -ua-…` 같은 문자열이 본문에 산다. 주석째 훑으면
//   규칙을 통째로 지워도 주석이 대신 통과시켜 준다(2026-09-18 음성 대조에서 실제로 걸렸다).
//   같은 이유로 dynamicViewportUnit 판정기도 주석을 지우고 코드만 본다.
const CSS = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** `view-transition-name: X;` 로 선언된 이름 전부. `none` 은 **해제**라 대상이 아니다. */
function declaredNames(): string[] {
  const out = new Set<string>();
  for (const m of CSS.matchAll(/view-transition-name:\s*([a-zA-Z0-9_-]+)\s*;/g)) {
    if (m[1] !== 'none') out.add(m[1]);
  }
  return [...out].sort();
}

/** tsx 가 인라인 스타일(`viewTransitionName: '…'`)이나 `vtName={… '…'}` prop 으로 붙이는 이름 전부.
 *  CSS 만 훑으면 JS 로 붙는 이름은 영원히 안 보인다 — 실제로 2026-09-18 까지 안 보였다. */
function tsxNames(): string[] {
  const names = new Set<string>();
  for (const f of tsxFiles(join(process.cwd(), 'src'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/viewTransitionName:\s*'([a-zA-Z0-9_-]+)'/g)) names.add(m[1]);
    for (const m of src.matchAll(/vtName=\{[^}]*'([a-zA-Z0-9_-]+)'/g)) names.add(m[1]);
  }
  names.delete('none');
  return [...names].sort();
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

/**
 * 규칙이 **없는 것이 곧 결정**인 이름과 그 사유. 면제는 목록이 아니라 사유와 한 쌍이다.
 *
 * ⚠ 'vt-poster' (2026-09-18 리드 판단)
 *   카드→상세 포스터 모핑의 이름이다(ScheduleCard 의 매장 로고 ↔ ScheduleDetailModal 의 포스터 자리).
 *   유일하던 규칙은 `html[data-vt-scope='sched-tab']::view-transition-*(vt-poster) { animation: none }` —
 *   **하위 탭 전환 중에는** 모핑하지 말라는 뜻이었고, 하위 탭 VT 와 함께 지워졌다.
 *   카드→상세(App.tsx 의 openSchedule/closeSchedule, scope 없는 withViewTransition)에서는
 *   UA 기본 그룹 보간(위치·크기 보간 + 크로스페이드)이 **곧 우리가 원하는 모핑**이라 규칙이 없는 것이 맞다.
 *   여기 규칙을 더하는 것은 그 모핑을 끄거나 바꾸는 것이다 — 그럴 때는 이 면제를 지우고 사유를 다시 써라.
 */
const NO_RULE_BY_DESIGN: Record<string, string> = {
  'vt-poster':
    '카드→상세 포스터 모핑 — UA 기본 그룹 보간(위치·크기 + 크로스페이드)이 곧 원하는 연출이라 규칙을 주지 않는다(2026-09-18 리드 판단).',
};

describe('view-transition-name 을 준 요소는 그리는 법까지 정해져 있다', () => {
  it('index.css 가 이름을 준 요소에 규칙이 있다 — 없으면 그 자리가 전환마다 깜빡인다', () => {
    const names = declaredNames();
    // 상시 크롬 셋(app-header · app-tabbar · app-gnb). 2026-09-18 하위 탭 VT 제거 후의 실측값이다.
    expect(names.length, 'index.css 에서 상시 크롬 이름 셋을 못 찾았다 — 정규식이 낡았거나 이름이 사라졌다').toBeGreaterThanOrEqual(3);
    const naked = names.filter((n) => !NO_RULE_BY_DESIGN[n] && !hasRule(n));
    expect(
      naked,
      `이름만 붙고 규칙이 없다(전환마다 루트 배경이 비쳐 깜빡인다): ${naked.join(', ')}\n` +
      '→ 바·컨테이너면 animation: none 목록에, 뜨는 카드면 배경 규칙에 등록해라. ' +
      '규칙이 없는 것이 결정이면 NO_RULE_BY_DESIGN 에 사유와 함께 적어라.',
    ).toEqual([]);
  });

  it('tsx 가 인라인으로 붙이는 이름도 규칙을 갖는다 — vt-poster 가 여기서 샜다', () => {
    const names = tsxNames();
    expect(names.length, 'tsx 에서 이름을 하나도 못 찾았다 — 정규식이 낡았다').toBeGreaterThan(0);
    const naked = names.filter((n) => !NO_RULE_BY_DESIGN[n] && !hasRule(n));
    expect(
      naked,
      `tsx 가 붙인 이름에 index.css 규칙이 없다: ${naked.join(', ')}\n` +
      '→ 이름을 주는 것은 "이 요소를 따로 그리겠다"는 선언이라, 어떻게 그릴지까지 적어야 끝난다. ' +
      '규칙이 없는 것이 결정이면 NO_RULE_BY_DESIGN 에 사유와 함께 적어라.',
    ).toEqual([]);
  });

  it('면제는 사유와 한 쌍이고, 실제로 쓰이는 이름만 면제된다 — 규칙이 생겼으면 면제를 지워라', () => {
    const all = new Set([...declaredNames(), ...tsxNames()]);
    for (const [name, why] of Object.entries(NO_RULE_BY_DESIGN)) {
      expect(all.has(name), `NO_RULE_BY_DESIGN 의 '${name}' 이 더 이상 쓰이지 않는다 — 면제를 지워라`).toBe(true);
      expect(why.length, `${name}: 면제 사유가 너무 짧다`).toBeGreaterThan(40);
      // '규칙이 없는 것이 곧 결정' 이 더는 참이 아니면 이 줄이 알린다 — 면제와 규칙이 동시에 있으면 어느 쪽이 의도인지 아무도 모른다.
      expect(hasRule(name), `${name} 에 규칙이 생겼다 — 면제를 지우고 규칙 쪽에 사유를 옮겨라`).toBe(false);
    }
  });
});
