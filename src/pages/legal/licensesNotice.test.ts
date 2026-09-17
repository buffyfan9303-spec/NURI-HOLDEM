// [DS] LEGAL-3 — 오픈소스 라이선스 고지(public/legal/licenses.html)의 드리프트 가드.
//
// 왜 필요한가: MIT·ISC·BSD 는 저작권 고지·라이선스 전문을, Apache-2.0 은 LICENSE(+NOTICE)를 배포물에 동봉해야 한다.
// 손으로 만든 100KB 목록은 의존성을 올리는 순간 조용히 거짓말이 된다. scripts/gen-licenses.mjs 가
// node_modules 의 실제 파일에서 생성하고, 이 스펙은 ① 재생성 결과 == 커밋본(--check)
// ② package.json dependencies == 페이지의 직접 의존성 목록 을 강제한다.
//   → 의존성을 추가·제거·업그레이드하고 재생성하지 않으면 여기서 빨개진다
//     (회귀 주입으로 확인: 항목 1개 삭제 → ②·① 실패, 본문 1바이트 변경 → ① 실패 · 2026-09-17).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');
const html = read('public/legal/licenses.html');
const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };

const section = (scope: string) => {
  const m = html.match(new RegExp('<section data-scope="' + scope + '">.*?</section>', 's'));
  expect(m, `data-scope="${scope}" 섹션이 없다`).toBeTruthy();
  return m![0];
};
const items = (src: string) =>
  [...src.matchAll(/<li data-pkg="([^"]+)" data-version="([^"]*)" data-license="([^"]*)">(.*?)<\/li>/gs)]
    .map((m) => ({ name: m[1], version: m[2], license: m[3], body: m[4] }));

describe('오픈소스 라이선스 고지 (LEGAL-3)', () => {
  // 이 스펙이 이 파일의 핵심이다 — 설치된 의존성으로 다시 만든 결과와 커밋본이 바이트 단위로 같아야 한다.
  it('설치된 의존성으로 재생성한 결과가 커밋된 HTML 과 정확히 같다(드리프트 금지)', () => {
    // --check 는 파일을 쓰지 않고 비교만 한다. 다르면 exit 1 → execFileSync 가 throw.
    expect(() => execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'gen-licenses.mjs'), '--check'],
      { cwd: ROOT, stdio: 'pipe' },
    )).not.toThrow();
  }, 60_000);

  it('package.json dependencies 와 페이지의 직접 의존성 목록이 정확히 같다(추가·삭제 양방향)', () => {
    const listed = items(section('direct')).map((p) => p.name).sort();
    const deps = Object.keys(pkg.dependencies).sort();
    expect(listed.length, '직접 의존성 섹션이 비었다 — 마크업이 바뀌었는지 확인하라').toBeGreaterThan(0);
    expect(listed).toEqual(deps);
  });

  it('라이선스를 지어내지 않는다 — license 필드·LICENSE 파일이 없는 항목은 "확인 불가" 로 실린다', () => {
    const all = items(html);
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) {
      if (p.license === '') expect(p.body, `${p.name}: 라이선스 미확인인데 "확인 불가" 표기가 없다`).toContain('확인 불가');
      else expect(p.body, `${p.name}: 라이선스가 확인됐는데 전문(<pre>)도 OFL 참조도 없다`).toMatch(/<pre>|OFL\.txt/);
    }
    // 알려진 미확인 건 — PortOne 이 라이선스를 밝히기 전까지 유지(오너 통보 대상).
    expect(all.find((p) => p.name === '@portone/browser-sdk')?.license, '@portone/browser-sdk 라이선스가 갑자기 확인됐다면 출처를 확인하라').toBe('');
  });

  it('글꼴은 동봉된 OFL.txt 를 가리키고, 그 파일이 실제로 있다', () => {
    for (const f of ['/fonts/pretendard/OFL.txt', '/fonts/nuri-marks/OFL.txt']) {
      expect(html).toContain(`href="${f}"`);
      expect(existsSync(path.join(ROOT, 'public', f)), `public${f} 없음`).toBe(true);
    }
  });

  it('JS 없이 열리고, 전 화면 푸터에서 진입할 수 있다', () => {
    expect(html).not.toContain('<script');
    expect(read('src/components/features/BusinessFooter.tsx')).toContain('href="/legal/licenses.html"');
  });
});
