// src/components/features/tools/quizCards.tsx
// 트레이너 문제 표시 — PostflopTrainer · PreflopTrainer · 오늘의 드릴이 **같은 카드**를 쓴다.
//
// 왜 모았나(2026-08-29): 드릴이 두 트레이너의 문항을 섞어 내야 하는데, 표시 JSX 를 복사하면
//   같은 화면이 두 벌이 되어 한쪽만 고쳐지는 사고가 난다. 마크업·클래스는 기존 트레이너에서
//   **그대로 옮겼다**(디자인 변경 0).
import { useState, type ReactNode } from 'react';
import Icon from '../../atoms/Icon';
import { explainQuizMiss, type QuizExplainInput } from '../gto/gto.explain';
import { isScenarioCorrect, type Action, type Scenario } from './postflop.data';
import { verdictOf, type Quiz } from '../../../lib/preflopQuiz';

const suitColor = (s: string) => (s.includes('♥') || s.includes('♦') ? 'text-red-400' : 'text-ink-primary');

/* ──────────────────────────────────────────────────────────────────────────
   AI 심화 해설 — 오답일 때만, 그리고 버튼을 눌렀을 때만 호출한다(자동 호출 금지).
   실패해도 위의 규칙 기반 해설은 그대로 남는다 — AI 는 덤이지 화면의 전제가 아니다.
   CLS: 이 블록은 '다음 문제' 버튼 **아래**에 둔다. 눌러서 로딩으로 바뀌는 순간의 변화는
        입력 직후(500ms)라 CLS 로 잡히지 않고, 로딩 상자에 본문 높이(4.5rem)를 미리 잡아 두어
        **텍스트가 도착해도 문제·버튼이 밀리지 않는다.**
   ────────────────────────────────────────────────────────────────────────── */
type AiState = { s: 'idle' } | { s: 'load' } | { s: 'done'; text: string } | { s: 'err' };

