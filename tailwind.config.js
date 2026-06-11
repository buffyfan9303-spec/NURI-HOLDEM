/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  // hover: 는 마우스 지원 기기(PC)에서만 적용 → 모바일에서 탭 후 hover 배경이 박히는 현상 제거
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      // ── Brand Palette ─────────────────────────────────────────────────────
      // 카지노 다크: 깊은 심도감 + 눈 피로도 최소화
      // 골드 액센트: 프리미엄 권위 표현
      colors: {
        // Surface scale — index.css 의 CSS 변수를 참조해 라이트/다크 테마 전환 지원
        // rgb(var(--x) / <alpha-value>) 형태라 bg-surface-base/95 같은 알파 합성도 동작
        surface: {
          base:  'rgb(var(--surface-base) / <alpha-value>)',  // 앱 최하위 배경
          low:   'rgb(var(--surface-low) / <alpha-value>)',   // 카드 배경
          mid:   'rgb(var(--surface-mid) / <alpha-value>)',   // 모달, 사이드바
          high:  'rgb(var(--surface-high) / <alpha-value>)',  // 호버 영역, 입력 필드
          float: 'rgb(var(--surface-float) / <alpha-value>)', // 드롭다운, 툴팁
        },
        // Gold: 프리미엄·상단 고정 아이템 전용 (브랜드 색 — 테마 고정)
        gold: {
          50:  '#FFF9E6',
          100: '#FFF0B3',
          200: '#FFE066',
          300: '#FFD100', // primary action
          400: '#E6BB00',
          500: '#B39200', // pressed state
          600: '#806800',
        },
        // Red: 언리드 뱃지, 경고 전용 (브랜드 색 — 테마 고정)
        danger: {
          DEFAULT: '#E53E3E',
          light:   '#FEB2B2',
          dark:    '#C53030',
        },
        // Text scale — CSS 변수 기반 (테마 전환)
        ink: {
          primary:   'rgb(var(--ink-primary) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)',
          muted:     'rgb(var(--ink-muted) / <alpha-value>)',
          inverse:   'rgb(var(--ink-inverse) / <alpha-value>)',
        },
        // Border scale — CSS 변수 기반 (테마 전환)
        border: {
          subtle:  'rgb(var(--border-subtle) / <alpha-value>)',
          default: 'rgb(var(--border-default) / <alpha-value>)',
          strong:  'rgb(var(--border-strong) / <alpha-value>)',
        },
      },

      // ── Typography ────────────────────────────────────────────────────────
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.9375rem' }], // 50대 가독: 10px → 11px
        xs:    ['0.75rem',  { lineHeight: '1rem' }],
        sm:    ['0.875rem', { lineHeight: '1.25rem' }],
        base:  ['1rem',     { lineHeight: '1.5rem' }],
        lg:    ['1.125rem', { lineHeight: '1.75rem' }],
        xl:    ['1.25rem',  { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem',   { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      },

      // ── Spacing (4px base grid) ───────────────────────────────────────────
      spacing: {
        'page-x':    '1rem',   // 모바일 좌우 여백 16px
        'page-x-md': '1.5rem', // md 이상 좌우 여백 24px
        'header-h':  '3.5rem', // 헤더 고정 높이 56px
        'tab-h':     '2.75rem',// 날짜 탭바 높이 44px
        'card-gap':  '0.75rem',// 카드 간격 12px
        'section':   '1.5rem', // 섹션 간 여백 24px
      },

      // ── Border Radius ─────────────────────────────────────────────────────
      borderRadius: {
        card:   '0.625rem', // 바이낸스 밀도: 12px → 10px대
        badge:  '9999px',
        input:  '0.5rem',
        dialog: '1rem',
      },

      // ── Box Shadow ────────────────────────────────────────────────────────
      boxShadow: {
        // 헤어라인 링/그림자를 CSS 변수로 → 라이트 모드에서 흰색 테두리 선이 보이던 버그 해결
        card:   '0 0 0 1px var(--card-ring)', // 바이낸스식 플랫 — 떠있는 그림자 제거, 헤어라인만

        gold:   '0 0 12px rgba(255,209,0,0.35)',
        dialog: '0 -4px 32px var(--card-shadow)',
        badge:  '0 0 6px rgba(229,62,62,0.6)',
      },

      // ── Animation ─────────────────────────────────────────────────────────
      transitionTimingFunction: {
        spring:          'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'ease-out-quart':'cubic-bezier(0.25, 1, 0.5, 1)',
      },
      keyframes: {
        'badge-pulse': {
          '0%, 100%': { transform: 'scale(1)',    opacity: '1' },
          '50%':      { transform: 'scale(1.15)', opacity: '0.85' },
        },
        'slide-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',   opacity: '1' },
        },
        // 시트(하단 모달) 닫기: 아래로 슬라이드되며 사라짐
        'slide-down': {
          from: { transform: 'translateY(0)',    opacity: '1' },
          to:   { transform: 'translateY(100%)',  opacity: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to:   { opacity: '0' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
      animation: {
        'badge-pulse': 'badge-pulse 2s ease-in-out infinite',
        'slide-up':    'slide-up 0.2s ease-out',
        'slide-down':  'slide-down 0.2s cubic-bezier(0.4, 0, 1, 1) forwards',
        'fade-in':     'fade-in 0.15s ease-out',
        'fade-out':    'fade-out 0.18s ease-in forwards',
        shimmer:       'shimmer 1.5s linear infinite',
      },
    },
  },
  plugins: [],
};
