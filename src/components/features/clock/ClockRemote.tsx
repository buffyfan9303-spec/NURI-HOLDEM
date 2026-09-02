// src/components/features/clock/ClockRemote.tsx — 휴대폰 리모컨(오너 지시 2026-09-02 #6).
//
// 왜 따로인가: 운영자 클락(TournamentClock)은 PC 조작대 문법이라 스테퍼가 작고 촘촘하다. 플로어에 서서 폰으로
// 누르는 리모컨은 **큰 버튼 몇 개**여야 한다 — START/STOP · 레벨 이전/다음 · ±1분 · 엔트리/리바이/얼리/애드온 · 탈락.
// 저장 경로는 운영자 클락과 **같은 saveClockState** 이고 liveStats 도 같은 식(computeLiveStats)으로 붙여 보내므로
// TV(?display=)·라이브 카드·운영자 화면이 전부 같은 값을 본다. 쓰기 권한은 RLS(can_access_ledger)가 가른다 —
// 권한이 없으면 저장이 거절되고 화면은 읽기전용으로 남는다(여기서 권한을 새로 만들지 않는다).
// 진입: ?remote=<venueId>&g=<gameSeq> (TV 화면 하단 QR · 내 매장 클락 '휴대폰 리모컨' 버튼).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getClockState, saveClockState, subscribeClock, effectiveLevel, levelMovePatch, computeLiveStats, deriveClockCounts,
  type ClockState, type ClockLevel,
} from '../../../api/clock';
import { getLedgerBuyins, getLedgerSession, type LedgerBuyin, type LedgerSession } from '../../../api/ledger';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../atoms/Toast';
import Icon from '../../atoms/Icon';

