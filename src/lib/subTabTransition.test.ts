// 하위 탭 전환 규약 게이트 — "호출은 있는데 CSS 가 없다"(또는 그 반대)를 컴파일 밖에서 잡는다.
//
// 왜 필요한가: goSubTab 의 scope 는 **문자열**이라 타입 검사가 오타를 못 잡는다.
// 스코프 이름이 index.css 규칙과 한 글자라도 어긋나면 전환은 조용히 '아무 일 없음' 이 된다 —
// 에러도, 경고도 없이 그냥 모션만 사라진다. 정확히 이 웨이브가 고치러 온 증상이다.
// 그래서 소스와 CSS 를 맞대어 본다: 스코프마다 ① 탭바·본문 이름 부여 ② root 정지
// ③ 앞뒤 방향 4개 애니메이션 이 전부 있어야 한다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** 소스 전체에서 실제로 쓰인 스코프 이름을 모은다(goSubTab 호출 — 2026-09-05 부터 인라인 조리법 0곳). */
function usedScopes(): Set<string> {
  const scopes = new Set<string>();
  for (const f of walk(SRC)) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/goSubTab\(\s*'([a-z0-9-]+)'/g)) scopes.add(m[1]);
  }
  return scopes;
}

describe('하위 탭 전환 · 알약과 활성 라벨의 스냅샷 순서', () => {
  // 오너 2026-09-08: "메뉴탭 클릭할 때마다 ... 글자가 안보이는 에러가 너무 명확하고 심각해".
  //
  // 평소에는 라벨 span 의 position:relative 가 절대배치 알약 **위**로 글자를 올린다.
  // 그런데 알약에 view-transition-name 을 주는 순간 그 z 순서가 무의미해진다 —
  // VT 레이어 순서는 z-index 가 아니라 **캡처 순서**를 따르고, 알약(바의 자손)이 바 스냅샷 위에
  // 깔려 활성 글자를 통째로 덮는다. 실측(1440x900, 프로덕션 빌드): 클릭 후 ~90ms 화면에
  // 보라 알약만 있고 글자가 없었다. 대조 실험으로 확정 — 알약 이름만 빼면 같은 프레임에 글자가 보인다.
  //
  // 고침은 라벨에도 이름을 주는 것. DOM 에서 SlidingPill 이 버튼들보다 앞이라 라벨 그룹이 알약 그룹보다
  // 뒤에 캡처돼 위에 얹히고, 박스가 같아 함께 미끄러진다(알약은 움직이고 글자는 보인다).
  // 이 게이트가 없으면 새 탭바를 만들 때마다 같은 결함이 조용히 따라 들어온다.
  const pills = [...CSS.matchAll(
    /html\[data-vt-scope='([a-z0-9-]+)'\] \[(data-[a-z0-9-]+)\] \[data-sliding-pill\] \{ view-transition-name: ([a-z0-9-]+)-pill; \}/g)];

  it('알약에 이름을 준 바가 여럿이다(전수 적용의 최소 증거)', () => {
    expect(pills.length).toBeGreaterThanOrEqual(9);
  });

  it.each(pills.map((m) => [m[1], m[2], m[3]] as const))(
    "'%s' — 알약에 이름을 줬으면 활성 라벨에도 준다", (scope, bar, base) => {
      const rule = `html[data-vt-scope='${scope}'] [${bar}] [data-pill-active] { view-transition-name: ${base}-label; }`;
      expect(CSS, `${scope}: 알약(${base}-pill)만 이름이 있고 라벨(${base}-label)이 없다 — `
        + '전환 중 활성 글자가 알약 스냅샷에 덮여 사라진다').toContain(rule);
    });
});

