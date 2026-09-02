// [DS] LEGAL-2 — 공개 약관(public/legal/*.html)과 앱 약관(TSX)의 두 벌 방지.
//
// 왜 필요한가: /legal/*.html 은 네이버 로그인 심사·크롤링·아카이빙용으로 공개되는 정적 파일이다.
// 손으로 고치거나 TSX 만 고치면 "가입 화면에서 동의한 내용"과 "공개된 내용"이 달라진다 — 법적 사고다.
// 그래서 scripts/gen-legal.mjs 가 앱이 쓰는 바로 그 React 컴포넌트를 SSR 로 찍어 생성하고,
// 이 스펙은 그 생성 결과가 커밋된 파일과 바이트 단위로 같은지를 --check 모드로 강제한다.
//   → TSX 문구를 한 글자만 바꾸고 재생성하지 않으면 이 스펙이 깨진다(회귀 주입으로 확인 완료).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');
const html = (slug: string) => read(`public/legal/${slug}.html`);

const SLUGS = ['terms', 'privacy', 'anti-gambling', 'marketing', 'refund'] as const; // refund = 동의 아님·고지(PG 심사용 공개 URL)

describe('공개 약관 정적 발행 (LEGAL-2)', () => {
  it('4개 공개 URL 파일이 존재한다', () => {
    for (const slug of SLUGS) {
      const p = path.join(ROOT, 'public', 'legal', `${slug}.html`);
      expect(existsSync(p), `public/legal/${slug}.html 없음 · npm run legal 로 생성하라`).toBe(true);
    }
  });

  // 이 스펙이 이 파일의 핵심이다. 나머지는 보조 잠금장치.
  it('TSX 원문으로 재생성한 결과가 커밋된 HTML 과 정확히 같다(두 벌 금지)', () => {
    // --check 는 파일을 쓰지 않고 비교만 한다. 다르면 exit 1 → execFileSync 가 throw.
    expect(() => execFileSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'gen-legal.mjs'), '--check'],
      { cwd: ROOT, stdio: 'pipe' },
    )).not.toThrow();
  }, 120_000);

  it('JS 없이도 본문이 보인다(정적 HTML · 심사자 환경에서 번들 실패해도 열려야 한다)', () => {
    for (const slug of SLUGS) {
      const src = html(slug);
      expect(src, `${slug}: <script> 가 들어가면 JS 의존이 생긴다`).not.toContain('<script');
      expect(src, `${slug}: 외부 리소스는 심사자 네트워크에서 막힐 수 있다`).not.toMatch(/(src|href)="https?:\/\/(?!nuriholdem\.com)/);
      expect(src.length, `${slug}: 본문이 비정상적으로 짧다`).toBeGreaterThan(4000);
    }
  });

  it('다크·라이트 양쪽 대응이 들어 있다', () => {
    for (const slug of SLUGS) {
      expect(html(slug)).toContain('prefers-color-scheme:dark');
      expect(html(slug)).toContain('color-scheme:light dark');
    }
  });

  it('필수/선택 동의 구분이 페이지에 명시된다', () => {
    for (const slug of ['terms', 'privacy', 'anti-gambling']) {
      expect(html(slug), `${slug} 는 필수동의 문서다`).toContain('>필수 동의<');
    }
    expect(html('marketing'), '마케팅은 선택동의 문서다').toContain('>선택 동의<');
    // 선택 동의 문서는 "동의하지 않아도 불이익 없음"을 반드시 고지해야 한다(개인정보보호법 §22⑤).
    expect(html('marketing')).toContain('동의하지 않아도');
  });

  it('마케팅 동의 문서가 수신 항목·발송 수단·철회 방법을 담는다', () => {
    const src = html('marketing');
    expect(src, '수신 항목').toContain('수신하게 되는 정보');
    expect(src, '발송 수단').toContain('발송 수단');
    expect(src, '철회 방법').toContain('수신 동의 철회 방법');
    expect(src, '철회 채널(이메일 수신거부)').toContain('수신거부');
    expect(src, '야간 전송 제한(정보통신망법 §50③)').toContain('오후 9시');
    expect(src, '문의 창구').toContain('buffyfan9303@gmail.com');
  });

  it('사업자정보가 공개 페이지 4종에서도 TSX 와 동일값이다', () => {
    // gen-legal 은 LegalNotice 렌더 결과에서 값을 뽑아 쓴다 — 손으로 옮겨 적은 사본이 생기면 여기서 깨진다.
    const notice = read('src/pages/legal/LegalNotice.tsx');
    for (const v of ['엔에이치홀딩스', '525-20-02937', '김윤혜', 'buffyfan9303@gmail.com', '010-7508-7689']) {
      expect(notice, `LegalNotice 원문에 ${v} 없음`).toContain(v);
      for (const slug of SLUGS) expect(html(slug), `${slug} 푸터에 ${v} 없음`).toContain(v);
    }
  });

  it('§28. 환금성 프레이밍 단어가 마케팅 문서 본문에 들어오지 않는다', () => {
    // '환전·현금'은 그 행위를 **금지한다고 서술**하는 맥락(사행성 공지·이용약관)에서만 허용된다.
    // 마케팅 문서 본문에는 그 맥락이 없으므로 등장해서는 안 된다.
    // (푸터·문서 목록의 '불법 환전…금지 서약' 링크 제목은 다른 문서의 제목이므로 본문만 검사한다.)
    const body = html('marketing').split('<main class="doc">')[1].split('</main>')[0];
    expect(body.length).toBeGreaterThan(3000); // 슬라이스가 실패해 빈 문자열을 검사하는 무효 프로브 방지
    for (const w of ['환전', '현금', '수익']) {
      expect(body, `마케팅 문서 본문에 '${w}' 등장 · §28 위반`).not.toContain(w);
    }
  });

  it('sitemap 과 앱 동의 화면이 4개 공개 URL 을 가리킨다', () => {
    const sitemapGen = read('scripts/gen-sitemap.mjs');
    const sitemapApi = read('api/sitemap.js');
    const sitemapXml = read('public/sitemap.xml');
    for (const slug of SLUGS) {
      expect(sitemapGen, `gen-sitemap 에 ${slug} 누락`).toContain(`legal/${slug}.html`);
      expect(sitemapApi, `api/sitemap 에 ${slug} 누락`).toContain(`legal/${slug}.html`);
      expect(sitemapXml, `sitemap.xml 에 ${slug} 누락`).toContain(`legal/${slug}.html`);
    }
    // 마케팅 문서가 앱에서 열람 불가한 '고아 문서'가 되지 않도록 동의 화면에 연결돼 있어야 한다.
    const auth = read('src/components/features/AuthModal.tsx');
    expect(auth).toContain('MarketingConsent');
    expect(auth).toContain('doc="marketing"');
  });
});
