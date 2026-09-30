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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

/** 실행되는 인라인 스크립트 본문(src 없음 · JSON-LD 같은 데이터 블록 제외). */
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.replace(/\r\n/g, '\n').matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
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
