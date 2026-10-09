import { CHIP_HIT } from '../gto/chip';
import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import RangeMatrix13, { type MatrixAction } from './RangeMatrix13';
import SourceBadge from './SourceBadge';
import { buildFreq, rangeComboPct } from '../../../lib/ranges';
import { RANGE_GROUPS, RANGE_SCENARIOS, type RangeScenario, type TablePos } from '../../../lib/ranges.data';
import { DEPTH_GAP_NOTE, DEPTH_SCENARIOS, carryScenario, type RangeDepth } from '../../../lib/ranges.depth.data';
import Icon from '../../atoms/Icon';
import SegmentedTabs from '../../atoms/SegmentedTabs';

// 스타팅핸드 가이드 — Chen 근사(19개 계수 파생)를 폐기하고 자체 제작 표준 차트로 전환.
// 오픈(6맥스+9인 얼리)·블라인드 수비·3벳·vs 3벳 34개 시나리오, 혼합 빈도는 셀 채움으로.
//
// 2026-08-30 선택 UI 재설계(스팟 23 → 34):
//   예전엔 '그룹 칩 한 줄 + 시나리오 칩 한 줄' 이었다. 시나리오 칩은 한 줄에 그룹 전체가 들어가야 해서
//   defend 6개만으로도 375px 에서 두 줄로 무너졌고, 34개가 되면 그 줄이 화면의 절반을 먹는다
//   (= 차트를 찾을 수 없는 상태). 그래서 축을 **내 포지션 × 상대 포지션 2단**으로 쪼갰다 —
//   어느 그룹에서도 한 행의 칩이 5개를 넘지 않는다(실측: rfi6 5 · defend 최대 5 · threebet 4 · vs3bet 5).
//   축의 근거는 라벨 문자열 파싱이 아니라 데이터의 hero/vs 필드다(라벨은 카피라 언제든 바뀐다).

/** 포지션 정렬 — 테이블 순서 고정(칩 순서가 데이터 배열 순서에 흔들리지 않게) */
const POS_ORDER: TablePos[] = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const byPos = (a: TablePos, b: TablePos) => POS_ORDER.indexOf(a) - POS_ORDER.indexOf(b);

/** 그룹별 '상대' 축의 뜻 — vs3bet 은 오픈한 사람이 아니라 3벳한 사람이다 */
const VS_CAPTION: Record<RangeScenario['group'], string> = {
  rfi6: '', rfi9: '',
  defend: '상대 오픈 포지션',
  threebet: '상대 오픈 포지션',
  vs3bet: '3벳한 상대',
};

