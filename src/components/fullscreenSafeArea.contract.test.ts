// 전면 오버레이 재발 방지 계약 (2026-09-15)
//
// 무엇을 막는가 — **모바일에서만 나고 우리 하네스가 구조적으로 못 보는** 두 부류다.
//
// ① 상단 안전영역 미예약
//   index.html 의 viewport 가 `viewport-fit=cover` 이고 설치형 상태바가 black-translucent 라,
//   화면 전체를 덮는 오버레이는 **내용이 상태바·노치 밑으로 들어간다.**
//   에뮬레이션에서는 env(safe-area-inset-*) 가 **항상 0** 이라 PC 하네스로는 영원히 안 보인다
//   (dvh 와 같은 부류다 — dynamicViewportUnit.contract.test.ts 머리말 참고).
//   실측 방법: dist 사본의 CSS 선언만 top=47/bottom=34 로 치환해 서빙하고 대조군과 좌표를 비교했다.
//   그때 잡힌 것: EventPage 의 닫기 버튼이 11~53 에 그대로 있어 47px 아래 **6px** 만 손가락에 닿았다.
//   ⚠ 안전영역은 **루트 스크롤러가 아니라 머리말에** 얹어야 한다 — 루트에 얹으면 그 안의
//     sticky top-0 머리말이 스크롤포트 top=0 에 붙어 스크롤하는 순간 다시 상태바로 들어간다.
//
// ② 합성 힌트가 position:fixed 자손을 가둔다
//   transform 이 걸린 요소는 `position: fixed` 자손의 **컨테이닝 블록**이 된다(CLAUDE.md 참고 메모).
//   전면 오버레이가 스스로 스크롤하는 판이면, 그 안의 fixed 요소는 화면에 붙지 못하고 **같이 흘러간다.**
//   격리 재현(390×844, translateZ(0) 유무만 다른 두 판): 600px 스크롤에서 하단 바가 top 804 → 204.
//   운영자 장부 뷰가 정확히 이 모양이었다(정산 바가 fixed).
//
// ⚠ 이 파일을 고칠 때 — **막으려는 클래스 이름을 평문으로 쓰지 마라.**
//   tailwind.config.js 의 content 가 `./src/**/*.{js,ts,jsx,tsx}` 를 평문 스캔해 주석 속 이름까지
//   CSS 를 만든다(2026-09-15 b09c7a8 실측). 아래 판정기가 이름을 조각으로 조립하는 이유다.
//
// 실행: npx vitest run src/components/fullscreenSafeArea.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(__dirname, '..');

/** 주석을 지운다 — 이 파일·다른 파일의 **설명문**을 코드로 오인하지 않게. 판정기는 코드만 본다.
 *  ⚠ 줄바꿈은 남긴다. 블록 주석을 공백 한 칸으로 접으면 줄 번호가 밀려 **엉뚱한 줄을 지목한다**
 *  (음성 대조에서 실제로 137줄을 111줄이라고 보고했다). 보고가 틀리면 게이트를 못 믿는다. */
const codeOnly = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/** 이름을 조각으로 조립한다 — 위 ⚠ 참고(평문으로 쓰면 죽은 CSS 가 번들에 실린다). */
const TRAPS = ['transform' + '-gpu', 'will' + '-change-transform', 'backdrop' + '-filter'];

/** 면제. **빈 이유는 면제가 아니다**(아래 검사가 거절한다). */
const ALLOWED: Record<string, string> = {
  'components/features/clock/ClockDisplay.tsx':
    '클락 TV 송출 전용 루트 — 노치도 홈 인디케이터도 없는 대형 스크린이고, container-type:size 는 '
    + '컨테이너 쿼리 때문에 반드시 있어야 한다(없으면 TV 가 1열로 굳는다).',
};

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
};

/** 화면 전체를 덮는 '판'인가 — 가운데 대화상자·바텀시트는 띠에 닿지 않으므로 뺀다. */
const isPage = (cls: string): boolean =>
  !/items-center|items-end|justify-center/.test(cls);

