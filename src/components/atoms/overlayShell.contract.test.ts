// 소스 계약 — 전체화면 오버레이의 PC 폭 처방은 `atoms/OverlayShell.tsx` 하나뿐이다 (2026-09-21)
//
// 왜: 2026-09-18 `45934b6` 이 같은 처방(`max-w-6xl` 셸)을 EventPage·EventListPage **두 파일에 각각** 넣었다.
//     두 벌이 된 순간 한쪽만 깨져도 반대쪽만 보는 검사는 초록이다 — 2026-09-21 에 실제로 그랬다:
//     `e2e/pc-store-regression.spec.ts` 가 목록만 재던 동안 **보드의 폭 제한을 지운 음성 대조가 통과했다.**
//     e2e 는 지금 두 판을 다 재도록 고쳤지만, **세 번째 화면**은 e2e 가 존재를 모르니 못 잡는다. 그 몫이 이 파일이다.
//
// 보는 것: ① `max-w-6xl` 토큰의 **파일별 참조 수**(새 파일이 처방을 재구현하면 목록에서 틀어진다)
//          ② 배선 앵커 — 두 이벤트 화면이 정말 `OverlayShell` 을 감싸고 있는가(import 만 해 두면 못 잡으니 여닫는 태그까지)
//          ③ 정본이 진짜로 폭을 걸고 있는가(정본이 비면 ①②가 전부 공허해진다)
//
// 못 보는 것: 렌더된 **실제 픽셀 폭**(그건 e2e `pc-store-regression.spec.ts` 의 1440 측정 몫),
//             클래스를 안 쓰고 인라인 style·다른 유틸(`w-[1224px]`)로 같은 폭을 재구현한 복제,
//             `src/` 밖(`e2e/`·최상위 `api/`)의 복제. 소스 텍스트만 본다.
//
// 음성 대조(2026-09-21 실측): OverlayShell 의 className 에서 `max-w-6xl` 을 지우면 ①의 목록에서
//     `components/atoms/OverlayShell.tsx` 가 빠지고 ③이 "정본이 폭을 안 건다" 로 함께 빨개진다.
//     EventPage 에 옛 `<div className="mx-auto w-full max-w-6xl …">` 를 되살리면 ①이 파일 하나 늘어 빨개진다.
//
// 실행: npx vitest run src/components/atoms/overlayShell.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (code: string, re: RegExp) =>
  (code.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); continue; }
    if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC);
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('OverlayShell — PC 폭 처방은 한 곳이다', () => {
  // 🔴 스캔이 빈손이면 아래 단언이 전부 "0건이라 통과" 가 된다. 먼저 막는다(2026-09-21 실측 355파일).
  it('소스 스캔이 실제로 파일을 걷었다', () => {
    expect(FILES.length, 'walk 가 src 를 못 걸었다 — 이 파일의 모든 계약이 빈 검사다').toBeGreaterThan(300);
  });

  // ③ 정본이 비어 있으면 ①②는 "아무도 안 쓰는 빈 껍데기" 를 통과시킨다.
  it('🔴 정본이 실제로 앱 셸과 같은 폭을 건다', () => {
    const shell = strip(read('components/atoms/OverlayShell.tsx'));
    expect(shell, 'OverlayShell 이 폭을 안 건다 — 껍데기만 남았다').toMatch(
      /className="mx-auto w-full max-w-6xl xl:min-h-full xl:border-x xl:border-border-subtle"/,
    );
    expect(count(shell, /\bmax-w-6xl\b/), '정본 안에서도 두 번 적으면 그것부터 복제다').toBe(1);
  });

  // ① 토큰 참조 수 — 새 화면이 처방을 재구현하면 목록이 틀어져 사람이 한 번 본다.
  //    ⚠ `max-w-6xl` 의 나머지 3곳은 **다른 계약**이라 지우면 안 된다:
  //      App.tsx = 앱 셸 본체(오버레이가 따라가는 원본) · Modal.tsx = size prop 표의 '6xl' 값 ·
  //      AdminTab.tsx = 관리자 본문 안쪽 패딩 컨테이너(이미 셸 안이라 폭을 새로 걸지 않는다).
  it('🔴 max-w-6xl 을 적는 파일은 실측 목록 그대로다', () => {
    const EXPECT: Record<string, number> = {
      'App.tsx': 1,
      'components/atoms/Modal.tsx': 1,
      'components/atoms/OverlayShell.tsx': 1,
      'components/features/AdminTab.tsx': 1,
    };
    const hits = Object.fromEntries(
      FILES
        .map((p) => [relative(SRC, p).replace(/\\/g, '/'), count(strip(readFileSync(p, 'utf8')), /\bmax-w-6xl\b/)] as const)
        .filter(([, n]) => n > 0),
    );
    expect(hits, '전체화면 오버레이의 폭 처방이면 OverlayShell 을 써라. 다른 용도라면 위 표에 줄과 이유를 더해라')
      .toEqual(EXPECT);
  });

  // ② 배선 앵커 — import 만 해 두고 안 감싸면 ①은 통과한다(호출부가 토큰을 안 쓰니까).
  //    여는 태그·닫는 태그를 같이 세야 "감쌌다" 가 증명된다.
  it.each([
    ['components/features/EventPage.tsx', '이벤트 보드'],
    ['components/features/EventListPage.tsx', '이벤트 목록'],
  ])('🔴 %s 가 OverlayShell 로 본문을 감싼다', (rel, 이름) => {
    const code = strip(read(rel));
    expect(count(code, /^import OverlayShell from '\.\.\/atoms\/OverlayShell';/m),
      `${이름} 이 정본을 import 하지 않는다`).toBe(1);
    expect(count(code, /<OverlayShell>/), `${이름} 본문을 감싸는 여는 태그가 1개가 아니다`).toBe(1);
    expect(count(code, /<\/OverlayShell>/), `${이름} 의 닫는 태그가 1개가 아니다`).toBe(1);
    // 음성 대조 — 옛 인라인 셸이 되살아나면 두 벌 상태로 되돌아간 것이다.
    expect(code, `${이름} 에 옛 인라인 셸이 남았다 — OverlayShell 하나만 남겨라`)
      .not.toMatch(/className="mx-auto w-full max-w-6xl/);
  });
});
