// src/components/features/tools/WrongNote.tsx
// 오답 노트 — 두 트레이너가 이미 쌓는 오답 큐를 **목록**으로 본다(2026-09-03, 마스터 플랜 GKR-2 잔여분).
//
// 왜: 프리플랍 오답 큐(최근 40)는 localStorage 에 있었는데 화면엔 '오답 N개' 숫자와 25% 난수 재출제뿐이었고,
//   포스트플랍 오답은 세션 state 라 닫으면 사라졌다. 초보가 외우는 방식은 '틀렸다'가 아니라
//   '차트 어느 칸이었나' — 채점 기준이 차트라 정답 위치를 그대로 보여 줄 수 있다.
// 새 집계·새 스키마 0: 큐는 그대로 읽고, 문제는 makeQuiz(mode, key)/SCENARIOS 로 복원하며,
//   카드는 quizCards 공용, 채점·큐 갱신은 applyPreflopAnswer/applyPostflopAnswer 규칙 그대로(맞히면 큐에서 빠진다).
// 차트 점프: writeSnap('tool:range'|'tool:pushfold') 뒤 #tool= 앵커 — ToolsPanel 이 클릭을 가로채 열린 상태에서
//   갈아끼우고(swapToolOnLinkClick), renderTool 이 readSnap 으로 initial/highlight prop 을 주입한다.
import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import Icon from '../../atoms/Icon';
import { PreflopQuizCard, ScenarioQuizCard } from './quizCards';
import { WeaknessReport } from './DailyDrill';
import {
  CAT_LABEL, SCENARIOS, applyPostflopAnswer, isScenarioCorrect, loadPostflopStats, savePostflopStats,
  type Action, type Scenario,
} from './postflop.data';
import {
  applyPreflopAnswer, gradePreflop, loadPreflopStats, makeQuiz, modeOfKey, savePreflopStats, verdictOf, wrongPickOf,
  type Quiz,
} from '../../../lib/preflopQuiz';
import { recordAnswer } from '../../../lib/trainerProgress';
import { writeSnap } from '../../../lib/snapshot';

/** 차트 점프 파라미터 — renderTool 이 같은 이름의 스냅샷을 읽어 prop 으로 넘긴다(읽은 뒤 즉시 삭제) */
export type RangeJump = { scenId: string; hand: string };
export type PushJump = { k?: number; stack: number; hand?: string; ante?: boolean }; // ante: 라이브 탭 내 토너 카드(stackZone) 가 넘긴다

/** 키('rfi|<scenId>|<hand>' · 'push|<k>-<stack>|<hand>')에서 점프 파라미터를 꺼내 스냅샷에 둔다 */
function stageJump(q: Quiz): void {
  const situ = q.key.split('|')[1] ?? '';
  if (q.mode === 'rfi') { writeSnap('tool:range', { scenId: situ, hand: q.hand } satisfies RangeJump); return; }
  const [k, stack] = situ.split('-').map(Number);
  writeSnap('tool:pushfold', { k, stack, hand: q.hand } satisfies PushJump);
}

type Solving = { kind: 'preflop'; quiz: Quiz } | { kind: 'postflop'; sc: Scenario };

