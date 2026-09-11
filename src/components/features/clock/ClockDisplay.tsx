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
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { getVenueClocks, subscribeClock, type ClockState } from '../../../api/clock';
import ClockStage from './ClockStage';
import { gameLabel } from '../../../lib/clockLevel';
import { buyinRequestUrl } from '../../../api/ledger';
import { getAppSetting, CLOCK_AD_KEY, CLOCK_AD_SIZE_KEY } from '../../../api/settings';
import { fetchVenuePageConfig } from '../../../api/rankings';
import { readSnap, writeSnap } from '../../../lib/snapshot';
import { clockThemeVars, sanitizeClockTheme, clockThemeSnapKey, subscribeClockTheme, subscribeClockAd, type ClockTheme } from './clockTheme';
import Icon from '../../atoms/Icon';

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

  const gSeq = g?.gameSeq ?? null;

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

  /** TV 전용 조작 — 게임 전환 · 전체화면 · 닫기.
   *  🔴 보드(ClockStage) **밖**에 둔다. 03cd8bb 에서 머리말을 통째로 스테이지 안에 넣었는데
   *  스테이지는 클락이 있을 때만 그려진다 — 그래서 '진행 중인 클락이 없습니다'·'불러오는 중' 화면에서
   *  닫기(✕)와 전체화면이 통째로 사라졌다. 이 화면은 별도 창이 아니라 앱 위의 fixed 오버레이라,
   *  보이는 탈출구가 없으면 ESC 를 아는 사람만 빠져나온다(접근성 기본). */
  const tvControls = (
    <>
      {games.length > 1 && (
        <div className="flex shrink-0 items-center gap-1">
          {games.map((c) => (
            <button key={c.gameSeq} type="button" onClick={() => { setSel(c.gameSeq); setAuto(false); }}
              style={c.gameSeq === g?.gameSeq ? { background: 'color-mix(in srgb, var(--clk-accent, #818CF8) 24%, transparent)', borderColor: 'color-mix(in srgb, var(--clk-accent, #818CF8) 55%, transparent)' } : undefined}
              className={['rounded-[1cqmin] border px-[1.4cqmin] py-[0.5cqmin] text-[1.7cqmin] font-bold transition-colors',
                c.gameSeq === g?.gameSeq ? 'text-white' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/15'].join(' ')}>
              {gameLabel(c)}{!c.running && <Icon name="pause" aria-label="일시정지" className="ml-[0.6cqmin] inline-block h-[1.6cqmin] w-[1.6cqmin] align-[-0.15em]" />}
            </button>
          ))}
          <button type="button" onClick={() => setAuto((v) => !v)} title="멀티게임 자동 순환"
            className={['rounded-[1cqmin] px-[1.4cqmin] py-[0.5cqmin] text-[1.7cqmin] font-bold transition-colors', auto ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/50'].join(' ')}>
            <Icon name="refresh" className="mr-[0.5cqmin] inline-block h-[1.6cqmin] w-[1.6cqmin] align-[-0.15em]" />{auto ? '자동' : '수동'}
          </button>
        </div>
      )}
      <button type="button" onClick={toggleFs} title="전체화면" aria-label="전체화면"
        className="rounded-[1cqmin] bg-white/10 px-[1.4cqmin] py-[0.7cqmin] text-[1.7cqmin] font-bold text-white/80 hover:bg-white/20">{fs ? '⤢ 해제' : '⛶ 전체화면'}</button>
      <button type="button" onClick={onClose} title="닫기" aria-label="닫기"
        className="rounded-[1cqmin] bg-white/10 px-[1.4cqmin] py-[0.7cqmin] text-[1.7cqmin] font-bold text-white/80 hover:bg-white/20">✕</button>
    </>
  );

  return (
    // ⚠ [container-type:size] 는 장식이 아니라 **레이아웃의 전제**다.
    //   본문 3열·프라이즈 열·지표 레일은 전부 `.clk-*` 컨테이너 쿼리(src/index.css)로 켜지는데,
    //   컨테이너 쿼리는 **container-type 이 걸린 조상이 하나도 없으면 영원히 거짓**이다 —
    //   즉 이게 없으면 TV 는 조건이 참이 될 길이 없어 1열로 굳고 프라이즈·지표 열이 통째로 사라진다.
    //   (2026-09-11 e008b02 가 md:landscape: → .clk-* 로 갈아타면서 TournamentClock 쪽만 확인하고
    //    이쪽 루트를 빠뜨렸다. 뷰포트가 곧 스테이지라 cq 경계값은 종전 md:landscape: 와 같다.)
    <div ref={rootRef} className="fixed inset-0 z-[80] flex flex-col text-white select-none [container-type:size]"
      style={{ ...clkVars, background: 'var(--clk-bg, #06080F)' }}>
      {/* 보드는 ClockStage 한 벌 — 운영자 화면(TournamentClock)과 **같은 마크업**이다.
          여기서 하는 일은 데이터(구독·폴링·테마·QR·광고)와 TV 전용 조작(게임 전환·전체화면·닫기)뿐이다. */}
      {clocks === null || !g ? (
        <>
          {/* 클락이 없어도 머리말은 그린다 — 위 tvControls 주석의 이유. */}
          <header className="flex h-[8cqmin] shrink-0 items-center justify-end gap-[1.6cqmin] px-[3cqmin]">{tvControls}</header>
          {clocks === null ? (
            <div className="flex flex-1 items-center justify-center text-[3cqmin]" style={{ color: 'var(--clk-ink-soft, rgba(255,255,255,.5))' }}>불러오는 중…</div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-[2cqmin] text-center">
              <p className="text-[4cqmin] font-bold text-white/80">진행 중인 클락이 없습니다</p>
              <p className="text-[2.4cqmin]" style={{ color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' }}>운영자가 이 매장의 클락을 시작하면 자동으로 표시됩니다</p>
            </div>
          )}
        </>
      ) : (
        <ClockStage g={g} venueName={venueName} qr={qr} sponsor={sponsor} adSize={adSize} headerRight={tvControls} />
      )}
    </div>
  );
}
