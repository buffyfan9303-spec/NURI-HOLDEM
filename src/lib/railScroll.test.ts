// 가로 레일 스크롤 규약 — "보이는 것은 움직이지 않는다".
//
// 오너 2026-09-08: "홀덤펍에서 랭킹으로 넘어가면 알약이 어떤 메뉴로 이동하던지 따라서 움직이지 않고
//                  홀덤펍으로 넘어갔다가 다시 그쪽으로 이동돼"
//
// 원인: centerInRail 이 레일이 넘치기만 하면 **대상이 이미 온전히 보여도** 가운데로 끌어왔다.
//   그 스크롤이 탭 전환(View Transition) 한복판에 일어난다 — 바 스냅샷은 정지(animation:none)라
//   옛 위치를 보여주는데 알약은 새 스크롤 기준 좌표로 날아가므로, 출발점이 화면 밖으로 밀린다.
//   실측(2026-09-08, 280px 커뮤니티 서브탭): 레일이 73px 스크롤돼 이전 탭이 왼쪽 밖으로 나갔고,
//   누른 직후 프레임에 대상 탭의 글자도 알약도 없었다. 고친 뒤 같은 이동에서 스크롤 73 → 0.
//
// 이 스펙이 잠그는 것: ① 넘치지 않으면 안 움직인다 ② **보이면 안 움직인다**
//                    ③ 가장자리에 붙었으면 끌어온다 ④ 화면 밖이면 가운데로 데려온다
import { describe, it, expect, vi } from 'vitest';
import { centerInRail } from './railScroll';

const rect = (left: number, width: number) => ({
  left, right: left + width, width, x: left, y: 0, top: 0, bottom: 44, height: 44, toJSON: () => ({}),
}) as DOMRect;

/** 레일: 화면에 보이는 폭 246, 내용 폭 319 → 73px 만큼 넘친다(280px 실측과 같은 조건). */
function makeRail({ scrollLeft = 0, clientWidth = 246, scrollWidth = 319 } = {}) {
  const scrollTo = vi.fn();
  const rail = {
    scrollLeft, clientWidth, scrollWidth, scrollTo,
    getBoundingClientRect: () => rect(0, clientWidth),
  } as unknown as HTMLElement;
  return { rail, scrollTo };
}
const chip = (left: number, width = 46) =>
  ({ getBoundingClientRect: () => rect(left, width) }) as unknown as HTMLElement;

describe('centerInRail — 보이는 것은 움직이지 않는다', () => {
  it('레일이 넘치지 않으면 아무것도 하지 않는다', () => {
    const { rail, scrollTo } = makeRail({ clientWidth: 341, scrollWidth: 341 });
    centerInRail(chip(200), rail);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('🔴 대상이 이미 온전히 보이면 넘치더라도 스크롤하지 않는다', () => {
    const { rail, scrollTo } = makeRail();
    // 레일 0~246 안에 여유 있게 들어와 있는 칩
    centerInRail(chip(120), rail);
    expect(scrollTo,
      '보이는 칩을 굳이 가운데로 끌어오면 그 스크롤이 전환 한복판에 일어나 알약 출발점이 화면 밖으로 밀린다')
      .not.toHaveBeenCalled();
  });

  it('가장자리에 딱 붙어 있으면(여유 12px 미만) 끌어온다 — 반쯤 잘린 것처럼 보이지 않게', () => {
    // 이미 왼쪽 끝(scrollLeft 0)이면 더 끌어올 곳이 없다 — 레일이 스크롤돼 있을 때를 본다.
    const { rail, scrollTo } = makeRail({ scrollLeft: 40 });
    centerInRail(chip(4), rail);        // 왼쪽 여유 4px
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const { rail: r2, scrollTo: s2 } = makeRail();
    centerInRail(chip(240), r2);        // 오른쪽으로 삐져나감
    expect(s2).toHaveBeenCalledTimes(1);
  });

  it('왼쪽 끝에 붙어 있고 레일도 이미 0이면 움직이지 않는다(끌어올 곳이 없다)', () => {
    const { rail, scrollTo } = makeRail();
    centerInRail(chip(4), rail);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('화면 밖이면 가운데로 데려온다(넘침 한도 안에서)', () => {
    const { rail, scrollTo } = makeRail();
    centerInRail(chip(300), rail);      // 레일 오른쪽 밖
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const to = scrollTo.mock.calls[0][0] as { left: number };
    expect(to.left).toBeGreaterThan(0);
    expect(to.left, '넘침 한도(scrollWidth - clientWidth = 73)를 넘지 않는다').toBeLessThanOrEqual(73);
  });

  it('대상이 없으면 조용히 아무것도 하지 않는다', () => {
    const { rail, scrollTo } = makeRail();
    centerInRail(null, rail);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
