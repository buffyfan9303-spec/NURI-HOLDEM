// CSP 인라인 스크립트 해시 계약 (2026-09-30 보안 D-2).
//
// vercel.json 의 CSP(Report-Only) script-src 는 index.html 의 인라인 스크립트 2개(첫 페인트 테마 · gtag 초기화)를
// **해시로** 허용한다. 인라인 본문을 한 글자라도 바꾸면 해시가 달라져, 강제 CSP 로 넘어간 뒤에는 그 스크립트가
// 조용히 막힌다(테마 깜빡임·GA 소실). 그래서 "지금 index.html 의 인라인 해시 ⊂ vercel.json 목록" 을 잠근다.
// 인라인을 고쳤으면: 아래 실패 메시지의 새 해시를 vercel.json 의 CSP 값 5벌 모두에 넣는다.
//
// ⚠ 줄끝: 운영 빌드는 Vercel(리눅스, LF 체크아웃)에서 돈다. 이 저장소 작업트리는 CRLF(core.autocrlf)라
//   바이트 그대로 해시하면 운영과 다른 값이 나온다 → CRLF 를 LF 로 바꿔 운영 바이트로 맞춘다.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

/** 실행되는 인라인 스크립트 본문(src 없음 · JSON-LD 같은 데이터 블록 제외). */
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.replace(/\r\n/g, '\n').matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script\b[^>]*>/gi)) {
    const attrs = m[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && !['text/javascript', 'module', 'application/javascript'].includes(type)) continue;
    out.push(m[2]);
  }
  return out;
}
const sha = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

type Header = { key: string; value: string };
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as { headers: { source: string; headers: Header[] }[] };
const cspValues = (key: string) => vercel.headers.flatMap((b) => b.headers.filter((h) => h.key === key).map((h) => ({ source: b.source, value: h.value })));
const scriptSrc = (csp: string) => (csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === 'script-src') ?? []).slice(1);

