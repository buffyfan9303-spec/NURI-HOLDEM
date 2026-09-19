// 클락 보드 — 오너 지시 2026-09-19 10건 중 **소스로 잠글 수 있는 것**의 계약.
//
// 왜 소스 계약인가: 라벨·알약·헤어라인·콘솔 순서는 렌더 트리 없이도 한 파일에서 읽히고,
// 되돌아가는 방향이 뻔하다(한국어 라벨 복귀 · 알약 복귀 · 헤어라인 복귀 · Level 이 시작 옆으로).
// 픽셀 수치(중앙 정렬·타이머 y)는 e2e/clock-board.spec.ts 가 잰다 — 여기서는 잴 수 없다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLACK_MARBLE_GOLD_BG, NURI_SIGNATURE_BG } from './clockTheme';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const stage = strip(readFileSync(join(__dirname, 'ClockStage.tsx'), 'utf-8'));
const tc = strip(readFileSync(join(__dirname, 'TournamentClock.tsx'), 'utf-8'));

describe('#1 보드 라벨은 영문이다', () => {
  it('지표·시간 라벨 — 영문 존재 · 한국어 부재', () => {
    for (const en of ['Players / Entries', '"Rebuy"', '"Buy-in"', "'ADDON'", "'EARLY'", '"Reg Close"', "'Total Chips'", "'Avg Stack'", "'Next Break'", 'Prize Pool', 'Total Time', 'Last Level', "'CLOSED'"]) {
      expect(stage, `영문 라벨 ${en} 이 없다`).toContain(en);
    }
    for (const ko of ['생존 / 엔트리', '"리바이"', '"바인"', "'애드온'", "'얼리'", '등록 마감', '총 칩', '평균 스택', '다음 휴식', '총 상금', '총 진행', '마지막 레벨', "'마감'", '휴식 시간', '레지 마감', '휴식까지']) {
      expect(stage.includes(ko), `한국어 라벨 ${ko} 이 돌아왔다(오너 2026-09-19 #1)`).toBe(false);
    }
    // 라벨 공통 클래스가 대문자를 강제한다 — 소문자 혼용 라벨('Players / Entries')이 화면에선 PLAYERS / ENTRIES 다.
    expect(stage).toMatch(/const LABEL = '[^']*\buppercase\b[^']*'/);
  });
});

