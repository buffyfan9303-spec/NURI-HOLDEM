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
  clockPresetById, makeClockTheme, themeForPresetChange, sanitizeClockTheme, clockThemeVars, clockBgImageOf, type ClockTheme,
} from './clockTheme';
import { uploadClockBg, deleteClockBg } from './clockBgImage';

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
function ClockMiniFace({ vars, accent, em, className }: {
  vars: React.CSSProperties; accent: string; em: number; className?: string;
}) {
  const RAIL = 16; // TV 는 24칸 — 축소판에서는 셀 수 있는 만큼만
  const filled = 6;
  return (
    <div className={`relative flex aspect-[16/9] flex-col overflow-hidden text-white ${className ?? ''}`}
      style={{ ...vars, fontSize: `${em}px`, background: 'var(--clk-bg)' }} aria-hidden>
      {/* 상단 — LEVEL · 상태 */}
      <div className="flex shrink-0 items-center gap-[0.4em] px-[0.7em] pt-[0.5em]">
        <span className="h-[0.3em] w-[0.3em] rounded-full bg-emerald-400" />
        <span className="truncate text-[0.5em] font-bold" style={{ color: 'var(--clk-ink-soft)' }}>NURI</span>
        <span className="ml-auto rounded-full px-[0.5em] py-[0.1em] text-[0.42em] font-extrabold tracking-wider"
          style={{ color: accent, background: `color-mix(in srgb, ${accent} 16%, transparent)` }}>LEVEL 5</span>
        <span className="rounded-full px-[0.45em] py-[0.1em] text-[0.42em] font-extrabold tracking-wider"
          style={{ color: '#6ee7b7', background: 'rgba(110,231,183,0.14)' }}>RUNNING</span>
      </div>

      {/* 히어로 — 타이머 + 컬러별 아우라(강조색을 그대로 쓴 radial bloom 한 겹) + 진행률 레일 */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[3.4em] w-[6em] -translate-x-1/2 -translate-y-1/2"
          style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${accent} 22%, transparent), transparent)` }} />
        <span className="relative text-[1.75em] font-black leading-none tabular-nums" style={{ color: 'var(--clk-timer)' }}>12:34</span>
        <span className="relative mt-[0.35em] flex w-[70%] gap-[0.08em]">
          {Array.from({ length: RAIL }, (_, i) => (
            <span key={i} className="h-[0.16em] flex-1 rounded-[0.05em]"
              style={{ background: i < filled ? accent : 'rgba(255,255,255,0.08)' }} />
          ))}
        </span>
      </div>

      {/* CURRENT | NEXT */}
      <div className="grid shrink-0 grid-cols-2 gap-[0.3em] px-[0.6em]">
        <div className="rounded-[0.3em] bg-white/[0.05] py-[0.25em] text-center">
          <p className="text-[0.36em] font-bold tracking-[0.2em]" style={{ color: 'var(--clk-ink-soft)' }}>CURRENT</p>
          <p className="text-[0.62em] font-extrabold leading-tight tabular-nums" style={{ color: accent }}>500/1,000</p>
        </div>
        <div className="rounded-[0.3em] bg-white/[0.025] py-[0.25em] text-center">
          <p className="text-[0.36em] font-bold tracking-[0.2em]" style={{ color: 'var(--clk-ink-dim)' }}>NEXT</p>
          <p className="text-[0.55em] font-extrabold leading-tight tabular-nums text-white/70">1,000/2,000</p>
        </div>
      </div>

      {/* 하단 metrics rail */}
      <div className="flex shrink-0 items-baseline gap-[0.8em] border-t border-white/[0.07] px-[0.7em] py-[0.3em]">
        <span className="text-[0.38em]" style={{ color: 'var(--clk-ink-dim)' }}>생존 <b className="text-[1.3em] text-white">18</b>/42</span>
        <span className="text-[0.38em]" style={{ color: 'var(--clk-ink-dim)' }}>평균 <b className="text-[1.3em] text-white">84,000</b></span>
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

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    getVenuePageConfig(venueId)
      .then((c) => { if (alive) setTheme(sanitizeClockTheme(c?.clockTheme)); })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [venueId]);

  const cur = theme;
  const curPresetId = cur?.background?.preset ?? cur?.palette?.preset ?? DEFAULT_CLOCK_PRESET_ID;
  const curPreset = clockPresetById(curPresetId) ?? CLOCK_THEME_PRESETS[0];
  const curAccentSel = cur?.palette?.accent;              // 업주가 고른 강조색(없으면 프리셋 기본)
  const curAccent = curAccentSel ?? curPreset.accent;
  const curImage = clockBgImageOf(cur);

  /** clockTheme 키만 교체 저장. 성공 시 남은 옛 배경 파일을 정리(저장 성공 후에만 — 순서가 계약이다) */
  const persist = async (next: ClockTheme | null, orphan?: string | null) => {
    setBusy(true);
    try {
      const latest = (await getVenuePageConfig(venueId)) ?? {};
      const merged: VenuePageConfig = { ...latest };
      if (next) merged.clockTheme = next; else delete merged.clockTheme;
      await setVenuePageConfig(venueId, merged);
      if (aliveRef.current) setTheme(next);
      if (orphan) void deleteClockBg(orphan);
      return true;
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장 실패', 'error');
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
      toast.show('클락 화면 테마를 저장했습니다. TV 송출에 바로 반영됩니다', 'success');
    }
  };
  const pickAccent = async (v: string) => {
    if (await persist(makeClockTheme(curPresetId, v, curImage))) {
      toast.show('강조색을 저장했습니다', 'success');
    }
  };

  const pickImage = async (file: File | null) => {
    if (!file) return;
    setBusy(true); setStage('이미지 처리 중…');
    try {
      const url = await uploadClockBg(venueId, file);
      setStage('저장 중…');
      const ok = await persist(makeClockTheme(curPresetId, curAccentSel, url), curImage);
      if (ok) toast.show('배경 이미지를 등록했습니다. 글자가 잘 보이도록 자동으로 어둡게 처리됩니다', 'success');
      else void deleteClockBg(url); // 저장 실패분은 고아로 남기지 않는다
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '업로드 실패', 'error');
    } finally { if (aliveRef.current) { setBusy(false); setStage(null); } }
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
      <p className="py-10 text-center text-2xs text-ink-muted">클락 화면 설정 불러오는 중…</p>
    </section>;
  }

  const previewVars = clockThemeVars(cur);

  return (
    <section className="rounded-aura border card-aura p-3 space-y-2.5">
      <div>
        <h3 className="text-sm font-bold text-ink-primary">클락 화면 <span className="text-2xs font-normal text-ink-muted">(TV 송출 · 관전 화면)</span></h3>
        <p className="mt-0.5 text-2xs text-ink-muted">
          손님이 보는 큰 화면의 배경·강조색입니다. 누르면 바로 저장돼요.
          긴급(1분 미만) 적색·브레이크 청색 표시는 테마와 무관하게 유지됩니다.
        </p>
      </div>

      {/* 실제 합성 미리보기 — 배경 이미지 + 가독 보호 오버레이 + 강조색을 송출 화면과 같은 순서로 겹친다 */}
      <div className="overflow-hidden rounded-input border border-border-subtle" aria-label="클락 화면 미리보기">
        <ClockMiniFace vars={previewVars} accent={curAccent} em={44} />
      </div>

      {/* 배경 이미지 — 업로드 / 교체 / 제거 */}
      <div className="rounded-input border border-border-subtle bg-surface-high p-2.5 space-y-1.5">
        <p className="text-2xs font-semibold text-ink-secondary">배경 이미지 <span className="font-normal text-ink-muted">(매장 사진·로고 · 선택)</span></p>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className={['btn-ghost text-2xs px-3 py-1.5', busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'].join(' ')}>
            {stage ?? (curImage ? '이미지 변경' : '이미지 올리기')}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0] ?? null; e.currentTarget.value = ''; void pickImage(f); }} />
          </label>
          {curImage && (
            <button type="button" onClick={removeImage} disabled={busy}
              className="rounded-input border border-danger/40 px-3 py-1.5 text-2xs font-semibold text-danger-light hover:bg-danger/10 disabled:opacity-40">배경 제거</button>
          )}
        </div>
        <p className="text-2xs text-ink-muted">
          최대 1920px·WebP 로 자동 변환하고, <span className="font-semibold text-ink-secondary">글자가 묻히지 않도록 밝기를 자동으로 낮춥니다</span>
          (밝은 사진일수록 더 어둡게). 배경을 넣지 않으면 위 테마 색만 나갑니다.
        </p>
      </div>

      {/* 프리셋 9종 — 미리보기 사각형(배경 = 실제 CSS 값, 프리셋 상수라 인라인 hex 허용) */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {CLOCK_THEME_PRESETS.map((p) => {
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
              <span className="block overflow-hidden rounded-input">
                <ClockMiniFace vars={clockThemeVars(makeClockTheme(p.id, active ? curAccentSel : undefined, null))}
                  accent={active && curAccentSel ? curAccentSel : p.accent} em={22} />
              </span>
              <span className={['mt-1 block text-2xs font-semibold', active ? 'text-accent-300' : 'text-ink-secondary'].join(' ')}>{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* accent 스와치 — 안전 색 10종에서만 선택(임의 색 입력 없음) */}
      <div>
        {/* 2026-09-11: '(타이머·상금 숫자)' 는 **틀린 설명**이었다 — 실제로 그렇게 동작하던 시절의 문구가
            남아 있었고, 그 동작 자체가 이번에 결함으로 판정돼 사라졌다. 강조색이 실제로 바꾸는 것만 적는다. */}
        <p className="mb-1 text-2xs font-semibold text-ink-secondary">강조색 <span className="font-normal text-ink-muted">— 레벨·현재 블라인드·진행률·프레임</span></p>
        <p className="mb-1.5 text-2xs text-ink-muted break-keep">타이머는 흰색, 긴급은 빨강, 브레이크는 하늘색, 프라이즈는 금색으로 유지됩니다.</p>
        <div className="flex flex-wrap gap-1.5">
          {CLOCK_ACCENT_SWATCHES.map((s) => {
            const on = s.value === curAccent;
            return (
              <button key={s.value} type="button" disabled={busy} title={s.label} aria-label={`강조색 ${s.label}`}
                aria-pressed={on}
                onClick={() => pickAccent(s.value)}
                className={['h-7 w-7 rounded-full border-2 transition-colors disabled:opacity-50',
                  on ? 'border-ink-primary' : 'border-transparent hover:border-ink-muted'].join(' ')}
                style={{ backgroundColor: s.value }} />
            );
          })}
        </div>
      </div>

      <button type="button" disabled={busy || !cur} onClick={resetAll}
        className="btn-ghost px-3 text-2xs disabled:opacity-40">기본으로 되돌리기</button>
    </section>
  );
}
