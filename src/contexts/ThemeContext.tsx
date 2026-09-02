// src/contexts/ThemeContext.tsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'nuri-theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/** 초기 테마 = 저장값, 없으면 **다크**(오너 지시 2026-09-02: 기본 테마는 다크).
 *  OS 의 prefers-color-scheme 는 더 이상 보지 않는다 — index.html 첫 페인트 스크립트와 같은 규칙이라 첫 프레임 색 점프도 없다.
 *  라이트는 사용자가 헤더 토글로 고른 경우(localStorage 'nuri-theme'='light')에만. */
function resolveInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return saved === 'light' ? 'light' : 'dark';
}

/** <html> 클래스(.dark/.light)를 실제 DOM에 반영 */
function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');
  root.classList.add(theme);
  // 상태바/주소창·설치형 TWA 툴바 색을 테마에 맞춰 동기화(앱 느낌).
  // ⚠ 색은 정본 토큰과 같아야 한다 — 예전 값(#0A0C0F/#F2F3F5)은 팔레트가 트와일라잇 플럼으로
  //   바뀌기 전 잔재라 오버스크롤 영역이 지면색과 다르게 보였다.
  // ⚠ html 에 인라인 배경을 칠하지 않는다: html 배경이 있으면 body 배경이 캔버스로 승격되지
  //   못하고 자기 박스로 칠해지면서 body::before(지면 그라데이션·상단 글로우)를 통째로 덮는다
  //   (실측: 지면 ΔL* 0.00 — '죄다 단색'의 진짜 원인). 첫 페인트 배경은 index.html 인라인
  //   스크립트가 이미 담당하고, 이후엔 body 의 bg-surface-base 가 캔버스로 올라간다.
  const color = theme === 'light' ? '#F5F7FB' : '#06080F'; // v6.2: 토큰(surface-base)과 동일 — 첫 프레임 색 점프 방지
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  root.style.removeProperty('background-color');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(resolveInitialTheme);

  // theme 변경 시: DOM 클래스 + localStorage 동기화
  useEffect(() => {
    applyThemeClass(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider+훅 동거(컨텍스트 표준 패턴)
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
