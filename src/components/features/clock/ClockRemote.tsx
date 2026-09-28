// src/components/features/clock/ClockRemote.tsx — 휴대폰 리모컨(오너 지시 2026-09-02 #6).
//
// 왜 따로인가: 운영자 클락(TournamentClock)은 PC 조작대 문법이라 스테퍼가 작고 촘촘하다. 플로어에 서서 폰으로
// 누르는 리모컨은 **큰 버튼 몇 개**여야 한다 — START/STOP · 레벨 이전/다음 · ±1분 · 엔트리/리바이/얼리/애드온 · 탈락.
// 저장 경로는 운영자 클락과 **같은 saveClockPatch** 이다. 쓰기 권한은 서버(can_access_ledger)가 가른다 —
// 권한이 없으면 저장이 거절되고 화면은 읽기전용으로 남는다(여기서 권한을 새로 만들지 않는다).
// 🔴 K1·K5(2026-09-29 실측) — 통계는 여기서 계산해 저장하지 않는다.
//   · ± 는 카운트 열의 **차분**만 서버 원자 RPC 로 간다(saveClockPatch). 동시·잠든 기기의 탈락이 사라지지 않는다.
//   · 표시는 TV 와 같은 composeLiveStats(장부 몫 + 행의 열) — 예전엔 진입 때 한 번 읽은 장부로 계산해 새 바인을 몰랐다(4C: 서버 6/6, 리모컨 5/5).
//   · 장부 몫 스냅샷은 이 화면도 작성자 중 하나다(writeLedgerStats 한 벌 · 멱등) — 무인 운영에서 장부가 움직이면 TV 가 따라간다.
// 진입: ?remote=<venueId>&g=<gameSeq> (TV 화면 하단 QR · 내 매장 클락 '휴대폰 리모컨' 버튼).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getClockState, saveClockPatch, createCoalescingSaver, subscribeClock, effectiveLevel, levelMovePatch, composeLiveStats,
  syncClockLedgerStats, clampAdjEarlies, clampAdjCount,
  type ClockState,
} from '../../../api/clock';
import { clockPhase, CLOCK_PHASE_LABEL, levelNumberAt, formatCountdown } from '../../../lib/clockLevel';
import { subscribeLedger } from '../../../api/ledger';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../atoms/Toast';
import Icon from '../../atoms/Icon';
import { serverNow } from '../../../lib/serverTime';
import { useResyncOnWake } from '../../../lib/realtimeResync';
import { useClockSecond } from '../../../lib/clockTick';
import { useServerTimeReady } from '../../../lib/useServerTimeReady';

// levelNumberAt · formatCountdown 은 src/lib/clockLevel.ts 하나뿐이다.