describe('#8·#9 알약과 헤어라인이 없다 · LEVEL 은 큰 글자다', () => {
  it('상태 알약(READY/RUNNING 단어 · rounded-full 알약) 이 ClockStage 에 없다', () => {
    expect(stage.includes('CLOCK_PHASE_TV'), '상태 단어 알약이 돌아왔다').toBe(false);
    expect(stage.includes('StatusPills')).toBe(false);
    // 알약 모양(rounded-full + border)은 상태 바 점(aria-hidden 1.2cqmin)에만 남는다 — 텍스트를 감싸는 알약은 0.
    const pills = [...stage.matchAll(/rounded-full[^>]*>\s*\{/g)];
    expect(pills.map((m) => m[0]), '텍스트를 감싼 알약이 남아 있다').toEqual([]);
  });
  it('clk-level 은 "LEVEL n" · 4.6cqmin 급 · 브레이크는 BREAK', () => {
    const i = stage.indexOf('data-testid="clk-level"');
    expect(i).toBeGreaterThan(-1);
    const near = stage.slice(i, i + 500);
    expect(near).toContain('4.6cqmin');
    expect(near).toContain('`LEVEL ${levelNumberAt(lvls, eff.index)}`');
    expect(near).toContain("'BREAK'");
  });
  it('테마 배경에 8%·92% 헤어라인(100% 1px 레이어)이 없다', () => {
    for (const [name, bg] of [['NURI_SIGNATURE_BG', NURI_SIGNATURE_BG], ['BLACK_MARBLE_GOLD_BG', BLACK_MARBLE_GOLD_BG]] as const) {
      expect(bg.includes('/ 100% 1px'), `${name} 에 가로 헤어라인이 돌아왔다(오너 2026-09-19 #8)`).toBe(false);
      expect(bg.includes('50% 8%'), `${name} 8% 선`).toBe(false);
      expect(bg.includes('50% 92%'), `${name} 92% 선`).toBe(false);
    }
  });
});

describe('PAUSED 복원 — 2026-09-19 밤 오너 지시, 두 번째 반려 반영(#9 다음, PAUSED 만 예외)', () => {
  it('PausedLabel 은 LEVEL 바로 위(같은 스페이서)에 서고, 타이머와 겹치는 자리(clk-timer 근처)에는 없다', () => {
    // 1차 시도는 clk-timer 를 absolute 로 덮는 오버레이였다 — 실측 스크린샷에서 숫자가 묻혀 반려됐다(팀리드 확인).
    // 되돌아오면 안 되는 모양: clk-timer 정의 바로 옆에 PAUSED/clk-paused 가 다시 나타나는 것.
    const t = stage.indexOf('data-testid="clk-timer"');
    expect(t).toBeGreaterThan(-1);
    const nearTimer = stage.slice(Math.max(0, t - 200), t + 400);
    expect(nearTimer, 'PAUSED 가 clk-timer 오버레이로 되돌아왔다(팀리드가 반려한 1차 설계)').not.toContain('PAUSED');
    expect(nearTimer, 'clk-paused 가 clk-timer 옆(오버레이 자리)에 다시 있다').not.toContain('clk-paused');

    // 있어야 할 자리: PausedLabel 이 LevelLine 바로 앞(같은 스페이서, DOM 순서로 위)에서 g 로 판정한다.
    const p = stage.indexOf('function PausedLabel');
    expect(p, 'PausedLabel 컴포넌트가 없다').toBeGreaterThan(-1);
    const body = stage.slice(p, p + 400);
    expect(body, 'clockPhase(g) !== ' + "'paused'" + ' 가드가 없다 — paused 아닐 때 null 을 안 돌려준다').toContain("clockPhase(g) !== 'paused'");
    expect(body, 'data-testid="clk-paused" 앵커가 없다').toContain('data-testid="clk-paused"');
    expect(body, 'PAUSED 문구가 없다').toMatch(/>\s*PAUSED\s*</);

    const callSite = stage.indexOf('<PausedLabel g={g} />');
    const levelCallSite = stage.indexOf('<LevelLine g={g} />');
    expect(callSite, 'PausedLabel 호출부가 없다').toBeGreaterThan(-1);
    expect(levelCallSite, 'PausedLabel 이 LevelLine 보다 뒤(아래)에 있다 — LEVEL 위가 아니라 아래로 갔다').toBeGreaterThan(callSite);
    expect(levelCallSite - callSite, 'PausedLabel 과 LevelLine 사이에 다른 마크업이 끼어들었다(같은 스페이서 형제여야 한다)').toBeLessThan(80);
  });
  it('READY·RUNNING 단어·상태 알약 조회(CLOCK_PHASE_TV)는 여전히 없다 — 되살아난 건 PAUSED 하나뿐', () => {
    expect(stage.includes('READY'), 'READY 가 돌아왔다').toBe(false);
    expect(stage.includes('RUNNING'), 'RUNNING 이 돌아왔다').toBe(false);
    expect(stage.includes('CLOCK_PHASE_TV'), 'CLOCK_PHASE_TV 조회로 상태 알약이 돌아왔다').toBe(false);
  });
});

describe('#2·#3 하단 지표 중앙 · 타이머 중앙 구조', () => {
  it('하단 레일은 [1fr_auto_1fr] 그리드 — 중앙 칸이 스테이지 정중앙', () => {
    expect(stage).toContain('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]');
    // 중앙 칸(BottomMetrics)이 flex-1 로 늘어나면 QR/스폰서 폭 차이만큼 다시 밀린다.
    expect(stage).toMatch(/className="clk-metrics flex min-w-0 items-center justify-center/);
  });
  it('중앙 열 — LEVEL 스페이서 / 타이머(shrink-0) / 블라인드 스페이서', () => {
    const i = stage.indexOf('<LevelLine g={g} />');
    const j = stage.indexOf('<CenterPanel g={g} />');
    const k = stage.indexOf('<BlindsRow g={g} />');
    expect(i).toBeGreaterThan(-1); expect(j).toBeGreaterThan(i); expect(k).toBeGreaterThan(j);
    // 두 스페이서가 basis-0 flex-1 이어야 타이머가 정중앙이다.
    expect((stage.slice(i - 400, k).match(/flex-1 basis-0/g) ?? []).length).toBe(2);
  });
});

describe('#4·#6·#7 운영자 콘솔·전체화면 띠', () => {
  it('#6 시작 버튼은 w-full 단독 줄, Level 스테퍼는 그 아래 줄(clk-level-row)', () => {
    const main = tc.indexOf('data-testid="clk-main-action"');
    const row = tc.indexOf('data-testid="clk-level-row"');
    expect(main).toBeGreaterThan(-1); expect(row).toBeGreaterThan(main);
    expect(tc.slice(main, main + 200)).toContain('w-full');
    expect(tc.slice(row, row + 300)).toContain('label="Level"');
    // 시작 버튼과 Level 사이에 버튼이 닫히고 새 블록이 시작된다(같은 flex 줄이 아니다).
    expect(tc.slice(main, row)).toContain('</button>');
  });
  it('#7 위험군(초기화·토너 종료)은 좌측 정렬', () => {
    const i = tc.indexOf('data-testid="clk-danger-row"');
    expect(i).toBeGreaterThan(-1);
    const block = tc.slice(i, i + 1400);
    expect(block).toContain('justify-start');
    expect(block.includes('justify-end')).toBe(false);
    expect(block).toContain('resetClock');
    expect(block).toContain('handleEnd');
  });
  it('#4 전체화면 띠 — 하단 레일 폭·높이 전체(inset-x-0 bottom-0 h-[12cqmin]) · 시작/일시정지 testid', () => {
    const i = tc.indexOf('data-testid="clk-fs-overlay"');
    const block = tc.slice(i, tc.indexOf('<ClockStage', i));
    expect(block).toContain('inset-x-0 bottom-0');
    expect(block, '띠 높이가 하단 레일(12cqmin)과 다르면 숫자가 반쯤 가려진 채 남는다').toContain('h-[12cqmin]');
    expect(block).toContain('data-testid="clk-fs-main"');
    expect(block).toContain('CLOCK_PHASE_ACTION[phase]');
    for (const k of ["'리바이'", "'얼리'", "'애드온'", "'엔트리'", "'생존'"]) expect(block, `${k} 보정이 없다`).toContain(k);
  });
});
