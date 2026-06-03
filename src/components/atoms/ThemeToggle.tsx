// src/components/atoms/ThemeToggle.tsx
import { useTheme } from '../../contexts/ThemeContext';

/**
 * ThemeToggle — 라이트/다크 모드 전환 버튼
 * 헤더 알림 벨과 동일한 9x9 클릭 영역으로 터치 접근성 확보.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={isDark ? '라이트 모드' : '다크 모드'}
      className={[
        'w-9 h-9 flex items-center justify-center rounded-input transition-colors active:scale-95',
        'text-ink-secondary hover:text-ink-primary hover:bg-surface-high',
        className,
      ].join(' ')}
    >
      {isDark ? (
        // 다크 상태 → 해(라이트로 전환) 아이콘
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        // 라이트 상태 → 달(다크로 전환) 아이콘
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
