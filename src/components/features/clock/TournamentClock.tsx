// src/components/features/clock/TournamentClock.tsx
// 토너먼트 클락 — 설정/프리셋 + 라이브 디스플레이(블라인드 타이머) + 수기 컨트롤 + 일시정지.
// 와홀덤/Roti 클락 구조를 따르되 NURI 테마로. 장부 연동 카운트 자동 산출 + 수기 보정.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../../atoms/Toast';
import { useBackClose } from '../../../lib/backstack';
import {
  type ClockConfig, type ClockLevel, type ClockPreset, type ClockState, type ClockPrizeRow,
  defaultClockConfig, emptyClockState, deriveClockCounts, PRESET_LIMIT,
  countLevels, withDerivedEarly, generateBlinds,
  getClockPresets, saveClockPreset, deleteClockPreset,
  getClockState, saveClockState, clearClockState, subscribeClock,
} from '../../../api/clock';
import {
  getLedgerBuyins, getLedgerSession, getLedgerSessionList, saveLedgerSession, subscribeLedger,
  type LedgerBuyin, type LedgerSession, type LedgerSessionListItem,
} from '../../../api/ledger';

const now = () => Date.now();
const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${pad(s / 60)}:${pad(s % 60)}`;
}
function hms(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
}
const computeRemaining = (s: ClockState): number =>
  s.running && s.endsAt ? new Date(s.endsAt).getTime() - now() : s.remainingMs;

// 현재 인덱스부터 다음 브레이크까지 남은 ms(현재 레벨 잔여 + 중간 레벨 길이 합)
function msToNextBreak(s: ClockState, remaining: number): number | null {
  const lv = s.config.levels;
  let acc = remaining;
  for (let i = s.currentIndex + 1; i < lv.length; i++) {
    if (lv[i].kind === 'break') return acc;
    acc += lv[i].minutes * 60_000;
  }
  return null;
}
// 등록 마감 레벨 시작까지 남은 ms
function msToRegClose(s: ClockState, remaining: number): number | null {
  const lv = s.config.levels;
  const target = s.config.regCloseLevel;
  let acc = remaining, num = 0;
  for (let i = 0; i <= s.currentIndex; i++) if (lv[i].kind === 'level') num++;
  if (num >= target) return 0; // 이미 마감 레벨 이상
  for (let i = s.currentIndex + 1; i < lv.length; i++) {
    if (lv[i].kind === 'level') { num++; if (num >= target) return acc; }
    acc += lv[i].minutes * 60_000;
  }
  return null;
}
// 레벨 번호(브레이크 제외) 계산
function levelNumberAt(cfg: ClockConfig, index: number): number {
  let n = 0;
  for (let i = 0; i <= index && i < cfg.levels.length; i++) if (cfg.levels[i].kind === 'level') n++;
  return n;
}
function nextPlayableLabel(cfg: ClockConfig, index: number): string {
  const lv = cfg.levels;
  const nx = lv[index + 1];
  if (!nx) return '— 마지막 레벨 —';
  if (nx.kind === 'break') return nx.label || 'BREAK';
  return `NEXT LEVEL ${levelNumberAt(cfg, index + 1)}  ${nx.sb.toLocaleString()}/${nx.bb.toLocaleString()}(${nx.ante.toLocaleString()})`;
}

// ── 메인: 설정 ↔ 라이브 ─────────────────────────────────────────────────────────
export default function TournamentClock({ venueId, canManage, seedSessionDate }: { venueId: string; canManage: boolean; seedSessionDate?: string | null }) {
  const toast = useToast();
  const [state, setState] = useState<ClockState | null>(null);
  const [presets, setPresets] = useState<ClockPreset[]>([]);
  const [sessions, setSessions] = useState<LedgerSessionListItem[]>([]);
  const [seedSession, setSeedSession] = useState<LedgerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'settings' | 'live'>('live');

  const reloadState = useCallback(() => getClockState(venueId).then((s) => setState(s)).catch(() => {}), [venueId]);
  const reloadPresets = useCallback(() => getClockPresets(venueId).then(setPresets).catch(() => {}), [venueId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getClockState(venueId), getClockPresets(venueId), getLedgerSessionList(venueId, 60).catch(() => [])])
      .then(([s, p, ls]) => { setState(s); setPresets(p); setSessions(ls); setView(seedSessionDate ? 'settings' : (s ? 'live' : 'settings')); })
      .finally(() => setLoading(false));
  }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 장부에서 넘어옴: 해당 세션을 불러와 게임명·얼리 구간을 클락 설정에 시드
  useEffect(() => {
    if (!seedSessionDate) { setSeedSession(null); return; }
    getLedgerSession(venueId, seedSessionDate).then(setSeedSession).catch(() => {});
    setView('settings');
  }, [venueId, seedSessionDate]);

  useEffect(() => subscribeClock(venueId, reloadState), [venueId, reloadState]);

  const seededInitial = useMemo<ClockConfig>(() => {
    const base = state?.config ?? defaultClockConfig();
    if (!seedSession) return withDerivedEarly(base);
    return withDerivedEarly({
      ...base,
      title: seedSession.title || base.title,
      isAddon: seedSession.isAddon ?? base.isAddon,
      addonStack: (seedSession.isAddon && seedSession.addonStack) ? seedSession.addonStack : base.addonStack,
    });
  }, [state, seedSession]);

  const startClock = async (config: ClockConfig, linkDate: string | null) => {
    const base = emptyClockState(venueId, withDerivedEarly(config));
    base.sessionDate = linkDate;
    base.title = base.config.title;
    try {
      await saveClockState(base);
      // 장부 연동 시: 클락의 얼리(레벨→분 환산)를 장부 세션에 기록 → 장부 셀 얼리 태그가 동일 기준으로 표시됨.
      if (linkDate) {
        try {
          const sess = await getLedgerSession(venueId, linkDate);
          await saveLedgerSession({ ...sess, earlyDoubleMin: base.config.earlyDoubleMin, earlySingleMin: base.config.earlySingleMin });
        } catch { /* noop */ }
      }
      setState(base); setView('live'); toast.show('클락을 시작 준비했습니다', 'success');
    }
    catch (e) { toast.show(e instanceof Error ? e.message : '시작 실패', 'error'); }
  };

  const endClock = async () => {
    if (!confirm('클락을 종료하고 초기화할까요?')) return;
    try { await clearClockState(venueId); setState(null); setView('settings'); toast.show('클락을 종료했습니다', 'info'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '종료 실패', 'error'); }
  };

  if (loading) return <p className="py-10 text-center text-sm text-ink-muted">클락 불러오는 중…</p>;

  if (view === 'settings' || !state) {
    return (
      <ClockSettings
        key={`${state?.venueId ?? 'new'}-${seedSession?.title ?? ''}-${seedSessionDate ?? ''}`}
        venueId={venueId} canManage={canManage} presets={presets} sessions={sessions} initial={seededInitial}
        hasLive={!!state} seedSessionDate={seedSessionDate} seededFromLedger={!!seedSession}
        onReloadPresets={reloadPresets}
        onStart={startClock}
        onBackToLive={state ? () => setView('live') : undefined}
      />
    );
  }

  return (
    <ClockLive
      state={state} canManage={canManage}
      onChange={(s) => setState(s)}
      onOpenSettings={() => setView('settings')}
      onEnd={endClock}
    />
  );
}

// ── 라이브 디스플레이 + 컨트롤 ──────────────────────────────────────────────────
function ClockLive({ state, canManage, onChange, onOpenSettings, onEnd }: {
  state: ClockState; canManage: boolean;
  onChange: (s: ClockState) => void; onOpenSettings: () => void; onEnd: () => void;
}) {
  const toast = useToast();
  const [, setTick] = useState(0);
  const [buyins, setBuyins] = useState<LedgerBuyin[]>([]);
  const [linkedSession, setLinkedSession] = useState<LedgerSession | null>(null);
  const [volume, setVolume] = useState(50);
  const [fs, setFs] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const advancingRef = useRef(false);

  // 장부 연동: 연결된 세션의 바인/얼리설정 자동 반영
  useEffect(() => {
    if (!state.sessionDate) { setBuyins([]); setLinkedSession(null); return; }
    const d = state.sessionDate;
    const load = () => {
      getLedgerBuyins(state.venueId, d).then(setBuyins).catch(() => {});
      getLedgerSession(state.venueId, d).then(setLinkedSession).catch(() => {});
    };
    load();
    return subscribeLedger(state.venueId, load);
  }, [state.venueId, state.sessionDate]);

  // 250ms 틱(부드러운 카운트다운)
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 250); return () => clearInterval(id); }, []);

  const persist = useCallback((patch: Partial<ClockState>) => {
    const next = { ...state, ...patch };
    onChange(next);
    if (canManage) saveClockState(next).catch((e) => toast.show(e instanceof Error ? e.message : '저장 실패', 'error'));
  }, [state, canManage, onChange, toast]);

  const remaining = computeRemaining(state);
  const cur: ClockLevel = state.config.levels[state.currentIndex] ?? { kind: 'level', sb: 0, bb: 0, ante: 0, minutes: 0 };

  const beep = useCallback(() => {
    if (volume <= 0) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      const ac = new Ctx(); const o = ac.createOscillator(); const g = ac.createGain();
      o.connect(g); g.connect(ac.destination); o.type = 'sine'; o.frequency.value = 880;
      g.gain.value = Math.min(0.3, volume / 100 * 0.3);
      o.start(); o.stop(ac.currentTime + 0.5);
    } catch { /* noop */ }
  }, [volume]);

  // 레벨 자동 전환(운영자 화면만 기록)
  const advance = useCallback(() => {
    const lv = state.config.levels;
    const nextIndex = state.currentIndex + 1;
    if (nextIndex >= lv.length) { persist({ running: false, remainingMs: 0, endsAt: null }); return; }
    const rem = lv[nextIndex].minutes * 60_000;
    persist({ currentIndex: nextIndex, remainingMs: rem, endsAt: state.running ? new Date(now() + rem).toISOString() : null });
    beep();
  }, [state, persist, beep]);

  useEffect(() => {
    if (!canManage || !state.running) return;
    if (remaining <= 0 && !advancingRef.current) {
      advancingRef.current = true;
      advance();
      setTimeout(() => { advancingRef.current = false; }, 800);
    }
  }, [remaining, canManage, state.running, advance]);

  // 컨트롤
  const toggleRun = () => {
    if (state.running) persist({ running: false, remainingMs: Math.max(0, remaining), endsAt: null });
    else persist({ running: true, endsAt: new Date(now() + Math.max(0, state.remainingMs || remaining)).toISOString() });
  };
  const setLevel = (delta: number) => {
    const idx = Math.max(0, Math.min(state.config.levels.length - 1, state.currentIndex + delta));
    const rem = state.config.levels[idx].minutes * 60_000;
    persist({ currentIndex: idx, remainingMs: rem, endsAt: state.running ? new Date(now() + rem).toISOString() : null });
  };
  const adjustTime = (deltaMs: number) => {
    if (state.running && state.endsAt) {
      persist({ endsAt: new Date(Math.max(now(), new Date(state.endsAt).getTime() + deltaMs)).toISOString() });
    } else {
      persist({ remainingMs: Math.max(0, state.remainingMs + deltaMs) });
    }
  };
  const adj = (key: 'adjEntries' | 'adjRebuys' | 'adjEarlies' | 'adjAddons', d: number) =>
    persist({ [key]: Math.max(-9999, state[key] + d) } as Partial<ClockState>);
  const adjPlayer = (d: number) => persist({ eliminations: Math.max(0, state.eliminations - d) }); // +면 생존↑(아웃↓)

  const toggleFs = () => {
    const el = wrapRef.current; if (!el) return;
    if (!fs) {
      setFs(true);                              // fixed inset-0 풀뷰포트(네이티브 실패해도 보장)
      el.requestFullscreen?.().catch(() => {});
    } else {
      setFs(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }
  };
  // 네이티브 풀스크린 해제(ESC 등) → fs 동기화. fs일 때 배경 스크롤 잠금.
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFs(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (!fs) return;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [fs]);
  // 뒤로가기 → 전체화면만 해제(앱 이탈 방지)
  useBackClose(fs, () => { setFs(false); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); });

  // 집계
  const cfg = state.config;
  const derived = useMemo(() => deriveClockCounts(buyins, {
    // 클락(레벨→분 파생)이 우선, 없으면 장부 세션값으로 폴백. 스타트 시각은 장부 기준.
    earlyDoubleMin: cfg.earlyDoubleMin || linkedSession?.earlyDoubleMin || 0,
    earlySingleMin: cfg.earlySingleMin || linkedSession?.earlySingleMin || 0,
    tournamentStart: linkedSession?.tournamentStart ?? null,
    openedAt: linkedSession?.openedAt ?? null,
  }), [buyins, linkedSession, cfg.earlyDoubleMin, cfg.earlySingleMin]);
  const entries = derived.entries + state.adjEntries;
  const rebuys = derived.rebuys + state.adjRebuys;
  const earlies = derived.earlies + state.adjEarlies;
  const addons = state.adjAddons;
  const alive = Math.max(0, entries - state.eliminations);
  // 총 스택 = 엔트리×스타팅 + 리바인×리바인스택 + 애드온×애드온스택 + 얼리 보너스 칩
  const dEarly = derived.doubleEarlies;
  const sEarly = Math.max(0, (derived.earlies - derived.doubleEarlies) + state.adjEarlies);
  const totalStack = entries * cfg.startStack + rebuys * cfg.rebuyStack + addons * cfg.addonStack
    + dEarly * cfg.doubleEarlyBonus + sEarly * cfg.earlyBonus;
  const avgStack = alive > 0 ? Math.round(totalStack / alive) : 0;
  const nextBreak = msToNextBreak(state, remaining);
  const regClose = msToRegClose(state, remaining);
  const totalPrize = cfg.prizes.reduce((s, p) => s + (p.amount || 0), 0);
  const isBreak = cur?.kind === 'break';
  const levelNo = levelNumberAt(cfg, state.currentIndex);

  const title = (linkedSession?.title || cfg.title) || '토너먼트';
  const urgent = remaining <= 60_000 && state.running && !isBreak;

  return (
    <div ref={wrapRef} className={fs ? 'fixed inset-0 z-[70] bg-[#06080c] flex flex-col overflow-hidden' : 'space-y-2'}>
      {/* 상단 바 */}
      <div className={['flex items-center gap-2', fs ? 'shrink-0 px-3 pt-2 pb-1' : ''].join(' ')}>
        {fs
          ? <span className="text-2xs font-semibold text-ink-muted">{state.sessionDate ? `📒 장부 ${state.sessionDate} 연동` : '단독 클락'}</span>
          : <h2 className="text-base font-bold text-ink-primary">클락</h2>}
        <div className="flex items-center gap-1.5 ml-auto">
          <button type="button" onClick={toggleFs} className="btn-ghost text-2xs px-2.5 py-1">{fs ? '⤡ 전체화면 해제' : '⤢ 전체화면'}</button>
          {canManage && !fs && <button type="button" onClick={onOpenSettings} className="btn-ghost text-2xs px-2.5 py-1">설정</button>}
        </div>
      </div>

      {/* 디스플레이 */}
      <div className={['overflow-hidden border border-border-default shadow-[0_10px_50px_rgba(0,0,0,0.45)] bg-gradient-to-b from-[#161b25] to-[#090c12]',
        fs ? 'flex-1 flex flex-col min-h-0 rounded-none border-x-0 border-t-0' : 'rounded-card'].join(' ')}>

        {/* 타이틀 바 */}
        <div className="shrink-0 bg-gradient-to-r from-gold-400/15 via-gold-300/[0.06] to-gold-400/15 border-b border-gold-400/25 px-4 py-2 text-center">
          <p className={['font-extrabold tracking-wide text-gold-200 truncate', fs ? 'text-[min(3.4vw,4vh)]' : 'text-sm sm:text-lg'].join(' ')}>{title}</p>
        </div>

        {/* 본문 3열 */}
        <div className={['grid grid-cols-[minmax(76px,0.85fr)_2.6fr_minmax(90px,1fr)]', fs ? 'flex-1 min-h-0' : ''].join(' ')}>
          {/* 좌: 프라이즈 */}
          <div className="flex flex-col p-2 sm:p-3 border-r border-white/5 bg-black/20">
            <p className={['text-gold-300/70 font-bold tracking-[0.18em] mb-1', fs ? 'text-[min(1.5vw,1.8vh)]' : 'text-[9px] sm:text-2xs'].join(' ')}>PRIZE</p>
            <ul className="space-y-0.5 overflow-hidden">
              {cfg.prizes.map((p, i) => (
                <li key={i} className={['flex items-center justify-between gap-1 text-ink-secondary', fs ? 'text-[min(1.8vw,2.1vh)]' : 'text-[10px] sm:text-xs'].join(' ')}>
                  <span className="truncate opacity-80">{p.place}</span><span className="tabular-nums font-semibold text-ink-primary">{p.amount.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            {cfg.mysteryBounty > 0 && (
              <div className="mt-2 pt-2 border-t border-white/5">
                <p className={['text-gold-300 font-semibold leading-tight', fs ? 'text-[min(1.5vw,1.8vh)]' : 'text-[9px] sm:text-2xs'].join(' ')}>Mystery Bounty</p>
                <p className={['text-ink-primary tabular-nums', fs ? 'text-[min(1.9vw,2.2vh)]' : 'text-[10px] sm:text-xs'].join(' ')}>{cfg.mysteryBounty.toLocaleString()}</p>
              </div>
            )}
            <div className="mt-auto pt-2 border-t border-white/5">
              <p className={['text-ink-muted tracking-wide', fs ? 'text-[min(1.4vw,1.7vh)]' : 'text-[9px] sm:text-2xs'].join(' ')}>TOTAL PRIZE</p>
              <p className={['font-extrabold text-gold-300 tabular-nums leading-tight', fs ? 'text-[min(2.7vw,3.1vh)]' : 'text-sm sm:text-lg'].join(' ')}>{totalPrize.toLocaleString()}</p>
            </div>
          </div>

          {/* 중앙: 타이머 */}
          <div className={['relative flex flex-col items-center justify-center text-center overflow-hidden',
            fs ? 'py-2' : 'py-6 sm:py-10',
            isBreak ? 'bg-[radial-gradient(ellipse_at_center,rgba(56,120,200,0.16),transparent_72%)]'
                    : 'bg-[radial-gradient(ellipse_at_center,rgba(201,169,97,0.10),transparent_72%)]'].join(' ')}>
            <p className={['font-bold tracking-[0.16em] uppercase',
              isBreak ? 'text-sky-300/90' : 'text-gold-200/80',
              fs ? 'text-[min(4vw,5vh)]' : 'text-base sm:text-2xl'].join(' ')}>
              {isBreak ? (cur.label || 'BREAK') : `LEVEL ${levelNo}`}
            </p>
            <p className={['font-extrabold tabular-nums leading-none my-1 sm:my-2 drop-shadow-[0_3px_24px_rgba(0,0,0,0.5)]',
              fs ? 'text-[min(26vw,40vh)]' : 'text-6xl sm:text-8xl',
              urgent ? 'text-rose-400 animate-pulse' : isBreak ? 'text-sky-200' : 'text-white'].join(' ')}>
              {mmss(Math.max(0, remaining))}
            </p>
            {!isBreak && (
              <div className={['flex items-center justify-center', fs ? 'gap-[7vw]' : 'gap-8 sm:gap-16'].join(' ')}>
                <div>
                  <p className={['text-ink-secondary tracking-widest', fs ? 'text-[min(2vw,2.4vh)]' : 'text-[10px] sm:text-sm'].join(' ')}>BLINDS</p>
                  <p className={['font-bold text-ink-primary tabular-nums', fs ? 'text-[min(4.8vw,5.8vh)]' : 'text-base sm:text-2xl'].join(' ')}>{cur.sb.toLocaleString()}/{cur.bb.toLocaleString()}</p>
                </div>
                <div>
                  <p className={['text-ink-secondary tracking-widest', fs ? 'text-[min(2vw,2.4vh)]' : 'text-[10px] sm:text-sm'].join(' ')}>ANTE</p>
                  <p className={['font-bold text-ink-primary tabular-nums', fs ? 'text-[min(4.8vw,5.8vh)]' : 'text-base sm:text-2xl'].join(' ')}>{cur.ante.toLocaleString()}</p>
                </div>
              </div>
            )}
            <p className={['mt-3 font-bold text-gold-300', fs ? 'text-[min(3.3vw,3.9vh)]' : 'text-sm sm:text-2xl'].join(' ')}>{nextPlayableLabel(cfg, state.currentIndex)}</p>
            {!state.running && <span className={['absolute font-bold text-rose-200 bg-rose-950/60 rounded-badge', fs ? 'top-3 right-3 text-[min(2vw,2.4vh)] px-3 py-1' : 'top-2 right-2 text-[9px] sm:text-2xs px-2 py-0.5'].join(' ')}>일시정지</span>}
          </div>

          {/* 우: 스탯 */}
          <div className="flex flex-col justify-center gap-2 sm:gap-3 p-2 sm:p-3 border-l border-white/5 bg-black/20">
            <Stat fs={fs} label="PLAYERS" value={`${alive} / ${entries}`} />
            <Stat fs={fs} label="RE-BUY / EARLY" value={`${rebuys} / ${earlies}`} />
            {cfg.isAddon && <Stat fs={fs} label="ADD-ON" value={`${addons}`} />}
            <Stat fs={fs} label="REG CLOSE" value={regClose !== null ? hms(regClose) : '마감'} tone={regClose !== null ? 'muted' : 'rose'} />
            <Stat fs={fs} label="NEXT BREAK" value={nextBreak !== null ? hms(nextBreak) : '—'} tone="rose" />
          </div>
        </div>

        {/* 칩 스탯 — TOTAL / AVG STACK 강조(전체 폭) */}
        <div className="shrink-0 grid grid-cols-2 border-t border-gold-400/25 bg-gradient-to-r from-gold-400/[0.07] via-transparent to-gold-400/[0.07]">
          <div className="text-center border-r border-white/5 py-2 sm:py-2.5">
            <p className={['text-gold-300/70 font-bold tracking-[0.18em]', fs ? 'text-[min(1.9vw,2.2vh)]' : 'text-[10px] sm:text-xs'].join(' ')}>TOTAL STACK</p>
            <p className={['font-extrabold text-gold-200 tabular-nums leading-tight', fs ? 'text-[min(4.6vw,5.6vh)]' : 'text-xl sm:text-3xl'].join(' ')}>{totalStack.toLocaleString()}</p>
          </div>
          <div className="text-center py-2 sm:py-2.5">
            <p className={['text-ink-secondary font-bold tracking-[0.18em]', fs ? 'text-[min(1.9vw,2.2vh)]' : 'text-[10px] sm:text-xs'].join(' ')}>AVG STACK</p>
            <p className={['font-extrabold text-white tabular-nums leading-tight', fs ? 'text-[min(4.6vw,5.6vh)]' : 'text-xl sm:text-3xl'].join(' ')}>{avgStack.toLocaleString()}</p>
          </div>
        </div>

        {/* 하단 컨트롤(운영자) */}
        {canManage && (
          <div className="shrink-0 border-t border-white/5 bg-black/30 px-2 py-2">
            <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-2">
              <VolCtl value={volume} onChange={setVolume} />
              <Stepper label="Entries" onPlus={() => adj('adjEntries', 1)} onMinus={() => adj('adjEntries', -1)} />
              <Stepper label="Player" onPlus={() => adjPlayer(1)} onMinus={() => adjPlayer(-1)} />
              <Stepper label="Rebuy" onPlus={() => adj('adjRebuys', 1)} onMinus={() => adj('adjRebuys', -1)} />
              <Stepper label="Early" onPlus={() => adj('adjEarlies', 1)} onMinus={() => adj('adjEarlies', -1)} />
              <Stepper label="Addon" onPlus={() => adj('adjAddons', 1)} onMinus={() => adj('adjAddons', -1)} />
              <Stepper label="Level" onPlus={() => setLevel(1)} onMinus={() => setLevel(-1)} />
              <Stepper label="Min" onPlus={() => adjustTime(60_000)} onMinus={() => adjustTime(-60_000)} />
              <Stepper label="Sec" onPlus={() => adjustTime(1_000)} onMinus={() => adjustTime(-1_000)} />
              <button type="button" onClick={toggleRun}
                className={['px-4 py-2 rounded-input text-xs font-bold transition-colors',
                  state.running ? 'bg-amber-500/90 text-ink-inverse hover:bg-amber-500' : 'bg-emerald-500/90 text-ink-inverse hover:bg-emerald-500'].join(' ')}>
                {state.running ? '⏸ STOP' : '▶ START'}
              </button>
              {fs
                ? <button type="button" onClick={toggleFs} className="px-4 py-2 rounded-input text-xs font-bold bg-surface-float text-ink-secondary border border-border-default">⤡ 해제</button>
                : <button type="button" onClick={onEnd} className="px-4 py-2 rounded-input text-xs font-bold bg-surface-float text-ink-secondary border border-border-default hover:text-danger-light">END</button>}
            </div>
          </div>
        )}
      </div>

      {!fs && state.sessionDate && (
        <p className="text-2xs text-ink-muted text-center">장부({state.sessionDate}) 연동 중 — 엔트리·리바인은 장부에서 자동 반영, 하단 버튼으로 보정/아웃 처리하세요.</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone, fs }: { label: string; value: string; tone?: 'muted' | 'rose'; fs?: boolean }) {
  const c = tone === 'rose' ? 'text-rose-300' : tone === 'muted' ? 'text-ink-secondary' : 'text-ink-primary';
  return (
    <div className="text-center">
      <p className={['text-ink-muted tracking-wide leading-tight', fs ? 'text-[min(1.5vw,1.8vh)]' : 'text-[9px] sm:text-2xs'].join(' ')}>{label}</p>
      <p className={['font-bold tabular-nums leading-tight', fs ? 'text-[min(2.7vw,3.3vh)]' : 'text-sm sm:text-xl', c].join(' ')}>{value}</p>
    </div>
  );
}
function Stepper({ label, onPlus, onMinus }: { label: string; onPlus: () => void; onMinus: () => void }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] text-ink-muted">{label}</span>
      <div className="flex gap-0.5">
        <button type="button" onClick={onPlus} className="w-7 h-7 rounded-input bg-surface-high border border-border-default text-ink-secondary hover:text-gold-300 text-sm leading-none">＋</button>
        <button type="button" onClick={onMinus} className="w-7 h-7 rounded-input bg-surface-high border border-border-default text-ink-secondary hover:text-danger-light text-sm leading-none">－</button>
      </div>
    </div>
  );
}
function VolCtl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] text-ink-muted">Volume ({value})</span>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-16 accent-gold-300" />
    </div>
  );
}

// ── 설정/프리셋 ─────────────────────────────────────────────────────────────────
function ClockSettings({ venueId, canManage, presets, sessions, initial, hasLive, seedSessionDate, seededFromLedger, onReloadPresets, onStart, onBackToLive }: {
  venueId: string; canManage: boolean; presets: ClockPreset[]; sessions: LedgerSessionListItem[]; initial: ClockConfig; hasLive: boolean;
  seedSessionDate?: string | null; seededFromLedger?: boolean;
  onReloadPresets: () => void; onStart: (c: ClockConfig, linkDate: string | null) => void; onBackToLive?: () => void;
}) {
  const toast = useToast();
  const [cfg, setCfg] = useState<ClockConfig>(initial);
  const [linkDate, setLinkDate] = useState<string | null>(seedSessionDate ?? null); // 연동할 장부(null=단독)
  const [sessQuery, setSessQuery] = useState(''); // 장부 목록 검색(날짜·게임명)
  const [presetQuery, setPresetQuery] = useState(''); // 프리셋 검색
  const [presetName, setPresetName] = useState('');
  const [bldOpen, setBldOpen] = useState(false);    // 블라인드 구조 접기/펴기
  const [bulkAll, setBulkAll] = useState(20);       // 전체 일괄 듀레이션(분)
  const [bulkFrom, setBulkFrom] = useState(initial.regCloseLevel || 9); // 구간 시작 레벨
  const [bulkFromMin, setBulkFromMin] = useState(25); // 구간 듀레이션(분)
  // 모든 변경 시 얼리(레벨)→분 파생값 재계산 — 블라인드 길이가 바뀌어도 얼리 분이 항상 동기화됨.
  const set = (patch: Partial<ClockConfig>) => setCfg((c) => withDerivedEarly({ ...c, ...patch }));
  const totalLevels = countLevels(cfg.levels);
  const filteredSessions = sessions.filter((s) => {
    const q = sessQuery.trim().toLowerCase();
    return !q || `${s.sessionDate} ${s.title ?? ''}`.toLowerCase().includes(q);
  });
  const filteredPresets = presets.filter((p) => {
    const q = presetQuery.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q);
  });
  const autoGenerate = () => {
    if (!confirm(`등록마감(${cfg.regCloseLevel || '-'})·최대 레벨(${cfg.maxLevel || 15}) 기준으로 블라인드 구조를 자동 생성합니다.\n현재 블라인드 구조를 덮어쓸까요?`)) return;
    set({ levels: generateBlinds(cfg.regCloseLevel, cfg.maxLevel) });
    setBldOpen(true);
    toast.show('블라인드 구조를 자동 생성했습니다', 'success');
  };

  // 듀레이션 일괄 적용(레벨만, 브레이크 제외)
  const applyBulkAll = (min: number) => {
    if (min <= 0) return;
    set({ levels: cfg.levels.map((l) => l.kind === 'level' ? { ...l, minutes: min } : l) });
    toast.show(`전체 레벨 듀레이션을 ${min}분으로 변경했습니다`, 'success');
  };
  const applyBulkFrom = (fromNo: number, min: number) => {
    if (min <= 0) return;
    set({ levels: cfg.levels.map((l, i) => (l.kind === 'level' && levelNumberAt(cfg, i) >= fromNo) ? { ...l, minutes: min } : l) });
    toast.show(`레벨 ${fromNo}부터 듀레이션을 ${min}분으로 변경했습니다`, 'success');
  };

  const setLevel = (i: number, patch: Partial<ClockLevel>) => set({ levels: cfg.levels.map((l, idx) => idx === i ? { ...l, ...patch } : l) });
  const addLevel = () => {
    const last = [...cfg.levels].reverse().find((l) => l.kind === 'level');
    const sb = last ? Math.round(last.bb) : 100, bb = sb * 2;
    set({ levels: [...cfg.levels, { kind: 'level', sb, bb, ante: bb, minutes: last?.minutes ?? 20 }] });
  };
  const addBreak = () => set({ levels: [...cfg.levels, { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 8, label: 'BREAK' }] });
  const removeLevel = (i: number) => set({ levels: cfg.levels.filter((_, idx) => idx !== i) });

  const setPrize = (i: number, patch: Partial<ClockPrizeRow>) => set({ prizes: cfg.prizes.map((p, idx) => idx === i ? { ...p, ...patch } : p) });
  const addPrize = () => set({ prizes: [...cfg.prizes, { place: `${cfg.prizes.length + 1}위`, amount: 0 }] });
  const removePrize = (i: number) => set({ prizes: cfg.prizes.filter((_, idx) => idx !== i) });

  const loadPreset = (p: ClockPreset) => { setCfg(p.config); toast.show(`"${p.name}" 프리셋을 불러왔습니다`, 'info'); };
  const savePreset = async () => {
    const name = presetName.trim() || cfg.title || '무제목';
    try { await saveClockPreset(venueId, name, cfg); setPresetName(''); onReloadPresets(); toast.show('프리셋을 저장했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '저장 실패', 'error'); }
  };
  const delPreset = async (p: ClockPreset) => {
    if (!confirm(`"${p.name}" 프리셋을 삭제할까요?`)) return;
    try { await deleteClockPreset(p.id); onReloadPresets(); toast.show('삭제했습니다', 'info'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
  };

  if (!canManage) {
    return <p className="py-16 text-center text-sm text-ink-muted">클락 설정은 업주/권한 직원만 가능합니다.</p>;
  }

  const numInput = 'input w-full text-sm tabular-nums';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink-primary">클락 설정</h2>
        {onBackToLive && <button type="button" onClick={onBackToLive} className="btn-ghost text-xs px-3">← 라이브로</button>}
      </div>

      {/* ── 클락 시작(진입) — 맨 위: 단독 / 장부 연동 리스트 ───────────── */}
      <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.06] to-transparent p-3 space-y-2.5">
        <p className="text-2xs font-bold text-gold-300">클락 시작 방식</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setLinkDate(null)}
            className={['rounded-input border p-2.5 text-left transition-colors', linkDate === null ? 'border-gold-400/60 bg-gold-300/15' : 'border-border-default bg-surface-high hover:border-border-strong'].join(' ')}>
            <p className="text-xs font-bold text-ink-primary">🎰 단독 클락</p>
            <p className="text-[10px] text-ink-muted mt-0.5">장부 연동 없이 실행</p>
          </button>
          <div className={['rounded-input border p-2.5 transition-colors', linkDate !== null ? 'border-gold-400/60 bg-gold-300/15' : 'border-border-default bg-surface-high'].join(' ')}>
            <p className="text-xs font-bold text-ink-primary">📒 장부 연동</p>
            <p className="text-[10px] text-ink-muted mt-0.5 truncate">{linkDate ? linkDate : '아래 목록에서 선택'}</p>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1 gap-2">
            <p className="text-[10px] text-ink-muted min-w-0 truncate">장부(게임) 목록 — 연동하면 게임명·엔트리·얼리 자동 반영</p>
            <span className="text-[10px] text-ink-muted tabular-nums shrink-0">{filteredSessions.length}/{sessions.length}</span>
          </div>
          <div className="relative mb-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={sessQuery} onChange={(e) => setSessQuery(e.target.value)} placeholder="검색 (예: 2026-06 · 게임명)" className="input w-full text-xs pl-8 py-1.5" />
          </div>
          <div className="max-h-[11.5rem] overflow-y-auto rounded-input border border-border-subtle bg-surface-base divide-y divide-border-subtle">
            {sessions.length === 0 ? (
              <p className="text-center py-4 text-[10px] text-ink-muted">저장된 장부가 없습니다. 「장부」 탭에서 게임을 먼저 만들어 주세요.</p>
            ) : filteredSessions.length === 0 ? (
              <p className="text-center py-4 text-[10px] text-ink-muted">"{sessQuery.trim()}" 검색 결과가 없습니다.</p>
            ) : filteredSessions.map((s) => (
              <button key={s.sessionDate} type="button"
                onClick={() => { setLinkDate(s.sessionDate); if (s.title) set({ title: s.title }); }}
                className={['w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors', linkDate === s.sessionDate ? 'bg-gold-300/15' : 'hover:bg-surface-high'].join(' ')}>
                <span className="text-2xs font-bold text-gold-300 tabular-nums shrink-0">{s.sessionDate}</span>
                <span className="flex-1 text-xs text-ink-primary truncate">{s.title || '제목 없음'}</span>
                {s.closed && <span className="text-[9px] text-ink-muted shrink-0">마감</span>}
                {linkDate === s.sessionDate && <span className="text-gold-300 text-xs shrink-0">✓</span>}
              </button>
            ))}
          </div>
        </div>
        {seededFromLedger && linkDate && (
          <p className="text-[11px] text-emerald-200 bg-emerald-500/12 border border-emerald-500/40 rounded-input px-2.5 py-2 leading-relaxed">
            📒 <b>장부 {linkDate}</b> 연동 준비됨 — 게임명·얼리가 연결됐습니다. 아래에서 블라인드·프라이즈·스택을 설정하세요. 장부 수정 시 라이브에 즉시 반영됩니다.
          </p>
        )}
      </section>

      {/* 프리셋 — 장부 연동과 동일 포맷(검색 + 스크롤 클릭) */}
      <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs font-semibold text-ink-secondary">프리셋 · 클릭해 불러오기</p>
          <span className="text-[10px] text-ink-muted tabular-nums shrink-0">{filteredPresets.length}/{presets.length} · 최대 {PRESET_LIMIT}</span>
        </div>
        {presets.length > 0 && (
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={presetQuery} onChange={(e) => setPresetQuery(e.target.value)} placeholder="프리셋 검색" className="input w-full text-xs pl-8 py-1.5" />
          </div>
        )}
        {presets.length === 0 ? (
          <p className="text-center py-2 text-[10px] text-ink-muted">저장된 프리셋이 없습니다. 아래에서 구성 후 저장하세요.</p>
        ) : filteredPresets.length === 0 ? (
          <p className="text-center py-2 text-[10px] text-ink-muted">"{presetQuery.trim()}" 검색 결과가 없습니다.</p>
        ) : (
          <div className="max-h-[11.5rem] overflow-y-auto rounded-input border border-border-subtle bg-surface-base divide-y divide-border-subtle">
            {filteredPresets.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-2.5 py-2 hover:bg-surface-high">
                <button type="button" onClick={() => loadPreset(p)} className="flex-1 text-left text-xs font-semibold text-ink-primary truncate hover:text-gold-300">{p.name}</button>
                <span className="text-[10px] text-ink-muted tabular-nums shrink-0">{countLevels(p.config.levels)}레벨</span>
                <button type="button" onClick={() => delPreset(p)} className="text-ink-muted hover:text-danger-light text-2xs px-1 shrink-0" aria-label="삭제">✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="현재 설정을 프리셋으로 저장(이름)" maxLength={30} className="input flex-1 text-sm" />
          <button type="button" onClick={savePreset} className="btn-ghost text-xs px-3 shrink-0">저장</button>
        </div>
      </section>

      {/* 기본 정보 */}
      <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
        <Field label="대회명">
          <input value={cfg.title} onChange={(e) => set({ title: e.target.value })} maxLength={60} className="input w-full text-sm" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="스타팅 스택"><input type="number" value={cfg.startStack || ''} onChange={(e) => set({ startStack: +e.target.value || 0 })} className={numInput} /></Field>
          <Field label="리바인 스택"><input type="number" value={cfg.rebuyStack || ''} onChange={(e) => set({ rebuyStack: +e.target.value || 0 })} className={numInput} /></Field>
          <Field label="애드온 스택"><input type="number" disabled={!cfg.isAddon} value={cfg.isAddon ? (cfg.addonStack || '') : ''} onChange={(e) => set({ addonStack: +e.target.value || 0 })} className={`${numInput} disabled:opacity-50`} /></Field>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          <input type="checkbox" checked={cfg.isAddon} onChange={(e) => set({ isAddon: e.target.checked })} className="accent-gold-300 w-4 h-4" />
          애드온 게임 (라이브에 ADD-ON 표시 · 켜야 애드온 스택 입력 가능)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <Field label={`등록마감 레벨 (전체 ${totalLevels})`}><input type="number" min="0" max="60" value={cfg.regCloseLevel || ''} onChange={(e) => set({ regCloseLevel: Math.max(0, +e.target.value || 0) })} className={numInput} /></Field>
          <Field label="최대 레벨 (자동생성용)"><input type="number" min="1" max="60" value={cfg.maxLevel || ''} onChange={(e) => set({ maxLevel: Math.max(0, +e.target.value || 0) })} className={numInput} /></Field>
          <Field label="미스터리 바운티"><input type="number" value={cfg.mysteryBounty || ''} onChange={(e) => set({ mysteryBounty: +e.target.value || 0 })} className={numInput} /></Field>
        </div>
        <button type="button" onClick={autoGenerate} className="w-full py-2 rounded-input bg-gold-300/12 text-gold-300 border border-gold-400/40 text-xs font-bold hover:bg-gold-300/20">
          ⚙ 블라인드 자동 생성 — 등록마감({cfg.regCloseLevel || '-'})·최대({cfg.maxLevel || 15})레벨 기준 (마감 후 가파르게)
        </button>
      </section>

      {/* 얼리 구간 — 레벨 기준 */}
      <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent p-3 space-y-2">
        <p className="text-2xs font-semibold text-gold-300">얼리 구간 (레벨 기준 · 장부 바인 시각→레벨 환산으로 자동 분류)</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="더블얼리 ~레벨까지"><input type="number" min="0" max={totalLevels} value={cfg.earlyDoubleLevel || ''} onChange={(e) => set({ earlyDoubleLevel: +e.target.value || 0 })} placeholder="예) 1" className={numInput} /></Field>
          <Field label="1얼리 ~레벨까지"><input type="number" min="0" max={totalLevels} value={cfg.earlySingleLevel || ''} onChange={(e) => set({ earlySingleLevel: +e.target.value || 0 })} placeholder="예) 4" className={numInput} /></Field>
        </div>
        <p className="text-[10px] text-ink-muted">
          예) 더블얼리 1레벨·1얼리 4레벨 → 레벨1 도착=더블얼리, 레벨2~4 도착=1얼리. 전체 {totalLevels}레벨.
          {cfg.earlyDoubleLevel > 0 && <> · 더블얼리 ≈ <b className="text-gold-300">{cfg.earlyDoubleMin}분</b></>}
          {cfg.earlySingleLevel > 0 && <> · 1얼리 ≈ <b className="text-gold-300">{cfg.earlySingleMin}분</b></>} · 라이브 수기 보정 가능.
        </p>
      </section>

      {/* 블라인드 구조 — 접기/펴기 */}
      <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
        <button type="button" onClick={() => setBldOpen((v) => !v)} className="w-full flex items-center justify-between py-0.5">
          <span className="text-2xs font-semibold text-ink-secondary">블라인드 구조 · {totalLevels}레벨</span>
          <span className="text-2xs font-bold text-gold-300">{bldOpen ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>

        {bldOpen && (<>
        {/* 듀레이션 일괄 설정 */}
        <div className="rounded-input bg-surface-high border border-border-subtle p-2 space-y-1.5">
          <p className="text-[10px] text-ink-muted">듀레이션 일괄 설정 · 레벨 길이(브레이크 제외)</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-2xs text-ink-secondary w-8 shrink-0">전체</span>
            <div className="relative w-16">
              <input type="number" min="1" value={bulkAll || ''} onChange={(e) => setBulkAll(+e.target.value || 0)} className="input w-full text-xs tabular-nums pr-5" />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted">분</span>
            </div>
            <button type="button" onClick={() => applyBulkAll(bulkAll)} className="text-2xs font-bold px-2.5 py-1.5 rounded-input bg-gold-300/15 text-gold-300 border border-gold-400/40 hover:bg-gold-300/25">전체 적용</button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-2xs text-ink-secondary w-8 shrink-0">레벨</span>
            <input type="number" min="1" value={bulkFrom || ''} onChange={(e) => setBulkFrom(+e.target.value || 0)} className="input w-12 text-xs tabular-nums" />
            <span className="text-2xs text-ink-muted">부터</span>
            <div className="relative w-16">
              <input type="number" min="1" value={bulkFromMin || ''} onChange={(e) => setBulkFromMin(+e.target.value || 0)} className="input w-full text-xs tabular-nums pr-5" />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted">분</span>
            </div>
            <button type="button" onClick={() => applyBulkFrom(bulkFrom, bulkFromMin)} className="text-2xs font-bold px-2.5 py-1.5 rounded-input bg-gold-300/15 text-gold-300 border border-gold-400/40 hover:bg-gold-300/25">적용</button>
          </div>
          <button type="button" onClick={() => setBulkFrom(cfg.regCloseLevel || 9)} className="text-[10px] text-gold-300/90 hover:text-gold-300">↩ 레지 마감 레벨({cfg.regCloseLevel || 9})부터로 설정</button>
          <p className="text-[10px] text-ink-muted">레지 마감 후 블라인드가 길어지면, 마감 레벨부터 다른 듀레이션을 일괄 적용하세요.</p>
        </div>
        <div className="space-y-1">
          {cfg.levels.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-6 text-center text-2xs font-bold text-gold-300 shrink-0">{l.kind === 'break' ? 'B' : levelNumberAt(cfg, i)}</span>
              {l.kind === 'break' ? (
                <input value={l.label ?? ''} onChange={(e) => setLevel(i, { label: e.target.value })} placeholder="BREAK" className="input flex-1 text-sm" />
              ) : (
                <>
                  <input type="number" value={l.sb || ''} onChange={(e) => setLevel(i, { sb: +e.target.value || 0 })} placeholder="SB" className="input w-full text-xs tabular-nums min-w-0" />
                  <input type="number" value={l.bb || ''} onChange={(e) => setLevel(i, { bb: +e.target.value || 0 })} placeholder="BB" className="input w-full text-xs tabular-nums min-w-0" />
                  <input type="number" value={l.ante || ''} onChange={(e) => setLevel(i, { ante: +e.target.value || 0 })} placeholder="ANTE" className="input w-full text-xs tabular-nums min-w-0" />
                </>
              )}
              <div className="relative w-16 shrink-0">
                <input type="number" value={l.minutes || ''} onChange={(e) => setLevel(i, { minutes: +e.target.value || 0 })} className="input w-full text-xs tabular-nums pr-6" />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted">분</span>
              </div>
              <button type="button" onClick={() => removeLevel(i)} className="text-ink-muted hover:text-danger-light text-xs px-1 shrink-0">✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={addLevel} className="flex-1 py-1.5 rounded-input border border-dashed border-border-default text-2xs text-ink-secondary hover:text-gold-300">+ 레벨</button>
          <button type="button" onClick={addBreak} className="flex-1 py-1.5 rounded-input border border-dashed border-border-default text-2xs text-ink-secondary hover:text-gold-300">+ 브레이크</button>
        </div>
        </>)}
      </section>

      {/* 프라이즈 */}
      <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
        <p className="text-2xs font-semibold text-ink-secondary">프라이즈</p>
        <div className="space-y-1">
          {cfg.prizes.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={p.place} onChange={(e) => setPrize(i, { place: e.target.value })} className="input w-20 text-sm shrink-0" />
              <input type="number" value={p.amount || ''} onChange={(e) => setPrize(i, { amount: +e.target.value || 0 })} className="input flex-1 text-sm tabular-nums" />
              <button type="button" onClick={() => removePrize(i)} className="text-ink-muted hover:text-danger-light text-xs px-1 shrink-0">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addPrize} className="w-full py-1.5 rounded-input border border-dashed border-border-default text-2xs text-ink-secondary hover:text-gold-300">+ 프라이즈</button>
      </section>

      {/* 시작 — 위에서 고른 방식(단독/장부)으로 */}
      <div className="flex gap-2 pb-2">
        {linkDate
          ? <button type="button" onClick={() => onStart(cfg, linkDate)} className="btn-primary flex-1 text-sm">📒 장부({linkDate.slice(5)}) 연동해 시작</button>
          : <button type="button" onClick={() => onStart(cfg, null)} className="btn-primary flex-1 text-sm">🎰 {hasLive ? '이 설정으로 다시 시작' : '단독 클락 시작'}</button>}
        {linkDate && <button type="button" onClick={() => onStart(cfg, null)} className="btn-ghost flex-1 text-sm">단독으로 시작</button>}
      </div>
    </div>
  );
}

// <label> 로 감싸면 라벨 영역 클릭 시 내부 첫 번째 버튼/입력이 활성화되는 hit-area 버그가
// 생기므로 컨테이너는 <div> 로 둔다(버튼 그룹을 감싸도 안전).
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="block text-[11px] text-ink-secondary mb-1">{label}</span>
      {children}
    </div>
  );
}
