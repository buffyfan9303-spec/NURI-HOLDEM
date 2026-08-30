import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import RangeMatrix13, { type MatrixAction } from './RangeMatrix13';
import { ACTION_COLORS } from '../../../lib/ranges.data';
import { buildFreq, rangeComboPct } from '../../../lib/ranges';
import { RANGE_GROUPS, RANGE_SCENARIOS, type RangeScenario, type TablePos } from '../../../lib/ranges.data';
import Icon from '../../atoms/Icon';

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

const chipCls = (on: boolean) =>
  ['h-8 shrink-0 rounded-input px-2.5 text-2xs font-bold leading-none border transition-colors focus:outline-none',
    on ? 'bg-accent-300 border-accent-300 text-white' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ');

const firstOfGroup = (g: RangeScenario['group']) => RANGE_SCENARIOS.find((s) => s.group === g)!;

export default function RangeGuide({ initialGroup }: { initialGroup?: RangeScenario['group'] } = {}) {
  const [scenId, setScenId] = useState<string>(() => firstOfGroup(initialGroup ?? 'rfi6').id);
  const scen = RANGE_SCENARIOS.find((s) => s.id === scenId) ?? RANGE_SCENARIOS[0];
  const group = scen.group;

  const inGroup = useMemo(() => RANGE_SCENARIOS.filter((s) => s.group === group), [group]);
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
      color: a.key === 'call' ? ACTION_COLORS.call : a.key === 'fourbet' ? ACTION_COLORS.fourbet : ACTION_COLORS.raise,
      freq: buildFreq(a.spec),
    })),
    [scen],
  );
  // 액션이 둘 이상이면 '총 continue'(= 폴드하지 않는 비율)를 한 줄로 — 콤보 가중 %, 매트릭스 범례와 같은 규칙.
  const totalPct = useMemo(() => actions.reduce((s, a) => s + rangeComboPct(a.freq), 0), [actions]);

  const pickGroup = (g: RangeScenario['group']) => setScenId(firstOfGroup(g).id);
  const pickHero = (h: TablePos) =>
    setScenId(inGroup.filter((s) => s.hero === h).sort((a, b) => byPos(a.vs ?? a.hero, b.vs ?? b.hero))[0].id);
  const groupMeta = RANGE_GROUPS.find((g) => g.id === group)!;

  return (
    // 제목은 전체화면 헤더가 이미 표시 — 카드 안은 설명만(2중 노출 제거)
    <CalcCard desc={`포지션·상황별 표준 프리플랍 레인지 ${RANGE_SCENARIOS.length}개 — 셀을 누르면 핸드별 빈도`}>
      {/* ① 상황 그룹 */}
      <div className="flex flex-wrap gap-1">
        {RANGE_GROUPS.map((g) => (
          <button key={g.id} type="button" onClick={() => pickGroup(g.id)} aria-pressed={g.id === group} className={chipCls(g.id === group)}>
            {g.label}
          </button>
        ))}
      </div>
      <p className="text-2xs leading-relaxed text-ink-secondary rounded-input bg-surface-high/60 border border-border-subtle px-2 py-1.5"><Icon name="lightbulb" size={12} className="mr-0.5 inline-block align-[-1px] shrink-0 text-accent-300" />{groupMeta.desc}</p>

      {/* ② 내 포지션 — 한 행 5개 이하라 375px 에서도 접히지 않는다(넘치면 가로 스크롤) */}
      <div>
        <span className="mb-1 block text-2xs font-semibold text-ink-secondary">내 포지션</span>
        <div className="flex gap-1 overflow-x-auto scrollbar-none" role="group" aria-label="내 포지션">
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
          <div className="flex gap-1 overflow-x-auto scrollbar-none" role="group" aria-label={VS_CAPTION[group]}>
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

      <RangeMatrix13 actions={actions} />

      {scen.note && (
        <p className="text-2xs leading-relaxed text-accent-200 rounded-input bg-accent-300/[0.06] border border-accent-400/20 px-2 py-1.5"><Icon name="target" size={12} className="mr-0.5 inline-block align-[-1px] shrink-0" />{scen.note}</p>
      )}
      <p className="text-2xs text-ink-muted text-center leading-relaxed">
        ※ 100bb 기준 자체 제작 표준 차트(학습용). %는 1326콤보 가중 — 실제 참여율 감각과 일치합니다.
        숏스택(≤15bb)은 <b>푸시·폴드 차트</b>를 쓰세요.
      </p>
    </CalcCard>
  );
}
