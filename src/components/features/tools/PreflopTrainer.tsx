// 프리플랍 트레이너 — 표준 차트(100bb 오픈)·자체 Nash(푸시폴드) 기준 채점.
// 예전 버전의 3가지 설계 결함을 교정했다:
//  ① 균등 샘플이라 UTG 문제의 86%가 자명한 폴드 → 경계(혼합·경계 인접) 집중 샘플링
//  ② 통계가 state 뿐이라 새로고침에 소멸 → localStorage 영속 + 오답 재출제 큐
//  ③ 채점 근거가 Chen 근사 → 가이드와 동일한 표준 차트/Nash 데이터로 통일
import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import { labelToCards, type Card } from '../../../lib/preflop';
import { buildFreq, gridName, type FreqMap } from '../../../lib/ranges';
import { RANGE_SCENARIOS } from '../../../lib/ranges.data';
import { HAND_ORDER, nashRange } from '../../../lib/nash.data';
import { freqFromArray } from '../../../lib/ranges';
import { useTrainerProgress, recordAnswer, setDailyGoal, GOAL_CHOICES } from '../../../lib/trainerProgress';

type Mode = 'rfi' | 'push';
const PUSH_POS: { k: number; label: string }[] = [
  { k: 8, label: 'UTG(9인)' }, { k: 6, label: 'UTG+2' }, { k: 5, label: 'LJ' }, { k: 4, label: 'HJ' },
  { k: 3, label: 'CO' }, { k: 2, label: 'BTN' }, { k: 1, label: 'SB' },
];
const PUSH_STACKS = [5, 7, 8, 10, 12, 15]; // 실전 빈발 구간

interface Quiz {
  mode: Mode;
  key: string; // 오답 재출제 식별자
  posLabel: string;
  situ: string; // 상황 설명(스택 등)
  hand: string;
  cards: [Card, Card];
  freq: number; // 정답 액션(오픈/올인) 빈도 0..1
  actionLabel: string; // '오픈' | '올인'
}

// 경계 집중 샘플링 — 혼합 셀 3배, 경계 인접 폴드 1.5배, 깊은 폴드 0.15배
function weightedPick(freqMap: FreqMap): string {
  const f = (n: string) => freqMap.get(n) ?? 0;
  const items: { n: string; w: number }[] = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const n = gridName(i, j);
    const v = f(n);
    let w: number;
    if (v > 0 && v < 1) w = 3;
    else if (v >= 1) w = 1;
    else {
      const near = [gridName(Math.max(0, i - 1), j), gridName(Math.min(12, i + 1), j), gridName(i, Math.max(0, j - 1)), gridName(i, Math.min(12, j + 1))]
        .some((m) => f(m) > 0);
      w = near ? 1.5 : 0.15;
    }
    items.push({ n, w });
  }
  const sum = items.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * sum;
  for (const x of items) { r -= x.w; if (r <= 0) return x.n; }
  return items[items.length - 1].n;
}

const RFI_LIST = RANGE_SCENARIOS.filter((s) => s.group === 'rfi6' || s.group === 'rfi9');
const rfiFreq = (id: string): FreqMap => buildFreq(RFI_LIST.find((s) => s.id === id)!.actions[0].spec);
const pushFreq = (k: number, stack: number): FreqMap => freqFromArray(nashRange('shove', k, stack, false), HAND_ORDER);

function makeQuiz(mode: Mode, retryKey?: string): Quiz {
  if (retryKey) {
    const [m, situ, hand] = retryKey.split('|');
    if (m === 'rfi') {
      const scen = RFI_LIST.find((s) => s.id === situ);
      if (scen) return { mode: 'rfi', key: retryKey, posLabel: scen.label, situ: '100bb · 첫 진입', hand, cards: labelToCards(hand), freq: rfiFreq(situ).get(hand) ?? 0, actionLabel: '오픈' };
    } else {
      const [k, stack] = situ.split('-').map(Number);
      const p = PUSH_POS.find((x) => x.k === k);
      if (p) return { mode: 'push', key: retryKey, posLabel: p.label, situ: `${stack}bb · 첫 진입`, hand, cards: labelToCards(hand), freq: pushFreq(k, stack).get(hand) ?? 0, actionLabel: '올인' };
    }
  }
  if (mode === 'rfi') {
    const scen = RFI_LIST[Math.floor(Math.random() * RFI_LIST.length)];
    const freq = rfiFreq(scen.id);
    const hand = weightedPick(freq);
    return { mode, key: `rfi|${scen.id}|${hand}`, posLabel: scen.label, situ: '100bb · 첫 진입', hand, cards: labelToCards(hand), freq: freq.get(hand) ?? 0, actionLabel: '오픈' };
  }
  const p = PUSH_POS[Math.floor(Math.random() * PUSH_POS.length)];
  const stack = PUSH_STACKS[Math.floor(Math.random() * PUSH_STACKS.length)];
  const freq = pushFreq(p.k, stack);
  const hand = weightedPick(freq);
  return { mode, key: `push|${p.k}-${stack}|${hand}`, posLabel: p.label, situ: `${stack}bb · 첫 진입`, hand, cards: labelToCards(hand), freq: freq.get(hand) ?? 0, actionLabel: '올인' };
}

