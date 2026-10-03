// src/components/features/clock/clockTheme.ts — 클락 테마 v1 (TV 송출 개인화)
//
// 데이터: venues.page_config.clockTheme 한 키(스키마 변경 0). clock_states.config 에는
// 절대 넣지 않는다(초당 hot-write 라 테마가 드리프트한다).
//
// 원칙:
// · 프리셋 9종 전부 다크 · 대비 잠금 — 임의 커스텀 색 입력 없음(스와치 선택만).
// · 모든 CSS 변수의 기본값 = ClockDisplay 현행 하드코딩 값과 1:1.
//   테마 미설정·로드 실패 시 픽셀 변화 0.
// · 타이머 긴급(rose-400)·브레이크(sky-300) 상태색은 프리셋이 덮지 못한다 — 송출 안전 신호 잠금.

import { readSnap, writeSnap } from '../../../lib/snapshot';
import { AMBIENCE_PRESETS, ambienceBgCss } from './ambience/ambiencePresets';

export interface ClockTheme {
  version: 1;
  palette?: { preset: string; accent?: string };
  /** image: 매장이 올린 배경 사진(우리 스토리지 공개 URL만 — sanitize 가 호스트·버킷·경로를 대조) */
  background?: { kind: 'solid' | 'gradient' | 'felt'; preset: string; image?: string } & ClockBgDisplay;
}

/**
 * N-2(2026-10-03 오너 결정) — 매장이 올린 이미지(사진·자기 로고)를 **어떻게 놓을지**.
 *  · fit  cover(기본 — 종전 그대로, 사진용) · contain(잘림 없이 맞추기 — 남는 곳은 이미지 대표색) · center('로고로 넣기' — 투명 PNG 그대로)
 *  · pos  center(기본) · top · bottom — contain 에서만 의미가 있다(로고는 자리가 정해져 있다)
 *  · size 1·2·3 — 로고 크기 단계. 가로 보드는 머리줄 로고 칸 높이(짧은 변 5·6·7%), 세로 보드는 타이머 위 빈 자리 상한(20·32·44%)
 *  · plate 0 — 어두운 로고의 자동 밝은 받침 끄기(기본 = 자동)
 *  · shade 0·1·2 — cover 의 어둡게 단계. 0 = 업로드 때 잰 밝기 상한 그대로(종전), 1·2 는 그보다 더 어둡게만(상한을 풀지 않는다)
 * 저장 값은 enum 문자열·작은 정수뿐이다(URL 아님). **기본값은 저장하지 않는다** — 옛 매장의 테마 객체는 한 글자도 안 바뀐다.
 */
export type ClockBgFit = 'cover' | 'contain' | 'center';
export type ClockBgPos = 'center' | 'top' | 'bottom';
export interface ClockBgDisplay { fit?: ClockBgFit; pos?: ClockBgPos; size?: 1 | 2 | 3; shade?: 0 | 1 | 2; plate?: 0 | 1 }
export const CLOCK_BG_FITS: readonly ClockBgFit[] = ['cover', 'contain', 'center'];
export const CLOCK_BG_POSES: readonly ClockBgPos[] = ['center', 'top', 'bottom'];
/** 로고 크기 단계(짧은 변 대비 %). head = 가로 보드 머리줄 로고 칸 높이(머리줄 8), tall = 세로 보드 타이머 위 자리의 높이 상한.
 *  리뷰(2026-10-03 중-2): 보드 한가운데 겹쳐 깔면 타이머 판 뒤에 65~96% 가려졌다 → 글자 판과 겹치지 않는 **자기 자리**(흐름 안의 칸)에만 그린다. */
export const CLOCK_LOGO_SIZE = { head: { 1: 5, 2: 6, 3: 7 }, tall: { 1: 20, 2: 32, 3: 44 } } as const;
/** 어두운 로고 받침(중-3) — 로고 뒤에만 까는 은은한 밝은 둥근 판. '맞추기' 의 남는 칸은 밝은 중립색. */
export const CLOCK_LOGO_PLATE = 'rgba(236,239,245,0.9)';
export const CLOCK_LIGHT_NEUTRAL = '#D9DDE5';
/** 대비가 모자란 **중간 밝기** 로고(빨강 등) 받침 — 검은 판. 밝은 판은 그 로고 안의 흰 글자를 지운다(1.2:1). */
export const CLOCK_LOGO_PLATE_DARK = '#000000';
/** 로고 칸(머리줄·타이머 위) 바탕의 **실측** 상대휘도 상한. 재점검 2회차 하-A(2026-10-04): 예전 문턱은 바탕을 #06080F(0.0025)로 가정했는데
 *  기본 테마(nuri-signature) 머리줄은 0.0165 라 빨간 로고가 2.72:1 이었다. 1920×1080 · 프리셋 25종의 로고 칸 p90 최댓값 0.0177(whale-light) → 0.018. */
export const CLOCK_LOGO_BG_LUM = 0.018;
export type ClockLogoPlate = 'none' | 'dark' | 'light';
/** 밝은 받침을 금지하는 밝은 픽셀(휘도 ≥ 0.6) 비율 — 흰 글자+검은 테두리 로고는 밝은 판 위에서 흰 면이 1.21:1 로 지워졌다(검토 중-2). */
export const CLOCK_LOGO_BRIGHT_MAX = 0.15;
/** 로고 픽셀 휘도 → 받침.
 *  edge = **가장자리** 픽셀(불투명인데 이웃이 투명·그림 밖) — 받침이 실제로 닿는 곳. 안쪽 글자·테두리는 바탕과 맞닿지 않아 판정에서 뺀다
 *         (금색 원형 로고가 안쪽 갈색 글자 때문에 쓸모없는 검은 판을 받았다 — 검토 중-1).
 *  all  = 불투명 픽셀 전부 — 밝은 픽셀 비율만 본다.
 *  가장자리 **하위 10%** 가 실제 바탕과 3:1 이상이면 받침 없음, 아니면 검은 판(밝기 ≥ 0.1 이면 3:1) 또는 밝은 판.
 *  밝은 판은 밝은 픽셀이 15% 를 넘으면 쓰지 않는다(그 면을 지운다) — 그때는 받침 없음. */