/** 리모컨 딥링크 — TV 화면 QR·내 매장 버튼이 같은 URL 을 쓴다 */
const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(s / 60)}:${pad(s % 60)}`; };
function levelNumberAt(levels: ClockLevel[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index && i < levels.length; i++) if (levels[i].kind === 'level') n++;
  return n;
}

export default function ClockRemote({ venueId, gameSeq = 1, venueName, onClose, onLogin }: {
  venueId: string; gameSeq?: number; venueName?: string; onClose: () => void; onLogin?: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<ClockState | null | undefined>(undefined); // undefined=로딩 · null=클락 없음
  const [buyins, setBuyins] = useState<LedgerBuyin[]>([]);
  const [session, setSession] = useState<LedgerSession | null>(null);
  const [readOnly, setReadOnly] = useState(false); // 저장이 거절되면 켠다(권한 없음)
  const [, setTick] = useState(0);
  const busyRef = useRef(false);

  const load = useCallback(() => {
    getClockState(venueId, gameSeq).then((s) => setState(s)).catch(() => setState((cur) => cur ?? null));
  }, [venueId, gameSeq]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeClock(venueId, load), [venueId, load]);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  // 장부 연동 클락이면 라이브 통계 계산에 장부 바인·세션이 필요하다(운영자 클락과 같은 재료)
  const sessionDate = state?.sessionDate ?? null;
  useEffect(() => {
    if (!sessionDate) { setBuyins([]); setSession(null); return; }
    let alive = true;
    getLedgerBuyins(venueId, sessionDate, gameSeq).then((b) => { if (alive) setBuyins(b); }).catch(() => {});
    getLedgerSession(venueId, sessionDate, gameSeq).then((s) => { if (alive) setSession(s); }).catch(() => {});
    return () => { alive = false; };
  }, [venueId, sessionDate, gameSeq]);

  const cfg = state?.config;
  const derived = useMemo(() => deriveClockCounts(buyins, {
    earlyDoubleMin: cfg?.earlyDoubleMin || session?.earlyDoubleMin || 0,
    earlySingleMin: cfg?.earlySingleMin || session?.earlySingleMin || 0,
    tournamentStart: session?.tournamentStart ?? null,
    openedAt: session?.openedAt ?? null,
  }), [buyins, session, cfg?.earlyDoubleMin, cfg?.earlySingleMin]);

  // 낙관적 반영 + 같은 저장 경로. 거절(RLS)되면 읽기전용으로 전환하고 원래 상태로 되돌린다.
  const persist = useCallback(async (patch: Partial<ClockState>) => {
    if (!state || !cfg || busyRef.current) return;
    const next = { ...state, ...patch };
    const prev = state;
    setState(next);
    busyRef.current = true;
    try {
      await saveClockState({ ...next, liveStats: { ...computeLiveStats(next, derived, cfg), buyInAmount: session?.buyinAmount ?? null } });
    } catch (e) {
      setState(prev);
      const msg = e instanceof Error ? e.message : String(e);
      if (/permission|policy|403|denied|row-level/i.test(msg)) {
        setReadOnly(true);
        toast.show('이 매장의 클락을 조작할 권한이 없어요. 매장 운영자·직원 계정으로 로그인해 주세요', 'error');
      } else {
        toast.show(`저장에 실패했어요. ${msg}`, 'error');
      }
    } finally { busyRef.current = false; }
  }, [state, cfg, derived, session, toast]);

  if (!user) {
    return (
      <Shell venueName={venueName} onClose={onClose}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Icon name="lock" size={28} className="text-ink-muted" />
          <p className="text-base font-bold text-ink-primary">로그인이 필요해요</p>
          <p className="text-sm text-ink-secondary">매장 운영자·직원 계정으로 로그인하면 이 폰이 클락 리모컨이 됩니다.</p>
          {onLogin && <button type="button" onClick={onLogin} className="btn btn-primary mt-2 px-6">로그인</button>}
        </div>
      </Shell>
    );
  }
  if (state === undefined) {
    return <Shell venueName={venueName} onClose={onClose}><p className="flex flex-1 items-center justify-center text-sm text-ink-muted">불러오는 중…</p></Shell>;
  }
  if (!state || !cfg) {
    return (
      <Shell venueName={venueName} onClose={onClose}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-base font-bold text-ink-primary">진행 중인 클락이 없어요</p>
          <p className="text-sm text-ink-secondary">내 매장 → 클락에서 게임을 시작한 뒤 리모컨을 열어 주세요.</p>
        </div>
      </Shell>
    );
  }

  const lvls = cfg.levels ?? [];
  const eff = effectiveLevel(state);
  const lv = lvls[eff.index];
  const levelNo = levelNumberAt(lvls, eff.index);
  const isBreak = lv?.kind === 'break';
  const remaining = eff.remainingMs;
  const nowMs = () => Date.now();

  const toggleRun = () => {
    if (state.running) persist({ running: false, remainingMs: Math.max(0, remaining), endsAt: null });
    else { const ms = Math.max(0, state.remainingMs || remaining); persist({ running: true, endsAt: new Date(nowMs() + ms).toISOString() }); }
  };
  const moveLevel = (delta: number) => { const p = levelMovePatch(state, state.currentIndex, delta); if (p) persist(p); };
  const adjustTime = (deltaMs: number) => {
    if (state.running && state.endsAt) persist({ endsAt: new Date(Math.max(nowMs(), new Date(state.endsAt).getTime() + deltaMs)).toISOString() });
    else persist({ remainingMs: Math.max(0, state.remainingMs + deltaMs) });
  };
  const adj = (key: 'adjEntries' | 'adjRebuys' | 'adjEarlies' | 'adjAddons', d: number) =>
    persist({ [key]: Math.max(-9999, state[key] + d) } as Partial<ClockState>);
  const adjAlive = (d: number) => persist({ eliminations: Math.max(0, state.eliminations - d) }); // +면 생존↑
  const stats = computeLiveStats(state, derived, cfg);
  const disabled = readOnly;

  return (
    <Shell venueName={venueName} onClose={onClose} game={state.gameSeq > 1 ? `사이드${state.gameSeq - 1}` : '메인'}>
      {/* 현재 상태 — 큰 타이머 한 눈에. ring-aura 헤어라인+안쪽 후광까지만 — 바깥 글로우는 12px 아래 START(에메랄드 80px)와 색 경쟁 */}
      <section className="rounded-aura border card-aura ring-aura px-4 py-4 text-center">
        <p className="t-micro">{isBreak ? '휴식' : `레벨 ${levelNo}`}</p>
        <p className={`mt-1 font-black leading-none tabular-nums ${state.running ? 'text-ink-primary' : 'text-amber-400'}`} style={{ fontSize: 'clamp(56px, 18vw, 96px)', letterSpacing: '-0.02em' }}>
          {mmss(remaining)}
        </p>
        <p className="mt-2 text-lg font-extrabold tabular-nums text-aura-300">
          {isBreak ? '휴식' : lv ? `${lv.sb.toLocaleString()} / ${lv.bb.toLocaleString()}${lv.ante > 0 ? `  ·  ANTE ${lv.ante.toLocaleString()}` : ''}` : '-'}
        </p>
        <p className="mt-1 text-xs text-ink-muted">{state.running ? '진행 중' : '일시정지'} · 생존 <b className="text-ink-primary tabular-nums">{stats.alive}</b> / 엔트리 <b className="text-ink-primary tabular-nums">{stats.entries}</b></p>
        {readOnly && <p className="mt-2 rounded-chip bg-danger/10 px-2 py-1 text-2xs font-semibold text-danger-light">권한이 없어 보기만 가능해요</p>}
      </section>

      {/* 1행: START/STOP 크게 + 레벨 이전/다음 */}
      <div className="grid grid-cols-[1fr_2fr_1fr] gap-2">
        <Big label="이전 레벨" icon="chevron-left" onClick={() => moveLevel(-1)} disabled={disabled || state.currentIndex <= 0} />
        <button type="button" onClick={toggleRun} disabled={disabled}
          className={['flex h-20 flex-col items-center justify-center gap-1 rounded-aura text-base font-extrabold text-ink-inverse transition-transform active:scale-[0.97] disabled:opacity-40',
            state.running ? 'bg-amber-400' : 'bg-emerald-400'].join(' ')}>
          <Icon name={state.running ? 'pause' : 'play'} size={26} />{state.running ? 'STOP' : 'START'}
        </button>
        <Big label="다음 레벨" icon="chevron-right" onClick={() => moveLevel(1)} disabled={disabled || state.currentIndex >= lvls.length - 1} />
      </div>

      {/* 2행: 시간 보정 */}
      <div className="grid grid-cols-4 gap-2">
        <Small onClick={() => adjustTime(-60_000)} disabled={disabled}>−1분</Small>
        <Small onClick={() => adjustTime(-10_000)} disabled={disabled}>−10초</Small>
        <Small onClick={() => adjustTime(10_000)} disabled={disabled}>+10초</Small>
        <Small onClick={() => adjustTime(60_000)} disabled={disabled}>+1분</Small>
      </div>

      {/* 3행: 인원 — 플로어에서 제일 자주 누르는 것 */}
      <section className="space-y-2 rounded-aura border card-aura px-3 py-3">
        <Counter label="탈락(생존 −)" value={stats.alive} onMinus={() => adjAlive(-1)} onPlus={() => adjAlive(1)} disabled={disabled} minusFirst />
        <Counter label="엔트리" value={stats.entries} onMinus={() => adj('adjEntries', -1)} onPlus={() => adj('adjEntries', 1)} disabled={disabled} />
        <Counter label="리바이" value={stats.rebuys} onMinus={() => adj('adjRebuys', -1)} onPlus={() => adj('adjRebuys', 1)} disabled={disabled} />
        <Counter label="얼리" value={stats.earlies} onMinus={() => adj('adjEarlies', -1)} onPlus={() => adj('adjEarlies', 1)} disabled={disabled} />
        <Counter label="애드온" value={stats.addons} onMinus={() => adj('adjAddons', -1)} onPlus={() => adj('adjAddons', 1)} disabled={disabled} />
      </section>
      <p className="px-1 text-center text-2xs text-ink-muted">
        {state.sessionDate ? `장부(${state.sessionDate}) 연동 중 · 엔트리·리바이는 장부에서 자동 반영되고, 여기 값은 보정입니다.` : '장부 미연동 — 여기서 누른 값이 그대로 TV에 표시됩니다.'}
      </p>
    </Shell>
  );
}

function Shell({ venueName, game, onClose, children }: { venueName?: string; game?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-surface-base text-ink-primary" data-scroll-lock>
      <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
        <Icon name="smartphone" size={16} className="text-aura-300" />
        <p className="min-w-0 flex-1 truncate text-sm font-bold">클락 리모컨 <span className="font-normal text-ink-muted">· {venueName || '매장'}{game ? ` · ${game}` : ''}</span></p>
        <button type="button" onClick={onClose} aria-label="닫기" className="grid h-10 w-10 place-items-center rounded-input text-ink-secondary hover:bg-surface-high"><Icon name="close" size={18} /></button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{children}</div>
    </div>
  );
}

function Big({ label, icon, onClick, disabled }: { label: string; icon: 'chevron-left' | 'chevron-right'; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex h-20 flex-col items-center justify-center gap-1 rounded-aura border card-aura text-xs font-bold text-ink-secondary transition-transform active:scale-[0.97] disabled:opacity-40">
      <Icon name={icon} size={22} />{label}
    </button>
  );
}
function Small({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="h-12 rounded-[12px] border border-border-default bg-surface-high text-sm font-bold tabular-nums text-ink-primary transition-transform active:scale-[0.97] disabled:opacity-40">
      {children}
    </button>
  );
}
function Counter({ label, value, onMinus, onPlus, disabled, minusFirst }: { label: string; value: number; onMinus: () => void; onPlus: () => void; disabled?: boolean; minusFirst?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-secondary">{label}</span>
      <span className="w-12 text-right text-xl font-extrabold tabular-nums text-ink-primary">{value}</span>
      <button type="button" onClick={onMinus} disabled={disabled} aria-label={`${label} 빼기`}
        className={['grid h-12 w-14 place-items-center rounded-[12px] border border-border-default text-lg font-black transition-transform active:scale-[0.95] disabled:opacity-40',
          minusFirst ? 'bg-danger/15 text-danger-light' : 'bg-surface-high text-ink-primary'].join(' ')}>−</button>
      <button type="button" onClick={onPlus} disabled={disabled} aria-label={`${label} 더하기`}
        className="grid h-12 w-14 place-items-center rounded-[12px] bg-accent-300 text-lg font-black text-white transition-transform active:scale-[0.95] disabled:opacity-40">+</button>
    </div>
  );
}
