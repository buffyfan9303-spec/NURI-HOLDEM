// 내 매장 판의 '요청 시점 매장 = 응답 시점 매장' 계약 (audit-link-1002 L-05·L-06, 2026-10-02)
//
// 왜: 판은 매장 A→B 전환에 다시 마운트되지 않는다(VenueManageTab keep-alive). `getX(venueId).then(setX)` 는
//   A 응답이 늦게 오면 B 화면에 A 값을 그린다 — 프리셋 목록(B 폼에 A 구조 적용) · 장부 직전 설정(B 새 게임에 A 참가비) ·
//   취소 비밀번호 유무 · 클락 시드/프리셋 · 킬스위치 상태 · 이벤트 신청 목록 · **장부 목록(🗑 가 B 장부를 하드 삭제)** ·
//   출근 명부(A 직원 id 가 B 시프트에) · 고객 연결 · 포인트 검색 제안 · **인건비 시급(B 직원 시급이 0 으로 덮임)**.
//   매장 경계 확인은 lib/useVenueScope 한 곳이 한다.
// 이 계약은 구조만 잠근다. 실제 전환 동작은 e2e/store-link-1002.spec.ts · store-link-1002c.spec.ts 가 늦은 응답으로 재현해 잰다.
// 실행: npx vitest run src/components/features/venueScope.contract.test.ts
//
// ⚠ 한계 — 이 스캐너는 **구조 경보기**(휴리스틱)이지 증명이 아니다(verify-store-link-1002 §2). 못 잡는 것: ① 헐거운 가드 인정
//   (조건에 함수 밖 식별자만 있으면 가드로 쳐서 `if (open)`·`mounted.current`·무관한 `if (DEBUG)` 도 통과) ② 소비 모양 미추적
//   (`const p = getX(venueId); p.then(setX)` · 래퍼 함수 · `ids.map(…)` · `useCallback` 래퍼) ③ `venue.id`·`props.venueId`·
//   `venue?.id` 같은 매장 id 표기는 인식하지 않는다(식별자 `venueId` 와 그 별칭만) ④ `supabase.from(…)`/`rpc(…)` 직접 질의와
//   READ 접두어 밖의 이름(`refreshStats` 등)은 보지 않는다. 오늘 저장소의 실례는 0이지만 위 모양이 새로 들어오면 이 테스트는 조용하다 —
//   새 매장 조회는 `useVenueScope().run` 으로 쓰고, 이 목록을 '안전 증명'으로 읽지 않는다.
//
// ⚠ 2026-10-02(review-store-link-1002b A4) — 예전 판은 한 줄 정규식이라 7가지 모양을 놓쳤다(줄 넘김 인자 · `if (s)` 를 가드로 인정 ·
//   set 아닌 콜백 · await · 별칭 변수 · 객체 인자 · async 화살표). 그리고 대상이 10파일뿐이라 같은 부류(StaffPayroll 인건비 —
//   저장 시 B 직원 시급을 0/A 값으로 덮음)가 그 밖에 남았다. 이제 TypeScript AST 로 **src/components 전체**를 센다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const F = join(__dirname);
const COMPONENTS = join(__dirname, '..');
const read = (p: string) => readFileSync(join(F, p), 'utf8');

// ── 스캐너 ────────────────────────────────────────────────────────────────────
/** 읽기 조회로 보는 호출 이름(마지막 식별자). 쓰기(save·create·delete·approve…)는 사용자 동작 뒤라 대상이 아니다. */
const READ = /^(get|load|fetch|list|search|count|has|my|find|query|pos(Has)?[A-Z])/;
/** 조건에 이것만 나오면 '가드'가 아니다(응답 자체의 null 확인 등과 같은 부류). */
// venueId 도 넣는다 — 클로저의 venueId 는 요청 때 값이라 `if (venueId)` 는 매장이 바뀌었는지 알려 주지 않는다.
const BUILTIN = new Set(['venueId', 'Array', 'Object', 'Number', 'String', 'Boolean', 'Math', 'JSON', 'undefined', 'null', 'NaN', 'window', 'document', 'console', 'Date']);

