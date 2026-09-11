// src/components/features/clock/ClockDisplay.tsx
// 관전 / 대형 디스플레이 모드 — 매장 TV·빔프로젝터용 읽기전용 풀스크린.
// 진입: 라이브 카드 '큰 화면' / 운영자 클락 'TV 송출' / 딥링크 ?display=<venueId>&g=<gameSeq>.
// 실시간: subscribeClock 으로 레벨 전환·통계 즉시 반영 + 1초 로컬 틱(숨김/복귀해도 endsAt 기준 정확).
// 읽기전용(컨트롤 없음) — 운영은 운영자 클락 화면·휴대폰 리모컨(?remote=)에서. 화면 항상 켜둠(Wake Lock, 베스트에포트).
//
// 2026-09-02 v3 'NURI 아우라'(오너 승인 — APIS 화면 복제 대신 손님이 TV 를 올려다보는 이유부터 다시 잡았다):
//   상단  매장·대회명 / LEVEL·상태 알약 / 총 진행 시간
//   본문  좌 프라이즈(총액 + 순위별, 없으면 열이 접힘) · 중앙 타이머 히어로 + 진행률 레일 + CURRENT|NEXT · 우 지표 세로 레일
//   하단  바인 QR(작게) · 스폰서 · Powered by
//   뺀 것: 탈락 티커 · 영문 대문자 라벨(ANTE·CURRENT·NEXT 만 관례대로 영문 — 오너 지시).
//
// 2026-09-07 v2(오너 지시 — 레퍼런스 '루나 1200 GTD'·'KK X ROYCE' 를 모티베이션으로):
//   · 프라이즈를 독립 열로 되살렸다. v1 에서 하단 레일 한 칸으로 접었는데, 대회 보드에서
//     "얼마가 걸렸나"는 타이머 다음으로 자주 보는 값이라 요약하면 안 되는 정보였다.
//   · 지표를 가로 레일 → 세로 레일(라벨 위/숫자 아래). 가로로 눌러 담으면 먼 거리에서 숫자만 남는다.
//   · **RUNNING TIME 복원**(오너 지시). 예전에 '손님에게 쓸모 없다'고 뺐던 값인데, 레퍼런스 두 종이
//     모두 상단에 크게 두고 있고 손님도 "몇 시간째인지"를 본다는 판단. 새 컬럼 없이 레벨 구조에서 계산한다.
//   · 등록 마감·다음 휴식이 상태 바에서 자리를 다투던 것(하나만 보였다)을 지표 레일로 내려 둘 다 보이게.
//   · 외부 제품의 장식(마블 텍스처·육각 프레임·이모지)은 가져오지 않았다 — 구조만 번역했다.
//   색: 타이머 순백 · 레벨/블라인드 = 테마 accent(기본 인디고) · 골드는 프라이즈 금액에만(--clk-prize 잠금).
import { memo, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { getVenueClocks, subscribeClock, effectiveLevel, type ClockState, type ClockLevel } from '../../../api/clock';
import { clockPhase, CLOCK_PHASE_TV } from '../../../lib/clockLevel';
import { buyinRequestUrl } from '../../../api/ledger';
import { getAppSetting, CLOCK_AD_KEY, CLOCK_AD_SIZE_KEY } from '../../../api/settings';
import { fetchVenuePageConfig } from '../../../api/rankings';
import { readSnap, writeSnap } from '../../../lib/snapshot';
import { clockThemeVars, sanitizeClockTheme, clockThemeSnapKey, subscribeClockTheme, subscribeClockAd, type ClockTheme } from './clockTheme';
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
/**
 * 총 진행 시간 — 지난 레벨들의 길이 합 + 현재 레벨에서 지나간 시간.
 *
 * 왜 이렇게 구하나: clock_states 에 '시작 시각' 필드가 없다. 그런데 레퍼런스(루나 1200 GTD)의
 * TOTAL TIME 이 보여주는 값은 **클락이 돈 시간**이지 벽시계 경과가 아니다 — 일시정지·중단을 빼야
 * 맞는 숫자다. 레벨 구조에서 계산하면 정확히 그 값이 나오고, 새 컬럼도 마이그레이션도 필요 없다.
 * (브레이크도 대회 시간의 일부라 함께 센다 — 레퍼런스와 같은 정의.)
 */
function elapsedMs(s: ClockState, index: number, remaining: number): number {
  const lv = s.config?.levels ?? [];
  let acc = 0;
  for (let i = 0; i < index && i < lv.length; i++) acc += (lv[i].minutes ?? 0) * 60_000;
  const cur = lv[index];
  if (cur) acc += Math.max(0, (cur.minutes ?? 0) * 60_000 - remaining);
  return acc;
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
    // 운영자가 설정에서 테마를 바꾸면 **이 창을 다시 열지 않아도** 반영된다.
    //   TV 는 보통 window.open 으로 띄운 별도 창이라, 여기가 없으면 업주는 바꾼 걸 확인할 방법이 없다.
    const off = subscribeClockTheme(venueId, (t) => setClkVars(clockThemeVars(t)));
    return () => { alive = false; off(); };
  }, [venueId]);

  const [fs, setFs] = useState(false);
  // 멀티게임 자동 순환 — ?auto=0 이면 URL 의 게임에 고정(운영자가 특정 게임만 송출할 때 · e2e 결정성)
  const [auto, setAuto] = useState(() => { try { return new URLSearchParams(window.location.search).get('auto') !== '0'; } catch { return true; } });
  const [qr, setQr] = useState<string | null>(null); // 참가(바인요청) QR
  const [sponsor, setSponsor] = useState<string | null>(null); // 스폰서 배너(app_settings 광고)
  // 광고 **크기**도 전역 설정이다. 종전엔 이 화면이 크기를 아예 안 읽어, 관리자가 '크게' 로 바꿔도
  //   TV 는 늘 같은 크기로 띄웠다 — 컨트롤은 있는데 닿는 곳이 없는 죽은 설정이었다(2026-09-11 점검).
  const [adSize, setAdSize] = useState<'sm' | 'md' | 'lg'>('sm');   // 기본값 = 종전 하드코딩 크기
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

  // 스폰서 배너 — 운영자가 광고를 등록·교체·삭제하면 이 창을 다시 열지 않아도 반영된다.
  //   예전엔 `[]` 로 마운트 1회만 읽어, 별도 창으로 띄운 TV 는 광고를 바꿔도 옛 이미지를 계속 걸고 있었다.
  useEffect(() => {
    const load = () => {
      getAppSetting(CLOCK_AD_KEY).then(setSponsor).catch(() => { /* 직전 값 유지 */ });
      getAppSetting(CLOCK_AD_SIZE_KEY)
        .then((v) => { if (v === 'sm' || v === 'md' || v === 'lg') setAdSize(v); })
        .catch(() => { /* 직전 값 유지 */ });
    };
    load();
    const off = subscribeClockAd(load);
    // ⚠ subscribeClockAd 는 **같은 탭 CustomEvent 만** 받는다. 형제인 subscribeClockTheme 은
    //   storage 이벤트까지 듣지만(테마는 localStorage 에 있다) 광고는 app_settings(서버)라 붙을 게 없다.
    //   그래서 관리자 화면(다른 기기·다른 창)에서 광고를 바꾸면 송출 중인 TV 에 닿지 않았다.
    //   위 클락 상태 폴링과 같은 주기로 서버를 다시 읽어 최대 30초 안에 따라오게 한다.
    const t = setInterval(load, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { off(); clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);

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
      {/* ── 상태 바 — 좌: 매장·대회명 / 중앙: LEVEL + 진행 상태 / 우: 지금 더 중요한 시각 하나 + 컨트롤 ──
          높이를 고정한다(h-[8vmin]). 대회명이 길어도 두 번째 줄을 만들지 않고 말줄임 —
          예전엔 이 줄이 자라면 아래 타이머가 통째로 밀렸다. */}
      {/* 3열 그리드 — 가운데 칸이 화면 정중앙이다. flex + ml-auto 로 하면 제목 길이에 따라
          가운데가 좌우로 흔들린다(실측: 알약이 우측으로 밀려 있었다). */}
      <header className="grid h-[8vmin] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-[1.5vmin] px-[3vmin]">
        <div className="flex min-w-0 items-center gap-[1.5vmin]">
          <span className={`h-[1.2vmin] w-[1.2vmin] shrink-0 rounded-full ${g?.running ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden />
          <p className="min-w-0 truncate text-[2.6vmin] font-extrabold tracking-tight">
            {venueName || '홀덤 라이브'}
            {(g?.title || g?.config?.title) && <span className="ml-[1.2vmin] font-medium" style={SOFT}>{g?.title || g?.config?.title}</span>}
          </p>
        </div>

        {/* 중앙 — LEVEL 과 상태만 알약. 나머지 정보는 알약으로 만들지 않는다. */}
        <div className="flex justify-center">{g && <StatusPills g={g} />}</div>

        <div className="flex shrink-0 items-center justify-end gap-[1.6vmin]">
          {games.length > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              {games.map((c) => (
                <button key={c.gameSeq} type="button" onClick={() => { setSel(c.gameSeq); setAuto(false); }}
                  style={c.gameSeq === g?.gameSeq ? { background: 'color-mix(in srgb, var(--clk-accent, #818CF8) 24%, transparent)', borderColor: 'color-mix(in srgb, var(--clk-accent, #818CF8) 55%, transparent)' } : undefined}
                  className={['rounded-[1vmin] border px-[1.4vmin] py-[0.5vmin] text-[1.7vmin] font-bold transition-colors',
                    c.gameSeq === g?.gameSeq ? 'text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/15'].join(' ')}>
                  {gameLabel(c)}{!c.running && <Icon name="pause" aria-label="일시정지" className="ml-[0.6vmin] inline-block h-[1.6vmin] w-[1.6vmin] align-[-0.15em]" />}
                </button>
              ))}
              <button type="button" onClick={() => setAuto((v) => !v)} title="멀티게임 자동 순환"
                className={['rounded-[1vmin] px-[1.4vmin] py-[0.5vmin] text-[1.7vmin] font-bold transition-colors', auto ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/50'].join(' ')}>
                <Icon name="refresh" className="mr-[0.5vmin] inline-block h-[1.6vmin] w-[1.6vmin] align-[-0.15em]" />{auto ? '자동' : '수동'}
              </button>
            </div>
          )}
          {g && <RunningTime g={g} />}
          <button type="button" onClick={toggleFs} title="전체화면" aria-label="전체화면"
            className="rounded-[1vmin] bg-white/10 px-[1.4vmin] py-[0.7vmin] text-[1.7vmin] font-bold text-white/80 hover:bg-white/20">{fs ? '⤢ 해제' : '⛶ 전체화면'}</button>
          <button type="button" onClick={onClose} title="닫기" aria-label="닫기"
            className="rounded-[1vmin] bg-white/10 px-[1.4vmin] py-[0.7vmin] text-[1.7vmin] font-bold text-white/80 hover:bg-white/20">✕</button>
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
          {/* ── 본문 3열: 프라이즈 | 타이머 히어로 | 지표 ─────────────────────────────
              레퍼런스 두 종(루나 1200 GTD · KK X ROYCE)이 공통으로 쓰는 골격이다. 둘 다
              **프라이즈를 독립 열**로 크게 두고 **지표를 세로 레일**로 세운다 — 대회 보드에서
              "얼마가 걸렸나"와 "지금 몇 명 남았나"는 타이머 다음으로 자주 보는 값이라
              가로 한 줄에 눌러 담으면 10m 거리에서 안 읽힌다.
              ⚠ 레이아웃 안정 계약: 중앙 열만 hero(flex-1) + 블라인드(고정 높이) 구조를 갖는다.
                 좌우 열은 각자 세로 중앙 정렬이라 프라이즈 줄 수·지표 개수가 달라져도
                 타이머 y 를 밀지 않는다(clock-visual.spec 이 6개 상태에서 y 동일을 강제). */}
          {/* 2026-09-11: 좌/중/우 3열 조건이 `md:`(폭) → `md:landscape:`(넓고 **가로**) → **컨테이너 쿼리**로 왔다.
              ① 폭만 보던 시절: 세로 TV(1080×1920) 는 폭이 1080 이라 md 를 넘겨 3열이 됐는데, 글자 크기는
                 vmin(= 짧은 변 = 폭 1080) 기준이라 중앙 열(2.5/4.5 ≈ 600px)을 가로로 뚫고 나갔다 —
                 실측: 타이머가 우측 지표를 덮고 CURRENT 와 NEXT 가 서로 겹쳤다.
              ② `md:landscape:` 로 바꿔 그건 고쳤지만, 뷰포트 기준이라 **같은 보드 한 벌이 두 곳에서 산다**는
                 사실과 어긋났다: 세로 태블릿에서 운영자 화면의 **16:9 미리보기**(가로 박스)가 뷰포트 orientation 만
                 보고 1열로 접혔다. 판정 기준은 뷰포트가 아니라 **스테이지 자신의 크기**여야 한다.
              ③ 그래서 `.clk-*`(src/index.css) 컨테이너 쿼리로 옮겼다. 경계값 768px·landscape 는 종전과 같은 값이라
                 **TV 렌더는 픽셀 동일**하고, 미리보기만 자기 박스 기준으로 바르게 펼쳐진다.
                 전제: 두 호출처 모두 스테이지 루트에 `[container-type:size]` 가 있다(TournamentClock). */}
          <div className="clk-cols min-h-0 flex-1 gap-[2vmin] px-[3vmin]">

            {/* 좌 — 프라이즈. 없으면 열 자체를 그리지 않는다(빈 칸을 남기지 않는다). */}
            {prizes.length > 0 ? (
              <aside className="clk-col min-h-0 flex-col justify-center">
                <p className={`${LABEL} text-[1.5vmin]`} style={SOFT}>총 프라이즈</p>
                <p className="mt-[0.3vmin] font-black leading-none tabular-nums"
                  style={{ fontSize: 'clamp(22px, 4.6vmin, 76px)', color: 'var(--clk-prize, #F5C451)' }}>
                  {totalPrize.toLocaleString()}
                </p>
                <ul className="mt-[1.4vmin] space-y-[0.45vmin] border-t border-white/[0.08] pt-[1.2vmin]">
                  {prizes.slice(0, 12).map((p, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-[1.2vmin] leading-tight">
                      <span className="shrink-0 font-bold tabular-nums" style={{ fontSize: i === 0 ? '2.2vmin' : '1.9vmin', ...DIM }}>
                        {/^\d+$/.test(p.place) ? `${p.place}등` : p.place}
                      </span>
                      <span className="font-extrabold tabular-nums"
                        style={{ fontSize: i === 0 ? '2.5vmin' : '2.1vmin', color: 'var(--clk-prize, #F5C451)' }}>
                        {p.amount.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </aside>
            ) : <span className="clk-wide-land" />}

            {/* 중앙 — 타이머 히어로 + 블라인드. **스택 전체를 중앙 정렬**한다.
                예전엔 히어로가 flex-1 로 남는 공간을 다 먹어서 타이머와 CURRENT/NEXT 사이에
                죽은 띠가 생겼다(레퍼런스는 둘이 한 덩어리로 붙어 있다).
                ⚠ 그래도 계약은 유지된다: 블라인드 행이 **고정 높이(22vmin)** 라 ANTE 유무와 무관하게
                   스택 총높이가 상수다 → 통째로 중앙 정렬해도 타이머 y 가 움직이지 않는다. */}
            <div className="relative flex min-h-0 flex-col items-center justify-center gap-[2.5vmin]">
              {/* ── NURI Aura Clock Frame — 타이머·블라인드를 감싸는 얇은 이중 기하 프레임 ──
                  레퍼런스 보드의 육각 프레임을 그대로 베끼지 않고 Aura 문법으로 옮긴 것:
                  세로로 긴 둥근 다각형 실루엣을 **테두리 2겹 + 뒤쪽 bloom 1겹**으로만 만든다.
                  · 외부 SVG·이미지 0 · 애니메이션 0 — 상시 송출 TV 라 1회 페인트 후 정적이어야 한다.
                  · 색은 --clk-frame/--clk-frame-soft(= accent 파생). 프리셋을 바꾸면 프레임도 따라간다.
                  · **타이머보다 강해 보이면 실패다** — 그래서 바깥 65%·안쪽 38%·bloom 0.14 로 눌러 뒀다.
                  · aria-hidden + pointer-events-none: 장식이라 스크린리더·클릭 대상이 아니다.
                  · inset 으로만 그린다 — 부모가 overflow-hidden 이어도 잘리지 않는다.
                  · 좁은 폭(모바일 관전)에서는 숨긴다: 프레임이 글자를 침범하는 것보다 없는 편이 낫다. */}
              {/* 치수는 실측으로 맞췄다(1920×1080 캡처): inset-y-2% 로 열 전체를 덮었더니
                  프레임 안 위아래에 각각 170px 씩 죽은 띠가 생겼다 — 프레임이 내용을 감싸는 게 아니라
                  내용이 프레임 안에서 떠 보였다. 위아래 비대칭인 이유: 블라인드 행이 h-[22vmin] **고정**이라
                  그 안에서 내용이 중앙 정렬되면서 아래쪽에만 빈 띠가 더 남는다 — 그래서 bottom 을 더 올린다. */}
              <span aria-hidden className="clk-wide-land pointer-events-none absolute inset-x-[7%] bottom-[14%] top-[13%]">
                {/* 바깥 선 + **뒤로 번지는 LED**. box-shadow 두 겹이 전부다 —
                    밖으로 2.6vmin 번져 패널 뒤 광원이 벽을 비추는 느낌을 만들고(§15 2단계),
                    안으로 1.2vmin 은 테두리 안쪽을 살짝 채워 선이 납작해 보이지 않게 한다.
                    filter·blur 를 쓰지 않는다 — 상시 송출 TV 라 1회 페인트 후 정적이어야 한다
                    (프로젝트 관례도 글로우는 box-shadow 로 만든다). 알파는 §15 상한 0.18 안. */}
                <span className="absolute inset-0 rounded-[8vmin] border-2"
                  style={{
                    borderColor: 'var(--clk-frame, rgba(129,140,248,.65))',
                    boxShadow: '0 0 2.6vmin color-mix(in srgb, var(--clk-accent, #818CF8) 16%, transparent),'
                             + ' inset 0 0 1.2vmin color-mix(in srgb, var(--clk-accent, #818CF8) 10%, transparent)',
                  }} />
                <span className="absolute inset-[1.1vmin] rounded-[7vmin] border"
                  style={{ borderColor: 'var(--clk-frame-soft, rgba(129,140,248,.38))' }} />
                {/* 뒤쪽 LED bloom — 프레임 안쪽에만, 글자 뒤로는 번지지 않게 closest-side 로 가둔다 */}
                <span className="absolute inset-[3vmin] rounded-[6vmin] opacity-[0.14]"
                  style={{ background: 'radial-gradient(closest-side, var(--clk-frame, #818CF8), transparent)' }} />
              </span>
              <CenterPanel g={g} />
              <div className="h-[22vmin] w-full shrink-0">
                <BlindsRow g={g} />
              </div>
            </div>

            {/* 우 — 지표 세로 레일. 라벨 작게 위, 숫자 크게 아래(레퍼런스 공통 문법). */}
            <aside className="clk-col min-h-0 flex-col justify-center gap-[1.5vmin]">
              <Rail label="생존 / 엔트리" value={hasCounts ? String(ls?.alive ?? 0) : '—'} sub={hasCounts ? `/ ${ls?.entries ?? 0}` : undefined} lead />
              {showRebuy && <Rail label="리바이 · 애드온" value={String(ls?.rebuys ?? 0)} sub={`· ${ls?.addons ?? 0}`} />}
              {buyIn > 0 && <Rail label="바이인" value={buyIn.toLocaleString()} />}
              {/* 2026-09-11: 총 칩·평균 스택은 **하단 레일**로 내렸다(아래 BottomMetrics).
                  우측 열에 7줄이 몰려 글자가 작아지는 동안 화면 하단 중앙이 통째로 비어 있었다 —
                  레퍼런스 보드처럼 '칩 경제'는 아래 가로줄, '사람 수'는 오른쪽 세로줄로 나눈다. */}
              {/* 초당 갱신이 필요한 줄은 별도 컴포넌트에 가둔다 — 여기서 틱을 돌리면 화면 전체가 매초 다시 그려진다 */}
              <TimeRails g={g} regLevel={regLevel} />
            </aside>
          </div>

          {/* ── 하단 — QR · 스폰서 · Powered by. 지표가 우측 열로 올라가서 이 줄은 보조만 남는다. ── */}
          {/* 12vmin: 하단이 이제 보조가 아니라 **지표 레일**이다(총 칩·평균 스택·다음 휴식).
              8vmin 이면 clamp 대형 숫자가 눌려 잘린다 — 실측 후 올린 값이다. */}
          <div className="flex h-[12vmin] shrink-0 items-center gap-[2vmin] border-t border-white/[0.07] px-[3vmin]">
            {qr ? (
              <div className="flex min-w-0 items-center gap-[1vmin]">
                <img src={qr} alt="참가 바인요청 QR" className="shrink-0 rounded-[0.6vmin] bg-white" style={{ width: 'clamp(34px, 5vmin, 78px)', height: 'auto' }} />
                <div className="min-w-0">
                  <p className={`${LABEL} text-[1.2vmin]`} style={SOFT}>바인 QR</p>
                  <p className="text-[1.3vmin] leading-snug" style={DIM}>찍으면 {gameLabel(g)} 바인 요청</p>
                </div>
              </div>
            ) : <span />}
            {/* 하단 중앙 — 칩 경제 3종. QR(좌)·스폰서(우) 사이의 빈 폭을 실제 정보로 채운다. */}
            <BottomMetrics g={g} curBB={curBB} />
            <div className="flex shrink-0 items-center gap-[2vmin]">
              {sponsor && <img src={sponsor} alt="스폰서" className="w-auto object-contain opacity-80" style={{ maxHeight: adSize === 'lg' ? '9vmin' : adSize === 'md' ? '7.2vmin' : '5.5vmin' }} />}
              {/* 세로 화면에서는 접는다 — 장식이 총 칩·평균 스택의 폭을 뺏으면 숫자가 줄바꿈된다 */}
              <p className="hidden shrink-0 text-[1.2vmin] font-extrabold uppercase tracking-[0.18em] landscape:block" style={DIM}>
                Powered by <span style={{ color: 'var(--clk-accent, #818CF8)' }}>NURI HOLDEM</span>
              </p>
            </div>
          </div>

          {/* 모바일 폭(세로 폰 관전) — 우측 보조가 숨으니 레지·휴식만 아래에 한 줄 */}
          <div className="clk-narrow-only shrink-0 grid-cols-2 gap-[1.2vmin] border-t border-white/[0.06] px-[3vmin] py-[1.4vmin]">
            <HeaderTimes g={g} regLevel={regLevel} compact />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * StatusPills — LEVEL 과 진행 상태만. 상태 바에서 알약을 쓰는 유일한 곳이다.
 * 초당 갱신이 필요 없다(레벨·running 은 g 가 바뀔 때만 변한다) — 부모 리렌더에 얹혀간다.
 * ⚠ '일시정지'를 여기에 둔 이유: 예전엔 타이머 **아래**에 붙어서, 일시정지 상태가 되면
 *    중앙 블록이 길어지고 세로 중앙 정렬 때문에 타이머가 30px 위로 올라갔다(실측).
 */
function StatusPills({ g }: { g: ClockState }) {
  const lvls = g.config?.levels ?? [];
  const eff = effectiveLevel(g);
  const lv = lvls[eff.index];
  const isBreak = lv?.kind === 'break';
  // 2026-09-11: 운영자·리모컨과 **같은 파생**을 쓴다(lib/clockLevel.clockPhase).
  //   예전엔 `g.running ? 'RUNNING' : 'PAUSED'` 라, 아직 시작 안 한 클락이 TV 에 'PAUSED'(일시정지)로 떴다.
  //   이제 시작 전은 READY(중립 회색) — 진행(emerald)·브레이크(sky)·일시정지(amber)와 색으로도 갈린다.
  const phase = clockPhase(g);
  const state = CLOCK_PHASE_TV[phase];
  const tone = phase === 'break'
    ? { color: '#7dd3fc', bg: 'rgba(125,211,252,0.14)', bd: 'rgba(125,211,252,0.45)' }
    : phase === 'running'
      ? { color: '#6ee7b7', bg: 'rgba(110,231,183,0.12)', bd: 'rgba(110,231,183,0.40)' }
      : phase === 'paused'
        ? { color: '#fbbf24', bg: 'rgba(251,191,36,0.14)', bd: 'rgba(251,191,36,0.45)' }
        : { color: 'rgba(255,255,255,0.62)', bg: 'rgba(255,255,255,0.07)', bd: 'rgba(255,255,255,0.22)' };
  return (
    <div className="flex shrink-0 items-center gap-[1.2vmin]">
      <span data-testid="clk-level" className="rounded-full border px-[2.2vmin] py-[0.6vmin] text-[2.1vmin] font-extrabold tracking-[0.14em]"
        style={{
          color: 'var(--clk-accent, #818CF8)',
          borderColor: 'color-mix(in srgb, var(--clk-accent, #818CF8) 55%, transparent)',
          background: 'color-mix(in srgb, var(--clk-accent, #818CF8) 14%, transparent)',
        }}>
        {isBreak ? '휴식' : `레벨 ${levelNumberAt(lvls, eff.index)}`}
      </span>
      <span className="rounded-full border px-[1.8vmin] py-[0.6vmin] text-[1.8vmin] font-extrabold tracking-[0.16em]"
        style={{ color: tone.color, background: tone.bg, borderColor: tone.bd }}>
        {state}
      </span>
    </div>
  );
}

/**
 * RunningTime — 총 진행 시간. 상태 바 우측(레퍼런스 두 종 모두 이 자리에 둔다).
 * 초당 틱은 이 컴포넌트 안에만 — 부모(화면 전체) 리렌더 0.
 */
function RunningTime({ g }: { g: ClockState }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const eff = effectiveLevel(g);
  const run = elapsedMs(g, eff.index, eff.remainingMs);
  return (
    <p className="hidden shrink-0 text-right md:block">
      <span className={`${LABEL} block text-[1.3vmin]`} style={DIM}>총 진행</span>
      <span className="text-[2.1vmin] font-extrabold tabular-nums text-white">{hms(run)}</span>
    </p>
  );
}

/**
 * TimeRails — 등록 마감 · 다음 휴식. 지표 열의 마지막 두 줄.
 * ⚠ 예전엔 이 둘이 상태 바에서 자리를 다퉈 **하나만** 보였다(둘 다 띄우면 상태 바가 정보 나열이 된다).
 *   지표 레일로 내리면 둘 다 자기 자리를 갖는다 — 등록 마감은 레벨 번호까지 함께(레퍼런스 REG CLOSE Lv16 문법).
 * 초당 틱은 여기 안에만.
 */
function TimeRails({ g, regLevel }: { g: ClockState; regLevel: number }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const eff = effectiveLevel(g);
  const reg = regLevel > 0 ? msToRegClose(g, eff.index, eff.remainingMs) : null;
  // 다음 휴식은 하단 레일(BottomMetrics)로 옮겼다 — 여기서는 등록 마감만 남는다.
  return (
    <>
      {reg !== null && (
        <Rail label="등록 마감" value={reg === 0 ? '마감' : hms(reg)} sub={reg === 0 ? undefined : `Lv ${regLevel}`} danger={reg === 0} />
      )}
    </>
  );
}

/**
 * BottomMetrics — 화면 하단 가로 지표 레일(총 칩 · 평균 스택 · 다음 휴식).
 *
 * 왜 아래인가: 이 셋은 '지금 이 판의 칩 경제'라 한 줄에 나란히 놓으면 비교가 된다.
 * 우측 세로 레일에 같이 두면 7줄이 되어 글자가 작아지고, 정작 화면 하단은 QR·스폰서만 남아 비었다.
 * 다음 휴식만 초당 갱신이라 이 컴포넌트에 틱을 가둔다 — 보드 전체를 매초 다시 그리지 않는다.
 */
function BottomMetrics({ g, curBB }: { g: ClockState; curBB: number }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const ls = g.liveStats;
  const eff = effectiveLevel(g);
  const brk = msToNextBreak(g, eff.index, eff.remainingMs);
  /** 값 없음(—)과 실제 0 을 구분한다 — 장부가 아직 안 붙은 클락에서 '총 칩 0' 은 거짓이다. */
  const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString());
  // whitespace-nowrap + 낮춘 clamp: 세로 화면(1080×1920)에서 vmin 이 폭 기준이라 4.2vmin=45px 가 되고,
  //   'QR + 3칸 + Powered by' 가 1080px 를 넘겨 **숫자가 두 줄로 쪼개졌다**(1,512,0 / 00 실측).
  //   숫자는 어떤 폭에서도 한 줄이어야 한다 — 줄이 바뀌면 자릿수를 잘못 읽는다.
  const cell = (label: string, value: string, sub?: string, tone?: string) => (
    <div className="min-w-0 text-center">
      <p className={`${LABEL} text-[1.3vmin]`} style={SOFT}>{label}</p>
      <p className="mt-[0.2vmin] whitespace-nowrap leading-none">
        <span className="font-extrabold tabular-nums" style={{ fontSize: 'clamp(18px, 3.4vmin, 70px)', color: tone ?? '#FFFFFF' }}>{value}</span>
        {sub && <span className="ml-[0.8vmin] text-[1.7vmin] font-semibold tabular-nums" style={DIM}>{sub}</span>}
      </p>
    </div>
  );
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center gap-[2.5vmin] landscape:gap-[4vmin]">
      {cell('총 칩', num(ls?.totalStack))}
      {cell('평균 스택', num(ls?.avgStack), ls?.avgStack && curBB > 0 ? `${Math.round(ls.avgStack / curBB)} BB` : undefined)}
      {/* 휴식이 없는 구성이면 칸을 만들지 않는다 — 빈 '—' 로 자리를 채우지 않는다 */}
      {brk !== null && cell('다음 휴식', hms(brk), undefined, 'var(--clk-timer-break, #7dd3fc)')}
    </div>
  );
}

/**
 * HeaderTimes — 레지 마감 · 휴식까지 중 **지금 더 중요한 하나**만 상태 바 우측에 둔다.
 * (둘 다 띄우면 상태 바가 정보 나열이 된다 — 우선순위: 등록 마감이 남아 있으면 그것, 아니면 다음 휴식.)
 * 초당 틱은 여기 안에만(부모 리렌더 0). compact = 모바일 폭 하단 한 줄.
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
  // 등록 마감이 아직 남아 있으면 그게 더 급하다. 마감됐거나 없으면 다음 휴식을 보여준다.
  const show: { label: string; text: string; urgent: boolean } | null =
    regText !== null && reg !== 0 ? { label: '등록 마감', text: regText, urgent: false }
      : brk !== null ? { label: '다음 휴식', text: hms(brk), urgent: false }
        : regText !== null ? { label: '등록', text: regText, urgent: true }
          : null;
  if (!show) return null;
  return (
    <p className="hidden shrink-0 text-right md:block">
      <span className={`${LABEL} block text-[1.3vmin]`} style={DIM}>{show.label}</span>
      <span className={`text-[2.1vmin] font-extrabold tabular-nums ${show.urgent ? 'text-rose-400' : 'text-white'}`}>{show.text}</span>
    </p>
  );
}

/** 진행률 레일 세그먼트 수 — 전광판 느낌을 내되 TV 거리에서 셀 수 있는 정도. */
const RAIL_SEGMENTS = 24;

/**
 * CenterPanel — 대형 타이머 + 진행률 레일. 초당 setInterval 틱을 이 안에 가둔다
 * (1분 방치 → 타이머 노드 외 리렌더 0회). memo: g 참조가 같으면 건너뛴다.
 * data-testid clk-timer 는 e2e 앵커 — 문구를 바꿔도 이 id 는 유지한다.
 */
const CenterPanel = memo(function CenterPanel({ g }: { g: ClockState }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const lvls = g.config?.levels ?? [];
  const eff = effectiveLevel(g);
  const lv = lvls[eff.index];
  const isBreak = lv?.kind === 'break';
  const remaining = Math.max(0, eff.remainingMs);
  const urgent = !!g.running && remaining <= 60_000 && !isBreak;
  const totalMs = Math.max(1, (lv?.minutes ?? 0) * 60_000);
  const donePct = Math.min(1, Math.max(0, 1 - remaining / totalMs));
  const filled = Math.round(donePct * RAIL_SEGMENTS);
  const timerColor = urgent ? 'var(--clk-timer-urgent, #fb7185)' : isBreak ? 'var(--clk-timer-break, #7dd3fc)' : 'var(--clk-timer, #FFFFFF)';

  return (
    <div className="relative flex w-full flex-col items-center">
      {/* 타이머 뒤 아주 약한 radial bloom **한 겹**. 글자 자체에 네온 외곽선을 두르지 않는다. */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[46vmin] w-[76vmin] -translate-x-1/2 -translate-y-1/2"
        style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--clk-accent, #818CF8) 16%, transparent), transparent)' }} />

      <p data-testid="clk-timer" className="font-black leading-none tabular-nums"
        style={{ fontSize: 'clamp(84px, 26vmin, 400px)', letterSpacing: '0.005em', color: timerColor }}>
        {mmss(remaining)}
      </p>

      {/* 진행률 레일 — 지나간 구간 accent, 남은 구간 흰색 7%. 마지막 60초엔 danger.
          width 애니메이션이 아니라 세그먼트의 **색만** 바뀐다(레이아웃 0). reduced-motion 에서도 동일하다. */}
      <div className="mt-[2.4vmin] flex w-[72vmin] max-w-full gap-[0.5vmin]" role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(donePct * 100)} aria-label="현재 레벨 진행률">
        {Array.from({ length: RAIL_SEGMENTS }, (_, i) => (
          <span key={i} className="h-[1.1vmin] flex-1 rounded-[0.3vmin]"
            style={{
              background: i < filled
                ? (urgent ? 'var(--clk-timer-urgent, #fb7185)' : isBreak ? 'var(--clk-timer-break, #7dd3fc)' : 'var(--clk-accent, #818CF8)')
                : 'rgba(255,255,255,0.07)',
            }} />
        ))}
      </div>
    </div>
  );
});

/**
 * BlindsRow — CURRENT | NEXT 좌우 대칭. CURRENT 는 밝고 크게, NEXT 는 한 단계 어둡고 작게.
 * 굵은 테두리로 나누지 않고 **여백과 미세한 surface 차이**로 구분한다.
 * 이 행은 부모가 고정 높이를 주고 여기서 세로 중앙 정렬한다 — ANTE 유무가 위 타이머를 밀지 않는다.
 * 브레이크 중에는 CURRENT 자리에 BREAK 를, NEXT 자리에 다음 레벨을 둔다.
 */
const BlindsRow = memo(function BlindsRow({ g }: { g: ClockState }) {
  const lvls = g.config?.levels ?? [];
  const eff = effectiveLevel(g);
  const lv = lvls[eff.index];
  const isBreak = lv?.kind === 'break';
  const next = (() => { for (let i = eff.index + 1; i < lvls.length; i++) if (lvls[i].kind === 'level') return lvls[i]; return null; })();
  const num = (n: number) => n.toLocaleString();
  return (
    <div className="grid h-full grid-cols-2 items-center gap-[2vmin]">
      {/* CURRENT */}
      {/* 2026-09-11 오너 지적 — 카드 배경을 뺐다. 중앙 Aura 프레임(둥근 사각)이 들어오면서
          이 박스의 모서리와 프레임 선이 겹쳐 '사각 안의 사각'이 됐다. 레퍼런스 보드도 블라인드를
          맨 텍스트로 두고(§8 "불필요한 카드 박스가 없는 넓은 TV 레이아웃") 구분은 크기·색으로만 한다.
          가운데 세로 헤어라인 하나로 CURRENT|NEXT 를 가른다 — 면이 아니라 선이라 프레임과 싸우지 않는다. */}
      <div className="flex h-full flex-col items-center justify-center border-r border-white/[0.07] px-[2vmin]">
        <p className={`${LABEL} text-[1.5vmin]`} style={SOFT}>{isBreak ? 'BREAK' : 'CURRENT'}</p>
        {isBreak ? (
          <p className="mt-[0.8vmin] font-extrabold leading-none" style={{ fontSize: 'clamp(24px, 6.4vmin, 108px)', color: 'var(--clk-timer-break, #7dd3fc)' }}>
            {lv?.label || '휴식 시간'}
          </p>
        ) : (
          <>
            {/* whitespace-nowrap: 자릿수가 커져도 줄바꿈되지 않는다. '/' 는 숫자보다 작게. */}
            <p className="mt-[0.6vmin] whitespace-nowrap font-extrabold leading-none tabular-nums"
              style={{ fontSize: 'clamp(26px, 7.2vmin, 128px)', color: 'var(--clk-accent, #818CF8)' }}>
              {lv ? <>{num(lv.sb)}<span className="mx-[0.6vmin] align-middle text-[0.5em] text-white/30">/</span>{num(lv.bb)}</> : '-'}
            </p>
            {/* ANTE 가 없으면 이 줄 자체를 그리지 않는다(빈 행을 남기지 않는다).
                행 높이는 부모가 고정하므로 이 줄의 유무가 타이머를 밀지 않는다. */}
            {lv && lv.ante > 0 && (
              <p className="mt-[0.8vmin] flex items-baseline gap-[1vmin] leading-none">
                <span className="text-[1.7vmin] font-bold uppercase tracking-[0.18em]" style={DIM}>Ante</span>
                <span className="font-extrabold tabular-nums text-white" style={{ fontSize: 'clamp(16px, 3.4vmin, 60px)' }}>{num(lv.ante)}</span>
              </p>
            )}
          </>
        )}
      </div>

      {/* NEXT — 한 단계 어둡고 작게 */}
      <div className="flex h-full flex-col items-center justify-center px-[2vmin]">
        <p className={`${LABEL} text-[1.5vmin]`} style={DIM}>NEXT</p>
        {next ? (
          <>
            <p className="mt-[0.6vmin] whitespace-nowrap font-extrabold leading-none tabular-nums text-white/75"
              style={{ fontSize: 'clamp(20px, 5.4vmin, 96px)' }}>
              {num(next.sb)}<span className="mx-[0.6vmin] align-middle text-[0.5em] text-white/25">/</span>{num(next.bb)}
            </p>
            {next.ante > 0 && (
              <p className="mt-[0.8vmin] flex items-baseline gap-[1vmin] leading-none">
                <span className="text-[1.7vmin] font-bold uppercase tracking-[0.18em]" style={DIM}>Ante</span>
                <span className="font-extrabold tabular-nums text-white/70" style={{ fontSize: 'clamp(14px, 2.8vmin, 48px)' }}>{num(next.ante)}</span>
              </p>
            )}
          </>
        ) : (
          <p className="mt-[0.6vmin] text-[2.4vmin] font-bold" style={DIM}>마지막 레벨</p>
        )}
      </div>
    </div>
  );
});

/**
 * Rail — 우측 지표 열의 한 칸. 라벨(작고 흐리게) 위 / 숫자(밝게) 아래.
 * 레퍼런스 두 종이 공통으로 쓰는 문법이다 — 가로로 눌러 담으면 라벨과 숫자가 같은 줄에서 경쟁해
 * 먼 거리에서 숫자만 남고 무엇의 숫자인지가 사라진다.
 */
function Rail({ label, value, sub, lead, danger }: { label: string; value: string; sub?: string; lead?: boolean; danger?: boolean }) {
  return (
    <div className="min-w-0 border-b border-white/[0.07] pb-[1.1vmin] last:border-b-0">
      <p className={`${LABEL} text-[1.5vmin]`} style={SOFT}>{label}</p>
      <p className="mt-[0.2vmin] flex items-baseline gap-[0.6vmin] leading-none">
        <span className="font-extrabold tabular-nums"
          style={{ fontSize: lead ? 'clamp(24px, 5.4vmin, 92px)' : 'clamp(18px, 3.6vmin, 60px)',
                   color: danger ? 'var(--clk-timer-urgent, #fb7185)' : '#FFFFFF' }}>{value}</span>
        {sub && <span className="text-[1.9vmin] font-semibold tabular-nums" style={DIM}>{sub}</span>}
      </p>
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
