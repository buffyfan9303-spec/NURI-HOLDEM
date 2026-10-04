// 20261004d(오너 결정 (다) 2026-10-04) — 위치 확인 출석의 '같은 사실'이 서버·클라·법정 문서에서 어긋나지 않게 잠근다.
//   · 서버 거부 시작 시각(_checkin_geo_required_from) = 클라 시행일(LOCATION_TERMS_EFFECTIVE) — 한쪽만 미루면 약관과 실제가 다르다
//   · 공지일 → 시행일 30일 이상(이용약관 제16조② 불리한 변경 · 처리방침 제14조②)
//   · 서버 동의 판(terms_version >= N) = LOCATION_TERMS_VERSION · 서버 거부 code = 클라 GEO_REQUIRED_CODES
//   · 처리방침 두 벌(가입 화면·하단 창)에 위치정보법 제21조의2 항목 · 책임자 연락처 · '현재 사용하지 않습니다' 제거
//   · 제2판 원문 보존본(제12조① 변경 공개의 짝 · 처리방침 제14조③ 원칙)
// 실행: npx vitest run src/lib/locationTerms.contract.test.ts
// 음성 대조(2026-10-04): 마이그레이션의 '2026-11-05 00:00:00+09' 를 하루 당기면 ①이, LOCATION_TERMS_NOTICE 를 10-07 로 미루면 ②가,
//   PrivacyPolicy.tsx 의 ⑨ 블록에서 위치정보관리책임자 줄을 지우면 ⑤가 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  LOCATION_TERMS_VERSION, LOCATION_TERMS_NOTICE, LOCATION_TERMS_EFFECTIVE, LOCATION_TERMS_EFFECTIVE_KO,
  LOCATION_TERMS_PREV_ARCHIVE_URL, GEO_REQUIRED_FROM_MS, isGeoRequiredNow, LOCATION_OFFICER, CHECKIN_ALT_PATH,
} from './locationTerms';
import { GEO_REQUIRED_CODES } from './checkinGeo';

