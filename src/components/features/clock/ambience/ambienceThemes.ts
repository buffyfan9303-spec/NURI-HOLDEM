// src/components/features/clock/ambience/ambienceThemes.ts — 실사 영상 모션 테마 14종(계절 4 · 날씨 5 · 동물 5).
//
// 형식은 clockTheme.ts 의 ClockThemePreset 과 같다(id · label · kind · bg · accent · timer) — K단계에서
// CLOCK_THEME_PRESETS 에 그대로 이어 붙일 수 있게. 추가로 group·video·motion·stops 를 가진다.
//   · video: public/clock-ambience/<video>.mp4 + .jpg(poster). 출처·라이선스는 ASSETS.md.
//     영상은 이미 어둡게·약하게 흐리게 구워져 있다(인코딩 단계). 영상이 늦거나 실패하면 bg(그라데이션)가 그대로 보인다.
//   · motion: 영상 앞에 얹는 캔버스 효과(없으면 null).
//   · bg 의 색은 마지막 레이어에만 둔다(clockTheme 계약).
//   · accent 는 스와치(CLOCK_ACCENT_SWATCHES) 값과 겹치지 않고, 가장 밝은 stop 위에서 4.5:1 이상(ambience.test 가 잠근다).
//   · 타이머는 모든 테마가 CLOCK_TIMER_INK(잠금).

import { CLOCK_TIMER_INK, type ClockThemePreset } from '../clockTheme';
import type { AmbienceMotionId } from './ambienceEffects';

export type AmbienceGroup = 'season' | 'weather' | 'animal';
export const AMBIENCE_GROUP_LABEL: Record<AmbienceGroup, string> = { season: '계절', weather: '날씨', animal: '동물' };

/** 영상 파일 위치(사이트 정적 파일). 바꾸면 여기 한 곳. */
export const AMBIENCE_VIDEO_BASE = '/clock-ambience/';

export interface AmbienceTheme extends ClockThemePreset {
  group: AmbienceGroup;
  /** public/clock-ambience/ 아래 파일 이름(확장자 없이) — <video>.mp4 · <video>.jpg */
  video: string;
  motion: AmbienceMotionId | null;
  /** 영상 위 가독 막 불투명도(ClockAmbience dim) — 대비 실측(ambience-report.md)으로 정했다 */
  dim: number;
  /** 배경 세 색 [위(가장 밝음) · 중간 · 바탕] — 영상이 오기 전·실패 시의 바탕이자 대비 계산의 기준 */
  stops: [string, string, string];
}

export const ambienceBg = ([top, mid, base]: [string, string, string]) =>
  `radial-gradient(130% 95% at 50% 6%, ${top} 0%, ${mid} 55%, ${base} 100%), ${base}`;

export const ambienceVideoSrc = (t: Pick<AmbienceTheme, 'video'>) => ({
  mp4: `${AMBIENCE_VIDEO_BASE}${t.video}.mp4`,
  poster: `${AMBIENCE_VIDEO_BASE}${t.video}.jpg`,
});

const T = (group: AmbienceGroup, key: string, label: string, video: string, motion: AmbienceMotionId | null, stops: [string, string, string], accent: string, dim = 0.3): AmbienceTheme => ({
  id: `${group}-${key}`, label, kind: 'gradient', group, video, motion, dim, stops, bg: ambienceBg(stops), accent, timer: CLOCK_TIMER_INK,
});

// dim: 기본 0.3. 봄·가을·사자는 작은 회색 라벨(white/58%)이 0.3 에서 4.57~4.95:1 로 가장 낮아 0.36 으로 올렸다(2026-09-29 실측).
export const AMBIENCE_THEMES: AmbienceTheme[] = [
  T('season', 'spring', '봄 벚꽃', 'spring-blossom', 'sakura', ['#2B1726', '#170C16', '#0B070C'], '#F4A9C4', 0.36),
  T('season', 'summer', '여름 바다 윤슬', 'summer-sea', 'glints', ['#2A1A16', '#140D10', '#07060A'], '#FFC98A'),
  T('season', 'autumn', '가을 단풍숲', 'autumn-forest', 'maple', ['#2A140A', '#160B06', '#0A0604'], '#F2A65A', 0.36),
  T('season', 'winter', '겨울 설원 눈보라', 'winter-snowfield', 'blizzard', ['#14223A', '#0B1424', '#060A12'], '#BFD9F2'),
  T('weather', 'rain', '폭우 유리창', 'rain-window', 'rain-glass', ['#16202B', '#0C131B', '#06090D'], '#9CC3E6'),
  T('weather', 'cloud-sea', '운해 산맥', 'cloud-sea', 'mist', ['#18243A', '#0D1424', '#060A12'], '#B8D4F0'),
  T('weather', 'milky-way', '은하수', 'milky-way', 'meteor', ['#0C1236', '#070A1F', '#03040D'], '#F3D98B'),
  T('weather', 'aurora', '오로라', 'aurora', 'meteor', ['#05201E', '#041312', '#020909'], '#7EF2C4'),
  T('weather', 'first-snow', '첫눈', 'first-snow', 'snow', ['#1D1B2E', '#110F1C', '#08070E'], '#D6CCF5'),
  T('animal', 'dolphins', '돌고래 수중', 'dolphins', 'bubbles', ['#06263A', '#041826', '#020C14'], '#8FE3FF'),
  T('animal', 'dolphin-pod', '돌고래 떼', 'dolphin-pod', 'glints', ['#06262A', '#041819', '#020C0D'], '#7FE0D2'),
  T('animal', 'eagle', '독수리 비상', 'eagle', 'dust', ['#0A1E36', '#061324', '#030A14'], '#9CC8F2'),
  T('animal', 'wild-horses', '야생마 질주', 'wild-horses', 'dust', ['#2A1E12', '#150F09', '#090604'], '#F2C27E'),
  T('animal', 'lion', '사자', 'lion', 'dust', ['#2A1D0E', '#150E07', '#090603'], '#F0B96A', 0.36),
];

export const ambienceThemeById = (id: string | null | undefined) => AMBIENCE_THEMES.find((t) => t.id === id) ?? null;