export interface Finding { line: number; name: string; fn: string; text: string }

function calleeName(c: ts.CallExpression): string {
  const e = c.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
}

/**
 * 함수 안의 이름 — 매개변수와 지역 변수. 이 이름만 쓰는 조건(`if (s)` · `if (players.length)`)은 매장 가드가 아니다
 * (응답에서 파생됐는지 추적하지 않는다 — `counts` 처럼 응답으로 채운 Map 을 놓친다). 예외: 지역 **함수**
 * (`const stale = () => isStaleResponse(stamp, ref.current)`)는 밖의 상태를 보는 클로저라 넣지 않는다.
 */
function boundNames(fn: ts.Node): Set<string> {
  const out = new Set<string>();
  const addBinding = (n: ts.BindingName) => {
    if (ts.isIdentifier(n)) out.add(n.text);
    else n.elements.forEach((el) => { if (!ts.isOmittedExpression(el)) addBinding(el.name); });
  };
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn)) fn.parameters.forEach((p) => addBinding(p.name));
  const walk = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && !(n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)))) addBinding(n.name);
    ts.forEachChild(n, walk);
  };
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (body) walk(body);
  return out;
}

/** `.then(guard(setX))` · `.then(ownerOnly(owner, setX))` · `.then(mine(setX))` — 감싼 함수가 세대·매장을 본다. */
const GUARD_WRAPPER = /^(guard|ownerOnly|mine)$/;

/** 조건식에 이 함수 밖에서 온 식별자(alive · on · my === ref.current · isStaleResponse(…))가 있으면 가드다. */
function hasFreeIdent(cond: ts.Node, bound: Set<string>): boolean {
  let free = false;
  const walk = (n: ts.Node) => {
    if (free) return;
    if (ts.isPropertyAccessExpression(n)) { walk(n.expression); return; } // .name 은 식별자 참조가 아니다
    if (ts.isIdentifier(n) && !bound.has(n.text) && !BUILTIN.has(n.text)) { free = true; return; }
    ts.forEachChild(n, walk);
  };
  walk(cond);
  return free;
}

/** fn 본문에 '밖에서 온 값' 으로 판정하는 if/삼항/&& 가 있는가. */
function guarded(fn: ts.Node, bound: Set<string>, after = -1): boolean {
  let g = false;
  const walk = (n: ts.Node) => {
    if (g || n.end < after) return; // await 보다 앞의 판정(`if (!venueId) return`)은 응답이 올 때를 보지 않는다
    if (n !== fn && (ts.isArrowFunction(n) || ts.isFunctionExpression(n))) return; // 안쪽 콜백의 판정은 별개
    if (ts.isIfStatement(n) && hasFreeIdent(n.expression, bound)) { g = true; return; }
    if (ts.isConditionalExpression(n) && hasFreeIdent(n.condition, bound)) { g = true; return; }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && hasFreeIdent(n.left, bound)) { g = true; return; }
    ts.forEachChild(n, walk);
  };
  walk(fn);
  return g;
}

function enclosingFn(n: ts.Node): ts.Node | undefined {
  for (let p = n.parent; p; p = p.parent) if (ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) return p;
  return undefined;
}

/** 가장 가까운 '이름 있는' 함수 — 허용 목록 키(`파일:함수:호출`)용. 이름이 없으면 '<anon>'. */
function enclosingName(n: ts.Node): string {
  for (let p = n.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) return p.name.getText();
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.initializer && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer))) return p.name.text;
  }
  return '<anon>';
}

/** `.catch(…)` · `.finally(…)` 를 지나 위로 — 그 다음이 실제 소비자다. */
function climbChain(n: ts.Expression): ts.Expression {
  let cur = n;
  for (;;) {
    const pa = cur.parent;
    if (pa && ts.isPropertyAccessExpression(pa) && pa.expression === cur && /^(catch|finally)$/.test(pa.name.text) && ts.isCallExpression(pa.parent) && pa.parent.expression === pa) { cur = pa.parent; continue; }
    if (pa && (ts.isParenthesizedExpression(pa) || ts.isAsExpression(pa))) { cur = pa; continue; }
    return cur;
  }
}

