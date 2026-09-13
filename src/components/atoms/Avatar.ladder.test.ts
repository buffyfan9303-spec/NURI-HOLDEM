// Avatar 이니셜이 §T1 타이포 사다리 위에 있는지 잠근다 (문서 5 §7 P0-B, 2026-09-12).
//
// 무엇을 막는가: 예전 `fontSize: Math.max(9, Math.round(size * 0.42))` 인라인 px 은
//  ① 사다리 밖 7단(9/9/10/11/12/13/17px)을 만들었고
//  ② 절대 px 이라 `html{font-size:17px}`("50대 이용자 가독성" 결정)도 브라우저 확대도 안 받았다.
// 8개 파일이 이 아톰을 쓴다 — 한 줄이 되돌아가면 8개 화면이 동시에 사다리 밖으로 나간다.
//
// vitest 환경이 node 라 DOM 렌더를 못 한다 → 매핑은 순수 함수로, 인라인 px 부재는 소스 계약으로 검사한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initialTextClass } from './Avatar';

/** 허용된 사다리 칸과 실제 렌더 px(1rem = 17px, src/index.css:538) */
const LADDER: Record<string, number> = {
  'text-2xs': 11.6875,
  'text-xs': 12.75,
  'text-sm': 14.875,
  'text-base': 17,
};

/** 저장소에서 실제로 쓰이는 size 7종 (grep `<Avatar` + 기본값 28) */
const USED_SIZES = [18, 22, 24, 26, 28, 32, 40];

const SRC = readFileSync(fileURLToPath(new URL('./Avatar.tsx', import.meta.url)), 'utf8');
/** 주석을 뺀 실제 코드 — 주석에 적힌 과거 기록(`fontSize: …`)을 위반으로 세지 않는다. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Avatar 이니셜 크기 — §T1 사다리', () => {
  it('실사용 size 7종이 전부 사다리 칸으로만 떨어진다', () => {
    for (const size of USED_SIZES) {
      const cls = initialTextClass(size);
      expect(LADDER, `size=${size} 가 사다리 밖 클래스 "${cls}" 로 떨어진다`).toHaveProperty(cls);
    }
  });

  it('사다리 최소단(11.69px) 아래로는 절대 내려가지 않는다', () => {
    for (const size of USED_SIZES) {
      expect(LADDER[initialTextClass(size)], `size=${size}`).toBeGreaterThanOrEqual(11.6875);
    }
  });

  it('크기에 비례한다 — 지름이 커지면 이니셜이 작아지지 않는다', () => {
    // 한 값으로 고정하는 "해결"을 막는다: 40px 아바타의 이니셜이 18px 아바타와 같으면 안 된다.
    let prev = 0;
    for (const size of USED_SIZES) {
      const px = LADDER[initialTextClass(size)];
      expect(px, `size=${size} 에서 이니셜이 작아졌다`).toBeGreaterThanOrEqual(prev);
      prev = px;
    }
    expect(LADDER[initialTextClass(40)], '전 구간 한 값 고정은 비례가 아니다')
      .toBeGreaterThan(LADDER[initialTextClass(18)]);
  });

  it('소스에 인라인 fontSize·임의 px 글자 크기가 없다', () => {
    expect(CODE, '인라인 fontSize 가 돌아왔다 — rem 확대를 안 받는다').not.toMatch(/fontSize\s*:/);
    // `text-[${계산}px]` 처럼 **템플릿 리터럴로 조립한** 임의 px 도 잡는다(음성 대조에서 빠져나갔다).
    expect(CODE, 'text-[…px] 임의 크기가 돌아왔다').not.toMatch(/text-\[[^\]]*px\]/);
  });

  it('원 지름이 rem 이다 — 글자만 커져 이니셜이 원 밖으로 나가지 않게', () => {
    // 실측(2026-09-12, html 34px): 박스를 px 로 두면 size 18 에서 잉크가 세로로 +13px 넘쳤다.
    expect(CODE, '지름이 다시 절대 px 이 됐다').toMatch(/width:\s*`\$\{size \/ 17\}rem`/);
  });
});
