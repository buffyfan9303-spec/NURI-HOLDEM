// src/lib/mentions.tsx
// 텍스트 안의 @매장명(등록된 홀덤펍 이름)을 클릭 가능한 링크로 변환 — 커뮤니티 교차 연동.
import type { ReactNode } from 'react';

export interface MentionVenue { id: string; name: string }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @매장명 → 매장 페이지로 이동하는 링크. 일치 없으면 원문 그대로. */
export function renderMentions(
  text: string,
  venues: MentionVenue[],
  onVenueClick: (id: string) => void,
): ReactNode {
  if (!text) return text;
  const named = venues.filter((v) => v.name && v.name.trim());
  if (named.length === 0) return text;
  // 긴 이름 우선 매칭(부분 일치로 짧은 이름이 먼저 잡히는 것 방지)
  const sorted = [...named].sort((a, b) => b.name.length - a.name.length);
  const re = new RegExp('@(' + sorted.map((v) => esc(v.name)).join('|') + ')', 'g');

  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const name = m[1];
    const v = sorted.find((x) => x.name === name);
    out.push(
      <button
        key={`m${key++}`}
        type="button"
        onClick={(e) => { e.stopPropagation(); if (v) onVenueClick(v.id); }}
        className="text-gold-300 font-semibold hover:underline"
      >
        @{name}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
