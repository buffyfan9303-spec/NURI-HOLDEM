// src/components/features/tools/SourceBadge.tsx
// 전략 결과의 **출처 배지** (2026-09-11 오너 지시).
//
// 왜 필요한가
//   이 앱의 GTO 도구가 내놓는 숫자는 출처가 제각각이다 — 사람이 쓴 학습용 차트, 자체 Nash 산출,
//   몬테카를로 에퀴티, 편집한 개념 퀴즈, 단순 임계값 휴리스틱. 그런데 화면에서는 전부 똑같이 생긴
//   숫자·라벨로 나왔다. 그러면 사용자는 그것이 solver 결과라고 읽는다.
//   실제 solver 데이터가 아닌 것에 solver 배지를 붙이지 않는다 — 그게 이 파일의 유일한 목적이다.
//
// 도구 안에 이미 있던 하단 고지("※ 솔버 아님" 등)는 그대로 둔다. 이 배지는 **결과 바로 옆**에 붙어
// 스크롤하지 않아도 보이게 하는 장치다(하단 고지는 읽히지 않는 자리에 있었다).
import Icon, { type IconName } from '../../atoms/Icon';

export type SourceKind =
  | 'chart'      // 자체 제작 학습 차트 (ranges.data.ts)
  | 'nash'       // 자체 Nash 모델 (nash.data.ts)
  | 'mc'         // 몬테카를로 에퀴티 (equityEngine)
  | 'quiz'       // 편집 개념 퀴즈 (postflop.data.ts)
  | 'heuristic'  // 휴리스틱 참고 (에퀴티 임계값 등)
  | 'solver';    // 실제 solver 데이터 — **현재 이 앱에 없다**

const META: Record<SourceKind, { label: string; hint: string; icon: IconName; cls: string }> = {
  chart: {
    label: '자체 제작 학습 차트',
    hint: '100bb 기준 통설 합의 수치로 직접 만든 표입니다. 빈도(100/50/25%)는 혼합전략을 학습용으로 단순화했습니다. 상용 솔버 표를 복제하지 않았습니다.',
    icon: 'table', cls: 'border-accent-400/40 bg-accent-300/[0.08] text-accent-200',
  },
  nash: {
    label: '자체 Nash 모델',
    hint: '첫 진입(first-in) 올인 · 단일 콜러 근사 · 2~20bb · BB앤티 옵션. fictitious play 로 수렴시킨 자체 산출값이고, 에퀴티는 몬테카를로입니다. 빈도는 0~8 단계로 양자화돼 있습니다.',
    icon: 'arrow-up-from-line', cls: 'border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-300',
  },
  mc: {
    label: '몬테카를로 에퀴티',
    hint: '무작위 시행으로 승률을 추정합니다. 시행 횟수만큼의 오차가 있고, 돌릴 때마다 소수점이 조금씩 달라질 수 있습니다.',
    icon: 'dice', cls: 'border-sky-500/40 bg-sky-500/[0.08] text-sky-300',
  },
  quiz: {
    label: '편집 개념 퀴즈',
    hint: '사람이 쓴 학습용 문항입니다. 해설은 개념 설명이고 솔버 계산이 아닙니다.',
    icon: 'brain', cls: 'border-fuchsia-500/40 bg-fuchsia-500/[0.08] text-fuchsia-300',
  },
  heuristic: {
    label: '휴리스틱 참고',
    hint: '에퀴티·팟오즈 임계값으로 뽑은 간이 기준입니다. GTO 최적 행동이 아니고 EV 손실도 계산하지 않습니다.',
    icon: 'scale', cls: 'border-amber-500/40 bg-amber-500/[0.08] text-amber-200',
  },
  solver: {
    label: '실제 solver 데이터',
    hint: '외부 솔버가 계산한 값입니다.',
    icon: 'microscope', cls: 'border-violet-500/40 bg-violet-500/[0.08] text-violet-300',
  },
};

/**
 * 결과 옆 출처 배지. `title` 로 근거를 그대로 읽을 수 있게 한다(모바일에서는 길게 눌러 확인).
 *
 * ⚠ 'solver' 는 실제 솔버 데이터에만 쓴다. 현재 이 앱에는 그 데이터가 없으므로
 *   어느 도구도 이 값을 넘기면 안 된다 — src/components/features/tools/sourceBadge.test.ts 가 잠근다.
 */
export default function SourceBadge({ kind, note, className = '' }: {
  kind: SourceKind;
  /** 도구별 추가 한 줄(예: '9인 UTG · 100bb'). 없으면 출처만 표시. */
  note?: string;
  className?: string;
}) {
  const m = META[kind];
  return (
    <span
      data-source-badge={kind}
      title={m.hint}
      className={['inline-flex max-w-full items-center gap-1 rounded-badge border px-1.5 py-0.5 text-2xs font-semibold leading-none', m.cls, className].join(' ')}
    >
      <Icon name={m.icon} size={11} className="shrink-0" aria-hidden />
      <span className="truncate">{m.label}{note ? ` · ${note}` : ''}</span>
    </span>
  );
}
