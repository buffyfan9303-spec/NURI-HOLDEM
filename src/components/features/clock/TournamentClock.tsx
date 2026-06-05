// src/components/features/clock/TournamentClock.tsx
// 토너먼트 클락 — 설정/프리셋 + 라이브 디스플레이(블라인드 타이머) + 수기 컨트롤 + 일시정지.
// 와홀덤/Roti 클락 구조를 따르되 NURI 테마로. 장부 연동 카운트 자동 산출 + 수기 보정.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../../atoms/Toast';
import {
  type ClockConfig, type ClockLevel, type ClockPreset, type ClockState, type ClockPrizeRow,
  defaultClockConfig, emptyClockState, deriveClockCounts, PRESET_LIMIT,
  getClockPresets, saveClockPreset, deleteClockPreset,
  getClockState, saveClockState, clearClockState, subscribeClock,
} from '../../../api/clock';
import { getLedgerBuyins, getLedgerSession, subscribeLedger, type LedgerBuyin, type LedgerSession } from '../../../api/ledger';

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
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'settings' | 'live'>('live');

  const reloadState = useCallback(() => getClockState(venueId).then((s) => setState(s)).catch(() => {}), [venueId]);
  const reloadPresets = useCallback(() => getClockPresets(venueId).then(setPresets).catch(() => {}), [venueId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getClockState(venueId), getClockPresets(venueId)])
      .then(([s, p]) => { setState(s); setPresets(p); setView(s ? 'live' : 'settings'); })
      .finally(() => setLoading(false));
  }, [venueId]);

  useEffect(() => subscribeClock(venueId, reloadState), [venueId, reloadState]);

  const startClock = async (config: ClockConfig, link: boolean) => {
    const base = emptyClockState(venueId, config);
    base.sessionDate = link ? (seedSessionDate ?? null) : null;
    base.title = config.title;
    try { await saveClockState(base); setState(base); setView('live'); toast.show('클락을 시작 준비했습니다', 'success'); }
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
        venueId={venueId} canManage={canManage} presets={presets} initial={state?.config ?? defaultClockConfig()}
        hasLive={!!state} seedSessionDate={seedSessionDate}
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
    if (!document.fullscreenElement) { el.requestFullscreen?.(); setFs(true); }
    else { document.exitFullscreen?.(); setFs(false); }
  };

  // 집계
  const cfg = state.config;
  const derived = useMemo(() => deriveClockCounts(buyins, {
    earlyDoubleMin: linkedSession?.earlyDoubleMin ?? cfg.earlyDoubleMin,
    earlySingleMin: linkedSession?.earlySingleMin ?? cfg.earlySingleMin,
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

  return (
    <div ref={wrapRef} className="space-y-2">
      {/* 상단 보조 바(운영) */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink-primary">클락</h2>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={toggleFs} className="btn-ghost text-2xs px-2.5 py-1">{fs ? '전체화면 해제' : '전체화면'}</button>
          {canManage && <button type="button" onClick={onOpenSettings} className="btn-ghost text-2xs px-2.5 py-1">설정</button>}
        </div>
      </div>

      {/* 디스플레이 */}
      <div className="rounded-card overflow-hidden border border-border-default bg-surface-base">
        {/* 헤더 */}
        <div className="bg-surface-high border-b border-border-subtle px-4 py-2 text-center">
          <p className="text-sm sm:text-lg font-bold text-ink-primary truncate">{cfg.title || '토너먼트'}</p>
        </div>

        <div className="grid grid-cols-[minmax(72px,1fr)_2.4fr_minmax(86px,1.1fr)]">
          {/* 좌: 프라이즈 */}
          <div className="p-2 sm:p-3 border-r border-border-subtle/60 bg-surface-low/40">
            <ul className="space-y-0.5">
              {cfg.prizes.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-1 text-[10px] sm:text-xs text-ink-secondary">
                  <span className="truncate">{p.place}</span><span className="tabular-nums font-semibold text-ink-primary">{p.amount.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            {cfg.mysteryBounty > 0 && (
              <div className="mt-2 pt-2 border-t border-border-subtle/60">
                <p className="text-[9px] sm:text-2xs text-gold-300 font-semibold leading-tight">Mystery Bounty</p>
                <p className="text-[10px] sm:text-xs text-ink-primary tabular-nums">{cfg.mysteryBounty.toLocaleString()}</p>
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-border-subtle/60">
              <p className="text-[9px] sm:text-2xs text-ink-muted">TOTAL PRIZE</p>
              <p className="text-xs sm:text-base font-bold text-gold-300 tabular-nums leading-tight">{totalPrize.toLocaleString()}</p>
            </div>
          </div>

          {/* 중앙: 타이머 */}
          <div className={['relative flex flex-col items-center justify-center py-6 sm:py-10 text-center',
            'bg-gradient-to-b from-rose-900/30 via-rose-700/25 to-rose-900/40'].join(' ')}>
            <p className="text-base sm:text-2xl font-bold text-ink-primary/90 tracking-wide">{isBreak ? (cur.label || 'BREAK') : `LEVEL ${levelNo}`}</p>
            <p className={['font-extrabold tabular-nums leading-none my-1 sm:my-2',
              'text-6xl sm:text-8xl', remaining <= 60_000 && state.running ? 'text-rose-300' : 'text-white'].join(' ')}>
              {mmss(Math.max(0, remaining))}
            </p>
            {!isBreak && (
              <div className="flex items-center gap-8 sm:gap-16 mt-1">
                <div><p className="text-[10px] sm:text-sm text-ink-secondary tracking-widest">BLINDS</p><p className="text-base sm:text-2xl font-bold text-ink-primary tabular-nums">{cur.sb.toLocaleString()}/{cur.bb.toLocaleString()}</p></div>
                <div><p className="text-[10px] sm:text-sm text-ink-secondary tracking-widest">ANTE</p><p className="text-base sm:text-2xl font-bold text-ink-primary tabular-nums">{cur.ante.toLocaleString()}</p></div>
              </div>
            )}
            <p className="mt-3 text-[11px] sm:text-base font-semibold text-gold-300/90">{nextPlayableLabel(cfg, state.currentIndex)}</p>
            {!state.running && <span className="absolute top-2 right-2 text-[9px] sm:text-2xs font-bold text-rose-300 bg-rose-950/50 px-2 py-0.5 rounded-badge">일시정지</span>}
          </div>

          {/* 우: 스탯 */}
          <div className="p-2 sm:p-3 border-l border-border-subtle/60 bg-surface-low/40 space-y-2 sm:space-y-3">
            <Stat label="PLAYERS" value={`${alive} / ${entries}`} />
            <Stat label="RE-BUY / EARLY" value={`${rebuys} / ${earlies}`} />
            {regClose !== null
              ? <Stat label="REG CLOSE" value={hms(regClose)} tone="muted" />
              : <Stat label="TOTAL TIME" value={hms(0)} tone="muted" />}
            <Stat label="TOTAL STACK" value={totalStack.toLocaleString()} />
            <Stat label="AVG STACK" value={avgStack.toLocaleString()} />
            <Stat label="NEXT BREAK" value={nextBreak !== null ? hms(nextBreak) : '—'} tone="rose" />
          </div>
        </div>

        {/* 하단 컨트롤(운영자) */}
        {canManage && (
          <div className="border-t border-border-subtle bg-surface-low/60 px-2 py-2">
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
              <button type="button" onClick={onEnd} className="px-4 py-2 rounded-input text-xs font-bold bg-surface-float text-ink-secondary border border-border-default hover:text-danger-light">END</button>
            </div>
          </div>
        )}
      </div>

      {state.sessionDate && (
        <p className="text-2xs text-ink-muted text-center">장부({state.sessionDate}) 연동 중 — 엔트리·리바인은 장부에서 자동 반영, 하단 버튼으로 보정/아웃 처리하세요.</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'muted' | 'rose' }) {
  const c = tone === 'rose' ? 'text-rose-300' : tone === 'muted' ? 'text-ink-secondary' : 'text-ink-primary';
  return (
    <div className="text-center">
      <p className="text-[9px] sm:text-2xs text-ink-muted tracking-wide leading-tight">{label}</p>
      <p className={['text-sm sm:text-xl font-bold tabular-nums leading-tight', c].join(' ')}>{value}</p>
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
function ClockSettings({ venueId, canManage, presets, initial, hasLive, seedSessionDate, onReloadPresets, onStart, onBackToLive }: {
  venueId: string; canManage: boolean; presets: ClockPreset[]; initial: ClockConfig; hasLive: boolean;
  seedSessionDate?: string | null;
  onReloadPresets: () => void; onStart: (c: ClockConfig, link: boolean) => void; onBackToLive?: () => void;
}) {
  const toast = useToast();
  const [cfg, setCfg] = useState<ClockConfig>(initial);
  const [presetName, setPresetName] = useState('');
  const [bulkAll, setBulkAll] = useState(20);       // 전체 일괄 듀레이션(분)
  const [bulkFrom, setBulkFrom] = useState(initial.regCloseLevel || 9); // 구간 시작 레벨
  const [bulkFromMin, setBulkFromMin] = useState(25); // 구간 듀레이션(분)
  const set = (patch: Partial<ClockConfig>) => setCfg((c) => ({ ...c, ...patch }));

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
  const addBreak = () => set({ levels: [...cfg.levels, { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 8, label: 'BREAK 8Min.' }] });
  const removeLevel = (i: number) => set({ levels: cfg.levels.filter((_, idx) => idx !== i) });

  const setPrize = (i: number, patch: Partial<ClockPrizeRow>) => set({ prizes: cfg.prizes.map((p, idx) => idx === i ? { ...p, ...patch } : p) });
  const addPrize = () => set({ prizes: [...cfg.prizes, { place: `${cfg.prizes.length + 1}th`, amount: 0 }] });
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

      {/* 프리셋 */}
      <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
        <p className="text-2xs font-semibold text-ink-secondary">프리셋 ({presets.length}/{PRESET_LIMIT})</p>
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-badge bg-surface-high border border-border-default pl-2.5 pr-1 py-1">
                <button type="button" onClick={() => loadPreset(p)} className="text-2xs font-semibold text-ink-secondary hover:text-gold-300">{p.name}</button>
                <button type="button" onClick={() => delPreset(p)} className="text-ink-muted hover:text-danger-light text-2xs px-1" aria-label="삭제">✕</button>
              </span>
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
          <Field label="애드온 스택"><input type="number" value={cfg.addonStack || ''} onChange={(e) => set({ addonStack: +e.target.value || 0 })} className={numInput} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="등록마감 레벨"><input type="number" value={cfg.regCloseLevel || ''} onChange={(e) => set({ regCloseLevel: +e.target.value || 0 })} className={numInput} /></Field>
          <Field label="미스터리 바운티"><input type="number" value={cfg.mysteryBounty || ''} onChange={(e) => set({ mysteryBounty: +e.target.value || 0 })} className={numInput} /></Field>
          <div />
        </div>
      </section>

      {/* 얼리 구간 */}
      <section className="rounded-card border border-gold-400/30 bg-gradient-to-br from-gold-300/[0.05] to-transparent p-3 space-y-2">
        <p className="text-2xs font-semibold text-gold-300">얼리 구간 (스타트 후 경과 분 기준 · 장부 바인 시각으로 자동 분류)</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="더블얼리 ~분까지"><input type="number" value={cfg.earlyDoubleMin || ''} onChange={(e) => set({ earlyDoubleMin: +e.target.value || 0 })} placeholder="예) 20" className={numInput} /></Field>
          <Field label="1얼리 ~분까지"><input type="number" value={cfg.earlySingleMin || ''} onChange={(e) => set({ earlySingleMin: +e.target.value || 0 })} placeholder="예) 80" className={numInput} /></Field>
        </div>
        <p className="text-[10px] text-ink-muted">예) 더블얼리 20분·1얼리 80분 → 시작 20분 내 바인=더블얼리, 80분 내=1얼리. 라이브에서 수기 보정도 가능.</p>
      </section>

      {/* 블라인드 구조 */}
      <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
        <p className="text-2xs font-semibold text-ink-secondary">블라인드 구조</p>

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

      {/* 시작 */}
      <div className="flex gap-2 pb-2">
        {seedSessionDate && (
          <button type="button" onClick={() => onStart(cfg, true)} className="btn-primary flex-1 text-sm">장부({seedSessionDate}) 연동해 시작</button>
        )}
        <button type="button" onClick={() => onStart(cfg, false)} className={seedSessionDate ? 'btn-ghost flex-1 text-sm' : 'btn-primary flex-1 text-sm'}>
          {seedSessionDate ? '단독 클락 시작' : (hasLive ? '이 설정으로 다시 시작' : '클락 시작')}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-ink-secondary mb-1">{label}</span>
      {children}
    </label>
  );
}
