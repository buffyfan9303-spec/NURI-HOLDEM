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
  CHECKIN_SCOPE, CONSENT_NATURE, BUSINESS_PHONE, PRIVACY_PRE_LOCATION_ARCHIVE_URL,
} from './locationTerms';
import { BIZ_REQUIRED } from '../components/features/BusinessFooter';
import { GEO_REQUIRED_CODES } from './checkinGeo';

const ROOT = path.join(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const sql = read('supabase/migrations/20261004d_checkin_geo_required_after_notice.sql');
// 20261005a 가 check_in·request_checkin·staff_check_in 을 다시 정의한다 — **가장 나중 정의**(5a → 4d 순)를 본다.
const sql5 = read('supabase/migrations/20261005a_checkin_geo_codes_business_day.sql');
const fnBody = (name: string) => {
  for (const s of [sql5, sql]) {
    const i = s.indexOf(`create or replace function public.${name}(`);
    if (i >= 0) return s.slice(i, s.indexOf('$function$;', i));
  }
  return '';
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
    expect(fnBody('check_in').match(/매장에서 출석 요청을 보내면 업주 승인으로 출석할 수 있습니다/g)).toHaveLength(2);
    expect(fnBody('check_in')).not.toMatch(/직원에게/);
    expect(fnBody('check_in')).not.toMatch(/참가를 요청/);
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
    expect(block).toMatch(/\$\{LOCATION_OFFICER\.name\} · 연락처 \$\{LOCATION_OFFICER\.contact\} · 전화 \$\{LOCATION_OFFICER\.phone\}/);
    expect(block).toMatch(/\$\{LOCATION_TERMS_EFFECTIVE_KO\}부터 동의하지 않으면 \$\{CHECKIN_SCOPE\}이 처리되지 않으며, \$\{CHECKIN_ALT_PATH\}\(업주가 승인한 출석도 같은/);
    expect(block).toMatch(/보완 전\(\$\{LOCATION_TERMS_NOTICE\} 이전\) 처리방침 원문: https:\/\/nuriholdem\.com\$\{PRIVACY_PRE_LOCATION_ARCHIVE_URL\}/);
  });
  it('⑥ "현재 사용하지 않습니다" 옛 문구가 두 처리방침 어디에도 없다', () => {
    const modal = read('src/components/features/LegalDocsModal.tsx');
    expect(pp).not.toMatch(/출석 위치 확인 — 현재 사용하지 않습니다/);
    expect(modal).not.toMatch(/출석 위치 확인\(현재 미사용\)/);
    // 2026-10-06 약관 재검토 P1-1: 하단 창은 처리방침 본문을 따로 갖지 않고 PrivacyPolicy(위 ⑤가 검사한 ⑨)를 그대로 그린다.
    expect(modal).not.toContain('7-1. 개인위치정보의 처리');
    expect(modal).toMatch(/privacy: PrivacyPolicy,/);
  });
  it('⑦ 위치정보 동의는 "기능 이용 시 필요한 항목" — 그 매장 직접 출석만 안 되고 같은 혜택의 직원 처리·다른 이용 제한 없음(개인정보 보호법 제22조⑤ 취지)', () => {
    expect(pp).toMatch(/기능 이용 시 필요한 항목\(위치 — \$\{CONSENT_NATURE\}\):[^`]*\$\{CHECKIN_SCOPE\}만 직접 할 수 없을 뿐, \$\{CHECKIN_ALT_PATH\}\(같은 혜택\)[^`]*그 밖의 서비스 이용에는 제한이 없습니다/);
  });
  it('⑧ 책임자 = 신고서 담당자(김윤혜 대표) · 회사 공식 메일', () => {
    expect(LOCATION_OFFICER).toEqual({ name: '김윤혜(대표)', contact: 'ace@nuriholdem.com', phone: BUSINESS_PHONE });
    // L6 — 전화는 하단 푸터(BusinessFooter)와 같은 값을 읽는다(두 벌 금지) · 하단 창 약관의 사업자 전화(BIZ.phone)와도 같다
    expect(BUSINESS_PHONE).toBe(BIZ_REQUIRED.find(([k]) => k === '전화번호')?.[1]);
    expect(BUSINESS_PHONE).toMatch(/^0\d{1,2}-\d{3,4}-\d{4}$/);
    expect(read('src/components/features/LegalDocsModal.tsx')).toContain(`phone: '${BUSINESS_PHONE}',`);
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
    expect(s).toMatch(/동의하지 않아도 다른 이용에는 제한이 없습니다\. 다만 \$\{LOCATION_TERMS_EFFECTIVE_KO\}부터 위치 확인 출석 매장에서는 동의하지 않으면 \$\{CHECKIN_SCOPE\}이 되지 않으며, \$\{CHECKIN_ALT_PATH\}/);
    expect(s).toMatch(/data-testid="location-consent-nature"[^>]*>\{CONSENT_NATURE\}/);
    expect(s).toMatch(/\{required \? '동의하지 않음' : '동의하지 않고 출석'\}/);
    expect(s).not.toMatch(/동의하지 않아도 출석할 수 있습니다/);
    // L1·L2·L3 표현 고정
    expect(CHECKIN_ALT_PATH).toBe('매장에서 출석 요청을 보내면 업주 승인으로 출석할 수 있습니다');
    expect(CONSENT_NATURE).toBe('선택 동의 — 위치 확인 출석 매장의 출석에만 필요');
    expect(CHECKIN_SCOPE).toBe('그 매장의 출석(QR 스캔·매장 페이지 출석 버튼·앱 카메라)');
  });
});

