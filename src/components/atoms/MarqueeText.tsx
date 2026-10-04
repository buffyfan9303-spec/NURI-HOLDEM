// src/components/atoms/MarqueeText.tsx
// 전광판 — 한 줄에 안 들어가는 글이 잘리는 대신 옆으로 흐르고 무한 루프로 돌아온다.
//
// **넘칠 때만** 흐른다: 들어가는 글은 정적 truncate 그대로다(measureRef 로 매 리사이즈 재판정).
// 그래서 목록에 써도 짧은 줄들은 애니메이션을 만들지 않는다.
//
// 모션 헌법 §20.4 #1 의 '무한 루프' 허용 예외에 해당한다 — transform 전용이라 컴포지터에 상주하고
// 레이아웃을 건드리지 않는다. reduced-motion 폴백은 index.css 의 `.marquee-loop` 블록이
// 정적 말줄임으로 되돌린다(여기서 따로 분기하지 않는다).
//
// 원래 ScheduleDetailModal 안에만 있던 것을 원자로 올렸다(외치기 전광판·게시판 제목이 같은 것을 쓴다).
import { useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

export default function MarqueeText({ text, children, className = '', testId }: {
  /** 측정·재판정의 기준이 되는 문자열. children 을 줄 때도 반드시 같은 내용을 넘긴다. */
  text: string;
  /** 색·굵기가 섞인 줄(예: 닉네임만 다른 색)을 흘릴 때. 없으면 text 를 그대로 그린다. */
  children?: ReactNode;
  className?: string;
  /** ⚠ 뷰포트에만 붙는다 — 내용은 2벌 복제되므로 자식에 달면 getByTestId 가 strict mode 로 터진다. */
  testId?: string;
}) {
  // ⚠ span 이다(div 아님) — 공지 행처럼 <button> 안에 들어가는 곳이 있는데
  //   <button> 은 phrasing content 만 받는다. block/flex 를 명시해 겉보기는 div 와 같다.
  const viewportRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [loopW, setLoopW] = useState(0); // 0 = 넘치지 않음(정적)
  // 🔴 2026-10-04 오너 "문구가 끝나면 뚝 끊긴 다음 다시 흐른다" — 외치기 방송이 다음 차례로 바뀌면 같은 트랙 span 이 재사용돼
  //   애니메이션이 이어서 돌았다: 새 문구가 **중간(−235px)부터** 들어오고 주기(15s→17s)만 바뀌어 위치가 튀었다(실측 marq2).
  //   ① 트랙에 key={text} — 문구가 바뀌면 처음(x=0)부터 다시 흐른다. 같은 문구 안의 순환은 2벌 복제 + −50% 라 이음새가 없다.
  //   ② 판정은 페인트 **전**(layout effect) — 새 문구 첫 프레임이 옛 폭·옛 주기로 그려졌다가 바뀌지 않게.
  useLayoutEffect(() => {
    const vp = viewportRef.current, ms = measureRef.current;
    if (!vp || !ms) return;
    const check = () => setLoopW(ms.offsetWidth > vp.clientWidth + 1 ? ms.offsetWidth : 0);
    check();
    const ro = new ResizeObserver(check); // 폰트 로드·회전·2-pane 리사이즈에도 재판정
    ro.observe(vp);
    return () => ro.disconnect();
  }, [text]);
  const body = children ?? text;
  const GAP = 32; // 복제본 사이 간격(px) — pr-8 과 일치해야 -50% 지점이 정확히 맞물린다
  // 흐를 때만 좌우 14px 를 서서히 사라지게 한다(M-12, 2026-10-01) — 칸 경계에서 반쪽 글자가 잘려 보이던 것.
  //   index.css `.marquee-fade` 의 양 끝 오버레이(지면색 → 투명)다. motion-safe 한정(동작 줄이기에서는 정적 말줄임).
  //   🔴 mask-image 로 만들면 줄마다 마스크 합성면이 생겨 하위 탭 전환 첫 프레임에 새 판 타일이 비었다
  //   (e2e tab-handoff-gate ④ — base 통과·마스크판 실패, verifier 10-01). 지면색은 소비처가 --marquee-fade(-l) 로 맞춘다.
  const edgeFade = loopW > 0 ? ' marquee-fade' : '';
  return (
    <span ref={viewportRef} data-testid={testId} className={`relative block min-w-0 overflow-hidden${edgeFade} ${className}`}>
      {/* 측정 전용(불가시) 상주 — 마퀴 전환 뒤에도 '더는 안 넘침' 복귀 판정이 가능하다 */}
      <span ref={measureRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap">{body}</span>
      {loopW > 0 ? (
        <span
          key={text}
          className="marquee-loop flex w-max"
          style={{ '--marquee-dur': `${Math.max(6, Math.round((loopW + GAP) / 28))}s` } as CSSProperties}
        >
          <span className="whitespace-nowrap pr-8">{body}</span>
          <span className="whitespace-nowrap pr-8" aria-hidden>{body}</span>
        </span>
      ) : (
        <span className="block truncate">{body}</span>
      )}
    </span>
  );
}