type Hit = { file: string; line: number; cls: string };

const collect = (files: string[]): Hit[] => {
  const hits: Hit[] = [];
  for (const p of files) {
    const rel = relative(SRC, p).split(sep).join('/');
    if (rel === 'components/fullscreenSafeArea.contract.test.ts') continue;
    const lines = codeOnly(readFileSync(p, 'utf-8')).split('\n');
    lines.forEach((ln, i) => {
      if (!/fixed inset-0/.test(ln)) return;
      if (!isPage(ln)) return;
      hits.push({ file: rel, line: i + 1, cls: ln.trim() });
    });
  }
  return hits;
};

describe('화면 전체를 덮는 오버레이 — 안전영역과 컨테이닝 블록', () => {
  const files = walk(SRC);
  const rel = (p: string) => relative(SRC, p).split(sep).join('/');
  // 주석을 지운 판으로 본다 — **설명문에 적어 둔 것이 예약으로 읽히면** 계약이 거짓 통과한다.
  const src = new Map(files.map((p) => [rel(p), codeOnly(readFileSync(p, 'utf-8'))]));
  const hits = collect(files);

  it('src 를 실제로 읽었다(앵커가 비면 이 테스트는 아무것도 안 본다)', () => {
    expect(files.length, 'src 에서 .tsx 를 하나도 못 읽었다').toBeGreaterThan(100);
    expect(hits.length, '전면 오버레이를 하나도 못 찾았다 — 판정기가 죽었다는 뜻이다').toBeGreaterThan(3);
  });

  it('전면 오버레이는 상단 안전영역을 예약한다', () => {
    const offenders = hits
      .filter((h) => !(h.file in ALLOWED))
      .filter((h) => !/safe-area-inset-top/.test(src.get(h.file) ?? ''))
      .map((h) => `${h.file}:${h.line}`);
    expect(
      offenders,
      'viewport-fit=cover 라 화면 전체를 덮는 판은 내용이 상태바·노치 밑으로 들어간다.\n'
        + '에뮬레이션은 env(safe-area-inset-*) 가 항상 0이라 PC 로는 절대 안 보인다 — 그래서 소스에서 막는다.\n'
        + '머리말(sticky 포함)에 상단 inset 을 얹어라. 루트 스크롤러에 얹으면 sticky 가 다시 올라붙는다.\n'
        + `그래도 필요 없으면 이 파일 ALLOWED 에 이유와 함께 적어라.\n대상: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('전면 오버레이에 합성 힌트를 걸지 않는다 — position:fixed 자손이 화면에서 떨어진다', () => {
    const offenders = hits
      .filter((h) => TRAPS.some((t) => h.cls.includes(t)))
      .map((h) => `${h.file}:${h.line}`);
    expect(
      offenders,
      'transform/filter 계열이 걸린 요소는 `position: fixed` 자손의 컨테이닝 블록이 된다.\n'
        + '전면 오버레이가 스스로 스크롤하면 그 안의 fixed 요소가 화면에 안 붙고 같이 흘러간다\n'
        + '(격리 실측: 600px 스크롤에 하단 바가 top 804 → 204).\n'
        + `대상: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('면제 목록이 현실과 맞다 — 사라진 파일·빈 이유가 남아 있지 않다', () => {
    const 빈이유 = Object.entries(ALLOWED).filter(([, why]) => !why || why.trim().length < 10).map(([f]) => f);
    expect(빈이유, `ALLOWED 의 이유가 비었거나 너무 짧다: ${빈이유.join(', ')}`).toEqual([]);

    const 사라진 = Object.keys(ALLOWED).filter((f) => !hits.some((h) => h.file === f));
    expect(사라진, `ALLOWED 에 남아 있지만 더는 전면 오버레이가 아니다 — 지워야 검사가 좁아진다: ${사라진.join(', ')}`).toEqual([]);
  });
});