export function clockLogoPlateKind(edge: readonly number[], all: readonly number[] = edge): ClockLogoPlate {
  if (!edge.length) return 'none';
  const l = [...edge].sort((a, b) => a - b)[Math.floor(edge.length * 0.1)];
  if ((l + 0.05) / (CLOCK_LOGO_BG_LUM + 0.05) >= 3) return 'none';
  if ((l + 0.05) / 0.05 >= 3) return 'dark';
  return all.filter((v) => v >= 0.6).length > all.length * CLOCK_LOGO_BRIGHT_MAX ? 'none' : 'light';
}
/** cover 의 어둡게 단계 → 상한 위에 더하는 비율(남은 밝기의 몇 %를 더 누르나). 0 은 종전과 같다. */
export const CLOCK_BG_SHADE_EXTRA = [0, 0.3, 0.55] as const;
/** contain·center 에서 글자 뒤에만 까는 판. 전체를 누르지 않으므로 로고 색이 산다.
 *  알파 0.88 — 판 뒤가 **순백**이어도 합성 상대휘도가 상한(0.0233) 근처라 가장 어두운 강조색(인디고)까지 3:1·본문 4.5:1 을 지킨다(clockTheme.test 계산 · e2e 픽셀 실측). */
export const CLOCK_PLATE_ALPHA = 0.88;
export const CLOCK_PLATE = `rgba(6,8,15,${CLOCK_PLATE_ALPHA})`;

const isFit = (v: unknown): v is ClockBgFit => typeof v === 'string' && (CLOCK_BG_FITS as readonly string[]).includes(v);
const isPos = (v: unknown): v is ClockBgPos => typeof v === 'string' && (CLOCK_BG_POSES as readonly string[]).includes(v);
const isSize = (v: unknown): v is 1 | 2 | 3 => v === 1 || v === 2 || v === 3;
const isShade = (v: unknown): v is 0 | 1 | 2 => v === 0 || v === 1 || v === 2;
type DispFull = Required<ClockBgDisplay>;

/** 표시 설정 정규화 — 화이트리스트 밖·기본값은 버린다(저장 객체에 기본값을 남기지 않는다). */
export function normalizeClockBgDisplay(d: unknown): ClockBgDisplay {
  const r = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
  const out: ClockBgDisplay = {};
  if (isFit(r.fit) && r.fit !== 'cover') out.fit = r.fit;
  if (isPos(r.pos) && r.pos !== 'center') out.pos = r.pos;
  if (isSize(r.size) && r.size !== 2) out.size = r.size;
  if (isShade(r.shade) && r.shade !== 0) out.shade = r.shade;
  if (r.plate === 0) out.plate = 0;
  return out;
}

/** 테마 → 표시 설정(기본값까지 채운 꼴). */
export function clockBgDisplayOf(theme: ClockTheme | null | undefined): DispFull {
  const n = normalizeClockBgDisplay(theme?.background);
  return { fit: n.fit ?? 'cover', pos: n.pos ?? 'center', size: n.size ?? 2, shade: n.shade ?? 0, plate: n.plate ?? 1 };
}

/**
 * 업로드 때 잰 값은 **파일 이름**에 싣는다 — `<ts>[-a36][-m]-d37-t1a2b3c[-k].webp`(a = 폭/높이 ×100, d = 밝기 상한까지 누를 비율 %, t = 대표색, k = 어두운 로고 → 밝은 받침, m = 중간 밝기 로고 → 검은 받침).
 * 왜 테마 키가 아니라 이름인가: 이름은 URL 과 한 몸이라 옛 번들이 테마를 다시 저장해도(모르는 키는 버린다) 떨어지지 않는다.
 * 이름표가 없는 옛 파일은 업로드 때 이미 밝기를 구워 둔 것이라 d = 0 이 정답이다(종전 렌더와 같다).
 */
export function clockBgMetaOf(url: string | null | undefined): { dim: number; tint: string | null; plate: ClockLogoPlate; ar: number | null } {
  // -a(폭/높이 ×100)·-m(검은 판)은 -d **앞**에 붙인다 — 옛 번들의 정규식(-d…$)이 그대로 맞아 d·t 를 계속 읽는다.
  const m = url ? /(?:-a(\d{1,4}))?(-m)?-d(\d{1,2})(?:-t([0-9a-f]{6}))?(-k)?\.(?:webp|jpe?g|png)$/.exec(url) : null;
  if (!m) return { dim: 0, tint: null, plate: 'none', ar: null };
  return { dim: Math.min(95, Number(m[3])) / 100, tint: m[4] ? `#${m[4]}` : null, plate: m[5] ? 'light' : m[2] ? 'dark' : 'none', ar: m[1] ? Number(m[1]) / 100 : null };
}

/** 이 테마의 이미지에 자동 받침이 붙는가(받침 끄기와 무관한 판정) — 설정 화면 안내용. */
export function clockLogoPlateOf(theme: ClockTheme | null | undefined): ClockLogoPlate {
  const img = clockBgImageOf(theme);
  return img ? clockBgMetaOf(img).plate : 'none';
}

/** 아우라 골드(기본 테마 v2, 2026-09-02 오너 지시) — 순흑 + 금빛 보케(정적 radial-gradient 9겹 · 이미지·애니 없음).
 *  참조: APIS 클락 화면(검정 바탕 · 금색 보케 · 흰 대형 타이머 · 금색 레벨/블라인드). 매장 TV 라 페인트 1회 후 정적. */
export const AURA_GOLD_BG =
  'radial-gradient(9vmin 9vmin at 12% 78%, rgba(224,169,78,.22) 0%, transparent 70%), ' +
  'radial-gradient(5vmin 5vmin at 22% 92%, rgba(224,169,78,.18) 0%, transparent 70%), ' +
  'radial-gradient(7vmin 7vmin at 34% 84%, rgba(224,169,78,.14) 0%, transparent 70%), ' +
  'radial-gradient(4vmin 4vmin at 44% 95%, rgba(224,169,78,.20) 0%, transparent 70%), ' +
  'radial-gradient(8vmin 8vmin at 62% 88%, rgba(224,169,78,.16) 0%, transparent 70%), ' +
  'radial-gradient(5vmin 5vmin at 74% 80%, rgba(224,169,78,.20) 0%, transparent 70%), ' +
  'radial-gradient(10vmin 10vmin at 88% 90%, rgba(224,169,78,.14) 0%, transparent 70%), ' +
  'radial-gradient(6vmin 6vmin at 95% 72%, rgba(224,169,78,.12) 0%, transparent 70%), ' +
  'radial-gradient(140% 55% at 50% 112%, rgba(120,84,20,.45) 0%, transparent 60%), #030303';

