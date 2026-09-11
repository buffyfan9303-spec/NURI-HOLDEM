// 전체화면 = 읽기 전용 송출 보드 계약 (오너 지시 2026-09-11)
//
// 오너 보고: "조작 콘솔이 화면을 차지해 클락이 눌린다 / 전체화면에서도 TV용 클락이 아니라 운영자 UI가 보인다".
// 실제로 TournamentClock 은 `{canManage && fs && consoleUI}` 로 **전체화면에도 콘솔을 렌더**했고,
// 시작·Level±·Min/Sec±·엔트리 5종±·볼륨 슬라이더·초기화까지 화면 하단 약 30%를 먹었다.
//
// 이건 렌더 트리 테스트로 잡기 어렵다(운영자 권한 + 전체화면 + 클락 상태를 다 만들어야 한다).
// 저장소가 이미 쓰는 **소스 계약 테스트** 방식으로 잠근다(src/api/aiSurface.test.ts 와 같은 결).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'TournamentClock.tsx'), 'utf-8');
/** 주석은 이력을 적는 자리다 — 실제 코드만 본다. */
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('전체화면은 조작 콘솔을 렌더하지 않는다', () => {
  it('🔴 consoleUI 는 `!fs` 조건에서만 렌더된다', () => {
    const uses = [...code.matchAll(/\{[^{}]*consoleUI\}/g)].map((m) => m[0]);
    expect(uses.length, 'consoleUI 렌더 지점이 사라졌다 — 운영자 화면의 조작부가 통째로 없어진 것이다').toBeGreaterThan(0);
    for (const u of uses) {
      expect(u, `전체화면에도 콘솔이 렌더된다: ${u}`).toContain('!fs');
      expect(/[^!]\bfs\s*&&\s*consoleUI/.test(u), `fs && consoleUI 형태가 남아 있다: ${u}`).toBe(false);
    }
  });

  it('전체화면 오버레이는 해제·음소거만 — 운영 버튼을 다시 들이지 않는다', () => {
    const i = code.indexOf('data-testid="clk-fs-overlay"');
    expect(i, '전체화면 최소 오버레이가 없다 — 해제 수단이 사라졌다').toBeGreaterThan(-1);
    // 오버레이 블록 안(닫는 </div> 까지)에 운영 조작이 들어오지 않았는지
    const block = code.slice(i, i + 1200);
    for (const forbidden of ['toggleRun', 'setLevel', 'adjustTime', 'resetClock', 'handleEnd', 'onOpenSettings']) {
      expect(block.includes(forbidden), `오버레이에 운영 조작(${forbidden})이 들어왔다`).toBe(false);
    }
    expect(block).toContain('toggleFs');    // 해제
    expect(block).toContain('toggleMute');  // 음량
    expect(block).toContain('aria-label');  // 키보드·스크린리더 접근
  });

  it('ESC/네이티브 해제가 React 상태를 되돌린다(fullscreenchange 구독)', () => {
    expect(code).toContain("addEventListener('fullscreenchange'");
    expect(code).toContain("removeEventListener('fullscreenchange'");  // 중복 구독 방지
    expect(code).toMatch(/document\.fullscreenElement\)\s*setFs\(false\)/);
  });

  it('전체화면 stage 는 16:9 를 유지한다(정사각형으로 줄지 않는다)', () => {
    expect(code).toContain('aspect-[16/9]');
    expect(code).toContain('max-w-[177.78vh]');   // 세로가 짧은 화면에서 폭을 제한 → 레터박스
    expect(code).toContain('[container-type:size]'); // cqw/cqh 가 stage 기준으로 동작
  });
});
