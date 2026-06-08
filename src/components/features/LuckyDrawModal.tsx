// src/components/features/LuckyDrawModal.tsx
// 랜덤 게임(추첨) — 결과는 즉시 계산(셔플) + 고정 시간 연출. 인원 무관 항상 30/45/60초에 종료.
// mode='arena': 대량 탈락 아레나 + 막판 역전 피날레.  mode='marble': 마블 레이스(레인 경주, 추월=역전).
// 두 모드 모두 끝나면 전체 순위(1~n) 표시(당첨 N명 강조).
import { useEffect, useRef, useState } from 'react';
import Icon from '../atoms/Icon';

type Mode = 'arena' | 'marble';
type Phase = 'setup' | 'racing' | 'finale' | 'done';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const MEDAL = ['🥇', '🥈', '🥉'];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function LuckyDrawModal({ open, onClose, initialNames, title, mode = 'arena' }: {
  open: boolean; onClose: () => void; initialNames?: string[]; title?: string; mode?: Mode;
}) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [raw, setRaw] = useState('');
  const [winnerCount, setWinnerCount] = useState(1);
  const [duration, setDuration] = useState(40);

  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [order, setOrder] = useState<string[]>([]);          // 최종 순위: order[0]=1등 … order[n-1]=꼴찌
  const [finalists, setFinalists] = useState<string[]>([]);  // (arena) 피날레 진출
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const [winners, setWinners] = useState<string[]>([]);      // 확정 당첨(1등→N등)

  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const heading = title ?? (mode === 'marble' ? '마블 레이스 🪀' : '행운 추첨 🎲');

  useEffect(() => { if (initialNames && initialNames.length) setRaw(initialNames.join('\n')); }, [initialNames]);

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
    const ord = shuffle(names);
    setOrder(ord); setTotal(n); setRemaining(n);
    setFinalists([]); setEliminated(new Set()); setWinners([]);
    setPhase('racing');
    if (mode === 'marble') requestAnimationFrame(() => startMarble(ord));
    else startArena(ord);
  };

  // ── 아레나: 가속 대량 탈락 → 막판 역전 피날레 ──
  const startArena = (ord: string[]) => {
    const finaleCount = Math.min(n, Math.max(winnerCount + 4, 6));
    setFinalists(ord.slice(0, finaleCount));
    const finaleMs = Math.min(20000, 1300 * finaleCount + 1500);
    const bulkMs = Math.max(4000, duration * 1000 - finaleMs);
    const startT = performance.now();
    let lastShown = n;
    const loop = (now: number) => {
      const el = now - startT;
      if (el < bulkMs) {
        const p = el / bulkMs;
        const aliveCount = Math.max(finaleCount, Math.round(n - (n - finaleCount) * (p * p)));
        if (aliveCount !== lastShown) { lastShown = aliveCount; setRemaining(aliveCount); }
        rafRef.current = requestAnimationFrame(loop);
      } else { setRemaining(finaleCount); runFinale(ord, finaleCount, finaleMs); }
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const runFinale = (ord: string[], finaleCount: number, finaleMs: number) => {
    setPhase('finale');
    const elimSeq = ord.slice(winnerCount, finaleCount).reverse();
    const stepMs = Math.max(700, Math.min(1600, finaleMs / (elimSeq.length + winnerCount + 1)));
    let t = 600;
    const elimSet = new Set<string>();
    elimSeq.forEach((nm) => {
      timersRef.current.push(window.setTimeout(() => { elimSet.add(nm); setEliminated(new Set(elimSet)); }, t));
      t += stepMs;
    });
    const winnersAsc = ord.slice(0, winnerCount);
    [...winnersAsc].reverse().forEach((nm) => {
      timersRef.current.push(window.setTimeout(() => {
        setWinners((prev) => [...prev, nm].sort((a, b) => winnersAsc.indexOf(a) - winnersAsc.indexOf(b)));
      }, t));
      t += stepMs;
    });
    timersRef.current.push(window.setTimeout(() => setPhase('done'), t + 400));
  };

  // ── 마블 레이스: 레인 경주(추월=역전), 결승선 통과 순서 = 순위 ──
  const startMarble = (ord: string[]) => {
    const cvs = canvasRef.current;
    if (!cvs) { setWinners(ord.slice(0, winnerCount)); setPhase('done'); return; }
    const dpr = window.devicePixelRatio || 1;
    const W = cvs.clientWidth, H = cvs.clientHeight;
    cvs.width = W * dpr; cvs.height = H * dpr;
    const ctx = cvs.getContext('2d'); if (!ctx) return; ctx.scale(dpr, dpr);
    const T = duration * 1000;
    const rankOf = new Map(ord.map((nm, i) => [nm, i]));
    const lanes = shuffle(ord); // 레인 배치는 랜덤(추월 잘 보이게)
    const laneH = H / n;
    const r = Math.max(2, Math.min(7, laneH * 0.42));
    const marbles = lanes.map((nm, lane) => ({
      nm, lane, rank: rankOf.get(nm)!, hue: (lane * 53) % 360,
      crossTime: lerp(0.62, 1, n > 1 ? rankOf.get(nm)! / (n - 1) : 0) * T,
      freq: 2 + Math.random() * 3, ph: Math.random() * 6.2832,
    }));
    const startT = performance.now();
    let lastRem = n;
    const draw = (now: number) => {
      const t = now - startT;
      ctx.clearRect(0, 0, W, H);
      // 결승선
      ctx.strokeStyle = 'rgba(255,209,0,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W - 16, 0); ctx.lineTo(W - 16, H); ctx.stroke();
      let finished = 0;
      for (const m of marbles) {
        const lin = Math.min(1, t / m.crossTime);
        const wob = Math.sin(t / 1000 * m.freq + m.ph) * 0.05 * (1 - lin);
        const p = Math.max(0, Math.min(1, lin * 0.93 + wob + 0.03));
        if (lin >= 1) finished++;
        const px = 12 + p * (W - 32);
        const py = laneH * (m.lane + 0.5);
        ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832);
        ctx.fillStyle = `hsl(${m.hue} 72% 56%)`; ctx.fill();
        if (m.rank < 3 && lin > 0.8) { // 선두권 이름 라벨
          ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle';
          ctx.fillText(m.nm, Math.min(px + r + 3, W - 70), py);
        }
      }
      const rem = n - finished;
      if (rem !== lastRem) { lastRem = rem; setRemaining(rem); }
      if (t < T) rafRef.current = requestAnimationFrame(draw);
      else { setWinners(ord.slice(0, winnerCount)); setPhase('done'); }
    };
    rafRef.current = requestAnimationFrame(draw);
  };

  const reset = () => { clearAll(); setPhase('setup'); setWinners([]); setEliminated(new Set()); setOrder([]); };
  const dotCount = Math.min(remaining, 200);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-surface-base">
      <header className="flex h-header-h shrink-0 items-center justify-between border-b border-border-subtle px-page-x">
        <h1 className="text-base font-bold text-ink-primary">{heading}</h1>
        <button type="button" onClick={onClose} aria-label="닫기" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-high"><Icon name="close" size={18} /></button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-page-x py-section">
          {phase === 'setup' && (
            <div className="space-y-4">
              <div className="rounded-card border border-gold-400/30 bg-gold-300/[0.05] p-3">
                <p className="text-sm font-bold text-gold-300">⚡ 인원 무관 · 시간 보장</p>
                <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">{n >= 2 ? `${n}명` : '참가자'}이 몇 명이든 결과는 즉시 계산되고 고른 시간에 정확히 끝납니다. {mode === 'marble' ? '결승선 통과 순서가 순위 — 막판 추월(역전) 가능!' : '대량 탈락 후 막판 역전 피날레로 순위를 공개합니다.'} 끝나면 전체 순위를 보여줍니다.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-ink-secondary">참가자 <span className="text-gold-300">{n}명</span> <span className="font-normal text-ink-muted">(한 줄에 한 명)</span></label>
                <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8} placeholder={'홍길동\n김철수\n로티아레나\n…'} className="input w-full text-sm leading-relaxed" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-ink-secondary">당첨 인원</label>
                  <input type="number" min={1} max={Math.max(1, n - 1)} value={winnerCount}
                    onChange={(e) => setWinnerCount(Math.max(1, Math.min(n - 1 || 1, Number(e.target.value) || 1)))} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-ink-secondary">진행 시간</label>
                  <div className="flex gap-1 rounded-input bg-surface-high p-0.5">
                    {[30, 45, 60].map((s) => (
                      <button key={s} type="button" onClick={() => setDuration(s)} className={['flex-1 rounded-[6px] py-2 text-xs font-bold transition-colors', duration === s ? 'bg-gold-300 text-ink-inverse' : 'text-ink-secondary'].join(' ')}>{s}초</button>
                    ))}
                  </div>
                </div>
              </div>
              <button type="button" onClick={start} disabled={!canStart} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-50">
                {n < 2 ? '참가자를 2명 이상 입력하세요' : winnerCount >= n ? '당첨 인원이 참가자보다 적어야 합니다' : `${mode === 'marble' ? '🪀 레이스 시작' : '🎲 추첨 시작'} (${n}명 → ${winnerCount}명)`}
              </button>
            </div>
          )}

          {phase === 'racing' && mode === 'arena' && (
            <div className="space-y-5 py-6 text-center">
              <p className="text-sm font-bold text-gold-300">추첨 진행 중…</p>
              <div><p className="text-2xs text-ink-muted">남은 인원</p><p className="text-6xl font-extrabold tabular-nums text-ink-primary">{remaining}</p><p className="mt-1 text-2xs text-ink-muted">총 {total}명 중</p></div>
              <div className="mx-auto flex max-w-md flex-wrap justify-center gap-1">{Array.from({ length: dotCount }, (_, i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-gold-300/70" />)}</div>
            </div>
          )}

          {phase === 'racing' && mode === 'marble' && (
            <div className="space-y-3 py-2">
              <p className="text-center text-sm font-bold text-gold-300">레이스 진행 중 — 남은 {remaining} / {total}</p>
              <canvas ref={canvasRef} className="w-full rounded-card border border-border-default bg-surface-low" style={{ height: 'min(60vh, 460px)' }} />
            </div>
          )}

          {(phase === 'finale' || phase === 'done') && (
            <div className="space-y-4 py-2">
              {phase === 'finale' && <p className="text-center text-sm font-bold text-gold-300 animate-pulse">🔥 최종 역전 — 누가 살아남을까!</p>}
              {phase === 'done' && <p className="text-center text-lg font-extrabold text-gold-300">🎉 결과 발표</p>}

              {/* 당첨자(확정) */}
              {(phase === 'done' ? order.slice(0, winnerCount) : winners).length > 0 && (
                <div className="space-y-2">
                  {(phase === 'done' ? order.slice(0, winnerCount) : winners).map((w, i) => (
                    <div key={w} className="flex items-center gap-3 rounded-card border border-gold-400/50 bg-gradient-to-r from-gold-300/15 to-transparent p-3 animate-slide-up">
                      <span className="text-2xl">{MEDAL[i] ?? '🏅'}</span>
                      <span className="text-xs font-bold text-gold-400">{i + 1}등</span>
                      <span className="flex-1 truncate text-base font-extrabold text-ink-primary">{w}</span>
                      <span className="shrink-0 rounded-badge bg-gold-300/20 px-2 py-0.5 text-2xs font-bold text-gold-300">당첨</span>
                    </div>
                  ))}
                </div>
              )}

              {/* (arena) 피날레 진출자 */}
              {phase === 'finale' && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {finalists.filter((f) => !winners.includes(f)).map((f) => {
                    const out = eliminated.has(f);
                    return <div key={f} className={['flex items-center justify-center rounded-card border p-3 text-sm font-bold transition-all', out ? 'border-border-subtle bg-surface-low text-ink-muted line-through opacity-50' : 'border-gold-400/40 bg-surface-high text-ink-primary'].join(' ')}>{f}</div>;
                  })}
                </div>
              )}

              {/* 전체 순위 */}
              {phase === 'done' && order.length > 0 && (
                <div>
                  <p className="mb-1.5 mt-3 text-sm font-bold text-ink-primary">전체 순위 <span className="font-normal text-ink-muted">({order.length}명)</span></p>
                  <ol className="max-h-[44vh] space-y-0.5 overflow-y-auto rounded-card border border-border-subtle bg-surface-low p-1.5">
                    {order.map((nm, i) => (
                      <li key={nm} className={['flex items-center gap-2 rounded-input px-2.5 py-1.5 text-sm', i < winnerCount ? 'bg-gold-300/10 font-bold text-ink-primary' : 'text-ink-secondary'].join(' ')}>
                        <span className={['w-7 shrink-0 text-right text-xs font-bold tabular-nums', i < winnerCount ? 'text-gold-300' : 'text-ink-muted'].join(' ')}>{i + 1}</span>
                        <span className="flex-1 truncate">{nm}</span>
                        {i < 3 && <span>{MEDAL[i]}</span>}
                        {i < winnerCount && <span className="shrink-0 rounded-badge bg-gold-300/20 px-1.5 text-2xs font-bold text-gold-300">당첨</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {phase === 'done' && (
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={reset} className="flex-1 rounded-input border border-border-default bg-surface-high py-3 text-sm font-bold text-ink-secondary hover:text-ink-primary">다시 하기</button>
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