/** 아우라(기본 테마 v3 — 2026-09-02 오너 승인 'A · NURI 아우라') — 앱과 같은 딥 네이비(#06080F) + 인디고·시안 후광 2겹(정적).
 *  골드 보케(AURA_GOLD_BG)는 APIS 복제라는 판정으로 기본에서 내리고 프리셋 'aura-gold' 로만 남긴다. */
export const AURA_BG =
  'radial-gradient(60vmax 40vmax at 8% -5%, rgba(88,80,236,.22) 0%, transparent 62%), ' +
  'radial-gradient(50vmax 34vmax at 100% 105%, rgba(6,182,212,.12) 0%, transparent 62%), #06080F';

/** 블랙 마블 골드(2026-09-10 오너 지시 — 레퍼런스 '구리 KK 토너먼트' 보드의 검정 대리석 + 금 결).
 *  외부 자산 0 · 애니 0 — 전부 CSS 레이어(위→아래):
 *   ① 중앙 보호막: 타이머·레벨·블라인드 뒤의 결을 눌러 **시간이 가장 먼저 읽히게** 한다(배경 사진 스크림과 같은 원리).
 *   ② 금 결 8가닥: 화면을 가로지르는 직선은 두지 않는다 — 각 가닥을 position/size 로 **짧은 구간**에 가두고
 *      굵은 본줄 옆에 가는 가지줄을 붙여 갈라진 결처럼 보이게 한다(심 0.3% + 번짐 1%, 최대 알파 .26).
 *   ③ (삭제됨 · 2026-09-19 오너 지시 #8) 헤더 아래·푸터 위 금 헤어라인 8%·92% — 92% 선이 하단 지표 레일의
 *      라벨 줄(총 칩·평균 스택, 실측 1920×1080 y=994 vs 라벨 986~1000)을 정확히 가로질렀고 8% 선은 상태 바 알약 바로 밑에
 *      붙어 "숫자와 알약에 겹친다"는 보고가 나왔다. 선 위치는 % 인데 레일 높이는 cqmin 이라 옮겨도 다른 비율에서 다시 만난다 — 지웠다.
 *   ④ 대리석 구름(회색 radial 4겹) + 결 주변 금빛 안개 2겹 + 하단 온기 1겹 ⑤ 순흑에 가까운 바탕.
 *  레퍼런스의 육각 프레임·이모지·Sponsored 는 가져오지 않는다 — 질감과 위계만 번역한다.
 *  ⚠ 마지막 레이어에만 색을 둔다(background 단축 속성 규칙 — clockThemeVars 가 사진 아래에 이 값을 그대로 잇는다). */
export const BLACK_MARBLE_GOLD_BG = [
  'radial-gradient(56% 50% at 50% 50%, rgba(0,0,0,.64) 0%, rgba(0,0,0,.32) 52%, transparent 78%)',
  'linear-gradient(116deg, transparent 49%, rgba(214,178,76,.05) 49.5%, rgba(238,206,118,.26) 49.85%, rgba(238,206,118,.26) 50.15%, rgba(214,178,76,.05) 50.5%, transparent 51%) 0% 0% / 44% 58% no-repeat',
  'linear-gradient(74deg, transparent 49.2%, rgba(214,178,76,.04) 49.6%, rgba(238,206,118,.18) 49.9%, rgba(238,206,118,.18) 50.1%, rgba(214,178,76,.04) 50.4%, transparent 50.8%) 20% 30% / 18% 22% no-repeat',
  'linear-gradient(58deg, transparent 49.1%, rgba(214,178,76,.05) 49.55%, rgba(238,206,118,.22) 49.85%, rgba(238,206,118,.22) 50.15%, rgba(214,178,76,.05) 50.45%, transparent 50.9%) 100% 0% / 38% 46% no-repeat',
  'linear-gradient(128deg, transparent 49.2%, rgba(214,178,76,.04) 49.6%, rgba(238,206,118,.16) 49.9%, rgba(238,206,118,.16) 50.1%, rgba(214,178,76,.04) 50.4%, transparent 50.8%) 96% 8% / 16% 20% no-repeat',
  'linear-gradient(152deg, transparent 49.1%, rgba(214,178,76,.05) 49.55%, rgba(238,206,118,.20) 49.85%, rgba(238,206,118,.20) 50.15%, rgba(214,178,76,.05) 50.45%, transparent 50.9%) 0% 100% / 52% 42% no-repeat',
  'linear-gradient(104deg, transparent 49%, rgba(214,178,76,.05) 49.5%, rgba(238,206,118,.24) 49.85%, rgba(238,206,118,.24) 50.15%, rgba(214,178,76,.05) 50.5%, transparent 51%) 100% 100% / 46% 50% no-repeat',
  'linear-gradient(40deg, transparent 49.2%, rgba(214,178,76,.04) 49.6%, rgba(238,206,118,.16) 49.9%, rgba(238,206,118,.16) 50.1%, rgba(214,178,76,.04) 50.4%, transparent 50.8%) 88% 92% / 20% 18% no-repeat',
  'linear-gradient(28deg, transparent 49.4%, rgba(238,206,118,.12) 49.9%, rgba(238,206,118,.12) 50.1%, transparent 50.6%) 34% 0% / 26% 30% no-repeat',
  'radial-gradient(30% 24% at 22% 30%, rgba(214,178,76,.06) 0%, transparent 70%)',
  'radial-gradient(26% 24% at 78% 74%, rgba(214,178,76,.05) 0%, transparent 70%)',
  'radial-gradient(62% 48% at 16% 26%, rgba(255,255,255,.06) 0%, transparent 70%)',
  'radial-gradient(48% 62% at 86% 64%, rgba(255,255,255,.055) 0%, transparent 70%)',
  'radial-gradient(40% 34% at 58% 8%, rgba(255,255,255,.045) 0%, transparent 70%)',
  'radial-gradient(36% 30% at 40% 90%, rgba(255,255,255,.04) 0%, transparent 70%)',
  'radial-gradient(120% 40% at 50% 108%, rgba(96,72,22,.28) 0%, transparent 62%)',
  '#080706',
].join(', ');

