// src/components/features/tools/Term.tsx
// 제안 ⑩ — 용어사전 인라인 연결. 계산기 본문의 '단어'에 붙이는 점선 밑줄 + 뜻풀이 팝오버.
//
// 왜: 사전(glossary.data.ts)에 79개 용어가 있는데 사전 패널을 연 사람에게만 닿았다.
//     초보가 계산기를 닫는 이유는 숫자가 아니라 MDF·SPR·블로커 같은 '단어'다.
//     새 콘텐츠 0 · 기존 자산의 도달률만 올리는 연결 작업.
//
// 설계 결정 4가지
//  ① 탭이 1급 — 유저 99%가 모바일이다. hover 는 마우스(pointerType==='mouse')에서만 얹는
//     보너스이고, 터치에서는 순수하게 탭으로 열고 탭으로 닫는다(hover 전용이면 폰에서 죽는다).
//  ② 자동 치환 금지 — 본문을 정규식으로 훑어 감싸지 않는다. 호출부가 손으로 고른 단어에만 붙인다.
//     사전에 없는 키가 오면 예외 대신 원문을 그대로 렌더한다(개발 중에만 콘솔 경고).
//  ③ 잘림 방지 = position:fixed — 도구는 Modal(page)의 overflow-y-auto 안에서 렌더된다.
//     overflow-y:auto 는 x축까지 auto 로 만들어 absolute 팝오버를 잘라먹는다. fixed 는 그 클립을
//     벗어나고, 좌우는 뷰포트 기준으로 8px 여백까지 clamp 한다(375에서 폭 280 → 잘림 0).
//     위/아래는 '높이 측정 없이' 뒤집는다 — 아래로 열 땐 top, 위로 열 땐 bottom 을 고정해
//     2패스 측정(깜빡임)을 없앴다.
//  ④ 모션 헌법 — 새 이징·duration·클래스를 만들지 않는다. 등장은 기존 .animate-fade-in
//     (0.16s var(--ease), prefers-reduced-motion 목록에 이미 등록됨) 하나뿐이고,
//     팝오버가 .fixed 라 .tab-pane 무효화 규칙(:not(.fixed))의 대상이 아니다 = 열 때마다 정상 재생.
//     상시 will-change·backdrop-filter 없음.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { findGlossaryTerm } from './glossary.data';

const GAP = 8;        // 앵커와 말풍선 사이
const EDGE = 8;       // 화면 좌우 최소 여백
const MAX_W = 280;    // 말풍선 최대 폭(375 화면에서 280 + 좌우 8 = 296 → 여유 79px)

interface Pos {
  left: number;
  top?: number;     // 아래로 열 때
  bottom?: number;  // 위로 열 때(높이를 몰라도 되도록 bottom 을 고정)
  width: number;
  caret: number;    // 말풍선 안에서 꼬리의 x(앵커 중심에 맞추되 모서리에서 clamp)
  above: boolean;
}

interface TermProps {
  /** 사전 키 — 한글 용어 또는 영문 표기(예: '에퀴티', 'MDF', 'Pot Odds'). 정확 일치만 찾는다. */
  name: string;
  /** 화면에 보일 문구. 생략하면 사전의 용어를 그대로 쓴다(기존 카피를 바꾸지 않으려면 명시할 것). */
  children?: ReactNode;
  className?: string;
}

