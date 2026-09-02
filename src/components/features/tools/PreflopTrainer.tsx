// 프리플랍 트레이너 — 표준 차트(100bb 오픈)·자체 Nash(푸시폴드) 기준 채점.
// 문제 생성·채점·기록은 lib/preflopQuiz, 문제 표시는 quizCards 로 분리했다(2026-08-29) —
// '오늘의 드릴'이 **같은 생성기·같은 카드·같은 오답 큐**를 쓰기 위해서다(사본 0).
//
// 설계 배경(유지): 균등 샘플이면 UTG 문제의 86%가 자명한 폴드라 경계 집중 샘플링을 쓰고,
// 통계는 localStorage 에 영속하며, 채점 근거는 가이드와 동일한 표준 차트/Nash 데이터다.
import { useState } from 'react';
import { CalcCard } from './calcUi';
import {
  applyPreflopAnswer, gradePreflop, loadPreflopStats, makeQuiz, savePreflopStats,
  EMPTY_PREFLOP_STATS, type Mode, type PreflopStats, type Quiz,
} from '../../../lib/preflopQuiz';
import { useTrainerProgress, recordAnswer, setDailyGoal, GOAL_CHOICES } from '../../../lib/trainerProgress';
import { recordSrs } from '../../../lib/srs';
import Icon from '../../atoms/Icon';
import { PreflopQuizCard } from './quizCards';

