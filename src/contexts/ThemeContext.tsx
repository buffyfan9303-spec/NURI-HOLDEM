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
/** ⚠ localStorage 접근은 **던질 수 있다** — 사파리 프라이빗·쿠키 차단 웹뷰·기업 정책에서
 *  `getItem` 자체가 SecurityError 를 던진다(읽기도 예외 대상이다. 없는 값을 null 로 주는 것과 다르다).
 *  여기는 `useState(resolveInitialTheme)` 의 초기화자라 던지면 **ThemeProvider 렌더가 통째로 터지고
 *  앱 전체가 흰 화면**이 된다. 저장소가 막혀도 앱과 테마 전환은 작동해야 한다(§7-1).
 *  같은 부류를 `src/lib/supabase.ts` 의 authStorage 가 이미 겪고 고쳤다(A03-1) — 같은 처방이다. */
function readStoredTheme(): Theme | null {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : null;
  } catch {
    return null;
  }
}

function resolveInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return readStoredTheme() ?? 'dark';
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
    // 저장 실패(할당량 초과·프라이빗 모드)가 화면 반영을 되돌리면 안 된다 — 클래스는 위에서 이미 붙었다.
    // 이 세션 안에서는 전환이 정상 동작하고, 다음 방문에 기억되지 않을 뿐이다.
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* 저장소 차단 — 무시 */ }
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
