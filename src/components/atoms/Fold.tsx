// 본문 안 펼침/접힘 — **한 벌**(2026-09-29 오너: "열림·닫힘 모션 전부 정적이지 말고 부드럽게, 누르면 화면이 위아래로 튀는 문제 0").
//   그전: `{open && <내용/>}` 조건부 렌더 ~40곳이 한 프레임에 수백 px 씩 생기고 사라졌다(감사 scratchpad motion-typo-audit.md §1).
//
// 계약
//   ① 높이 0 ↔ 실측 px + 투명도 .45 ↔ 1 을 WAAPI 로. 길이 --dur-base(0.22s, 400px 넘으면 --dur-panel), 곡선 --ease — :root 토큰을 읽는다(CSS 0B).
//   ② 닫힌 뒤에는 **렌더하지 않는다**(예전 조건부 렌더와 같은 DOM). 닫히는 동안은 마지막 내용을 그대로 두고 `inert`(누를 수 없음).
//   ③ 누른 요소는 제자리 — 눌린 요소가 이 판보다 **아래**에 있으면(한 번에 하나 열리는 아코디언·위에 생기는 내용)
//      매 프레임 높이와 스크롤을 **같은 콜백에서** 함께 바꾼다. 다른 rAF 가 어느 순서로 읽어도 top 이 그대로다.
//   ④ 바닥에서 닫기 — 문서가 짧아지면 브라우저가 scrollTop 을 깎아(클램프) 위에 있는 버튼이 내려온다.
//      닫기 전에 모자라는 만큼 스크롤러 끝에 임시 빈 칸을 끼우고, 위로 스크롤하는 만큼 거둔다(keepScroll).
//   ⑤ 동작 줄이기면 즉시(전역 RM CSS 는 WAAPI 에 닿지 않아 JS 에서 본다). 도중에 다시 누르면 지금 높이에서 이어 간다.
//   ⑥ 처음 마운트할 때는 재생하지 않는다 — 탭 keep-alive 재방문·뒤로가기로 다시 그려져도 모션 0.
//   ⑦ 판 안의 것을 눌러 닫히면(메뉴 항목 고름·확인/취소) 즉시 닫는다. 판 밖 머리 토글로 닫을 때만 접힘 모션.
/* eslint-disable react-refresh/only-export-components -- 판(Fold)과 같은 '누른 요소 제자리' 기록(press)을 공유하는 도우미 3개가 동거한다(모듈 상태 한 벌) */
import { useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';

/** 마지막으로 누른 요소와 그때의 top — 캡처 단계라 각 화면의 onClick(상태 변경)보다 먼저 잰다. */
let press: { el: Element; top: number; t: number } | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest('button,summary,a,label,[role=button]') ?? e.target : null;
    press = el && { el, top: el.getBoundingClientRect().top, t: performance.now() };
  }, true);
}

const scrollerOf = (el: Element): HTMLElement => {
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight) return a;
  }
  return document.scrollingElement as HTMLElement;
};
/** 스크롤러 안쪽에 sticky·fixed 조상이 있으면 true — 그 판이 자라면 스크롤 보정은 눌린 요소를 붙잡는 대신
 *  판 아래를 덮는다(일정 탐색 검색줄은 sticky 검색+날짜 띠 안에 있다). 스크롤러 바깥(모달 자체의 fixed)은 보지 않는다. */
const stuck = (el: Element, sc: Element) => {
  for (let a: Element | null = el; a && a !== sc; a = a.parentElement) if (/sticky|fixed/.test(getComputedStyle(a).position)) return true;
  return false;
};
const token = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** ④ `el` 이 곧 `shrink` px 줄어든다 — 그만큼 문서가 짧아져 scrollTop 이 깎이지 않게 스크롤러 끝에 임시 여백을 건다.
 *  여백은 위로 스크롤하는 만큼만 줄고(다시 늘지 않는다), 0 이 되면 원래 인라인 값으로 돌아간다. */