describe('하위 탭 전환 · 스코프와 CSS 규칙의 1:1', () => {
  const scopes = [...usedScopes()].sort();

  it('스코프가 실제로 여럿 등록돼 있다(전수 적용의 최소 증거)', () => {
    // 오너 #10 이전에는 3개(community-sec · venue-tab · rank-tab)뿐이었다.
    expect(scopes.length).toBeGreaterThanOrEqual(12);
  });

  it.each(
    // community-sec 은 root 를 함께 미는 1세대 조리법이라 '본문 이름·root 정지' 규칙이 없다 —
    // 기존 동작을 바꾸지 않기 위해 그대로 둔다(기능 보존). 나머지는 모두 2세대 규격을 따른다.
    [...usedScopes()].filter((s) => s !== 'community-sec').sort(),
  )("'%s' 스코프에 탭바·본문 이름과 방향 애니메이션이 모두 있다", (scope) => {
    const rules = CSS.split('\n').filter((l) => l.includes(`data-vt-scope='${scope}'`));
    const text = rules.join('\n');

    // ① 탭바·본문에 스냅샷 이름이 붙는다(전환 중에만).
    //    최소 2개(탭바·본문). **더 있어도 된다** — 2026-09-04 에 venue-tab 이 3개가 됐다:
    //    정지된 탭바 스냅샷 안에서는 SlidingPill 의 FLIP 이동이 통째로 가려지므로(실측),
    //    알약에 자기 이름을 줘 VT 가 옛→새 위치를 보간하게 했다. 이름이 늘어도 이 게이트가
    //    지키려는 것(root 정지 + 본문 4방향)은 아래 ②③ 이 그대로 강제한다.
    const names = [...text.matchAll(/view-transition-name:\s*([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(names.length, `${scope}: view-transition-name 부여 규칙이 최소 2개(탭바·본문) 필요하다`).toBeGreaterThanOrEqual(2);

    // ② root 기본 연출 정지 — 탭바 위쪽(헤더·히어로)이 통째로 밀리지 않게.
    expect(text, `${scope}: root 정지 규칙이 없다. 페이지 전체가 밀린다`).toMatch(/::view-transition-old\(root\)/);
    expect(text).toMatch(/::view-transition-new\(root\)/);

    // ③ 앞뒤 4방향 — 손가락이 고른 방향으로 밀려야 한다.
    //   방향 규칙은 스코프가 아니라 **패널 이름**으로 건다(패널 이름은 자기 스코프에서만
    //   생기므로 이미 유일하다 — 스코프 셀렉터를 다시 붙이면 같은 뜻이 4배로 늘 뿐이다).
    //   그래서 여기서도 '이 스코프가 부여하는 두 이름 중 하나'가 방향 규칙에 걸렸는지를 본다.
    //   (구세대 venue-tab·rank-tab 은 스코프까지 함께 적은 형태라 접미사로 찾는다 — 둘 다 유효.)
    const hasDir = (n: string, dir: string, phase: string) =>
      CSS.includes(`data-vt-dir='${dir}']::view-transition-${phase}(${n})`);
    const panel = names.find((n) => hasDir(n, 'forward', 'new'));
    expect(panel, `${scope}: 방향 애니메이션이 걸린 본문 이름을 찾을 수 없다(names=${names.join(',')})`).toBeTruthy();
    for (const dir of ['forward', 'back']) {
      for (const phase of ['old', 'new']) {
        expect(hasDir(panel!, dir, phase), `${scope}: ${dir}/${phase} 애니메이션 규칙이 없다(${panel})`).toBe(true);
      }
    }
  });
});

// ── 알약(SlidingPill) 이 스냅샷에 갇히지 않는가 ─────────────────────────────
//
// 왜 이 게이트가 필요한가: 탭바에 view-transition-name 을 주면 그 탭바는 전환 동안 **정지 이미지**로
// 대체된다. 알약은 그 이미지 안에 인쇄돼 있으므로, 살아 있는 DOM 에서 아무리 미끄러져도 사용자는
// 못 본다 — 전환이 끝나는 순간 새 위치에 '툭' 나타난다(오너 리포트 2026-09-07: "누르면 나중에 움직여").
// 2026-09-04 에 venue-tab 에서 이걸 실측하고 알약에 자기 이름을 줘 고쳤는데, 그 뒤 추가된 스코프
// 13개에는 그 한 줄이 빠진 채 복사됐다. 사람이 매번 기억할 일이 아니라 여기서 강제한다.
//
// 규칙: 탭바에 이름을 주는 스코프는 **알약 규칙을 갖거나, 아래 목록에 이유와 함께 등록되거나** 둘 중 하나다.
describe('하위 탭 전환 · 알약이 탭바 스냅샷에 갇히지 않는다', () => {
  /** 탭바 안에 미끄러지는 지시자(SlidingPill·SegmentedTabs·UnderlineTabs)가 없는 스코프.
   *  = 활성 표시가 정적이라 가려질 이동 자체가 없다. 2026-09-07 마크업 전수 확인. */
  const NO_PILL: Record<string, string> = {
    'admin-sec': '관리자 8섹션 내비 — 지시자 없음(정적 버튼)',
    'usermgmt-sec': '회원관리 섹션 — 지시자 없음',
    'tools-lane': 'GTO 레인 바 — 지시자 없음',
    'market-cat': '장터 카테고리 — 지시자 없음',
    'live-sort': '실시간 정렬 — 지시자 없음',
    'dealer-kind': '딜러 종류 — 지시자 없음',
    'profile-tab': '내 정보 탭 — 지시자 없음',
  };

  /** 탭바든 본문이든 view-transition-name 을 부여하는 스코프 전부.
   *  (스코프마다 규칙이 여럿이라 '어느 엘리먼트냐'를 특정하려 들면 패널을 집는다 — 스코프만 본다.) */
  const named = new Set(
    [...CSS.matchAll(/html\[data-vt-scope='([a-z0-9-]+)'\][^\n]*view-transition-name/g)].map((m) => m[1]),
  );

  it('탭바에 이름을 주는 스코프를 실제로 여럿 찾았다(정규식이 죽으면 조용히 통과하는 것을 막는다)', () => {
    expect(named.size).toBeGreaterThanOrEqual(12);
  });

  it.each([...named].sort())("'%s' 는 알약 규칙이 있거나 예외 목록에 등록돼 있다", (scope) => {
    const hasPill = CSS.split('\n').some(
      (l) => l.includes(`data-vt-scope='${scope}'`) && l.includes('[data-sliding-pill]'),
    );
    if (hasPill) return;
    expect(
      NO_PILL[scope],
      `${scope}: 탭바가 스냅샷으로 대체되는데 알약 규칙이 없다. 탭바 안에 ` +
        `SlidingPill/SegmentedTabs/UnderlineTabs 가 있으면 그 탭바 규칙 바로 아래에 ` +
        `\`html[data-vt-scope='${scope}'] [<탭바속성>] [data-sliding-pill] { view-transition-name: …-pill; }\` ` +
        `를 추가하고, 없으면 NO_PILL 에 이유와 함께 등록하라.`,
    ).toBeTruthy();
  });

  it('알약 이름이 서로 겹치지 않는다 — 같은 이름이 둘이면 전환이 통째로 실패한다', () => {
    const names = [...CSS.matchAll(/\[data-sliding-pill\]\s*\{\s*view-transition-name:\s*([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(names.length, '알약 규칙이 하나도 없다 — 셀렉터가 바뀌었는지 확인하라').toBeGreaterThanOrEqual(8);
    expect(new Set(names).size, `알약 이름 중복: ${names.join(',')}`).toBe(names.length);
  });
});