/** 이 호출 결과를 비동기로 받아 쓰는 곳이 가드 없이 쓰는가. */
function unguardedConsumer(call: ts.Expression): boolean {
  const top = climbChain(call);
  const pa = top.parent;
  // Promise.all([…]) 의 원소면 Promise.all 호출이 소비자다
  if (pa && ts.isArrayLiteralExpression(pa)) {
    const pc = pa.parent;
    if (pc && ts.isCallExpression(pc) && ts.isPropertyAccessExpression(pc.expression) && pc.expression.expression.getText() === 'Promise') return unguardedConsumer(pc);
    return false;
  }
  // .then(cb)
  if (pa && ts.isPropertyAccessExpression(pa) && pa.expression === top && pa.name.text === 'then' && ts.isCallExpression(pa.parent)) {
    const cb = pa.parent.arguments[0];
    if (!cb) return false;
    if (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) {
      const bound = boundNames(cb);
      // 바깥 함수가 이미 가드(alive 등)를 들고 있어도, 콜백이 그것을 **보지 않으면** 가드가 아니다.
      return !guarded(cb, bound);
    }
    if (ts.isCallExpression(cb) && GUARD_WRAPPER.test(calleeName(cb))) return false;
    return true; // setX · applyList 같은 이름 그대로 — 안을 볼 수 없다
  }
  // const x = await getX(venueId); … — 같은 함수에서 await 뒤에 밖의 값을 보는 판정이 있어야 한다
  if (pa && ts.isAwaitExpression(pa)) {
    const fn = enclosingFn(pa);
    if (!fn) return true;
    return !guarded(fn, boundNames(fn), pa.end);
  }
  return false;
}