export function keepScroll(el: Element, shrink: number) {
  const sc = scrollerOf(el);
  const doc = sc === document.scrollingElement;
  const box = doc ? document.body : sc;
  let pad = sc.scrollTop + sc.clientHeight - (sc.scrollHeight - shrink);
  if (pad < 1 || box.dataset.keepScroll) return;
  // 여백은 padding 이 아니라 **새로 끼우는 빈 칸**으로 준다 — 동작 줄이기의 전역 `*{transition-duration:.01ms}` 가
  //   padding 변경까지 0.01ms 전환으로 만들어, 그 프레임 레이아웃엔 옛 값이 들어가 클램프가 그대로 났다(2026-09-29 실측, RM 에서만 +44).
  //   새로 생긴 요소의 첫 스타일은 전환하지 않는다.
  const gap = document.createElement('div');
  gap.setAttribute('aria-hidden', 'true');
  const target: HTMLElement | Window = doc ? window : sc;
  const apply = () => { gap.style.height = `${pad}px`; };
  const onScroll = () => {
    pad = Math.min(pad, Math.max(0, sc.scrollTop + sc.clientHeight - (sc.scrollHeight - pad)));
    if (pad > 0) return apply();
    gap.remove();
    delete box.dataset.keepScroll;
    target.removeEventListener('scroll', onScroll);
  };
  box.dataset.keepScroll = '1';
  apply();
  box.appendChild(gap);
  target.addEventListener('scroll', onScroll, { passive: true });
  // 줄어든 뒤 한 번 더 깎는다 — 판에 최소 높이가 걸린 화면(매장 페이지 1440)은 문서가 줄어든 높이만큼 다 줄지 않아
  //   예상 여백(405)이 실제 필요(227)보다 커 끝에 빈 띠가 남았다. 전환(details 0.3s·Fold ≤0.32s)이 끝난 뒤에만 깎아야
  //   도중에 줄였다가 다시 클램프가 나지 않는다.
  setTimeout(onScroll, 400);
}

/** 방금 누른 요소(1초 안)가 바로 앞 DOM 변경으로 움직였으면 **같은 프레임에** 스크롤로 되돌린다 — 레이아웃 이펙트에서 부른다.
 *  Fold 로 감쌀 수 없는 펼침(그리드 칸이 여기저기 끼어드는 대시보드 '더 보기')용. */
export function pinPressed() {
  const p = press;
  if (!p || !p.el.isConnected || performance.now() - p.t > 1000) return;
  const sc = scrollerOf(p.el);
  const dy = p.el.getBoundingClientRect().top - p.top;
  if (dy && !stuck(p.el, sc)) sc.scrollTop += dy;
}

/** 칸이 그리드 여기저기에 끼어드는 펼침(대시보드 '더 보기') — Fold 로 한 덩어리로 감쌀 수 없는 곳.
 *  반환값(shown)으로 렌더하고 펼침 칸에 `data-reveal` 을 단다. 열면 그 프레임에 누른 버튼을 제자리로(pinPressed) + 칸 투명도 .45→1,
 *  닫으면 칸이 1→0 으로 사라진 **뒤** 빠지고 그 프레임에 다시 제자리로. 처음 마운트·동작 줄이기는 모션 0. */
export function useReveal(open: boolean): boolean {
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const ready = useRef(false);
  useLayoutEffect(() => { if (ready.current && !shown) pinPressed(); }, [shown]);
  useLayoutEffect(() => {
    if (!ready.current) { ready.current = true; return; }
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const opt = { duration: parseFloat(token('--dur-base')) * 1000 || 220, easing: token('--ease') || 'ease' };
    if (open) {
      pinPressed();
      if (!reduced()) els.forEach((e) => e.animate({ opacity: [0.45, 1] }, opt));
      return;
    }
    if (reduced()) return setShown(false);
    const a = [...els].map((e) => e.animate({ opacity: [1, 0] }, { ...opt, fill: 'forwards' }));
    const t = setTimeout(() => setShown(false), opt.duration);
    return () => { clearTimeout(t); a.forEach((x) => x.cancel()); };
  }, [open]);
  return open || shown;
}

