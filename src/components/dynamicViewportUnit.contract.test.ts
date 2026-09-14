// `dvh` 재발 방지 계약 (2026-09-15)
//
// 무엇을 막는가
//   `dvh`(dynamic viewport height)는 **모바일 주소창이 접히고 펴지는 것을 따라가도록 정의된** 단위다.
//   그게 이 단위의 목적이고, 그래서 **레이아웃 높이에 쓰면 화면이 흔들린다**:
//     주소창이 움직인다 → dvh 가 변한다 → 그 칸의 높이가 변한다 → 문서 높이가 변한다
//     → 스크롤 가능 여부가 뒤집히면 주소창이 다시 움직인다 → 되먹임 고리.
//
// 실제로 났던 일 (오너 리포트 2026-09-15, 안드로이드 크롬)
//   "누리 스팟 … 내 스팟 눌러보면 내 스팟 쪽이 깜빡이고 있어" → 확인해 보니 **화면 전체가 흔들리는** 것이었다.
//   `MySpotList.tsx` 의 빈 화면이 min-height 를 50dvh 로 잡고 있었고, 그 패널은 자체 스크롤 컨테이너가 없어
//   **페이지가 스크롤**된다(= 주소창이 움직인다). 저장소 전체에서 뷰포트 단위는 그 한 곳뿐이었다.
//
// 🔴 이 부류가 특히 위험한 이유 — **PC 에서는 재현되지 않는다.**
//   데스크톱에는 주소창 접힘이 없어 `dvh` == `svh` == `lvh` 다. 그래서 PC 하네스로 뷰포트 높이를
//   아무리 훑어도 "혐의 없음"이 나온다(2026-09-15 조사가 실제로 그렇게 결론 낼 뻔했다).
//   **재현 못 했다고 없는 것이 아니다.** 사람이 눈으로 잡을 때까지 방치되므로 소스에서 막는다.
//
// 대신 무엇을 쓰나
//   · `svh` — 주소창이 **보이는** 상태의 높이로 고정. 명세상 변하지 않는다. 레이아웃 높이의 기본값이다.
//   · `lvh` — 주소창이 **숨은** 상태의 높이로 고정. 변하지 않지만 주소창 뒤로 잘릴 수 있다.
//   · 아예 안 쓰기 — `min-h-[Npx]` 나 flex 로 풀리면 그게 제일 안전하다.
//
// 정말 `dvh` 가 필요하면(주소창을 **따라가야 하는** 전면 오버레이 등) 이 파일의 ALLOWED 에
// 파일 경로와 **이유**를 적어라. 적는 순간 다음 사람이 그 판단을 검토할 수 있다.
// ⚠ 이 파일을 고칠 때 — **금지하려는 클래스명을 주석에 그대로 쓰지 마라.**
//   tailwind.config.js 의 content 가 `./src/**/*.{js,ts,jsx,tsx}` 를 **평문으로** 스캔한다.
//   주석인지 코드인지 가리지 않으므로, 여기에 그 클래스를 적으면 Tailwind 가 실제로 CSS 를 만들어
//   번들에 **죽은 규칙**이 남는다(2026-09-15 실측: 라이브 CSS 에 `min-height:50dvh` 가 그대로 실렸다).
//   설명이 필요하면 대괄호 형태를 피해서 풀어 써라.
// 실행: npx vitest run src/components/dynamicViewportUnit.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(__dirname, '..');

/** 주석을 지운다 — 위 설명문처럼 **`dvh` 를 설명하는 글**을 코드로 오인하지 않게.
 *  (2026-09-15 같은 세션에서 자기 주석에 걸려 3번 헛돈 적이 있다. 판정기는 코드만 본다.) */
const codeOnly = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // 블록 주석 (css 도 이것뿐이다)
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // 줄 주석 — `https://` 를 지우지 않도록 앞 문자를 본다

/** 이유를 적고 면제한다. **빈 이유는 면제가 아니다**(아래 검사가 거절한다). */
const ALLOWED: Record<string, string> = {
  // 예: 'components/features/Foo.tsx': '주소창을 따라가야 하는 전면 오버레이 — 잘리면 닫기 버튼이 가린다',
};

const EXTS = ['.ts', '.tsx', '.css'];
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
};

describe('레이아웃 높이에 dvh 를 쓰지 않는다 — 모바일에서 화면이 흔들린다', () => {
  const files = walk(SRC);
  const rel = (p: string) => relative(SRC, p).split(sep).join('/');

  it('src 를 실제로 읽었다(앵커가 비면 이 테스트는 아무것도 안 본다)', () => {
    expect(files.length, 'src 에서 .ts/.tsx/.css 를 하나도 못 읽었다').toBeGreaterThan(100);
  });

  it('dvh 가 코드에 없다(주석·문자열 설명은 제외)', () => {
    const offenders = files
      .filter((p) => rel(p) !== 'components/dynamicViewportUnit.contract.test.ts')
      .filter((p) => !(rel(p) in ALLOWED))
      .filter((p) => /\b\d*\.?\d*dvh\b/.test(codeOnly(readFileSync(p, 'utf-8'))))
      .map(rel);
    expect(
      offenders,
      'dvh 는 주소창을 따라가는 단위라 레이아웃 높이에 쓰면 모바일에서 화면이 흔들린다'
        + '(2026-09-15 오너 리포트, 안드로이드 크롬). 고정이 필요하면 `svh`, 아니면 px·flex 로 풀어라.\n'
        + `그래도 꼭 필요하면 이 파일 ALLOWED 에 이유와 함께 적어라.\n대상: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('면제 목록이 현실과 맞다 — 사라진 파일·빈 이유가 남아 있지 않다', () => {
    // 면제는 '검사 안 함'이 아니라 '왜 필요한지 적어 둠'이다. 비면 면제가 아니다.
    const 빈이유 = Object.entries(ALLOWED).filter(([, why]) => !why || why.trim().length < 10).map(([f]) => f);
    expect(빈이유, `ALLOWED 의 이유가 비었거나 너무 짧다: ${빈이유.join(', ')}`).toEqual([]);

    const 사라진 = Object.keys(ALLOWED).filter((f) => !files.some((p) => rel(p) === f));
    expect(사라진, `ALLOWED 에 없는 파일이 남아 있다 — 지워야 검사가 좁아진다: ${사라진.join(', ')}`).toEqual([]);
  });
});
