/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ── Brand Palette ─────────────────────────────────────────────────────
      // 카지노 다크: 깊은 심도감 + 눈 피로도 최소화
      // 골드 액센트: 프리미엄 권위 표현
      colors: {
        // Surface scale (어두울수록 낮은 레이어)
        surface: {
          base:  '#0A0C0F', // 앱 최하위 배경
          low:   '#111318', // 카드 배경
          mid:   '#1A1D24', // 모달, 사이드바
          high:  '#22262F', // 호버 영역, 입력 필드
          float: '#2C3140', // 드롭다운, 툴팁
        },
        // Gold: 프리미엄·상단 고정 아이템 전용
        gold: {
          50:  '#FFF9E6',
          100: '#FFF0B3',
          200: '#FFE066',
          300: '#FFD100', // primary action
          400: '#E6BB00',
          500: '#B39200', // pressed state
          600: '#806800',
        },
        // Red: 언리드 뱃지, 경고 전용
        danger: {
          DEFAULT: '#E53E3E',
          light:   '#FEB2B2',
          dark:    '#C53030',
        },
        // Text scale
        ink: {
          primary:   '#F0F2F5',
          secondary: '#9AA3B2',
          muted:     '#5A6175',
          inverse:   '#0A0C0F',
        },
        // Border scale
        border: {
          subtle:  '#1E2230',
          default: '#2C3140',
          strong:  '#404760',
        },
      },

      // ── Typography ────────────────────────────────────────────────────────
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
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
        card:   '0.75rem',
        badge:  '9999px',
        input:  '0.5rem',
        dialog: '1rem',
      },

      // ── Box Shadow ────────────────────────────────────────────────────────
      boxShadow: {
        card:   '0 0 0 1px rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.5)',
        gold:   '0 0 12px rgba(255,209,0,0.35)',
        dialog: '0 -4px 32px rgba(0,0,0,0.8)',
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
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
      animation: {
        'badge-pulse': 'badge-pulse 2s ease-in-out infinite',
        'slide-up':    'slide-up 0.2s ease-out',
        'fade-in':     'fade-in 0.15s ease-out',
        shimmer:       'shimmer 1.5s linear infinite',
      },
    },
  },
  plugins: [],
};
