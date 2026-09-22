// GTO 탭 계약 — 정보 구조 · 출처 표시 · 과장 금지 (2026-09-11 오너 지시)
//
// 잠그는 것
//  ① 실사용 흐름 4갈래 IA(2026-09-14 tourney → rules 합병)가 유지되고, 모든 도구가 정확히 한 갈래에 속한다.
//  ② `#tool=` 딥링크 키가 하나도 사라지지 않는다(공유 링크·검색 결과 하위호환).
//  ③ 실제 solver 데이터가 없는데 'solver' 배지를 붙이지 않는다.
//  ④ 화면 문구에 'GTO 정답 · 최선의 선택 · 실계산 · EV 손실' 같은 근거 없는 정밀함이 없다.
//  ⑤ 프리플랍 전략의 단일 소스가 차트(ranges.data)다 — Chen 근사가 화면으로 되돌아오지 않는다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const TOOLS_PANEL = readFileSync(join(ROOT, 'src/components/features/ToolsPanel.tsx'), 'utf-8');

/** TOOLS 레지스트리에서 (key, cat) 을 뽑는다. */
const entries = [...TOOLS_PANEL.matchAll(/\{ key: '([a-z]+)', cat: '([a-z]+)',/g)].map((m) => ({ key: m[1], cat: m[2] }));

/** 2026-09-10 이전부터 있던 딥링크 키 — 하나라도 사라지면 공유 링크가 죽는다. */
const LEGACY_KEYS = [
  'drill', 'tda', 'range', 'pushfold', 'trainer', 'postflop', 'wrongnote', 'aggro', 'glossary',
  'replay', 'gto', 'rvr',
  'pot', 'outs', 'mdf', 'icm', 'deal', 'spr', 'ev', 'combo', 'mzone', 'bankroll', 'variance',
  'chip', 'sim', 'blindgen', 'payout', 'endtime',
];

describe('GTO 탭 — 실사용 흐름 4갈래 IA', () => {
  it('도구 레지스트리가 비어 있지 않다', () => {
    expect(entries.length).toBeGreaterThanOrEqual(28);
  });

  it('모든 도구가 정의된 갈래 중 하나에 속한다', () => {
    // 2026-09-14 오너 결정으로 tourney 는 rules 에 합쳐졌다 — 다시 생기면 그건 회귀다.
    const allowed = new Set(['explore', 'train', 'review', 'rules', 'ops', 'money']);
    const bad = entries.filter((e) => !allowed.has(e.cat));
    expect(bad, `알 수 없는 갈래: ${JSON.stringify(bad)}`).toEqual([]);
  });

  it('네 갈래가 전부 채워져 있다 — 빈 섹션을 화면에 만들지 않는다', () => {
    for (const cat of ['explore', 'train', 'review', 'rules']) {
      expect(entries.filter((e) => e.cat === cat).length, `${cat} 갈래가 비었다`).toBeGreaterThan(0);
    }
  });

  it('핵심 도구가 기대한 갈래에 있다', () => {
    const catOf = (k: string) => entries.find((e) => e.key === k)?.cat;
    expect(catOf('range')).toBe('explore');      // 전략 탐색
    expect(catOf('pushfold')).toBe('explore');
    expect(catOf('rvr')).toBe('explore');
    expect(catOf('trainer')).toBe('train');      // 트레이너
    expect(catOf('wrongnote')).toBe('train');
    expect(catOf('replay')).toBe('review');      // 핸드 리뷰 — 포커 수학이 여기 모인다
    expect(catOf('outs')).toBe('review');
    expect(catOf('pot')).toBe('review');
    expect(catOf('spr')).toBe('review');
    expect(catOf('combo')).toBe('review');
    expect(catOf('mdf')).toBe('review');         // 포커 수학(MDF·EV)도 핸드 리뷰로(2026-09-14)
    expect(catOf('ev')).toBe('review');
    expect(catOf('tda')).toBe('rules');          // 규칙 · 대회 — TDA 가 첫 갈래의 첫 도구
    expect(catOf('glossary')).toBe('rules');
    expect(catOf('icm')).toBe('rules');          // 종전 토너먼트 랩 → 규칙 · 대회
    expect(catOf('deal')).toBe('rules');
    expect(catOf('mzone')).toBe('rules');
    expect(entries[0]?.key, 'TDA 가 도구 목록 첫 항목이어야 한다(오너 지시 "TDA 를 위로")').toBe('tda');
  });

  it('뱅크롤·분산은 GTO 카탈로그에서 빠져 캘린더로 이관됐다', () => {
    expect(entries.find((e) => e.key === 'bankroll')?.cat).toBe('money');
    expect(entries.find((e) => e.key === 'variance')?.cat).toBe('money');
    expect(TOOLS_PANEL).toContain("export const CALENDAR_TOOL_KEYS = ['bankroll', 'variance']");
    // 이관해도 렌더러·딥링크는 살아 있어야 한다
    expect(TOOLS_PANEL).toContain('export const renderCalendarTool');
  });

  it("'오늘의 드릴' 은 GTO 카탈로그·검색·즐겨찾기에서 빠졌다 — 딥링크 키는 남는다(2026-09-14 오너 지시)", () => {
    expect(TOOLS_PANEL).toContain("const HIDDEN_SET = new Set<ToolKey>([...STORE_SET, 'drill', 'deal'])");
    expect(TOOLS_PANEL).toContain('t.cat === l.id && !HIDDEN_SET.has(t.key)');   // 카탈로그 섹션
    expect(TOOLS_PANEL).toContain('!HIDDEN_SET.has(t.key) && (t.name');            // 검색
    expect(TOOLS_PANEL).not.toContain("open('drill')");                            // 상단 카드 진입 없음
    expect(entries.some((e) => e.key === 'drill'), '#tool=drill 딥링크가 죽었다').toBe(true);
  });

  it("'자주 쓰는 도구' 4개가 즐겨찾기 아래·카탈로그 위에 있고, '전체' 카탈로그에서는 빠진다(2026-09-14 오너 지시)", () => {
    expect(TOOLS_PANEL).toContain("export const FEATURED_KEYS = ['spot', 'range', 'pushfold', 'gto'] as const");
    for (const k of ['spot', 'range', 'pushfold', 'gto']) expect(entries.some((e) => e.key === k), `${k} 가 TOOLS 에 없다`).toBe(true);
    // 전체 보기에서만 위로 빼고 카탈로그에서 뺀다 — 갈래·검색 중에는 제 자리로
    expect(TOOLS_PANEL).toContain("!(lane === 'all' && FEATURED_SET.has(t.key))");
    expect(TOOLS_PANEL).toContain("{!hits && lane === 'all' && (");
    expect(TOOLS_PANEL).toContain('data-testid="tools-featured"');
    // 레인지 차트 대표 카드는 2026-09-14 오너 결정으로 뺐다 — 자주 쓰는 도구의 range 가 대신한다(되살리면 두 번 보인다)
    expect(TOOLS_PANEL).not.toContain("open('range')");
    // 순서: 즐겨찾기 → 자주 쓰는 도구 → 카탈로그(lanepanel)
    const fav = TOOLS_PANEL.indexOf('즐겨찾기 — 레인과 무관하게');
    const feat = TOOLS_PANEL.indexOf('data-testid="tools-featured"');
    const panel = TOOLS_PANEL.indexOf('data-tools-lanepanel=""');
    expect(fav).toBeGreaterThan(0);
    expect(feat).toBeGreaterThan(fav);
    expect(panel).toBeGreaterThan(feat);
  });

  it('매장 운영 5종은 그대로 내 매장 쪽이다', () => {
    for (const k of ['chip', 'sim', 'blindgen', 'payout', 'endtime']) {
      expect(entries.find((e) => e.key === k)?.cat, `${k} 가 GTO 탭으로 돌아왔다`).toBe('ops');
    }
  });

  it('기존 #tool= 딥링크 키가 하나도 사라지지 않았다', () => {
    const have = new Set(entries.map((e) => e.key));
    const gone = LEGACY_KEYS.filter((k) => !have.has(k));
    expect(gone, `딥링크가 죽는다: ${gone.join(', ')}`).toEqual([]);
  });
});

describe('GTO 데이터 — 출처를 속이지 않는다', () => {
  const toolFiles = [
    ...readdirSync(join(ROOT, 'src/components/features/tools')).map((f) => join('src/components/features/tools', f)),
    ...readdirSync(join(ROOT, 'src/components/features/gto')).map((f) => join('src/components/features/gto', f)),
  ].filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));

  it("어느 도구도 'solver' 출처 배지를 쓰지 않는다 — 이 앱에는 solver 데이터가 없다", () => {
    const offenders = toolFiles.filter((f) => {
      if (f.endsWith('SourceBadge.tsx')) return false;      // 정의 파일은 제외
      return /kind=["']solver["']/.test(readFileSync(join(ROOT, f), 'utf-8'));
    });
    expect(offenders, 'solver 데이터가 없는데 solver 배지를 붙였다').toEqual([]);
  });

  it('전략 결과를 내는 화면에 출처 배지가 붙어 있다', () => {
    const need: [string, string][] = [
      ['src/components/features/tools/RangeGuide.tsx', 'chart'],       // 자체 제작 학습 차트
      ['src/components/features/tools/PushFoldChart.tsx', 'nash'],     // 자체 Nash 모델
      ['src/components/features/gto/GtoDeepPanel.tsx', 'heuristic'],   // 휴리스틱 참고
      ['src/components/features/HandGtoModal.tsx', 'chart'],
      // 2026-09-19 GTO 감사 — AdvancedCalcs.tsx 는 자체 주석(70~71행)이 '자체 제작 학습 차트'라고
      // 스스로 약속해 놓고 배지가 없었다. RangeMatrix 도 같은 이유로 빠져 있었다(mc = 몬테카를로).
      ['src/components/features/tools/AdvancedCalcs.tsx', 'chart'],    // AggroChart — 통설 요약값
      ['src/components/features/tools/AdvancedCalcs.tsx', 'mc'],       // RangeMatrix — 실시간 몬테카를로
    ];
    for (const [f, kind] of need) {
      const src = readFileSync(join(ROOT, f.replace('src/components/features/HandGtoModal.tsx', 'src/components/features/HandGtoModal.tsx')), 'utf-8');
      expect(src, `${f} 에 ${kind} 출처 배지가 없다`).toMatch(new RegExp(`SourceBadge[^>]*kind=["']${kind}["']`));
    }
  });

  it('nash 데이터의 재현 가능 여부를 소스와 화면이 **같은 말로** 적어 두었다', () => {
    // 2026-09-19 갱신: 예전엔 "재현 불가 / 생성 스크립트가 저장소에 없다" 를 강제했다. 그건 그때 사실이었지만
    //   이제 생성기가 저장소에 있고(`scripts/gen-nash/`) 화면이 읽는 빅 앤티 표는 **전부 그것으로 재현된다**.
    //   계약의 목적은 "재현 불가라고 적어라" 가 아니라 **출처를 속이지 않는 것**이라 기준을 사실 쪽으로 옮긴다.
    const nash = readFileSync(join(ROOT, 'src/lib/nash.data.ts'), 'utf-8');
    expect(nash, '생성기 경로를 안 적으면 다음 사람이 다시 찾아 헤맨다').toContain('scripts/gen-nash/');
    // 노앤티 k≥2 는 아직 옛 값이다 — 섞여 있다는 사실을 파일이 스스로 말해야 한다(안 적으면 한 덩어리로 오해한다)
    expect(nash, '두 세대 값이 섞여 있다는 경고가 사라졌다').toContain('독립 재현 안 됨');
    // 생성기가 있다고 적어 놓고 실제로 없으면 위 문장이 거짓말이 된다 — 파일 존재까지 본다
    for (const f of ['solve.mjs', 'emit.mjs', 'check.mjs', 'equity169.mjs', 'README.md']) {
      expect(existsSync(join(ROOT, 'scripts/gen-nash', f)), `scripts/gen-nash/${f} 가 없는데 소스는 있다고 말한다`).toBe(true);
    }
    const chart = readFileSync(join(ROOT, 'src/components/features/tools/PushFoldChart.tsx'), 'utf-8');
    // 렌더되는 마크업으로 본다 — 주석에 옛 문구를 기록해 둔 줄까지 잡으면 이력을 못 남긴다
    expect(chart, '화면이 소스와 다른 말을 한다').toContain('<b>재산출 가능</b>');
    expect(chart, "화면에 '생성기 재현 필요' 가 렌더된다 — 이제 거짓이다").not.toContain('<b>생성기 재현 필요</b>');
  });

  it('화면 문구에 근거 없는 정밀함이 없다', () => {
    const banned = ['최선의 선택', 'GTO 정답', '이론(GTO) 기준 수치'];
    const offenders: string[] = [];
    for (const f of [...toolFiles, 'src/components/features/ToolsPanel.tsx', 'src/components/features/HandGtoModal.tsx']) {
      const src = readFileSync(join(ROOT, f), 'utf-8');
      // 주석 줄은 제외 — 기록을 남기는 것까지 막지 않는다
      const ui = src.split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');
      for (const b of banned) if (ui.includes(b)) offenders.push(`${f}: ${b}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('도구 화면 — 320px 한 줄 계약 (2026-09-17 오너 "두 줄 · 연결성 없음 · 부연설명")', () => {
  // 전부 scratch 프로덕션 빌드 375·320·1280 실측으로 잡힌 것. 되돌리면 같은 폭에서 다시 두 줄·잘림이 난다.
  const read = (f: string) => readFileSync(join(ROOT, f), 'utf-8');

  it('계산기 사이 딥링크 문구는 31글자 이내 — 34·35글자짜리가 320px 에서 두 줄(32px)이 됐다(31글자 OutsCalc 는 한 줄 실측)', () => {
    for (const f of ['src/components/features/tools/PotOddsCalc.tsx', 'src/components/features/tools/AdvancedCalcs.tsx', 'src/components/features/tools/OutsCalc.tsx']) {
      const links = [...read(f).matchAll(/href="#tool=[a-z]+"[^>]*>\s*([^<]+?)\s*<\/a>/g)].map((m) => m[1].trim());
      expect(links.length, `${f} 딥링크 형태가 바뀌었다`).toBeGreaterThan(0);
      for (const t of links) expect(t.length, `${f} 링크 "${t}" 가 31글자를 넘는다`).toBeLessThanOrEqual(31);
    }
  });

  it('퀴즈 카드 칩은 px-1 — 보드 5장+구분점이 320px 에서 246>231 로 넘쳤다', () => {
    expect(read('src/components/features/tools/quizCards.tsx')).not.toMatch(/bg-surface-base px-1\.5 py-1 text-sm font-extrabold/);
  });

  it('ICM 모드 탭 행은 flex-wrap — 320px 에서 버블 버튼이 탭을 4px 잘랐다', () => {
    expect(read('src/components/features/ICMCalculator.tsx')).toMatch(/className="flex flex-wrap items-center justify-between gap-2">\s*<SegmentedTabs items=\{MODES\}/);
  });

  it('칩 분배기 액면 칸은 1.4fr — 320px 에서 1fr(36.5px) 에 "25000"(47.5px) 이 잘렸다', () => {
    expect(read('src/components/features/tools/ChipDistributor.tsx').match(/grid-cols-\[1\.4fr_1fr_1fr_auto\]/g)?.length).toBe(2);
  });

  it('레인지 차트에 전구 팁 문단이 없다 — 그룹마다 줄 수가 달라 누를 때마다 높이가 튀었다', () => {
    expect(read('src/components/features/tools/RangeGuide.tsx')).not.toMatch(/name="lightbulb"/);
  });
});

describe('프리플랍 전략의 단일 소스', () => {
  const modal = readFileSync(join(ROOT, 'src/components/features/HandGtoModal.tsx'), 'utf-8');

  it('핸드 분석 모달이 차트(ranges.data)를 읽는다 — Chen 전략 함수를 쓰지 않는다', () => {
    expect(modal).toContain("from '../../lib/ranges.data'");
    // 표시 헬퍼(cardsToLabel·RANK_PCT)만 preflop 에서 가져온다
    const imp = modal.match(/import \{([^}]*)\} from '\.\.\/\.\.\/lib\/preflop';/);
    expect(imp, 'preflop import 형태가 바뀌었다').toBeTruthy();
    for (const banned of ['action', 'openPct', 'POSITIONS', 'STACKS']) {
      expect(imp![1], `Chen 전략 함수 ${banned} 가 화면으로 돌아왔다`).not.toContain(banned);
    }
  });

  it('차트가 덮지 않는 스택은 결과를 만들지 않고 미지원이라고 말한다', () => {
    expect(modal).toContain('현재 데이터 미지원');
  });

  it('EV 손실을 숫자로 내놓는 함수가 없다 (실제 action EV 가 없다)', () => {
    const preflop = readFileSync(join(ROOT, 'src/lib/preflop.ts'), 'utf-8');
    expect(preflop).not.toMatch(/export function evLossBb/);
  });
});

// ── NURI SPOT (2026-09-11 오너 지시) ─────────────────────────────────────────
// 잠그는 것
//  ① 대표 카드가 GTO 홈 **카탈로그 위**에 있다 — 첫 화면에서 스팟·차트·트레이너 셋이 함께 보인다
//  ② 레인은 4갈래다 — 스팟을 위해 갈래를 늘리면 e2e 의 '섹션 4개' 계약이 깨진다
//  ③ 무거운 분석 화면은 lazy — 열지 않은 사용자의 첫 화면 예산을 먹지 않는다
//  ④ 기존 도구(gto·replay)는 그대로 살아 있다 — 통합한다고 지우지 않는다
//  ⑤ 어디에도 '솔버 기준' 을 자칭하지 않는다 — 검증된 솔버 데이터가 이 저장소에 없다
describe('NURI SPOT — GTO 홈 통합', () => {
  const SPOT_PANEL = readFileSync(join(ROOT, 'src/components/features/gto/NuriSpotPanel.tsx'), 'utf-8');
  const REPORT = readFileSync(join(ROOT, 'src/components/features/gto/SpotReport.tsx'), 'utf-8');
  const EVAL = readFileSync(join(ROOT, 'src/lib/spotEvaluate.ts'), 'utf-8');

  it('spot 도구가 레지스트리에 있고 핸드 리뷰 갈래에 속한다', () => {
    expect(entries.find((e) => e.key === 'spot')?.cat).toBe('review');
  });

  it('레인은 5갈래 그대로다 — NURI SPOT 은 6번째 레인이 아니다', () => {
    // ⚠ LANES 는 라벨을 세로로 맞추려고 공백을 넣어 두었다 — 공백을 허용하지 않으면 절반만 잡힌다.
    const lanes = [...TOOLS_PANEL.matchAll(/\{ id: '([a-z]+)',\s+label: '/g)].map((m) => m[1]);
    // 2026-09-14 오너 지시로 '규칙 · 대회'(TDA)가 맨 앞이고, 같은 날 "분류를 합쳐서 한 줄로" 로 tourney 가 rules 에 합쳐져 4갈래다.
    expect(lanes).toEqual(['rules', 'explore', 'train', 'review']);
  });

  it('대표 카드가 검색창보다 위에 있다 — 첫 화면에서 스팟이 먼저 읽힌다', () => {
    const hero = TOOLS_PANEL.indexOf('<SpotHeroCard');
    const search = TOOLS_PANEL.indexOf('aria-label="도구 검색"');
    const lanebar = TOOLS_PANEL.indexOf('data-tools-lanebar');
    expect(hero, '대표 카드가 렌더에 없다').toBeGreaterThan(0);
    expect(hero).toBeLessThan(search);
    expect(hero).toBeLessThan(lanebar);
  });

  it('분석 화면은 lazy 로드된다 — 안 여는 사용자의 첫 화면에 실리지 않는다', () => {
    expect(TOOLS_PANEL).toMatch(/const NuriSpotPanel = lazyWithReload\(\(\) => import\('\.\/gto\/NuriSpotPanel'\)\)/);
  });

  it('기존 핸드 분석·리플레이 도구를 지우지 않았다', () => {
    expect(entries.find((e) => e.key === 'gto')?.cat).toBe('review');
    expect(entries.find((e) => e.key === 'replay')?.cat).toBe('review');
    expect(TOOLS_PANEL).toContain('<GtoDeepPanel');
    expect(TOOLS_PANEL).toContain('<HandReviewTool');
  });

  it('카드 선택기·리플레이어를 새로 만들지 않고 기존 것을 쓴다', () => {
    expect(SPOT_PANEL).toContain("from './HandBoardPicker'");
    expect(SPOT_PANEL).toContain("from './useHandBoard'");
    expect(SPOT_PANEL, '탭은 공용 SegmentedTabs 를 쓴다(SlidingPill 직접 사용 금지)')
      .toContain("from '../../atoms/SegmentedTabs'");
    expect(SPOT_PANEL).not.toContain('CardGridPicker');   // HandBoardPicker 안에 이미 있다
  });

  // 🔴 2026-09-22 요구 A — **반전됐다.** 이 계약은 "오래된 에퀴티 응답이 최신 결과를 덮지 않는가"
  //   였는데, 작성 화면이 에퀴티를 **아예 계산하지 않게 되면서** 덮을 응답 자체가 없어졌다.
  //   (오너: NURI SPOT 은 작성·저장·공유가 목적이다. 승률 표시를 걷어냈다.)
  //   경합 가드를 요구하는 대신 **호출이 없다**를 잠근다 — 되살아나면 그때 가드도 같이 와야 한다.
  //   ⚠ `equityRequest`(planEquity·canApplyEquity)와 워커는 그대로 살아 있고, 그 순수 판정 테스트도
  //     `gto/equityRequest.test.ts` 에 남아 있다. 여기서 없앤 것은 이 화면의 배선뿐이다.
  it('작성 화면은 에퀴티를 계산하지 않는다 — 덮일 응답 자체가 없다', () => {
    expect(SPOT_PANEL.length, 'NuriSpotPanel 소스를 못 읽었다 — 빈 검사 방지').toBeGreaterThan(5_000);
    expect(SPOT_PANEL, '에퀴티 호출이 되살아났다 — 그렇다면 세대 가드(canApplyEquity)도 같이 와야 한다')
      .not.toMatch(/equityMultiAsync\(|\bequityAsync\(/);
    expect(SPOT_PANEL, '요청 세대 ref 가 되살아났다').not.toMatch(/reqId/);
  });

  it('솔버 등급을 만들어 내는 경로가 없다', () => {
    // 평가 엔진이 exact_solver 를 **반환**하는 곳이 없어야 한다(타입 선언·라벨·주석은 제외)
    expect(EVAL).not.toMatch(/kind:\s*'exact_solver'/);
    // 화면도 solver 를 자칭하지 않는다
    expect(REPORT).not.toMatch(/data-source-badge="solver"/);
  });

  it('수학 참고 결과에 GTO 추천이 없다고 화면이 말한다', () => {
    expect(EVAL).toContain('GTO 추천 액션이 없습니다');
  });

  // ── 도구 카드 제목 2줄 (2026-09-18 오너: "프리플랍 / 레인지 차트 이렇게 열을 맞춰서 정렬") ──
  describe('카드 제목 줄바꿈표(TITLE_LINES)', () => {
    const PANEL = readFileSync(join(ROOT, 'src/components/features/ToolsPanel.tsx'), 'utf-8');
    const namesOf = () => {
      const m = new Map<string, string>();
      for (const x of PANEL.matchAll(/\{ key: '([a-z]+)', cat: '[a-z]+', name: '([^']+)'/g)) m.set(x[1], x[2]);
      return m;
    };
    const linesOf = () => {
      const block = PANEL.match(/const TITLE_LINES[\s\S]*?^\};/m);
      const m = new Map<string, [string, string]>();
      if (!block) return m;
      for (const x of block[0].matchAll(/^\s*([a-z]+):\s*\['([^']*)', '([^']*)'\],/gm)) m.set(x[1], [x[2], x[3]]);
      return m;
    };

    it('두 줄을 합치면 원래 이름과 같다 — 제목이 조용히 바뀌면 안 된다', () => {
      const names = namesOf(); const lines = linesOf();
      expect(names.size, 'TOOLS 이름을 못 읽었다 — 정규식이 낡았다').toBeGreaterThan(25);
      expect(lines.size, 'TITLE_LINES 를 못 읽었다 — 정규식이 낡았다').toBeGreaterThan(5);
      const bad: string[] = [];
      for (const [k, [a, b]] of lines) {
        const full = names.get(k);
        if (!full) { bad.push(`${k}: TOOLS 에 없는 키`); continue; }
        if (`${a} ${b}` !== full) bad.push(`${k}: '${a} ${b}' ≠ '${full}'`);
      }
      expect(bad, `줄바꿈표가 원래 이름과 어긋난다(합치면 name 과 같아야 한다): ${bad.join(' / ')}`)
        .toEqual([]);
    });

    it('카드가 설명줄을 그리지 않는다 — 대신 title 툴팁으로 남긴다', () => {
      const card = [PANEL.slice(PANEL.indexOf('function ToolCard'), PANEL.indexOf('function ToolCard') + 3000)];
      expect(PANEL, 'ToolCard 를 못 찾았다').toContain('function ToolCard');
      expect(card![0], '설명(desc)이 다시 화면에 그려진다 — 오너 지시로 뺀 자리다')
        .not.toMatch(/>\{desc\}</);
      expect(card![0], 'desc 를 버리면 안 된다 — PC 호버 툴팁으로는 남긴다').toMatch(/title=\{desc\}/);
      expect(card![0], '두 줄로 쪼갠 제목이 보조기기에서 한 낱말로 읽히려면 aria-label 이 필요하다')
        .toMatch(/aria-label=\{name\}/);
    });

    // 2026-09-18 오너 2차 지시 "굳이 두 줄이 아니어도 되는 부분은 한 줄로(예: 누리 스팟·홀덤 족보)".
    // 실측(4174 프로덕션 빌드, 360px 2열 제목 칸 70px): 70px 에 한 줄로 들어가는 이름은 표에서 뺀다 — 표에 있으면 강제로 두 줄이 된다.
    it('70px 에 한 줄로 들어가는 이름은 줄바꿈표에 없다 · 안 들어가는 세 토막 이름은 있다', () => {
      const lines = linesOf();
      // 360px 실측 한 줄 폭: 누리 스팟 47 · 홀덤 족보 47 · 오답 노트 47 · EV 52.7 · 콤보 58 · M존 58.3 · ICM 59.9 · SPR 60 · 아웃츠 65.7 · 용어사전 69.1 · 어그레션 69.1
      for (const k of ['spot', 'handrank', 'wrongnote', 'ev', 'combo', 'mzone', 'icm', 'spr', 'outs', 'glossary', 'aggro', 'mdf', 'deal']) {
        expect(lines.has(k), `${k} 는 360px 에서 한 줄에 들어간다 — 표에 있으면 강제 두 줄이 된다`).toBe(false);
      }
      // 105.1 · 102.1 · 86.1 · 85.9 — 70px 을 넘고 세 토막이라 폭마다 다른 데서 꺾인다. 표가 지점을 고정한다.
      for (const k of ['range', 'postflop', 'rvr', 'tda']) {
        expect(lines.has(k), `${k} 는 70px 을 넘는다 — 줄바꿈 지점을 표가 정해야 열이 맞는다`).toBe(true);
      }
    });

    it("'MDF · 블러프 계산기' 는 'MDF 계산기' 로 줄었다 — 어느 두 줄로 쪼개도 70px 을 넘어 360px 에서 3줄이었다", () => {
      const names = namesOf();
      expect(names.get('mdf')).toBe('MDF 계산기');
      // 옛 이름으로도 검색돼야 한다(keywords)
      expect(PANEL).toMatch(/key: 'mdf'[^\n]*keywords: '[^']*MDF · 블러프 계산기/);
    });

    // 2026-09-18 오너 지시 "딜 메이킹과 ICM 계산기의 차이를 모르겠어 … ICM 계산기 쪽으로 합쳐".
    // 옛 딜 계산기의 표(스택·ICM 딜·칩찹·차이)는 ICM 계산기의 '딜 비교' 모드다. 기능 소실 0 — 표의 네 열과 두 안내문, 상금>인원 안내가 남아야 한다.
    it("딜 계산기는 ICM 계산기의 '딜 비교' 모드로 병합됐다 — 카탈로그에서 숨고, #tool=deal 은 그 모드로 열린다", () => {
      const ICM = readFileSync(join(ROOT, 'src/components/features/ICMCalculator.tsx'), 'utf-8');
      expect(ICM).toContain("{ key: 'deal', label: '딜 비교' }");
      for (const col of ['>ICM 딜<', '>칩찹<', '>차이<', '>스택<']) expect(ICM, `딜 비교 표의 ${col} 열이 사라졌다`).toContain(col);
      expect(ICM).toContain('ICM 딜은 순위 확률 기반');
      expect(ICM).toContain('보통 숏스택이 ICM 딜에서 더 받습니다');
      expect(ICM).toContain('개만 분배에 반영됩니다');
      expect(ICM, '칩찹은 lib/icm 단일 소스(chipChop)').toMatch(/import \{[^}]*chipChop[^}]*\} from '\.\.\/\.\.\/lib\/icm'/);
      expect(PANEL).toContain('case \'deal\': return <ICMCalculator initialMode="deal" />');
      expect(PANEL, '옛 DealCalc 를 다시 그리면 두 화면이 갈린다').not.toContain('DealCalc');
      expect(PANEL, "'딜' 검색이 ICM 계산기에 닿아야 한다").toMatch(/key: 'icm'[^\n]*keywords: '[^']*딜 계산기/);
    });

    it('제목 칸이 2줄 자리를 늘 예약한다 — 한 줄짜리가 섞여도 열이 맞는다', () => {
      const card = [PANEL.slice(PANEL.indexOf('function ToolCard'), PANEL.indexOf('function ToolCard') + 3000)];
      expect(card![0], '2줄 예약(min-h)이 없으면 카드마다 높이가 달라 열이 안 맞는다')
        .toMatch(/min-h-\[2\.5em\]/);
    });
  });

  // 🔴 G14(2026-09-20) — 카탈로그가 말하는 항목 수가 **데이터와 같아야 한다.**
  //   `glossary.data.ts` 는 79개인데 카탈로그 설명·검색 키워드는 "74개" 였다. 화면에 적는 수치는
  //   사실이어야 한다(§6-1) — 그리고 사람이 손으로 맞추면 또 어긋나므로 계약으로 묶는다.
  //   ⚠ 숫자를 세려고 새 런타임 로더를 만들지 않는다. 원문에서 항목 수를 직접 센다
  //     (`gtoToolCount.contract.test.ts` 와 같은 조리법 — lazy 청크를 홈 번들로 끌어오지 않는다).
  it('🔴 용어사전 카탈로그 카피의 개수가 실제 데이터 항목 수와 같다', () => {
    const GLOSSARY = readFileSync(join(ROOT, 'src/components/features/tools/glossary.data.ts'), 'utf-8');
    // 항목 하나는 `{ term: '...'` 로 시작한다.
    const n = (GLOSSARY.match(/\{\s*term:\s*'/g) ?? []).length;
    expect(n, 'GLOSSARY_TERMS 를 못 읽었다 — 파싱 방식이 깨졌다').toBeGreaterThan(50);
    const row = TOOLS_PANEL.split('\n').find((l) => l.includes("{ key: 'glossary',"));
    expect(row, '카탈로그의 glossary 줄을 못 찾았다').toBeTruthy();
    const said = [...row!.matchAll(/(\d+)개/g)].map((m) => Number(m[1]));
    expect(said.length, '카탈로그 카피에 개수 표기가 없다 — 이 검사가 빈 검사가 됐다').toBeGreaterThan(0);
    for (const v of said) {
      expect(v, `카탈로그는 ${v}개라고 하는데 데이터는 ${n}개다 — 둘 중 하나가 거짓이다`).toBe(n);
    }
  });

  it('스팟 저장·공유는 전용 API 를 쓴다 — 게시글 재조회 경로가 없다', () => {
    const SPOTS_API = readFileSync(join(ROOT, 'src/api/spots.ts'), 'utf-8');
    expect(SPOTS_API).toContain('share_spot_post');
    const FORM = readFileSync(join(ROOT, 'src/components/features/PostFormModal.tsx'), 'utf-8');
    // ⚠ 단순 문자열 검사는 **삭제됐다고 설명하는 주석**에도 걸린다(실제로 걸렸다).
    //   찾아야 하는 것은 이름의 등장이 아니라 **호출·정의**다.
    expect(FORM, '본문 문자열로 글 id 를 되찾는 코드가 남아 있다').not.toMatch(/findCreatedPostId\s*\(/);
    expect(FORM, '글 id 를 찾으려 community_posts 를 다시 조회한다').not.toMatch(/from\(['"]community_posts['"]\)/);
  });

  // 🔴 2026-09-20 · 설계서 §2 `pot` 키: "팟 입력이 **상대 벳 포함 후**인지 라벨로 못 박아
  //    `call/(pot+call)` 의 단위를 분명히 한다."
  //
  //    같은 '팟' 이라는 낱말을 두 계산기가 **반대 뜻**으로 쓴다. 둘 다 100/50 을 받고 다른 답을 낸다:
  //      · 팟오즈 `call/(pot+call)` = 50/150 = **33.3%**  ← 팟은 상대 벳이 **들어간 뒤**
  //      · MDF    `pot/(pot+bet)`   = 100/150 = **66.7%** ← 팟은 상대 벳 **전**
  //    전제를 안 적으면 사용자가 한쪽은 반드시 틀리게 넣는다. 수치가 맞는 것으로는 이 결함이 안 잡힌다.
  //
  //    🔴 2026-09-21 요구 29-ⓐ — 오너가 SPR 도 전제를 붙이기로 결정했다(HANDOFF §2-D 의 보류 해제).
  //      다만 SPR = 유효스택 ÷ **이번 스트리트 베팅 전** 팟이라 팟오즈의 '상대 벳 포함' 을 베끼면
  //      전제가 반대로 적힌다. 세 라벨이 서로 달라야 하고, SPR 라벨에 '포함' 이 들어가면 안 된다.
  it('팟오즈·MDF·SPR 의 팟 입력 라벨이 전제를 품는다 — 같은 낱말을 반대 뜻으로 쓰는 자리다', () => {
    const POT = readFileSync(join(ROOT, 'src/components/features/tools/PotOddsCalc.tsx'), 'utf-8');
    const ADV = readFileSync(join(ROOT, 'src/components/features/tools/AdvancedCalcs.tsx'), 'utf-8');

    // 주석이 아니라 **화면에 나가는 라벨**을 본다(주석에 같은 말을 적어 두고 통과하는 것을 막는다).
    const potLabel = POT.match(/<Field label="([^"]*팟[^"]*)"><NumIn value=\{pot\}/)?.[1];
    expect(potLabel, '팟오즈 계산기의 팟 입력 라벨을 못 찾았다 — 이 검사가 빈 검사가 됐다').toBeTruthy();
    expect(potLabel, `팟오즈의 팟 라벨에 '상대 벳 포함' 전제가 없다: ${potLabel}`).toContain('상대 벳 포함');

    const mdfLabel = ADV.match(/text-ink-secondary">([^<]*팟[^<]*)<\/span>/)?.[1];
    expect(mdfLabel, 'MDF 계산기의 팟 입력 라벨을 못 찾았다 — 이 검사가 빈 검사가 됐다').toBeTruthy();
    expect(mdfLabel, `MDF 의 팟 라벨에 '상대 벳 전' 전제가 없다: ${mdfLabel}`).toContain('상대 벳 전');

    const STACK = readFileSync(join(ROOT, 'src/components/features/tools/StackCalcs.tsx'), 'utf-8');
    const sprLabel = STACK.match(/<Field label="([^"]*팟[^"]*)"><NumIn value=\{pot\} onChange=\{setPot\} decimal/)?.[1];
    expect(sprLabel, 'SPR 계산기의 팟 입력 라벨을 못 찾았다 — 이 검사가 빈 검사가 됐다').toBeTruthy();
    expect(sprLabel, `SPR 의 팟 라벨에 '벳 전' 전제가 없다: ${sprLabel}`).toContain('벳 전');
    // SPR 은 벳이 들어가기 전 팟이다 — 팟오즈의 '포함' 전제를 베껴 오면 계산 전제가 반대가 된다.
    expect(sprLabel, `SPR 라벨이 '포함' 전제를 달고 있다 — SPR 팟은 벳 전이다: ${sprLabel}`).not.toContain('포함');

    expect(potLabel, '두 라벨이 같아졌다 — 반대 뜻인데 구별이 사라졌다').not.toBe(mdfLabel);
    expect(sprLabel, 'SPR 과 팟오즈 라벨이 같아졌다 — 시점이 반대인데 구별이 사라졌다').not.toBe(potLabel);
  });
});
