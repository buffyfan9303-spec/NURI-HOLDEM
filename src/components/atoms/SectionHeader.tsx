// 섹션 공용 헤더 — 내 매장·관리자 등 모든 섹션의 제목 규격을 한 곳에서 강제.
// (resend.com 스타일 차용: 타이트한 타이포 위계 + 헤어라인 디바이더 + 우측 정형 액션.
//  제목 17px/굵게/자간 타이트, 설명 12px 뮤트, 액션 버튼은 어떤 것이 와도 높이 36px로 통일)
import type { ReactNode } from 'react';

interface Props {
  title: string;
  desc?: string;
  /** 우측 주 액션 — 버튼을 넣으면 높이·글자 크기가 자동 통일된다 */
  action?: ReactNode;
}

export default function SectionHeader({ title, desc, action }: Props) {
  return (
    <header className="flex items-end justify-between gap-3 border-b border-border-subtle pb-3">
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold leading-tight tracking-tight text-ink-primary">{title}</h2>
        {desc && <p className="mt-1 text-xs leading-snug text-ink-muted">{desc}</p>}
      </div>
      {action && (
        // 자식 버튼 규격 강제: 높이 38px·글자 12px·패딩 통일 — 섹션마다 버튼 크기가 달라지는 것 방지
        // (min-h-0: .btn-primary 기본 min-h 40.8px가 h-9를 이기는 것 차단)
        <div className="flex shrink-0 items-center gap-1.5 [&_button]:h-9 [&_button]:min-h-0 [&_button]:px-3.5 [&_button]:text-xs [&_button]:font-semibold [&_button]:whitespace-nowrap">
          {action}
        </div>
      )}
    </header>
  );
}
