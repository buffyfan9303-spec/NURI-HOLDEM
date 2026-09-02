// src/components/features/clock/ClockDisplay.tsx
// 관전 / 대형 디스플레이 모드 — 매장 TV·빔프로젝터용 읽기전용 풀스크린.
// 진입: 라이브 카드 '큰 화면' / 운영자 클락 'TV 송출' / 딥링크 ?display=<venueId>&g=<gameSeq>.
// 실시간: subscribeClock 으로 레벨 전환·통계 즉시 반영 + 1초 로컬 틱(숨김/복귀해도 endsAt 기준 정확).
// 읽기전용(컨트롤 없음) — 운영은 운영자 클락 화면·휴대폰 리모컨(?remote=)에서. 화면 항상 켜둠(Wake Lock, 베스트에포트).
//
// 2026-09-02 v3 'NURI 아우라'(오너 승인 — APIS 화면 복제 대신 손님이 TV 를 올려다보는 이유부터 다시 잡았다):
//   상단  매장·게임 / 레지 마감 · 휴식까지
//   본문  좌 프라이즈(순위별 금액 + 총 프라이즈, 없으면 열이 접힘) · 중앙 레벨/타이머/블라인드/ANTE/다음 블라인드 · 우 생존·평균 스택·총 칩·리바이·바이인
//   하단  바인 QR(작게) · 스폰서 · Powered by
//   뺀 것: RUNNING TIME(손님에게 쓸모 없음 — 오퍼레이터 화면에만) · 탈락 티커 · 영문 대문자 라벨(ANTE 만 관례대로 영문 — 오너 지시).
//   색: 타이머 순백 · 레벨/블라인드 = 테마 accent(기본 인디고) · 골드는 프라이즈 금액에만(--clk-prize 잠금).
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
const gameLabel = (g: ClockState) => (g.gameSeq > 1 ? `사이드${g.gameSeq - 1}` : '메인');

