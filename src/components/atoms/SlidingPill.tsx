// SlidingPill — framer-motion layoutId 를 대체하는 공용 FLIP 인디케이터.
//
// ── 왜 만들었나 ─────────────────────────────────────────────────────────────
// 앱의 '미끄러지는 알약/밑줄'(세그먼트·탭·필터 칩) 13곳이 전부 framer-motion 의
// layoutId 공유 레이아웃 애니메이션이었다 — 이 13곳 때문에 vendor-motion 청크
// 130KB 가 부팅마다 내려왔다. 미끄러짐의 본질은 FLIP(위치 측정 → transform 전환)
// 하나뿐이므로, 그 한 가지를 직접 구현해 의존성을 끊는다.
//
// ── 동작 ────────────────────────────────────────────────────────────────────
// 버튼들의 공통 부모(relative)에 이 컴포넌트를 한 번 두고, 활성 버튼에
// `data-pill-active` 를 표시한다. activeKey 가 바뀌면 활성 버튼을 측정해
// width/height 는 즉시 최종값으로 박고, **transform(translate+scale) 전용 FLIP**으로
// 미끄러진다(전환은 --ease 단일 곡선) — 애니메이션 구간이 전부 컴포지터에서 돈다.
//
//  <div ref={ref} className="relative ...">
//    <SlidingPill containerRef={ref} activeKey={value} className="bg-accent-300/15 rounded-full" />
//    {items.map(v => <button data-pill-active={v === value || undefined} ...>)}
//  </div>
//
// ── 원칙 ────────────────────────────────────────────────────────────────────
// · 첫 배치는 전환 없이 즉시(마운트 순간 미끄러져 들어오는 유령 모션 방지)
// · 리사이즈·폰트 로드로 배치가 변하면 재측정(ResizeObserver)
// · 대상이 없으면(활성 없음) 조용히 숨김 — 렌더 트리를 어지럽히지 않는다
import { useLayoutEffect, useRef, useState } from 'react';
import { isViewTransitionActive } from '../../lib/viewTransition';

interface Props {
  /** 버튼들의 공통 부모(position:relative 필수). 생략하면 이 스팬의 부모를 자동 사용 —
      기존 마크업의 컨테이너에 ref 를 꽂기 어려운 인라인 사이트용. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** 활성 항목 식별자 — 바뀔 때마다 재측정·이동 */
  activeKey: string | number | null;
  /** 알약의 시각 스타일(배경·라운드·그림자 등) */
  className?: string;
  /** underline 모드: 버튼 하단에 붙는 밑줄(높이 고정) */
  underline?: boolean;
}

