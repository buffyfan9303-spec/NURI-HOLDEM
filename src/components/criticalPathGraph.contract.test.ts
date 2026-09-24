// 첫 화면 임계 경로 재진입 방지 계약 (2026-09-20)
//
// 무엇을 막는가
//   `src/App.tsx` 에서 정적 import 를 끊어 index 청크 밖으로 내보낸 모듈이, 나중에
//   **다른 경로로 조용히 되돌아오는 것**을 막는다. 되돌아오는 길은 두 가지다.
//     ① App.tsx 가 다시 정적으로 문다(`import { getRankingsBulk } from './api/rankings'`).
//     ② App.tsx 가 정적으로 무는 **다른 모듈**이 문다(예: HomeTab 이 api/rankings 를 import).
//   ②가 이 계약의 존재 이유다. ①만 보는 검사는 공허한 참이 된다 — 실제로 `ScheduleCard` 는
//   App.tsx 에서 빼도 **HomeTab 이 물고 있어** 임계 경로에 그대로 남는다(2026-09-20 실측).
//   그래서 App.tsx 에서 시작하는 **정적 그래프 전체**를 걸어서 판정한다.
//
// 실측 근거 (2026-09-20 · 실 env 프로덕션 빌드 · dist gzip 직접 계측)
//     첫 화면 임계 경로  259.9 → 254.9 KB gz   (예산 267 · 여유 3% → 5%)
//     최대 청크(index)   115.7 → 111.2 KB gz   (예산 117 · 여유 1% → 5%)
//     JS 전체            999.9 → 1003.7 KB gz  (예산 1007 · 여유 1% → 0%)  ← 분할의 대가
//
//   🔴 **분할은 공짜가 아니다.** 떼어낸 청크를 따로 gzip 한 합계는 index 가 잃은 양보다 **크다**
//   (작은 스트림은 압축이 덜 된다). 그래서 모듈마다 `임계 경로 감소 : JS 전체 증가` 비를 내고 판단했다:
//     계산법 = gzip(index + 그 청크) − gzip(index) 가 '감소', (청크 단독 gz − 그 값)이 '증가'.
//       api/rankings      3.54 : 0.28  = 12.5 : 1   ← 채택
//       api/reservations  2.74 : 0.27  = 10.2 : 1   ← 채택
//       api/reviews       0.87 : 0.19  =  4.5 : 1   ← 채택
//       ScheduleTable     0.67 : 0.50  =  1.3 : 1   ← **되돌렸다**(아래 참고)
//   ⚠ 그래서 **'JS 전체' 예산은 이 작업으로 줄지 않고 오히려 는다.** 목표는 임계 경로와 최대 청크이고,
//     JS 전체는 '안 나빠지게 지키는' 칸이다. 비가 1:1 에 가까운 것은 떼어내 봐야 손해다.
//
// 🔴 `ScheduleTable` 을 여기 **다시 넣지 마라.** 2026-09-20 에 lazy 로 돌렸다가 위 비(1.3:1) 때문에
//   되돌렸다. 바이트도 남는 게 없었지만, 없던 Suspense 경계·스켈레톤 폴백·warm() 프리워밍이
//   전부 새로 필요해졌다(`lazyWithReload` 는 캐시가 있어도 첫 렌더에 한 번 서스펜드한다).
//   `src/App.tsx` 의 ScheduleTable import 위 주석에 같은 내용을 박아 뒀다.
//
// 이 검사가 못 보는 것
//   · `import()` 뒤에 실제로 무엇이 딸려 오는지(동적 경계 너머는 안 센다 — 그건 청크 크기 문제다).
//   · 외부 패키지(node_modules) — 벤더 청크 몫이라 여기서 판정하지 않는다.
//   · 경로를 변수로 조립한 import(정적 문자열만 본다).
//   · 실제 gz 바이트. 그건 `npm run bundle:budget` 의 몫이고, 이 계약은 **원인 쪽**을 잠근다.
//
// 음성 대조(2026-09-20 확인): `src/App.tsx` 의 `const rankingsMod = () => import('./api/rankings');` 를
//   `import { getRankingsBulk } from './api/rankings';` 로 되돌리면 이 파일이 빨개진다.
// 실행: npx vitest run src/components/criticalPathGraph.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const ROOT = process.cwd();
const ENTRY = resolve(ROOT, 'src/App.tsx');
const EXTS = ['.ts', '.tsx', '.js', '.jsx'];

/** 상대 경로 import 만 해석한다(외부 패키지는 벤더 청크 몫이라 판정 대상이 아니다). */
function resolveMod(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const e of ['', ...EXTS, ...EXTS.map((x) => `/index${x}`)]) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** 정적 import/export-from 만 뽑는다. `import(...)` 는 **일부러** 안 잡는다 — 그게 경계다.
 *  `import type` 한 줄은 런타임 코드를 만들지 않으므로 뺀다(타입은 임계 경로 비용이 0이다). */
const RE_STATIC = /(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const RE_TYPEONLY = /(?:^|\n)\s*import\s+type\s/;

const depCache = new Map<string, string[]>();
function depsOf(file: string): string[] {
  const hit = depCache.get(file);
  if (hit) return hit;
  const src = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(RE_STATIC)) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const lineEnd = src.indexOf('\n', m.index + 1);
    const line = src.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (RE_TYPEONLY.test(`\n${line}`)) continue;
    const r = resolveMod(file, m[1]);
    if (r) out.push(r);
  }
  depCache.set(file, out);
  return out;
}

