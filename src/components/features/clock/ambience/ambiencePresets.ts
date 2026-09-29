// src/components/features/clock/ambience/ambiencePresets.ts — 모션 테마 목록(가벼운 메타데이터만).
//
// clockTheme.ts 가 이 파일을 **정적으로** 읽어 테마 목록(CLOCK_THEME_PRESETS)에 잇는다. 그래서 여기에는
// 그림 코드가 한 줄도 없다 — 장면 그리기(scenes/*)·엔진·영상은 클락 화면이 그 테마를 그릴 때만 lazy 로 받는다.
//
// 오너 승인 2026-09-30: v3 일러스트 14종 + 폭우 유리창(실사 영상 — 오너가 좋아해 유지) "전부 넣어".
//   · v2 의 실사 영상 13종·만화풍 도안은 목록에 넣지 않는다(미배선 상태로 폐기).
//   · id 는 DB 왕복 키(venues.page_config.clockTheme) — **바꾸지 않는다.** 기존 프리셋 id 와 겹치면 안 된다(테스트).
//   · accent 는 CLOCK_ACCENT_SWATCHES 값과 겹치지 않는다(매장이 고른 색과 프리셋 기본색을 구분 — clockTheme.test).
//   · stops 는 장면이 뜨기 전(청크 로딩)·실패 시의 CSS 바탕이자 accent 대비 계산 기준 [가장 밝음 · 중간 · 바탕].

export interface AmbiencePresetMeta {
  id: string;
  /** '분류 · 이름' — 분류(벚꽃·여름·날씨·자연…)가 라벨 앞머리다(별도 필드를 두지 않는다 — 청크 예산) */
  label: string;
  accent: string;
  stops: [string, string, string];
  /** scene = 코드로 그린 일러스트(해상도 무관) · video = 실사 영상 루프 + 효과 캔버스 */
  kind: 'scene' | 'video';
}

export const AMBIENCE_PRESETS: AmbiencePresetMeta[] = [
  { id: 'sakura-dusk', label: '벚꽃 · 해질녘 보케', accent: '#F9C3D1', stops: ['#7b3350', '#2c1540', '#140b24'], kind: 'scene' },
  { id: 'sakura-ink', label: '벚꽃 · 수묵 여백', accent: '#EBD9C6', stops: ['#2a2620', '#1f1c17', '#141310'], kind: 'scene' },
  { id: 'sakura-night', label: '벚꽃 · 밤 벚꽃 등불', accent: '#F6B8D2', stops: ['#2e2a62', '#0c1740', '#050a22'], kind: 'scene' },
  { id: 'summer-sea', label: '여름 · 달빛 밤바다', accent: '#A7DCF5', stops: ['#2a4470', '#0b1f47', '#050d26'], kind: 'scene' },
  { id: 'autumn-maple', label: '가을 · 노을 단풍 능선', accent: '#F5B06A', stops: ['#6e2a24', '#4a1d2e', '#241430'], kind: 'scene' },
  { id: 'winter-forest', label: '겨울 · 달밤 설원 숲', accent: '#C4DDF5', stops: ['#2d4470', '#0e1c40', '#050b1f'], kind: 'scene' },
  { id: 'cloud-sea', label: '날씨 · 운해 일출', accent: '#F6C7A2', stops: ['#523a6a', '#2a2f66', '#0b1638'], kind: 'scene' },
  { id: 'milky-way', label: '날씨 · 은하수', accent: '#DCD5FF', stops: ['#1c2a3a', '#070c20', '#03050e'], kind: 'scene' },
  { id: 'aurora-lake', label: '날씨 · 오로라 호수', accent: '#86F0C8', stops: ['#15475a', '#061a30', '#020816'], kind: 'scene' },
  { id: 'first-snow', label: '날씨 · 첫눈 가로등', accent: '#F4DBA8', stops: ['#3b3670', '#1f2150', '#0d0e2a'], kind: 'scene' },
  { id: 'misty-lake', label: '날씨 · 물안개 호수', accent: '#D9D0F7', stops: ['#3e4270', '#2a3560', '#18244a'], kind: 'scene' },
  { id: 'rain-glass', label: '날씨 · 폭우 유리창', accent: '#9CC3E6', stops: ['#16202B', '#0C131B', '#06090D'], kind: 'video' },
  { id: 'whale-light', label: '자연 · 고래와 빛줄기', accent: '#97E5FF', stops: ['#0d4d75', '#06294a', '#021326'], kind: 'scene' },
  { id: 'crane-flight', label: '자연 · 학의 비상', accent: '#F2CC8C', stops: ['#5a3c52', '#34305a', '#141a38'], kind: 'scene' },
  { id: 'firefly-forest', label: '자연 · 반딧불 숲', accent: '#DDF28A', stops: ['#16505a', '#0d3440', '#07232c'], kind: 'scene' },
];

export const ambiencePresetById = (id: string | null | undefined) => AMBIENCE_PRESETS.find((p) => p.id === id) ?? null;

/** 장면이 뜨기 전·실패 시의 CSS 바탕 — 색은 마지막 레이어(clockTheme 의 background 규칙). */
export const ambienceBgCss = ([top, mid, base]: [string, string, string]) =>
  `radial-gradient(130% 95% at 50% 6%, ${top} 0%, ${mid} 55%, ${base} 100%), ${base}`;

/** 폭우 유리창 영상(사이트 정적 파일 · Mixkit 무료 라이선스 — ASSETS.md). */
export const RAIN_GLASS_VIDEO = { mp4: '/clock-ambience/rain-window.mp4', poster: '/clock-ambience/rain-window.jpg' } as const;
