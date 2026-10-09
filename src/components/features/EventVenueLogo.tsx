// src/components/features/EventVenueLogo.tsx — 이벤트의 참여권 매장 로고(오너 2026-10-09 "로티아레나 출석 이벤트에 로티아레나 로고").
// 자리를 새로 잡지 않는다: 호출부가 className 으로 준 **고정 상자**에 그리고, 로고가 없거나 못 불러오면 children(종전 그림)을 그린다.
// 그래서 로고 유무·로드 성공/실패 어느 쪽이든 주변 요소 위치가 같다(CLS 0). 값은 api/events 의 EventBrand.
import { useState, type ReactNode } from 'react';
import { thumbUrl } from '../../lib/imageUrl';

export default function EventVenueLogo({ url, className, children = null }: {
  url?: string | null;
  /** 크기·위치·모양 — 반드시 고정 h/w 를 준다(로드 전후 상자가 같아야 한다) */
  className: string;
  /** 로고가 없을 때 그 자리에 그릴 종전 그림(없으면 아무것도 안 그린다) */
  children?: ReactNode;
}) {
  const [bad, setBad] = useState<string | null>(null);
  if (!url || bad === url) return <>{children}</>;
  return (
    <img key={url} src={thumbUrl(url, 128)} alt="" decoding="async" data-testid="event-venue-logo"
      className={`bg-surface-high object-cover ring-1 ring-white/10 ${className}`}
      // 변형본(-128)이 없으면 원본으로 한 번, 그것도 실패하면 종전 그림으로(VenueThumb 와 같은 조리법 — 깨진 그림 아이콘 금지).
      onError={(e) => { const el = e.currentTarget; if (el.dataset.fb) setBad(url); else { el.dataset.fb = '1'; el.src = url; } }} />
  );
}
