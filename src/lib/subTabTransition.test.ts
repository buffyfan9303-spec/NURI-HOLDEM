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

/** 소스 전체에서 실제로 쓰인 스코프 이름을 모은다(goSubTab 호출 + 참조 구현 2곳의 인라인 조리법). */
function usedScopes(): Set<string> {
  const scopes = new Set<string>();
  for (const f of walk(SRC)) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/goSubTab\(\s*'([a-z0-9-]+)'/g)) scopes.add(m[1]);
    for (const m of t.matchAll(/dataset\.vtScope = '([a-z0-9-]+)'/g)) scopes.add(m[1]);
  }
  return scopes;
}

describe('하위 탭 전환 — 스코프와 CSS 규칙의 1:1', () => {
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
    const names = [...text.matchAll(/view-transition-name:\s*([a-z0-9-]+)/g)].map((m) => m[1]);
    expect(names.length, `${scope}: view-transition-name 부여 규칙이 2개(탭바·본문) 필요하다`).toBe(2);

    // ② root 기본 연출 정지 — 탭바 위쪽(헤더·히어로)이 통째로 밀리지 않게.
    expect(text, `${scope}: root 정지 규칙이 없다 — 페이지 전체가 밀린다`).toMatch(/::view-transition-old\(root\)/);
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

  it('모션 헌법 §20.4 — 새 이징·새 duration 을 들이지 않았다', () => {
    // 하위 탭 블록이 쓰는 값은 토큰 4단과 이징 3종뿐이어야 한다.
    const block = CSS.slice(CSS.indexOf("html[data-vt-scope='admin-sec']"));
    const anims = [...block.matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1]);
    for (const a of anims) {
      if (a.trim() === 'none') continue;
      expect(a, `토큰 밖 duration 이 섞였다: ${a}`).toMatch(/var\(--dur-(fast|base|panel|tab)\)/);
      expect(a, `토큰 밖 이징이 섞였다: ${a}`).toMatch(/var\(--ease(-out)?\)/);
      // 키프레임도 기존 것(vt-panel-*)만 재사용 — 새로 만들지 않았다.
      expect(a, `새 키프레임이 생겼다: ${a}`).toMatch(/vt-panel-(in|out)-[lr]/);
    }
  });
});
