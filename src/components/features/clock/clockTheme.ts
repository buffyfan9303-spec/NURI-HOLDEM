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
  /** image: 매장이 올린 배경 사진(우리 스토리지 공개 URL만 — sanitize 가 호스트·버킷·경로를 대조) */
  background?: { kind: 'solid' | 'gradient' | 'felt'; preset: string; image?: string };
}

/** 현행 ClockDisplay 하드코딩 값 — 변수 기본값의 단일 출처(스냅샷 불변 계약) */
export const CLOCK_DEFAULTS = {
  bg: '#06080B',           // 루트 bg-[#06080B]
  accent: '#5E6AD2',       // 구 accent-300 스냅샷 — 도메인 고정(타이머·상금·강조 스탯).
                           // ⚠ DB 저장값이 이 허용 목록과 대조(sanitize)되므로 값 변경 = 기존 매장 테마 무효화.
                           //   2026-08-27 앱 accent 플럼 이동과 무관하게 TV 송출 계약(픽셀 변화 0)을 지킨다.
  timerUrgent: '#fb7185',  // rose-400 — 잠금(1분 미만 긴급)
  timerBreak: '#7dd3fc',   // sky-300 — 잠금(브레이크)
  // 보조 라벨 2단 — 기본값은 현행 text-white/45 · text-white/50 과 1:1(배경 이미지 없으면 픽셀 변화 0).
  inkDim: 'rgba(255,255,255,0.45)',
  inkSoft: 'rgba(255,255,255,0.5)',
} as const;

// ── 배경 이미지(TV 송출) — 가독 보호 계약 ────────────────────────────────────
// 배경 사진이 밝으면 그 위 텍스트가 곧바로 안 보이는 화면이 된다. 밝기를 **두 단계**로 잠근다.
//   ① 업로드 시(clockBgImage.ts): 리사이즈본을 32×18 셀로 요약해 **가장 밝은 셀**을 찾고,
//      "그 셀이 스크림까지 통과한 뒤의 상대휘도 ≤ LUM_CAP"이 되는 배율을 이분탐색해 검은색을 구워 넣는다.
//      → 밝은 사진일수록 더 눌리고, 이미 어두운 사진은 손대지 않는다(자동 노출 고정과 같은 원리).
//   ② 렌더 시: SCRIM(고정 스크림)을 이미지 위에 깔아 중앙 밴드 투과율 SCRIM_MID 로 한 번 더 낮춘다.
//
// 왜 sRGB 평균이 아니라 상대휘도인가: 대비 계산이 쓰는 척도가 상대휘도라, sRGB 근사로 자르면
// 노랑처럼 채널 합은 큰데 휘도 가중이 다른 색에서 목표를 넘긴다(순노랑 실측 2.96:1 로 미달했다).
//
// 실측(순백/순노랑/하늘/살구 — 어떤 밝은 사진이든 상한에 걸려 같은 밝기로 수렴한다.
//       Chromium 캔버스 실측 최댓값 0.02303, 아래 표는 상한 0.0233 기준의 보수적 값):
//   흰색 14.3:1 · white/90 11.9 · white/85 10.8 · white/65 6.9 · white/55 5.4
//   · --clk-ink-dim(.45→.62) 6.5 · --clk-ink-soft(.50→.66) 7.1
//   · SB/BB 슬래시 white/40 3.6(대형) · 긴급 rose 5.3 · 브레이크 sky 8.6
//   · **가장 어두운 accent #5E6AD2(인디고) 3.05:1** ← 이 값이 LUM_CAP 을 정한 구속 조건이다.
//     타이머는 clamp(72px…) 대형 텍스트라 기준이 3:1. LUM_CAP 을 올리면 여기가 먼저 깨진다.
// (참고 기준선 — 배경 없음 #06080B: white/45 4.48 · white/55 6.26 · 인디고 4.27)
export const CLOCK_BG_BUCKET = 'clock_bg';
/** 스크림 통과 후 허용하는 배경 최대 상대휘도(WCAG relative luminance) */
export const CLOCK_BG_LUM_CAP = 0.0233;
/** 렌더 스크림의 중앙 밴드 투과율 — 아래 CLOCK_BG_SCRIM 의 rgba(0,0,0,.42) 와 한 쌍(같이 고쳐야 한다) */
export const CLOCK_BG_SCRIM_MID = 0.58;
/** 렌더 스크림 — 중앙 0.42, 상·하단은 헤더/스탯 스트립이 앉으므로 더 강하게(상단 실측 0.0150) */
export const CLOCK_BG_SCRIM =
  'linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.42) 20%, rgba(0,0,0,.42) 80%, rgba(0,0,0,.58) 100%)';