export default function Term({ name, children, className }: TermProps) {
  const entry = findGlossaryTerm(name);
  const [pos, setPos] = useState<Pos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const hovering = useRef(false);
  const descId = `term-${useId()}`;

  // 위치 계산 — 열 때 1회. 스크롤/리사이즈는 재계산 대신 닫는다(fixed 가 스크롤을 따라가지 않으므로).
  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(MAX_W, vw - EDGE * 2);
    const left = Math.max(EDGE, Math.min(r.left + r.width / 2 - width / 2, vw - EDGE - width));
    // 앵커가 화면 아래쪽 40%에 있으면 위로 연다 — 하단 탭바/키보드에 가리지 않게.
    const above = r.bottom > vh * 0.6;
    setPos({
      left,
      width,
      above,
      top: above ? undefined : r.bottom + GAP,
      bottom: above ? vh - r.top + GAP : undefined,
      caret: Math.max(10, Math.min(width - 10, r.left + r.width / 2 - left)),
    });
  }, []);

  const close = useCallback(() => setPos(null), []);
  const open = pos !== null;

  // 바깥 탭·ESC·스크롤·리사이즈로 닫기. 스크롤은 capture+passive 로 내부 스크롤러까지 잡는다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();      // 도구 전체화면 Modal 이 같이 닫히지 않게 — 툴팁부터 닫는다
      close();
      btnRef.current?.focus();
    };
    const onDown = (e: Event) => {
      if (!btnRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  // 사전에 없는 키 — 화면은 원문 그대로(기능 손실 0), 개발 중에만 경고해서 오타를 잡는다.
  if (!entry) {
    if (import.meta.env.DEV) console.warn(`[Term] 사전에 없는 용어: "${name}"`);
    return <>{children ?? name}</>;
  }

  return (
    <span className="inline">
      <button
        ref={btnRef}
        type="button"
        data-term={entry.term}
        // 접근성: 뜻풀이는 팝오버 상태와 무관하게 항상 aria-describedby 로 붙어 있다.
        // (팝오버는 시각 전용 — aria-hidden. 열림/닫힘에 따라 설명이 사라지면 스크린리더 사용자만 손해다.)
        aria-describedby={descId}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') { hovering.current = true; place(); } }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') { hovering.current = false; close(); } }}
        onClick={() => {
          // 마우스 hover 로 이미 떠 있으면 클릭이 닫아버리지 않게 유지(위치만 갱신).
          if (hovering.current) { place(); return; }
          if (open) close(); else place();
        }}
        className={[
          // 점선 밑줄 — 글자색은 상속(주변 카피의 위계를 흔들지 않는다), 밑줄만 accent.
          'inline cursor-help underline decoration-dotted underline-offset-[3px]',
          'decoration-accent-300/70 hover:text-accent-300 hover:decoration-accent-300',
          'transition-colors duration-[var(--dur-fast)] [transition-timing-function:var(--ease)]',
          // 터치 타겟 여유 — 인라인이라 줄높이를 건드리지 않고 히트영역만 넓힌다.
          '-mx-0.5 px-0.5 py-0.5 rounded-[3px]',
          className ?? '',
        ].join(' ')}
      >
        {children ?? entry.term}
      </button>

      {/* 스크린리더용 설명 — 항상 존재(위 aria-describedby 의 대상). 시각적으로는 숨김. */}
      <span id={descId} className="sr-only">{`${entry.term} (${entry.en}) — ${entry.desc}`}</span>

      {open && pos && (
        <span
          aria-hidden
          data-term-tip={entry.term}
          // pointer-events:none — 말풍선은 순수 시각 요소다(aria-hidden). 손가락을 가로채면
          //   ① 말풍선에 가린 트리거를 다시 못 누르고 ② 아래 입력칸 탭까지 먹는다.
          className="pointer-events-none fixed z-[70] animate-fade-in"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}
        >
          <span className="relative block rounded-card border border-border-strong bg-surface-float p-2.5 shadow-dialog">
            <span className="flex items-baseline gap-1.5">
              <span className="text-xs font-bold text-ink-primary">{entry.term}</span>
              <span className="min-w-0 flex-1 truncate text-2xs text-ink-muted">{entry.en}</span>
              <span className="shrink-0 text-2xs text-ink-muted">{entry.cat}</span>
            </span>
            <span className="mt-1 block text-2xs leading-relaxed text-ink-secondary">{entry.desc}</span>
            {/* 꼬리 — 말풍선과 같은 배경·보더를 45° 회전해 이어 붙인다(테두리 두 변만 남김) */}
            <span
              className={[
                'absolute h-2 w-2 rotate-45 border-border-strong bg-surface-float',
                pos.above ? '-bottom-1 border-b border-r' : '-top-1 border-l border-t',
              ].join(' ')}
              style={{ left: pos.caret - 4 }}
            />
          </span>
        </span>
      )}
    </span>
  );
}
