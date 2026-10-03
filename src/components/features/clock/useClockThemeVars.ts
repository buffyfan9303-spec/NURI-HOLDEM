// src/components/features/clock/useClockThemeVars.ts — 클락 테마 → 루트 CSS 변수(TV·운영자 스테이지 공용 한 벌).
//
// 예전엔 ClockDisplay·TournamentClock 이 같은 효과를 각자 들고 있었다(캐시 퍼스트 readSnap + 1회 조회 + 같은 브라우저 구독).
// 🔴 N-3(2026-10-03 재점검 1회차) — 그 구독은 **같은 브라우저**(같은 탭 이벤트·localStorage)만 듣는다.
//   매장 TV 가 따로 꽂힌 스틱·미니PC 면 배경을 바꿔도 새로고침 전까지 옛 화면이었다(실측: 8초 뒤에도 'none').
//   page_config 는 realtime 대상(clock_states)이 아니라 그 채널로는 못 받는다 — 스폰서 광고와 같은 30초 재조회 + 화면 복귀 재조회를 얹는다.
//   두 화면이 한 벌을 쓰므로 다른 PC 의 운영자 스테이지도 같은 주기로 따라온다.
import { useEffect, useState } from 'react';
import { fetchVenuePageConfig } from '../../../api/rankings';
import { readSnap, writeSnap } from '../../../lib/snapshot';
import { clockThemeVars, sanitizeClockTheme, clockThemeSnapKey, subscribeClockTheme, type ClockTheme } from './clockTheme';

/** 다른 기기 반영 주기(ms) — 설정 패널 토스트 문구('30초 안에')와 같은 값이어야 한다. */
export const CLOCK_THEME_POLL_MS = 30_000;

export function useClockThemeVars(venueId: string): Record<string, string> {
  const [vars, setVars] = useState<Record<string, string>>(
    () => clockThemeVars(readSnap<ClockTheme | null>(clockThemeSnapKey(venueId))),
  );
  useEffect(() => {
    let alive = true;
    let seq = 0;
    // 같은 값이면 새 객체를 넣지 않는다 — 30초마다 보드 전체가 다시 그려지지 않게.
    const apply = (v: Record<string, string>) => setVars((cur) => (JSON.stringify(cur) === JSON.stringify(v) ? cur : v));
    apply(clockThemeVars(readSnap<ClockTheme | null>(clockThemeSnapKey(venueId))));
    const fetchTheme = () => {
      const my = ++seq;   // 겹친 재조회 중 늦게 온 옛 응답이 새 테마를 덮지 않게
      fetchVenuePageConfig(venueId)
        .then((c) => {
          if (!alive || my !== seq) return;
          const t = sanitizeClockTheme(c?.clockTheme);
          writeSnap(clockThemeSnapKey(venueId), t);
          apply(clockThemeVars(t));
        })
        .catch(() => { /* keep-last — 네트워크 블립에 기본 테마로 깜빡이지 않는다 */ });
    };
    fetchTheme();
    // 같은 브라우저(설정 패널 → 이 창)는 즉시.
    const off = subscribeClockTheme(venueId, (t) => apply(clockThemeVars(t)));
    const timer = setInterval(fetchTheme, CLOCK_THEME_POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') fetchTheme(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; off(); clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [venueId]);
  return vars;
}
