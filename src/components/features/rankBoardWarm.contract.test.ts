// 순위 허브 공개 보드 예열(warm) 계약 — 오너 "순위 탭 하단 메뉴 이동할 때 깜빡이면서 화면전환, 처음 한 번만"(2026-09-18).
//
// 근본 원인은 전환이 아니라 **첫 방문 보드의 스켈레톤 섬광**이었다: 보드 데이터는 그 보드가 처음 켜질 때 조회되고,
// 응답(운영 실측 50~240ms)까지 pulse 스켈레톤을 그렸다가 콘텐츠로 갈아 끼운다. 두 번째부터는 캐시라 한 번에 그린다.
// 처방은 레일이 **보인 뒤** 한가할 때 공개 보드 셋을 미리 받는 것(TierLeaderboard warm 주석). 이 파일은 그 배선을 잠근다.
//
// 왜 소스 계약인가: vitest 환경이 node 라 렌더 테스트가 없다(rankingBoards.contract 와 같은 사정).
//   실측 하네스는 scratchpad rank-flicker.cjs(rAF 샘플 + CDP 스크린캐스트 프레임 차이) — 전/후 수치는 커밋 메시지 참고.
//
// 음성 대조(해당 줄만 되돌렸다 즉시 복원 — `git stash` 금지):
//   · 세 가드 중 하나의 `|| warm` 을 지우면 ① 이 실패한다
//   · 보드 이펙트 deps 에서 `warm` 을 빼면 ② 가 실패한다
//   · IntersectionObserver 를 걷고 마운트 즉시 setWarm(true) 로 바꾸면 ③ 이 실패한다(숨긴 채 프리마운트된 섹션에 조회 4건이 나간다)
//
// 실행: npx vitest run src/components/features/rankBoardWarm.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// eslint-disable-next-line security/detect-non-literal-fs-filename
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
/** 주석을 뺀 코드만 — 주석이 옛/새 패턴을 설명하는 문장에 걸리면 안 된다. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const TL = stripComments(read('./TierLeaderboard.tsx'));

describe('순위 허브 공개 보드 예열(warm) — 첫 클릭 스켈레톤 섬광 방지', () => {
  it('① 머니인·명예의 전당·국내 순위 조회 가드가 board 뿐 아니라 warm 으로도 열린다', () => {
    expect(TL, 'hall 가드에 || warm 이 있어야 한다').toMatch(/if \(\(board === 'hall' \|\| warm\) && /);
    expect(TL, 'moneyin 가드에 || warm 이 있어야 한다').toMatch(/if \(\(board === 'moneyin' \|\| warm\) && /);
    expect(TL, 'domestic 가드에 || warm 이 있어야 한다').toMatch(/if \(\(board === 'domestic' \|\| warm\) && /);
  });
  it('② warm 이 보드 이펙트 deps 에 있어 켜지는 순간 같은 이펙트가 다시 돈다(별도 조회 경로를 만들지 않는다)', () => {
    expect(TL).toMatch(/\}, \[board, warm, user\?\.id, missionsErr, domesticErr, boardErr, careerPeriod\]\);/);
  });
  it('③ warm 은 레일이 화면에 보인 뒤(IntersectionObserver) 한가할 때(requestIdleCallback) 켜진다', () => {
    const i = TL.indexOf('const [warm, setWarm] = useState(false);');
    expect(i, 'warm 상태가 있어야 한다').toBeGreaterThan(-1);
    const eff = TL.slice(i, TL.indexOf('}, []);', i));
    expect(eff).toContain('new IntersectionObserver(');
    expect(eff).toContain('isIntersecting');
    expect(eff).toContain('io.observe(rail)');
    expect(eff).toMatch(/requestIdleCallback\(go, \{ timeout: \d+ \}\)/);
    expect(eff).toMatch(/setTimeout\(go, \d+\)/);   // 사파리 구버전 폴백
  });
});
