// src/components/features/LinkifiedText.tsx — 사용자 글 안의 http(s) 링크·전화번호를 누를 수 있게 그린다(2026-10-09 VEN-02).
//
// 🔴 HTML 을 끼워 넣지 않는다 — lib/linkify 가 나눈 토막을 React 텍스트 노드와 <a> 로만 그린다(innerHTML 0).
//   부모의 white-space(pre-wrap/pre-line)가 줄바꿈·공백을 그대로 지키도록 감싸는 요소 없이 Fragment 로 낸다.
// 링크 색: 다크 accent-200 · 라이트 accent-300 — ScheduleDetailModal ACCENT_INK 와 같은 짝(소형 글자 AA, e2e/venue-links-1009 실측).
// 긴 URL: wrap-anywhere 로 어느 글자에서든 줄을 바꾼다(390 폭에서 가로 넘침 0).
import { Fragment, useMemo } from 'react';
import { linkify } from '../../lib/linkify';

const LINK_CLS = 'font-semibold text-accent-300 dark:text-accent-200 underline underline-offset-2 wrap-anywhere';

export function LinkifiedText({ text }: { text: string }) {
  const tokens = useMemo(() => linkify(text), [text]);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === 'text') return <Fragment key={i}>{t.text}</Fragment>;
        if (t.kind === 'tel') {
          return <a key={i} href={t.href} data-linkify="tel" className={LINK_CLS}>{t.text}</a>;
        }
        return (
          <a key={i} href={t.href} target="_blank" rel="noopener noreferrer nofollow" data-linkify="url" className={LINK_CLS}>
            {t.text}
          </a>
        );
      })}
    </>
  );
}
