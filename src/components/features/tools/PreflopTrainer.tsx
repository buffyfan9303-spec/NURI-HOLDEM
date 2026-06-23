// src/components/features/tools/PreflopTrainer.tsx
// 프리플랍 트레이너 — 포지션+핸드를 보고 오픈/폴드를 맞히는 연습 퀴즈.
// 정답은 스타팅핸드 가이드와 동일한 참고 레인지(lib/preflop)로 채점. 혼합(borderline)은 둘 다 정답.
import { useState } from 'react';
import { CalcCard } from './calcUi';
import { POSITIONS, action, openPct, evLossBb, randomHandLabel, labelToCards, RANK_PCT, type Pos, type TableSize, type Card } from '../../../lib/preflop';

interface Quiz { pos: Pos; label: string; cards: [Card, Card] }
function makeQuiz(): Quiz {
  const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)].id;
  const label = randomHandLabel();
  return { pos, label, cards: labelToCards(label) };
}

export default function PreflopTrainer() {
  const [size, setSize] = useState<TableSize>('6');
  const [quiz, setQuiz] = useState<Quiz>(makeQuiz);
  const [result, setResult] = useState<null | { correct: boolean; act: 'raise' | 'mix' | 'fold'; chose: 'open' | 'fold'; evLoss: number }>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0, streak: 0, best: 0 });

  const answer = (chose: 'open' | 'fold') => {
    if (result) return;
    const pctOpen = openPct(quiz.pos, size, 'open');
    const act = action(quiz.label, pctOpen);
    const correct = act === 'mix' ? true : chose === 'open' ? act === 'raise' : act === 'fold';
    setResult({ correct, act, chose, evLoss: correct ? 0 : evLossBb(quiz.label, pctOpen, chose) });
    setStats((s) => {
      const streak = correct ? s.streak + 1 : 0;
      return { correct: s.correct + (correct ? 1 : 0), total: s.total + 1, streak, best: Math.max(s.best, streak) };
    });
  };
  const next = () => { setQuiz(makeQuiz()); setResult(null); };
  const reset = () => { setStats({ correct: 0, total: 0, streak: 0, best: 0 }); next(); };

  const acc = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
  const pctRank = Math.round((RANK_PCT.get(quiz.label) ?? 1) * 100); // 0=최상위

  return (
    <CalcCard title="프리플랍 트레이너" desc="포지션·핸드를 보고 오픈/폴드 맞히기 (참고 레인지 기준)">
      {/* 테이블 크기 + 점수 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-input border border-border-default bg-surface-high p-0.5">
          {(['6', '9'] as const).map((s) => (
            <button key={s} type="button" onClick={() => { setSize(s); }}
              className={['h-6 px-2.5 rounded-[6px] text-2xs font-bold leading-none transition-colors', size === s ? 'bg-accent-300 text-white' : 'text-ink-muted'].join(' ')}>{s}맥스</button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-2xs">
          <span className="text-ink-muted">정답률 <b className="text-ink-primary tabular-nums">{acc}%</b> <span className="text-ink-muted">({stats.correct}/{stats.total})</span></span>
          <span className="text-ink-muted">연속 <b className="text-accent-300 tabular-nums">{stats.streak}</b></span>
          <span className="text-ink-muted">최고 <b className="text-ink-secondary tabular-nums">{stats.best}</b></span>
        </div>
      </div>

      {/* 문제 카드 */}
      <div className="rounded-card border border-border-default bg-surface-low p-4 text-center space-y-3">
        <p className="text-2xs font-bold text-ink-muted">내 포지션</p>
        <p className="text-2xl font-extrabold text-accent-300 leading-none">{quiz.pos}</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          {quiz.cards.map((c, i) => (
            <div key={i} className="flex h-24 w-16 flex-col items-center justify-center rounded-lg bg-white shadow-card">
              <span className={['text-3xl font-extrabold leading-none', c.red ? 'text-red-600' : 'text-gray-900'].join(' ')}>{c.rank}</span>
              <span className={['mt-1 text-2xl leading-none', c.red ? 'text-red-600' : 'text-gray-900'].join(' ')}>{c.suit}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 답 / 피드백 */}
      {!result ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => answer('fold')}
            className="rounded-card border border-border-default bg-surface-high py-3.5 text-sm font-extrabold text-ink-secondary hover:text-ink-primary hover:border-ink-muted/50 transition-colors active:scale-[0.98]">폴드</button>
          <button type="button" onClick={() => answer('open')}
            className="rounded-card border border-accent-400/50 bg-accent-300/15 py-3.5 text-sm font-extrabold text-accent-300 hover:bg-accent-300/25 transition-colors active:scale-[0.98]">오픈 (레이즈)</button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className={['rounded-card border p-3 text-center', result.correct ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-danger/50 bg-danger/10'].join(' ')}>
            <p className={['text-base font-extrabold', result.correct ? 'text-emerald-300' : 'text-danger-light'].join(' ')}>
              {result.correct ? '✅ 정답!' : '❌ 아쉬워요'}
            </p>
            <p className="mt-1 text-xs text-ink-secondary">
              {quiz.pos}에서 <b className="text-ink-primary">{quiz.label}</b> 권장 액션:{' '}
              <b className={result.act === 'fold' ? 'text-ink-muted' : 'text-accent-300'}>
                {result.act === 'raise' ? '오픈' : result.act === 'mix' ? '혼합(오픈/폴드 둘 다 OK)' : '폴드'}
              </b>
              <span className="text-ink-muted"> · 상위 {pctRank}%</span>
            </p>
            {!result.correct && result.evLoss > 0 && (
              <p className="mt-1.5 text-2xs font-semibold text-danger-light">약 −{result.evLoss} bb/100 손실 추정 <span className="font-normal text-ink-muted">(이 선택을 반복하면)</span></p>
            )}
          </div>
          <button type="button" onClick={next} className="btn-primary w-full py-3 text-sm font-bold">다음 문제 →</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={reset} className="text-2xs text-ink-muted hover:text-ink-secondary transition-colors">점수 초기화</button>
        <p className="text-[10px] text-ink-muted">※ 참고용 근사 레인지 기준 채점(6·9맥스 오픈). 실제는 상대·스택에 따라 조정.</p>
      </div>
    </CalcCard>
  );
}