/** 🔴 NURI 시그니처(기본 테마 v4 — 2026-09-17 오너 지시 "누리홀덤의 시그니쳐 디자인 … 그걸 메인테마로 쓰고싶어").
 *
 *  무엇을 신호로 삼았나 — 앱의 정체성 두 색이다: **바이올렛이 주색, 틸이 신호색**(아우라 v2 결정).
 *  기존 'aura' 는 그 두 색을 쓰긴 했지만 후광 2겹뿐이라 다른 다크 보드와 구별되지 않았다.
 *  시그니처의 형태는 바이올렛/틸 대각 오로라다(헤어라인 한 쌍은 2026-09-19 에 지웠다 — 아래 ②).
 *
 *  레이어(위→아래)
 *   ① 중앙 보호막: 타이머·블라인드 뒤를 눌러 **시간이 가장 먼저 읽히게** 한다(블랙 마블과 같은 원리).
 *   ② (삭제됨 · 2026-09-19 오너 지시 #8 "위아래 선이 숫자와 맨 위 알약에 겹쳐 있어 — 삭제를 하든 해라")
 *      프레이밍 헤어라인 2줄 8%·92%. 92% 는 하단 지표 레일 **라벨 줄**을 가로질렀다(실측 1920×1080: 선 y=994,
 *      '총 칩' 라벨 986~1000) — 레일 높이는 12cqmin 인데 선은 % 라 어느 비율에서도 라벨과 만난다. 옮기지 않고 지웠다.
 *   ③ 오로라 2겹: 좌상단 바이올렛, 우하단 틸. 큰 반경·낮은 알파라 면으로 깔린다.
 *   ④ 대각 시닌 1겹: 카드 테이블 천에 조명이 스치는 결. 45°가 아니라 116° — 헤어라인과 평행해지지 않게.
 *   ⑤ 하단 온기 + 바탕색.
 *
 *  ⚠ 중앙에 **프레임(테두리)을 두지 않는다.** 2026-09-15 오너 지시로 'NURI Aura Clock Frame'(이중 기하 테두리)이
 *    삭제됐다("클락 중앙에 네모 테두리 있는데 이거 삭제"). 시그니처는 배경·팔레트·프레이밍 선으로만 만든다.
 *  ⚠ 애니메이션·외부 자산 0 — 매장 TV 는 몇 시간을 켜 두는 정지 화면이라 페인트 1회로 끝나야 한다.
 *  ⚠ 색은 **마지막 레이어에만** 둔다(background 단축 속성 규칙 — clockThemeVars 가 사진 아래에 이 값을 잇는다.
 *    clockTheme.test.ts 가 'color 는 마지막 레이어'를 단언한다).
 */
// 2026-09-17 「누리 오로라」 — 오너가 후보 4종 실렌더를 보고 고른 안.
//   바뀐 것은 셋뿐이고 형태(교차 헤어라인 + 바이올렛/틸 대각 오로라)는 그대로다:
//   ① 바탕 #05060D → #090B18. 종전은 사실상 순흑이라 오로라가 좌상 모서리에만 남고 화면 80%가
//      검정이었다 — 색을 깔아 놓고 안 보이던 상태다. 살짝 들면 오로라가 '면'으로 읽힌다.
//      순흑을 피하는 것은 다크 디스플레이 실무 관례이기도 하다(고도 표현 여지·눈 피로, Material).
//   ② 비네트 한 겹 추가 — 방송 스코어버그가 중앙 위계를 지키는 고전적 수단이다.
//   ③ 116° 시닌 알파 .035 → .03. 순흑 위에서 백색 .035 가 화면 중앙 우측에 **얼룩처럼** 보였다.
//   그리고 메시 3점째(인디고)를 넣어 두 오로라 사이가 끊기지 않게 했다.
export const NURI_SIGNATURE_BG = [
  'radial-gradient(52% 46% at 50% 50%, rgba(0,0,0,.50) 0%, rgba(0,0,0,.24) 54%, transparent 78%)',
  'radial-gradient(140% 100% at 50% 50%, transparent 55%, rgba(0,0,0,.34) 100%)',
  'radial-gradient(64vmax 44vmax at 4% -10%, rgba(139,92,246,.28) 0%, transparent 60%)',
  'radial-gradient(40vmax 30vmax at 30% 112%, rgba(99,68,206,.14) 0%, transparent 60%)',
  'radial-gradient(56vmax 40vmax at 104% 108%, rgba(20,184,166,.20) 0%, transparent 60%)',
  'linear-gradient(116deg, transparent 34%, rgba(255,255,255,.03) 50%, transparent 66%)',
  '#090B18',
].join(', ');

/** 메인 타이머 색 — **모든 프리셋이 공유하는 하나의 값**이다(accent 로 새면 안 된다).
 *
 *  2026-09-17 오너 결정: 순백 #FFFFFF → **off-white #F4F6FA**.
 *    왜: #FFF 은 거의 검은 바탕 위에서 21:1 이라 난시(인구의 약 1/3)에게 글자 가장자리가 번진다(할레이션).
 *    281px 짜리 타이머는 이 현상이 가장 크게 나타나는 자리다. #F4F6FA 는 대비 18.5:1 로 여전히 넉넉하다.
 *  ⚠ 2026-09-11 에 '순백 잠금'으로 정했던 것을 오너가 명시적으로 푼 것이다. 잠금의 **본래 목적**
 *    (타이머가 매장이 고른 accent 색으로 새지 않는다)은 그대로다 — 값만 바뀌고 계약은 유지된다. */
export const CLOCK_TIMER_INK = '#F4F6FA';

/** 기본 룩 — 변수 기본값의 단일 출처. 2026-09-02 딥 인디고 → 아우라 골드 → **아우라(인디고)**(오너 승인).
 *  ⚠ 기존 매장 테마(DB 저장값)는 프리셋 id 로 대조되므로 그대로 유효 — 바뀌는 것은 '테마 없음' 매장의 기본 룩뿐이다. */