export default function PreflopTrainer() {
  const [mode, setMode] = useState<Mode>('rfi');
  const [stats, setStats] = useState<PreflopStats>(loadPreflopStats);
  const [quiz, setQuiz] = useState<Quiz>(() => makeQuiz('rfi'));
  const [result, setResult] = useState<null | { correct: boolean }>(null);
  const prog = useTrainerProgress();            // 게이미피케이션 진행(로컬 공용 — 별도 키)
  const [celebrate, setCelebrate] = useState(false); // 목표 달성 순간 인라인 배너 1회

  const saveStats = (s: PreflopStats) => { setStats(s); savePreflopStats(s); };

  const answer = (chose: 'act' | 'fold') => {
    if (result) return;
    const correct = gradePreflop(quiz.freq, chose);
    setResult({ correct });
    if (recordAnswer(correct).justHitGoal) setCelebrate(true); // 오늘 목표 달성 순간 감지
    saveStats(applyPreflopAnswer(stats, quiz.key, correct));
    recordSrs(quiz.key, correct); // 간격 반복 — 오늘의 드릴이 due 날짜에 다시 낸다
  };

  const next = () => {
    // 오답 큐 재출제(25%) — 틀린 문제를 잊기 전에 다시 만난다
    const retry = stats.wrong.length > 0 && Math.random() < 0.25
      ? stats.wrong[Math.floor(Math.random() * stats.wrong.length)] : undefined;
    setQuiz(makeQuiz(mode, retry && retry.startsWith(mode) ? retry : undefined));
    setResult(null);
    setCelebrate(false);
  };
  const switchMode = (m: Mode) => { setMode(m); setQuiz(makeQuiz(m)); setResult(null); };
  const reset = () => { saveStats({ ...EMPTY_PREFLOP_STATS, wrong: [] }); next(); };

  const acc = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    // 제목은 전체화면 헤더가 이미 표시 — 카드 안은 설명만(2중 노출 제거)
    <CalcCard desc="가이드·Nash 차트와 같은 데이터로 채점 · 경계 핸드 집중 출제">
      {/* 모드 + 점수 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-input border border-border-default bg-surface-high p-0.5">
          {([{ id: 'rfi' as const, label: '100bb 오픈' }, { id: 'push' as const, label: '푸시폴드' }]).map((m) => (
            <button key={m.id} type="button" onClick={() => switchMode(m.id)}
              className={['h-7 px-2.5 rounded-[6px] text-2xs font-bold leading-none transition-colors', mode === m.id ? 'bg-accent-300 text-white' : 'text-ink-muted'].join(' ')}>{m.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-2xs">
          <span className="text-ink-muted">정답률 <b className="text-ink-primary tabular-nums">{acc}%</b> <span className="text-ink-muted">({stats.correct}/{stats.total})</span></span>
          <span className="text-ink-muted">연속 <b className="text-accent-200 tabular-nums">{stats.streak}</b></span>
          <span className="text-ink-muted">최고 <b className="text-ink-secondary tabular-nums">{stats.best}</b></span>
        </div>
      </div>

      {/* 게이미피케이션 진행 — 일일 목표·스트릭·XP (기존 정답률 기록과 별도 로컬 키) */}
      <div className="rounded-input border border-border-subtle bg-surface-base p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-2xs">
            <span className="text-ink-muted">오늘 <b className="text-ink-primary tabular-nums">{prog.today}/{prog.goal}</b></span>
            <span className="inline-flex items-center gap-1 text-ink-muted" title={`스트릭 프리즈 ${prog.freezes}개 보유`}><Icon name="flame" size={11} className="shrink-0" /><b className="text-accent-200 tabular-nums">{prog.streak}</b></span>
            <span className="text-ink-muted">XP <b className="text-ink-secondary tabular-nums">{prog.xp.toLocaleString()}</b></span>
          </div>
          <div className="inline-flex items-center gap-1">
            <span className="text-2xs text-ink-muted mr-0.5">목표</span>
            {GOAL_CHOICES.map((g) => (
              <button key={g} type="button" onClick={() => setDailyGoal(g)}
                className={['h-6 px-1.5 rounded-[6px] text-2xs font-bold leading-none tabular-nums transition-colors', prog.goal === g ? 'bg-accent-300 text-white' : 'bg-surface-high text-ink-muted'].join(' ')}>{g}</button>
            ))}
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-high">
          <div className={['h-full rounded-full', prog.goalMet ? 'bg-emerald-400' : 'bg-accent-300'].join(' ')} style={{ width: `${prog.goal ? Math.min(100, Math.round((prog.today / prog.goal) * 100)) : 0}%` }} />
        </div>
        {prog.goalMet && <p className="inline-flex items-center gap-1 text-2xs text-emerald-300"><Icon name="check-circle" size={12} className="shrink-0" />오늘 목표 달성 · 스트릭 <Icon name="flame" size={11} className="shrink-0" />{prog.streak}일 유지 중</p>}
      </div>

      {/* 문제 · 피드백 — '오늘의 드릴'과 같은 공용 카드 */}
      <PreflopQuizCard
        quiz={quiz}
        result={result}
        onAnswer={answer}
        banner={celebrate ? (
          <div className="animate-fade-in rounded-card border border-emerald-400/50 bg-emerald-500/10 p-3 text-center">
            <p className="flex items-center justify-center gap-1.5 text-base font-extrabold text-emerald-300"><Icon name="check-circle" size={17} className="shrink-0" />오늘 목표 달성!</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-2xs text-ink-secondary">+50 XP 보너스 · 스트릭 <Icon name="flame" size={11} className="shrink-0" />{prog.streak}일</p>
          </div>
        ) : null}
        footer={<button type="button" onClick={next} className="btn-primary w-full py-3 text-sm font-bold">다음 문제 →</button>}
      />

      <div className="flex items-center justify-between">
        <button type="button" onClick={reset} className="px-1.5 py-1.5 -my-1.5 text-2xs text-ink-muted hover:text-ink-secondary transition-colors">기록 초기화</button>
        <p className="text-2xs text-ink-muted">
          {stats.wrong.length > 0 ? `오답 노트 ${stats.wrong.length}개. 다음 문제에서 25% 확률로 다시 나옵니다` : '기록은 이 기기에 저장됩니다'}
        </p>
      </div>
    </CalcCard>
  );
}