export default function SlidingPill({ containerRef, activeKey, className = '', underline = false }: Props) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const firstRef = useRef(true);
  const prevRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [, force] = useState(0);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const container = containerRef?.current ?? (pill?.parentElement as HTMLElement | null);
    if (!container || !pill) return;

    const measure = () => {
      const target = container.querySelector<HTMLElement>('[data-pill-active]');
      if (!target) { pill.style.opacity = '0'; prevRect.current = null; return; }
      // ⚠ 화면에 없는 동안(display:none)에는 재지 않는다.
      //   최상위 탭은 언마운트하지 않고 display 로만 껐다 켜는데(App.tsx keep-alive), 꺼져 있는 사이에도
      //   activeKey 는 바뀔 수 있다 — 예: 대시보드의 '내 장터 거래' 바로가기가 쏘는
      //   nuri:community-section 이벤트. 그때 offsetParent 가 null 이라 offsetLeft/offsetWidth 가
      //   전부 0 으로 나오고, 알약이 레일 **맨 왼쪽**에 박힌다. 다시 켜지면 활성 탭은 장터인데
      //   알약만 홀덤펍 자리에 남아 있는 화면이 된다(오너 리포트 2026-09-08 · 실측 복귀 후 87ms 지점).
      //   틀린 자리를 보여주느니 잠시 숨긴다. 다시 보이면 ResizeObserver 가 깨워 제자리에 놓는다
      //   (firstRef=true 라 미끄러지지 않고 즉시 — 어디선가 날아오는 유령 모션 방지).
      //   prevRect 는 건드리지 않는다 — 0 짜리 가짜 위치를 '이전 위치'로 기억하면 다음 FLIP 이 거기서 출발한다.
      if (target.offsetParent === null || target.offsetWidth === 0) {
        pill.style.opacity = '0';
        firstRef.current = true;
        return;
      }
      const first = firstRef.current;
      firstRef.current = false;
      // ⚠ target.offsetLeft 를 그대로 쓰면 안 된다 — **이것이 '알약이 첫 칸으로 간다'의 근본 원인이었다**
      //   (2026-09-10 실기기 재보고 · 터치+CPU×4 계측으로 확정).
      //   Chromium 은 transform 이 걸린 조상을 offsetParent 로 삼는다. 전역 프레스 물리(index.css
      //   `button:active { transform: scale(.97) }` + 0.2s 복귀 전환)가 방금 누른 탭 버튼에 걸려 있는 동안
      //   span 의 offsetParent 가 레일이 아니라 **버튼**이 되어 offsetLeft 가 0 → 알약이 레일 맨 왼쪽으로 간다.
      //   실측: 탭 뒤 +60~500ms 내내 offsetParent=BUTTON · offsetLeft=0 · dx=128/191/317px, 600ms verify
      //   타이머가 되돌릴 때까지 첫 칸에 머문다. VT 경로에선 그 틀린 값이 '새 스냅샷'이 되어 전환 자체가
      //   알약을 첫 칸으로 미끄러뜨린다(오너 스크린샷 2 = 그 중간 프레임). 09-07 전엔 바 스냅샷이 정지라
      //   이 우회가 가려졌고 600ms 뒤 제자리로 가는 것만 보였다("누르면 나중에 움직여") — 같은 뿌리다.
      //   Playwright 의 click/tap 은 누름이 0ms 라 :active 가 렌더되기 전에 끝나 26가지 시나리오에서
      //   한 번도 재현되지 않았다. 실제 손가락은 누르고 있는 시간이 있다.
      //   offsetLeft/offsetTop 은 레이아웃 값이라 transform 의 영향을 받지 않는다 — 조상 사슬을 레일까지
      //   더하면 offsetParent 가 누구든 답이 같다. getBoundingClientRect 는 안 된다(scale 이 그대로 섞인다).
      const layoutPos = (el: HTMLElement) => {
        let x = 0, y = 0;
        let n: HTMLElement | null = el;
        while (n && n !== container && n !== document.body) {
          x += n.offsetLeft; y += n.offsetTop;
          n = n.offsetParent as HTMLElement | null;
        }
        // 사슬이 레일에 닿지 않으면(레일이 positioned 가 아닌 사용처) 예전 계산으로 — 동작 보존
        return n === container ? { x, y } : { x: el.offsetLeft, y: el.offsetTop };
      };
      const p = layoutPos(target);
      const r = underline
        ? { x: p.x + 8, y: p.y + target.offsetHeight - 2, w: Math.max(0, target.offsetWidth - 16), h: 2 }
        : { x: p.x, y: p.y, w: target.offsetWidth, h: target.offsetHeight };
      const prev = prevRect.current;
      prevRect.current = r;
      pill.style.opacity = '1';
      // [DS] MO-4 진짜 FLIP: width/height 는 즉시 최종값(레이아웃 1회)으로 박고,
      // 미끄러짐은 transform(translate+scale) 만 — 애니메이션 구간 전체가 컴포지터에서 돈다.
      // (예전엔 width/height 가 트랜지션에 포함돼 매 프레임 레이아웃+페인트였다)
      pill.style.width = `${r.w}px`;
      pill.style.height = `${r.h}px`;
      if (first || !prev || isViewTransitionActive()) {
        // 첫 배치·리사이즈 보정은 전환 없이 — 어디선가 미끄러져 들어오는 유령 모션 방지.
        //
        // View Transition 이 도는 중에도 전환 없이 간다(2026-09-07). 이유: VT 는 update 콜백
        // 직후의 **렌더된 값**으로 새 스냅샷을 뜨는데, 여기서 CSS 트랜지션을 걸면 그 순간 경과가
        // 0이라 아직 '이전 위치'다 → VT 가 A→A 를 보간해 알약이 전혀 안 움직이고, 전환이 끝나는
        // 순간 최종 위치로 툭 튄다(오너 리포트: "누르면 나중에 움직여"). 최종 위치로 즉시 가면
        // VT 가 옛 스냅샷(A)과 새 스냅샷(B)을 제 손으로 보간한다 — 미끄러짐의 주체가 바뀔 뿐
        // 사용자가 보는 결과는 같다. VT 를 안 타는 경로(폴백·모션축소)에선 아래 FLIP 그대로.
        pill.style.transition = 'none';
        pill.style.transform = `translate(${r.x}px, ${r.y}px)`;
        return;
      }
      // Invert: 새 크기의 알약을 '이전 시각 박스'로 되돌려 놓고(transform-origin 0 0 전제)
      const sx = r.w > 0 ? prev.w / r.w : 1;
      const sy = r.h > 0 ? prev.h / r.h : 1;
      pill.style.transition = 'none';
      pill.style.transform = `translate(${prev.x}px, ${prev.y}px) scale(${sx}, ${sy})`;
      void pill.offsetWidth; // Invert 프레임 고정(의도적 강제 리플로우 1회) — 이후는 컴포지터
      // Play: transform 만 전환
      // v2: 화면 안에서 자리를 옮기는 것은 --ease-move(양끝 감속) — 출발이 급한 감속 곡선은 '튀어나가는' 느낌을 준다(헌법 §1)
      pill.style.transition = 'transform var(--dur-base) var(--ease-move), opacity var(--dur-fast) var(--ease)';
      pill.style.transform = `translate(${r.x}px, ${r.y}px)`;
    };
    measure();

    // 컨테이너 크기 변화(회전·리사이즈·폰트 로드) → 재측정. 전환 없이 자리만 맞춘다.
    const ro = new ResizeObserver(() => {
      firstRef.current = true; // 리사이즈 보정은 미끄러질 필요가 없다
      measure();
    });
    ro.observe(container);
    // ⚠ 크기만 보면 놓치는 게 있다 — full-width·justify-center 컨테이너(PC GNB)는 폰트 스왑으로
    //   '형제' 라벨 폭이 변하면 활성 타깃이 옆으로 밀리는데, 컨테이너도 타깃도 제 크기는 그대로라
    //   RO 가 침묵한다(실측: 밑줄이 활성 탭에서 61px 어긋난 채 고정). 그래서 형제 전부를 관찰한다 —
    //   누구 폭이 변하든 그게 곧 이 알약의 위치 변화이므로.
    for (const child of Array.from(container.children)) {
      if (child instanceof HTMLElement && child !== pill) ro.observe(child);
    }
    let alive = true;
    // ⚠ document.fonts.ready 로는 부족하다 — Pretendard 는 media="print"→onload 로 '비차단' 로드라
    //   ready 가 이미 resolve 된 뒤에 스왑이 일어난다(실측: measure 당시 365px → 스왑 후 301px,
    //   밑줄이 64px 어긋난 채 고정). RO 도 침묵한다: 폰트 스왑은 컨테이너·타깃의 '자기 크기'를
    //   안 바꾸고 형제 폭만 줄여 위치를 미는 경우가 있다.
    //   그래서 첫 배치 뒤 몇 지점에서 값이 달라졌는지 확인하고 달라졌을 때만 다시 놓는다.
    //   (전환 없는 재배치라 시각적 점프 없음 · 타이머 3개는 마운트당 1회로 끝난다)
    //   ⚠ 비교 기준은 '내가 계산해 둔 값(prevRect)'이 아니라 '화면에 실제로 그려진 위치'여야 한다.
    //     View Transition 캡처 중에 measure 가 돌면 그때의 레이아웃이 prevRect 에 그대로 저장돼,
    //     계산값끼리 비교하면 어긋난 채로 '제자리'라고 판정한다(실측: 탭 전환마다 밑줄이 한 박자
    //     뒤처져 최대 443px 어긋남). 그려진 rect 와 타깃 rect 를 직접 대조하면 그 착시가 없다.
    const verify = () => {
      if (!alive) return;
      // 미끄러지는 **도중**에는 검사하지 않는다(타이머 경로 포함). 전환 중의 rect 는 당연히 목표와 다르고,
      // 그걸 '어긋남'으로 보면 measure 가 firstRef=true 로 즉시 이동시켜 슬라이드를 죽인다 — 뒤 타이머가 다시 본다.
      if (pill.getAnimations().some((a) => a.playState === 'running')) return;
      const t = container.querySelector<HTMLElement>('[data-pill-active]');
      if (!t) return;
      const tr = t.getBoundingClientRect();
      const pr = pill.getBoundingClientRect();
      const wantX = underline ? tr.left + 8 : tr.left;
      const wantW = underline ? Math.max(0, tr.width - 16) : tr.width;
      if (Math.abs(pr.left - wantX) < 1 && Math.abs(pr.width - wantW) < 1) return; // 이미 제자리
      firstRef.current = true; // 보정은 미끄러질 필요가 없다
      measure();
    };
    const timers = [150, 600, 1500].map((ms) => window.setTimeout(verify, ms));
    document.fonts?.ready.then(() => requestAnimationFrame(verify));

    // ── 자기교정 그물 (2026-09-10, 오너 재보고) ─────────────────────────────────
    // 오너가 실제 화면에서 다시 목격했다: 활성 라벨은 '장터'인데 알약은 레일 맨 왼쪽에 있었다.
    // 재현 시나리오 26가지(섹션 6종 전환·탭 왕복·숨은 채 섹션 변경·회전·새로고침·뒤로가기,
    // 360/412px)를 다 돌려도 어긋남 0건이었다. 진짜 원인은 그 뒤 '누르고 있다 떼는' 터치 계측으로
    // 잡았다(위 measure 의 layoutPos 주석 · e2e/pill-press.spec.ts). 이 그물은 그 수정과 별개로
    // 남긴다 — 알약이 어떤 이유로든 어긋나면 늦어도 몇 초 안에 제자리로 돌아오게 하는 방어선이다.
    //
    //  ⓐ MutationObserver — 지금까지의 재측정 트리거는 activeKey(리액트 리렌더)·크기 변화·타이머
    //     셋뿐이라, **DOM 이 바뀌었는데 크기는 안 변한 경우**를 놓친다. 예: 탭 목록에 '장터'가
    //     뒤늦게 끼어들어 data-pill-active 가 다른 노드로 옮겨가는 경우, View Transition 이
    //     스냅샷을 붙였다 떼며 클래스·스타일을 갈아 끼우는 경우.
    //     data-pill-active 의 이동 자체가 곧 알약이 가야 할 곳의 변화다.
    //  ⓑ 탭이 다시 보일 때 — 이 앱은 최상위 탭을 언마운트하지 않고 display 로만 끈다.
    //     숨은 동안의 측정은 전부 0 이라 알약을 숨겨 두는데, 다시 보일 때 RO 가 늘 깨어나 준다는
    //     보장이 없다(크기가 그대로일 수 있다). visibilitychange·pageshow 에서도 확인한다.
    //  ⓒ 타이머를 3초·5초까지 늘린다 — 1.5초 뒤에 도착하는 비동기 슬롯(장터·매장 권한)이 있다.
    //
    // 비용: verify() 는 getBoundingClientRect 2회로 시작해 **어긋났을 때만** measure 한다.
    //       rAF 로 묶어 한 프레임에 한 번만 돈다.
    let raf = 0;
    const scheduleVerify = () => {
      if (!alive || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; verify(); }); // 슬라이드 중 건너뛰기는 verify 가 한다
    };
    const mo = new MutationObserver((records) => {
      // ⚠ 알약 자신의 style 변경은 무시한다 — measure 가 방금 쓴 값이라, 되먹임 고리가 된다.
      if (records.every((r) => r.target === pill)) return;
      scheduleVerify();
    });
    mo.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pill-active', 'class', 'style'] });
    const onWake = () => { if (document.visibilityState === 'visible') scheduleVerify(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('pageshow', onWake);
    const lateTimers = [3000, 5000].map((ms) => window.setTimeout(verify, ms));

    return () => {
      alive = false;
      ro.disconnect(); mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('pageshow', onWake);
      [...timers, ...lateTimers].forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, underline]);

  // strict 재측정 트리거(폰트 늦은 로드 등 드문 케이스) — 필요 시 호출부가 key 로 강제
  void force;

  return (
    <span
      ref={pillRef}
      aria-hidden
      // VT 스코프 안에서 이 알약에 자기 view-transition-name 을 붙이기 위한 표식(index.css).
      // 정지된 탭바 스냅샷 안에 있으면 FLIP 이동이 가려지므로 VT 가 알약만 따로 보간하게 한다.
      data-sliding-pill
      // origin-top-left: FLIP scale 보정의 수학이 좌상단 원점을 전제로 한다
      className={['pointer-events-none absolute left-0 top-0 z-0 origin-top-left opacity-0 will-change-transform', className].join(' ')}
    />
  );
}