export const CLOCK_DEFAULTS = {
  // 2026-09-17: 기본 룩이 aura(인디고) → **NURI 시그니처**로 올라갔다(오너 지시 "그걸 메인테마로").
  //   ⚠ 이 줄을 바꾸면 **테마를 고른 적 없는 매장**의 TV 가 바뀐다(프리셋을 저장해 둔 매장은 그대로다 —
  //     저장값은 id 로 대조되고 'aura' 는 프리셋 목록에 그대로 남아 있다).
  bg: NURI_SIGNATURE_BG,
  accent: '#B5A6FF',       // 누리 바이올렛 — 앱 주색 계열. #05060D 위 9.4:1(인디고 400 의 6.9:1 보다 높다).
  //   ⚠ **스와치(CLOCK_ACCENT_SWATCHES)에 없는 값이어야 한다.** 스와치 값을 프리셋 기본으로 쓰면
  //     '매장이 직접 고른 색'과 '프리셋 기본색'을 구분할 수 없어진다 — clockTheme.test.ts:198 이 그것을 지킨다.
  //     처음에 #A78BFA(바이올렛 스와치)를 썼다가 그 계약에 걸려 바꿨다.
  timer: CLOCK_TIMER_INK,  // 타이머 색은 프리셋이 못 덮는다 — 위 CLOCK_TIMER_INK 주석 참고
  prize: '#F5C451',        // 골드는 프라이즈 금액에만(잠금 — 테마가 못 덮는다). #06080F 위 12.6:1
  timerUrgent: '#fb7185',  // rose-400 — 잠금(1분 미만 긴급)
  timerBreak: '#7dd3fc',   // sky-300 — 잠금(브레이크)
  // 보조 라벨 2단.
  // 2026-09-17: .45/.50 → **.55/.62** (오너 승인). 종전 값은 바탕 위 4.47:1 로 AA(4.5) 를 **아슬하게 밑돌았고**,
  //   오로라 후광 피크 위에서는 3.43:1 로 분명히 미달이었다(라벨은 14~16px 이라 큰 글자 예외 3:1 이 아니다).
  //   .55 면 바탕 위 ≈6.3, 피크 위 ≈4.5 로 어느 자리에서도 AA 를 넘는다.
  //   ⚠ dim < soft 순서를 지킨다 — dim 만 올리면 '흐린 쪽'이 '부드러운 쪽'보다 밝아져 이름이 거짓말이 된다.
  //     soft .62 는 배경 이미지용 CLOCK_BG_INK.dim 과 같은 값이라 두 경로의 밝기 어휘가 하나로 모인다.
  inkDim: 'rgba(255,255,255,0.55)',
  inkSoft: 'rgba(255,255,255,0.62)',
} as const;

// ── 배경 이미지(TV 송출) — 가독 보호 계약 ────────────────────────────────────
// 배경 사진이 밝으면 그 위 텍스트가 곧바로 안 보이는 화면이 된다. 밝기를 **두 단계**로 잠근다.
//   ① 업로드 시(clockBgImage.ts): 리사이즈본을 32×18 셀로 요약해 **가장 밝은 셀**을 찾고,
//      "그 셀이 스크림까지 통과한 뒤의 상대휘도 ≤ LUM_CAP"이 되는 배율을 이분탐색해 검은색을 구워 넣는다.
//      (2026-10-03 N-2 부터는 굽지 않고 그 비율을 파일 이름표 `-d<n>` 로 남겨, '꽉 채우기' 렌더 때 같은 알파의 검은 층으로 얹는다 — 합성은 같다.
//       로고를 올려도 원본 색이 남아 '맞추기'·'가운데 크게' 에서 그대로 보인다. clockBgMetaOf · clockThemeVars.)
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
/** 렌더 스크림의 중앙 밴드 투과율 — 아래 세로 스크림의 rgba(0,0,0,.42) 와 한 쌍(같이 고쳐야 한다).
 *
 *  ⚠ 2026-09-07 에 좌우 비네트와 타이머 보호막을 **덧댔지만 이 값은 그대로 둔다.**
 *  덧댄 층은 언제나 더 어둡게만 만들므로 실제 투과율은 0.58보다 낮다 — 업로드 시 밝기 검사가
 *  실제보다 보수적으로(= 더 엄격하게) 판정한다. 값을 낮추면 통과하던 사진이 반려되기 시작한다. */
export const CLOCK_BG_SCRIM_MID = 0.58;
/** 렌더 스크림 3층 — 위에서부터 ①타이머 보호 ②좌우 비네트 ③세로 그라데이션.
 *  ① 화면 중앙 타원: 배경이 밝든 어둡든 대형 타이머 뒤를 항상 눌러 준다(가장 중요한 글자를 보호).
 *  ② 좌우 끝: 사진의 잡다한 가장자리를 죽여 시선을 가운데로 모은다. 하단 metrics rail 도 함께 안정된다.
 *  ③ 기존 세로 층: 상·하단은 헤더/레일이 앉으므로 더 강하게(상단 실측 0.0150).
 *  blur·애니메이션·will-change 없음 — 상시 표출 TV 라 1회 페인트 후 정적이어야 한다. */
export const CLOCK_BG_SCRIM = [
  'radial-gradient(ellipse 62% 46% at 50% 44%, rgba(0,0,0,.38) 0%, rgba(0,0,0,.16) 55%, transparent 78%)',
  'linear-gradient(90deg, rgba(0,0,0,.48) 0%, transparent 20%, transparent 80%, rgba(0,0,0,.48) 100%)',
  'linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.42) 20%, rgba(0,0,0,.42) 80%, rgba(0,0,0,.58) 100%)',
].join(', ');
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
  /** 타이머 색 — 없으면 accent(구 동작). 아우라 골드는 순백 타이머 */
  timer?: string;
  /** 모션 테마 id(ambience/ambiencePresets.ts) — 있으면 클락 화면이 그 장면·영상을 lazy 로 깐다. bg 는 그 전·실패 시 바탕 */
  ambience?: string;
}

