// 판 폭 상한을 인라인으로 푸는 훅 — 상한(앱 프레임 max-w-6xl · 전역 `main { max-width }` · 내 매장 판 xl:max-w-7xl)은
// 앱 셸·전역 CSS(공용 파일)에 있어서, 여기서 켜고 끄면 조건이 꺼지는 즉시 원래대로다.
//
// 🔴 2026-10-02 design-reviewer F-2 — 장부 판이 보일 때만 **앱 프레임까지** 풀었더니(≥1440) 단계를 옮길 때마다
//   헤더·사이드바·단계 바가 가로로 105px(1440)·345px(1920) 튀었다. 리드 결정 (a): 바깥(앱 프레임까지)은 **내 매장 탭 단위**로 풀고
//   (VenueManageTab 루트, includeSelf), 장부는 그 루트 **안쪽**만 푼다(stopAt). 그래서 단계·매장 전환에 셸 폭이 그대로다.
import { useLayoutEffect } from 'react';

/** 내 매장 탭 루트 표식 — 장부 쪽 훅은 이 요소(와 그 바깥)를 건드리지 않는다. */
export const UNCAP_ROOT_ATTR = 'data-uncap-root';

export function useUncapAncestors(host: HTMLElement | null, on: boolean, opt: { includeSelf?: boolean; stopAtRoot?: boolean } = {}) {
  const { includeSelf = false, stopAtRoot = false } = opt;
  useLayoutEffect(() => {
    if (!on || !host) return;
    const undo: { el: HTMLElement; prev: string }[] = [];
    for (let e: HTMLElement | null = includeSelf ? host : host.parentElement; e && e !== document.body; e = e.parentElement) {
      if (stopAtRoot && e.hasAttribute(UNCAP_ROOT_ATTR)) break;
      if (getComputedStyle(e).maxWidth === 'none') continue;
      undo.push({ el: e, prev: e.style.maxWidth });
      e.style.maxWidth = 'none';
    }
    return () => { for (const u of undo) u.el.style.maxWidth = u.prev; };
  }, [host, on, includeSelf, stopAtRoot]);
}
