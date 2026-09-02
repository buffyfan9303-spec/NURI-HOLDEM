// src/components/features/tools/DailyDrill.tsx
// '오늘의 드릴' 실행 화면 — 자동 편성된 5문제를 한 줄기로 푼다.
//
// 표시는 전부 quizCards 의 공용 카드를 쓴다(신규 표시 로직 0). 여기서 하는 일은
//   ① 편성된 문항을 순서대로 꺼내고 ② 답을 **기존 두 트레이너와 같은 기록에** 반영하고
//   ③ 진행을 drillPlan 에 저장하는 것뿐이다. 그래서 드릴로 푼 문제도 정답률·약점·스트릭에
//   그대로 쌓인다(별도 집계 없음).
import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import Icon from '../../atoms/Icon';
import { PreflopQuizCard, ScenarioQuizCard } from './quizCards';
import {
  ALL_CATS, CAT_LABEL, SCENARIOS, applyPostflopAnswer, isScenarioCorrect, loadPostflopStats, savePostflopStats,
  type Action,
} from './postflop.data';
import {
  applyPreflopAnswer, gradePreflop, loadPreflopStats, makeQuiz, modeOfKey, savePreflopStats,
} from '../../../lib/preflopQuiz';
import { recordAnswer, useTrainerProgress } from '../../../lib/trainerProgress';
import { postSrsKey, recordSrs } from '../../../lib/srs';
import { DRILL_BONUS_XP, recordDrillAnswer, restartTodayDrill, useDrillPlan } from './drillPlan';

