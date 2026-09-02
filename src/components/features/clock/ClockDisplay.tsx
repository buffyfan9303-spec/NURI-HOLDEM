// src/components/features/clock/ClockDisplay.tsx
// 관전 / 대형 디스플레이 모드 — 매장 TV·빔프로젝터용 읽기전용 풀스크린.
//   큰 타이머 + 레벨/블라인드/앤티 + 다음 브레이크·등록마감 + 라이브 통계(엔트리·생존·평균스택) + 상금 보드.
// 진입: 라이브 카드 '📺 큰 화면' / 운영자 클락 'TV 송출' / 딥링크 ?display=<venueId>&g=<gameSeq>.
// 실시간: subscribeClock 으로 레벨 전환·통계 즉시 반영 + 1초 로컬 틱(숨김/복귀해도 endsAt 기준 정확).
// 읽기전용(컨트롤 없음) — 운영은 운영자 클락 화면·휴대폰 리모컨(?remote=)에서. 화면 항상 켜둠(Wake Lock, 베스트에포트).
//
// 2026-09-02 레이아웃 v2(오너 지시 · 참조 APIS 클락): 3열 — 좌 PRIZE POOL · 중앙 LEVEL/타이머/블라인드/ANTE/NEXT BREAK ·
//   우 PLAYERS/BUY-IN/REBUY/ENTRIES/REG CLOSE, 하단 TOTAL CHIPS/AVG STACK/NEXT BREAK, 헤더 RUNNING TIME.
//   라벨은 국내 매장 관례(APIS)대로 영문 대문자. 타이머는 순백, 강조는 테마 accent(기본 아우라 골드).
import { memo, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { getVenueClocks, subscribeClock, effectiveLevel, type ClockState, type ClockLevel } from '../../../api/clock';
import { buyinRequestUrl } from '../../../api/ledger';
import { getAppSetting, CLOCK_AD_KEY } from '../../../api/settings';
import { fetchVenuePageConfig } from '../../../api/rankings';
import { readSnap, writeSnap } from '../../../lib/snapshot';
import { clockThemeVars, sanitizeClockTheme, clockThemeSnapKey, type ClockTheme } from './clockTheme';
import Icon from '../../atoms/Icon';

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(s / 60)}:${pad(s % 60)}`; };
const hms = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 3600 ? `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}` : `${pad(s / 60)}:${pad(s % 60)}`; };
/** 경과 시간 라벨 — '5시간 50분' / '48분' */
const runningLabel = (ms: number) => { const m = Math.max(0, Math.floor(ms / 60_000)); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
/** 금액 축약 — 값이 바뀌지 않을 때만 축약(§28 참가비·상금은 가격 고지). 50000→'5만' · 55000→'5.5만' · 1억 */
function fmtWon(n: number): string {
  const unit = (div: number, suffix: string) => { const r = Math.round((n / div) * 100) / 100; return Math.abs(r * div - n) < 0.5 ? `${r}${suffix}` : null; };
  if (n >= 100_000_000) { const s = unit(100_000_000, '억'); if (s) return s; }
  if (n >= 10_000) { const s = unit(10_000, '만'); if (s) return s; }
  return n.toLocaleString();
}

function levelNumberAt(levels: ClockLevel[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index && i < levels.length; i++) if (levels[i].kind === 'level') n++;
  return n;
}
// index 를 받는 이유: DB 의 current_index 가 낡아 있을 수 있어 '실효 인덱스'로 계산해야 한다.
function msToNextBreak(s: ClockState, index: number, remaining: number): number | null {
  const lv = s.config?.levels ?? []; let acc = remaining;
  for (let i = index + 1; i < lv.length; i++) { if (lv[i].kind === 'break') return acc; acc += lv[i].minutes * 60_000; }
  return null;
}
function msToRegClose(s: ClockState, index: number, remaining: number): number | null {
  const lv = s.config?.levels ?? []; const target = s.config?.regCloseLevel ?? 0;
  let acc = remaining, num = 0;
  for (let i = 0; i <= index; i++) if (lv[i]?.kind === 'level') num++;
  if (num >= target) return 0;
  for (let i = index + 1; i < lv.length; i++) { if (lv[i].kind === 'level') { num++; if (num >= target) return acc; } acc += lv[i].minutes * 60_000; }
  return null;
}
/** 경과(RUNNING TIME) — 지난 레벨 합 + 현재 레벨에서 흐른 시간. 레벨 길이를 모르면 null */
function elapsedMs(s: ClockState, index: number, remaining: number): number | null {
  const lv = s.config?.levels ?? []; if (!lv[index]) return null;
  let acc = 0;
  for (let i = 0; i < index; i++) acc += (lv[i]?.minutes ?? 0) * 60_000;
  return acc + Math.max(0, lv[index].minutes * 60_000 - remaining);
}
const gameLabel = (g: ClockState) => (g.gameSeq > 1 ? `사이드${g.gameSeq - 1}` : '메인');

/** 영문 대문자 라벨(국내 매장 클락 관례 · APIS) — 흐린 흰색·넓은 자간 */
const LABEL = 'font-bold uppercase tracking-[0.22em]';

export default function ClockDisplay({ venueId, gameSeq = 1, venueName, onClose }: {
  venueId: string; gameSeq?: number; venueName?: string; onClose: () => void;
}) {
  const [clocks, setClocks] = useState<ClockState[] | null>(null);
  const [sel, setSel] = useState(gameSeq);

  // 클락 테마 — page_config.clockTheme → 루트 CSS 변수(기본 = 아우라 골드).
  // 배경 이미지가 설정돼 있으면 --clk-bg 가 '스크림 + 사진 + 프리셋색' 3층 합성으로 바뀌고 보조 라벨 2단이 함께 올라간다.
  // 캐시 퍼스트(readSnap) + 실패 시 keep-last: 네트워크 블립에 기본 테마로 깜빡이면 안 되는 매장 TV 화면.
  const [clkVars, setClkVars] = useState<Record<string, string>>(
    () => clockThemeVars(readSnap<ClockTheme | null>(clockThemeSnapKey(venueId))),
  );
  useEffect(() => {
    let alive = true;
    setClkVars(clockThemeVars(readSnap<ClockTheme | null>(clockThemeSnapKey(venueId))));
    fetchVenuePageConfig(venueId)
      .then((c) => {
        if (!alive) return;
        const t = sanitizeClockTheme(c?.clockTheme);
        writeSnap(clockThemeSnapKey(venueId), t);
        setClkVars(clockThemeVars(t));
      })
      .catch(() => { /* keep-last */ });
    return () => { alive = false; };
  }, [venueId]);

  const [fs, setFs] = useState(false);
  const [auto, setAuto] = useState(true);          // 멀티게임 자동 순환
  const [qr, setQr] = useState<string | null>(null); // 참가(바인요청) QR
  const [sponsor, setSponsor] = useState<string | null>(null); // 스폰서 배너(app_settings 광고)
  const [elimMsg, setElimMsg] = useState<{ text: string; until: number } | null>(null); // 탈락 티커
  const rootRef = useRef<HTMLDivElement>(null);
  const gamesRef = useRef<ClockState[]>([]);
  const prevElim = useRef<Map<number, number>>(new Map());

  // ⚠ 실패 시 setClocks([]) 로 비우면 순간 끊김 한 번에 매장 TV 가 통째로 빈 화면이 된다 — 마지막 상태를 유지한다.
  const load = () => getVenueClocks(venueId).then(setClocks).catch(() => setClocks((cur) => cur ?? []));
  useEffect(() => { load(); }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => subscribeClock(venueId, load), [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
  // 실시간 구독이 조용히 끊기면(대회장 와이파이) 복구 수단이 없었다 — 30초 폴링 + 복귀 재조회.
  useEffect(() => {
    const t = setInterval(load, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { getAppSetting(CLOCK_AD_KEY).then(setSponsor).catch(() => {}); }, []);

  // 화면 꺼짐 방지(Wake Lock) — 미지원 시 무시
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lock: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Wake Lock API 미지원 브라우저 타입 호환
    const req = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* 미지원/거부 */ } };
    req();
    const onVis = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); try { lock?.release?.(); } catch { /* noop */ } };
  }, []);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFs = () => {
    if (!document.fullscreenElement) rootRef.current?.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const games = (clocks ?? []).slice().sort((a, b) => a.gameSeq - b.gameSeq);
  const g = games.find((c) => c.gameSeq === sel) ?? games.find((c) => c.running) ?? games[0] ?? null;

  const lvls = g?.config?.levels ?? [];
  // 손님 기기라 DB 를 고치지 않고 '지금 진짜 레벨' 을 계산해 표시한다(DB 전진은 운영자 화면 책임).
  const eff = g ? effectiveLevel(g) : null;
  const curIdx = eff ? eff.index : 0;
  const ls = g?.liveStats ?? (g ? {
    entries: g.adjEntries, rebuys: g.adjRebuys, earlies: g.adjEarlies, addons: g.adjAddons,
    alive: Math.max(0, g.adjEntries - g.eliminations), eliminations: g.eliminations, totalStack: 0, avgStack: 0, buyInAmount: null,
  } : null);
  const prizes = (g?.config?.prizes ?? []).filter((p) => p.amount > 0);
  const hasCounts = !!g?.liveStats
    || (!!ls && (ls.entries > 0 || ls.alive > 0 || ls.rebuys > 0 || ls.earlies > 0 || ls.addons > 0 || ls.eliminations > 0));
  const gSeq = g?.gameSeq ?? null;
  const aliveNow = ls?.alive ?? 0;
  const elimNow = g ? (g.liveStats?.eliminations ?? g.eliminations) : 0;
  // BB 병기 — 브레이크 중엔 직전 플레이 레벨의 BB
  let curBB = 0;
  for (let i = curIdx; i >= 0; i--) { const l = lvls[i]; if (l && l.kind === 'level' && l.bb > 0) { curBB = l.bb; break; } }

  useEffect(() => { gamesRef.current = games; }, [games]);

  useEffect(() => {
    if (!auto || games.length < 2) return;
    const t = setInterval(() => {
      const gs = gamesRef.current;
      setSel((cur) => { const i = gs.findIndex((x) => x.gameSeq === cur); return gs[(i + 1) % gs.length]?.gameSeq ?? cur; });
    }, 15000);
    return () => clearInterval(t);
  }, [auto, games.length]);

  useEffect(() => {
    if (gSeq == null) { setQr(null); return; }
    QRCode.toDataURL(buyinRequestUrl(venueId, gSeq), { width: 360, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [venueId, gSeq]);

  useEffect(() => {
    if (gSeq == null) return;
    const prev = prevElim.current.get(gSeq);
    if (prev != null && elimNow > prev) {
      setElimMsg({ text: `방금 ${elimNow - prev}명 탈락 · 남은 ${aliveNow}명`, until: Date.now() + 5000 });
      window.setTimeout(() => setElimMsg((cur) => (cur && Date.now() >= cur.until ? null : cur)), 5200);
    }
    prevElim.current.set(gSeq, elimNow);
  }, [gSeq, elimNow, aliveNow]);

  const showElim = !!elimMsg && Date.now() < elimMsg.until;
  const buyIn = ls?.buyInAmount ?? 0;
  const regLevel = g?.config?.regCloseLevel ?? 0;

  return (
    <div ref={rootRef} className="fixed inset-0 z-[80] flex flex-col text-white select-none"
      style={{ ...clkVars, background: 'var(--clk-bg, #030303)' }}>
      {/* ── 헤더: 매장·게임 타이틀 / RUNNING TIME / 컨트롤(게임 전환·풀스크린·닫기) ── */}
      <header className="flex shrink-0 items-center gap-[1.5vmin] px-[3vmin] pt-[2vmin] pb-[1vmin]">
        <span className={`h-[1.2vmin] w-[1.2vmin] shrink-0 rounded-full ${g?.running ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} aria-hidden />
        <p className="min-w-0 truncate text-[2.8vmin] font-extrabold tracking-tight" style={{ maxWidth: '50vw' }}>
          {venueName || '홀덤 라이브'}
          {(g?.title || g?.config?.title) && <span className="ml-[1.2vmin] font-semibold text-white/60">{g?.title || g?.config?.title}</span>}
        </p>
        {games.length > 1 && (
          <div className="ml-[1vmin] flex shrink-0 items-center gap-1">
            {games.map((c) => (
              <button key={c.gameSeq} type="button" onClick={() => { setSel(c.gameSeq); setAuto(false); }}
                style={c.gameSeq === g?.gameSeq ? { background: 'var(--clk-accent, #E0A94E)' } : undefined}
                className={['rounded-[1vmin] px-[1.6vmin] py-[0.6vmin] text-[1.8vmin] font-bold transition-colors',
                  c.gameSeq === g?.gameSeq ? 'text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'].join(' ')}>
                {gameLabel(c)}{!c.running && <Icon name="pause" aria-label="일시정지" className="ml-[0.6vmin] inline-block h-[1.7vmin] w-[1.7vmin] align-[-0.15em]" />}
              </button>
            ))}
            <button type="button" onClick={() => setAuto((v) => !v)} title="멀티게임 자동 순환"
              className={['rounded-[1vmin] px-[1.6vmin] py-[0.6vmin] text-[1.8vmin] font-bold transition-colors', auto ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/50'].join(' ')}>
              <Icon name="refresh" className="mr-[0.6vmin] inline-block h-[1.7vmin] w-[1.7vmin] align-[-0.15em]" />{auto ? '자동' : '수동'}
            </button>
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-[2vmin]">
          {g && <RunningTime g={g} />}
          <button type="button" onClick={toggleFs} title="전체화면" aria-label="전체화면"
            className="rounded-[1vmin] bg-white/10 px-[1.6vmin] py-[0.8vmin] text-[1.8vmin] font-bold text-white/80 hover:bg-white/20">{fs ? '⤢ 해제' : '⛶ 전체화면'}</button>
          <button type="button" onClick={onClose} title="닫기" aria-label="닫기"
            className="rounded-[1vmin] bg-white/10 px-[1.6vmin] py-[0.8vmin] text-[1.8vmin] font-bold text-white/80 hover:bg-white/20">✕</button>
        </div>
      </header>

      {clocks === null ? (
        <div className="flex flex-1 items-center justify-center text-[3vmin]" style={{ color: 'var(--clk-ink-soft, rgba(255,255,255,.5))' }}>불러오는 중…</div>
      ) : !g ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[2vmin] text-center">
          <p className="text-[4vmin] font-bold text-white/80">진행 중인 클락이 없습니다</p>
          <p className="text-[2.4vmin]" style={{ color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' }}>운영자가 이 매장의 클락을 시작하면 자동으로 표시됩니다</p>
        </div>
      ) : (
        <>
          {showElim && (
            <div className="pointer-events-none absolute left-1/2 top-[8vh] z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-rose-500/90 px-[3vmin] py-[1.1vmin] text-[2.4vmin] font-extrabold text-white shadow-dialog">
              {elimMsg!.text}
            </div>
          )}

          {/* ── 본문 3열: PRIZE POOL · 타이머 · 스탯 ── */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-[2vmin] px-[3vmin] md:grid-cols-[1fr_2.3fr_1fr]">
            {/* 좌: PRIZE POOL — 15위까지, 1위 강조 · 없으면 참가 QR 만 */}
            <div className="hidden min-h-0 flex-col justify-center gap-[1.5vmin] md:flex">
              {prizes.length > 0 && (
                <div className="min-h-0">
                  <p className={`${LABEL} mb-[1vmin] flex items-center gap-[0.8vmin] text-[1.9vmin]`} style={{ color: 'var(--clk-ink-soft, rgba(255,255,255,.5))' }}>
                    <span className="h-[0.7vmin] w-[0.7vmin] rounded-full" style={{ background: 'var(--clk-accent, #E0A94E)' }} aria-hidden />PRIZE POOL
                  </p>
                  <ul className="space-y-[0.35vmin]">
                    {prizes.slice(0, 15).map((p, i) => (
                      <li key={i} className="flex items-baseline gap-[1.6vmin] text-[2.3vmin] leading-tight">
                        <span className="w-[3vmin] shrink-0 text-right tabular-nums font-semibold" style={{ color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' }}>{p.place}</span>
                        <span className={`font-extrabold tabular-nums ${i === 0 ? '' : 'text-white/90'}`} style={i === 0 ? { color: 'var(--clk-accent, #E0A94E)' } : undefined}>
                          {fmtWon(p.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {qr && (
                <div className="flex shrink-0 items-center gap-[1.4vmin]">
                  <img src={qr} alt="참가 바인요청 QR" className="shrink-0 rounded-[0.8vmin] bg-white" style={{ width: 'clamp(56px, 9vmin, 140px)', height: 'auto' }} />
                  <div className="min-w-0">
                    <p className={`${LABEL} text-[1.6vmin] text-emerald-300`}>BUY-IN QR</p>
                    <p className="mt-[0.4vmin] text-[1.7vmin] leading-snug text-white/60">휴대폰으로 찍으면 {gameLabel(g)} 바인을 요청합니다</p>
                  </div>
                </div>
              )}
            </div>

            {/* 중앙 — 초당 틱은 CenterPanel 안에 격리 */}
            <CenterPanel g={g} />

            {/* 우: PLAYERS · BUY-IN · REBUY · ENTRIES · REG CLOSE */}
            <div className="hidden min-h-0 flex-col justify-center gap-[1.6vmin] md:flex">
              <StatRow label="PLAYERS" big value={hasCounts ? String(ls?.alive ?? 0) : '—'} sub={hasCounts ? `/ ${ls?.entries ?? 0}` : undefined} accent />
              <StatRow label="BUY-IN" value={buyIn > 0 ? fmtWon(buyIn) : '—'} />
              <StatRow label="REBUY" value={hasCounts ? String(ls?.rebuys ?? 0) : '—'} />
              <StatRow label="ENTRIES" value={hasCounts ? String(ls?.entries ?? 0) : '—'} />
              <RegCloseRow g={g} regLevel={regLevel} />
            </div>
          </div>

          {/* ── 하단 스트립: TOTAL CHIPS · AVG STACK · NEXT BREAK (+ 모바일 폭에선 PLAYERS·REG CLOSE 도 여기로) ── */}
          <div className="grid shrink-0 grid-cols-3 gap-[1vmin] border-t border-white/[0.06] px-[3vmin] py-[1.4vmin] md:grid-cols-3">
            <BottomStat label="TOTAL CHIPS" value={ls?.totalStack ? ls.totalStack.toLocaleString() : '—'} />
            <BottomStat label="AVG STACK" value={ls?.avgStack ? ls.avgStack.toLocaleString() : '—'} sub={ls?.avgStack && curBB > 0 ? `${Math.round(ls.avgStack / curBB)}BB` : undefined} />
            <NextBreakStat g={g} />
          </div>

          {/* ── 푸터: 매장명 · 스폰서 ── */}
          <div className="flex shrink-0 items-center justify-between gap-[2vmin] px-[3vmin] pb-[1.6vmin] pt-[0.4vmin]">
            <p className="min-w-0 truncate text-[2vmin] font-semibold" style={{ color: 'var(--clk-ink-soft, rgba(255,255,255,.5))' }}>{venueName || ''}</p>
            {sponsor
              ? <img src={sponsor} alt="스폰서" className="w-auto object-contain" style={{ maxHeight: '7vh' }} />
              : <p className={`${LABEL} text-[1.5vmin]`} style={{ color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' }}>Powered by NURI HOLDEM</p>}
          </div>
        </>
      )}
    </div>
  );
}

/** 헤더 우측 RUNNING TIME — 초당 틱은 필요 없다(분 단위 표기). 부모 30초 폴링·실시간 갱신 주기면 충분 */
function RunningTime({ g }: { g: ClockState }) {
  const eff = effectiveLevel(g);
  const ms = elapsedMs(g, eff.index, eff.remainingMs);
  if (ms === null) return null;
  return (
    <p className="hidden items-baseline gap-[1vmin] md:flex">
      <span className={`${LABEL} text-[1.6vmin]`} style={{ color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' }}>Running time</span>
      <span className="text-[2.2vmin] font-extrabold tabular-nums" style={{ color: 'var(--clk-accent, #E0A94E)' }}>{runningLabel(ms)}</span>
    </p>
  );
}

/**
 * CenterPanel — LEVEL · 대형 타이머 · 블라인드 · ANTE · NEXT BREAK TIME.
 * 초당 setInterval 틱을 이 컴포넌트 안에 가둔다(1분 방치 → 타이머 노드 외 리렌더 0회). memo: g 참조가 같으면 건너뛴다.
 */
const CenterPanel = memo(function CenterPanel({ g }: { g: ClockState }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const lvls = g.config?.levels ?? [];
  const eff = effectiveLevel(g);
  const curIdx = eff.index;
  const lv = lvls[curIdx];
  const levelNo = levelNumberAt(lvls, curIdx);
  const isBreak = lv?.kind === 'break';
  const remaining = eff.remainingMs;
  const urgent = !!g.running && remaining <= 60_000 && !isBreak;
  const nextBreak = msToNextBreak(g, curIdx, remaining);
  const next = (() => { for (let i = curIdx + 1; i < lvls.length; i++) if (lvls[i].kind === 'level') return lvls[i]; return null; })();
  return (
    <div className="flex min-h-0 flex-col items-center justify-center text-center">
      {/* LEVEL 알약 — 참조 화면의 금색 테두리 알약 */}
      <p className={`${LABEL} rounded-full border px-[3.2vmin] py-[1vmin] text-[3vmin]`}
        style={{ color: 'var(--clk-accent, #E0A94E)', borderColor: 'color-mix(in srgb, var(--clk-accent, #E0A94E) 45%, transparent)', background: 'rgba(0,0,0,.35)' }}>
        {isBreak ? 'BREAK' : `LEVEL ${levelNo}`}
      </p>
      {/* 타이머 — 순백(참조) · 긴급 rose · 브레이크 sky 는 테마가 못 덮는 잠금 */}
      <p className={`mt-[1.2vmin] font-black leading-none tabular-nums ${urgent ? 'animate-pulse' : ''}`}
        style={{
          fontSize: 'clamp(84px, 27vmin, 420px)', letterSpacing: '-0.02em',
          color: urgent ? 'var(--clk-timer-urgent, #fb7185)' : isBreak ? 'var(--clk-timer-break, #7dd3fc)' : 'var(--clk-timer, #FFFFFF)',
        }}>
        {mmss(Math.max(0, remaining))}
      </p>
      {isBreak ? (
        <>
          <p className="mt-[1vmin] font-extrabold leading-none text-sky-300" style={{ fontSize: 'clamp(28px, 7vmin, 120px)' }}>휴식</p>
          {next && (
            <p className="mt-[1.2vmin] font-bold tabular-nums text-white/60" style={{ fontSize: 'clamp(14px, 2.8vmin, 44px)' }}>
              NEXT {next.sb.toLocaleString()} / {next.bb.toLocaleString()}{next.ante > 0 ? `  ·  ANTE ${next.ante.toLocaleString()}` : ''}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-[1.6vmin] font-extrabold leading-none tabular-nums" style={{ fontSize: 'clamp(30px, 8.5vmin, 150px)', color: 'var(--clk-accent, #E0A94E)' }}>
            {lv ? <>{lv.sb.toLocaleString()}<span className="text-white/30"> / </span>{lv.bb.toLocaleString()}</> : '-'}
          </p>
          {lv && lv.ante > 0 && (
            <p className="mt-[1.4vmin] flex items-baseline gap-[1.4vmin] leading-none">
              <span className={`${LABEL} text-[2.6vmin]`} style={{ color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' }}>Ante</span>
              <span className="font-extrabold tabular-nums text-white" style={{ fontSize: 'clamp(20px, 4.6vmin, 80px)' }}>{lv.ante.toLocaleString()}</span>
            </p>
          )}
        </>
      )}
      {!g.running && (
        <p className="mt-[1.6vmin] flex items-center justify-center gap-[0.8vmin] text-[2.6vmin] font-bold text-amber-400">
          <Icon name="pause" className="h-[2.6vmin] w-[2.6vmin]" aria-hidden />일시정지
        </p>
      )}
      {nextBreak !== null && !isBreak && (
        <p className={`${LABEL} mt-[2.4vmin] text-[2.6vmin] text-rose-400`}>Next break time</p>
      )}
    </div>
  );
});

function StatRow({ label, value, sub, big, accent }: { label: string; value: string; sub?: string; big?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-[1.4vmin] border-b border-white/[0.06] pb-[1.2vmin]">
      <span className={`${LABEL} text-[1.9vmin]`} style={{ color: 'var(--clk-ink-soft, rgba(255,255,255,.5))' }}>{label}</span>
      <span className="flex items-baseline gap-[0.8vmin]">
        <span className="font-extrabold tabular-nums leading-none" style={{ fontSize: big ? 'clamp(28px, 6vmin, 96px)' : 'clamp(18px, 3.4vmin, 56px)', color: accent ? 'var(--clk-accent, #E0A94E)' : '#FFFFFF' }}>{value}</span>
        {sub && <span className="text-[2.2vmin] font-semibold tabular-nums" style={{ color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' }}>{sub}</span>}
      </span>
    </div>
  );
}

/** REG CLOSE — 마감 레벨 + 남은 시간(초록) · 마감이면 CLOSED(적) · 미설정이면 행 생략 */
function RegCloseRow({ g, regLevel }: { g: ClockState; regLevel: number }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (regLevel <= 0) return null;
  const eff = effectiveLevel(g);
  const ms = msToRegClose(g, eff.index, eff.remainingMs);
  const closed = ms === 0;
  return (
    <div className="flex items-baseline justify-between gap-[1.4vmin]">
      <span className={`${LABEL} text-[1.9vmin]`} style={{ color: 'var(--clk-ink-soft, rgba(255,255,255,.5))' }}>Reg close</span>
      <span className={`font-extrabold tabular-nums leading-none ${closed ? 'text-rose-400' : 'text-emerald-400'}`} style={{ fontSize: 'clamp(16px, 2.8vmin, 44px)' }}>
        {ms === null ? '—' : closed ? 'CLOSED' : `Lv${regLevel} · ${hms(ms)}`}
      </span>
    </div>
  );
}

function BottomStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center">
      <p className={`${LABEL} text-[1.6vmin]`} style={{ color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' }}>{label}</p>
      <p className="mt-[0.6vmin] flex items-baseline justify-center gap-[0.8vmin]">
        <span className="font-extrabold tabular-nums leading-none text-white" style={{ fontSize: 'clamp(18px, 3.8vmin, 60px)' }}>{value}</span>
        {sub && <span className="text-[2vmin] font-semibold tabular-nums" style={{ color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' }}>· {sub}</span>}
      </p>
    </div>
  );
}

/** NEXT BREAK 카운트다운(적) — 초당 틱은 이 셀 안에만 */
function NextBreakStat({ g }: { g: ClockState }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const eff = effectiveLevel(g);
  const ms = msToNextBreak(g, eff.index, eff.remainingMs);
  return (
    <div className="text-center">
      <p className={`${LABEL} text-[1.6vmin]`} style={{ color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' }}>Next break</p>
      <p className={`mt-[0.6vmin] font-extrabold tabular-nums leading-none ${ms === null ? 'text-white/40' : 'text-rose-400'}`} style={{ fontSize: 'clamp(18px, 3.8vmin, 60px)' }}>
        {ms === null ? '—' : hms(ms)}
      </p>
    </div>
  );
}
