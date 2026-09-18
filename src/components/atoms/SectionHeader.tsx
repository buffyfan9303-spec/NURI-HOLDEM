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

/** 섹션 아이콘 타일 — 아우라 v6 문법(tile-grad · 예약=indigo · 이용권=cyan · 전적=violet · 내 글=fuchsia). 글로우 0. */
export function SectionTile({ icon, tone }: { icon: IconName; tone: Tone }) {
  return (
    <span className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad', tone === 'violet' ? '' : `tile-grad-${tone}`].join(' ')} aria-hidden>
      <Icon name={icon} size={14} />
    </span>
  );
}

/** 유저 화면용 컴팩트 섹션 헤더 — h2 text-sm font-bold + 'N개' ink-muted + 설명 ink-secondary + 헤어라인(border-b pb-1.5).
 *  위 SectionHeader(업주·관리자, text-fluid-lg + 우측 액션)와 문법은 같고 밀도만 다르다.
 *  ⚠ 여기 사는 이유: 내 정보 대시보드와 이용권 지갑(VoucherWallet)이 **같은 머리글**을 써야 하는데,
 *    한쪽이 다른 쪽을 import 하면 순환 참조가 된다(대시보드 → 지갑). 공용 원자가 두 화면의 유일한 정본이다. */
export function SectionHead({ icon, tone, title, count, unit = '개', desc }: { icon: IconName; tone: Tone; title: string; count?: number; unit?: string; desc?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
      <SectionTile icon={icon} tone={tone} />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0">
        <h2 className="text-sm font-bold text-ink-primary">{title}</h2>
        {count != null && <span className="text-2xs font-semibold tabular-nums text-ink-muted">{count}{unit}</span>}
        {desc && <span className="text-2xs text-ink-secondary">{desc}</span>}
      </div>
    </div>
  );
}

export default function SectionHeader({ title, desc, icon, tone = 'violet', action }: Props) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border-subtle pb-3">
      {/* 2026-09-18 PC 실측(1280·1440·1920 동일): 예전 items-start + 타일 mt-0.5 는 타일 중심이 제목 글자 중심보다
          4.5px 아래였고, 행 높이를 글자(26.6)가 아니라 타일(31.9)이 잡아 제목 아래 5px 가 비었다. 액션이 있는
          포스터만 items-end 로 제목이 6.4px 내려가 헤더가 52 vs 45.6 으로 갈렸다. lg 부터 행을 액션 높이(h-8)로
          예약하고 가운데 정렬 — 액션 유무와 무관하게 전 섹션 헤더 47.75px · 제목/타일 중심 일치.
          ⚠ lg 미만은 종전 그대로(items-start + mt-0.5). 모바일은 설명이 제목 아래로 2줄 내려가 블록이 64px 인데,
            거기서 가운데 정렬하면 타일이 제목이 아니라 설명 옆에 떠 보였다(390 실측: 타일 top 2.1 → 17.2). */}
      <div className="flex min-w-0 items-start gap-2 lg:min-h-8 lg:items-center">
        {icon && (
          <span className={['mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad lg:mt-0',
            tone === 'violet' ? '' : `tile-grad-${tone}`].join(' ')} aria-hidden>
            {typeof icon === 'string' ? <Icon name={icon as IconName} size={14} /> : icon}
          </span>
        )}
        {/* 제목과 설명을 **같은 줄에 놓되, 안 들어가면 내려보낸다**(오너 2026-09-17:
            "대시보드에 보면 두줄로 되서 굳이 아래에 없어도 되거나 어색하고").
            예전엔 h2 와 p 가 형제 **블록**이라 desc 가 있으면 **구조적으로 항상 2행**이었다 —
            폭이 남아도 무조건 내려갔다. flex-wrap + items-baseline 이면 폭이 있을 때만 한 줄이 된다.
            ⚠ 대시보드만 고치지 않는다. 이 헤더는 업주 전 섹션(SECTION_DESC 18키)과 관리자가
              통과하는 **한 개의 공유 헤더**라, 한 화면만 1행으로 만들면 섹션마다 헤더 높이가 갈린다.
            ⚠ 설명을 지우지 않는다 — 같은 파일의 SectionHead(유저용)가 이미 쓰는 문법 그대로다. */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-fluid-lg font-bold leading-tight tracking-tight text-ink-primary">{title}</h2>
          {/* 설명문 행간은 §T1 t-desc(12.75/19.13 = 1.5배) 한 값으로.
              leading-snug(17.53px)는 한글 두 줄이 붙어 보였고, 같은 12.75px 설명문이
              화면마다 17 / 17.53 두 값으로 갈려 있었다(1440 실측). break-keep 은
              '매장 운영 현황을 한눈에' 같은 어절이 줄 끝에서 쪼개지는 것을 막는다. */}
          {desc && <p className="t-desc break-keep text-ink-muted">{desc}</p>}
        </div>
      </div>
      {action && (
        // 자식 버튼 규격 강제: 높이 34px(=btn-sm·행 예약 min-h-8 과 같은 값)·글자 12px·패딩 통일 — 섹션마다 버튼 크기가 달라지는 것 방지
        // (min-h-0: .btn-primary 기본 min-h 40.8px가 h-9를 이기는 것 차단)
        <div className="flex shrink-0 items-center gap-1.5 [&_button]:h-8 [&_button]:min-h-0 [&_button]:px-3.5 [&_button]:text-xs [&_button]:font-semibold [&_button]:whitespace-nowrap">
          {action}
        </div>
      )}
    </header>
  );
}