// 이 칩은 전부 overflow-x-auto 가로 스크롤 행 안에 있다(아래 세 사용처) — 그 조상이
// overflow-y 를 함께 auto 로 만들어 tap-y-44 의 위아래 오버행이 실측(2026-09-20)에서 잘렸고,
// 그래서 한동안 박스 자체를 44px 로 키웠다(h-8 → h-[44px]).
// 🔴 2026-09-21 오너: "버튼 pill 위아래 공백 조절" — 11.7px 글자에 44px 박스는 위아래가 16px 씩 비어 보였다.
//   박스를 34px(h-8)로 되돌리고 44px 터치는 다시 오버행이 맡는다. 2026-09-24 G3: 32px + CHIP_HIT(gto/chip.ts) — 레일 py-1.5 에 잘려 44.75px. 잘림은 **레일 쪽**에서 푼다:
//   레일에 `py-[7px] -my-[7px]`(px 고정 — 2026-10-05 루트 16px 에서 py-1.5 는 6px 라 32+12=44 경계, 정수 탐침 43) — 오버행이 스크롤 컨테이너의 패딩 박스 안에 들어와 안 잘리고,
//   음수 마진이 그만큼 되물려 바깥 레이아웃(캡션 간격·space-y)은 종전과 같다. 레일 ① 은 CalcCard 의
//   `space-y-3`(특이도 0,3,0 — 자식 margin 을 덮어쓴다) 직계라 래퍼 div 로 한 겹 감싼다(마진 상쇄로 12.75px 유지).
//   e2e/gto-tab-verify.spec.ts '상황 그룹 칩 44px 유효 표적' 이 elementFromPoint 로 오버행까지 잰다.
const chipCls = (on: boolean) =>
  [CHIP_HIT, 'h-[32px] shrink-0 rounded-input px-2.5 text-2xs font-bold leading-none border transition-colors focus:outline-hidden',
    on ? 'bg-accent-300 border-accent-300 text-white' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ');

const firstOfGroup = (list: RangeScenario[], g: RangeScenario['group']) => list.find((s) => s.group === g) ?? list[0];

// 스택 깊이(2026-10-09 오너 "100bb 뿐 아니라 3개 정도 더") — 모든 표를 바꾸는 가장 바깥 축이라 그룹 칩 위 한 줄.
//   100bb 는 앤티 없는 표(ranges.data.ts), 25·40·60bb 는 BB 앤티 1bb 표(ranges.depth.data.ts). 기본은 100bb 그대로다
//   (오답 노트 '차트에서 보기'·#tool=range 딥링크가 100bb id 로 온다).
type DepthKey = '25' | '40' | '60' | '100';
const DEPTH_TABS: { key: DepthKey; label: string }[] = [
  { key: '25', label: '25bb' }, { key: '40', label: '40bb' }, { key: '60', label: '60bb' }, { key: '100', label: '100bb' },
];
const listOf = (k: DepthKey): RangeScenario[] => (k === '100' ? RANGE_SCENARIOS : DEPTH_SCENARIOS[Number(k) as RangeDepth]);

export default function RangeGuide({ initialGroup, initialScenId, highlight }: {
  initialGroup?: RangeScenario['group'];
  /** 오답 노트 '차트에서 보기' — 그 시나리오·그 셀로 바로 진입(없는 id 면 기본 그룹) */
  initialScenId?: string;
  highlight?: string;
} = {}) {
  // 기본 그룹 = 9인 오픈(2026-09-02): 국내 홀덤펍은 9인 테이블이 기본이라 6맥스보다 먼저 보여야 한다
  const [depth, setDepth] = useState<DepthKey>('100');
  const list = listOf(depth);
  const [scenId, setScenId] = useState<string>(
    () => (initialScenId && RANGE_SCENARIOS.some((s) => s.id === initialScenId) ? initialScenId : firstOfGroup(RANGE_SCENARIOS, initialGroup ?? 'rfi9').id),
  );
  const scen = list.find((s) => s.id === scenId) ?? list[0];
  const group = scen.group;
  // 그 깊이에 표가 있는 그룹만 — 빈 상자를 만들지 않는다(25bb 에는 3벳·vs 3벳이 없다). 칩 행은 가로 스크롤 한 줄이라 개수가 바뀌어도 높이는 같다.
  const groups = useMemo(() => RANGE_GROUPS.filter((g) => list.some((s) => s.group === g.id)), [list]);

  const inGroup = useMemo(() => list.filter((s) => s.group === group), [list, group]);
  // 1단: 내 포지션 — 그룹 안에서 중복 제거 후 테이블 순서로
  const heroes = useMemo(() => [...new Set(inGroup.map((s) => s.hero))].sort(byPos), [inGroup]);
  // 2단: 상대 — 고른 내 포지션 안의 매치업들(RFI 는 상대가 없어 이 행 자체가 없다)
  // 정렬은 데이터 배열 순서가 아니라 테이블 순서 — sb_vs_btn 이 먼저 쓰였다고 'vs BTN, vs LJ…' 로 뜨면 안 된다.
  const matchups = useMemo(
    () => inGroup.filter((s) => s.hero === scen.hero).sort((a, b) => byPos(a.vs ?? a.hero, b.vs ?? b.hero)),
    [inGroup, scen.hero],
  );
  const hasVsRow = matchups.length > 1 || matchups.some((s) => s.vs);

  const actions = useMemo<MatrixAction[]>(
    () => scen.actions.map((a) => ({
      key: a.key,
      label: a.label,
      // 채움색은 RangeMatrix13 이 key → 테마별 RANGE_FILL(src/lib/rangeColors.ts) 로 정한다(2026-09-26).
      freq: buildFreq(a.spec),
    })),
    [scen],
  );
  // 액션이 둘 이상이면 '총 continue'(= 폴드하지 않는 비율)를 한 줄로 — 콤보 가중 %, 매트릭스 범례와 같은 규칙.
  const totalPct = useMemo(() => actions.reduce((s, a) => s + rangeComboPct(a.freq), 0), [actions]);

  const pickGroup = (g: RangeScenario['group']) => setScenId(firstOfGroup(list, g).id);
  // 깊이를 바꿔도 같은 자리(같은 그룹·내 자리·상대)를 유지한다 — 셀 선택(RangeMatrix13)도 그대로라 같은 손을 깊이별로 비교할 수 있다.
  const pickDepth = (k: DepthKey) => {
    setDepth(k);
    setScenId(carryScenario(listOf(k), scen).id);
  };
  const pickHero = (h: TablePos) =>
    setScenId(inGroup.filter((s) => s.hero === h).sort((a, b) => byPos(a.vs ?? a.hero, b.vs ?? b.hero))[0].id);

  return (
    // 제목은 전체화면 헤더가 이미 표시 — 카드 안은 설명만(2중 노출 제거)
    // desc 는 개수를 세지 않는 고정 문장 — 깊이마다 개수가 달라 바꿀 때 글자 폭·줄 수가 튄다.
    <CalcCard desc="포지션·상황별 프리플랍 레인지 · 스택 깊이 4단계 · 셀을 누르면 핸드별 빈도">
      {/* ⓪ 스택 깊이 — 위로만 넓히는 44px 누름면(hitUp)이 위 desc 와 겹치지 않게 pt-1.5 로 간격을 벌린다
          (space-y-3 12px < 오버행 13px → 6px 를 더해 18px). role 은 달지 않는다(tablist 를 group 으로 또 감싸지 않게). */}
      <div data-testid="range-depth" className="pt-1.5">
        <SegmentedTabs items={DEPTH_TABS} value={depth} onChange={pickDepth} grow hitUp className="w-full" />
      </div>
      {/* ① 상황 그룹 */}
      {/* ⚠ 줄바꿈(flex-wrap)이 아니라 **가로 스크롤**이다(오너 2026-09-18: "아직도 아래에는 왜 한개가 또 떨어져 있어").
          5개가 한 줄에 안 들어가면 wrap 은 마지막 하나만 아래로 떨어뜨려 **4+1 고아**를 만들고,
          그룹을 누를 때마다 줄 수가 변해 카드 높이가 튄다(이 파일이 2026-08-30 에 이미 겪은 문제다).
          아래 '내 포지션'·'상대' 두 줄이 쓰는 방식과 같게 맞춘다 — 넘치면 옆으로 민다. */}
      <div>
        <div data-testid="range-guide" className="-my-[7px] flex gap-1 overflow-x-auto py-[7px] scrollbar-none">
          {groups.map((g) => (
            <button key={g.id} type="button" onClick={() => pickGroup(g.id)} aria-pressed={g.id === group} className={chipCls(g.id === group)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {/* 그룹 설명(전구 팁)은 뺐다(오너 2026-09-17 "쓸데없는 부연설명 빼") — 자리·상대는 아래 칩 행이, 기준(100bb)은 출처 배지가 이미 말한다.
          320px 에서 '오픈 (9인)' 만 두 줄이라 그룹을 누를 때마다 높이가 튀었다(실측). */}

      {/* ② 내 포지션 — 한 행 5개 이하라 375px 에서도 접히지 않는다(넘치면 가로 스크롤) */}
      <div>
        <span className="mb-1 block text-2xs font-semibold text-ink-secondary">내 포지션</span>
        <div className="-my-[7px] flex gap-1 overflow-x-auto py-[7px] scrollbar-none" role="group" aria-label="내 포지션">
          {heroes.map((h) => (
            <button key={h} type="button" onClick={() => pickHero(h)} aria-pressed={h === scen.hero} className={chipCls(h === scen.hero)}>
              {h}
            </button>
          ))}
        </div>
      </div>

      {/* ③ 상대(오픈·3벳한 사람) — RFI 처럼 상대가 없는 그룹에서는 행 자체가 사라진다 */}
      {hasVsRow && (
        <div>
          <span className="mb-1 block text-2xs font-semibold text-ink-secondary">{VS_CAPTION[group]}</span>
          <div className="-my-[7px] flex gap-1 overflow-x-auto py-[7px] scrollbar-none" role="group" aria-label={VS_CAPTION[group]}>
            {matchups.map((s) => (
              <button key={s.id} type="button" onClick={() => setScenId(s.id)} aria-pressed={s.id === scen.id} className={chipCls(s.id === scen.id)}>
                {s.vs ? `vs ${s.vs}` : '상대 미지정'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 지금 보고 있는 표 — 2단으로 좁힌 결과를 한 줄로 확인 */}
      <div className="flex items-baseline justify-between gap-2 border-b border-border-subtle pb-1.5">
        <b className="min-w-0 truncate text-sm text-ink-primary">{scen.label}</b>
        {actions.length > 1 && (
          <span className="shrink-0 text-2xs text-ink-muted">총 <b className="tabular-nums text-ink-secondary">{totalPct.toFixed(1)}%</b></span>
        )}
      </div>
      <p className="text-2xs text-ink-muted">{scen.desc}</p>

      {/* 출처는 결과 **바로 옆**에 붙인다 — 하단 ※ 고지는 스크롤 밖이라 읽히지 않았다(2026-09-11). */}
      <div className="flex flex-col items-center gap-0.5">
        <SourceBadge kind="chart" note={depth === '100' ? '100bb · 앤티 없음' : `${depth}bb · BB앤티`} />
        {/* 기준 한 줄(A-012, 2026-10-09) — 차트가 9인 대회 기준임을 배지 바로 아래에 못박는다. nowrap: 320px 에서도 한 줄(높이 고정). */}
        <p className="text-2xs text-ink-muted whitespace-nowrap" data-testid="range-basis">9인 대회 기준</p>
      </div>
      <RangeMatrix13 actions={actions} initialSel={highlight} />

      {scen.note && (
        <p className="text-2xs leading-relaxed text-accent-200 rounded-input bg-accent-300/6 border border-accent-400/20 px-2 py-1.5"><Icon name="target" size={12} className="mr-0.5 inline-block align-[-1px] shrink-0" />{scen.note}</p>
      )}
      <p className="text-2xs text-ink-muted text-center leading-relaxed">
        ※ 자체 제작 학습 차트(솔버 산출 아님). %는 1326콤보 가중. 스택은 앤티를 낸 뒤 남은 유효 스택.
        20bb 이하는 <b>푸시·폴드 차트</b>를 쓰세요.
        <br />{DEPTH_GAP_NOTE[depth === '100' ? 100 : (Number(depth) as RangeDepth)]}
      </p>
    </CalcCard>
  );
}