export default function WrongNote() {
  const [pre, setPre] = useState(loadPreflopStats);
  const [post, setPost] = useState(loadPostflopStats);
  const [solving, setSolving] = useState<Solving | null>(null);
  const [preAns, setPreAns] = useState<{ correct: boolean } | null>(null);
  const [picked, setPicked] = useState<Action | null>(null);
  const [ver, setVer] = useState(0); // 답할 때마다 약점 리포트를 다시 읽는다(key 로 재마운트)

  // 최근 오답부터. makeQuiz 는 복원에 실패하면 새 문제를 뽑으므로 키가 그대로인 것만(차트 개편으로 사라진 스팟 제외).
  const preRows = useMemo(
    () => [...pre.wrong].reverse().filter(modeOfKey).flatMap((k) => { const q = makeQuiz(modeOfKey(k)!, k); return q.key === k ? [q] : []; }),
    [pre.wrong],
  );
  const postRows = useMemo(
    () => [...post.wrong].reverse().flatMap((id) => { const sc = SCENARIOS.find((s) => s.id === id); return sc ? [sc] : []; }),
    [post.wrong],
  );

  /* 답 1건 = 게이미피케이션 + 해당 트레이너 기록(트레이너에서 푼 것과 동일). 맞히면 큐에서 빠진다. */
  const answerPreflop = (chose: 'act' | 'fold') => {
    if (solving?.kind !== 'preflop' || preAns) return;
    const ok = gradePreflop(solving.quiz.freq, chose);
    setPreAns({ correct: ok });
    recordAnswer(ok);
    const next = applyPreflopAnswer(loadPreflopStats(), solving.quiz.key, ok);
    savePreflopStats(next);
    setPre(next);
    setVer((v) => v + 1);
  };
  const pickPostflop = (a: Action) => {
    if (solving?.kind !== 'postflop' || picked) return;
    const ok = isScenarioCorrect(solving.sc, a);
    setPicked(a);
    recordAnswer(ok);
    const next = applyPostflopAnswer(loadPostflopStats(), solving.sc, ok);
    savePostflopStats(next);
    setPost(next);
    setVer((v) => v + 1);
  };
  const back = () => { setSolving(null); setPreAns(null); setPicked(null); };

  const backBtn = <button type="button" onClick={back} className="btn-primary w-full py-3 text-sm font-bold">목록으로 →</button>;

  return (
    <CalcCard desc="틀린 문제를 모아 차트에서 확인하고 다시 풉니다. 맞히면 노트에서 빠집니다.">
      <div data-testid="wrong-note" className="space-y-3">
        <WeaknessReport key={ver} />

        {solving ? (
          // 행 탭 → 목록을 그 문제 카드 하나로 교체(카드는 다중 블록이라 행 안에 못 들어간다) → 맞히든 틀리든 '목록으로'
          <div className="space-y-3" data-testid="wrong-note-solving">
            <button type="button" onClick={back}
              className="inline-flex h-8 items-center gap-1 rounded-input border border-border-default bg-surface-high px-2.5 text-2xs font-semibold text-ink-secondary transition-colors hover:text-ink-primary">
              <Icon name="chevron-left" size={13} className="shrink-0" aria-hidden />목록
            </button>
            {solving.kind === 'preflop' ? (
              <PreflopQuizCard quiz={solving.quiz} result={preAns} onAnswer={answerPreflop} footer={backBtn} />
            ) : (
              <ScenarioQuizCard
                sc={solving.sc}
                picked={picked}
                onPick={pickPostflop}
                badge={<span className="shrink-0 rounded-full border border-border-default bg-surface-high px-1.5 py-0.5 text-2xs text-ink-muted">{CAT_LABEL[solving.sc.cat]} · 오답 노트</span>}
                footer={backBtn}
              />
            )}
          </div>
        ) : preRows.length === 0 && postRows.length === 0 ? (
          <div className="space-y-2 py-6 text-center">
            <p className="text-xs font-bold text-ink-primary">아직 오답이 없습니다</p>
            <p className="text-2xs text-ink-muted">트레이너·드릴에서 틀린 문제가 여기에 쌓입니다.</p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {/* ToolsPanel 이 #tool= 앵커 클릭을 가로채 도구를 갈아끼운다(히스토리 항목 불변) */}
              <a href="#tool=trainer" className="inline-flex h-9 items-center justify-center rounded-input border border-border-default bg-surface-high text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary">프리플랍 트레이너</a>
              <a href="#tool=postflop" className="inline-flex h-9 items-center justify-center rounded-input border border-border-default bg-surface-high text-2xs font-bold text-ink-secondary transition-colors hover:text-ink-primary">포스트플랍 트레이너</a>
            </div>
          </div>
        ) : (
          <>
            {/* 프리플랍 — 핸드·상황·권장(빈도)·파생 '내 답' + 차트에서 보기 */}
            <section className="space-y-1.5">
              <div className="flex items-baseline gap-2 border-b border-border-subtle pb-1">
                <h3 className="text-xs font-bold text-ink-primary">프리플랍</h3>
                <span className="text-2xs font-semibold tabular-nums text-ink-muted">{preRows.length}개</span>
                <span className="truncate text-2xs text-ink-secondary">행을 누르면 다시 풉니다</span>
              </div>
              {preRows.length === 0 && <p className="py-2 text-2xs text-ink-muted">프리플랍 오답이 없습니다.</p>}
              {preRows.map((q) => {
                const my = wrongPickOf(q);
                return (
                  <div key={q.key} data-testid="wrong-note-row" className="flex items-stretch gap-1.5">
                    <button type="button" onClick={() => setSolving({ kind: 'preflop', quiz: q })}
                      className="card-elev flex min-w-0 flex-1 items-center gap-2.5 rounded-input border border-border-default bg-surface-low px-2.5 py-2 text-left hover:border-accent-400/40">
                      <span className="w-10 shrink-0 text-base font-extrabold leading-none text-ink-primary">{q.hand}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-2xs text-ink-secondary">{q.posLabel} · {q.situ}</span>
                        <span className="block truncate text-2xs text-ink-muted">
                          권장 <b className={q.freq < 0.25 ? 'text-ink-secondary' : 'text-accent-200'}>{verdictOf(q)}</b>
                          {my && <> · 내 답 <b className="text-danger-light">{my}</b></>}
                        </span>
                      </span>
                      <Icon name="chevron-right" size={14} className="shrink-0 text-ink-muted" aria-hidden />
                    </button>
                    <a href={q.mode === 'rfi' ? '#tool=range' : '#tool=pushfold'} onClick={() => stageJump(q)}
                      aria-label={`${q.posLabel} ${q.hand} 차트에서 보기`}
                      className="inline-flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-input border border-accent-400/40 bg-accent-300/10 px-2 text-2xs font-bold text-accent-200 transition-colors hover:bg-accent-300/20">
                      <Icon name="eye" size={13} className="shrink-0" aria-hidden />차트
                    </a>
                  </div>
                );
              })}
            </section>

            {/* 포스트플랍 — 스팟·핸드/보드·정답 */}
            <section className="space-y-1.5">
              <div className="flex items-baseline gap-2 border-b border-border-subtle pb-1">
                <h3 className="text-xs font-bold text-ink-primary">포스트플랍</h3>
                <span className="text-2xs font-semibold tabular-nums text-ink-muted">{postRows.length}개</span>
              </div>
              {postRows.length === 0 && <p className="py-2 text-2xs text-ink-muted">포스트플랍 오답이 없습니다.</p>}
              {postRows.map((sc) => (
                <button key={sc.id} type="button" data-testid="wrong-note-row" onClick={() => setSolving({ kind: 'postflop', sc })}
                  className="card-elev flex w-full items-center gap-2.5 rounded-input border border-border-default bg-surface-low px-2.5 py-2 text-left hover:border-accent-400/40">
                  <span className="shrink-0 rounded-full border border-border-default bg-surface-high px-1.5 py-0.5 text-2xs text-ink-muted">{CAT_LABEL[sc.cat]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-2xs text-ink-secondary">{sc.spot}</span>
                    <span className="block truncate text-2xs text-ink-muted">
                      {sc.hand}{sc.board !== '(프리플랍)' && ` · ${sc.board}`} · 정답 <b className="text-accent-200">{sc.answer}</b>{sc.alsoOk && <span> (「{sc.alsoOk}」도 인정)</span>}
                    </span>
                  </span>
                  <Icon name="chevron-right" size={14} className="shrink-0 text-ink-muted" aria-hidden />
                </button>
              ))}
            </section>
          </>
        )}
      </div>
    </CalcCard>
  );
}
