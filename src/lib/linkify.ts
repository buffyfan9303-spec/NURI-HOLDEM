// src/lib/linkify.ts — 사용자가 쓴 글(매장 소개·매장 공지)을 **글자 / 링크 / 전화** 토막으로 나눈다.
//
// 왜(2026-10-09 VEN-02): 로티아레나 소개의 'https://litt.ly/rotiarena'·'http://www.rotiarena.com' 과 공지 속 전화번호가
//   눌리지 않는 그냥 글자였다. 오너가 등록하라고 한 링크 모음을 손님이 열 수 없었다.
//
// 🔴 보안 — 이 함수는 **HTML 을 만들지 않는다.** 토막 배열만 돌려주고, 화면은 React 요소(<a>·텍스트 노드)로 그린다
//   (`dangerouslySetInnerHTML`·`innerHTML` 금지 — CLAUDE.md 보안 7). 그래서 글 안의 `<script>` 는 글자로 남는다.
//   링크로 승격하는 것은 **http·https·tel 세 가지뿐**이다. `javascript:`·`data:`·`vbscript:` 같은 스킴은 정규식이 애초에
//   잡지 않고, 잡힌 것도 `new URL()` 로 다시 파싱해 프로토콜을 확인한다(이중 확인).
//
// 경계 규칙:
//   · URL 은 ASCII URL 문자만 먹는다 — 'http://www.rotiarena.com에서' 처럼 한글이 바로 붙어도 한글 앞에서 끊긴다.
//   · 끝의 문장부호(. , ; : ! ? )와 짝 없는 닫는 괄호는 URL 에서 뺀다 — '(https://a.kr)' · 'https://a.kr.' 의 꼬리.
//   · 전화는 국내 형식만: 0으로 시작하는 지역·휴대 번호(구분자 - 또는 .), 구분자 없는 휴대 번호 11자리,
//     1588-1234 류 대표번호. 앞뒤가 숫자면 잡지 않는다(날짜 '2026-10-09'·금액·사업자번호 오인 방지).

export type LinkToken =
  | { kind: 'text'; text: string }
  | { kind: 'url'; text: string; href: string }
  | { kind: 'tel'; text: string; href: string };

// URL: 스킴 있는 것 또는 'www.' 로 시작하는 것. 문자 집합은 RFC 3986 의 ASCII 문자(따옴표·꺾쇠·공백·한글 제외).
const URL_RE = /\b(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+/gi;
// 전화: ① 0N(N)-NNN(N)-NNNN (구분자 - 또는 .) ② 01X 휴대 11·10자리 붙여쓰기 ③ 15XX~19XX-NNNN 대표번호.
const TEL_RE = /(?<![\dA-Za-z])(?:0\d{1,2}[-.]\d{3,4}[-.]\d{4}|01[016789]\d{7,8}|1[5-9]\d{2}-\d{4})(?![\d])/g;

const TRAIL_PUNCT = /[.,;:!?]$/;

/** URL 꼬리 정리 — 문장부호와 짝 없는 닫는 괄호를 뗀다. 뗀 길이만큼 뒤는 글자로 돌아간다. */
function trimUrl(raw: string): string {
  let s = raw;
  for (;;) {
    if (TRAIL_PUNCT.test(s)) { s = s.slice(0, -1); continue; }
    const last = s.at(-1);
    if (last === ')' || last === ']') {
      const open = last === ')' ? '(' : '[';
      const opens = s.split(open).length - 1;
      const closes = s.split(last).length - 1;
      if (closes > opens) { s = s.slice(0, -1); continue; }
    }
    return s;
  }
}

/** http·https 만 통과. 파싱 실패·다른 스킴은 null(→ 글자로 남는다). */
export function safeHttpHref(text: string): string | null {
  const candidate = /^www\./i.test(text) ? `https://${text}` : text;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || !u.hostname.includes('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}

function pushText(out: LinkToken[], text: string) {
  if (!text) return;
  const prev = out.at(-1);
  if (prev && prev.kind === 'text') prev.text += text;
  else out.push({ kind: 'text', text });
}

/** 전화번호만 나눈다(URL 밖의 글자에만 쓴다 — URL 안 숫자를 전화로 잡지 않게). */
function splitTel(text: string, out: LinkToken[]) {
  let last = 0;
  for (const m of text.matchAll(TEL_RE)) {
    const i = m.index ?? 0;
    pushText(out, text.slice(last, i));
    const num = m[0];
    out.push({ kind: 'tel', text: num, href: `tel:${num.replace(/[^\d]/g, '')}` });
    last = i + num.length;
  }
  pushText(out, text.slice(last));
}

/** 글을 토막으로 나눈다. 토막을 이어 붙이면 **원문과 글자 하나까지 같다**(줄바꿈·공백 보존). */
export function linkify(input: string): LinkToken[] {
  const out: LinkToken[] = [];
  if (!input) return out;
  let last = 0;
  for (const m of input.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    // 'abc.www.x.kr' 처럼 단어 중간의 www 는 \b 가 잡지만 앞이 영문·숫자·점이면 URL 시작이 아니다.
    if (/^www\./i.test(m[0]) && i > 0 && /[A-Za-z0-9.@/]/.test(input[i - 1])) continue;
    const url = trimUrl(m[0]);
    const href = safeHttpHref(url);
    if (!href) continue;
    splitTel(input.slice(last, i), out);
    out.push({ kind: 'url', text: url, href });
    last = i + url.length;
  }
  splitTel(input.slice(last), out);
  return out;
}
