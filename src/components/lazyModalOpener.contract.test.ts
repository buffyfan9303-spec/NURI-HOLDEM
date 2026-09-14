// lazy 오버레이를 **그냥 setState 로 여는 것** 재발 방지 계약 (2026-09-15)
//
// 무엇을 막는가
//   `lazyWithReload` 는 `lazy(async () => …)` 라 **청크가 이미 캐시에 있어도 첫 렌더는 반드시 한 번
//   서스펜드**한다. 그 상태 변경이 트랜지션이 아니면 리액트는 Suspense 폴백(불투명 전면 오버레이)을
//   **커밋해야만 하고**, 한 번 커밋한 폴백을 **최소 ~300ms 붙잡는다**(폴백이 번쩍이는 걸 막으려는 스로틀).
//   사용자 눈에는 "눌렀는데 한 번 번쩍이고 들어간다" 로 보인다.
//
// 🔴 "청크를 미리 받아 두면 되지 않나" — **안 된다. 실측으로 두 번 확인했다.**
//   App.tsx 의 warm() 이 청크를 idle 에 받아 두는데도 증상이 같았다(2026-09-15: 9초 데운 뒤에도 363ms).
//   서스펜드는 **캐시 여부가 아니라 lazy 의 첫 렌더**에서 일어나기 때문이다. 고치는 방법은 하나다 —
//   **여는 상태 변경을 `startTransition` 에 넣는 것.** 그러면 리액트가 폴백을 커밋하지 않고
//   준비될 때까지 이전 화면을 유지한다.
//
// 실제로 났던 일 (전부 오너 리포트)
//   · 2026-09-08 "티켓 아이콘 처음 누르면 안 가지고 두 번 눌러야 이동이 돼"  → EventPage
//   · 2026-09-15 "출석 이벤트를 클릭하면 한번 번쩍이면서 들어가줘"            → 로그인·약관·고객센터
//   · 2026-09-15 "공지 열 때 멈칫"                                          → 공지 상세·장터 상세
//   같은 부류가 **세 번** 다른 얼굴로 돌아왔다. 그래서 소스에서 막는다.
//
// ⚠ 이 검사가 **일부러 좁은** 곳
//   1. **App.tsx 안으로 한정한다.** setter 이름은 파일마다 겹친다 — 실제로 조사 중
//      `DealerCommunity.tsx` 의 **동명이인 로컬 상태**(lazy 아닌 평범한 Modal)를 잘못 지목한 적이 있다.
//      lazy 컴포넌트와 그것을 여는 상태가 같은 파일에 있을 때만 이어야 참이다.
//   2. **함수형 갱신(setX 에 콜백을 넘기는 형태)은 여는 코드로 치지 않는다.** 그건 이미 열려 있는 것을
//      고치거나 닫는 코드다.
//   3. `flushSync` 도 통과시킨다 — View Transition 경로는 **일부러 동기 커밋**을 한다(포스터 모핑).
//
// ⚠ **무엇이 '닫기' 인지는 게이트 형태가 정한다.** 이걸 일률적으로 정했다가 결함을 놓쳤다:
//   `posterFormTarget !== null` 게이트에서 `setPosterFormTarget(undefined)` 는 **여는 값**이다
//   (새 포스터 등록). 닫는 값은 `null` 하나뿐이다. 그래서 게이트 조건을 읽어서 판정한다.
//
// 이 검사가 못 보는 것
//   · 다른 파일에서 자기 lazy 모달을 그냥 여는 경우(위 1번의 대가다. 넓히면 거짓 양성이 돌아온다).
//   · setter 를 변수·객체에 담아 간접 호출하는 경우.
//   · JSX 형태가 특이해 게이트를 못 잡는 오버레이(IIFE 안, Suspense 로 한 번 더 감싼 것 등).
//     앵커 검사가 "몇 개 이상"만 보장하지 전수를 보장하지 않는다는 뜻이다.
// 실행: npx vitest run src/components/lazyModalOpener.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(__dirname, '..', 'App.tsx');

/** 주석을 지우되 **줄 수는 보존**한다(줄번호를 보고해야 하므로).
 *  조사 중 블록 주석을 길이만큼 공백으로 치환했다가 줄번호가 통째로 어긋난 적이 있다. */
const codeOnly = (input: string): string =>
  input
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/gm, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));

type GateKind = 'notnull' | 'truthy';

