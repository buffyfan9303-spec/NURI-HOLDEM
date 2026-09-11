// src/components/features/gto/SpotReport.tsx — 스팟 리포트
//
// 정보 순서가 이 화면의 전부다(오너 지시 6-5):
//   ① 내 선택 · 평가 상태 · 기준 액션 · 분석 등급   ← 먼저 보이는 것
//   ② 액션별 빈도(가로 누적 막대) 또는 수학 지표
//   ③ 왜 그런지 · 가정 · 데이터 출처와 버전
//   ④ 저장 · 비슷한 스팟 · 스팟 토론에 공유
//
// ⚠ '어그레션 차트' 같은 해석이 어려운 그림은 쓰지 않는다. 폴드·콜·레이즈 누적 막대 하나로
//   끝내고, 퍼센트와 액션명은 **막대 밖에서도** 읽히게 목록으로 함께 적는다(작은 화면·색맹 대응).
import { useState } from 'react';
import Icon from '../../atoms/Icon';
import { ensureLogin } from '../../../lib/requireLogin';
import type { useToast } from '../../atoms/Toast';
import type { useAuth } from '../../../contexts/AuthContext';
import { actionLabel, spotSummary, type SpotReview } from '../../../lib/spot';
import {
  COVERAGE_LABEL, VERDICT_LABEL,
  type SpotEvaluation, type CoverageKind, type Verdict, type ActionMix,
} from '../../../lib/spotEvaluate';
import { saveMySpot, shareSpotPost } from '../../../api/spots';
import { gotoBoardPost } from '../../../lib/spotNav';

/** 등급별 색 — **색만으로 의미를 전하지 않는다.** 항상 라벨·아이콘과 함께 쓴다. */
const COVERAGE_TONE: Record<CoverageKind, { ring: string; text: string; icon: 'microscope' | 'table' | 'scale' | 'sigma' | 'info' }> = {
  exact_solver:         { ring: 'rgb(139 92 246 / 0.34)', text: 'text-accent-200', icon: 'microscope' },
  chart_nash:           { ring: 'rgb(34 211 238 / 0.30)', text: 'text-aura-300',   icon: 'table' },
  normalized_reference: { ring: 'rgb(251 191 36 / 0.26)', text: 'text-amber-200',  icon: 'scale' },
  math_only:            { ring: 'rgb(251 191 36 / 0.22)', text: 'text-amber-200',  icon: 'sigma' },
  unsupported:          { ring: 'rgb(148 163 184 / 0.18)', text: 'text-ink-muted', icon: 'info' },
};

const VERDICT_TONE: Record<Verdict, string> = {
  good: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/35',
  mixed: 'bg-accent-300/12 text-accent-200 border-accent-400/35',
  improve: 'bg-rose-500/12 text-rose-300 border-rose-500/35',
  reference: 'bg-amber-500/12 text-amber-200 border-amber-500/35',
  math: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
  out_of_scope: 'bg-surface-high text-ink-muted border-border-default',
};

const MIX_TONE: Record<keyof ActionMix, { bar: string; dot: string; label: string }> = {
  fold: { bar: 'bg-slate-500', dot: 'bg-slate-500', label: '폴드' },
  call: { bar: 'bg-aura-300', dot: 'bg-aura-300', label: '콜' },
  raise: { bar: 'bg-accent-300', dot: 'bg-accent-300', label: '레이즈' },
};

interface Props {
  spot: SpotReview;
  evaluation: SpotEvaluation;
  calculating: boolean;
  blocked: boolean;
  user: ReturnType<typeof useAuth>['user'];
  toast: ReturnType<typeof useToast>;
}

