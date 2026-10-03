// src/components/features/clock/ClockThemePanel.tsx
// 클락 화면(TV 송출) 테마 — 프리셋 9종 · 강조색 10종 · 매장 배경 이미지 업로드.
//
// 위치: 「내 매장 → 게임 진행 → 3. 클락 → 클락 설정」. 예전엔 '매장 설정 > 매장 페이지'에 있었는데,
// 그건 손님용 매장 페이지를 꾸미는 문(門)이라 **클락을 세팅하는 사람이 지나가지 않는 자리**였다.
// 옮기면서 저장 계약은 그대로 둔다 — 정본은 여전히 venues.page_config.clockTheme 한 키다(스키마 변경 0).
//
// set_venue_page_config 는 page_config 전체를 교체하는 RPC 라, 저장 직전 최신 config 를 다시 읽어
// clockTheme 키만 갈아끼운다(다른 화면에서 바꾼 탭 순서·랭킹 설정 보존).
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../atoms/Toast';
import { getVenuePageConfig, setVenuePageConfig, type VenuePageConfig } from '../../../api/rankings';
import {
  CLOCK_THEME_PRESETS, CLOCK_ACCENT_SWATCHES, DEFAULT_CLOCK_PRESET_ID,
  clockPresetById, makeClockTheme, themeForPresetChange, sanitizeClockTheme, clockThemeVars, clockBgImageOf,
  publishClockTheme, subscribeClockTheme, clockAmbienceOf, clockBgDisplayOf, clockLogoPlateOf, type ClockTheme, type ClockThemePreset, type ClockBgDisplay,
} from './clockTheme';
import ClockAmbienceSlot from './ambience/ClockAmbienceSlot';
import { ambIsolation } from './ambience/ambiencePresets';
import { clockStageDecor } from './clockStageDecor';
import { CLOCK_THEME_POLL_MS } from './useClockThemeVars';
import { uploadClockBg, deleteClockBg, CLOCK_BG_ACCEPT } from './clockBgImage';
import { msgOf } from '../../../lib/dbError';

/**
 * ClockMiniFace — TV 송출 화면의 축소판. 프리뷰와 프리셋 버튼 **두 곳**이 같은 것을 쓴다.
 *
 * 왜 컴포넌트로 뽑나: 예전엔 프리뷰가 '레벨/블라인드/타이머/생존' 텍스트 나열이었고 프리셋 버튼은
 * 배경색 위 '12:34' 한 줄이었다. 둘 다 실제 화면과 닮지 않아서, 고르고 나서야 결과를 알 수 있었다.
 * 두 자리가 같은 축소판을 쓰면 중복이 실제로 줄고(3벌 → 1벌) 프리셋 비교가 색이 아니라 **화면**으로 된다.
 *
 * 크기는 루트 font-size 하나로 조절한다 — 안쪽 치수가 전부 em 이라 같은 마크업이 두 크기에서 그대로 산다.
 * (프리뷰 전용 렌더러를 따로 만들지 않는다 — 이건 ClockDisplay 의 구조를 그대로 축소한 것이다.)
 */
/** 축소판의 글자 판 — TV 의 PLATE(ClockStage)와 같은 변수, 여백만 em. 변수가 없으면 전부 투명이라 화면 변화 0. */
const MINI_PLATE = { background: 'var(--clk-plate, transparent)', boxShadow: '0 0 0 0.15em var(--clk-plate, transparent)', borderRadius: '0.15em' } as const;