/** App.tsx 에서 정적으로만 걸어서 닿는 모듈 전체 = index 청크에 실리는 소스 집합. */
function staticGraph(): Map<string, string[]> {
  const seen = new Map<string, string[]>();   // 모듈 → 그 모듈을 무는 부모들
  const stack = [ENTRY];
  seen.set(ENTRY, []);
  while (stack.length) {
    const f = stack.pop() as string;
    for (const d of depsOf(f)) {
      const parents = seen.get(d);
      if (parents) { parents.push(f); continue; }
      seen.set(d, [f]);
      stack.push(d);
    }
  }
  return seen;
}

/** 임계 경로에 **다시 들어오면 안 되는** 모듈 + 대신 쓰는 진입점.
 *  ⚠ 여기서 빼려면 bundle:budget 전후 수치를 근거로 같이 적어라. */
const BANNED: { mod: string; why: string; instead: string; at?: string }[] = [
  // 2026-09-24 — '지난 대회' 컴포넌트가 App.tsx 에서 PastTournaments.tsx(shellDeferred 청크)로 옮겨 가며 진입점도 따라갔다.
  { mod: 'src/api/rankings.ts',     why: "호출부는 '지난 대회' 아카이브 이펙트 1곳뿐이다(12.5:1)",    instead: "const rankingsMod = () => import('../../api/rankings');", at: 'src/components/features/PastTournaments.tsx' },
  { mod: 'src/api/reservations.ts', why: '호출부는 browse 게이트·오늘예약 이펙트 2곳뿐이다(10.2:1)',  instead: "const reservationsMod = () => import('./api/reservations');" },
  { mod: 'src/api/reviews.ts',      why: '호출부는 loadDeferred(유휴) 1곳뿐이다(4.5:1)',              instead: "const reviewsMod = () => import('./api/reviews');" },
];

describe('첫 화면 임계 경로 계약 — 떼어낸 모듈이 되돌아오지 않는다', () => {
  const graph = staticGraph();

  it('대조군 — 그래프 자체가 살아 있다(빈 집합에 대고 통과 선언하지 않는다)', () => {
    // 이 검사가 없으면 파서가 고장나 그래프가 비었을 때도 아래 전부가 통과한다(공허한 참).
    expect(graph.size, 'App.tsx 정적 그래프가 비정상적으로 작다 — 파서가 깨졌다').toBeGreaterThan(50);
    // 첫 화면에 **반드시 있어야 하는** 것들이 실제로 잡히는가
    // ScheduleTable 이 여기 있는 것은 **의도한 상태**다 — 위 머리말의 1.3:1 참고(되돌린 것이다).
    for (const must of ['src/components/features/HomeTab.tsx', 'src/api/community.ts',
      'src/components/features/ScheduleCard.tsx', 'src/components/features/ScheduleTable.tsx']) {
      expect(graph.has(resolve(ROOT, must)), `${must} 가 정적 그래프에 없다 — 파서가 무언가를 놓치고 있다`).toBe(true);
    }
  });

  for (const { mod, why, instead } of BANNED) {
    it(`${mod} 는 정적 그래프에 없다`, () => {
      const abs = resolve(ROOT, mod);
      const parents = graph.get(abs);
      const via = parents?.map((p) => relative(ROOT, p).replace(/\\/g, '/')).join(', ');
      expect(
        parents,
        `${mod} 가 첫 화면 임계 경로로 되돌아왔다 (무는 쪽: ${via}).\n`
        + `  왜 뺐나: ${why}\n`
        + `  대신 쓸 것: ${instead}\n`
        + '  ⚠ App.tsx 만 고쳐도 안 된다 — 위 "무는 쪽" 이 App.tsx 가 아니면 그 파일을 고쳐야 한다.',
      ).toBeUndefined();
    });
  }

  it('동적 진입점이 실제로 App.tsx(또는 옮겨 간 파일)에 있다 — 끊기만 하고 호출부를 잃지 않았다', () => {
    for (const { instead, at } of BANNED) {
      const app = readFileSync(at ? resolve(ROOT, at) : ENTRY, 'utf8');
      // 공백 수는 정렬 때문에 흔들린다 — 토큰 단위로 본다
      const tokens = instead.split(/\s+/).filter(Boolean);
      const re = new RegExp(tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'));
      expect(app, `${at ?? 'App.tsx'} 에서 진입점을 못 찾았다: ${instead}`).toMatch(re);
    }
  });

  // 🔴 반대 방향 계약 — 보안·법적 게이트는 **첫 화면 정적 그래프에 있어야 한다**(2026-09-24 verifier 반려).
  //   번들을 줄이려고 ConsentGateModal 을 지연 청크로 옮기자 청크가 늦는 동안 미동의 회원이 앱을 그대로 썼다(3초 지연 실측).
  //   실행 확인은 e2e/consent-gate-race.spec.ts 가 한다 — 이 칸은 원인(정적 import)을 잠근다.
  it('법적 동의 게이트(ConsentGateModal)는 지연 청크가 아니라 정적 그래프에 있다', () => {
    const gate = resolve(ROOT, 'src/components/features/ConsentGateModal.tsx');
    expect(graph.get(gate)?.map((p) => relative(ROOT, p).replace(/\\/g, '/')),
      'ConsentGateModal 이 첫 화면 정적 그래프에서 빠졌다 — 청크가 늦는 동안 미동의 회원을 막을 곳이 없어진다').toContain('src/App.tsx');
  });
});
