// GTO 탭 계약 — 정보 구조 · 출처 표시 · 과장 금지 (2026-09-11 오너 지시)
//
// 잠그는 것
//  ① 실사용 흐름 5갈래 IA 가 유지되고, 모든 도구가 정확히 한 갈래에 속한다.
//  ② `#tool=` 딥링크 키가 하나도 사라지지 않는다(공유 링크·검색 결과 하위호환).
//  ③ 실제 solver 데이터가 없는데 'solver' 배지를 붙이지 않는다.
//  ④ 화면 문구에 'GTO 정답 · 최선의 선택 · 실계산 · EV 손실' 같은 근거 없는 정밀함이 없다.
//  ⑤ 프리플랍 전략의 단일 소스가 차트(ranges.data)다 — Chen 근사가 화면으로 되돌아오지 않는다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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

describe('GTO 탭 — 실사용 흐름 5갈래 IA', () => {
  it('도구 레지스트리가 비어 있지 않다', () => {
    expect(entries.length).toBeGreaterThanOrEqual(28);
  });

  it('모든 도구가 정의된 갈래 중 하나에 속한다', () => {
    const allowed = new Set(['explore', 'train', 'review', 'tourney', 'rules', 'ops', 'money']);
    const bad = entries.filter((e) => !allowed.has(e.cat));
    expect(bad, `알 수 없는 갈래: ${JSON.stringify(bad)}`).toEqual([]);
  });

  it('다섯 갈래가 전부 채워져 있다 — 빈 섹션을 화면에 만들지 않는다', () => {
    for (const cat of ['explore', 'train', 'review', 'tourney', 'rules']) {
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
    expect(catOf('icm')).toBe('tourney');        // 토너먼트 랩
    expect(catOf('deal')).toBe('tourney');
    expect(catOf('mzone')).toBe('tourney');
    expect(catOf('tda')).toBe('rules');          // 규칙·수학
    expect(catOf('mdf')).toBe('rules');
  });

  it('뱅크롤·분산은 GTO 카탈로그에서 빠져 캘린더로 이관됐다', () => {
    expect(entries.find((e) => e.key === 'bankroll')?.cat).toBe('money');
    expect(entries.find((e) => e.key === 'variance')?.cat).toBe('money');
    expect(TOOLS_PANEL).toContain("export const CALENDAR_TOOL_KEYS = ['bankroll', 'variance']");
    // 이관해도 렌더러·딥링크는 살아 있어야 한다
    expect(TOOLS_PANEL).toContain('export const renderCalendarTool');
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
    ];
    for (const [f, kind] of need) {
      const src = readFileSync(join(ROOT, f.replace('src/components/features/HandGtoModal.tsx', 'src/components/features/HandGtoModal.tsx')), 'utf-8');
      expect(src, `${f} 에 ${kind} 출처 배지가 없다`).toMatch(new RegExp(`SourceBadge[^>]*kind=["']${kind}["']`));
    }
  });

  it('nash 데이터가 재현 불가임을 소스와 화면 양쪽에 적어 두었다', () => {
    const nash = readFileSync(join(ROOT, 'src/lib/nash.data.ts'), 'utf-8');
    expect(nash).toContain('재현 불가');
    expect(nash, '없는 생성 스크립트를 있다고 적어 두면 다음 사람이 헛수고한다').toContain('저장소에 없다');
    const chart = readFileSync(join(ROOT, 'src/components/features/tools/PushFoldChart.tsx'), 'utf-8');
    expect(chart).toContain('생성기 재현 필요');
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
//  ② 레인은 여전히 5갈래다 — 6번째를 만들면 e2e 의 '섹션 5개' 계약이 깨진다
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
    expect(lanes).toEqual(['explore', 'train', 'review', 'tourney', 'rules']);
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

  it('오래된 에퀴티 응답이 최신 결과를 덮지 않는다', () => {
    expect(SPOT_PANEL).toMatch(/reqId/);
    expect(SPOT_PANEL).toMatch(/my !== reqId\.current/);
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

  it('스팟 저장·공유는 전용 API 를 쓴다 — 게시글 재조회 경로가 없다', () => {
    const SPOTS_API = readFileSync(join(ROOT, 'src/api/spots.ts'), 'utf-8');
    expect(SPOTS_API).toContain('share_spot_post');
    const FORM = readFileSync(join(ROOT, 'src/components/features/PostFormModal.tsx'), 'utf-8');
    // ⚠ 단순 문자열 검사는 **삭제됐다고 설명하는 주석**에도 걸린다(실제로 걸렸다).
    //   찾아야 하는 것은 이름의 등장이 아니라 **호출·정의**다.
    expect(FORM, '본문 문자열로 글 id 를 되찾는 코드가 남아 있다').not.toMatch(/findCreatedPostId\s*\(/);
    expect(FORM, '글 id 를 찾으려 community_posts 를 다시 조회한다').not.toMatch(/from\(['"]community_posts['"]\)/);
  });
});