/** 여는 자리인데 트랜지션이 아니어도 되는 곳 — **이유를 반드시 적는다.** */
const ALLOWED: Record<string, string> = {
  setOpenSchedule:
    '일정 상세는 포스터 모핑(View Transition) 경로다 — withViewTransition + flushSync 로 동기 커밋해야 스냅샷이 맞는다.',
  setOpenPost:
    '딥링크 복원 이펙트(부팅·URL 변경)에서 부르는 경로가 남아 있다. 사용자 클릭 경로(openPostWithNav)는 트랜지션으로 열린다.',
};

describe('lazy 오버레이는 트랜지션으로 연다 — 안 그러면 폴백이 ~300ms 번쩍인다', () => {
  const src = codeOnly(readFileSync(APP, 'utf-8'));
  const lines = src.split('\n');

  const lazies = new Set([...src.matchAll(/const\s+(\w+)\s*=\s*lazyWithReload\(/g)].map((m) => m[1]));

  const gates = new Map<string, { comps: Set<string>; kind: GateKind }>();
  const note = (st: string, comp: string, kind: GateKind) => {
    if (!lazies.has(comp)) return;
    if (!gates.has(st)) gates.set(st, { comps: new Set(), kind });
    gates.get(st)!.comps.add(comp);
  };
  for (const m of src.matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*(!==\s*null|!==\s*undefined)?\s*&&\s*\(?\s*\n?\s*<(\w+)/g)) {
    note(m[1], m[3], m[2] ? 'notnull' : 'truthy');
  }
  for (const m of src.matchAll(/<(\w+)\s+open=\{([A-Za-z_$][\w$]*)\}/g)) note(m[2], m[1], 'truthy');

  /** setter -> 상태 */
  const setters = new Map<string, string>();
  for (const st of gates.keys()) {
    const m = new RegExp(`const\\s*\\[\\s*${st}\\s*,\\s*(\\w+)\\s*\\]`).exec(src);
    if (m) setters.set(m[1], st);
  }

  it('앵커 — App.tsx 를 실제로 읽었고 lazy 오버레이와 그 게이트를 찾아냈다', () => {
    // 앵커가 비면 아래 검사는 **아무것도 안 보면서 통과**한다. 그게 제일 위험한 실패다.
    expect(lazies.size, 'lazyWithReload 컴포넌트를 하나도 못 찾았다').toBeGreaterThan(10);
    expect(gates.size, 'lazy 를 감싸는 게이트 상태를 못 찾았다').toBeGreaterThan(5);
    expect(setters.size, '게이트 상태의 setter 를 못 찾았다').toBeGreaterThan(5);
  });

  it('여는 호출은 startTransition(또는 VT 의 flushSync) 안에 있다', () => {
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      for (const [setter, st] of setters) {
        if (setter in ALLOWED) continue;
        for (const m of line.matchAll(new RegExp(`\\b${setter}\\(`, 'g'))) {
          const arg = line.slice(m.index! + setter.length + 1);
          const close = gates.get(st)!.kind === 'notnull'
            ? /^\s*null\s*\)/
            : /^\s*(null|false|undefined)\s*\)/;
          if (close.test(arg)) continue;        // 닫기 — 무엇이 닫기인지는 게이트 형태가 정한다(위 주석)
          if (/^\s*\(/.test(arg)) continue;     // 함수형 갱신 — 여는 코드가 아니다
          const ctx = (lines[i - 1] ?? '') + line;
          if (/startTransition|flushSync|startTabTransition/.test(ctx)) continue;
          offenders.push(`App.tsx:${i + 1}  (${setter} → ${st})  ${line.trim().slice(0, 100)}`);
        }
      }
    });
    expect(
      offenders,
      'lazy 오버레이를 그냥 setState 로 열고 있다. 청크가 캐시에 있어도 첫 렌더는 서스펜드하므로\n'
        + '리액트가 불투명 폴백을 커밋하고 **최소 ~300ms** 붙잡는다("한 번 번쩍이고 들어감").\n'
        + 'startTransition(() => setX(...)) 로 감싸라. 미리 받아 두는 것으로는 안 고쳐진다(실측).\n'
        + `정말 예외면 이 파일 ALLOWED 에 **이유와 함께** 적어라.\n대상:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('면제 목록이 현실과 맞다 — 사라진 setter·빈 이유가 남아 있지 않다', () => {
    const 빈이유 = Object.entries(ALLOWED).filter(([, w]) => !w || w.trim().length < 15).map(([k]) => k);
    expect(빈이유, `ALLOWED 의 이유가 비었거나 너무 짧다: ${빈이유.join(', ')}`).toEqual([]);

    const 사라진 = Object.keys(ALLOWED).filter((k) => !setters.has(k));
    expect(사라진, `ALLOWED 에 이제 없는 setter 가 남아 있다 — 지워야 검사가 좁아진다: ${사라진.join(', ')}`).toEqual([]);
  });
});