describe('CSP 인라인 스크립트 해시 — index.html ⊂ vercel.json', () => {
  const src = inlineScripts(readFileSync(join(ROOT, 'index.html'), 'utf8'));
  const ro = cspValues('Content-Security-Policy-Report-Only');

  it('판정기가 살아 있다 — 실행 인라인 스크립트 2개(테마·gtag)와 Report-Only 5벌을 실제로 찾았다', () => {
    expect(src).toHaveLength(2);
    expect(src[0]).toContain('nuri-theme');
    expect(src[1]).toContain("gtag('config'");
    expect(ro.map((r) => r.source)).toEqual(['/(.*)', '/', '/index.html', '/sw.js', '/assets/(.*)']);
  });

  it('Report-Only 5벌이 한 값이다(한 곳만 고치면 경로마다 정책이 갈린다)', () => {
    expect(new Set(ro.map((r) => r.value)).size).toBe(1);
  });

  it('모든 인라인 스크립트 해시가 script-src 에 있다', () => {
    const allowed = scriptSrc(ro[0].value);
    const missing = src.map(sha).filter((h) => !allowed.includes(h));
    expect(missing, `index.html 인라인 스크립트가 바뀌었다 — 이 해시를 vercel.json CSP 5벌에 넣어라:\n${missing.join('\n')}`).toEqual([]);
  });

  it("script-src 에 'unsafe-eval' 이 없다(우리 청크·gtag·PortOne SDK 모두 eval/new Function 0 — 2026-09-30 실측)", () => {
    for (const r of [...ro, ...cspValues('Content-Security-Policy')]) expect(scriptSrc(r.value)).not.toContain("'unsafe-eval'");
  });

  // 빌드 산출물이 있으면(npm run build 뒤·CI) Vite 가 인라인을 건드리지 않았는지도 본다 — 소스 해시가 곧 운영 해시라는 전제.
  it.runIf(existsSync(join(ROOT, 'dist', 'index.html')))('빌드된 dist/index.html 의 인라인 스크립트가 소스와 바이트 단위로 같다', () => {
    expect(inlineScripts(readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8')).map(sha)).toEqual(src.map(sha));
  });
});

// SEC-03(2026-10-01) — 스크립트 CSP 를 **강제(Content-Security-Policy)** 로 올렸다. 이 블록이 지키는 것:
//   ① 강제 5벌이 한 값이고, 인라인 스크립트 허용('unsafe-inline')·eval('unsafe-eval')을 싣지 않는다.
//   ② 예전 강제 지시(frame-ancestors·object-src·base-uri·upgrade-insecure-requests)를 하나도 잃지 않는다.
//   ③ 실행되는 인라인 스크립트(index.html 2개 · offline.html 1개)의 해시가 강제 script-src 에 있다.
//   ④ public 정적 페이지에 인라인 이벤트 속성(onload·onclick …)이 없다 — 강제 CSP 가 조용히 막는다(가이드 글꼴·오프라인 다시 시도가 실제로 막혔다).
//   위반 0 의 실측 근거는 강제 CSP 서버로 e2e 전량 + 정적 페이지 크롤을 돌린 report-uri 수집이다(regress-home-report.md SEC-03 절).
describe('SEC-03 강제 CSP — 인라인 허용 없이 실제로 쓰는 스크립트만', () => {
  const enf = cspValues('Content-Security-Policy');
  const ro = cspValues('Content-Security-Policy-Report-Only');
  const publicHtml = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? publicHtml(join(dir, d.name)) : d.name.endsWith('.html') ? [join(dir, d.name)] : []);

  it('강제 5벌이 한 값이다', () => {
    expect(enf.map((r) => r.source)).toEqual(['/(.*)', '/', '/index.html', '/sw.js', '/assets/(.*)']);
    expect(new Set(enf.map((r) => r.value)).size).toBe(1);
  });

  it("강제 script-src 에 'unsafe-inline'·'unsafe-eval' 이 없고, 실제 출처가 있다", () => {
    const s = scriptSrc(enf[0].value);
    expect(s).toContain("'self'");
    expect(s).not.toContain("'unsafe-inline'");
    expect(s).not.toContain("'unsafe-eval'");
    expect(s).not.toContain("'unsafe-hashes'");
  });

  it('예전 강제 지시를 잃지 않았다', () => {
    const v = enf[0].value;
    for (const d of ["frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", 'upgrade-insecure-requests']) expect(v).toContain(d);
  });

  it('실행 인라인 스크립트(index.html · offline.html) 해시가 강제·Report-Only script-src 둘 다에 있다', () => {
    const inl = [...inlineScripts(readFileSync(join(ROOT, 'index.html'), 'utf8')), ...inlineScripts(readFileSync(join(ROOT, 'public', 'offline.html'), 'utf8'))];
    expect(inl).toHaveLength(3);
    for (const pol of [enf[0].value, ro[0].value]) {
      const missing = inl.map(sha).filter((h) => !scriptSrc(pol).includes(h));
      expect(missing, `인라인 스크립트가 바뀌었다 — 이 해시를 vercel.json CSP 10벌(강제·Report-Only)에 넣어라:\n${missing.join('\n')}`).toEqual([]);
    }
  });

  it('public 정적 페이지에 인라인 이벤트 속성이 없고, 인라인 스크립트는 해시가 등록된 offline.html 뿐이다', () => {
    const files = publicHtml(join(ROOT, 'public'));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const html = readFileSync(f, 'utf8');
      expect(html.match(/<[a-z][^>]*\son[a-z]+\s*=/gi) ?? [], `${f} 에 인라인 이벤트 속성`).toEqual([]);
      if (!f.endsWith(join('public', 'offline.html'))) expect(inlineScripts(html), `${f} 에 인라인 스크립트`).toEqual([]);
    }
  });
});
