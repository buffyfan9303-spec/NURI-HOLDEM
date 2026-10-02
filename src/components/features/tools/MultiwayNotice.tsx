// src/components/features/tools/MultiwayNotice.tsx
// 2~5bb 뒤 3명+ 다인 균형 안내 — 한 줄 요약 + ⓘ 로 펼치는 전체 문장(오너 2026-10-02 "2~5bb 전부 공개, 설명 표시").
// 차트·드릴 카드가 같은 문구를 쓴다(문구 정본은 nash.data.ts). 기존 SourceBadge 옆 같은 자리에 둔다.
import { MULTIWAY_NOTICE_FULL, MULTIWAY_NOTICE_SHORT } from '../../../lib/nash.data';

export default function MultiwayNotice({ className = '' }: { className?: string }) {
  return (
    <details data-testid="multiway-notice" className={['text-2xs text-ink-muted', className].join(' ')}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-center gap-1 whitespace-nowrap [&::-webkit-details-marker]:hidden">
        <span>{MULTIWAY_NOTICE_SHORT}</span>
        <span aria-hidden className="font-bold text-accent-200">ⓘ</span>
        <span className="sr-only">자세히 보기</span>
      </summary>
      <p className="pb-1 text-center leading-relaxed break-keep">{MULTIWAY_NOTICE_FULL}</p>
    </details>
  );
}
