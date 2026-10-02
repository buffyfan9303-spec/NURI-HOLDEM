// 제목 줄 정렬 측정기 — `e2e/title-action-align.spec.ts` 가 쓴다(2026-10-02 정렬 전수, 오너 원문:
// "정렬이 이런 부분도 찾아서 전체 다 수정해줘" — 내 매장 요약 '최근 7일 흐름' 의 '통계 →' 가 제목보다 아래).
//
// 세 가지를 잰다. 셋 다 **글자 자체**를 잰다 — 상자(rect)는 줄 높이·패딩이 달라 어긋남을 가린다.
//   F1 제목 + 오른쪽 액션: 보이는 button/a 마다 위로 4단계 안의 flex 행을 찾고, 그 행에서 액션보다 앞선 자식의
//      굵은(≥600)·h1~h6 글자를 제목으로 잡아 **두 글자 줄 상자의 세로 중심 차**를 잰다(아이콘만 있는 액션은 svg 중심).
//      제목이 2줄이거나, 제목 아래 설명 줄이 쌓인 카드 묶음(제목/설명 · 가운데 CTA)은 제목 줄 행이 아니라 재지 않는다.
//   F2 items-baseline 행: 자식마다 첫 글자 앞에 0×0 inline-block 을 끼워 그 바닥(= 그 글자의 실제 기준선)을 읽고
//      **기준선 퍼짐**을 잰다. 제목이 아이콘으로 시작하는 (inline-)flex 이면 행 기준선이 아이콘 바닥으로 잡혀 여기서 드러난다.
//      측정용으로 끼운 요소는 즉시 원상 복구한다.
//   F3 지정 행(selector): 행 안 첫 굵은 글자 vs 같은 줄의 다른 글자들의 세로 중심 차.
//
// 결함 기준: F1·F3 |중심 차| > 1px, F2 퍼짐 > 1px. 0건 수집은 측정이 틀린 것이라 호출부가 건수를 단언한다.
import type { Page } from '@playwright/test';

export interface AlignRow { kind: 'F1' | 'F2' | 'F3'; title: string; other: string; diff: number; cls: string }