// 9종 — 전부 다크. aura(인디고)가 기본(2026-09-02 오너 승인), aura-gold(APIS풍)·deep-indigo(구 기본)는 프리셋으로 남긴다.
// 새 프리셋은 여기 한 줄이면 관리자 패널 미리보기·저장·TV 송출에 전부 붙는다(id 는 DB 왕복 키 — 바꾸지 않는다).
export const CLOCK_THEME_PRESETS: ClockThemePreset[] = [
  // 기본 = NURI 시그니처. 목록 맨 앞에 둔다(관리자 패널이 이 순서로 스와치를 그린다).
  { id: 'nuri-signature', label: 'NURI 시그니처(기본)', kind: 'gradient', bg: NURI_SIGNATURE_BG, accent: '#B5A6FF', timer: CLOCK_TIMER_INK },
  // 구 기본. **id 를 지우지 않는다** — 이걸 저장해 둔 매장의 DB 값이 그대로 살아 있어야 한다.
  { id: 'aura', label: '아우라(인디고)', kind: 'gradient', bg: AURA_BG, accent: '#818CF8', timer: CLOCK_TIMER_INK },
  { id: 'aura-gold', label: '아우라 골드', kind: 'gradient', bg: AURA_GOLD_BG, accent: '#E0A94E', timer: CLOCK_TIMER_INK },
  { id: 'deep-indigo', label: '딥 인디고', kind: 'solid', bg: '#06080B', accent: '#5E6AD2' },
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
  // 검정 대리석 + 절제된 금 결. 타이머는 순백, 레벨·블라인드는 샴페인 골드(스와치 검증색 — #080706 위 약 9.5:1).
  { id: 'black-marble-gold', label: '블랙 마블 골드', kind: 'gradient', bg: BLACK_MARBLE_GOLD_BG, accent: '#E0A94E', timer: CLOCK_TIMER_INK },
  // 모션 테마 15종(2026-09-30 오너 승인 "전부 넣어") — 코드로 그린 일러스트 14 + 폭우 유리창(영상). 목록은 ambiencePresets.ts 한 곳.
  //   위 10종은 그대로 둔다(저장해 둔 매장의 값이 그대로 산다). 타이머는 여기서도 CLOCK_TIMER_INK 잠금.
  ...AMBIENCE_PRESETS.map((m): ClockThemePreset => ({
    id: m.id, label: m.label, kind: 'gradient', bg: ambienceBgCss(m.stops), accent: m.accent, timer: CLOCK_TIMER_INK, ambience: m.id,
  })),
];

export const DEFAULT_CLOCK_PRESET_ID = 'nuri-signature';

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

/** 프리셋 id 의 **모양**만 잠근다(소문자·숫자·하이픈, 40자). id 는 CSS 에 주입되지 않고 find 키·DB 왕복 값으로만 쓰이지만,
 *  page_config 는 업주가 쓰는 자유 JSON 이라 임의 문자열이 그대로 저장·전파되는 것은 막는다. */
const isPresetId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v);

/** 프리셋 id(+선택 accent·배경 이미지)로 저장용 테마 객체 생성 — 허용 목록 밖 값은 버린다.
 *
 *  ⚠ 이 번들이 모르는 프리셋 id 는 **보존**한다(기본 프리셋으로 바꿔치기하지 않는다).
 *  왜: 새 프리셋을 배포하는 창에서 매장 TV·다른 운영자 세션은 며칠째 열린 옛 번들이다. 예전엔 미지 id 를 만나면
 *  테마 전체를 버려 업주가 올린 배경 사진·강조색까지 사라졌고, 옛 관리자 패널은 다음 클릭에 DB 를 기본 프리셋으로
 *  덮어써 새 테마를 조용히 되돌렸다. id 를 그대로 왕복시키면 룩만 기본으로 그리고(clockThemeVars 의 `p?.`) 데이터는 산다. */
export function makeClockTheme(presetId: string, accent?: string, image?: string | null, display?: ClockBgDisplay | null): ClockTheme {
  const p = clockPresetById(presetId);
  const id = p?.id ?? (isPresetId(presetId) ? presetId : CLOCK_THEME_PRESETS[0].id);
  const kind = p?.kind ?? 'gradient';
  const t: ClockTheme = {
    version: 1,
    palette: { preset: id },
    background: { kind, preset: id },
  };
  if (isAllowedAccent(accent)) t.palette = { preset: id, accent };
  if (isAllowedClockBgUrl(image)) t.background = { kind, preset: id, image, ...normalizeClockBgDisplay(display) };
  return t;
}

/**
 * 프리셋을 바꿀 때 저장할 테마 — **이전 테마의 커스텀 강조색은 버리고, 배경 이미지는 유지한다.**
 *
 * 규칙이 패널의 클릭 핸들러 안에 묻혀 있으면 테스트가 닿지 않는다(실제로 그래서 이월 결함이 살아남았다).
 * 순수 함수 하나로 빼서 clockTheme.test.ts 가 직접 잠근다.
 *
 * 왜 accent 를 버리나: 프리셋은 '이 테마의 색 조합'을 통째로 고르는 행위다. 이전 테마에서 고른 보라를
 * 금색 테마에 끌고 오면 그 테마를 고른 의미가 사라진다. 강조색이 필요하면 테마를 고른 **뒤** 스와치에서 정한다.
 * 왜 배경 이미지는 남기나: 사진은 색이 아니라 매장이 올린 자산이라, 테마를 옮겨도 살아 있어야 한다.
 */
export function themeForPresetChange(presetId: string, prev: ClockTheme | null | undefined): ClockTheme {
  return makeClockTheme(presetId, undefined, clockBgImageOf(prev), prev?.background);
}

/** DB 에서 온 미지의 값 검증 — 버전·프리셋 id 모양·accent·배경 URL 전부 대조. 불합격 = null(기본 룩).
 *  프리셋 id 는 목록 대조가 아니라 모양 검사다 — 이 번들이 모르는 새 프리셋도 통과시켜 사진·강조색을 지킨다(위 makeClockTheme). */