/** 배경 이미지가 있을 때만 올리는 보조 라벨 2단 — 위 실측표의 근거값 */
export const CLOCK_BG_INK = { dim: 'rgba(255,255,255,0.62)', soft: 'rgba(255,255,255,0.66)' } as const;
/** 업로드 규격 — 최대 변, 목표 용량 */
export const CLOCK_BG_MAX_PX = 1920;
export const CLOCK_BG_TARGET_BYTES = 500_000;

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

/**
 * 배경 이미지 URL 허용 조건 — **우리 스토리지의 clock_bg 공개 경로만**.
 * page_config 는 업주가 쓰는 자유 JSON 이라, 검증이 없으면 임의 외부 URL 이 매장 TV 에 그대로 뜬다
 * (외부 호스트 주입 · 추적 픽셀 · CSS 문자열 탈출). 접두사를 빌드타임 SUPABASE_URL 에서 만들고,
 * CSS url("…") 안에 들어가므로 따옴표·괄호·공백·역슬래시가 하나라도 있으면 거절한다.
 */
const CLOCK_BG_URL_PREFIX: string | null = (() => {
  const base = (import.meta.env?.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
  return base ? `${base}/storage/v1/object/public/${CLOCK_BG_BUCKET}/` : null;
})();

export function isAllowedClockBgUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 512) return false;
  if (!CLOCK_BG_URL_PREFIX) return false;              // 환경변수 없음(mock) = 어떤 URL 도 신뢰 안 함
  if (!v.startsWith(CLOCK_BG_URL_PREFIX)) return false;
  return !/["'()\\\s]/.test(v) && !v.includes('..');
}

/** 프리셋 id(+선택 accent·배경 이미지)로 저장용 테마 객체 생성 — 허용 목록 밖 값은 버린다 */
export function makeClockTheme(presetId: string, accent?: string, image?: string | null): ClockTheme {
  const p = clockPresetById(presetId) ?? CLOCK_THEME_PRESETS[0];
  const t: ClockTheme = {
    version: 1,
    palette: { preset: p.id },
    background: { kind: p.kind, preset: p.id },
  };
  if (isAllowedAccent(accent)) t.palette = { preset: p.id, accent };
  if (isAllowedClockBgUrl(image)) t.background = { kind: p.kind, preset: p.id, image };
  return t;
}

/** DB 에서 온 미지의 값 검증 — 버전·프리셋·accent·배경 URL 전부 허용 목록 대조. 불합격 = null(기본 룩) */
export function sanitizeClockTheme(raw: unknown): ClockTheme | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ClockTheme>;
  if (r.version !== 1) return null;
  const p = clockPresetById(r.background?.preset ?? r.palette?.preset);
  if (!p) return null;
  const accent = r.palette?.accent;
  const image = r.background?.image;
  return makeClockTheme(
    p.id,
    isAllowedAccent(accent) ? accent : undefined,
    isAllowedClockBgUrl(image) ? image : null,
  );
}

/** 공개 URL → 버킷 내 객체 경로(`<venueId>/<ts>.webp`). 허용 목록 밖이면 null — 삭제 대상 산출용 */
export function clockBgObjectPath(url: string): string | null {
  if (!isAllowedClockBgUrl(url) || !CLOCK_BG_URL_PREFIX) return null;
  return url.slice(CLOCK_BG_URL_PREFIX.length) || null;
}

/** 테마에서 배경 이미지 URL 만 꺼낸다(검증 통과분만) — 설정 화면 미리보기·삭제 버튼용 */
export function clockBgImageOf(theme: ClockTheme | null | undefined): string | null {
  const v = theme?.background?.image;
  return isAllowedClockBgUrl(v) ? v : null;
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
  const base = p?.bg ?? CLOCK_DEFAULTS.bg;
  const img = clockBgImageOf(t);
  // 배경 이미지: 스크림(맨 위) → 사진 → 프리셋 배경(맨 아래) 3층 합성.
  // background 단축 속성은 색을 **마지막 레이어**에만 허용하므로 프리셋 색/그라디언트가 항상 끝에 온다.
  // 애니메이션·filter·will-change 없음(상시 표출 TV — 1회 디코드 후 정적).
  return {
    '--clk-bg': img ? `${CLOCK_BG_SCRIM}, url("${img}") center/cover no-repeat, ${base}` : base,
    '--clk-accent': accent,
    '--clk-timer': accent,
    '--clk-timer-urgent': CLOCK_DEFAULTS.timerUrgent, // 잠금
    '--clk-timer-break': CLOCK_DEFAULTS.timerBreak,   // 잠금
    '--clk-ink-dim': img ? CLOCK_BG_INK.dim : CLOCK_DEFAULTS.inkDim,
    '--clk-ink-soft': img ? CLOCK_BG_INK.soft : CLOCK_DEFAULTS.inkSoft,
  };
}

/** ClockDisplay 테마 스냅샷 키(lib/snapshot) — venue 별 keep-last 캐시 */
export const clockThemeSnapKey = (venueId: string) => `clockTheme:${venueId}`;
