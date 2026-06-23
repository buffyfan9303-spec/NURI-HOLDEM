// 빈 상태 일러스트 — 카드 캐릭터(스페이드 에이스 얼굴)로 "기록 없음"을 귀엽게.
// 사용: <EmptyState title="아직 기록이 없어요" hint="첫 기록을 남겨보세요" />
import type { ReactNode } from 'react';

export default function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center animate-fade-in">
      {/* 화면별 맥락 아이콘이 주어지면 그것을, 아니면 기본 졸린 카드 캐릭터 */}
      {icon ? (
        <div className="mb-1 text-ink-muted opacity-80 [&>svg]:h-14 [&>svg]:w-14" aria-hidden>{icon}</div>
      ) : (
      <svg width="72" height="72" viewBox="0 0 96 96" fill="none" aria-hidden className="opacity-90">
        <g transform="rotate(-8 48 48)">
          <rect x="24" y="14" width="48" height="66" rx="7" fill="#181A20" stroke="#2B3139" strokeWidth="2" />
          <text x="30" y="30" fontFamily="Arial" fontWeight="900" fontSize="12" fill="#FCD535">A</text>
          {/* 스페이드 몸통 */}
          <path d="M48 34 C42 44, 34 49, 34 57 C34 63, 39 66, 44 64 C43 68, 41 70, 39 72 L57 72 C55 70, 53 68, 52 64 C57 66, 62 63, 62 57 C62 49, 54 44, 48 34 Z" fill="#FCD535" />
          {/* 졸린 눈 + 입 */}
          <path d="M42 52 q2 2 4 0" stroke="#181A20" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M50 52 q2 2 4 0" stroke="#181A20" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <circle cx="48" cy="58" r="1.4" fill="#181A20" />
        </g>
        {/* zzz */}
        <text x="70" y="26" fontFamily="Arial" fontWeight="700" fontSize="10" fill="#848E9C">z</text>
        <text x="76" y="18" fontFamily="Arial" fontWeight="700" fontSize="12" fill="#848E9C">z</text>
      </svg>
      )}
      <p className="text-sm font-semibold text-ink-secondary">{title}</p>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
