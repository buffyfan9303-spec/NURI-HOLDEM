// src/components/features/clock/ClockDisplay.tsx
// 관전 / 대형 디스플레이 모드 — 매장 TV·빔프로젝터용 읽기전용 풀스크린.
//   큰 타이머 + 레벨/블라인드/앤티 + 다음 브레이크·등록마감 + 라이브 통계(엔트리·생존·평균스택) + 상금 보드.
// 진입: 라이브 카드 '📺 큰 화면' / 운영자 클락 'TV 송출' / 딥링크 ?display=<venueId>&g=<gameSeq>.
// 실시간: subscribeClock 으로 레벨 전환·통계 즉시 반영 + 1초 로컬 틱(숨김/복귀해도 endsAt 기준 정확).
// 읽기전용(컨트롤 없음) — 운영은 운영자 클락 화면에서. 화면 항상 켜둠(Wake Lock, 베스트에포트).
import { useEffect, useRef, useState } from 'react';
import { getVenueClocks, subscribeClock, type ClockState, type ClockLevel } from '../../../api/clock';

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(s / 60)}:${pad(s % 60)}`; };
const hms = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 3600 ? `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}` : `${pad(s / 60)}:${pad(s % 60)}`; };
const remainingOf = (s: ClockState) => (s.running && s.endsAt ? new Date(s.endsAt).getTime() - Date.now() : s.remainingMs);

function levelNumberAt(levels: ClockLevel[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index && i < levels.length; i++) if (levels[i].kind === 'level') n++;
  return n;
}
function msToNextBreak(s: ClockState, remaining: number): number | null {
  const lv = s.config?.levels ?? []; let acc = remaining;
  for (let i = s.currentIndex + 1; i < lv.length; i++) { if (lv[i].kind === 'break') return acc; acc += lv[i].minutes * 60_000; }
  return null;
}
function msToRegClose(s: ClockState, remaining: number): number | null {
  const lv = s.config?.levels ?? []; const target = s.config?.regCloseLevel ?? 0;
  let acc = remaining, num = 0;
  for (let i = 0; i <= s.currentIndex; i++) if (lv[i]?.kind === 'level') num++;
  if (num >= target) return 0;
  for (let i = s.currentIndex + 1; i < lv.length; i++) { if (lv[i].kind === 'level') { num++; if (num >= target) return acc; } acc += lv[i].minutes * 60_000; }
  return null;
}
const gameLabel = (g: ClockState) => (g.gameSeq > 1 ? `사이드${g.gameSeq - 1}` : '메인');

export default function ClockDisplay({ venueId, gameSeq = 1, venueName, onClose }: {
  venueId: string; gameSeq?: number; venueName?: string; onClose: () => void;
}) {
  const [clocks, setClocks] = useState<ClockState[] | null>(null);
  const [sel, setSel] = useState(gameSeq);
  const [, setTick] = useState(0);
  const [fs, setFs] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = () => getVenueClocks(venueId).then(setClocks).catch(() => setClocks([]));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [venueId]);
  useEffect(() => subscribeClock(venueId, load), [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  // 화면 꺼짐 방지(Wake Lock) — TV/태블릿에 띄워두면 절전으로 꺼지지 않게(미지원 시 무시)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lock: any = null;
    const req = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* 미지원/거부 */ } };
    req();
    const onVis = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); try { lock?.release?.(); } catch { /* noop */ } };
  }, []);

  // 브라우저 네이티브 풀스크린 토글(진짜 TV 풀스크린)
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFs = () => {
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  // ESC 로 닫기(풀스크린은 브라우저가 먼저 소비하므로 그다음 ESC 가 닫음)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const games = (clocks ?? []).slice().sort((a, b) => a.gameSeq - b.gameSeq);
  const g = games.find((c) => c.gameSeq === sel) ?? games.find((c) => c.running) ?? games[0] ?? null;

  const lvls = g?.config?.levels ?? [];
  const lv = g ? lvls[g.currentIndex] : undefined;
  const levelNo = g ? levelNumberAt(lvls, g.currentIndex) : 0;
  const isBreak = lv?.kind === 'break';
  const remaining = g ? remainingOf(g) : 0;
  const urgent = !!g?.running && remaining <= 60_000 && !isBreak;
  const nextBreak = g ? msToNextBreak(g, remaining) : null;
  const regClose = g ? msToRegClose(g, remaining) : null;
  const ls = g?.liveStats ?? (g ? {
    entries: g.adjEntries, rebuys: g.adjRebuys, earlies: g.adjEarlies, addons: g.adjAddons,
    alive: Math.max(0, g.adjEntries - g.eliminations), eliminations: g.eliminations, totalStack: 0, avgStack: 0, buyInAmount: null,
  } : null);
  const prizes = (g?.config?.prizes ?? []).filter((p) => p.amount > 0);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[80] flex flex-col bg-[#06080B] text-white select-none">
      {/* 상단 바 — 매장/게임 + 컨트롤(읽기전용 컨트롤만: 게임전환·풀스크린·닫기) */}
      <header className="flex shrink-0 items-center gap-2 px-[2.5vmin] py-[1.5vmin]">
        <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center">
          <span className={`h-2.5 w-2.5 rounded-full ${g?.running ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
        </span>
        <p className="min-w-0 truncate text-[2.6vmin] font-bold tracking-tight" style={{ maxWidth: '52vw' }}>
          {venueName || '홀덤 라이브'}
          <span className="ml-2 font-normal text-white/55">{g?.title || g?.config?.title || ''}</span>
        </p>
        {games.length > 1 && (
          <div className="ml-2 flex shrink-0 items-center gap-1">
            {games.map((c) => (
              <button key={c.gameSeq} type="button" onClick={() => setSel(c.gameSeq)}
                className={['rounded-full px-[1.6vmin] py-[0.6vmin] text-[1.8vmin] font-bold transition-colors',
                  c.gameSeq === g?.gameSeq ? 'bg-gold-300 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'].join(' ')}>
                {gameLabel(c)}{c.running ? '' : ' ⏸'}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={toggleFs} title="전체화면" aria-label="전체화면"
            className="rounded-lg bg-white/10 px-[1.6vmin] py-[0.8vmin] text-[1.8vmin] font-bold text-white/80 hover:bg-white/20">{fs ? '⤢ 해제' : '⛶ 전체화면'}</button>
          <button type="button" onClick={onClose} title="닫기" aria-label="닫기"
            className="rounded-lg bg-white/10 px-[1.6vmin] py-[0.8vmin] text-[1.8vmin] font-bold text-white/80 hover:bg-white/20">✕</button>
        </div>
      </header>

      {clocks === null ? (
        <div className="flex flex-1 items-center justify-center text-[3vmin] text-white/50">불러오는 중…</div>
      ) : !g ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[2vmin] text-center">
          <p className="text-[4vmin] font-bold text-white/80">진행 중인 클락이 없습니다</p>
          <p className="text-[2.4vmin] text-white/45">운영자가 이 매장의 클락을 시작하면 자동으로 표시됩니다.</p>
        </div>
      ) : (
        <>
          {/* 본문 — 좌: 레벨/타이머(주역), 우: 상금 보드 */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-[2vmin] px-[2.5vmin] lg:grid-cols-[1.7fr_1fr]">
            {/* 타이머 영역 */}
            <div className="flex min-h-0 flex-col items-center justify-center">
              <p className="text-[3vmin] font-bold uppercase tracking-[0.3em] text-white/55">
                {isBreak ? 'BREAK' : `LEVEL ${levelNo}`}
              </p>
              {isBreak ? (
                <p className="leading-none text-sky-300" style={{ fontSize: 'clamp(40px, 9vmin, 160px)', fontWeight: 800 }}>휴식</p>
              ) : (
                <p className="mt-[1vmin] text-center font-extrabold leading-none tabular-nums text-white"
                  style={{ fontSize: 'clamp(28px, 8.5vmin, 150px)' }}>
                  {lv ? <>{lv.sb.toLocaleString()}<span className="text-white/40"> / </span>{lv.bb.toLocaleString()}</> : '-'}
                  {lv && lv.ante > 0 && <span className="ml-[1.5vmin] align-middle text-white/45" style={{ fontSize: 'clamp(16px, 3.5vmin, 60px)' }}>ante {lv.ante.toLocaleString()}</span>}
                </p>
              )}
              <p className={`mt-[1vmin] font-extrabold leading-none tabular-nums ${urgent ? 'text-rose-400 animate-pulse' : isBreak ? 'text-sky-300' : 'text-gold-300'}`}
                style={{ fontSize: 'clamp(72px, 24vmin, 360px)' }}>
                {mmss(Math.max(0, remaining))}
              </p>
              {!g.running && <p className="mt-[1vmin] text-[2.6vmin] font-bold text-amber-400">⏸ 일시정지</p>}
              {/* 다음 브레이크 · 등록마감 */}
              <div className="mt-[2vmin] flex flex-wrap items-center justify-center gap-x-[3vmin] gap-y-[1vmin] text-[2.3vmin] text-white/55">
                <span>다음 브레이크 <b className="text-white/90 tabular-nums">{nextBreak === null ? '—' : hms(nextBreak)}</b></span>
                <span>등록마감 <b className={`tabular-nums ${regClose === 0 ? 'text-rose-300' : 'text-white/90'}`}>{regClose === null ? '—' : regClose === 0 ? '마감' : hms(regClose)}</b></span>
              </div>
            </div>

            {/* 상금 보드(리더보드) */}
            <div className="flex min-h-0 flex-col justify-center">
              {prizes.length > 0 ? (
                <div className="rounded-[2vmin] border border-gold-300/25 bg-gold-300/[0.06] p-[2vmin]">
                  <p className="mb-[1.2vmin] text-[2.4vmin] font-bold text-gold-300">🏆 상금</p>
                  <ul className="space-y-[0.8vmin]">
                    {prizes.slice(0, 9).map((p, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-[0.6vmin] last:border-0">
                        <span className="text-[2.6vmin] font-bold text-white/85">{p.place}</span>
                        <span className="text-[2.8vmin] font-extrabold tabular-nums text-gold-300">{p.amount.toLocaleString()}<span className="text-[1.8vmin] font-bold text-white/50">만</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-[2vmin] border border-white/10 text-center text-[2.2vmin] text-white/35">
                  상금 정보 미설정
                </div>
              )}
            </div>
          </div>

          {/* 하단 통계 스트립 — 엔트리·생존·리바인·얼리·평균/총스택 */}
          <div className="grid shrink-0 grid-cols-3 gap-px bg-white/5 px-[2.5vmin] py-[1.5vmin] sm:grid-cols-6">
            <BigStat label="엔트리" value={`${ls?.entries ?? 0}`} />
            <BigStat label="생존" value={`${ls?.alive ?? 0}`} accent />
            <BigStat label="리바인" value={`${ls?.rebuys ?? 0}`} />
            <BigStat label="얼리" value={`${ls?.earlies ?? 0}`} />
            <BigStat label="평균 스택" value={ls?.avgStack ? ls.avgStack.toLocaleString() : '-'} accent />
            <BigStat label="총 스택" value={ls?.totalStack ? ls.totalStack.toLocaleString() : '-'} />
          </div>
        </>
      )}
    </div>
  );
}

function BigStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-1 text-center">
      <p className={`font-extrabold leading-none tabular-nums ${accent ? 'text-gold-300' : 'text-white'}`} style={{ fontSize: 'clamp(20px, 4vmin, 64px)' }}>{value}</p>
      <p className="mt-[0.6vmin] text-[1.7vmin] text-white/45">{label}</p>
    </div>
  );
}
