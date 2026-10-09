// LBS-REPORT(2026-10-09) — 위치기반서비스사업 신고 수리(제1717호) 사실이 앱·웹·푸터·공지·처리방침에서 **같은 값**인지 잠근다.
// 근거: 방송미디어통신사무소 신고수리 통지(시행 방송미디어통신사무소-4306), 2026-10-08 수리, 위치정보법 제9조의2.
// 실행: npx vitest run src/pages/legal/lbsReport1009.contract.test.ts
// 음성 대조: src/lib/lbsReport.ts 의 LBS_REPORT_NO 를 다른 번호로 바꾸면 '정본 값' 이,
//   LegalDocsModal 제2조의 `${LBS_REPORT_LABEL}: ${LBS_REPORT_VALUE}` 줄을 지우면 '앱 약관 제2조' 가,
//   `npm run legal` 을 안 돌리면 '웹 약관' 이 실패한다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { LBS_REPORT_LABEL, LBS_REPORT_VALUE } from '../../lib/lbsReport';
import { LOCATION } from '../../components/features/LegalDocsModal';
import { LEGAL_HISTORY } from '../../lib/legalHistory';
import { PRIVACY_VERSION } from '../../lib/legalVersion';

const ROOT = path.join(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8').replace(/\r\n/g, '\n');

/** 통지문 원문에서 옮긴 정본 — 상수 파일과 독립으로 적어 둔다(상수만 바꾸고 통과하는 것을 막는다). */
const EXPECTED = '제1717호(방송미디어통신사무소, 2026년 10월 8일 수리)';
const EXPECTED_LINE = `위치기반서비스사업 신고: ${EXPECTED}`;

/** 제2조(사업자 정보) 절만 잘라낸다 — 신고 줄이 다른 절에 흘러든 것을 통과시키지 않는다. */
const art2 = (text: string) => {
  const s = text.indexOf('제2조(사업자 정보)');
  const e = text.indexOf('제3조(서비스 내용)');
  expect(s, '제2조(사업자 정보) 없음').toBeGreaterThanOrEqual(0);
  expect(e, '제3조 없음').toBeGreaterThan(s);
  return text.slice(s, e);
};

describe('위치기반서비스사업 신고 제1717호', () => {
  it('정본 값 — 상수 파일이 통지문의 신고번호·수리기관·수리일과 같다', () => {
    expect(LBS_REPORT_LABEL).toBe('위치기반서비스사업 신고');
    expect(LBS_REPORT_VALUE).toBe(EXPECTED);
  });

  it('앱 약관 제2조(사업자 정보)에 신고 줄이 있다', () => {
    expect(art2(LOCATION)).toContain(EXPECTED_LINE);
  });

  it('웹 약관(/legal/location.html) 제2조에 앱 약관과 같은 줄이 있다', () => {
    const web = read('public/legal/location.html');
    expect(art2(web)).toContain(EXPECTED_LINE);
    // 앱·웹이 같은 신고 문장을 가진다(개수까지 같다 — 한쪽만 부칙을 고친 상태를 잡는다).
    const count = (t: string) => t.split(EXPECTED).length - 1;
    expect(count(web)).toBe(count(LOCATION));
    expect(count(LOCATION)).toBeGreaterThanOrEqual(2); // 제2조 + 부칙의 사실 추가 이력
  });

  it('부칙에 사실 추가 이력이 있고 판 번호·시행일은 건드리지 않았다(제3판 · 2026-10-08 그대로)', () => {
    expect(LOCATION).toMatch(/2026-10-09: 제2조의 사업자 정보에 위치기반서비스사업 신고 .*바로 적용했습니다/);
    // 사실 추가라 새 판을 만들지 않는다 — 판 번호/시행일 상수가 그대로여야 한다.
    const lt = read('src/lib/locationTerms.ts');
    expect(lt).toMatch(/LOCATION_TERMS_VERSION = 3\b/);
    expect(lt).not.toMatch(/LOCATION_TERMS_VERSION = 4\b/);
  });

  // PR #253 검토 P2-1·P2-2 — 사실 추가는 **현행 판(위치 약관 제3판 · 처리방침 제3판)** 쪽에 적는다.
  //   이미 끝난 제2판 밑에 두면 '끝난 판을 10-09 에 고쳤다'로 읽힌다(위치정보법 제12조① '쉽게 알아볼 수 있도록').
  //   음성 대조: 두 줄을 제2판 자리로 되돌리면 이 테스트가 실패한다.
  it('사실 추가 이력은 현행 판(제3판) 쪽에 있다 — 끝난 제2판 밑이 아니다', () => {
    const line = LOCATION.indexOf('2026-10-09: 제2조의 사업자 정보에');
    const v3Start = LOCATION.search(/\n3\. 제3판은 /);
    expect(v3Start, '부칙 3번(제3판 시행) 없음').toBeGreaterThan(0);
    expect(line, '위치 약관 부칙의 신고 추가 줄이 제3판 항목보다 앞(제2판 하위)에 있다').toBeGreaterThan(v3Start);
    const web = read('public/legal/location.html');
    expect(web.indexOf('2026-10-09: 제2조의 사업자 정보에'), '웹 약관도 제3판 쪽이어야 한다(npm run legal)').toBeGreaterThan(web.search(/\n3\. 제3판은 /));

    const priv = LEGAL_HISTORY.privacy;
    const has = (v: number) => (priv.find((r) => r.version === v)?.changes ?? []).some((c) => c.includes(EXPECTED));
    expect(PRIVACY_VERSION).toBe(3);
    expect(has(PRIVACY_VERSION), '처리방침 현행 판(제3판) 이력에 신고 추가 줄이 없다').toBe(true);
    expect(has(2), '처리방침 신고 추가 줄이 끝난 제2판 이력에 있다').toBe(false);
  });

  it('상시 푸터가 같은 상수로 신고 번호를 표시한다(390px 줄바꿈 덩어리 포함)', () => {
    const f = read('src/components/features/BusinessFooter.tsx');
    expect(f).toContain("from '../../lib/lbsReport'");
    expect(f).toMatch(/data-testid="footer-lbs-report"/);
    expect(f).toMatch(/LBS_REPORT_LABEL/);
    expect(f).toMatch(/LBS_REPORT_NO\}\(\{LBS_REPORT_OFFICE\},/);
    expect(f).toMatch(/LBS_REPORT_DATE_KO\} 수리\)/);
    // 신고는 <dl>(BIZ_REQUIRED/BIZ_EXTRA) 밖에 둔다 — 안에 넣으면 모바일 라벨 칸이 넓어지고 메일 하단 생성기로 번진다.
    expect(read('src/components/features/BusinessFooter.tsx').split('BIZ_REQUIRED: [string, string][] = [')[1].split('];')[0]).not.toContain('신고');
  });

  it('사행성 배제 공지(사업자 정보)와 처리방침 ⑨, 두 공개 HTML 이 같은 값을 싣는다', () => {
    expect(read('src/pages/legal/LegalNotice.tsx')).toMatch(/\[LBS_REPORT_LABEL, LBS_REPORT_VALUE\]/);
    expect(read('src/pages/legal/PrivacyPolicy.tsx')).toMatch(/\$\{LBS_REPORT_LABEL\}: \$\{LBS_REPORT_VALUE\}/);
    const ag = read('public/legal/anti-gambling.html');
    expect(ag).toContain('위치기반서비스사업 신고');
    expect(ag).toContain(EXPECTED);
    const pv = read('public/legal/privacy.html');
    expect(pv).toContain(EXPECTED_LINE);
  });

  it('신고번호 리터럴은 상수 파일 한 곳에만 있다(두 벌 금지) — 보관본(archive)·테스트·문서 제외', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.ts$/.test(name)) continue;
        if (readFileSync(p, 'utf-8').includes('제1717호')) hits.push(path.relative(ROOT, p).replace(/\\/g, '/'));
      }
    };
    walk(path.join(ROOT, 'src'));
    expect(hits).toEqual(['src/lib/lbsReport.ts']);
  });

  it('보관본(archive)은 건드리지 않았다 — 옛 판 원문에는 신고 문구가 없다', () => {
    for (const rel of ['public/legal/archive/2026-09-26/location.html', 'public/legal/archive/2026-06-15/location.html']) {
      expect(read(rel), `${rel} 은 당시 원문 그대로여야 한다`).not.toContain('제1717호');
    }
  });
});
