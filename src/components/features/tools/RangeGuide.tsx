import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import RangeMatrix13, { type MatrixAction } from './RangeMatrix13';
import { ACTION_COLORS } from '../../../lib/ranges.data';
import { buildFreq } from '../../../lib/ranges';
import { RANGE_GROUPS, RANGE_SCENARIOS, type RangeScenario } from '../../../lib/ranges.data';

// 스타팅핸드 가이드 — Chen 근사(19개 계수 파생)를 폐기하고 자체 제작 표준 차트로 전환.
// 오픈(6맥스+9인 얼리)·블라인드 수비·3벳·vs 3벳 15개 시나리오, 혼합 빈도는 셀 채움으로.

export default function RangeGuide() {
  const [group, setGroup] = useState<RangeScenario['group']>('rfi6');
  const inGroup = RANGE_SCENARIOS.filter((s) => s.group === group);
  const [scenId, setScenId] = useState<string>(inGroup[0].id);
  const scen = RANGE_SCENARIOS.find((s) => s.id === scenId) ?? inGroup[0];

  const actions = useMemo<MatrixAction[]>(
    () => scen.actions.map((a) => ({
      key: a.key,
      label: a.label,
      color: a.key === 'call' ? ACTION_COLORS.call : a.key === 'fourbet' ? ACTION_COLORS.fourbet : ACTION_COLORS.raise,
      freq: buildFreq(a.spec),
    })),
    [scen],
  );

  const pickGroup = (g: RangeScenario['group']) => {
    setGroup(g);
    setScenId(RANGE_SCENARIOS.find((s) => s.group === g)!.id);
  };
  const groupMeta = RANGE_GROUPS.find((g) => g.id === group)!;

  return (
    // 제목은 전체화면 헤더가 이미 표시 — 카드 안은 설명만(2중 노출 제거)
    <CalcCard desc="포지션·상황별 표준 프리플랍 레인지 — 셀을 누르면 핸드별 빈도">
      {/* 상황 그룹 */}
      <div className="flex flex-wrap gap-1">
        {RANGE_GROUPS.map((g) => {
          const on = g.id === group;
          return (
            <button key={g.id} type="button" onClick={() => pickGroup(g.id)}
              className={['h-8 px-2.5 rounded-input text-2xs font-bold leading-none border transition-colors focus:outline-none',
                on ? 'bg-accent-300 border-accent-300 text-white' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
              {g.label}
            </button>
          );
        })}
      </div>
      <p className="text-2xs leading-relaxed text-ink-secondary rounded-input bg-surface-high/60 border border-border-subtle px-2 py-1.5">💡 {groupMeta.desc}</p>

      {/* 시나리오(포지션/매치업) */}
      <div className="flex flex-wrap gap-1">
        {inGroup.map((s) => {
          const on = s.id === scen.id;
          return (
            <button key={s.id} type="button" onClick={() => setScenId(s.id)}
              className={['h-8 px-3 rounded-input text-2xs font-bold leading-none border transition-colors focus:outline-none',
                on ? 'bg-accent-300 border-accent-300 text-white' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
              {s.label}
            </button>
          );
        })}
      </div>
      <p className="text-2xs text-ink-muted">{scen.desc}</p>

      <RangeMatrix13 actions={actions} />

      {scen.note && (
        <p className="text-2xs leading-relaxed text-accent-200 rounded-input bg-accent-300/[0.06] border border-accent-400/20 px-2 py-1.5">🎯 {scen.note}</p>
      )}
      <p className="text-2xs text-ink-muted text-center leading-relaxed">
        ※ 100bb 기준 자체 제작 표준 차트(학습용). %는 1326콤보 가중 — 실제 참여율 감각과 일치합니다.
        숏스택(≤15bb)은 <b>푸시·폴드 차트</b>를 쓰세요.
      </p>
    </CalcCard>
  );
}