// critical 반증 반영(2026-10-04 F1·F2·L1·L3·L5·L6) — 서버 판정과 화면 배선이 같은 선인지.
// 음성 대조: StoreDashboard 의 `canStaffCheckin={caps.manage}` 를 빼면 ⑬이, VenuePage 의 requestCheckinRetrySheet 를 토스트로 되돌리면 ⑭가,
//   VenueManageTab 의 `primaryOwner === true` 를 `!== false` 로 넓히면 ⑮가, LegalDocsModal 의 배너 조건을 지우면 ⑯이 빨개진다.
describe('critical 반증 반영 — 권한·대체 경로·배너·보존본', () => {
  it('⑫ 서버: 매장 스위치는 대표·관리자만 · 좌표 CHECK · 직원 출석 처리는 can_manage_pos + 4시간 + 감사', () => {
    expect(fnBody('set_venue_checkin_geo_required')).toContain('public._venue_owner_ok(p_venue_id)) is distinct from true');
    expect(fnBody('set_venue_checkin_geo_required')).not.toMatch(/can_manage_(venue|pos)\(/);
    expect(sql).toContain('check (not checkin_geo_required or (lat is not null and lng is not null))');
    expect(fnBody('check_in')).toContain('and v_vlat is not null and v_vlng is not null');
    const st = fnBody('staff_check_in');
    expect(st).toContain('coalesce(public.can_manage_pos(p_venue_id), false)');
    expect(st).toContain("interval '4 hours'");
    expect(st).toContain("public._audit('staff_check_in'");
    expect(st).toContain('public._apply_checkin(p_venue_id, p_user_id)');
    expect(st).toContain('p_user_id = auth.uid()');
    // v3(오너 B 2026-10-05) — 오늘 이 매장의 출석 요청(대기)·참가 신청이 있는 손님만, 그리고 그 검사는 출석 기록보다 앞
    // 20261005a P3-c — 요청·참가 신청 날짜는 KST 오늘 또는 영업일(ledger_business_date)
    expect(st).toMatch(/from public\.checkin_requests r\s+where r\.venue_id = p_venue_id and r\.user_id = p_user_id and r\.request_date in \(v_today, v_biz\) and r\.status = 'pending'/);
    expect(st).toMatch(/from public\.ledger_buyin_requests b\s+where b\.venue_id = p_venue_id and b\.user_id = p_user_id and b\.voucher_id is null\s+and b\.session_date in \(v_today, v_biz\)/);
    expect(st).toContain('v_biz := public.ledger_business_date(p_venue_id);');
    expect(st.indexOf('from public.checkin_requests r')).toBeLessThan(st.indexOf('v_res := public._apply_checkin'));
    const rq = fnBody('request_checkin');
    expect(rq).toContain("if v_geo is distinct from true then raise exception");
    expect(rq).toContain("if v_cnt >= 5 then raise exception");
    expect(rq).toContain("interval '4 hours'");
    // 20261005a P3-d — 운영자는 요청 불가(운영자끼리 서로 승인) · 요청 날짜 = 영업일
    expect(rq).toContain("if coalesce(public.can_manage_pos(p_venue_id), false) then raise exception '매장 운영자는");
    expect(rq.indexOf('can_manage_pos(p_venue_id)')).toBeLessThan(rq.indexOf('insert into public.checkin_requests'));
    expect(rq).toContain('values (p_venue_id, auth.uid(), v_disp, v_biz)');
    expect(sql).toContain('constraint checkin_requests_one_per_day unique (venue_id, user_id, request_date)');
    expect(sql).toMatch(/revoke all on table public\.checkin_requests from public, anon, authenticated;\r?\ngrant select on table public\.checkin_requests to authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.request_checkin\(uuid\) from public, anon;\r?\ngrant execute on function public\.request_checkin\(uuid\) to authenticated, service_role;/);
    expect(sql).toMatch(/revoke all on function public\.staff_check_in\(uuid, uuid\) from public, anon;\r?\ngrant execute on function public\.staff_check_in\(uuid, uuid\) to authenticated, service_role;/);
  });
  it('⑬ 화면: 출석 요청 승인 — 요청 목록(같은 권한) 뒤 staffCheckIn · 운영 권한(caps.manage)일 때만 · 늦은 응답 가드 · 전 회원 검색 없음', () => {
    const m = read('src/components/features/CheckinModal.tsx');
    expect(read('src/components/features/StoreDashboard.tsx')).toContain('canStaffCheckin={caps.manage}');
    expect(m).toMatch(/\{canStaffCheckin && \(\s*<div data-testid="staff-checkin"/);
    const fn = m.slice(m.indexOf('const scCheckin'), m.indexOf('const copy = async'));
    expect(fn).toMatch(/await staffCheckIn\(venueId, r\.userId\);\s*if \(isStaleResponse\(gen, mountGenRef\.current\)\) return;/);
    expect(fn).toContain('reload();');
    // 오너 B — 출석 처리 대상은 손님이 보낸 요청에서만 고른다(v2 의 전 회원 닉네임 검색 경로 제거)
    expect(m).not.toMatch(/searchVoucherRecipients/);
    expect(m).toMatch(/if \(canStaffCheckin\) \{\s*listCheckinRequests\(venueId\)/);
    expect(m).toMatch(/pendingCheckinRequests\(reqs\.filter\(\(r\) => r\.venueId === venueId\), list\)/);
    const api = read('src/api/checkins.ts');
    expect(api).toMatch(/supabase\.rpc\('staff_check_in', \{ p_venue_id: venueId, p_user_id: userId \}\)/);
    expect(api).toMatch(/supabase\.rpc\('request_checkin', \{ p_venue_id: venueId \}\)/);
    // 손님 쪽 '출석 요청' 버튼 — 재시도 시트(위치 거부·실패)에 있다 · 늦은 응답은 요청 시점 계정으로 묶는다
    expect(read('src/App.tsx')).toMatch(/data-testid="checkin-geo-request-btn"[\s\S]{0,400}requestCheckin\(v\)\s*\.then\(\(r\) => \{ if \(uidRef\.current === forUid\)/);
  });
  it('⑭ 대체 경로 안내: 매장 페이지 출석 버튼·이용권 시트 카메라도 App 의 재시도 시트로(토스트만 X)', () => {
    expect(read('src/components/features/VenuePage.tsx')).toMatch(/if \(!requestCheckinRetrySheet\(venue!\.id, e\)\) toast\.show/);
    expect(read('src/components/features/MyVoucherSheet.tsx')).toMatch(/if \(checkinFailureAction\(e\)\.kind === 'sheet'\) \{ onClose\(\); requestCheckinRetrySheet\(venueId, e\); \}/);
    expect(read('src/App.tsx')).toMatch(/window\.addEventListener\(CHECKIN_RETRY_EVENT, onRetry\)/);
  });
  it('⑮ 매장 스위치 화면 게이트 = 대표(확인된 is_primary)·관리자 — 모르면 끔', () => {
    expect(read('src/components/features/VenueManageTab.tsx')).toContain('canToggleCheckinGeo={isAdmin || (isOwner && primaryOwner === true)}');
    expect(read('src/components/features/VenueCustomizePanel.tsx')).toContain('<CheckinLocationSection venueId={venueId} canToggleGeo={canToggleCheckinGeo} />');
    expect(read('src/components/features/CheckinLocationSection.tsx')).toContain('canToggleGeo = false');
  });
  it('⑯ L5 — 제3판 시행 전에는 위치약관 맨 위에 "현재 적용: 제2판" 배너', () => {
    const m = read('src/components/features/LegalDocsModal.tsx');
    expect(m).toMatch(/const body = tab === 'location' && !isGeoRequiredNow\(\) \? `\$\{LOCATION_PENDING_BANNER\}/);
    expect(m).toContain('[현재 적용: 제2판 — 원문 https://nuriholdem.com${LOCATION_TERMS_PREV_ARCHIVE_URL}]');
    expect(m).toContain('{body}</p>');
  });
  it('⑰ L5 — 보완 전 처리방침 원문 보존본 두 벌(가입 화면 판·하단 창 판) · noindex · sitemap 밖', () => {
    const dir = path.join(ROOT, 'public' + PRIVACY_PRE_LOCATION_ARCHIVE_URL.replace('/privacy.html', ''));
    const pp0 = readFileSync(path.join(dir, 'privacy.html'), 'utf8');
    const fp0 = readFileSync(path.join(dir, 'footer-privacy.html'), 'utf8');
    expect(pp0).toContain('출석 위치 확인 — 현재 사용하지 않습니다'); // 보완 전 원문 그대로
    expect(fp0).toContain('출석 위치 확인(현재 미사용)');
    for (const h of [pp0, fp0]) {
      expect(h).toContain('noindex');
      expect(h).toContain('2026년 10월 5일 보완(위치정보 항목 추가) 전까지 게시된');
      expect(h).toContain('525-20-02937');
      expect(h).toContain('1336');
      expect(h).not.toContain('${');
    }
    expect(read('public/sitemap.xml')).not.toContain('2026-09-29');
  });
});
