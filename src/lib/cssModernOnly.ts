// Tailwind v4 빌드 CSS 에서 **지원 브라우저(Chrome 111+ · Safari 16.4+ · Firefox 128+ — v4 공식 하한)에서 절대 쓰이지 않는 폴백**을 걷어낸다
// (2026-09-28 번들 정리 ⑤-3). 화면에 쓰이는 값은 한 글자도 바꾸지 않는다 — 지원 브라우저가 이미 고르던 쪽만 남긴다.
//
// 걷어내는 것 세 가지(전부 v4 가 스스로 찍는 모양이라 문자열이 고정이다 — 다른 모양은 건드리지 않는다):
//  ① `@layer properties{@supports (…-webkit-hyphens… margin-trim… -moz-orient… rgb(from …)){*,…{--tw-…}}}`
//     @property 를 모르는 옛 브라우저(Safari <16.4 · Firefox <128)용 초기값. 조건이 지원 브라우저에서 거짓이라 한 번도 안 걸린다.
//  ② `@supports (color:color-mix(in lab, red, red))` · `@supports (background-image:linear-gradient(in lab, red, red))`
//     color-mix(Chrome 111 · Safari 16.2)·그라디언트 보간 색공간(Chrome 111 · Safari 16.2)은 지원 하한 안이라 조건이 **항상 참**이다.
//     → 블록을 풀고, 바로 앞 규칙이 같은 선택자면 그 규칙의 폴백 선언을 이 값으로 바꿔 끼운다(같은 자리·같은 특이도라 결과가 같다).
//  ③ `@supports not ((-webkit-backdrop-filter:…) or (backdrop-filter:…))` · `@supports not ((-webkit-background-clip:text) or (background-clip:text))`
//     지원 브라우저는 둘 다 지원하므로 조건이 **항상 거짓**이다 → 통째로 지운다.
// ⚠ 이것들은 v4 가 이미 지원하지 않는 브라우저를 위한 것이다. 거기서는 이 파일이 없어도 v4 화면이 깨져 있다.

type Node =
  | { t: 'rule'; pre: string; body: string }          // 선택자{선언들}
  | { t: 'block'; pre: string; kids: Node[] }         // @media/@supports/@layer/@keyframes …{규칙들}
  | { t: 'raw'; text: string };                       // @import …; 등

/** 최상위부터 블록 트리로 쪼갠다. 문자열·주석·괄호 안의 { } ; 는 경계로 보지 않는다. */
function parse(s: string): Node[] {
  const out: Node[] = [];
  let i = 0;
  while (i < s.length) {
    let j = i, depth = 0, open = -1;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === '\\') { j++; continue; }   // 선택자 이스케이프(.content-\[\'\'\]) — 따옴표로 읽으면 뒤가 통째로 문자열이 된다
      if (c === '"' || c === "'") { const q = c; j++; while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; j++; } continue; }
      if (c === '/' && s[j + 1] === '*') { const e = s.indexOf('*/', j + 2); j = e < 0 ? s.length : e + 1; continue; }
      if (c === '{') { if (depth === 0) open = j; depth++; }
      else if (c === '}') { depth--; if (depth === 0) break; }
      else if (c === ';' && depth === 0) break;
    }
    if (open < 0) { const text = s.slice(i, j + 1); if (text) out.push({ t: 'raw', text }); i = j + 1; continue; }   // 공백(끝 줄바꿈)도 그대로 — 두 번 돌려도 같은 바이트
    const pre = s.slice(i, open), inner = s.slice(open + 1, j);
    if (/[{}]/.test(inner.replace(/\\./g, '').replace(/"[^"]*"|'[^']*'/g, ''))) out.push({ t: 'block', pre, kids: parse(inner) });
    else if (pre.trim().startsWith('@')) out.push({ t: 'raw', text: s.slice(i, j + 1) });   // @font-face·@property 등 선언 블록은 그대로
    else out.push({ t: 'rule', pre, body: inner });
    i = j + 1;
  }
  return out;
}

const print = (ns: Node[]): string => ns.map((n) => (n.t === 'raw' ? n.text : n.t === 'rule' ? `${n.pre}{${n.body}}` : `${n.pre}{${print(n.kids)}}`)).join('');

/** 선언 목록을 최상위 ; 로 나눈다(괄호·문자열 안의 ; 는 무시). */
function decls(body: string): string[] {
  const out: string[] = []; let d = 0, st = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') { i++; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < body.length && body[i] !== q) { if (body[i] === '\\') i++; i++; } }
    else if (c === '(') d++; else if (c === ')') d--;
    else if (c === ';' && d === 0) { out.push(body.slice(st, i)); st = i + 1; }
  }
  if (body.slice(st).trim()) out.push(body.slice(st));
  return out.filter((x) => x.trim());
}
const prop = (decl: string) => decl.slice(0, decl.indexOf(':')).trim();

const PROPS_FALLBACK = '@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b))))';
const ALWAYS_TRUE = new Set(['@supports (color:color-mix(in lab, red, red))', '@supports (background-image:linear-gradient(in lab, red, red))']);
const ALWAYS_FALSE = new Set([
  '@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px)))',
  '@supports not ((-webkit-background-clip:text) or (background-clip:text))',
]);

export type ModernOnlyStats = { propsFallback: number; unwrapped: number; merged: number; droppedNot: number };

function walk(ns: Node[], st: ModernOnlyStats): Node[] {
  const out: Node[] = [];
  for (const n of ns) {
    if (n.t !== 'block') { out.push(n); continue; }
    // 머리 앞 주석(`/*! tailwindcss … MIT License */`)은 블록을 지워도 남긴다 — 라이선스 고지다.
    const notes = (n.pre.match(/\/\*[\s\S]*?\*\//g) || []).join('');
    const pre = n.pre.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const keepNotes = () => { if (notes) out.push({ t: 'raw', text: notes + '\n' }); };
    // ①
    if (pre === '@layer properties' && n.kids.length === 1 && n.kids[0].t === 'block' && n.kids[0].pre.trim() === PROPS_FALLBACK) { keepNotes(); st.propsFallback++; continue; }
    // ③
    if (ALWAYS_FALSE.has(pre)) { keepNotes(); st.droppedNot++; continue; }
    // ②
    if (ALWAYS_TRUE.has(pre)) {
      keepNotes();
      st.unwrapped++;
      for (const k of walk(n.kids, st)) {
        const prev = out[out.length - 1];
        if (k.t === 'rule' && prev && prev.t === 'rule' && prev.pre.trim() === k.pre.trim()) {
          // 바로 앞이 같은 선택자 → 폴백 선언 자리에 끼워 넣는다(없던 속성은 뒤에 붙인다). 둘 사이에 아무 규칙도 없으니 결과가 같다.
          const pd = decls(prev.body);
          for (const d of decls(k.body)) {
            const p = prop(d); let at = -1;
            for (let i = pd.length - 1; i >= 0; i--) if (prop(pd[i]) === p) { at = i; break; }
            if (at >= 0) pd[at] = d; else pd.push(d);
          }
          prev.body = pd.join(';');
          st.merged++;
        } else out.push(k);
      }
      continue;
    }
    out.push({ ...n, kids: walk(n.kids, st) });
  }
  return out;
}

/** 빌드 CSS 한 벌 → 지원 브라우저에서 안 쓰이는 폴백을 뺀 CSS. */
export function cssModernOnly(css: string): { css: string; stats: ModernOnlyStats } {
  const stats: ModernOnlyStats = { propsFallback: 0, unwrapped: 0, merged: 0, droppedNot: 0 };
  return { css: print(walk(parse(css), stats)), stats };
}
