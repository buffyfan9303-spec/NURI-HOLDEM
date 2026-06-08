// src/components/features/LuckyDrawModal.tsx
// 행운 추첨 / 랜덤 경쟁 — 결과는 즉시 계산(셔플) + 고정 시간 연출.
// 인원수(최대 수백)와 무관하게 항상 선택한 시간(30/45/60초)에 끝남 → 시간 보장.
// 대량 탈락(아레나) → 막판 N명 슬로우 역전 피날레 → 1·2·3등 순서 공개.
import { useEffect, useRef, useState } from 'react';
import Icon from '../atoms/Icon';

type Phase = 'setup' | 'racing' | 'finale' | 'done';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function LuckyDrawModal({ open, onClose, initialNames, title = '행운 추첨' }: {
  open: boolean; onClose: () => void; initialNames?: string[]; title?: string;
}) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [raw, setRaw] = useState('');
  const [winnerCount, setWinnerCount] = useState(1);
  const [duration, setDuration] = useState(40); // 초

  // 진행 상태
  const [remaining, setRemaining] = useState(0);      // 아레나 생존 수
  const [total, setTotal] = useState(0);
  const [finalists, setFinalists] = useState<string[]>([]); // 피날레 진출(순위 높은 순: order[0..k-1])
  const [eliminated, setEliminated] = useState<Set<string>>(new Set()); // 피날레에서 탈락한 이름
  const [winners, setWinners] = useState<string[]>([]); // 확정 당첨(1등→N등 순)

  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (initialNames && initialNames.length) setRaw(initialNames.join('\n'));
  }, [initialNames]);

  // 정리
  const clearAll = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };
  useEffect(() => () => clearAll(), []);
  useEffect(() => { if (!open) { clearAll(); setPhase('setup'); } }, [open]);

  if (!open) return null;

  const names = Array.from(new Set(raw.split('\n').map((s) => s.trim()).filter(Boolean)));
  const n = names.length;
  const canStart = n >= 2 && winnerCount >= 1 && winnerCount < n;

  const start = () => {
    if (!canStart) return;
    const order = shuffle(names); // order[0] = 1등(챔피언) … order[n-1] = 꼴찌
    const finaleCount = Math.min(n, Math.max(winnerCount + 4, 6));
    const fin = order.slice(0, finaleCount); // 피날레 진출(상위)
    setTotal(n);
    setRemaining(n);
    setFinalists(fin);
    setEliminated(new Set());
    setWinners([]);
    setPhase('racing');

    const finaleMs = Math.min(20000, 1300 * finaleCount + 1500);
    const bulkMs = Math.max(4000, duration * 1000 - finaleMs);
    const startT = performance.now();
    let lastShown = n;

    const loop = (now: number) => {
      const el = now - startT;
      if (el < bulkMs) {
        const p = el / bulkMs;            // 0..1
        const eased = p * p;              // 가속 탈락
        const aliveCount = Math.max(finaleCount, Math.round(n - (n - finaleCount) * eased));
        if (aliveCount !== lastShown) { lastShown = aliveCount; setRemaining(aliveCount); }
        rafRef.current = requestAnimationFrame(loop);
      } else {
        setRemaining(finaleCount);
        runFinale(order, finaleCount, finaleMs);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  // 피날레: 하위부터 한 명씩 슬로우 탈락 → 당첨 N명 순서 공개
  const runFinale = (order: string[], finaleCount: number, finaleMs: number) => {
    setPhase('finale');
    const elimSeq = order.slice(winnerCount, finaleCount).reverse(); // 꼴찌(피날레내)부터 탈락
    const stepMs = Math.max(700, Math.min(1600, finaleMs / (elimSeq.length + winnerCount + 1)));
    let t = 600;
    const elimSet = new Set<string>();
    elimSeq.forEach((nm) => {
      const id = window.setTimeout(() => { elimSet.add(nm); setEliminated(new Set(elimSet)); }, t);
      timersRef.current.push(id);
      t += stepMs;
    });
    // 당첨자 공개: N등 → 1등 순으로 쌓되, 최종 winners 배열은 1등이 먼저(내림차순 정렬)
    const winnersAsc = order.slice(0, winnerCount); // [1등..N등]
    const revealOrder = [...winnersAsc].reverse();   // N등부터 공개
    const revealed: string[] = [];
    revealOrder.forEach((nm) => {
      const id = window.setTimeout(() => {
        revealed.push(nm);
        setWinners([...revealed].sort((a, b) => winnersAsc.indexOf(a) - winnersAsc.indexOf(b)));
      }, t);
      timersRef.current.push(id);
      t += stepMs;
    });
    const doneId = window.setTimeout(() => setPhase('done'), t + 400);
    timersRef.current.push(doneId);
  };

  const reset = () => { clearAll(); setPhase('setup'); setWinners([]); setEliminated(new Set()); };

  // 아레나 점(익명) — 표시 상한 200
  const dotCount = Math.min(remaining, 200);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-surface-base">
      <header className="flex h-header-h shrink-0 items-center justify-between border-b border-border-subtle px-page-x">
        <h1 className="text-base font-bold text-ink-primary">{title}</h1>
        <button type="button" onClick={onClose} aria-label="닫기"
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-high">
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-page-x py-section">
          {phase === 'setup' && (
            <div className="space-y-4">
              <div className="rounded-card border border-gold-400/30 bg-gold-300/[0.05] p-3">
                <p className="text-sm font-bold text-gold-300">⚡ 인원 무관 · 시간 보장</p>
                <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">참가자 150명이어도 결과는 즉시 계산되고, 고른 시간에 정확히 끝납니다. 대량 탈락 후 막판 역전 피날레로 당첨자를 순서대로 공개합니다.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-ink-secondary">참가자 <span className="text-gold-300">{n}명</span> <span className="font-normal text-ink-muted">(한 줄에 한 명)</span></label>
                <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8}
                  placeholder={'홍길동\n김철수\n로티아레나\n…'} className="input w-full text-sm leading-relaxed" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-ink-secondary">당첨 인원</label>
                  <input type="number" min={1} max={Math.max(1, n - 1)} value={winnerCount}
                    onChange={(e) => setWinnerCount(Math.max(1, Math.min(n - 1 || 1, Number(e.target.value) || 1)))}
                    className="input w-full text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-ink-secondary">진행 시간</label>
                  <div className="flex gap-1 rounded-input bg-surface-high p-0.5">
                    {[30, 45, 60].map((s) => (
                      <button key={s} type="button" onClick={() => setDuration(s)}
                        className={['flex-1 rounded-[6px] py-2 text-xs font-bold transition-colors', duration === s ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary'].join(' ')}>{s}초</button>
                    ))}
                  </div>
                </div>
              </div>
              <button type="button" onClick={start} disabled={!canStart} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-50">
                {n < 2 ? '참가자를 2명 이상 입력하세요' : winnerCount >= n ? '당첨 인원이 참가자보다 적어야 합니다' : `🎲 추첨 시작 (${n}명 → ${winnerCount}명)`}
              </button>
            </div>
          )}

          {phase === 'racing' && (
            <div className="space-y-5 py-6 text-center">
              <p className="text-sm font-bold text-gold-300">추첨 진행 중…</p>
              <div>
                <p className="text-2xs text-ink-muted">남은 인원</p>
                <p className="text-6xl font-extrabold tabular-nums text-ink-primary">{remaining}</p>
                <p className="mt-1 text-2xs text-ink-muted">총 {total}명 중</p>
              </div>
              <div className="mx-auto flex max-w-md flex-wrap justify-center gap-1">
                {Array.from({ length: dotCount }, (_, i) => (
                  <span key={i} className="h-2.5 w-2.5 rounded-full bg-gold-300/70" />
                ))}
              </div>
            </div>
          )}

          {(phase === 'finale' || phase === 'done') && (
            <div className="space-y-4 py-2">
              {phase === 'finale' && <p className="text-center text-sm font-bold text-gold-300 animate-pulse">🔥 최종 역전 — 누가 살아남을까!</p>}
              {phase === 'done' && <p className="text-center text-lg font-extrabold text-gold-300">🎉 당첨자 발표</p>}

              {/* 당첨자(확정) */}
              {winners.length > 0 && (
                <div className="space-y-2">
                  {winners.map((w, i) => (
                    <div key={w} className="flex items-center gap-3 rounded-card border border-gold-400/50 bg-gradient-to-r from-gold-300/15 to-transparent p-3 animate-slide-up">
                      <span className="text-2xl">{MEDAL[i] ?? '🏅'}</span>
                      <span className="text-xs font-bold text-gold-400">{i + 1}등</span>
                      <span className="flex-1 truncate text-base font-extrabold text-ink-primary">{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 피날레 진출자(아직 미확정) */}
              {phase === 'finale' && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {finalists.filter((f) => !winners.includes(f)).map((f) => {
                    const out = eliminated.has(f);
                    return (
                      <div key={f} className={['flex items-center justify-center rounded-card border p-3 text-sm font-bold transition-all',
                        out ? 'border-border-subtle bg-surface-low text-ink-muted line-through opacity-50' : 'border-gold-400/40 bg-surface-high text-ink-primary'].join(' ')}>
                        {f}
                      </div>
                    );
                  })}
                </div>
              )}

              {phase === 'done' && (
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={reset} className="flex-1 rounded-input border border-border-default bg-surface-high py-3 text-sm font-bold text-ink-secondary hover:text-ink-primary">다시 추첨</button>
                  <button type="button" onClick={onClose} className="btn-primary flex-1 py-3 text-sm font-bold">완료</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