export function sanitizeClockTheme(raw: unknown): ClockTheme | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ClockTheme>;
  if (r.version !== 1) return null;
  const pid = r.background?.preset ?? r.palette?.preset;
  if (!isPresetId(pid)) return null;
  const accent = r.palette?.accent;
  const image = r.background?.image;
  return makeClockTheme(
    pid,
    isAllowedAccent(accent) ? accent : undefined,
    isAllowedClockBgUrl(image) ? image : null,
    r.background,
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
  const customAccent = t?.palette?.accent && isAllowedAccent(t.palette.accent) ? t.palette.accent : null;
  const accent = customAccent ?? (p?.accent ?? CLOCK_DEFAULTS.accent);
  /**
   * 메인 타이머는 **언제나 순백**이다 — 프리셋도 강조색도 덮지 못한다(오너 지시 2026-09-11).
   *
   * ⚠ 예전 한 줄: `customAccent ?? (p ? (p.timer ?? p.accent) : CLOCK_DEFAULTS.timer)`.
   *   결함이 둘 겹쳐 있었다.
   *   ① `customAccent ??` — 강조색을 고르면 **타이머까지 그 색**이 됐다. 바이올렛을 고른 매장의
   *      TV 는 27:59 가 보라색으로 떴다("테마를 클릭하면 타이머와 모든 숫자가 보라색").
   *   ② `p.timer ?? p.accent` — `timer` 를 명시한 프리셋은 aura·aura-gold·black-marble-gold 셋뿐이라
   *      **나머지 6종은 타이머 = 프리셋 accent** 였다(딥인디고 보라 · 펠트 초록 · 네온 시안 · 블랙골드 노랑).
   *      테마 카드 3×3 이 통째로 색색의 타이머로 보이던 원인이 이것이다.
   *
   * 타이머는 '지금 몇 분 남았나'라는 **송출 화면의 제1 정보**라, 거리에서 최대 대비여야 하고
   * 매장 취향으로 바뀌면 안 된다. urgent(rose)·break(sky)·prize(gold) 와 같은 등급의 잠금이다.
   * 프리셋의 `timer` 필드는 남겨 둔다 — 미래에 오프화이트를 쓰고 싶은 프리셋이 생기면 그 자리다.
   * (지금 9종 전부 흰색이거나 미지정이라 실제 산출값은 어느 경로든 #FFFFFF 다.)
   */
  const timer = p?.timer ?? CLOCK_DEFAULTS.timer;
  /**
   * 중앙 기하 프레임 — accent 계열이되 **타이머보다 약해야 한다**(§12: 프레임이 타이머보다 강해 보이면 실패).
   * 바깥 선을 65%, 안쪽 선을 38% 로 두어 이중 선의 위계를 만든다. 두 값 다 accent 에서 파생하므로
   * 프리셋을 바꾸면 프레임도 따라 바뀌고, 매장이 강조색을 고르면 프레임만 함께 움직인다(타이머는 불변).
   * color-mix 는 이미 이 화면(ClockThemePanel)에서 쓰던 문법이라 새 의존성이 아니다.
   */
  const frame = `color-mix(in srgb, ${accent} 65%, transparent)`;
  const frameSoft = `color-mix(in srgb, ${accent} 38%, transparent)`;
  const base = p?.bg ?? CLOCK_DEFAULTS.bg;
  const img = clockBgImageOf(t);
  const disp = clockBgDisplayOf(t);
  const meta = clockBgMetaOf(img);
  // 배경 이미지: 스크림(맨 위) → 사진 → 프리셋 배경(맨 아래) 3층 합성.
  // background 단축 속성은 색을 **마지막 레이어**에만 허용하므로 프리셋 색/그라디언트가 항상 끝에 온다.
  // 애니메이션·filter·will-change 없음(상시 표출 TV — 1회 디코드 후 정적).
  // N-2 — cover 는 종전 그대로(+ 이름표의 밝기 상한 · 어둡게 단계를 검은 층으로). contain·center 는 사진을 누르지 않고 글자 판(--clk-plate)을 깐다.
  let bg = base;
  let logo: Record<string, string> | null = null;
  if (img && disp.fit === 'cover') {
    const a = 1 - (1 - meta.dim) * (1 - CLOCK_BG_SHADE_EXTRA[disp.shade]);
    const shade = a > 0.0005 ? `linear-gradient(rgba(0,0,0,${a.toFixed(3)}), rgba(0,0,0,${a.toFixed(3)})), ` : '';
    bg = `${CLOCK_BG_SCRIM}, ${shade}url("${img}") center/cover no-repeat, ${base}`;
  } else if (img && disp.fit === 'contain') {
    const at = disp.pos === 'center' ? 'center' : `center ${disp.pos}`;
    // 중-3 — 어두운 로고를 어두운 대표색 위에 두면 1:1 로 사라졌다. 받침이 켜져 있으면 남는 칸을 밝은 중립색으로.
    //   하-A — 중간 밝기 로고(빨강)는 눌린 대표색(#350e14) 위에서 2.94 였다 → 검은 남는 칸.
    const fill = !disp.plate || meta.plate === 'none' ? (meta.tint ?? CLOCK_DEFAULTS.bg) : meta.plate === 'light' ? CLOCK_LIGHT_NEUTRAL : CLOCK_LOGO_PLATE_DARK;
    bg = `url("${img}") ${at}/contain no-repeat, ${fill}`;
  } else if (img) {
    // '로고로 넣기' — 루트 배경은 테마 그대로. 로고는 ClockStage 의 로고 칸(가로: 머리줄, 세로: 타이머 위)이 그린다.
    logo = {
      '--clk-logo': img,
      '--clk-logo-head': `${CLOCK_LOGO_SIZE.head[disp.size]}cqmin`,
      '--clk-logo-tall': `${CLOCK_LOGO_SIZE.tall[disp.size]}cqmin`,
      ...(disp.plate && meta.plate !== 'none' ? { '--clk-logo-plate': meta.plate === 'light' ? CLOCK_LOGO_PLATE : CLOCK_LOGO_PLATE_DARK } : null),
      // 업로드 때 잰 비율 — 보드가 그림을 받기 전에 로고 자리(머리줄/지표 열)를 정한다(검토 하-2: 첫 60ms 자리 이동·지표 102px 밀림).
      ...(meta.ar ? { '--clk-logo-ar': String(meta.ar) } : null),
    };
  }
  return {
    '--clk-bg': bg,
    // 글자 판은 '맞추기' 에서만 — 로고는 이제 글자와 겹치지 않는 자기 칸에 있어 판이 필요 없다.
    ...(img && disp.fit === 'contain' ? { '--clk-plate': CLOCK_PLATE, '--clk-plate-r': '1.2cqmin', '--clk-plate-align': 'center' } : null),
    ...logo,
    // ── 강조색이 바꿀 수 있는 것 ──────────────────────────────────────────────
    '--clk-accent': accent,                           // 레벨·현재 블라인드·진행률
    '--clk-frame': frame,                             // 중앙 기하 프레임 바깥 선
    '--clk-frame-soft': frameSoft,                    // 프레임 안쪽 선·뒤 LED bloom
    // ── 강조색이 못 바꾸는 것(송출 안전 신호 잠금) ─────────────────────────────
    '--clk-timer': timer,                             // 잠금 — 메인 타이머는 언제나 순백
    '--clk-timer-urgent': CLOCK_DEFAULTS.timerUrgent, // 잠금 — 1분 미만 긴급(rose)
    '--clk-timer-break': CLOCK_DEFAULTS.timerBreak,   // 잠금 — 브레이크(sky)
    '--clk-prize': CLOCK_DEFAULTS.prize,              // 잠금 — 골드는 프라이즈에만
    '--clk-ink': CLOCK_DEFAULTS.timer,                // 잠금 — 일반 핵심 숫자(총칩·평균스택·ANTE)는 흰색
    '--clk-ink-dim': img ? CLOCK_BG_INK.dim : CLOCK_DEFAULTS.inkDim,
    '--clk-ink-soft': img ? CLOCK_BG_INK.soft : CLOCK_DEFAULTS.inkSoft,
    // 모션 테마 id — 클락 화면이 ClockAmbienceSlot 에 넘긴다(clockAmbienceOf). 모션 테마를 고르면 장면이 사진 위를 덮는다
    //   (사진은 지우지 않는다 — 다른 테마로 돌아가면 다시 보인다. themeForPresetChange 가 사진을 이월한다).
    ...(p?.ambience ? { '--clk-amb': p.ambience } : null),
  };
}

