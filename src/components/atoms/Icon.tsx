// src/components/atoms/Icon.tsx
// 누리홀덤 공용 아이콘 — Lucide 스타일(24 viewBox · stroke 2 · currentColor) 단일 소스.
// 사용: <Icon name="close" size={20} className="text-ink-secondary" />
// 새 아이콘이 필요하면 PATHS에 한 줄 추가하면 전 앱이 동일한 모양을 공유합니다.
//
// 라이선스 고지(IMG-2): Portions derived from Lucide (https://lucide.dev) —
// ISC License, Copyright (c) 2022 Lucide Contributors. Lucide is a fork of
// Feather Icons — MIT, Copyright (c) 2013-2022 Cole Bemis.
// 고지 범위는 기존 범용 아이콘(close~send 38종)에 한정한다. 아래 '포커 도메인 글리프'
// 블록은 자체 제작(스페이드는 scripts/gen-icons.mjs 512 좌표계의 ÷21.33 스케일 —
// 아이콘·PWA·OG 가 한 형태를 공유). 신규 아이콘을 그릴 때 Lucide 원본을 복제하지 말 것.
import type { ReactElement, SVGProps } from 'react';

export type IconName =
  | 'close' | 'back' | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'chevron-up'
  | 'search' | 'plus' | 'minus' | 'check' | 'check-circle'
  | 'trash' | 'edit' | 'star' | 'star-fill' | 'heart' | 'heart-fill'
  | 'alert' | 'info' | 'lock' | 'user' | 'users' | 'bell'
  | 'qr' | 'calendar' | 'clock' | 'settings' | 'share' | 'filter'
  | 'image' | 'download' | 'external' | 'menu' | 'home' | 'refresh' | 'copy' | 'send'
  // 포커 도메인 글리프(IMG-2, 자체 제작) — 수트 4종은 채움 도형
  | 'spade' | 'heart-suit' | 'diamond' | 'club'
  | 'chip' | 'chip-stack' | 'cards' | 'dealer-button' | 'blinds'
  | 'trophy' | 'all-in' | 'felt-table' | 'timer-poker'
  // 리디자인 스파인 공통 글리프(로드맵 Phase 0 지정 — 이모지 마커 소탕용)
  | 'comment' | 'eye' | 'bookmark' | 'flame' | 'target' | 'wallet'
  | 'gift' | 'check-double' | 'map-pin' | 'log-out';

// 각 아이콘의 path/figure children (viewBox 0 0 24 24 기준). 채움 아이콘은 fill 처리.
const PATHS: Record<IconName, ReactElement> = {
  close: <path d="M18 6 6 18M6 6l12 12" />,
  back: <path d="M15 18l-6-6 6-6" />,
  'chevron-left': <path d="M15 18l-6-6 6-6" />,
  'chevron-right': <path d="M9 18l6-6-6-6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-up': <path d="M18 15l-6-6-6 6" />,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M20 6 9 17l-5-5" />,
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="m9 12 2 2 4-4" /></>,
  trash: <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />,
  'star-fill': <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" fill="currentColor" stroke="none" />,
  heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />,
  'heart-fill': <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" fill="currentColor" stroke="none" />,
  alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  lock: <><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h.01M21 17v4M17 21h4" /></>,
  calendar: <><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" /></>,
  filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />,
  image: <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></>,
  external: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M9 22V12h6v10" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  copy: <><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />,
  // ── 포커 도메인 글리프(IMG-2, 자체 제작 — Lucide 고지 범위 밖) ─────────────
  // 스페이드: gen-icons.mjs 512 좌표계 path 를 24 viewBox 로 ÷21.33 스케일(형태 단일 소스)
  spade: <path d="M12 3C10.03 7.03 5.72 9.19 5.72 13.03c0 2.72 2.25 4.13 4.5 3.28-.38 1.78-1.22 2.82-2.53 3.75h8.62c-1.31-.93-2.15-1.97-2.53-3.75 2.25.85 4.5-.56 4.5-3.28C18.28 9.19 13.97 7.03 12 3Z" fill="currentColor" stroke="none" />,
  'heart-suit': <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" fill="currentColor" stroke="none" />,
  diamond: <path d="M12 2.5 18.8 12 12 21.5 5.2 12Z" fill="currentColor" stroke="none" />,
  club: <><circle cx="12" cy="7.5" r="3.6" fill="currentColor" stroke="none" /><circle cx="7.2" cy="13.5" r="3.6" fill="currentColor" stroke="none" /><circle cx="16.8" cy="13.5" r="3.6" fill="currentColor" stroke="none" /><path d="M10.4 13.5c-.35 3.2-1.35 5.1-2.9 6.5h9c-1.55-1.4-2.55-3.3-2.9-6.5Z" fill="currentColor" stroke="none" /></>,
  chip: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" /></>,
  'chip-stack': <><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" /><path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" /></>,
  cards: <><rect x="4" y="6" width="11" height="15" rx="2" /><path d="M9.5 3.9 17 2.2a2 2 0 0 1 2.4 1.5l2.3 10.2a2 2 0 0 1-1.5 2.4l-2.2.5" /></>,
  'dealer-button': <><circle cx="12" cy="12" r="9" /><path d="M10 8h1.8a4 4 0 0 1 0 8H10Z" /></>,
  blinds: <><circle cx="8.5" cy="14.5" r="5.5" /><circle cx="15.5" cy="9.5" r="5.5" /></>,
  trophy: <><path d="M7 3h10v6a5 5 0 0 1-10 0Z" /><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" /><path d="M12 14v4M8 21h8M9.5 18h5" /></>,
  'all-in': <><path d="M12 11V3M8.5 6.5 12 3l3.5 3.5" /><ellipse cx="12" cy="16" rx="7" ry="2.6" /><path d="M5 16v2.4c0 1.44 3.13 2.6 7 2.6s7-1.16 7-2.6V16" /></>,
  'felt-table': <><ellipse cx="12" cy="12" rx="9.5" ry="6.5" /><ellipse cx="12" cy="12" rx="5.8" ry="3.3" /></>,
  'timer-poker': <><path d="M9.5 2h5" /><path d="M12 2v3" /><circle cx="12" cy="13.5" r="8" /><path d="M12 9.5v4l2.6 1.6" /></>,
  // ── 리디자인 스파인 공통 글리프(자체 제작) ────────────────────────────────
  comment: <path d="M21 11.5c0 4.14-4.03 7.5-9 7.5-1.06 0-2.08-.15-3.02-.44L4 20l1.16-3.48C3.82 15.19 3 13.42 3 11.5 3 7.36 7.03 4 12 4s9 3.36 9 7.5Z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1Z" />,
  flame: <path d="M12 2.5c.6 3-0.9 4.6-2.4 6.2C8.1 10.3 7 11.9 7 14a5 5 0 0 0 10 0c0-1.4-.5-2.6-1.2-3.7-.4.9-1 1.5-1.8 2 .3-2.9-.6-6.6-2-9.8Z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  wallet: <><path d="M20 7H5a2 2 0 0 1-2-2 2 2 0 0 1 2-2h13v4" /><path d="M3 5v13a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1" /><path d="M16 13h.01" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" /><path d="M12 8c-3.5 0-4.5-3-3-4.5C10.5 2 12 4 12 8c0-4 1.5-6 3-4.5 1.5 1.5.5 4.5-3 4.5Z" /></>,
  'check-double': <><path d="M2.5 12.5 7 17 17 7" /><path d="m12 17 9.5-9.5" /></>,
  'map-pin': <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  'log-out': <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 20, strokeWidth = 2, className, ...rest }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
