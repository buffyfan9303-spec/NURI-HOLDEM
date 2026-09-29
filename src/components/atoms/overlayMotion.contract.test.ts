// 오버레이 모션 두 결함의 재발 방지(2026-09-29 실측으로 확인한 것만).
//
// M2 — 동작 줄이기(reduced-motion)에서 시트를 열면 딤만 있는 검은 한 프레임이 났다(휘도 −19.7~−23.3, 운영 재현).
//   index.css 의 reduced-motion `animation: none` 목록에 시트 진입 클래스가 빠져 0.01ms 로만 줄었고,
//   첫 프레임이 키프레임 from(translateY 100%)으로 그려졌다. 딤은 목록에 있어 즉시 가득 찼다.
//   → Modal·시트가 쓰는 animate-* 는 **전부** 목록에 있어야 한다(한 쪽만 빠지면 그 한 프레임이 다시 난다).
// D4 — 장부 연속 바인 기록 때 '되돌리기' 토스트가 빠질 때마다 입력과 무관한 layout-shift(1280 0.0167·390 0.0338 매회).
//   남은 토스트는 안 움직였고 **컨테이너 상자**의 윗변만 내려왔다. 상자 높이를 0 으로 고정하면 0 이 된다(같은 하네스 실측).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');

describe('오버레이 모션 계약', () => {
  it('M2: 시트·모달이 쓰는 animate-* 는 전부 reduced-motion 의 animation:none 목록에 있다', () => {
    const css = read('index.css');
    const rm = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\{ animation: none !important; \}/);
    expect(rm, 'reduced-motion 의 animation:none 목록을 못 찾았다').toBeTruthy();
    // 주석은 걷는다 — 목록 옆 설명 주석에 클래스 이름이 적혀 있어 음성 대조(목록에서 빼기)가 거짓 통과했다.
    const listed = new Set([...rm![0].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.(animate-[\w-]+)/g)].map((m) => m[1]));
    const used = new Set<string>();
    for (const f of [['components', 'atoms', 'Modal.tsx'], ['components', 'atoms', 'pageMotion.ts'],
      ['components', 'features', 'MyVoucherSheet.tsx'], ['components', 'features', 'VoucherWallet.tsx']]) {
      for (const m of read(...f).matchAll(/['" ](animate-(?:sheet-up|slide-up|slide-down|fade-in|fade-out|dim-[\w-]+))\b/g)) used.add(m[1]);
    }
    expect(used.has('animate-sheet-up'), '수집이 0 이면 이 검사는 아무것도 안 본다').toBe(true);
    expect([...used].filter((c) => !listed.has(c))).toEqual([]);
  });

  // 2026-09-29 #13 겹쳐 쌓기로 배치가 바뀌었다 — 토스트는 흐름(flex)이 아니라 전부 같은 자리(absolute bottom-0)에 있고
  //   쌓기·펼치기는 transform 으로만 한다. 흐름으로 되돌리면 뜨고 빠질 때 남의 토스트 레이아웃이 움직인다(e2e toast-pile ⑥).
  it('D4: 토스트 컨테이너 상자는 높이 0 으로 바닥에 고정되고, 토스트는 같은 자리에서 transform 으로만 움직인다', () => {
    const toast = read('components', 'atoms', 'Toast.tsx');
    const box = toast.match(/aria-live="polite"\s+className="([^"]+)"/);
    expect(box, '토스트 컨테이너를 못 찾았다').toBeTruthy();
    const cls = box![1].split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(['fixed', 'h-0']));
    expect(cls.filter((c) => c === 'flex' || c === 'grid'), '컨테이너가 흐름 배치(flex·grid)면 토스트가 뜨고 빠질 때 서로를 민다').toEqual([]);
    expect(toast).toMatch(/'absolute bottom-0 /);
    expect(toast).toMatch(/transform: `translateY\(/);
  });
});