export default function ClockRemote({ venueId, gameSeq = 1, venueName, onClose, onLogin }: {
  venueId: string; gameSeq?: number; venueName?: string; onClose: () => void; onLogin?: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<ClockState | null | undefined>(undefined); // undefined=로딩 · null=클락 없음
  const [readOnly, setReadOnly] = useState(false); // 저장이 거절되면 켠다(권한 없음)
  // K8 — 서버 시각 첫 측정 전엔 그리지 않는다(기기 시계로 레벨까지 틀린 첫 프레임). 버튼도 이때까지 안 보이므로 측정 전 쓰기가 없다.
  const timeReady = useServerTimeReady();
  useClockSecond(state, !!state);

  // 🔴 CLOCK-TAP-LAG(오너 2026-09-24) — 운영자 클락과 같은 저장기(api/clock.ts createCoalescingSaver)를 쓴다 —
  //   연타 합치기·순서 보장·바뀐 칸만, 저장 대기 중 재조회는 버리고 연타가 끝나면 한 번 다시 읽는다.
  const loadSeqRef = useRef(0);
  const reloadAfterSaveRef = useRef(false);
  const loadRef = useRef<() => void>(() => {});
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });
  const saver = useMemo(() => createCoalescingSaver<ClockState>(
    (s) => `${s.venueId}#${s.gameSeq}`,
    (next, base) => saveClockPatch(base, next),
    {
      error: (e, back) => {
        setState((cur) => (cur && cur.venueId === back.venueId && cur.gameSeq === back.gameSeq ? back : cur));
        reloadAfterSaveRef.current = true;
        const msg = e instanceof Error ? e.message : String(e);
        if (/permission|policy|403|denied|row-level|권한/i.test(msg)) {
          setReadOnly(true);
          toastRef.current.show('이 매장의 클락을 조작할 권한이 없어요. 매장 운영자·직원 계정으로 로그인해 주세요', 'error');
        } else {
          toastRef.current.show(`저장에 실패했어요. ${msg}`, 'error');
        }
      },
      idle: () => { if (reloadAfterSaveRef.current) { reloadAfterSaveRef.current = false; loadRef.current(); } },
    },
  ), []);
  const load = useCallback(() => {
    if (saver.busy) { reloadAfterSaveRef.current = true; return; }
    const my = ++loadSeqRef.current;
    getClockState(venueId, gameSeq)
      .then((s) => { if (my === loadSeqRef.current && !saver.busy) setState(s); })
      .catch(() => setState((cur) => cur ?? null));
  }, [venueId, gameSeq, saver]);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeClock(venueId, load), [venueId, load]);
  // D2(2026-09-28) — 잠든 폰이 깨어났을 때 옛 화면에서 STOP/START 를 누르지 않게: 창 복귀·온라인 복귀·30초마다 다시 읽는다.
  //   (그래도 옛 화면에서 누르면 saveClockPatch 의 CAS 가 0행으로 막고 다시 읽는다.)
  useResyncOnWake(load, true, 30_000);

  // 장부 연동 클락 — 장부가 움직이면 장부 몫 스냅샷을 다시 쓴다(K3·K5). 권한이 없으면 조용히 실패한다(표시는 TV 와 같은 값).
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });
  const sessionDate = state?.sessionDate ?? null;
  useEffect(() => {
    if (!sessionDate || !user) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { const s = stateRef.current; if (s?.sessionDate) void syncClockLedgerStats(s).catch(() => {}); }, 400);
    };
    run();
    const off = subscribeLedger(venueId, run);
    return () => { off(); if (t) clearTimeout(t); };
  }, [venueId, sessionDate, gameSeq, user]);

  const cfg = state?.config;

  // 낙관적 반영 + 같은 저장기. 거절(RLS)되면 읽기전용으로 전환하고 서버가 받아 준 값으로 되돌린다(saver.error).
  // 표시 통계는 composeLiveStats 로 다시 합성한다(저장하지 않는다 — 카운트는 차분 RPC, 통계는 읽는 쪽이 합성).
  const persist = useCallback((patch: Partial<ClockState>) => {
    if (!state || !cfg) return;
    const moved = { ...state, ...patch };
    const next = { ...moved, liveStats: composeLiveStats(moved) };
    loadSeqRef.current++;               // 날아가던 조회 응답이 낙관값을 덮지 않게
    reloadAfterSaveRef.current = true;  // 연타가 끝나면 한 번 다시 읽어 다른 기기 변경과 맞춘다
    setState(next);
    saver.push(next, state);
  }, [state, cfg, saver]);

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
  if (state === undefined || !timeReady) {
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
  const nowMs = () => serverNow();   // D1 — 5분 빠른 폰이 START 를 눌러도 ends_at 은 서버 기준

  // (C03, 2026-09-12) 표시는 effectiveLevel(state) 인데 STOP 이 remainingMs 만 패치하고
  // currentIndex 는 그대로 두면, 드리프트(endsAt 경과) 상태에서 정지할 때 '옛 레벨 번호 + 새 레벨의 남은 시간'
  // 이라는 불일치 행이 저장됐다 — 같은 now·같은 실효 인덱스(eff.index)로 커밋한다.
  // 🔴 C5(2026-09-25) — 정지 순간의 잔여는 **누른 순간** 다시 잰다(렌더는 1초 틱이라 최대 1초 낡았다 → 정지마다 손님 몰래 시간이 늘었다).
  // C7 — 끝난 대회는 START 가 비활성이다(remainingMs 0 으로 재개되면 운영자 워치독이 즉시 다시 종료시킨다).
  const finished = clockPhase(state) === 'finished';
  const toggleRun = () => {
    if (finished) return;
    const at = effectiveLevel(state, nowMs());
    if (state.running) persist({ running: false, currentIndex: at.index, remainingMs: Math.max(0, at.remainingMs), endsAt: null });
    else { const ms = Math.max(0, state.remainingMs || at.remainingMs); persist({ running: true, endsAt: new Date(nowMs() + ms).toISOString() }); }
  };
  // levelMovePatch 의 계약(api/clock.ts levelMovePatch 주석)은 '실효 인덱스'를 요구한다 —
  // raw state.currentIndex 를 넘기면 드리프트된 클락에서 엉뚱한 레벨을 기준으로 이동했다.
  const moveLevel = (delta: number) => { const p = levelMovePatch(state, eff.index, delta); if (p) persist(p); };
  const adjustTime = (deltaMs: number) => {
    if (state.running && state.endsAt) persist({ endsAt: new Date(Math.max(nowMs(), new Date(state.endsAt).getTime() + deltaMs)).toISOString() });
    else persist({ remainingMs: Math.max(0, state.remainingMs + deltaMs) });
  };
  // 표시는 TV 와 같은 합성 한 벌(K5). 장부 연동인데 아직 장부 몫이 없으면 0 으로 보인다(TV 는 '—').
  const stats = composeLiveStats(state) ?? { entries: 0, rebuys: 0, earlies: 0, addons: 0, alive: 0, eliminations: state.eliminations, totalStack: 0, avgStack: 0 };
  const led = state.liveStats?.ledger;
  // 하한은 얼리와 같은 규칙이다 — 실효 카운트(장부 자동 몫 + 보정)가 0 밑으로 내려가면
  // 카운트는 max(0,…) 로 멈추고 칩만 음수로 떨어진다(#11, 오너 보고 2026-09-15 · TV '총 칩' −5,000).
  // 2026-09-17: 예전엔 여기만 `Math.max(-9999, …)` 라 엔트리·리바이·애드온에 같은 증상이 남아 있었다.
  const adj = (key: 'adjEntries' | 'adjRebuys' | 'adjAddons', d: number) => {
    const auto = key === 'adjEntries' ? (led?.entries ?? 0) : key === 'adjRebuys' ? (led?.rebuys ?? 0) : 0;
    persist({ [key]: clampAdjCount(auto, state[key], d) } as Partial<ClockState>);
  };
  const adjEarly = (d: number) => persist({ adjEarlies: clampAdjEarlies(stats, state.adjEarlies, d) });
  const adjAlive = (d: number) => persist({ eliminations: Math.max(0, state.eliminations - d) }); // +면 생존↑
  const disabled = readOnly;

  return (
    <Shell venueName={venueName} onClose={onClose} game={state.gameSeq > 1 ? `사이드${state.gameSeq - 1}` : '메인'}>
      {/* 현재 상태 — 큰 타이머 한 눈에. ring-aura 헤어라인+안쪽 후광까지만 — 바깥 글로우는 12px 아래 START(에메랄드 80px)와 색 경쟁 */}
      <section className="rounded-aura border card-aura ring-aura px-4 py-4 text-center">
        <p className="t-micro">{isBreak ? '휴식' : `레벨 ${levelNo}`}</p>
        <p className={`mt-1 font-black leading-none tabular-nums ${state.running ? 'text-ink-primary' : 'text-amber-400'}`} style={{ fontSize: 'clamp(56px, 18vw, 96px)', letterSpacing: '-0.02em' }}>
          {formatCountdown(remaining)}
        </p>
        <p className="mt-2 text-lg font-extrabold tabular-nums text-aura-300">
          {isBreak ? '휴식' : lv ? `${lv.sb.toLocaleString()} / ${lv.bb.toLocaleString()}${lv.ante > 0 ? `  ·  ANTE ${lv.ante.toLocaleString()}` : ''}` : '-'}
        </p>
        {/* 운영자·TV 와 같은 파생 — 예전엔 running 하나로 갈라 '시작 전'을 '일시정지'라 불렀다 */}
        <p className="mt-1 text-xs text-ink-muted">{CLOCK_PHASE_LABEL[clockPhase(state)]} · 생존 <b className="text-ink-primary tabular-nums">{stats.alive}</b> / 엔트리 <b className="text-ink-primary tabular-nums">{stats.entries}</b></p>
        {readOnly && <p className="mt-2 rounded-chip bg-danger/10 px-2 py-1 text-2xs font-semibold text-danger-light">권한이 없어 보기만 가능해요</p>}
      </section>

      {/* 1행: START/STOP 크게 + 레벨 이전/다음 */}
      <div className="grid grid-cols-[1fr_2fr_1fr] gap-2">
        <Big label="이전 레벨" icon="chevron-left" onClick={() => moveLevel(-1)} disabled={disabled || eff.index <= 0} />
        <button type="button" onClick={toggleRun} disabled={disabled || finished}
          className={['flex h-20 flex-col items-center justify-center gap-1 rounded-aura text-base font-extrabold text-ink-inverse transition-transform active:scale-[0.97] disabled:opacity-40',
            finished ? 'bg-surface-high text-ink-muted' : state.running ? 'bg-amber-400' : 'bg-emerald-400'].join(' ')}>
          <Icon name={finished ? 'check' : state.running ? 'pause' : 'play'} size={26} />{finished ? '대회 종료' : state.running ? 'STOP' : 'START'}
        </button>
        <Big label="다음 레벨" icon="chevron-right" onClick={() => moveLevel(1)} disabled={disabled || eff.index >= lvls.length - 1} />
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
        <Counter label="얼리" value={stats.earlies} onMinus={() => adjEarly(-1)} onPlus={() => adjEarly(1)} disabled={disabled} />
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
    <div className="fixed inset-0 z-80 flex flex-col bg-surface-base text-ink-primary" data-scroll-lock>
      <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
        <Icon name="smartphone" size={16} className="text-aura-300" />
        <p className="min-w-0 flex-1 truncate text-sm font-bold">클락 리모컨 <span className="font-normal text-ink-muted">· {venueName || '매장'}{game ? ` · ${game}` : ''}</span></p>
        {/* hit: 시각 크기 40px 그대로, 실효 터치 영역만 44px 로 — 플로어에서 폰으로 누르는 화면이라 빗나가면 안 된다 */}
        <button type="button" onClick={onClose} aria-label="닫기" className="hit grid h-10 w-10 place-items-center rounded-input text-ink-secondary hover:bg-surface-high"><Icon name="close" size={18} /></button>
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