export default function DailyDrill() {
  const plan = useDrillPlan();
  const prog = useTrainerProgress();
  const [celebrate, setCelebrate] = useState(false);
  const [ans, setAns] = useState<{ picked: Action; ok: boolean } | null>(null);          // 포스트플랍 답
  const [preAns, setPreAns] = useState<{ ok: boolean } | null>(null);                    // 프리플랍 답

  const total = plan.items.length;
  const done = Math.min(plan.idx, total);
  const finished = plan.idx >= total;
  const item = finished ? undefined : plan.items[plan.idx];

  const sc = useMemo(
    () => (item?.kind === 'postflop' ? SCENARIOS.find((s) => s.id === item.id) : undefined),
    [item],
  );
  const quiz = useMemo(
    () => (item?.kind === 'preflop' ? makeQuiz(modeOfKey(item.key) ?? 'rfi', item.key) : undefined),
    [item],
  );

  /* 답 1건 = ① 게이미피케이션(오늘 목표·스트릭·XP) ② 해당 트레이너의 기록(정답률·약점·오답 큐) */
  const pickPostflop = (a: Action) => {
    if (!sc || ans) return;
    const ok = isScenarioCorrect(sc, a);
    setAns({ picked: a, ok });
    if (recordAnswer(ok).justHitGoal) setCelebrate(true);
    // 트레이너에서 푼 것과 완전히 동일하게 반영(정답률·약점·오답 노트)
    savePostflopStats(applyPostflopAnswer(loadPostflopStats(), sc, ok));
    recordSrs(postSrsKey(sc.id), ok); // 간격 반복 — 틀리면 내일, 맞히면 3·7·14·30일 뒤
  };

  const answerPreflop = (chose: 'act' | 'fold') => {
    if (!quiz || preAns) return;
    const ok = gradePreflop(quiz.freq, chose);
    setPreAns({ ok });
    if (recordAnswer(ok).justHitGoal) setCelebrate(true);
    // 맞히면 오답 큐에서 빠지고, 틀리면 큐 맨 뒤로 — 트레이너에서 푼 것과 완전히 동일하게 반영된다.
    savePreflopStats(applyPreflopAnswer(loadPreflopStats(), quiz.key, ok));
    recordSrs(quiz.key, ok);
  };

  const next = () => {
    recordDrillAnswer(ans?.ok ?? preAns?.ok ?? false);
    setAns(null);
    setPreAns(null);
    setCelebrate(false);
  };

  const restart = () => { restartTodayDrill(); setAns(null); setPreAns(null); setCelebrate(false); };

  const banner = celebrate ? (
    <div className="rounded-input border border-emerald-400/50 bg-emerald-400/10 p-2.5 text-center">
      <p className="flex items-center justify-center gap-1.5 text-sm font-extrabold text-emerald-300"><Icon name="check-circle" size={15} className="shrink-0" />오늘 목표 달성!</p>
      <p className="mt-0.5 inline-flex items-center gap-1 text-2xs text-ink-secondary">+50 XP 보너스 · 스트릭 <Icon name="flame" size={11} className="shrink-0" />{prog.streak}일</p>
    </div>
  ) : null;

  const nextBtn = <button type="button" onClick={next} className="btn-primary w-full py-2 text-sm">{plan.idx + 1 >= total ? '드릴 마치기 →' : '다음 문제 →'}</button>;

  return (
    <CalcCard desc="약점 카테고리와 오답 노트를 섞어 매일 5문제를 자동 편성합니다. 오늘 편성은 하루 동안 고정입니다.">
      {/* 진행 — 점 5개(고정 높이, 도착해도 밀리지 않음) */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-ink-primary">오늘의 드릴 <span className="tabular-nums text-accent-200">{done}/{total}</span></p>
        <div className="flex items-center gap-1.5" aria-label={`${total}문제 중 ${done}문제 완료`}>
          {plan.items.map((_, i) => (
            <span key={i} className={['h-2 w-2 rounded-full', i < done ? 'bg-accent-300' : i === done && !finished ? 'bg-accent-300/40 ring-1 ring-accent-400/60' : 'bg-surface-high'].join(' ')} />
          ))}
        </div>
      </div>

      {/* 오늘 목표·스트릭·XP — 기존 진행 지표를 드릴 안에서도 그대로 본다 */}
      <div className="flex items-center gap-3 rounded-input border border-border-subtle bg-surface-base px-2.5 py-2 text-2xs">
        <span className="text-ink-muted">오늘 <b className="text-ink-primary tabular-nums">{prog.today}/{prog.goal}</b></span>
        <span className="inline-flex items-center gap-1 text-ink-muted"><Icon name="flame" size={11} className="shrink-0" /><b className="text-accent-200 tabular-nums">{prog.streak}</b></span>
        <span className="text-ink-muted">XP <b className="text-ink-secondary tabular-nums">{prog.xp.toLocaleString()}</b></span>
      </div>

      {finished ? (
        <>
          <div className="rounded-card border border-emerald-400/50 bg-emerald-500/10 p-4 text-center space-y-1">
            <p className="flex items-center justify-center gap-1.5 text-base font-extrabold text-emerald-300">
              <Icon name="trophy" size={17} className="shrink-0" />오늘의 드릴 완료!
            </p>
            <p className="text-xs text-ink-secondary tabular-nums">{plan.correct}/{total} 정답 · 완주 보너스 +{DRILL_BONUS_XP} XP</p>
            <p className="text-2xs text-ink-muted">내일 또 새 5문제가 약점에 맞춰 편성됩니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={restart}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-input border border-border-default bg-surface-high text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary">
              <Icon name="refresh" size={13} className="shrink-0" aria-hidden />같은 5문제 다시 풀기
            </button>
            {/* ToolsPanel 이 #tool= 앵커 클릭을 가로채 도구를 갈아끼운다(히스토리 항목 불변) */}
            <a href="#tool=postflop"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-input border border-accent-400/40 bg-accent-300/10 text-2xs font-bold text-accent-200 transition-colors hover:bg-accent-300/20">
              더 풀기 — 포스트플랍 트레이너
            </a>
          </div>
        </>
      ) : item?.kind === 'postflop' && sc ? (
        <ScenarioQuizCard
          sc={sc}
          picked={ans?.picked ?? null}
          onPick={pickPostflop}
          badge={<ReasonBadge text={item.reason} step={plan.idx + 1} total={total} />}
          banner={banner}
          footer={nextBtn}
        />
      ) : item?.kind === 'preflop' && quiz ? (
        <>
          <ReasonRow text={item.reason} step={plan.idx + 1} total={total} />
          <PreflopQuizCard quiz={quiz} result={preAns ? { correct: preAns.ok } : null} onAnswer={answerPreflop} banner={banner} footer={nextBtn} />
        </>
      ) : (
        // 방어 — 문항이 사라진 편성(데이터 개편 등). 화면이 비지 않게 건너뛴다.
        <div className="space-y-2 py-6 text-center">
          <p className="text-2xs text-ink-muted">이 문항을 불러오지 못했습니다.</p>
          <button type="button" onClick={next} className="btn-primary px-4 py-2 text-2xs">건너뛰기</button>
        </div>
      )}

      <WeaknessReport />
    </CalcCard>
  );
}

/** 왜 이 문제가 나왔는지 — 상황 카드 우상단(포스트플랍) */
function ReasonBadge({ text, step, total }: { text: string; step: number; total: number }) {
  return (
    <span className="shrink-0 rounded-full border border-accent-400/40 bg-accent-300/10 px-1.5 py-0.5 text-2xs font-semibold text-accent-200 tabular-nums">
      {text} · {step}/{total}
    </span>
  );
}
/** 같은 정보를 프리플랍 문제 위에 한 줄로(프리플랍 카드는 뱃지 자리가 없다) */
function ReasonRow({ text, step, total }: { text: string; step: number; total: number }) {
  return (
    <p className="flex items-center justify-between gap-2 rounded-input border border-accent-400/25 bg-accent-300/[0.04] px-2.5 py-1.5 text-2xs font-semibold text-accent-200">
      <span className="truncate">{text}</span>
      <span className="shrink-0 tabular-nums text-ink-muted">{step}/{total}</span>
    </p>
  );
}

/**
 * 약점 리포트 — 포스트플랍 8카테고리 정답률 + 프리플랍 오답 노트 개수.
 * 새 집계를 만들지 않는다: 두 트레이너가 이미 쌓고 있는 로컬 기록을 그대로 읽어 정렬만 한다.
 * '오답 노트'(WrongNote) 상단에도 그대로 얹는다(export).
 */
export function WeaknessReport() {
  const rows = useMemo(() => {
    const post = loadPostflopStats();
    return ALL_CATS
      .map((cat) => {
        const st = post.byCat[cat];
        const t = st?.t ?? 0;
        return { cat, t, rate: t > 0 ? Math.round(((st?.c ?? 0) / t) * 100) : -1 };
      })
      .sort((a, b) => (a.rate < 0 ? 101 : a.rate) - (b.rate < 0 ? 101 : b.rate));
  }, []);
  const wrongCount = useMemo(() => loadPreflopStats().wrong.length, []);
  const solved = rows.some((r) => r.t > 0);

  return (
    <div className="rounded-input border border-border-subtle bg-surface-base p-2.5 space-y-2">
      <p className="flex items-center gap-1 text-2xs font-bold text-ink-secondary">
        <Icon name="target" size={12} className="shrink-0" aria-hidden />약점 리포트
      </p>
      {solved ? (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.cat} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-2xs text-ink-muted">{CAT_LABEL[r.cat]}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-high">
                {r.rate >= 0 && (
                  <div className={['h-full rounded-full', r.rate >= 80 ? 'bg-emerald-400' : r.rate >= 60 ? 'bg-accent-300' : 'bg-amber-400'].join(' ')} style={{ width: `${r.rate}%` }} />
                )}
              </div>
              <span className="w-16 shrink-0 text-right text-2xs tabular-nums text-ink-muted">
                {r.rate >= 0 ? <><b className={r.rate >= 80 ? 'text-emerald-300' : r.rate >= 60 ? 'text-ink-primary' : 'text-amber-300'}>{r.rate}%</b> ({r.t})</> : '아직'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-2xs text-ink-muted">아직 기록이 없습니다. 오늘 5문제를 풀면 카테고리별 정답률이 여기에 쌓입니다.</p>
      )}
      <p className="text-2xs text-ink-muted">
        프리플랍 오답 노트 <b className="text-ink-secondary tabular-nums">{wrongCount}개</b>
        {wrongCount > 0 ? '내일 드릴에 우선 편성됩니다.' : '오답이 쌓이면 드릴이 먼저 물어봅니다.'}
      </p>
    </div>
  );
}
