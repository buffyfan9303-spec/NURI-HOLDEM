// [DS] MO-6C — 스켈레톤 깜빡임 방지 게이트.
// 로딩이 200ms 안에 끝나면(스냅샷 캐시·빠른 응답) 스켈레톤을 아예 그리지 않는다 —
// '스켈레톤이 번쩍 나타났다 즉시 콘텐츠로 바뀌는' 것이 빈 화면보다 더 산만하다.
// ⚠ browse 첫 화면(ScheduleSkeletonGrid)에는 쓰지 않는다: 정적 셸이 이미 스켈레톤을
//   보여주고 있어 게이트를 걸면 셸→빈 화면→스켈레톤 재등장으로 오히려 깜빡인다(MO-7 정합).
// ⚠ 반환값은 **pulse 노출만** 정한다 — 소비처는 로딩 첫 렌더부터 스켈레톤 마크업을 항상 그리고,
//   false 인 동안 `invisible`(visibility:hidden — 높이는 차지)만 붙인다. false 에 null 을 그리면
//   200ms 뒤 스켈레톤이 끼어들며 아래(다음 섹션·BusinessFooter)가 통째로 내려간다(MO-B).
//   그 이동은 탭 클릭 직후라 CLS 합계(hadRecentInput)에서 빠져 perf.spec 이 못 잡는다 —
//   e2e/skeleton-no-shift.spec.ts 가 응답을 늦춰 실측으로 잠근다.
import { useEffect, useState } from 'react';

export function useSkeletonGate(loading: boolean, delay = 200): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!loading) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [loading, delay]);
  return loading && show;
}