export default function SpotReport({ spot, evaluation, calculating, blocked, user, toast }: Props) {
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [saved, setSaved] = useState(false);
  const tone = COVERAGE_TONE[evaluation.kind];

  const onSave = async () => {
    if (!ensureLogin(user)) return;
    setBusy('save');
    try {
      await saveMySpot(spot, evaluation);
      setSaved(true);
      toast.show('내 스팟에 저장했습니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장에 실패했습니다', 'error');
    } finally { setBusy(null); }
  };

  const onShare = async () => {
    if (!ensureLogin(user)) return;
    setBusy('share');
    try {
      const postId = await shareSpotPost(spot, evaluation);
      toast.show('스팟 토론에 올렸습니다', 'success');
      // 여기서 멈추면 사용자는 **자기 글을 끝내 보지 못한다** — 올라갔는지도 알 수 없다.
      // 게시판으로 넘어가 방금 만든 글을 연다(오너 지시 2026-09-11).
      gotoBoardPost(postId);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '공유에 실패했습니다', 'error');
    } finally { setBusy(null); }
  };

  return (
    <section
      className="relative rounded-card border border-border-default bg-surface-mid p-3"
      // 결과 카드 뒤에만 등급 색 LED — 입력 카드에는 이 빛을 반복하지 않는다.
      style={{ boxShadow: `0 0 26px ${tone.ring}` }}
      aria-label="스팟 리포트"
    >
      {/* ① 먼저 보이는 것 */}
      <header className="flex flex-wrap items-center gap-2">
        {/* 평가 배지는 **판정할 것이 있을 때만** 세운다.
            · 내가 고른 액션이 없으면 판정할 대상이 없다.
            · out_of_scope 는 아래 등급 배지가 이미 같은 문장을 말한다 — 두 배지가 같은 글자를
              나란히 띄우면 정보가 늘지 않고 화면만 시끄러워진다(1280 실측에서 실제로 그랬다). */}
        {spot.heroAction !== null && evaluation.verdict !== 'out_of_scope' && (
          <span className={['inline-flex items-center gap-1 rounded-badge border px-2 py-0.5 text-2xs font-bold', VERDICT_TONE[evaluation.verdict]].join(' ')}>
            <Icon name={evaluation.verdict === 'good' ? 'check' : evaluation.verdict === 'improve' ? 'alert' : 'info'} size={11} aria-hidden />
            {VERDICT_LABEL[evaluation.verdict]}
          </span>
        )}
        <span
          data-source-badge={evaluation.kind}
          title={coverageHint(evaluation.kind)}
          className={['inline-flex items-center gap-1 rounded-badge border border-border-default bg-surface-high px-2 py-0.5 text-2xs font-semibold', tone.text].join(' ')}
        >
          <Icon name={tone.icon} size={11} aria-hidden />
          {COVERAGE_LABEL[evaluation.kind]}
        </span>
        {calculating && <span className="text-2xs text-ink-muted" aria-live="polite">계산 중…</span>}
      </header>

      <p className="mt-1.5 text-2xs text-ink-muted">{spotSummary(spot)}</p>

      <div className="mt-2 flex items-center gap-2 rounded-input bg-surface-high px-2.5 py-2">
        <span className="shrink-0 text-2xs text-ink-muted">내 선택</span>
        <span className="text-sm font-bold text-ink-primary">
          {spot.heroAction ? actionLabel(spot.heroAction) : '아직 고르지 않음'}
          {spot.heroActionSizeBb !== undefined && spot.heroAction && ['call', 'bet', 'raise'].includes(spot.heroAction) && (
            <span className="ml-1 text-xs tabular-nums text-ink-secondary">{spot.heroActionSizeBb}BB</span>
          )}
        </span>
      </div>

      {/* ② 빈도 또는 수학 */}
      {(evaluation.kind === 'chart_nash' || evaluation.kind === 'normalized_reference') && (
        <MixBar mix={evaluation.mix} heroKey={heroMixKey(spot)} />
      )}
      {(evaluation.kind === 'math_only' || evaluation.kind === 'unsupported') && (
        <MathBlock math={evaluation.math} />
      )}

      {/* ③ 왜 그런지 · 가정 · 출처
          범위 밖일 때는 **리포트 한 문장(reason)** 만 세운다.
          notes 에는 검증 오류 목록이 그대로 들어 있지만(spotEvaluate 의 데이터 계약이다),
          그건 입력 폼 바로 아래 IssueList 가 이미 빨간 배너로 말하고 있다 —
          같은 문장을 한 화면 아래에서 회색 불릿으로 한 번 더 띄우면 정보가 늘지
          않고 화면만 시끄러워진다(412px 실측에서 실제로 그러했다).
          그래도 reason 은 반드시 세운다 — 리포트는 혼자 떨어져도 자기를 설명해야 한다. */}
      {evaluation.kind === 'unsupported' ? (
        <p className="mt-2.5 border-t border-border-subtle pt-2.5 text-2xs leading-relaxed text-ink-secondary break-keep">
          {evaluation.reason}
        </p>
      ) : evaluation.notes.length > 0 ? (
        <ul className="mt-2.5 space-y-1 border-t border-border-subtle pt-2.5">
          {evaluation.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-1.5 text-2xs leading-relaxed text-ink-secondary break-keep">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted" aria-hidden />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
        데이터 버전 <span className="tabular-nums">{evaluation.datasetVersion}</span>
        {' · '}이 앱에는 검증된 솔버 데이터가 없어 <b className="text-ink-secondary">솔버 기준</b> 등급은 사용하지 않습니다.
      </p>

      {/* ④ 행동 */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-border-subtle pt-2.5">
        <button type="button" onClick={onSave} disabled={blocked || busy !== null}
          className="btn-ghost min-h-[44px] text-xs disabled:opacity-50">
          {busy === 'save' ? '저장 중…' : saved ? '저장됨' : '내 스팟에 저장'}
        </button>
        <button type="button" onClick={onShare} disabled={blocked || busy !== null}
          className="btn-primary min-h-[44px] text-xs disabled:opacity-50">
          {busy === 'share' ? '올리는 중…' : '스팟 토론에 공유'}
        </button>
      </div>
      {blocked && (
        <p className="mt-1.5 text-2xs text-ink-muted">입력을 고치면 저장·공유할 수 있어요. 적어 둔 내용은 그대로 있습니다.</p>
      )}
    </section>
  );
}

function heroMixKey(spot: SpotReview): keyof ActionMix | null {
  const a = spot.heroAction;
  if (a === 'fold') return 'fold';
  if (a === 'call') return 'call';
  if (a === 'raise' || a === 'bet') return 'raise';
  return null;
}

/** 폴드·콜·레이즈 가로 누적 막대 + 목록. 퍼센트는 막대 밖에서도 읽힌다. */
function MixBar({ mix, heroKey }: { mix: ActionMix; heroKey: keyof ActionMix | null }) {
  const order: (keyof ActionMix)[] = ['fold', 'call', 'raise'];
  const pct = (n: number) => Math.round(n * 1000) / 10;
  const text = order.map((k) => `${MIX_TONE[k].label} ${pct(mix[k])}%`).join(', ');
  return (
    <div className="mt-2.5">
      {/* 막대 자체는 장식 — 실제 값은 아래 목록이 전한다(스크린리더는 목록을 읽는다) */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-high" role="img" aria-label={`기준 빈도 — ${text}`}>
        {order.map((k) => (
          mix[k] > 0 ? <span key={k} className={MIX_TONE[k].bar} style={{ width: `${mix[k] * 100}%` }} /> : null
        ))}
      </div>
      <ul className="mt-1.5 space-y-1">
        {order.map((k) => (
          <li key={k} className="flex items-center gap-2 text-2xs">
            <span className={['h-2 w-2 shrink-0 rounded-full', MIX_TONE[k].dot].join(' ')} aria-hidden />
            <span className="flex-1 text-ink-secondary">
              {MIX_TONE[k].label}
              {heroKey === k && <span className="ml-1.5 rounded-badge bg-accent-300/15 px-1.5 py-px font-bold text-accent-200">내 선택</span>}
            </span>
            <span className="tabular-nums font-bold text-ink-primary">{pct(mix[k])}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MathBlock({ math }: { math: SpotEvaluation['math'] }) {
  const rows: [string, string, string?][] = [
    ['팟', `${math.potBb}BB`],
    ...(math.toCallBb > 0 ? [['콜 금액', `${math.toCallBb}BB`] as [string, string]] : []),
    ...(math.neededEquityPct !== null ? [['필요 승률', `${math.neededEquityPct}%`, '이 승률보다 높아야 콜이 손해가 아닙니다'] as [string, string, string]] : []),
    ...(math.heroEquityPct !== null ? [['내 승률(추정)', `${math.heroEquityPct}%`, '무작위 시행 추정치 — 돌릴 때마다 소수점이 조금 달라집니다'] as [string, string, string]] : []),
  ];
  return (
    <dl className="mt-2.5 space-y-1">
      {rows.map(([k, v, help]) => (
        <div key={k} className="flex items-baseline justify-between gap-2 rounded-input bg-surface-high px-2.5 py-1.5">
          <dt className="text-2xs text-ink-secondary" title={help}>{k}{help && <Icon name="info" size={10} className="ml-1 inline-block align-[-1px] text-ink-muted" aria-hidden />}</dt>
          <dd className="text-sm font-bold tabular-nums text-ink-primary">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function coverageHint(k: CoverageKind): string {
  switch (k) {
    case 'exact_solver':
      return '동일한 게임 트리의 검증된 솔버 산출입니다. 이 앱에는 아직 해당 데이터가 없습니다.';
    case 'chart_nash':
      return '이 앱의 자체 프리플랍 차트 또는 자체 Nash 푸시·폴드 데이터와 조건이 정확히 일치합니다.';
    case 'normalized_reference':
      return '가까운 참조 스팟을 빌려 왔습니다. 무엇이 달랐는지 함께 적혀 있으니 그 차이를 감안해서 보세요.';
    case 'math_only':
      return '에퀴티·팟오즈·필요 승률만 계산했습니다. 어떤 액션이 옳은지는 말하지 않습니다.';
    default:
      return '이 조건은 지금 데이터로 판정할 수 없습니다. 리플레이·저장·토론은 그대로 됩니다.';
  }
}