/** 한국어 라벨 — 흐린 흰색·자간 살짝. 영문 대문자 관례는 ANTE 하나만(오너 지시) */
const LABEL = 'font-bold tracking-[0.08em]';
const DIM = { color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' } as const;
const SOFT = { color: 'var(--clk-ink-soft, rgba(255,255,255,.5))' } as const;

export default function ClockDisplay({ venueId, gameSeq = 1, venueName, onClose }: {
  venueId: string; gameSeq?: number; venueName?: string; onClose: () => void;
}) {
  const [clocks, setClocks] = useState<ClockState[] | null>(null);
  const [sel, setSel] = useState(gameSeq);

  // 클락 테마 — page_config.clockTheme → 루트 CSS 변수(기본 = 아우라).
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
  const rootRef = useRef<HTMLDivElement>(null);
  const gamesRef = useRef<ClockState[]>([]);

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
  const totalPrize = prizes.reduce((s, p) => s + p.amount, 0);
  const hasCounts = !!g?.liveStats
    || (!!ls && (ls.entries > 0 || ls.alive > 0 || ls.rebuys > 0 || ls.earlies > 0 || ls.addons > 0 || ls.eliminations > 0));
  const gSeq = g?.gameSeq ?? null;
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

  const buyIn = ls?.buyInAmount ?? 0;
  const regLevel = g?.config?.regCloseLevel ?? 0;
  const showRebuy = hasCounts && ((ls?.rebuys ?? 0) > 0 || (ls?.addons ?? 0) > 0 || !!g?.config?.isAddon);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[80] flex flex-col text-white select-none"
      style={{ ...clkVars, background: 'var(--clk-bg, #06080F)' }}>
      {/* ── 상단: 매장·게임 / 레지 마감 · 휴식까지 / 컨트롤(게임 전환·풀스크린·닫기) ── */}
      <header className="flex shrink-0 items-center gap-[1.5vmin] px-[3vmin] pt-[2vmin] pb-[1vmin]">
        <span className={`h-[1.2vmin] w-[1.2vmin] shrink-0 rounded-full ${g?.running ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} aria-hidden />
        <p className="min-w-0 truncate text-[2.8vmin] font-extrabold tracking-tight" style={{ maxWidth: '46vw' }}>
          {venueName || '홀덤 라이브'}
          {(g?.title || g?.config?.title) && <span className="ml-[1.2vmin] font-medium" style={SOFT}>{g?.title || g?.config?.title}</span>}
        </p>
        {games.length > 1 && (
          <div className="ml-[1vmin] flex shrink-0 items-center gap-1">
            {games.map((c) => (
              <button key={c.gameSeq} type="button" onClick={() => { setSel(c.gameSeq); setAuto(false); }}
                style={c.gameSeq === g?.gameSeq ? { background: 'color-mix(in srgb, var(--clk-accent, #818CF8) 24%, transparent)', borderColor: 'color-mix(in srgb, var(--clk-accent, #818CF8) 55%, transparent)' } : undefined}
                className={['rounded-[1vmin] border px-[1.6vmin] py-[0.6vmin] text-[1.8vmin] font-bold transition-colors',
                  c.gameSeq === g?.gameSeq ? 'text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/15'].join(' ')}>
                {gameLabel(c)}{!c.running && <Icon name="pause" aria-label="일시정지" className="ml-[0.6vmin] inline-block h-[1.7vmin] w-[1.7vmin] align-[-0.15em]" />}
              </button>
            ))}
            <button type="button" onClick={() => setAuto((v) => !v)} title="멀티게임 자동 순환"
              className={['rounded-[1vmin] px-[1.6vmin] py-[0.6vmin] text-[1.8vmin] font-bold transition-colors', auto ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/50'].join(' ')}>
              <Icon name="refresh" className="mr-[0.6vmin] inline-block h-[1.7vmin] w-[1.7vmin] align-[-0.15em]" />{auto ? '자동' : '수동'}
            </button>
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-[2.4vmin]">
          {g && <HeaderTimes g={g} regLevel={regLevel} />}
          <button type="button" onClick={toggleFs} title="전체화면" aria-label="전체화면"
            className="rounded-[1vmin] bg-white/10 px-[1.6vmin] py-[0.8vmin] text-[1.8vmin] font-bold text-white/80 hover:bg-white/20">{fs ? '⤢ 해제' : '⛶ 전체화면'}</button>
          <button type="button" onClick={onClose} title="닫기" aria-label="닫기"
            className="rounded-[1vmin] bg-white/10 px-[1.6vmin] py-[0.8vmin] text-[1.8vmin] font-bold text-white/80 hover:bg-white/20">✕</button>
        </div>
      </header>

      {clocks === null ? (
        <div className="flex flex-1 items-center justify-center text-[3vmin]" style={SOFT}>불러오는 중…</div>
      ) : !g ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[2vmin] text-center">
          <p className="text-[4vmin] font-bold text-white/80">진행 중인 클락이 없습니다</p>
          <p className="text-[2.4vmin]" style={DIM}>운영자가 이 매장의 클락을 시작하면 자동으로 표시됩니다</p>
        </div>
      ) : (
        <>
          {/* ── 본문: 프라이즈(있을 때만) · 타이머 · 스탯 — 프라이즈가 없으면 열이 접히고 중앙이 넓어진다 ── */}
          <div className={['grid min-h-0 flex-1 grid-cols-1 gap-[2vmin] px-[3vmin]', prizes.length > 0 ? 'md:grid-cols-[1fr_2.1fr_1fr]' : 'md:grid-cols-[2.1fr_1fr]'].join(' ')}>
            {prizes.length > 0 && (
              <div className="hidden min-h-0 flex-col justify-center md:flex">
                <p className={`${LABEL} mb-[1.2vmin] text-[1.7vmin]`} style={SOFT}>프라이즈</p>
                <ul className="space-y-[0.4vmin]">
                  {prizes.slice(0, 12).map((p, i) => (
                    <li key={i} className={`flex items-baseline justify-between gap-[1.6vmin] leading-tight ${i === 0 ? 'text-[2.6vmin]' : 'text-[2.1vmin]'}`}>
                      <span className="shrink-0 font-semibold tabular-nums" style={DIM}>{/^\d+$/.test(p.place) ? `${p.place}위` : p.place}</span>
                      <span className="font-extrabold tabular-nums" style={{ color: 'var(--clk-prize, #F5C451)' }}>{p.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-[1vmin] flex items-baseline justify-between border-t border-white/10 pt-[0.8vmin]">
                  <span className={`${LABEL} text-[1.6vmin]`} style={SOFT}>총 프라이즈</span>
                  <span className="text-[2.8vmin] font-black tabular-nums" style={{ color: 'var(--clk-prize, #F5C451)' }}>{totalPrize.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* 중앙 — 초당 틱은 CenterPanel 안에 격리 */}
            <CenterPanel g={g} />

            {/* 우: 생존/엔트리 · 평균 스택 · 총 칩 · 리바이/애드온 · 바이인 */}
            <div className="hidden min-h-0 flex-col justify-center gap-[1.6vmin] md:flex">
              <StatRow label="생존 / 엔트리" big value={hasCounts ? String(ls?.alive ?? 0) : '—'} sub={hasCounts ? `/ ${ls?.entries ?? 0}` : undefined} />
              <StatRow label="평균 스택" value={ls?.avgStack ? ls.avgStack.toLocaleString() : '—'} sub={ls?.avgStack && curBB > 0 ? `${Math.round(ls.avgStack / curBB)} BB` : undefined} />
              <StatRow label="총 칩" value={ls?.totalStack ? ls.totalStack.toLocaleString() : '—'} />
              {showRebuy && <StatRow label="리바이 · 애드온" value={String(ls?.rebuys ?? 0)} sub={`· ${ls?.addons ?? 0}`} />}
              {buyIn > 0 && <StatRow label="바이인" value={buyIn.toLocaleString()} />}
            </div>

            {/* 모바일 폭(세로 폰으로 관전) — 우측 열·상단 시각이 숨으니 핵심 4개만 아래에 */}
            <div className="grid shrink-0 grid-cols-2 gap-[1.2vmin] border-t border-white/[0.06] py-[1.4vmin] md:hidden">
              <MiniStat label="생존 / 엔트리" value={hasCounts ? `${ls?.alive ?? 0} / ${ls?.entries ?? 0}` : '—'} />
              <MiniStat label="평균 스택" value={ls?.avgStack ? `${ls.avgStack.toLocaleString()}${curBB > 0 ? ` · ${Math.round(ls.avgStack / curBB)} BB` : ''}` : '—'} />
              <HeaderTimes g={g} regLevel={regLevel} compact />
            </div>
          </div>

          {/* ── 하단: 바인 QR(작게) · 스폰서 · Powered by ── */}
          <div className="flex shrink-0 items-center justify-between gap-[2vmin] border-t border-white/[0.06] px-[3vmin] pb-[1.6vmin] pt-[1.2vmin]">
            {qr ? (
              <div className="flex min-w-0 items-center gap-[1.2vmin]">
                <img src={qr} alt="참가 바인요청 QR" className="shrink-0 rounded-[0.6vmin] bg-white" style={{ width: 'clamp(44px, 7vmin, 110px)', height: 'auto' }} />
                <div className="min-w-0">
                  <p className={`${LABEL} text-[1.4vmin]`} style={SOFT}>바인 QR</p>
                  <p className="mt-[0.3vmin] text-[1.5vmin] leading-snug" style={DIM}>휴대폰으로 찍으면 {gameLabel(g)} 바인을 요청합니다</p>
                </div>
              </div>
            ) : <span />}
            {sponsor && <img src={sponsor} alt="스폰서" className="w-auto object-contain" style={{ maxHeight: '7vh' }} />}
            <p className="shrink-0 text-[1.3vmin] font-extrabold uppercase tracking-[0.18em]" style={DIM}>
              Powered by <span style={{ color: 'var(--clk-accent, #818CF8)' }}>NURI HOLDEM</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * HeaderTimes — 레지 마감 · 휴식까지. 초당 틱은 여기 안에만(부모 리렌더 0).
 * 마감 레벨 미설정(null)은 행 자체를 숨긴다 — 예전엔 null 을 '마감'으로 보여줘 정반대였다.
 * compact = 모바일 폭 하단 미니 스탯 칸에 들어가는 형태.
 */
function HeaderTimes({ g, regLevel, compact }: { g: ClockState; regLevel: number; compact?: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const eff = effectiveLevel(g);
  const reg = regLevel > 0 ? msToRegClose(g, eff.index, eff.remainingMs) : null;
  const brk = msToNextBreak(g, eff.index, eff.remainingMs);
  const regText = reg === null ? null : reg === 0 ? '마감' : `Lv ${regLevel} · ${hms(reg)}`;
  if (compact) {
    return (
      <>
        <MiniStat label="레지 마감" value={regText ?? '—'} tone={reg === 0 ? 'rose' : undefined} />
        <MiniStat label="휴식까지" value={brk === null ? '—' : hms(brk)} tone={brk === null ? undefined : 'rose'} />
      </>
    );
  }
  if (regText === null && brk === null) return null;
  return (
    <div className="hidden items-baseline gap-[2.4vmin] text-right md:flex">
      {regText !== null && (
        <p>
          <span className={`${LABEL} block text-[1.4vmin]`} style={DIM}>레지 마감</span>
          <span className={`text-[2.2vmin] font-extrabold tabular-nums ${reg === 0 ? 'text-rose-400' : 'text-white'}`}>{regText}</span>
        </p>
      )}
      {brk !== null && (
        <p>
          <span className={`${LABEL} block text-[1.4vmin]`} style={DIM}>휴식까지</span>
          <span className="text-[2.2vmin] font-extrabold tabular-nums text-rose-400">{hms(brk)}</span>
        </p>
      )}
    </div>
  );
}

/**
 * CenterPanel — 레벨 · 대형 타이머 · 블라인드 · ANTE · 다음 블라인드.
 * 초당 setInterval 틱을 이 컴포넌트 안에 가둔다(1분 방치 → 타이머 노드 외 리렌더 0회). memo: g 참조가 같으면 건너뛴다.
 * data-testid clk-level / clk-timer 는 e2e(clock-catchup) 앵커 — 라벨 문구를 바꿔도 이 id 는 유지한다.
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
  const next = (() => { for (let i = curIdx + 1; i < lvls.length; i++) if (lvls[i].kind === 'level') return lvls[i]; return null; })();
  return (
    <div className="flex min-h-0 flex-col items-center justify-center text-center">
      {/* 레벨 알약 — 테마 accent 테두리·틴트 */}
      <p data-testid="clk-level" className="rounded-full border px-[3vmin] py-[0.9vmin] text-[2.6vmin] font-extrabold tracking-[0.18em]"
        style={{
          color: 'var(--clk-accent, #818CF8)',
          borderColor: 'color-mix(in srgb, var(--clk-accent, #818CF8) 55%, transparent)',
          background: 'color-mix(in srgb, var(--clk-accent, #818CF8) 14%, transparent)',
        }}>
        {isBreak ? '휴식' : `레벨 ${levelNo}`}
      </p>
      {/* 타이머 — 순백 · 긴급 rose · 브레이크 sky 는 테마가 못 덮는 잠금 */}
      <p data-testid="clk-timer" className={`mt-[1.2vmin] font-black leading-none tabular-nums ${urgent ? 'animate-pulse' : ''}`}
        style={{
          fontSize: 'clamp(84px, 27vmin, 420px)', letterSpacing: '-0.02em',
          color: urgent ? 'var(--clk-timer-urgent, #fb7185)' : isBreak ? 'var(--clk-timer-break, #7dd3fc)' : 'var(--clk-timer, #FFFFFF)',
          textShadow: '0 0 4vmin color-mix(in srgb, var(--clk-accent, #818CF8) 28%, transparent)',
        }}>
        {mmss(Math.max(0, remaining))}
      </p>
      {isBreak ? (
        <>
          <p className="mt-[1vmin] font-extrabold leading-none text-sky-300" style={{ fontSize: 'clamp(28px, 7vmin, 120px)' }}>{lv?.label || '휴식 시간'}</p>
          {next && (
            <p className="mt-[1.4vmin] font-semibold tabular-nums" style={{ fontSize: 'clamp(14px, 2.6vmin, 44px)', ...SOFT }}>
              다음 <b className="font-extrabold text-white/85">{next.sb.toLocaleString()} / {next.bb.toLocaleString()}</b>{next.ante > 0 ? ` · ANTE ${next.ante.toLocaleString()}` : ''}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-[1.4vmin] font-extrabold leading-none tabular-nums" style={{ fontSize: 'clamp(30px, 8.5vmin, 150px)', color: 'var(--clk-accent, #818CF8)' }}>
            {lv ? <>{lv.sb.toLocaleString()}<span className="text-white/25"> / </span>{lv.bb.toLocaleString()}</> : '-'}
          </p>
          {lv && lv.ante > 0 && (
            <p className="mt-[1.2vmin] flex items-baseline gap-[1.2vmin] leading-none">
              <span className="text-[2.2vmin] font-bold uppercase tracking-[0.18em]" style={DIM}>Ante</span>
              <span className="font-extrabold tabular-nums text-white" style={{ fontSize: 'clamp(20px, 4.4vmin, 80px)' }}>{lv.ante.toLocaleString()}</span>
            </p>
          )}
          {next && (
            <p className="mt-[1.8vmin] font-semibold tabular-nums" style={{ fontSize: 'clamp(13px, 2.4vmin, 40px)', ...SOFT }}>
              다음 <b className="font-extrabold text-white/85">{next.sb.toLocaleString()} / {next.bb.toLocaleString()}</b>{next.ante > 0 ? ` · ANTE ${next.ante.toLocaleString()}` : ''}
            </p>
          )}
        </>
      )}
      {!g.running && (
        <p className="mt-[1.6vmin] flex items-center justify-center gap-[0.8vmin] text-[2.6vmin] font-bold text-amber-400">
          <Icon name="pause" className="h-[2.6vmin] w-[2.6vmin]" aria-hidden />일시정지
        </p>
      )}
    </div>
  );
});

function StatRow({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-[1.4vmin] border-b border-white/[0.08] pb-[1.1vmin]">
      <span className={`${LABEL} text-[1.7vmin]`} style={SOFT}>{label}</span>
      <span className="flex items-baseline gap-[0.7vmin]">
        <span className="font-extrabold tabular-nums leading-none text-white" style={{ fontSize: big ? 'clamp(28px, 6vmin, 96px)' : 'clamp(18px, 3.2vmin, 52px)' }}>{value}</span>
        {sub && <span className="text-[2vmin] font-semibold tabular-nums" style={DIM}>{sub}</span>}
      </span>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'rose' }) {
  return (
    <div className="text-center">
      <p className={`${LABEL} text-[1.4vmin]`} style={DIM}>{label}</p>
      <p className={`mt-[0.4vmin] font-extrabold tabular-nums leading-none ${tone === 'rose' ? 'text-rose-400' : 'text-white'}`} style={{ fontSize: 'clamp(16px, 3.2vmin, 48px)' }}>{value}</p>
    </div>
  );
}