/** 표시 설정 한 줄 — 누르면 바로 저장(테마 카드와 같은 문법). 칸은 44px 높이(PC 마우스·터치 둘 다). */
function Seg<T extends string | number>({ label, value, options, onPick, disabled, testid }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onPick: (v: T) => void; disabled?: boolean; testid: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label} data-testid={testid}>
      <span className="w-16 shrink-0 text-2xs font-semibold text-ink-secondary">{label}</span>
      {options.map(([v, t]) => (
        <button key={String(v)} type="button" disabled={disabled} aria-pressed={v === value} onClick={() => { if (v !== value) onPick(v); }}
          style={{ minWidth: 44 }}   // 리뷰 하-6 — '위' 버튼이 33px 였다
          className={['min-h-11 rounded-input border px-2.5 text-2xs font-semibold transition-colors disabled:opacity-50',
            v === value ? 'border-accent-300 bg-accent-300/10 text-accent-300 dark:text-accent-200' : 'border-border-default text-ink-secondary hover:border-accent-400/40'].join(' ')}>
          {t}
        </button>
      ))}
    </div>
  );
}

function ClockMiniFace({ vars, accent, em, cqw, className, still }: {
  vars: React.CSSProperties; accent: string; em: number;
  /** 모션 테마 썸네일 — 움직이지 않는 한 장만 그린다(목록에 15장이 한꺼번에 돌지 않게). 큰 미리보기는 움직인다. */
  still?: boolean;
  /** 2026-09-14: 컨테이너 폭 대비 비율(%). 이 얼굴은 aspect-video 상자 안이 **전부 em 단위**라
   *  루트 폰트가 폭에 비례하지 않으면 좁은 폭에서 글자만 그대로 커서 넘친다
   *  (실측 375: 미리보기 314px 인데 em 44 고정 → "500/1,000" 이 두 줄, 타이머가 배지와 겹침).
   *  `min(em px, cqw)` 라서 **넓은 폭에서는 종전 픽셀값 그대로**고 좁아질 때만 줄어든다 —
   *  PC(운영주 주 폭)는 한 픽셀도 바뀌지 않는다. 부모에 container-type:inline-size 가 있어야 한다. */
  cqw?: number; className?: string;
}) {
  const RAIL = 16; // TV 는 24칸 — 축소판에서는 셀 수 있는 만큼만
  const v = vars as Record<string, string>;
  const { logo } = clockStageDecor(v);
  const filled = 6;
  return (
    <div data-amb-root className={`relative flex aspect-video flex-col overflow-hidden text-white ${className ?? ''}`}
      style={{ ...vars, fontSize: cqw ? `min(${em}px, ${cqw}cqw)` : `${em}px`, background: 'var(--clk-bg)', ...ambIsolation(clockAmbienceOf(v)) }} aria-hidden>
      {/* 모션 테마 — TV 와 같은 장면을 이 크기로 그린다(해상도 무관). 테마가 아니면 아무것도 안 받는다. */}
      <ClockAmbienceSlot id={clockAmbienceOf(v)} still={still} />
      {/* 상단 — 매장명만. LEVEL 알약·RUNNING 알약은 2026-09-19 오너 지시 #9 로 보드에서 사라졌다(ClockStage LevelLine). */}
      <div className="flex shrink-0 items-center gap-[0.4em] px-[0.7em] pt-[0.5em]" style={MINI_PLATE}>
        <span className="h-[0.3em] w-[0.3em] rounded-full bg-emerald-400" />
        {/* N-2 '로고로 넣기' — TV 가로 보드와 같은 자리(머리줄 매장 이름 옆). 축소판은 em 단위라 높이 0.5em ≈ 머리줄 칸. */}
        {logo && <img src={logo.src} alt="" className="h-[0.5em] w-auto max-w-[3em] shrink-0 object-contain" style={logo.plate ? { background: logo.plate, borderRadius: '0.1em', padding: '0.03em 0.08em' } : undefined} />}
        <span className="truncate text-[0.5em] font-bold" style={{ color: 'var(--clk-ink-soft)' }}>NURI</span>
      </div>

      {/* 히어로 — LEVEL(타이머 위 큰 글자) + 타이머 + 컬러별 아우라(강조색을 그대로 쓴 radial bloom 한 겹) + 진행률 레일 */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[3.4em] w-[6em] -translate-x-1/2 -translate-y-1/2"
          style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${accent} 22%, transparent), transparent)` }} />
        <span data-amb-avoid className="relative text-[0.5em] font-black leading-none tracking-[0.18em]" style={{ color: accent, ...MINI_PLATE }}>LEVEL 5</span>
        <span data-amb-avoid className="relative mt-[0.12em] text-[1.75em] font-black leading-none tabular-nums" style={{ color: 'var(--clk-timer)', ...MINI_PLATE }}>12:34</span>
        <span className="relative mt-[0.35em] flex w-[70%] gap-[0.08em]">
          {Array.from({ length: RAIL }, (_, i) => (
            <span key={i} className="h-[0.16em] flex-1 rounded-[0.05em]"
              style={{ background: i < filled ? accent : 'rgba(255,255,255,0.08)' }} />
          ))}
        </span>
      </div>

      {/* CURRENT | NEXT — data-amb-avoid: 모션 테마가 TV 처럼 글자 뒤를 흐린 유리·그늘로 누르는 자리(ClockStage 와 같은 표시) */}
      <div data-amb-avoid className="grid shrink-0 grid-cols-2 gap-[0.3em] px-[0.6em]" style={MINI_PLATE}>
        <div className="rounded-[0.3em] bg-white/5 py-[0.25em] text-center">
          <p className="text-[0.36em] font-bold tracking-[0.2em]" style={{ color: 'var(--clk-ink-soft)' }}>CURRENT</p>
          <p className="text-[0.62em] font-extrabold leading-tight tabular-nums" style={{ color: accent }}>500/1,000</p>
        </div>
        <div className="rounded-[0.3em] bg-white/2.5 py-[0.25em] text-center">
          <p className="text-[0.36em] font-bold tracking-[0.2em]" style={{ color: 'var(--clk-ink-dim)' }}>NEXT</p>
          <p className="text-[0.55em] font-extrabold leading-tight tabular-nums text-white/70">1,000/2,000</p>
        </div>
      </div>

      {/* 하단 metrics rail */}
      <div data-amb-avoid className="flex shrink-0 items-baseline gap-[0.8em] border-t border-white/[0.07] px-[0.7em] py-[0.3em]" style={MINI_PLATE}>
        <span className="text-[0.38em]" style={{ color: 'var(--clk-ink-dim)' }}>PLAYERS <b className="text-[1.3em] text-white">18</b>/42</span>
        <span className="text-[0.38em]" style={{ color: 'var(--clk-ink-dim)' }}>AVG <b className="text-[1.3em] text-white">84,000</b></span>
        <span className="ml-auto text-[0.38em] font-bold" style={{ color: 'var(--clk-prize, #F5C451)' }}>550</span>
      </div>
    </div>
  );
}

export default function ClockThemePanel({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [theme, setTheme] = useState<ClockTheme | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null); // 업로드 단계 문구(진행률 API 가 없어 단계로 알린다)
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  // 매장 전환 가드 — 저장이 끝나기 전에 다른 매장으로 바뀌면 앞 매장의 테마를 이 패널(이제 B 매장)에 넣지 않는다.
  //   그대로 두면 다음 클릭(강조색·표시 방식)이 A 의 이미지를 B 에 섞어 저장한다. 저장 자체는 시작 때의 venueId 로 간다.
  const venueRef = useRef(venueId);
  venueRef.current = venueId;

  // 리뷰 하-2 — A 저장 대기 중 A→B→A 로 돌아오면, 저장보다 먼저 출발한 읽기가 나중에 도착해 패널이 옛 값을 보였다(다음 클릭이 그 옛 값으로 덮어쓸 수 있다).
  //   ① 읽기 출발 뒤에 저장이 하나라도 끝났으면 그 응답은 버리고 ② 같은 브라우저의 저장 신호(publishClockTheme)를 패널도 듣는다.
  const saveSeqRef = useRef(0);
  useEffect(() => {
    let alive = true;
    const startedAt = saveSeqRef.current;
    setLoaded(false);
    getVenuePageConfig(venueId)
      .then((c) => { if (alive && saveSeqRef.current === startedAt) setTheme(sanitizeClockTheme(c?.clockTheme)); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    const off = subscribeClockTheme(venueId, (t) => { if (alive) setTheme(t); });
    return () => { alive = false; off(); };
  }, [venueId]);

  const cur = theme;
  const curPresetId = cur?.background?.preset ?? cur?.palette?.preset ?? DEFAULT_CLOCK_PRESET_ID;
  const curPreset = clockPresetById(curPresetId) ?? CLOCK_THEME_PRESETS[0];
  const curAccentSel = cur?.palette?.accent;              // 업주가 고른 강조색(없으면 프리셋 기본)
  const curAccent = curAccentSel ?? curPreset.accent;
  const curImage = clockBgImageOf(cur);
  const curDisp = clockBgDisplayOf(cur);
  const curPlate = clockLogoPlateOf(cur);

  /** clockTheme 키만 교체 저장. 성공 시 남은 옛 배경 파일을 정리(저장 성공 후에만 — 순서가 계약이다) */
  const persist = async (next: ClockTheme | null, orphan?: string | null) => {
    setBusy(true);
    try {
      const latest = (await getVenuePageConfig(venueId)) ?? {};
      const merged: VenuePageConfig = { ...latest };
      if (next) merged.clockTheme = next; else delete merged.clockTheme;
      await setVenuePageConfig(venueId, merged);
      // 저장이 DB 에만 남으면 '눌렀는데 아무 일도 안 일어난다' 가 된다 —
      // 열려 있는 TV·운영자 미리보기가 새로고침 없이 새 테마를 집게 알린다(같은 탭 + 다른 창).
      saveSeqRef.current++;
      publishClockTheme(venueId, next);
      if (aliveRef.current && venueRef.current === venueId) setTheme(next);
      if (orphan) void deleteClockBg(orphan);
      return true;
    } catch (e) {
      toast.show(msgOf(e, '저장 실패'), 'error');
      return false;
    } finally { if (aliveRef.current) setBusy(false); }
  };

  /**
   * 프리셋 전환 — **이전 테마의 커스텀 강조색을 이월하지 않는다**(오너 지시 2026-09-11).
   *
   * ⚠ 예전엔 `makeClockTheme(id, curAccentSel, curImage)` 로 `curAccentSel` 을 그대로 넘겼다.
   *   그래서 바이올렛을 골라 둔 매장이 '아우라 골드'를 눌러도 강조색은 보라로 남았고,
   *   당시엔 타이머까지 강조색을 따라가서(clockTheme.ts 의 나머지 반쪽 결함) **금색 테마인데 보라 타이머**가 떴다.
   *   테마 카드 3×3 에서 '아우라 골드'만 보라 타이머로 보이던 화면이 정확히 이 경로다.
   *
   * 새 프리셋은 그 프리셋의 기본 accent 로 시작한다 — 강조색을 원하면 아래 스와치에서 다시 고른다.
   * 배경 이미지(curImage)는 유지한다: 사진은 '테마 색'이 아니라 매장이 올린 자산이라 테마를 옮겨도 살아야 한다.
   */
  const pickPreset = async (id: string) => {
    if (await persist(themeForPresetChange(id, cur))) {
      toast.show(`클락 화면 테마를 저장했습니다. 이 기기 TV 는 바로, 다른 기기 TV 는 ${CLOCK_THEME_POLL_MS / 1000}초 안에 바뀌어요`, 'success');
    }
  };
  const pickAccent = async (v: string) => {
    if (await persist(makeClockTheme(curPresetId, v, curImage, cur?.background))) {
      toast.show('강조색을 저장했습니다', 'success');
    }
  };

  const pickImage = async (file: File | null) => {
    if (!file) return;
    setBusy(true); setStage('이미지 처리 중…');
    try {
      const url = await uploadClockBg(venueId, file);
      setStage('저장 중…');
      const ok = await persist(makeClockTheme(curPresetId, curAccentSel, url, cur?.background), curImage);
      // 리뷰 하-4 — 어둡게 처리는 '꽉 채우기' 에서만 일어난다. 문구를 표시 방식별로.
      if (ok) toast.show(curDisp.fit === 'cover' ? '배경 이미지를 등록했습니다. 꽉 채우기라 글자가 잘 보이도록 사진을 어둡게 보여 줘요' : '이미지를 등록했습니다. 이미지 색은 그대로 두고 글자 뒤에만 판을 깔아요', 'success');
      else void deleteClockBg(url); // 저장 실패분은 고아로 남기지 않는다
    } catch (e) {
      toast.show(msgOf(e, '업로드 실패'), 'error');
    } finally { if (aliveRef.current) { setBusy(false); setStage(null); } }
  };

  /** N-2 — 표시 방식·위치·크기·어둡게. 이미지·색은 그대로 두고 표시 설정만 바꿔 저장한다. */
  const pickDisplay = async (patch: ClockBgDisplay) => {
    if (!curImage) return;
    if (await persist(makeClockTheme(curPresetId, curAccentSel, curImage, { ...curDisp, ...patch }))) {
      toast.show(`표시 방식을 저장했습니다. 이 기기 TV 는 바로, 다른 기기 TV 는 ${CLOCK_THEME_POLL_MS / 1000}초 안에 바뀌어요`, 'success');
    }
  };

  const removeImage = async () => {
    if (!curImage) return;
    if (await persist(makeClockTheme(curPresetId, curAccentSel, null), curImage)) {
      toast.show('배경 이미지를 제거했습니다', 'info');
    }
  };

  const resetAll = async () => {
    if (await persist(null, curImage)) toast.show('클락 화면을 기본 테마로 되돌렸습니다', 'success');
  };

  if (!loaded) {
    // 스켈레톤 높이 = 실제 카드와 동일(로드 후 아래 내용이 밀리지 않게 — CLS 0)
    return <section className="rounded-aura border card-aura p-3" style={{ minHeight: 300 }}>
      <p aria-busy="true" className="py-10 text-center text-2xs text-ink-muted">클락 화면 설정 불러오는 중…</p>
    </section>;
  }

  const previewVars = clockThemeVars(cur);

  return (
    <section className="rounded-aura border card-aura p-3 space-y-2.5">
      <div>
        <h3 className="text-sm font-bold text-ink-primary">클락 화면 <span className="text-2xs font-normal text-ink-muted">(TV 송출 · 관전 화면)</span></h3>
        <p className="mt-0.5 text-2xs text-ink-muted">
          누르면 바로 저장돼요 · 긴급(1분 미만) 적색·브레이크 청색은 테마와 무관
        </p>
      </div>

      {/* 실제 합성 미리보기 — 배경 이미지 + 가독 보호 오버레이 + 강조색을 송출 화면과 같은 순서로 겹친다 */}
      <div className="overflow-hidden rounded-input border border-border-subtle @container" aria-label="클락 화면 미리보기">
        {/* 4.8cqw = 1440 실측(폭 ≈920px · em 44)의 비율. min() 이라 PC 는 그대로 44px 이다. */}
        <ClockMiniFace vars={previewVars} accent={curAccent} em={44} cqw={4.8} />
      </div>

      {/* 배경 이미지 — 업로드 / 교체 / 제거 */}
      <div className="rounded-input border border-border-subtle bg-surface-high p-2.5 space-y-1.5">
        <p className="text-2xs font-semibold text-ink-secondary">배경 이미지 <span className="font-normal text-ink-muted">(매장 사진·로고 · 선택)</span></p>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className={['btn-ghost text-2xs px-3 py-1.5', busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'].join(' ')}>
            {stage ?? (curImage ? '이미지 변경' : '이미지 올리기')}
            <input type="file" accept={CLOCK_BG_ACCEPT.join(',')} className="hidden" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0] ?? null; e.currentTarget.value = ''; void pickImage(f); }} />
          </label>
          {curImage && (
            <button type="button" onClick={removeImage} disabled={busy}
              className="rounded-input border border-danger/40 px-3 py-1.5 text-2xs font-semibold text-danger-light hover:bg-danger/10 disabled:opacity-40">배경 제거</button>
          )}
        </div>
        <p className="text-2xs text-ink-muted">
          {/* C1 C-1(2026-10-02) — 3줄(93자) → 2줄. */}
          <span className="font-semibold text-ink-secondary">꽉 채우기는 글자가 묻히지 않게 사진을 어둡게 보여 줘요</span> — 로고는 아래 '로고로 넣기'(색 그대로). 배경이 없으면 테마 색만 나가요.
        </p>
        {/* N-2(2026-10-03 오너 결정) — 사진은 꽉 채우고, 로고는 잘리지 않게. 맞추기·가운데는 이미지를 누르지 않고 글자 뒤에만 판을 깐다. */}
        {curImage && (
          <div className="space-y-1.5 border-t border-border-subtle pt-1.5" data-testid="clk-bg-display">
            <Seg label="표시 방식" testid="clk-bg-fit" value={curDisp.fit} disabled={busy} onPick={(fit) => pickDisplay({ fit })}
              options={[['cover', '꽉 채우기(사진)'], ['contain', '잘림 없이 맞추기'], ['center', '로고로 넣기']] as const} />
            {/* 위치는 '맞추기' 에서만 — 로고는 자리가 정해져 있다(가로 TV 머리줄 매장 이름 옆 · 세로 TV 타이머 위). 리뷰 중-2·하-3 */}
            {curDisp.fit === 'contain' && (
              <>
                <Seg label="위치" testid="clk-bg-pos" value={curDisp.pos} disabled={busy} onPick={(pos) => pickDisplay({ pos })}
                  options={[['top', '위'], ['center', '가운데'], ['bottom', '아래']] as const} />
                <p className="t-desc text-ink-muted">위치는 이미지와 화면 비율이 달라 남는 칸이 생길 때만 달라져요.</p>
              </>
            )}
            {curDisp.fit === 'center' && (
              <>
                <Seg label="크기" testid="clk-bg-size" value={curDisp.size} disabled={busy} onPick={(size) => pickDisplay({ size })}
                  options={[[1, '작게'], [2, '보통'], [3, '크게']] as const} />
                <p className="t-desc text-ink-muted">가로 TV 는 상단 매장 이름 옆(세로로 긴 로고는 타이머 옆 오른쪽 위), 세로 TV 는 타이머 위 빈 자리에 들어가요 — 글자와 겹치지 않아요.</p>
              </>
            )}
            {curDisp.fit !== 'cover' && curPlate !== 'none' && (
              <div className="flex flex-wrap items-center gap-1.5" data-testid="clk-bg-dark">
                <p className="min-w-0 flex-1 text-2xs text-ink-secondary">
                  {curDisp.plate
                    ? (curPlate === 'light' ? '어두운 로고 — TV 바탕에 묻히지 않게 밝은 받침을 깔았어요' : 'TV 바탕과 색이 비슷한 로고 — 또렷하게 검은 받침을 깔았어요')
                    : '받침을 껐어요. TV 바탕에서 잘 안 보일 수 있어요'}
                </p>
                <button type="button" disabled={busy} onClick={() => pickDisplay({ plate: curDisp.plate ? 0 : undefined })}
                  className="btn-ghost min-h-11 px-3 text-2xs disabled:opacity-50">{curDisp.plate ? '받침 끄기' : '받침 켜기'}</button>
              </div>
            )}
            {curDisp.fit === 'cover' ? (
              <Seg label="어둡게" testid="clk-bg-shade" value={curDisp.shade} disabled={busy} onPick={(shade) => pickDisplay({ shade })}
                options={[[0, '기본'], [1, '더 어둡게'], [2, '아주 어둡게']] as const} />
            ) : (
              <p className="t-desc text-ink-muted">이미지 색은 그대로 두고, 타이머·레벨·상금 글자 뒤에만 어두운 판을 깔아요.</p>
            )}
          </div>
        )}
      </div>

      {/* 프리셋 — 기본 10종 · 모션 테마 15종(2026-09-30). 버튼은 같은 축소판이고, 모션 테마는 실제 장면을 정지 한 장으로 그린다. */}
      {([['', CLOCK_THEME_PRESETS.filter((p) => !p.ambience)], ['모션 테마 — 움직이는 배경(TV 에서 천천히 흐릅니다)', CLOCK_THEME_PRESETS.filter((p) => p.ambience)]] as [string, ClockThemePreset[]][]).map(([title, list]) => (
      <div key={title || 'base'}>
      {title && <p className="mb-1 text-2xs font-semibold text-ink-secondary">{title}</p>}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {list.map((p) => {
          const on = p.id === curPresetId && !!cur;
          const onDefault = p.id === DEFAULT_CLOCK_PRESET_ID && !cur; // 미설정 = 기본 프리셋 룩
          const active = on || onDefault;
          return (
            <button key={p.id} type="button" disabled={busy}
              onClick={() => pickPreset(p.id)}
              aria-pressed={active}
              className={['rounded-input border p-1.5 text-left transition-colors disabled:opacity-50',
                active ? 'border-accent-300' : 'border-border-default hover:border-accent-400/40'].join(' ')}>
              {/* 프리셋 버튼도 같은 축소판 — 배경색만 바뀌는 것이 아니라 타이머·accent·surface 대비가 실제로 보인다.
                  강조색은 '지금 고른 색'이 아니라 **그 프리셋의 색**으로 그려야 프리셋 간 비교가 성립한다
                  (활성 프리셋만 업주가 고른 색을 반영한다). */}
              <span className="block overflow-hidden rounded-input @container">
                <ClockMiniFace vars={clockThemeVars(makeClockTheme(p.id, active ? curAccentSel : undefined, null))}
                  accent={active && curAccentSel ? curAccentSel : p.accent} em={22} cqw={8.8} still />
              </span>
              <span className={['mt-1 block text-2xs font-semibold', active ? 'text-accent-300' : 'text-ink-secondary'].join(' ')}>{p.label}</span>
            </button>
          );
        })}
      </div>
      </div>
      ))}

      {/* accent 스와치 — 안전 색 10종에서만 선택(임의 색 입력 없음) */}
      <div>
        {/* 2026-09-11: '(타이머·상금 숫자)' 는 **틀린 설명**이었다 — 실제로 그렇게 동작하던 시절의 문구가
            남아 있었고, 그 동작 자체가 이번에 결함으로 판정돼 사라졌다. 강조색이 실제로 바꾸는 것만 적는다. */}
        <p className="mb-1 text-2xs font-semibold text-ink-secondary">강조색 <span className="font-normal text-ink-muted">— 레벨·현재 블라인드·진행률·프레임</span></p>
        <div className="flex flex-wrap gap-1.5">
          {CLOCK_ACCENT_SWATCHES.map((s) => {
            const on = s.value === curAccent;
            return (
              <button key={s.value} type="button" disabled={busy} title={s.label} aria-label={`강조색 ${s.label}`}
                aria-pressed={on}
                onClick={() => pickAccent(s.value)}
                className="grid h-11 w-11 place-items-center disabled:opacity-50">
                <span aria-hidden className={['h-7 w-7 rounded-full border-2 transition-colors',
                  on ? 'border-ink-primary' : 'border-transparent hover:border-ink-muted'].join(' ')}
                  style={{ backgroundColor: s.value }} />
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" disabled={busy || !cur} onClick={resetAll}
        className="btn-ghost px-3 text-2xs disabled:opacity-40">기본으로 되돌리기</button>
    </section>
  );
}