/** 소스 하나를 센다 — 매장 id(venueId 또는 그 별칭)를 인자 어디에든 실은 읽기 조회 중 결과를 가드 없이 쓰는 곳. */
export function scanVenueReads(src: string, file = 'x.tsx'): Finding[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const alias = new Set(['venueId']);
  const collect = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isIdentifier(n.initializer) && alias.has(n.initializer.text)) alias.add(n.name.text);
    ts.forEachChild(n, collect);
  };
  collect(sf); collect(sf); // 별칭의 별칭까지
  const mentions = (n: ts.Node): boolean => {
    let hit = false;
    const walk = (m: ts.Node) => {
      if (hit) return;
      if (ts.isArrowFunction(m) || ts.isFunctionExpression(m)) return;
      if (ts.isPropertyAccessExpression(m)) { walk(m.expression); return; }
      if (ts.isShorthandPropertyAssignment(m) && alias.has(m.name.text)) { hit = true; return; }
      if (ts.isPropertyAssignment(m)) { walk(m.initializer); return; }
      if (ts.isIdentifier(m) && alias.has(m.text)) { hit = true; return; }
      ts.forEachChild(m, walk);
    };
    walk(n);
    return hit;
  };
  const out: Finding[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && READ.test(calleeName(n)) && n.arguments.some(mentions) && unguardedConsumer(n)) {
      const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      out.push({ line, name: calleeName(n), fn: enclosingName(n), text: n.getText().split('\n')[0].slice(0, 120) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const walkDir = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walkDir(p) : [p];
});

/**
 * 허용 목록 — `파일:함수:호출 이름` → 사유(함수 = 가장 가까운 이름 있는 함수. 같은 파일에 같은 호출이 다른 함수에서 새로 생기면 잡힌다). 매장 전환과 무관하거나(판이 매장마다 새로 마운트됨 · 매장이 바뀌지 않는 손님 화면)
 * 결과가 매장 경계를 넘어도 쓰기·표시 사고가 없는 곳만. **줄 번호가 아니라 호출 이름**으로 잠가 코드가 움직여도 유지된다.
 */
const ALLOW: Record<string, string> = {
  // 관리자 매장 목록의 행마다 `<VenueAdminRow key={v.id}>` 로 따로 마운트된다 — 한 인스턴스의 venueId 가 바뀌지 않는다.
  'features/AdminTab.tsx:VenueStaffManager:getVenueStaff': '행 key=venue.id — 매장마다 새 인스턴스',
  // 클락 빈 칸 '1탭 시작'(quickStart) — 누름 한 번 안에서 같은 클로저 venueId 로 메인 설정을 읽어 같은 매장 클락을 시작한다.
  //   화면 상태 `state?.config`·`sideGameDate(state, main)` 는 **읽는다**(쓰지는 않음) — 읽기만 하고 같은 클로저 매장으로 쓰므로 허용.
  'features/clock/TournamentClock.tsx:quickStart:getClockState': '누름 한 번 안의 읽기→같은 클로저 매장 쓰기(화면 상태 state?.config 는 읽기만)',
  // 칩 미리 데우기 — 결과를 `${venueId}|${영업일}` 키의 캐시에만 넣는다. 화면 상태를 건드리지 않아 매장 경계를 넘지 않는다.
  'features/VenueManageTab.tsx:warmGameChips:getLedgerGames': '요청 매장 키 캐시에만 기록',
};

describe('매장 판의 늦은 응답 가드 — 스캐너 표본(거짓 통과 방지)', () => {
  const n = (s: string) => scanVenueReads(s).length;
  it('잡아야 하는 모양 — review-store-link-1002b A4 의 7종 + 이전 2종', () => {
    expect(n('getLedgerSessionList(venueId).then((list) => {\n  setSessionList(list); });')).toBe(1);
    expect(n('getX(venueId).then(setX).catch(() => {})')).toBe(1);
    expect(n('getX(venueId,\n  d, g).then((s) => { setX(s); })'), '① 줄 넘김 인자').toBe(1);
    expect(n('getX(venueId).then((s) => { if (s) setX(s); })'), '② 응답 null 확인은 가드가 아니다').toBe(1);
    expect(n('getX(venueId).then(applyList)'), '③ set 이 아닌 콜백').toBe(1);
    expect(n('async function f() { const list = await getX(venueId);\n  setList(list); }'), '④ await').toBe(1);
    expect(n('getX(venueId).then(async (s) => { setX(s); })'), '⑤ async 화살표').toBe(1);
    expect(n('const v = venueId; getX(v).then(setX)'), '⑥ 별칭 변수').toBe(1);
    expect(n('getX({ venueId, date }).then(setX)'), '⑦ 객체 인자').toBe(1);
    expect(n('Promise.all([getX(venueId), getY(venueId)]).then(([a, b]) => { setA(a); setB(b); })'), 'Promise.all').toBe(2);
    expect(n('getX(venueId).catch(() => []).then((s) => setX(s))'), '.catch 를 지난 .then').toBe(1);
    expect(n('api.getX(venueId).then((s: Foo) => setX(s))'), '멤버 호출 · 타입 붙은 인자').toBe(1);
  });
  it('통과해야 하는 모양 — 밖의 값으로 판정하는 가드 · run · 쓰기', () => {
    expect(n('getX(venueId).then((s) => { if (alive) setX(s); })')).toBe(0);
    expect(n('getX(venueId, g).then((s) => {\n  // 주석\n  if (isStaleResponse(my, ref.current)) return; setX(s); })')).toBe(0);
    expect(n('getX(venueId).then((s) => on && setX(s))')).toBe(0);
    expect(n('async function f() { const s = await getX(venueId); if (!alive) return; setX(s); }')).toBe(0);
    expect(n("run('k', (v) => getX(v), setX)")).toBe(0);
    expect(n("run('k', () => getX(venueId), setX)"), 'run 안의 fetch 는 소비자가 run 이다').toBe(0);
    expect(n('saveX(venueId, w).then(() => setBusy(false))'), '쓰기는 대상이 아니다').toBe(0);
    expect(n('getX(venueId).then(guard(setX))'), '세대 가드 래퍼').toBe(0);
    expect(n('async () => { const stale = () => isStaleResponse(stamp, ref.current);\n  const rows = await getX(venueId); if (stale()) return; setX(rows); }'), '지역 클로저 가드').toBe(0);
    expect(n('async () => { const rows = await getX(venueId); const ok = rows.length > 0; if (ok) setX(rows); }'), '응답에서 나온 지역 변수는 가드가 아니다').toBe(1);
    expect(n('getX(venueId).then(applyGuard(setX))'), '모르는 래퍼는 가드로 치지 않는다').toBe(1);
    expect(n('async function f() { if (!venueId) return; const s = await getX(venueId); setX(s); }'), 'await 앞의 판정은 가드가 아니다').toBe(1);
    expect(n('getX(venueId).then((s) => { if (venueId) setX(s); })'), '클로저 venueId 는 가드가 아니다').toBe(1);
  });
  it('🔴 음성 표본 — 수정 전 StaffPayroll 인건비 조회를 잡는다(이 커밋이 고친 그 줄)', () => {
    const before = 'useEffect(() => {\n    setLoadErr(null);\n    getStaffWages(venueId)\n      .then((ws) => { const m = {}; ws.forEach((w) => (m[w.name] = w)); setWages(m); })\n      .catch((e) => { setWages({}); });\n  }, [venueId]);';
    expect(n(before)).toBe(1);
  });
});

describe('매장 판의 늦은 응답 가드 — src/components 전체', () => {
  it('🔴 가드 없이 매장 조회 결과를 쓰는 곳이 0곳이다(허용 목록 제외)', () => {
    const found: string[] = [];
    const used = new Set<string>();
    for (const p of walkDir(COMPONENTS)) {
      if (!/\.tsx?$/.test(p) || /\.test\.tsx?$/.test(p)) continue;
      const rel = relative(COMPONENTS, p).split(sep).join('/');
      for (const f of scanVenueReads(readFileSync(p, 'utf8'), p)) {
        const key = `${rel}:${f.fn}:${f.name}`;
        if (ALLOW[key]) { used.add(key); continue; }
        found.push(`${rel}:${f.line} ${f.text}`);
      }
    }
    expect(found).toEqual([]);
    // 허용 목록이 낡지 않게 — 더 이상 잡히지 않는 항목은 지운다
    expect(Object.keys(ALLOW).filter((k) => !used.has(k))).toEqual([]);
  });
});

const FILES = [
  'PresetManager.tsx', 'PresetPicker.tsx', 'NuriPosLedger.tsx', 'clock/TournamentClock.tsx',
  'KillSwitch.tsx', 'LedgerStatsPanel.tsx', 'VenueEventRequestPanel.tsx',
  // review-store-link-1002 2a(2026-10-02) — 같은 부류가 남아 있던 판
  'StaffSchedule.tsx', 'CustomerAnalytics.tsx', 'VenueCustomizePanel.tsx',
  // review-store-link-1002b A4(2026-10-02)
  'StaffPayroll.tsx',
];
describe('매장 판의 늦은 응답 가드 — 판별 구조', () => {
  for (const f of FILES) {
    it(`${f}: 매장 경계는 useVenueScope 한 곳으로 확인한다`, () => {
      expect(read(f)).toMatch(/useVenueScope\(venueId\)/);
    });
  }

  it('🔴 PresetManager: 매장이 바뀌는 렌더에서 편집 중 상태를 비운다(A 프리셋 폼이 B 로 넘어가 저장되지 않게)', () => {
    const src = read('PresetManager.tsx');
    const block = /if \(shownVenue !== venueId\) \{([\s\S]*?)\n\s*\}/.exec(src);
    expect(block, '매장 전환 리셋 블록이 없다').not.toBeNull();
    expect(block![1]).toMatch(/setEditing\(null\)/);
    expect(block![1]).toMatch(/setPresets\(null\)/);
  });

  it('🔴 NuriPosLedger: 매장이 바뀌는 렌더에서 장부 목록·삭제 대상을 비우고, 삭제는 누른 순간의 매장으로만 한다', () => {
    const src = read('NuriPosLedger.tsx');
    const block = /if \(listVenue !== venueId\) \{([\s\S]*?)\n\s*\}/.exec(src);
    expect(block, '매장 전환 리셋 블록이 없다').not.toBeNull();
    expect(block![1]).toMatch(/setSessionList\(\[\]\)/);
    expect(block![1]).toMatch(/setDelTarget\(null\)/);
    expect(src).toMatch(/run\('list', getLedgerSessionList,/);
    expect(src).toMatch(/deleteLedgerSession\(delTarget\.venueId,/);
    expect(src).toMatch(/delTarget\.venueId !== venueId/);
  });

  it('🔴 허용 목록 키는 `파일:함수:호출` — 같은 파일의 같은 호출이 허용 함수 밖에서 새로 생기면 키가 달라 잡힌다(verify-store-link-1002 §2-3)', () => {
    for (const k of Object.keys(ALLOW)) expect(k.split(':').length, k).toBe(3);
    // 재현된 주입: 허용된 quickStart 밖에 같은 이름(getClockState)의 무가드 호출이 한 줄 더 생김
    const injected = [
      'const quickStart = async () => { const s = await getClockState(venueId, 1); startClock(venueId, s); };',
      'function Other() { useEffect(() => { getClockState(venueId, 2).then(setX); }, []); }',
    ].join('\n');
    const keys = scanVenueReads(injected).map((f) => `${f.fn}:${f.name}`);
    expect(keys).toContain('quickStart:getClockState');
    expect(keys.filter((k) => k !== 'quickStart:getClockState'), '허용 함수 밖의 호출은 허용 키와 달라야 한다').toHaveLength(1);
  });

  it("🔴 O-1 NuriPosLedger: 직전 설정 취소(run.cancel('prefill'))는 첫 커밋 가드보다 앞이다 — 같은 매장 날짜 이동 때 앞 날짜 응답이 새 칸을 채우지 않게", () => {
    const src = read('NuriPosLedger.tsx');
    const cancel = src.indexOf("run.cancel('prefill')");
    const guard = src.indexOf('if (loading || sessionFor !== prefillKey) return;');
    expect(cancel, 'run.cancel(prefill) 가 없다').toBeGreaterThan(0);
    expect(guard, '판정 이펙트 가드가 없다').toBeGreaterThan(0);
    expect(cancel, '취소가 가드 뒤에 있으면 날짜가 바뀐 첫 커밋에서 취소되지 않는다').toBeLessThan(guard);
  });

  it('🔴 D-1 VenueMatchPanel: reload 는 run 의 Promise 를 돌려줘 `await reload()` 가 재조회가 끝날 때까지 처리 중 잠금을 유지한다', () => {
    const src = read('VenueMatchPanel.tsx');
    expect(src).toMatch(/const reload = useCallback\(\(\) => \(\s*vrun\('reload'/);
    expect(src).toMatch(/await reload\(\)/);
  });

  it('🔴 StaffSchedule: 매장이 바뀌는 렌더에서 직원 명부를 비운다(A 직원 id 가 B 시프트에 박히지 않게)', () => {
    const block = /if \(rosterVenue !== venueId\) \{([\s\S]*?)\}/.exec(read('StaffSchedule.tsx'));
    expect(block, '매장 전환 리셋 블록이 없다').not.toBeNull();
    expect(block![1]).toMatch(/setVenueStaff\(\[\]\)/);
  });

  it('🔴 StaffPayroll: 매장 전환 렌더에서 시급표를 비우고, 저장은 지금 매장 시급을 읽어 온 뒤에만 연다', () => {
    const src = read('StaffPayroll.tsx');
    const block = /if \(shownVenue !== venueId\) \{(.*)\}\r?$/gm;
    const blocks = [...src.matchAll(block)].map((m) => m[1]);
    expect(blocks.some((b) => /setWages\(\{\}\)/.test(b) && /setLoadedVenue\(null\)/.test(b)), '시급표 리셋 블록이 없다').toBe(true);
    expect(blocks.some((b) => /setNames\(\[\]\)/.test(b)), '명부 리셋 블록이 없다').toBe(true);
    expect(src).toMatch(/const canSave = loadedVenue === venueId && !loadErr;/);
    expect(src).toMatch(/if \(!canSave\) return;/);
  });
});