export async function measureAlign(page: Page, f3Selectors: string[] = []): Promise<AlignRow[]> {
  return page.evaluate((f3) => {
    const INTERACTIVE = 'button,a[href],[role="button"],[role="link"]';
    // 2026-10-02: 외치기 전광판의 '누리홀덤 안내' 는 제목이 아니라 **한 문장 안의 작은 머리말**이다(text-2xs + text-sm 한 줄).
    //   그 줄 상자는 버튼과 가운데가 맞고(외치기 버튼은 줄 가운데), 머리말만 기준선 위에 작게 앉는다 — 머리말을 옮기면 자기 문장과 어긋난다.
    const EXCLUDE = '[data-testid="shout-idle-line"]';
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      return (el as HTMLElement).checkVisibility ? (el as HTMLElement).checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions) : true;
    };
    const texts = (el: Element) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          const p = n.parentElement;
          if (!n.nodeValue?.trim() || !p || p.closest('.sr-only') || !vis(p)) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const out: Text[] = []; let n: Node | null;
      while ((n = w.nextNode())) out.push(n as Text);
      return out;
    };
    const box = (t: Text) => {
      const r = document.createRange(); r.selectNodeContents(t);
      const rs = [...r.getClientRects()].filter((x) => x.width > 0.5);
      if (!rs.length) return null;
      return { c: rs[0].top + rs[0].height / 2, top: rs[0].top, bottom: rs[0].bottom, lines: new Set(rs.map((x) => Math.round(x.top))).size };
    };
    const bold = (t: Text) => {
      const p = t.parentElement!;
      return parseFloat(getComputedStyle(p).fontWeight) >= 600 || !!p.closest('h1,h2,h3,h4,h5,h6');
    };
    const isRow = (el: Element) => { const cs = getComputedStyle(el); return /flex/.test(cs.display) && /^row/.test(cs.flexDirection); };
    const cls = (el: Element) => (el.getAttribute('class') || '').slice(0, 80);
    const out: { kind: 'F1' | 'F2' | 'F3'; title: string; other: string; diff: number; cls: string }[] = [];

    // F1
    const seen = new Set<Element>();
    for (const act of document.querySelectorAll(INTERACTIVE)) {
      if (!vis(act)) continue;
      const ar = act.getBoundingClientRect();
      if (ar.height > 64) continue;
      let child: Element = act; let row = act.parentElement;
      for (let lvl = 0; row && lvl < 4; lvl++, child = row, row = row.parentElement) {
        if (!isRow(row)) continue;
        const kids = [...row.children].filter(vis);
        const idx = kids.indexOf(child);
        if (idx <= 0) continue;
        let tn: Text | null = null; let tk: Element | null = null;
        for (const k of kids.slice(0, idx)) {
          const t = texts(k).find((n) => bold(n) && !n.parentElement!.closest(INTERACTIVE));
          if (t) { tn = t; tk = k; break; }
        }
        if (!tn || !tk) continue;
        if (seen.has(row)) break;
        seen.add(row);
        if (tn.parentElement!.closest(EXCLUDE)) break;
        const tb = box(tn);
        if (!tb || tb.lines > 1) break;
        // 제목 아래에 설명 줄이 **쌓인 묶음**(카드: 제목 / 설명 · 오른쪽 CTA)은 제목 줄이 아니라 카드 가운데에 버튼을
        //   두는 것이 의도된 문법이다 — 재지 않는다. (실측 2026-10-02: 내 매장 '할 일' 카드는 정오 이후에만 떠서
        //   이 구분 없이 재면 시각에 따라 결과가 갈렸다.) 제목 '줄' 끼리 비교하는 행만 남긴다.
        if (texts(tk).some((n) => n !== tn && (box(n)?.top ?? -1) >= tb.bottom - 1)) break;
        if (ar.left < tk.getBoundingClientRect().left) break;
        if (ar.bottom < tb.top || ar.top > tb.bottom) break;
        const an = texts(act)[0];
        let ac: number | null = an ? box(an)?.c ?? null : null;
        if (ac == null) { const s = act.querySelector('svg'); if (!s) break; const r = s.getBoundingClientRect(); ac = r.top + r.height / 2; }
        out.push({ kind: 'F1', title: tn.nodeValue!.trim().slice(0, 24), other: an ? an.nodeValue!.trim().slice(0, 16) : `(아이콘)${act.getAttribute('aria-label') ?? ''}`, diff: Math.round((ac - tb.c) * 100) / 100, cls: cls(row) });
        break;
      }
    }

    // F2
    const baseOf = (n: Text) => {
      const wrap = document.createElement('span');
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;margin:0;padding:0;border:0';
      n.parentNode!.insertBefore(wrap, n); wrap.appendChild(probe); wrap.appendChild(n);
      const y = probe.getBoundingClientRect().bottom;
      wrap.parentNode!.insertBefore(n, wrap); wrap.remove();
      return y;
    };
    for (const row of document.querySelectorAll('body *')) {
      if (!isRow(row) || getComputedStyle(row).alignItems !== 'baseline' || !vis(row)) continue;
      const kids = [...row.children].filter(vis).map((k) => ({ k, t: texts(k)[0] })).filter((x) => x.t);
      if (kids.length < 2) continue;
      const fb = kids[0].k.getBoundingClientRect().bottom;
      const line = kids.filter((x) => x.k.getBoundingClientRect().top < fb - 2);
      if (line.length < 2) continue;
      const ys = line.map((x) => baseOf(x.t));
      out.push({ kind: 'F2', title: kids[0].t.nodeValue!.trim().slice(0, 24), other: line.slice(1).map((x) => x.t.nodeValue!.trim().slice(0, 10)).join(' / '), diff: Math.round((Math.max(...ys) - Math.min(...ys)) * 100) / 100, cls: cls(row) });
    }

    // F3
    for (const sel of f3) {
      for (const row of document.querySelectorAll(sel)) {
        if (!vis(row)) continue;
        const ts = texts(row);
        const t0 = ts.find(bold);
        if (!t0) continue;
        const b0 = box(t0)!;
        let worst = 0; const others: string[] = [];
        for (const t of ts) {
          if (t === t0) continue;
          const b = box(t);
          if (!b || b.bottom < b0.top || b.top > b0.bottom) continue; // 다른 줄
          others.push(t.nodeValue!.trim().slice(0, 8));
          if (Math.abs(b.c - b0.c) > Math.abs(worst)) worst = b.c - b0.c;
        }
        if (others.length) out.push({ kind: 'F3', title: t0.nodeValue!.trim().slice(0, 24), other: others.join(' / '), diff: Math.round(worst * 100) / 100, cls: cls(row) });
      }
    }
    return out;
  }, f3Selectors);
}

export const misaligned = (rows: AlignRow[]) => rows.filter((r) => Math.abs(r.diff) > 1);
