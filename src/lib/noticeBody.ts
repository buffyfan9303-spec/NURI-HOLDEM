// 공지 본문 구조화 — 원문을 바꾸지 않고 **문단**과 **번호 항목**만 가른다(UI-01, 2026-09-13).
//
// 규칙(실행문 §8.1):
//   · 빈 줄 = 문단 경계(연속 빈 줄도 경계 하나). 문장 안의 개행은 문단 안에 그대로 남는다(렌더는 whitespace-pre-wrap).
//   · 줄 시작의 `1)` `2)` `3.` 처럼 **1~2자리 숫자 + `)`/`.` + 공백 + 내용** 만 항목이다.
//     그래서 `1.5시간`(공백 없음)·`2026. 9. 13`(세 자리 이상)·`(2)`·문장 중간 `3)`·`123)` 은 항목이 아니다.
//   · 항목 뒤에 이어지는(번호 없는) 줄은 같은 항목에 속한다. 들여쓰기·내용은 그대로 보존한다.
//   · Markdown 파서를 쓰지 않는다 — 공지 하나 때문에 범용 파서를 들이지 않는다. HTML 로 삽입하지 않는다(렌더는 React 텍스트).
// 원문 보존은 noticeBlocksToLines(라운드트립)로 검사한다(noticeBody.test.ts).
export interface NoticeItem {
  /** 원문 번호 그대로('1)' · '3.') — 브라우저 자동 번호가 아니라 이것을 그린다 */
  marker: string;
  /** 번호 앞 들여쓰기·번호와 내용 사이 공백 — 라운드트립용(화면에는 안 그린다) */
  indent: string;
  gap: string;
  /** 첫 줄 = 번호 뒤 내용, 이어지는 줄 = 원문 그대로 */
  lines: string[];
}
export type NoticeBlock =
  | { kind: 'p'; lines: string[] }
  | { kind: 'list'; items: NoticeItem[] };

const ITEM = /^(\s*)(\d{1,2}[.)])(\s+)(\S.*)$/;

export function parseNoticeBody(body: string): NoticeBlock[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const paras: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (l.trim() === '') { if (cur.length) { paras.push(cur); cur = []; } }
    else cur.push(l);
  }
  if (cur.length) paras.push(cur);

  const out: NoticeBlock[] = [];
  for (const p of paras) {
    let text: string[] = [];
    let items: NoticeItem[] | null = null;
    const flushText = () => { if (text.length) { out.push({ kind: 'p', lines: text }); text = []; } };
    const flushItems = () => { if (items) { out.push({ kind: 'list', items }); items = null; } };
    for (const l of p) {
      const m = ITEM.exec(l);
      if (m) {
        flushText();
        (items ??= []).push({ indent: m[1], marker: m[2], gap: m[3], lines: [m[4]] });
      } else if (items) {
        items[items.length - 1].lines.push(l);   // 이어지는 줄은 같은 항목
      } else {
        text.push(l);
      }
    }
    flushText();
    flushItems();
  }
  return out;
}

/** 라운드트립 — 비어 있지 않은 원문 줄을 순서대로 되돌린다(테스트·검증용). */
export function noticeBlocksToLines(blocks: NoticeBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'p') out.push(...b.lines);
    else for (const it of b.items) { out.push(`${it.indent}${it.marker}${it.gap}${it.lines[0]}`); out.push(...it.lines.slice(1)); }
  }
  return out;
}