export function AiExplainBlock({ input }: { input: QuizExplainInput }) {
  const [st, setSt] = useState<AiState>({ s: 'idle' });

  const run = () => {
    setSt({ s: 'load' });
    explainQuizMiss(input)
      .then((text) => setSt({ s: 'done', text }))
      .catch(() => setSt({ s: 'err' }));
  };

  if (st.s === 'idle') {
    return (
      <button type="button" onClick={run}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-input border border-accent-400/40 bg-accent-300/10 text-2xs font-bold text-accent-200 transition-colors hover:bg-accent-300/20">
        <Icon name="sparkles" size={13} className="shrink-0" aria-hidden />
        AI 심화 해설 보기 — 핸드 구조·보드 읽기
      </button>
    );
  }

  return (
    <div className="min-h-[4.5rem] rounded-input border border-accent-400/25 bg-accent-300/[0.04] p-2.5">
      <p className="mb-1.5 inline-flex items-center gap-1 text-2xs font-bold text-accent-200">
        <Icon name="sparkles" size={12} className="shrink-0" aria-hidden />AI 심화 해설
      </p>
      {st.s === 'load' && (
        <div className="space-y-1.5" aria-label="AI 해설 불러오는 중">
          <div className="h-3 w-full animate-pulse rounded bg-surface-high" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-surface-high" />
          <div className="h-3 w-8/12 animate-pulse rounded bg-surface-high" />
        </div>
      )}
      {st.s === 'done' && (
        <>
          <p className="whitespace-pre-line text-2xs leading-relaxed text-ink-secondary">{st.text}</p>
          <p className="mt-1.5 text-2xs text-ink-muted">AI 가 생성한 학습 참고용 설명입니다 — 위 해설이 기준입니다.</p>
        </>
      )}
      {st.s === 'err' && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs text-ink-muted">AI 해설을 불러오지 못했습니다. 위 해설을 참고하세요.</p>
          <button type="button" onClick={run}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-input border border-border-default bg-surface-high px-2 text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary">
            <Icon name="refresh" size={11} className="shrink-0" aria-hidden />다시 시도
          </button>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   포스트플랍 시나리오 카드 — 상황 / 선택지 / 해설. 채점은 postflop.data 의 isScenarioCorrect 단일 소스.
   ────────────────────────────────────────────────────────────────────────── */
export function ScenarioQuizCard({ sc, picked, onPick, badge, banner, footer }: {
  sc: Scenario;
  picked: Action | null;
  onPick: (a: Action) => void;
  /** 상황 박스 우상단 뱃지 — 트레이너는 '시벳 · 3/80', 드릴은 '약점 보완 · 시벳' */
  badge?: ReactNode;
  /** 해설 위(목표 달성 배너 등) */
  banner?: ReactNode;
  /** 해설 아래(다음 문제 버튼 등) */
  footer?: ReactNode;
}) {
  const cards = sc.hand.split(' ');
  const boardCards = sc.board === '(프리플랍)' ? [] : sc.board.split(' ');
  const ok = picked !== null && isScenarioCorrect(sc, picked);

  return (
    <>
      {/* 상황 */}
      <div className="rounded-input border border-accent-400/25 bg-accent-300/[0.04] p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-ink-secondary">{sc.spot}</p>
          {badge}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="text-2xs text-ink-muted mr-0.5">내 핸드</span>
            {cards.map((c) => (
              <span key={c} className={['rounded-[5px] border border-border-default bg-surface-base px-1.5 py-1 text-sm font-extrabold', suitColor(c)].join(' ')}>{c}</span>
            ))}
          </span>
          {boardCards.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="text-2xs text-ink-muted mr-0.5">보드</span>
              {boardCards.map((c, i) => c === '/' ? <span key={i} className="text-ink-muted">·</span> : (
                <span key={i} className={['rounded-[5px] border border-border-default bg-surface-base px-1.5 py-1 text-sm font-extrabold', suitColor(c)].join(' ')}>{c}</span>
              ))}
            </span>
          )}
        </div>
        <p className="text-2xs text-ink-muted tabular-nums">{sc.pot}</p>
      </div>

      {/* 선택지 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sc.options.map((a) => {
          const chosen = picked === a;
          const reveal = picked !== null;
          const cls = !reveal
            ? 'border-border-default bg-surface-high hover:border-accent-400/50 text-ink-primary'
            : isScenarioCorrect(sc, a)
              ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300'
              : chosen
                ? 'border-danger/60 bg-danger/10 text-danger-light'
                : 'border-border-subtle bg-surface-high text-ink-muted';
          return (
            <button key={a} type="button" onClick={() => onPick(a)} disabled={picked !== null}
              className={['rounded-input border py-2.5 text-sm font-extrabold transition-colors', cls].join(' ')}>
              {a}
            </button>
          );
        })}
      </div>

      {/* 해설 + 다음 */}
      {picked && (
        <div className="animate-fade-in space-y-2">
          {banner}
          <div className={['rounded-input border p-2.5 text-2xs leading-relaxed',
            ok ? 'border-emerald-400/40 bg-emerald-400/[0.06] text-ink-secondary' : 'border-danger/40 bg-danger/[0.06] text-ink-secondary'].join(' ')}>
            <p className="flex items-center gap-1 font-bold mb-0.5">
              <Icon name={ok ? 'check-circle' : 'close'} size={13} className={['shrink-0', ok ? 'text-emerald-400' : 'text-danger-light'].join(' ')} />
              {ok ? '정답!' : `정답은 「${sc.answer}」${sc.alsoOk ? ` (「${sc.alsoOk}」도 인정)` : ''}`}
            </p>
            {sc.why}
          </div>
          {footer}
          {/* 오답일 때만 AI 해설 진입점을 연다(비용 관리) */}
          {!ok && <AiExplainBlock input={{ kind: 'postflop', id: sc.id, hand: sc.hand, board: sc.board }} />}
        </div>
      )}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   프리플랍 문제 카드 — 포지션·핸드 / 폴드·액션 / 빈도 게이지.
   ────────────────────────────────────────────────────────────────────────── */
export function PreflopQuizCard({ quiz, result, onAnswer, banner, footer }: {
  quiz: Quiz;
  result: { correct: boolean } | null;
  onAnswer: (chose: 'act' | 'fold') => void;
  banner?: ReactNode;
  footer?: ReactNode;
}) {
  const freqPct = Math.round(quiz.freq * 100);
  const stackBb = quiz.mode === 'push' ? Number(quiz.key.split('|')[1]?.split('-')[1]) || 10 : 100;

  return (
    <>
      {/* 문제 카드 */}
      <div className="rounded-card border border-border-default bg-surface-low p-4 text-center space-y-3">
        <p className="text-2xs font-bold text-ink-muted">{quiz.situ}</p>
        <p className="text-2xl font-extrabold text-accent-200 leading-none">{quiz.posLabel}</p>
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
          <button type="button" onClick={() => onAnswer('fold')}
            className="rounded-card border border-border-default bg-surface-high py-3.5 text-sm font-extrabold text-ink-secondary hover:text-ink-primary hover:border-ink-muted/50 transition-colors active:scale-[0.98]">폴드</button>
          <button type="button" onClick={() => onAnswer('act')}
            className="rounded-card border border-accent-400/50 bg-accent-300/15 py-3.5 text-sm font-extrabold text-accent-200 hover:bg-accent-300/25 transition-colors active:scale-[0.98]">{quiz.actionLabel}</button>
        </div>
      ) : (
        <div className="space-y-2">
          {banner}
          <div className={['rounded-card border p-3 text-center', result.correct ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-danger/50 bg-danger/10'].join(' ')}>
            <p className={['flex items-center justify-center gap-1.5 text-base font-extrabold', result.correct ? 'text-emerald-300' : 'text-danger-light'].join(' ')}>
              <Icon name={result.correct ? 'check-circle' : 'close'} size={17} className="shrink-0" />{result.correct ? '정답!' : '아쉬워요'}
            </p>
            <p className="mt-1 text-xs text-ink-secondary">
              {quiz.posLabel} <b className="text-ink-primary">{quiz.hand}</b> 권장:{' '}
              <b className={quiz.freq < 0.25 ? 'text-ink-muted' : 'text-accent-200'}>{verdictOf(quiz)}</b>
            </p>
            {/* 빈도 게이지 — "정답/오답"이 아니라 빈도를 몸에 익히게 */}
            <div className="mx-auto mt-2 flex max-w-[240px] items-center gap-2">
              <span className="text-2xs text-ink-muted shrink-0">{quiz.actionLabel}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-base">
                <div className="h-full rounded-full bg-accent-300" style={{ width: `${freqPct}%` }} />
              </div>
              <span className="text-2xs font-bold tabular-nums text-ink-primary shrink-0">{freqPct}%</span>
            </div>
          </div>
          {footer}
          {/* 오답일 때만 AI 해설 진입점을 연다(비용 관리) */}
          {!result.correct && (
            <AiExplainBlock input={{ kind: 'preflop', id: quiz.key, hand: quiz.hand, posLabel: quiz.posLabel, stackBb, freq: quiz.freq }} />
          )}
        </div>
      )}
    </>
  );
}
