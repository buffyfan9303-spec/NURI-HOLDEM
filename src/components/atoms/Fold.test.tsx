// Fold — 본문 안 펼침/접힘 한 벌(2026-09-29 M단계). 여기는 **렌더 계약과 클램프 계산**만 잠근다.
// 실제 모션(높이 단계 수·누른 버튼 top·긴 프레임·동작 줄이기)은 e2e/fold-motion.spec.ts 가 브라우저에서 잰다.
import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Fold, keepScroll } from './Fold';

describe('Fold — 렌더 계약(예전 조건부 렌더와 같은 DOM)', () => {
  it('닫힌 첫 렌더는 아무것도 그리지 않는다(빈 래퍼도 없다 — space-y 간격이 생기면 닫힌 화면이 바뀐다)', () => {
    expect(renderToStaticMarkup(<div><Fold open={false}><p>내용</p></Fold></div>)).toBe('<div></div>');
  });
  it('닫혀 있으면 함수 자식을 부르지 않는다(닫힌 상태에서 null 을 읽는 내용 보호)', () => {
    let called = 0;
    const html = renderToStaticMarkup(<Fold open={false}>{() => { called++; return <p>x</p>; }}</Fold>);
    expect(html).toBe('');
    expect(called, '닫힌 Fold 가 함수 자식을 불렀다').toBe(0);
  });
  it('열린 첫 렌더는 래퍼 div 하나 안에 내용을 그린다(인라인 스타일 없음 = 정착 상태)', () => {
    const html = renderToStaticMarkup(<Fold open className="w-full" id="f1">{() => <p>내용</p>}</Fold>);
    expect(html).toBe('<div id="f1" class="w-full"><p>내용</p></div>');
  });
});

describe('keepScroll — 바닥에서 닫을 때 scrollTop 클램프 막기', () => {
  type L = () => void;
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { document: g.document, window: g.window, getComputedStyle: g.getComputedStyle };
  afterEach(() => { Object.assign(g, saved); });

  /** 문서 스크롤러 흉내 — scrollHeight 는 본문 높이 + body 의 인라인 padding-bottom. */
  function setup(content: number, clientHeight: number, scrollTop: number) {
    const body = { style: { paddingBottom: '' } as Record<string, string>, dataset: {} as Record<string, string> };
    const sc = {
      clientHeight, scrollTop, parentElement: null,
      get scrollHeight() { return content + (parseFloat(body.style.paddingBottom) || 0); },
    };
    const listeners: L[] = [];
    g.document = { scrollingElement: sc, body };
    g.window = { addEventListener: (_: string, f: L) => listeners.push(f), removeEventListener: (_: string, f: L) => listeners.splice(listeners.indexOf(f), 1) };
    g.getComputedStyle = () => ({ overflowY: 'visible', paddingBottom: '0px' });
    const el = { parentElement: null };
    return { sc, body, listeners, el, shrink: (px: number) => { content -= px; } };
  }

  it('바닥에서 400px 줄어들면 모자라는 만큼 여백을 걸고, 위로 스크롤하는 만큼 거둔다', () => {
    const s = setup(2000, 800, 1200); // 맨 아래(2000 - 800)
    keepScroll(s.el as unknown as Element, 400);
    expect(s.body.style.paddingBottom, '클램프 막기 여백이 없다').toBe('400px');
    s.shrink(400); // 실제로 줄어든 뒤에도
    expect(s.sc.scrollHeight - s.sc.clientHeight, '줄어든 뒤 최대 scrollTop 이 지금 scrollTop 보다 작다 — 클램프').toBeGreaterThanOrEqual(1200);
    s.sc.scrollTop = 1000; s.listeners.forEach((f) => f());
    expect(s.body.style.paddingBottom, '위로 200px 올리면 여백도 200 으로').toBe('200px');
    s.sc.scrollTop = 1100; s.listeners.forEach((f) => f());
    expect(s.body.style.paddingBottom, '다시 내려가도 여백이 다시 늘면 안 된다').toBe('200px');
    s.sc.scrollTop = 500; s.listeners.forEach((f) => f());
    expect(s.body.style.paddingBottom, '충분히 올라오면 원래 값으로').toBe('');
    expect(s.listeners.length, '다 거둔 뒤에도 스크롤 리스너가 남았다').toBe(0);
  });

  it('바닥이 아니면(줄어도 클램프 없음) 아무것도 걸지 않는다 — 음성 대조', () => {
    const s = setup(2000, 800, 300);
    keepScroll(s.el as unknown as Element, 400);
    expect(s.body.style.paddingBottom).toBe('');
    expect(s.listeners.length).toBe(0);
  });
});