interface Stats { total: number; correct: number; streak: number; best: number; wrong: string[] }
const STAT_KEY = 'nuri:trainer:preflop:v2';
const loadStats = (): Stats => {
  try { return { total: 0, correct: 0, streak: 0, best: 0, wrong: [], ...JSON.parse(localStorage.getItem(STAT_KEY) || '{}') }; }
  catch { return { total: 0, correct: 0, streak: 0, best: 0, wrong: [] }; }
};

export default function PreflopTrainer() {
  const [mode, setMode] = useState<Mode>('rfi');
  const [stats, setStats] = useState<Stats>(loadStats);
  const [quiz, setQuiz] = useState<Quiz>(() => makeQuiz('rfi'));
  const [result, setResult] = useState<null | { correct: boolean; chose: 'act' | 'fold' }>(null);
  const prog = useTrainerProgress();            // 게이미피케이션 진행(로컬 공용 — 별도 키)
  const [celebrate, setCelebrate] = useState(false); // 목표 달성 순간 인라인 배너 1회

  const saveStats = (s: Stats) => { setStats(s); try { localStorage.setItem(STAT_KEY, JSON.stringify(s)); } catch { /* quota */ } };

  const answer = (chose: 'act' | 'fold') => {
    if (result) return;
    const f = quiz.freq;
    // 혼합(25~75%)은 어느 쪽이든 정답 — 순수 구간에서만 갈린다 (GTO Wizard 류 표준 채점의 단순화)
    const correct = chose === 'act' ? f >= 0.25 : f <= 0.75;
    setResult({ correct, chose });
    if (recordAnswer(correct).justHitGoal) setCelebrate(true); // 오늘 목표 달성 순간 감지
    const streak = correct ? stats.streak + 1 : 0;
    const wrong = correct ? stats.wrong.filter((k) => k !== quiz.key) : [...stats.wrong.filter((k) => k !== quiz.key), quiz.key].slice(-40);
    saveStats({ total: stats.total + 1, correct: stats.correct + (correct ? 1 : 0), streak, best: Math.max(stats.best, streak), wrong });
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
  const reset = () => { saveStats({ total: 0, correct: 0, streak: 0, best: 0, wrong: [] }); next(); };

  const acc = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
  const freqPct = Math.round(quiz.freq * 100);
  const verdict = useMemo(() => (quiz.freq >= 0.75 ? quiz.actionLabel : quiz.freq >= 0.25 ? `혼합 (${quiz.actionLabel} ${freqPct}%)` : '폴드'), [quiz, freqPct]);

  return (
    // 제목은 전체화면 헤더가 이미 표시 — 카드 안은 설명만(2중 노출 제거)
    <CalcCard desc="가이드·Nash 차트와 같은 데이터로 채점 — 경계 핸드 집중 출제">
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
            <span className="text-ink-muted" title={`스트릭 프리즈 ${prog.freezes}개 보유`}>🔥 <b className="text-accent-200 tabular-nums">{prog.streak}</b></span>
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
        {prog.goalMet && <p className="text-2xs text-emerald-300">🎉 오늘 목표 달성 — 스트릭 🔥{prog.streak}일 유지 중</p>}
      </div>

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
          <button type="button" onClick={() => answer('fold')}
            className="rounded-card border border-border-default bg-surface-high py-3.5 text-sm font-extrabold text-ink-secondary hover:text-ink-primary hover:border-ink-muted/50 transition-colors active:scale-[0.98]">폴드</button>
          <button type="button" onClick={() => answer('act')}
            className="rounded-card border border-accent-400/50 bg-accent-300/15 py-3.5 text-sm font-extrabold text-accent-200 hover:bg-accent-300/25 transition-colors active:scale-[0.98]">{quiz.actionLabel}</button>
        </div>
      ) : (
        <div className="space-y-2">
          {celebrate && (
            <div className="animate-fade-in rounded-card border border-emerald-400/50 bg-emerald-500/10 p-3 text-center">
              <p className="text-base font-extrabold text-emerald-300">🎉 오늘 목표 달성!</p>
              <p className="mt-0.5 text-2xs text-ink-secondary">+50 XP 보너스 · 스트릭 🔥{prog.streak}일</p>
            </div>
          )}
          <div className={['rounded-card border p-3 text-center', result.correct ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-danger/50 bg-danger/10'].join(' ')}>
            <p className={['text-base font-extrabold', result.correct ? 'text-emerald-300' : 'text-danger-light'].join(' ')}>
              {result.correct ? '✅ 정답!' : '❌ 아쉬워요'}
            </p>
            <p className="mt-1 text-xs text-ink-secondary">
              {quiz.posLabel} <b className="text-ink-primary">{quiz.hand}</b> 권장:{' '}
              <b className={quiz.freq < 0.25 ? 'text-ink-muted' : 'text-accent-200'}>{verdict}</b>
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
          <button type="button" onClick={next} className="btn-primary w-full py-3 text-sm font-bold">다음 문제 →</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={reset} className="px-1.5 py-1.5 -my-1.5 text-2xs text-ink-muted hover:text-ink-secondary transition-colors">기록 초기화</button>
        <p className="text-2xs text-ink-muted">
          {stats.wrong.length > 0 ? `오답 노트 ${stats.wrong.length}개 — 다음 문제에 25% 확률로 재출제` : '기록은 이 기기에 저장됩니다'}
        </p>
      </div>
    </CalcCard>
  );
}
