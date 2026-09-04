// src/components/features/clock/ClockThemePanel.tsx
// 클락 화면(TV 송출) 테마 — 프리셋 6종 · 강조색 10종 · 매장 배경 이미지 업로드.
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
  clockPresetById, makeClockTheme, sanitizeClockTheme, clockThemeVars, clockBgImageOf, type ClockTheme,
} from './clockTheme';
import { uploadClockBg, deleteClockBg } from './clockBgImage';

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

  const pickPreset = async (id: string) => {
    if (await persist(makeClockTheme(id, curAccentSel, curImage))) {
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
        <div className="flex aspect-[16/9] max-h-40 flex-col items-center justify-center text-white"
          style={{ ...previewVars, background: 'var(--clk-bg)' }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--clk-ink-soft)' }}>LEVEL 5</p>
          <p className="text-lg font-extrabold leading-none tabular-nums">1,000 / 2,000</p>
          <p className="text-3xl font-extrabold leading-none tabular-nums" style={{ color: 'var(--clk-timer)' }}>12:34</p>
          <p className="mt-1 text-[10px]" style={{ color: 'var(--clk-ink-dim)' }}>생존 / 엔트리 · 18 / 42</p>
        </div>
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

      {/* 프리셋 6종 — 미리보기 사각형(배경 = 실제 CSS 값, 프리셋 상수라 인라인 hex 허용) */}
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
              <span className="flex h-12 items-center justify-center rounded-input" style={{ background: p.bg }}>
                <span className="text-sm font-extrabold tabular-nums" style={{ color: active && cur ? curAccent : p.accent }}>12:34</span>
              </span>
              <span className={['mt-1 block text-2xs font-semibold', active ? 'text-accent-300' : 'text-ink-secondary'].join(' ')}>{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* accent 스와치 — 안전 색 10종에서만 선택(임의 색 입력 없음) */}
      <div>
        <p className="mb-1 text-2xs font-semibold text-ink-secondary">강조색 <span className="font-normal text-ink-muted">(타이머·상금 숫자)</span></p>
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
