// src/components/features/clock/clockTheme.ts — 클락 테마 v1 (TV 송출 개인화)
//
// 데이터: venues.page_config.clockTheme 한 키(스키마 변경 0). clock_states.config 에는
// 절대 넣지 않는다(초당 hot-write 라 테마가 드리프트한다).
//
// 원칙:
// · 프리셋 6종 전부 다크 · 대비 잠금 — 임의 커스텀 색 입력 없음(스와치 선택만).
// · 모든 CSS 변수의 기본값 = ClockDisplay 현행 하드코딩 값과 1:1.
//   테마 미설정·로드 실패 시 픽셀 변화 0.
// · 타이머 긴급(rose-400)·브레이크(sky-300) 상태색은 프리셋이 덮지 못한다 — 송출 안전 신호 잠금.

export interface ClockTheme {
  version: 1;
  palette?: { preset: string; accent?: string };
  background?: { kind: 'solid' | 'gradient' | 'felt'; preset: string };
}

/** 현행 ClockDisplay 하드코딩 값 — 변수 기본값의 단일 출처(스냅샷 불변 계약) */
export const CLOCK_DEFAULTS = {
  bg: '#06080B',           // 루트 bg-[#06080B]
  accent: '#5E6AD2',       // accent-300 (타이머·상금·강조 스탯)
  timerUrgent: '#fb7185',  // rose-400 — 잠금(1분 미만 긴급)
  timerBreak: '#7dd3fc',   // sky-300 — 잠금(브레이크)
} as const;

export interface ClockThemePreset {
  id: string;
  label: string;
  kind: 'solid' | 'gradient' | 'felt';
  /** CSS background 값(순수 CSS — 이미지 없음) */
  bg: string;
  /** 프리셋 기본 accent(스와치에서 별도 선택 시 대체) */
  accent: string;
}

// 6종 — 전부 다크. deep-indigo 는 현행 룩과 동일(기본).
export const CLOCK_THEME_PRESETS: ClockThemePreset[] = [
  { id: 'deep-indigo', label: '딥 인디고(기본)', kind: 'solid', bg: CLOCK_DEFAULTS.bg, accent: CLOCK_DEFAULTS.accent },
  {
    id: 'midnight-felt', label: '미드나잇 펠트', kind: 'felt',
    bg: 'radial-gradient(120% 90% at 50% 18%, #0E3524 0%, #081711 60%, #04080A 100%)',
    accent: '#34D399',
  },
  {
    id: 'royal-burgundy', label: '로열 버건디', kind: 'gradient',
    bg: 'radial-gradient(120% 90% at 50% 15%, #3B0D18 0%, #1B060C 62%, #0B0406 100%)',
    accent: '#E0A94E',
  },
  // 번인 최소 — 순흑 단색 + 채도 낮은 강조(장시간 정지 화면 대비)
  { id: 'carbon', label: '카본(번인 최소)', kind: 'solid', bg: '#000000', accent: '#94A3B8' },
  {
    id: 'neon-night', label: '네온 나이트', kind: 'gradient',
    bg: 'linear-gradient(160deg, #0B0716 0%, #130B26 48%, #060409 100%)',
    accent: '#22D3EE',
  },
  {
    id: 'black-gold', label: '블랙 골드', kind: 'gradient',
    bg: 'radial-gradient(120% 90% at 50% 18%, #171204 0%, #0C0A05 62%, #060503 100%)',
    accent: '#FCD535',
  },
];

export const DEFAULT_CLOCK_PRESET_ID = 'deep-indigo';

export function clockPresetById(id: string | undefined | null): ClockThemePreset | null {
  if (!id) return null;
  return CLOCK_THEME_PRESETS.find((p) => p.id === id) ?? null;
}

// accent 스와치 — 다크 배경 대비가 검증된 10색만(임의 색 입력 금지)
export const CLOCK_ACCENT_SWATCHES: { value: string; label: string }[] = [
  { value: '#5E6AD2', label: '인디고' },
  { value: '#38BDF8', label: '스카이' },
  { value: '#22D3EE', label: '시안' },
  { value: '#34D399', label: '에메랄드' },
  { value: '#A3E635', label: '라임' },
  { value: '#FCD535', label: '골드' },
  { value: '#F59E0B', label: '앰버' },
  { value: '#E0A94E', label: '샴페인' },
  { value: '#A78BFA', label: '바이올렛' },
  { value: '#F472B6', label: '핑크' },
];

const isAllowedAccent = (v: unknown): v is string =>
  typeof v === 'string' && CLOCK_ACCENT_SWATCHES.some((s) => s.value === v);

/** 프리셋 id(+선택 accent)로 저장용 테마 객체 생성 — 허용 목록 밖 값은 버린다 */
export function makeClockTheme(presetId: string, accent?: string): ClockTheme {
  const p = clockPresetById(presetId) ?? CLOCK_THEME_PRESETS[0];
  const t: ClockTheme = {
    version: 1,
    palette: { preset: p.id },
    background: { kind: p.kind, preset: p.id },
  };
  if (isAllowedAccent(accent)) t.palette = { preset: p.id, accent };
  return t;
}

/** DB 에서 온 미지의 값 검증 — 버전·프리셋·accent 전부 허용 목록 대조. 불합격 = null(기본 룩) */
export function sanitizeClockTheme(raw: unknown): ClockTheme | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ClockTheme>;
  if (r.version !== 1) return null;
  const p = clockPresetById(r.background?.preset ?? r.palette?.preset);
  if (!p) return null;
  const accent = r.palette?.accent;
  return makeClockTheme(p.id, isAllowedAccent(accent) ? accent : undefined);
}

/**
 * 테마 → 루트 컨테이너 인라인 CSS 변수.
 * --clk-timer / --clk-timer-urgent / --clk-timer-break 3변수 분리(검증 #04) —
 * urgent·break 는 어떤 프리셋도 덮지 못하는 상수(적색 긴급·청색 브레이크 신호 보존).
 */
export function clockThemeVars(theme: ClockTheme | null | undefined): Record<string, string> {
  const t = sanitizeClockTheme(theme);
  const p = t ? clockPresetById(t.background?.preset ?? t.palette?.preset) : null;
  const accent = t?.palette?.accent && isAllowedAccent(t.palette.accent)
    ? t.palette.accent
    : (p?.accent ?? CLOCK_DEFAULTS.accent);
  return {
    '--clk-bg': p?.bg ?? CLOCK_DEFAULTS.bg,
    '--clk-accent': accent,
    '--clk-timer': accent,
    '--clk-timer-urgent': CLOCK_DEFAULTS.timerUrgent, // 잠금
    '--clk-timer-break': CLOCK_DEFAULTS.timerBreak,   // 잠금
  };
}

/** ClockDisplay 테마 스냅샷 키(lib/snapshot) — venue 별 keep-last 캐시 */
export const clockThemeSnapKey = (venueId: string) => `clockTheme:${venueId}`;
