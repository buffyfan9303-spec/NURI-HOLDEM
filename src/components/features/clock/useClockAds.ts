// 클락 슬라이드 광고 — 지금 이 매장 TV 에 걸 이미지 주소(순번대로). TV(ClockDisplay)·운영자 미리보기(TournamentClock) 공용.
// 갱신 계약은 기존 스폰서 광고와 같다: 같은 탭 신호(subscribeClockAd) 즉시 + 30초 폴링(보일 때만) + 화면 복귀 재조회.
// 실패는 직전 목록 유지(네트워크 한 번 흔들려 광고가 사라졌다 돌아오지 않게). 기간 판정은 서버 시각.
import { useEffect, useState } from 'react';
import { fetchClockAds, pickActiveAds } from '../../../api/clockAds';
import { serverNow } from '../../../lib/serverTime';
import { subscribeClockAd } from './clockTheme';

const NONE: readonly string[] = [];

export function useClockAds(venueId: string, active = true): readonly string[] {
  const [urls, setUrls] = useState<readonly string[]>(NONE);
  useEffect(() => {
    let alive = true;
    let seq = 0;
    const load = () => {
      const my = ++seq;
      fetchClockAds()
        .then((all) => {
          if (!alive || my !== seq) return;
          const next = pickActiveAds(all, venueId, serverNow()).map((a) => a.imageUrl);
          setUrls((cur) => (cur.join('\n') === next.join('\n') ? cur : next));
        })
        .catch(() => { /* 직전 목록 유지 */ });
    };
    load();
    const off = subscribeClockAd(load);
    if (!active) return () => { alive = false; off(); };
    const t = setInterval(load, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; off(); clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [venueId, active]);
  return urls;
}
