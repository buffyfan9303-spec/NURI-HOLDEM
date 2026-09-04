// 섹션 공용 헤더 — 내 매장·관리자 등 모든 섹션의 제목 규격을 한 곳에서 강제.
// (resend.com 스타일 차용: 타이트한 타이포 위계 + 헤어라인 디바이더 + 우측 정형 액션.
//  제목 17px/굵게/자간 타이트, 설명 12px 뮤트, 액션 버튼은 어떤 것이 와도 높이 36px로 통일)
//
// 2026-09-04 아우라 v6 편입: 유저 화면(내 정보·공지·홈·GTO)은 tile-grad 아이콘 타일 + 헤어라인
// 구분선 Head 패턴을 쓰는데 업주·관리자 화면은 이 컴포넌트 하나를 통과하면서 타일 슬롯 자체가 없었다.
// 그래서 두 화면이 서로 다른 디자인 시스템처럼 갈렸다. icon 을 넘기면 같은 어휘가 된다(선택 사항 —
// 안 넘기면 종전과 픽셀 동일하므로 기존 호출부 수십 곳은 손대지 않아도 된다).
import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

/** 타일 톤 — CustomerDashboardPage 의 Tile 과 같은 집합(차트/새 게임=violet · 계산기/장부=indigo
 *  · 트레이닝/순위=fuchsia · 분석/클락/장터=cyan). emerald 는 '라이브' 신호색이라 타일에 쓰지 않는다. */
type Tone = 'violet' | 'indigo' | 'fuchsia' | 'cyan';

interface Props {
  title: string;
  desc?: string;
  /** 있으면 제목 앞에 tile-grad 아이콘 타일이 붙는다(아우라 Head 패턴).
   *  IconName 문자열이거나, 호출부가 이미 갖고 있는 svg 노드(ADMIN_SECTIONS.icon·SECTION_ICON)를 그대로 넘겨도 된다. */
  icon?: IconName | ReactNode;
  tone?: Tone;
  /** 우측 주 액션 — 버튼을 넣으면 높이·글자 크기가 자동 통일된다 */
  action?: ReactNode;
}

export default function SectionHeader({ title, desc, icon, tone = 'violet', action }: Props) {
  return (
    <header className="flex items-end justify-between gap-3 border-b border-border-subtle pb-3">
      <div className="flex min-w-0 items-start gap-2">
        {icon && (
          <span className={['mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad',
            tone === 'violet' ? '' : `tile-grad-${tone}`].join(' ')} aria-hidden>
            {typeof icon === 'string' ? <Icon name={icon as IconName} size={14} /> : icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-fluid-lg font-bold leading-tight tracking-tight text-ink-primary">{title}</h2>
          {/* 설명문 행간은 §T1 t-desc(12.75/19.13 = 1.5배) 한 값으로.
              leading-snug(17.53px)는 한글 두 줄이 붙어 보였고, 같은 12.75px 설명문이
              화면마다 17 / 17.53 두 값으로 갈려 있었다(1440 실측). break-keep 은
              '매장 운영 현황을 한눈에' 같은 어절이 줄 끝에서 쪼개지는 것을 막는다. */}
          {desc && <p className="mt-1 t-desc break-keep text-ink-muted">{desc}</p>}
        </div>
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
