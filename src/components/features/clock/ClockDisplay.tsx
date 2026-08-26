// src/components/features/clock/ClockDisplay.tsx
// 관전 / 대형 디스플레이 모드 — 매장 TV·빔프로젝터용 읽기전용 풀스크린.
//   큰 타이머 + 레벨/블라인드/앤티 + 다음 브레이크·등록마감 + 라이브 통계(엔트리·생존·평균스택) + 상금 보드.
// 진입: 라이브 카드 '📺 큰 화면' / 운영자 클락 'TV 송출' / 딥링크 ?display=<venueId>&g=<gameSeq>.
// 실시간: subscribeClock 으로 레벨 전환·통계 즉시 반영 + 1초 로컬 틱(숨김/복귀해도 endsAt 기준 정확).
// 읽기전용(컨트롤 없음) — 운영은 운영자 클락 화면에서. 화면 항상 켜둠(Wake Lock, 베스트에포트).
import { memo, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { getVenueClocks, subscribeClock, effectiveLevel, type ClockState, type ClockLevel } from '../../../api/clock';
import { buyinRequestUrl } from '../../../api/ledger';
import { getAppSetting, CLOCK_AD_KEY } from '../../../api/settings';
import { fetchVenuePageConfig } from '../../../api/rankings';
import { readSnap, writeSnap } from '../../../lib/snapshot';
import { clockThemeVars, sanitizeClockTheme, clockThemeSnapKey, type ClockTheme } from './clockTheme';

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

export default function ClockDisplay({ venueId, gameSeq = 1, venueName, onClose }: {
  venueId: string; gameSeq?: number; venueName?: string; onClose: () => void;
}) {
  const [clocks, setClocks] = useState<ClockState[] | null>(null);
  const [sel, setSel] = useState(gameSeq);

  // 클락 테마 v1 — page_config.clockTheme → 루트 CSS 변수(모든 변수 기본값 = 현행 하드코딩 1:1).
  // 캐시 퍼스트(readSnap) + 실패 시 keep-last: 네트워크 블립에 기본 테마로 깜빡이면 안 되는 매장 TV 화면.
  const [clkVars, setClkVars] = useState<Record<string, string>>(
    () => clockThemeVars(readSnap<ClockTheme | null>(clockThemeSnapKey(venueId))),
  );
  useEffect(() => {
    let alive = true;
    // venue 전환 시 그 venue 의 캐시로 즉시 페인트(없으면 기본 룩)
    setClkVars(clockThemeVars(readSnap<ClockTheme | null>(clockThemeSnapKey(venueId))));
    fetchVenuePageConfig(venueId)
      .then((c) => {
        if (!alive) return;
        const t = sanitizeClockTheme(c?.clockTheme); // 성공 응답의 '테마 없음(null)'도 정답 — 캐시에 반영
        writeSnap(clockThemeSnapKey(venueId), t);
        setClkVars(clockThemeVars(t));
      })
      .catch(() => { /* keep-last — 직전 테마 유지 */ });
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

  // ⚠ 실패 시 setClocks([]) 로 비우면 순간 끊김 한 번에 매장 TV 가 통째로 빈 화면이 된다.
  //   이 화면은 손님이 보는 읽기전용 TV 라 '다시 시도' 버튼을 띄워도 누를 사람이 없다 —
  //   여기서 옳은 답은 실패를 드러내는 게 아니라 '마지막으로 알던 상태를 계속 보여주는 것'이다.
  //   (아직 한 번도 못 받았을 때만 빈 배열로 확정해 로딩 문구가 영원히 남지 않게 한다)
  const load = () => getVenueClocks(venueId).then(setClocks).catch(() => setClocks((cur) => cur ?? []));
  useEffect(() => { load(); }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => subscribeClock(venueId, load), [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
  // 실시간 구독이 조용히 끊기면(대회장 와이파이·지하 매장에서 흔하다) 복구 수단이 없었다.
  // 라이브 탭이 이미 쓰고 있는 30초 폴링 + 복귀 재조회를 그대로 이식한다.
  useEffect(() => {
    const t = setInterval(load, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
  // (초당 틱은 CenterPanel 내부로 격리 — 아래 CenterPanel 주석 참고)

  // 스폰서 배너 — 운영자가 등록한 전역 클락 광고 이미지(app_settings) 재사용
  useEffect(() => { getAppSetting(CLOCK_AD_KEY).then(setSponsor).catch(() => {}); }, []);

  // 화면 꺼짐 방지(Wake Lock) — TV/태블릿에 띄워두면 절전으로 꺼지지 않게(미지원 시 무시)
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
  // DB 행이 낡아 있어도(운영자 기기가 아무도 전진을 쓰지 못한 상태) '지금 진짜 레벨'을 계산해 표시한다.
  // 왜 여기서 DB를 고치지 않나: 이 화면은 손님 기기(매장 TV·?display= 딥링크)라 clock_states 쓰기 권한
  // (RLS can_access_ledger)이 없고, 있어서도 안 된다. 표시는 여기서, DB 전진은 운영자 화면이 책임진다.
  // (레벨·타이머·카운트다운 파생값은 CenterPanel 내부로 이사 — 초당 틱 격리.
  //  부모에는 BB 병기 계산에 쓰는 curIdx 만 남긴다: 30초 폴링·실시간 갱신 주기로 충분한 값이다.)
  const eff = g ? effectiveLevel(g) : null;
  const curIdx = eff ? eff.index : 0;
  const ls = g?.liveStats ?? (g ? {
    entries: g.adjEntries, rebuys: g.adjRebuys, earlies: g.adjEarlies, addons: g.adjAddons,
    alive: Math.max(0, g.adjEntries - g.eliminations), eliminations: g.eliminations, totalStack: 0, avgStack: 0, buyInAmount: null,
  } : null);
  const prizes = (g?.config?.prizes ?? []).filter((p) => p.amount > 0);
  const gSeq = g?.gameSeq ?? null;
  const aliveNow = ls?.alive ?? 0;
  const elimNow = g ? (g.liveStats?.eliminations ?? g.eliminations) : 0;

  // 최신 games 를 ref 에 동기화(인터벌 콜백에서 stale 없이 참조) — 렌더 중 수정 금지라 effect 로
  useEffect(() => { gamesRef.current = games; }, [games]);

  // 멀티게임 자동 순환 — auto && 게임 2개+ 일 때 15초마다 다음 게임으로
  useEffect(() => {
    if (!auto || games.length < 2) return;
    const t = setInterval(() => {
      const gs = gamesRef.current;
      setSel((cur) => { const i = gs.findIndex((x) => x.gameSeq === cur); return gs[(i + 1) % gs.length]?.gameSeq ?? cur; });
    }, 15000);
    return () => clearInterval(t);
  }, [auto, games.length]);

  // 참가(바인요청) QR — 선택 게임 기준 ?buyin=<venue>&game=<seq>. 손님이 스캔 → 운영자 승인 대기
  useEffect(() => {
    if (gSeq == null) { setQr(null); return; }
    QRCode.toDataURL(buyinRequestUrl(venueId, gSeq), { width: 360, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [venueId, gSeq]);

  // 탈락 티커 — 선택 게임의 eliminations 가 늘면 5초간 배너(게임별 이전값 추적으로 전환 시 오발동 방지)
  useEffect(() => {
    if (gSeq == null) return;
    const prev = prevElim.current.get(gSeq);
    if (prev != null && elimNow > prev) {
      setElimMsg({ text: `💥 방금 ${elimNow - prev}명 탈락 · 남은 ${aliveNow}명`, until: Date.now() + 5000 });
      // 만료를 렌더 틱에만 맡기면 틱이 뜸한 화면에서 최대 수십 초 잔류 — 명시 해제
      window.setTimeout(() => setElimMsg((cur) => (cur && Date.now() >= cur.until ? null : cur)), 5200);
    }
    prevElim.current.set(gSeq, elimNow);
  }, [gSeq, elimNow, aliveNow]);

  const showElim = !!elimMsg && Date.now() < elimMsg.until;

  return (
    // 배경·강조색은 테마 변수 — 기본값이 곧 기존 하드코딩(bg-[#06080B] · accent-300)이라 무테마 룩 불변
    <div ref={rootRef} className="fixed inset-0 z-[80] flex flex-col text-white select-none"
      style={{ ...clkVars, background: 'var(--clk-bg, #06080B)' }}>
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
              <button key={c.gameSeq} type="button" onClick={() => { setSel(c.gameSeq); setAuto(false); }}
                style={c.gameSeq === g?.gameSeq ? { background: 'var(--clk-accent, #5E6AD2)' } : undefined}
                className={['rounded-full px-[1.6vmin] py-[0.6vmin] text-[1.8vmin] font-bold transition-colors',
                  c.gameSeq === g?.gameSeq ? 'text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'].join(' ')}>
                {gameLabel(c)}{c.running ? '' : ' ⏸'}
              </button>
            ))}
            <button type="button" onClick={() => setAuto((v) => !v)} title="멀티게임 자동 순환"
              className={['rounded-full px-[1.6vmin] py-[0.6vmin] text-[1.8vmin] font-bold transition-colors', auto ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/50 hover:bg-white/20'].join(' ')}>
              🔄 {auto ? '자동' : '수동'}
            </button>
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
          {/* 탈락 티커 — eliminations 증가 시 5초 플래시 배너 */}
          {showElim && (
            <div className="pointer-events-none absolute left-1/2 top-[8vh] z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-rose-500/90 px-[3vmin] py-[1.1vmin] text-[2.8vmin] font-extrabold text-white shadow-2xl animate-fade-in">
              {elimMsg!.text}
            </div>
          )}
          {/* 본문 — 좌: 레벨/타이머(주역), 우: 상금 보드 + 참가 QR */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-[2vmin] px-[2.5vmin] lg:grid-cols-[1.7fr_1fr]">
            {/* 타이머 영역 — 초당 틱은 CenterPanel 안에 격리(타이머 외 리렌더 0) */}
            <CenterPanel g={g} />

            {/* 우측: 상금 보드(리더보드) + 참가 QR */}
            <div className="flex min-h-0 flex-col justify-center gap-[1.5vmin]">
              {prizes.length > 0 && (
                <div className="min-h-0 overflow-hidden rounded-[2vmin] border border-accent-300/25 bg-accent-300/[0.06] p-[1.8vmin]">
                  <p className="mb-[1vmin] text-[2.4vmin] font-bold text-gold-300">🏆 상금</p>
                  <ul className="space-y-[0.5vmin]">
                    {prizes.slice(0, 8).map((p, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-[0.5vmin] last:border-0">
                        <span className="text-[2.5vmin] font-bold text-white/85">{p.place}</span>
                        {/* 원 단위 오입력(1,000,000)도 '만' 기준으로 환산 표시 — 순위 자동채움과 동일 휴리스틱 */}
                        <span className="text-[2.7vmin] font-extrabold tabular-nums" style={{ color: 'var(--clk-accent, #5E6AD2)' }}>{(p.amount >= 10000 ? Math.round(p.amount / 10000) : p.amount).toLocaleString()}<span className="text-[1.7vmin] font-bold text-white/50">만</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* 참가 QR — 손님이 스캔하면 이 게임 바인(참가) 요청 → 운영자 승인 */}
              {qr && (
                <div className="flex shrink-0 items-center gap-[2vmin] rounded-[2vmin] border border-emerald-400/25 bg-emerald-400/[0.06] p-[1.6vmin]">
                  <img src={qr} alt="참가 바인요청 QR" className="shrink-0 rounded-[1vmin] bg-white" style={{ width: 'clamp(72px, 13vmin, 190px)', height: 'auto' }} />
                  <div className="min-w-0">
                    <p className="text-[2.4vmin] font-extrabold text-emerald-300">📲 스캔해서 참가</p>
                    <p className="mt-[0.5vmin] text-[1.9vmin] leading-snug text-white/65">휴대폰으로 QR을 찍으면 {g ? gameLabel(g) : ''} 바인(참가)을 요청합니다.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 하단 통계 스트립 — 관전자 1순위 질문은 '몇 명 남았나'다. 탈락 티커 5초로만
              스치던 생존/엔트리를 첫 칸·강조로 상시 표시(운영자 클락 PLAYERS hero와 동일 사상). */}
          <div className="grid shrink-0 grid-cols-3 gap-px bg-white/5 px-[2.5vmin] py-[1.5vmin] sm:grid-cols-5">
            <BigStat label="생존 / 엔트리" value={`${ls?.alive ?? 0} / ${ls?.entries ?? 0}`} accent />
            <BigStat label="리바인" value={`${ls?.rebuys ?? 0}`} />
            <BigStat label="얼리" value={`${ls?.earlies ?? 0}`} />
            <BigStat label="평균 스택" value={ls?.avgStack ? `${ls.avgStack.toLocaleString()}${(() => {
              // BB 병기(실물 ②·④) — 브레이크 중엔 직전 플레이 레벨의 BB
              for (let i = curIdx; i >= 0; i--) { const l = lvls[i]; if (l && l.kind === 'level' && l.bb > 0) return ` (${Math.round((ls.avgStack) / l.bb)}BB)`; }
              return '';
            })()}` : '-'} accent />
            <BigStat label="총 스택" value={ls?.totalStack ? ls.totalStack.toLocaleString() : '-'} />
          </div>

          {/* 스폰서 배너 — 운영자 등록 광고 이미지(있을 때만) */}
          {sponsor && (
            <div className="flex shrink-0 items-center justify-center border-t border-white/5 bg-black/40 py-[0.8vmin]">
              <img src={sponsor} alt="스폰서" className="w-auto object-contain" style={{ maxHeight: '9vh' }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * CenterPanel — 레벨·블라인드·대형 타이머·브레이크/등록마감 카운트다운.
 *
 * 초당 setInterval 틱을 이 컴포넌트 **안에** 가둔다(마스터 지시서 Phase 11 검증:
 * "1분 방치 → 타이머 노드 외 리렌더 0회"). 예전엔 부모(ClockDisplay 전체)가 1초마다
 * 다시 그려져 헤더·상금 보드·QR·스탯·스폰서까지 초당 재렌더됐다 — 몇 시간씩 켜 두는
 * 매장 TV 화면이라 격리 이득이 가장 큰 자리다. memo: 부모가 30초 폴링·실시간 구독으로
 * 다시 그려질 때 g 참조가 같으면 이 패널은 그마저 건너뛴다.
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
  const regClose = msToRegClose(g, curIdx, remaining);
  return (
    <div className="flex min-h-0 flex-col items-center justify-center">
      <p className="text-[3vmin] font-bold uppercase tracking-[0.3em] text-white/55">
        {isBreak ? 'BREAK' : `LEVEL ${levelNo}`}
      </p>
      {isBreak ? (
        <>
          <p className="leading-none text-sky-300" style={{ fontSize: 'clamp(40px, 9vmin, 160px)', fontWeight: 800 }}>휴식</p>
          {/* 돌아오면 블라인드가 얼마인지 — 브레이크 중 관전자·참가자의 1순위 질문(운영자 클락 NEXT와 동일) */}
          {(() => {
            for (let i = curIdx + 1; i < lvls.length; i++) {
              const n = lvls[i];
              if (n.kind === 'level') return (
                <p className="mt-[0.8vmin] font-bold tabular-nums text-white/60" style={{ fontSize: 'clamp(14px, 2.8vmin, 44px)' }}>
                  NEXT {n.sb.toLocaleString()}/{n.bb.toLocaleString()}{n.ante > 0 ? ` (${n.ante.toLocaleString()})` : ''}
                </p>
              );
            }
            return null;
          })()}
        </>
      ) : (
        <p className="mt-[1vmin] text-center font-extrabold leading-none tabular-nums text-white"
          style={{ fontSize: 'clamp(28px, 8.5vmin, 150px)' }}>
          {lv ? <>{lv.sb.toLocaleString()}<span className="text-white/40"> / </span>{lv.bb.toLocaleString()}</> : '-'}
          {lv && lv.ante > 0 && <span className="ml-[1.5vmin] align-middle text-white/45" style={{ fontSize: 'clamp(16px, 3.5vmin, 60px)' }}>ante {lv.ante.toLocaleString()}</span>}
        </p>
      )}
      {/* 타이머 3상태색 분리(검증 #04) — 긴급 rose·브레이크 sky 는 테마가 못 덮는 잠금 변수, 평시만 테마 accent */}
      <p className={`mt-[1vmin] font-extrabold leading-none tabular-nums ${urgent ? 'animate-pulse' : ''}`}
        style={{
          fontSize: 'clamp(72px, 24vmin, 360px)',
          color: urgent ? 'var(--clk-timer-urgent, #fb7185)' : isBreak ? 'var(--clk-timer-break, #7dd3fc)' : 'var(--clk-timer, #5E6AD2)',
        }}>
        {mmss(Math.max(0, remaining))}
      </p>
      {!g.running && <p className="mt-[1vmin] text-[2.6vmin] font-bold text-amber-400">⏸ 일시정지</p>}
      {/* 다음 브레이크 · 등록마감 */}
      <div className="mt-[2vmin] flex flex-wrap items-center justify-center gap-x-[3vmin] gap-y-[1vmin] text-[2.3vmin] text-white/55">
        <span>다음 브레이크 <b className="text-white/90 tabular-nums">{nextBreak === null ? '—' : hms(nextBreak)}</b></span>
        {/* 실물 ①의 '레벨+남은시간 복합 표기' — '언제까지'를 두 축으로(Phase 11) */}
        <span>등록마감 <b className={`tabular-nums ${regClose === 0 ? 'text-rose-300' : 'text-white/90'}`}>{regClose === null ? '—' : regClose === 0 ? '마감' : `LV${g.config.regCloseLevel} · ${hms(regClose)}`}</b></span>
      </div>
    </div>
  );
});

function BigStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-1 text-center">
      <p className={`font-extrabold leading-none tabular-nums ${accent ? '' : 'text-white'}`}
        style={{ fontSize: 'clamp(20px, 4vmin, 64px)', ...(accent ? { color: 'var(--clk-accent, #5E6AD2)' } : null) }}>{value}</p>
      <p className="mt-[0.6vmin] text-[1.7vmin] text-white/45">{label}</p>
    </div>
  );
}