/** ④ 네이티브 `<details>` 용 — `<summary onClick={onSummaryClick}>`. 닫히는 클릭이면 줄어들 높이만큼 keepScroll.
 *  닫힌 높이 = 요약줄 마진 상자 + details 의 padding·border(요약줄에 음수 마진을 거는 곳이 있어 offsetHeight 만 빼면 모자란다 — 법정 푸터 실측 32 vs 44.6). */
export function onSummaryClick(e: SyntheticEvent<HTMLElement>) {
  const s = e.currentTarget;
  const d = s.parentElement as HTMLDetailsElement;
  if (!d.open) return;
  const a = getComputedStyle(s), b = getComputedStyle(d);
  const px = (...v: string[]) => v.reduce((n, x) => n + (parseFloat(x) || 0), 0);
  keepScroll(d, d.offsetHeight - s.offsetHeight - px(a.marginTop, a.marginBottom, b.paddingTop, b.paddingBottom, b.borderTopWidth, b.borderBottomWidth));
}

export function Fold({ open, children, className, id, x, keepMounted }: {
  open: boolean;
  /** 닫힌 뒤에도 언마운트하지 않고 `hidden` 으로 숨긴다 — 예전에 `hidden` 클래스로 접던 판(이용권 보유자 목록)의
   *  DOM·내부 상태(펼친 행·스크롤·입력)를 다시 열 때까지 보존한다. */
  keepMounted?: boolean;
  /** 가로로 펼친다(폭 0↔실측) — 같은 줄 안에서 옆으로 자라 위아래 요소가 움직이지 않는 곳(일정 탐색 검색 입력). 누른 요소 보정·바닥 클램프는 세로 전용이라 끈다. */
  x?: boolean;
  /** 닫혀 있을 때 계산하면 안 되는 내용(선택된 행 등)은 함수로 넘긴다 — 열려 있을 때만 부른다. */
  children: ReactNode | (() => ReactNode);
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const last = useRef<ReactNode>(null);
  const content = open ? (typeof children === 'function' ? children() : children) : last.current;
  const stop = useRef<(() => void) | null>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => { if (open) last.current = content; });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!mounted.current || !el) { mounted.current = true; return; }
    const running = stop.current;
    const h0 = el.getBoundingClientRect()[x ? 'width' : 'height'];
    // 부모 space-y 가 판에 거는 margin 도 높이와 같이 0↔값으로 민다 — 안 그러면 여는 첫 프레임에 한 번에 생기고
    //   닫는 끝 프레임(언마운트)에 한 번에 사라졌다(딜러 ICM·글쓰기 12.75px, 클락 블라인드 8.5px — 2026-09-30 검토 D1).
    const sides = x ? (['marginLeft', 'marginRight'] as const) : (['marginTop', 'marginBottom'] as const);
    const cs = getComputedStyle(el);
    const m0 = sides.map((k) => cs[k]); // 도중에 다시 누르면 지금(애니메이션 중) 값에서 이어 간다
    running?.();
    stop.current = null;
    el.inert = !open;
    const s = el.style;
    s.display = 'flow-root';
    s.overflow = 'clip';
    // '누른 요소가 판 아래인가' 는 판을 보이게 한 **뒤에** 잰다 — keepMounted 판은 닫힘 끝의 inline display:none 이 남아 있어
    //   그 상태로 재면 rect 가 0(bottom 0)이라 늘 '아래' 로 오판했고, 재열림마다 pin·앵커링 끄기가 켜져 scrollY 가 샜다(2026-09-30 검토 N1).
    const p = !x && press && press.el.isConnected && performance.now() - press.t < 1000 && !el.contains(press.el)
      && el.getBoundingClientRect().bottom <= press.el.getBoundingClientRect().top + 1 && !stuck(el, scrollerOf(press.el)) ? press : null;
    const sc = p && scrollerOf(p.el);
    const pin = () => { if (p && sc) { const dy = p.el.getBoundingClientRect().top - p.top; if (dy) sc.scrollTop += dy; } };
    const full = x ? el.scrollWidth : el.scrollHeight;
    const from = running ? h0 : open ? 0 : full;
    const to = open ? full : 0;
    const mFrom: Keyframe = {}, mTo: Keyframe = {};
    let mShrink = 0;
    sides.forEach((k, i) => {
      const rest = cs[k]; // 취소 뒤라 CSS 값
      if (!parseFloat(rest) && !parseFloat(m0[i])) return;
      mFrom[k] = running ? m0[i] : open ? '0px' : rest;
      mTo[k] = open ? rest : '0px';
      mShrink += parseFloat(mFrom[k] as string) || 0;
    });
    const done = (a?: Animation) => {
      stop.current = null;
      if (sc) sc.style.overflowAnchor = '';
      if (open) { s.display = s.overflow = ''; a?.cancel(); pin(); return; }
      // 닫힘: 같은 프레임에 숨기고 끝난 애니메이션(fill: both → 높이 0)을 걷는다 — keepMounted 로 남은 판을 다시 열 때
      //   옛 닫힘 키프레임이 새 열림 위에 남아 높이 0 에 갇히지 않게.
      s.display = 'none';
      a?.cancel();
      setShown(false);
    };
    if (!open && !p && !x) keepScroll(el, from + mShrink);
    // 판 **안**의 것을 눌러 닫히면(메뉴에서 항목 고름·확인/취소) 즉시 닫는다 — 고른 뒤 220ms 동안 누를 수 없는 메뉴가
    //   남아 있으면 그 사이 판 교체(내 매장 섹션 이동)의 정렬·스냅샷이 줄어드는 메뉴를 재고, 다시 열기 탭도 헛돈다.
    //   머리 토글(판 밖)로 닫을 때만 부드럽게 접힌다.
    const picked = !open && press && performance.now() - press.t < 1000 && el.contains(press.el);
    if (reduced() || from === to || picked) {
      if (!open) s.display = 'none';
      pin();
      return done();
    }
    const dur = parseFloat(token(Math.max(from, to) > 400 ? '--dur-panel' : '--dur-base')) * 1000 || 220;
    const dim = x ? 'width' : 'height';
    const anim = el.animate([{ ...mFrom, [dim]: `${from}px`, opacity: open ? 0.45 : 1 }, { ...mTo, [dim]: `${to}px`, opacity: open ? 1 : 0.45 }],
      { duration: dur, easing: token('--ease') || 'ease', fill: 'both' });
    anim.pause();
    if (sc) sc.style.overflowAnchor = 'none';
    const t0 = performance.now();
    let raf = 0;
    // 재생을 브라우저 시계에 맡기지 않고 매 프레임 직접 민다 — 높이와 스크롤 보정(pin)이 한 콜백 안에서 같이 바뀌어야
    // 다른 rAF(측정기 포함)가 그 사이의 어긋난 상태를 보지 못한다.
    const tick = () => {
      const t = Math.min(performance.now() - t0, dur);
      anim.currentTime = t;
      pin();
      if (t < dur) raf = requestAnimationFrame(tick); else done(anim);
    };
    tick();
    stop.current = () => { cancelAnimationFrame(raf); anim.cancel(); if (sc) sc.style.overflowAnchor = ''; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- 축(x)은 호출부 상수다

  useLayoutEffect(() => () => stop.current?.(), []);

  if (!open && !shown && !keepMounted) return null;
  return <div ref={ref} id={id} className={className} hidden={!open && !shown}>{content}</div>;
}
