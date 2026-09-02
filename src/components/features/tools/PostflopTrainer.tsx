import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import { useTrainerProgress, recordAnswer, setDailyGoal, GOAL_CHOICES } from '../../../lib/trainerProgress';
import Icon from '../../atoms/Icon';
import { ScenarioQuizCard } from './quizCards';
import {
  ALL_CATS, CAT_LABEL, SCENARIOS, isScenarioCorrect, loadPostflopStats, savePostflopStats,
  type Action, type CatStat, type Category, type PostflopStats, type Scenario,
} from './postflop.data';

/* 포스트플랍 트레이너 — 실전 상황 퀴즈(GTO 위자드 연습 모드 스타일).
   시나리오를 보고 최적 액션을 고르면 정답·해설 + 정답률을 추적한다.
   v2: 카테고리 필터 · 사이클마다 재셔플(오답 우선 배치) · localStorage 기록(카테고리별 약점 → 보완 추천).
   v3(2026-08-29): 문항 60→80. 문항 데이터는 postflop.data, 문제 표시는 quizCards 로 분리해
     '오늘의 드릴'(DailyDrill)이 **같은 문항·같은 카드·같은 기록**을 쓴다(사본 0). */

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export default function PostflopTrainer() {
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [order, setOrder] = useState<Scenario[]>(() => shuffle(SCENARIOS));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Action | null>(null);
  const [wrongIds, setWrongIds] = useState<number[]>([]); // 이번 사이클 오답 → 다음 사이클 앞쪽 배치
  const [stats, setStats] = useState<PostflopStats>(loadPostflopStats);
  const prog = useTrainerProgress();            // 게이미피케이션 진행(로컬 공용 — 별도 키)
  const [celebrate, setCelebrate] = useState(false); // 목표 달성 순간 인라인 배너 1회

  const sc = order[idx % order.length];

  const saveStats = (s: PostflopStats) => { setStats(s); savePostflopStats(s); };

  const pick = (a: Action) => {
    if (picked) return;
    setPicked(a);
    const ok = isScenarioCorrect(sc, a);
    if (recordAnswer(ok).justHitGoal) setCelebrate(true); // 오늘 목표 달성 순간 감지
    if (!ok) setWrongIds((w) => (w.includes(sc.id) ? w : [...w, sc.id]));
    const streak = ok ? stats.streak + 1 : 0;
    const cur = stats.byCat[sc.cat] ?? { t: 0, c: 0 };
    saveStats({
      total: stats.total + 1,
      correct: stats.correct + (ok ? 1 : 0),
      streak,
      best: Math.max(stats.best, streak),
      byCat: { ...stats.byCat, [sc.cat]: { t: cur.t + 1, c: cur.c + (ok ? 1 : 0) } },
    });
  };

  const next = () => {
    setPicked(null);
    setCelebrate(false);
    if (idx + 1 >= order.length) {
      // 사이클 종료 — 재셔플하되 오답 문항을 앞쪽에 우선 배치(같은 순서 반복 금지)
      const wrong = order.filter((s) => wrongIds.includes(s.id));
      const rest = order.filter((s) => !wrongIds.includes(s.id));
      setOrder([...shuffle(wrong), ...shuffle(rest)]);
      setWrongIds([]);
      setIdx(0);
    } else setIdx(idx + 1);
  };

  const changeFilter = (f: Category | 'all') => {
    if (f === filter) return;
    setFilter(f);
    setOrder(shuffle(f === 'all' ? SCENARIOS : SCENARIOS.filter((s) => s.cat === f)));
    setIdx(0);
    setPicked(null);
    setWrongIds([]);
    setCelebrate(false);
  };

  const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const catRows = useMemo(() =>
    (Object.entries(stats.byCat) as [Category, CatStat][])
      .filter(([, v]) => v.t > 0)
      .map(([k, v]) => ({ cat: k, t: v.t, c: v.c, rate: Math.round((v.c / v.t) * 100) }))
      .sort((a, b) => a.rate - b.rate), [stats]);
  // 보완 추천 — 3문항 이상 풀었고 정답률 80% 미만인 카테고리, 낮은 순 1~2개
  const weakCats = useMemo(() => catRows.filter((r) => r.t >= 3 && r.rate < 80).slice(0, 2), [catRows]);

  return (
    // 제목은 전체화면 헤더가 이미 표시 — 공통 CalcCard 로 흡수(2중 노출 제거)
    <CalcCard>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs text-ink-muted">{SCENARIOS.length}문항 · 카테고리별 출제 — 오답은 다음 사이클에서 먼저 다시 나옵니다.</p>
        <div className="shrink-0 text-right text-2xs tabular-nums">
          <p className="font-bold text-accent-300">{acc}% <span className="font-normal text-ink-muted">({stats.correct}/{stats.total})</span></p>
          <p className="text-ink-muted">연속 {stats.streak} · 최고 {stats.best}</p>
        </div>
      </div>

      {/* 게이미피케이션 진행 — 일일 목표·스트릭·XP (두 트레이너 공용 로컬 키, 위 정답률과 별도) */}
      <div className="rounded-input border border-border-subtle bg-surface-base p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-2xs">
            <span className="text-ink-muted">오늘 <b className="text-ink-primary tabular-nums">{prog.today}/{prog.goal}</b></span>
            <span className="inline-flex items-center gap-1 text-ink-muted" title={`스트릭 프리즈 ${prog.freezes}개 보유`}><Icon name="flame" size={11} className="shrink-0" /><b className="text-accent-300 tabular-nums">{prog.streak}</b></span>
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

      {/* 카테고리 필터 칩 */}
      <div className="flex flex-wrap gap-1">
        {(['all', ...ALL_CATS] as const).map((f) => (
          <button key={f} type="button" onClick={() => changeFilter(f)}
            className={['rounded-full border px-2 py-0.5 text-2xs font-bold transition-colors',
              filter === f ? 'border-accent-400/60 bg-accent-300/10 text-accent-300' : 'border-border-default bg-surface-high text-ink-muted hover:border-accent-400/40'].join(' ')}>
            {f === 'all' ? '전체' : CAT_LABEL[f]}
          </button>
        ))}
      </div>

      {/* 상황 · 선택지 · 해설 — '오늘의 드릴'과 같은 공용 카드 */}
      <ScenarioQuizCard
        sc={sc}
        picked={picked}
        onPick={pick}
        badge={<span className="shrink-0 rounded-full border border-border-default bg-surface-high px-1.5 py-0.5 text-2xs text-ink-muted tabular-nums">{CAT_LABEL[sc.cat]} · {(idx % order.length) + 1}/{order.length}</span>}
        banner={celebrate ? (
          <div className="rounded-input border border-emerald-400/50 bg-emerald-400/10 p-2.5 text-center">
            <p className="flex items-center justify-center gap-1.5 text-sm font-extrabold text-emerald-300"><Icon name="check-circle" size={15} className="shrink-0" />오늘 목표 달성!</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-2xs text-ink-secondary">+50 XP 보너스 · 스트릭 <Icon name="flame" size={11} className="shrink-0" />{prog.streak}일</p>
          </div>
        ) : null}
        footer={<button type="button" onClick={next} className="btn-primary w-full py-2 text-sm">다음 문제 →</button>}
      />

      {/* 카테고리별 기록 + 약점 보완 추천 */}
      {catRows.length > 0 && (
        <div className="rounded-input border border-border-subtle bg-surface-base p-2.5 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {catRows.map((r) => (
              <span key={r.cat} className="rounded-full border border-border-default bg-surface-high px-2 py-0.5 text-2xs tabular-nums text-ink-secondary">
                {CAT_LABEL[r.cat]} <b className={r.rate >= 80 ? 'text-emerald-300' : r.rate >= 60 ? 'text-ink-primary' : 'text-amber-300'}>{r.rate}%</b> <span className="text-ink-muted">({r.c}/{r.t})</span>
              </span>
            ))}
          </div>
          {weakCats.length > 0 && (
            <p className="flex items-start gap-1 text-2xs text-amber-300"><Icon name="pin" size={12} className="mt-px shrink-0" />보완 추천: {weakCats.map((w) => `${CAT_LABEL[w.cat]} ${w.rate}%`).join(' · ')} — 필터로 골라 집중 연습해 보세요.</p>
          )}
        </div>
      )}
    </CalcCard>
  );
}