/** 테마 변수에서 모션 테마 id 만 꺼낸다 — 호출처가 CSS 변수 이름을 직접 알지 않게. */
export const clockAmbienceOf = (vars: Record<string, string> | null | undefined): string | null => vars?.['--clk-amb'] ?? null;

/** ClockDisplay 테마 스냅샷 키(lib/snapshot) — venue 별 keep-last 캐시 */
export const clockThemeSnapKey = (venueId: string) => `clockTheme:${venueId}`;

// ── 테마 전파 — 저장하면 **열려 있는 클락 화면이 새로고침 없이** 바뀐다 ────────────
//
// 오너 보고(2026-09-11): "테마가 실제로 선택해도 적용이 잘 안돼".
// 원인: 패널은 DB(venues.page_config)에만 썼고, ClockDisplay·운영자 미리보기는
//   page_config 를 **마운트 때 한 번만**(`[venueId]`) 읽었다. 그래서
//     · 같은 탭: 설정에서 고르고 클락으로 돌아와도 이미 마운트된 화면은 옛 테마 그대로
//     · 다른 창: TV 송출(window.open)은 아예 다시 열기 전까지 안 바뀜
//     · 게다가 스냅샷(readSnap)도 갱신되지 않아, 새로 열어도 **옛 테마가 먼저 그려졌다**
//   업주 입장에서는 '눌렀는데 아무 일도 안 일어난다'로 보인다.
//
// 해결: 저장 성공 시 스냅샷을 갱신하고 알린다. 구독은 두 경로다 —
//   · 같은 탭: CustomEvent (localStorage 의 storage 이벤트는 **자기 탭에는 오지 않는다**)
//   · 다른 창: storage 이벤트 (writeSnap 이 localStorage 라 공짜로 따라온다)
export const CLOCK_THEME_EVENT = 'nuri:clock-theme';

/** 이 신호가 덮는 설정 종류. 'ad' 는 전 매장 공통 스폰서 배너(app_settings). */
export type ClockSignalKind = 'theme' | 'ad';

/**
 * 같은 부류의 결함이 광고에도 있었다 — TournamentClock 이 setAppSetting(CLOCK_AD_KEY) 로 저장해도
 * ClockDisplay 는 `useEffect(..., [])` 로 마운트 때 한 번만 읽어서, TV(별도 창)는 광고를 바꿔도 그대로였다.
 * 테마와 같은 신호를 쓴다 — 화면마다 다른 전파 장치를 만들 이유가 없다.
 */
export function publishClockSignal(kind: ClockSignalKind, venueId?: string): void {
  try {
    window.dispatchEvent(new CustomEvent(CLOCK_THEME_EVENT, { detail: { kind, venueId } }));
  } catch { /* 이벤트 실패가 저장을 되돌리지는 않는다 */ }
}

/** 'ad' 신호만 듣는다(테마 저장에 광고를 다시 받아오지 않게). 반환값은 해제 함수. */
export function subscribeClockAd(onChange: () => void): () => void {
  const on = (e: Event) => {
    if ((e as CustomEvent<{ kind?: ClockSignalKind }>).detail?.kind === 'ad') onChange();
  };
  window.addEventListener(CLOCK_THEME_EVENT, on);
  return () => window.removeEventListener(CLOCK_THEME_EVENT, on);
}

/** 테마 저장 직후 호출. 스냅샷을 정본으로 갱신하고 열려 있는 화면에 알린다. */
export function publishClockTheme(venueId: string, theme: ClockTheme | null): void {
  writeSnap(clockThemeSnapKey(venueId), theme);
  try {
    window.dispatchEvent(new CustomEvent(CLOCK_THEME_EVENT, { detail: { kind: 'theme' as ClockSignalKind, venueId } }));
  } catch { /* 이벤트 실패가 저장을 되돌리지는 않는다 */ }
}

/** 클락 화면이 구독한다 — 같은 탭·다른 창 양쪽. 반환값은 해제 함수. */
export function subscribeClockTheme(venueId: string, onChange: (t: ClockTheme | null) => void): () => void {
  const key = clockThemeSnapKey(venueId);
  const reread = () => onChange(readSnap<ClockTheme | null>(key));
  const onCustom = (e: Event) => {
    const d = (e as CustomEvent<{ kind?: ClockSignalKind; venueId?: string }>).detail;
    if (d?.kind === 'ad') return;                 // 광고 신호는 테마와 무관하다
    if (!d || d.venueId === venueId) reread();    // 매장 지정이 없으면 보수적으로 다시 읽는다
  };
  // storage 이벤트의 key 는 writeSnap 의 접두사가 붙은 실제 키다 — 부분 일치로 본다.
  const onStorage = (e: StorageEvent) => { if (!e.key || e.key.includes(key)) reread(); };
  window.addEventListener(CLOCK_THEME_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CLOCK_THEME_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