const ROOT = path.join(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const sql = read('supabase/migrations/20261004d_checkin_geo_required_after_notice.sql');
const fnBody = (name: string) => {
  const i = sql.indexOf(`create or replace function public.${name}(`);
  return sql.slice(i, sql.indexOf('$function$;', i));
};
const DAY = 86_400_000;

describe('locationTerms — 서버·클라 단일 사실', () => {
  it('① 서버 거부 시작 시각 = 클라 시행일 0시(KST)', () => {
    const m = fnBody('_checkin_geo_required_from').match(/timestamptz '(\d{4}-\d{2}-\d{2}) 00:00:00\+09'/);
    expect(m?.[1]).toBe(LOCATION_TERMS_EFFECTIVE);
    expect(GEO_REQUIRED_FROM_MS).toBe(Date.parse(`${LOCATION_TERMS_EFFECTIVE}T00:00:00+09:00`));
    expect(sql).toContain(`'${LOCATION_TERMS_EFFECTIVE} 00:00:00+09'`); // 자가검사도 같은 값
    expect(isGeoRequiredNow(GEO_REQUIRED_FROM_MS - 1)).toBe(false);
    expect(isGeoRequiredNow(GEO_REQUIRED_FROM_MS)).toBe(true);
    expect(LOCATION_TERMS_EFFECTIVE_KO).toBe(`${Number(LOCATION_TERMS_EFFECTIVE.slice(0, 4))}년 ${Number(LOCATION_TERMS_EFFECTIVE.slice(5, 7))}월 ${Number(LOCATION_TERMS_EFFECTIVE.slice(8, 10))}일`);
  });
  it('② 공지일부터 시행일까지 30일 이상(불리한 변경)', () => {
    const gap = (Date.parse(`${LOCATION_TERMS_EFFECTIVE}T00:00:00+09:00`) - Date.parse(`${LOCATION_TERMS_NOTICE}T00:00:00+09:00`)) / DAY;
    expect(gap).toBeGreaterThanOrEqual(30);
  });
  it('③ 서버 동의 판 = LOCATION_TERMS_VERSION, 옛 판(>= N-1) 비교가 남지 않았다', () => {
    const body = fnBody('check_in');
    expect(body).toContain(`terms_version >= ${LOCATION_TERMS_VERSION})`);
    expect(body).not.toContain(`terms_version >= ${LOCATION_TERMS_VERSION - 1})`);
  });
  it('④ 서버가 돌려주는 거부 code = 클라가 아는 code(모르는 code 는 시트가 아니라 토스트가 된다)', () => {
    const codes = [...fnBody('check_in').matchAll(/'code', '([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(codes).toEqual(Object.keys(GEO_REQUIRED_CODES).sort());
    // 서버 문구에도 대체 경로가 들어 있다 — 옛 번들·다른 출석 경로(이용권 시트·매장 페이지)는 이 문구를 토스트로 보여 준다
    expect(fnBody('check_in').match(/매장 직원에게 참가를 요청/g)).toHaveLength(2);
  });
});

describe('개인정보처리방침 — 위치정보법 제21조의2 · 시행령 제25조의2', () => {
  const pp = read('src/pages/legal/PrivacyPolicy.tsx');
  const block = pp.slice(pp.indexOf('data-testid="privacy-location"'), pp.indexOf('</Article>', pp.indexOf('data-testid="privacy-location"')));
  it('⑤ 가입 화면 처리방침(⑨) — 목적·항목·보유기간·확인자료 근거/기간·파기·제3자 제공·8세 이하·권리·책임자', () => {
    expect(block.length).toBeGreaterThan(500);
    for (const k of ['처리 목적:', '처리 항목:', '보유기간:', '이용·제공사실 확인자료:', '제16조제2항', '6개월', '파기 절차 및 방법:', '제3자 제공:', '즉시 알립니다', '8세 이하', '권리 행사:', '위치정보관리책임자:']) {
      expect(block, k).toContain(k);
    }
    expect(block).toMatch(/\$\{LOCATION_OFFICER\.name\} · 연락처 \$\{LOCATION_OFFICER\.contact\}/);
    expect(block).toMatch(/\$\{LOCATION_TERMS_EFFECTIVE_KO\}부터 동의하지 않으면 그 매장의 QR 출석이 처리되지 않으며, \$\{CHECKIN_ALT_PATH\}/);
  });
  it('⑥ "현재 사용하지 않습니다" 옛 문구가 두 처리방침 어디에도 없다', () => {
    const modal = read('src/components/features/LegalDocsModal.tsx');
    expect(pp).not.toMatch(/출석 위치 확인 — 현재 사용하지 않습니다/);
    expect(modal).not.toMatch(/출석 위치 확인\(현재 미사용\)/);
    const p7 = modal.slice(modal.indexOf('7-1. 개인위치정보의 처리'), modal.indexOf('8. 안전성 확보 조치'));
    for (const k of ['처리 목적:', '처리 항목:', '보유기간:', '이용·제공사실 확인자료:', '파기 절차 및 방법:', '제3자 제공:', '8세 이하', '위치정보관리책임자: ${BIZ.locationOfficer} / 연락처 ${BIZ.locationOfficerContact}']) {
      expect(p7, k).toContain(k);
    }
  });
  it('⑦ 위치정보 동의는 "기능 이용 시 필요한 항목" — 그 매장 QR 출석만 안 되고 다른 이용 제한 없음(개인정보 보호법 제22조⑤ 취지)', () => {
    expect(pp).toMatch(/기능 이용 시 필요한 항목\(위치\):[^`]*그 매장의 QR 출석만 되지 않을 뿐[^`]*그 밖의 서비스 이용에는 제한이 없습니다/);
  });
  it('⑧ 책임자 = 신고서 담당자(김윤혜 대표) · 회사 공식 메일', () => {
    expect(LOCATION_OFFICER).toEqual({ name: '김윤혜(대표)', contact: 'ace@nuriholdem.com' });
  });
});

describe('제2판 원문 보존본(public/legal/archive)', () => {
  const file = path.join(ROOT, 'public' + LOCATION_TERMS_PREV_ARCHIVE_URL);
  it('⑨ 파일이 있고 제2판 원문·배너·사업자 정보·19세·1336·noindex', () => {
    expect(existsSync(file)).toBe(true);
    const h = readFileSync(file, 'utf8');
    expect(h).toContain('동의하지 않아도 출석을 포함한 서비스 이용에 제한이 없습니다'); // 제2판 제7조제1항 원문 그대로
    expect(h).toContain('제2판은 2026-09-26부터 시행합니다');
    expect(h).toContain('제3판 시행일(2026년 11월 5일) 전까지 적용됩니다');
    expect(h).toContain('525-20-02937');
    expect(h).toContain('만 19세 미만은 이용할 수 없습니다');
    expect(h).toContain('1336');
    expect(h).toContain('noindex');
    expect(h).not.toContain('${'); // 치환 누락 없음
  });
  it('⑩ sitemap 에 넣지 않는다(오너 보호 파일 · 색인 대상 아님)', () => {
    expect(read('public/sitemap.xml')).not.toContain('legal/archive');
  });
});

describe('화면 문구 — 동의 시트·재시도 시트가 같은 사실을 말한다', () => {
  it('⑪ 동의 시트: 시행일·QR 출석 불가·대체 경로·선택 동의 · required 모드 문구', () => {
    const s = read('src/components/features/LocationConsentSheet.tsx');
    expect(s).toMatch(/동의는 선택입니다\. 다만 \$\{LOCATION_TERMS_EFFECTIVE_KO\}부터 위치 확인 출석 매장에서는 동의하지 않으면 QR 출석이 되지 않으며, \$\{CHECKIN_ALT_PATH\}/);
    expect(s).toMatch(/\{required \? '동의하지 않음' : '동의하지 않고 출석'\}/);
    expect(s).not.toMatch(/동의하지 않아도 출석할 수 있습니다/);
    expect(CHECKIN_ALT_PATH).toMatch(/매장 직원에게 참가를 요청/);
    expect(CHECKIN_ALT_PATH).toMatch(/참가 신청/);
  });
});
