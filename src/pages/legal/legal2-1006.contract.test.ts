// 약관 전수 재검토(Documents/누리홀덤_영상분석_0930/legal-full-1006/review.md) + 오너 결정 2026-10-06 (A)(B)(C) 의 소스 계약.
// 실행: npx vitest run src/pages/legal/legal2-1006.contract.test.ts
// 음성 대조(실행 기록은 PR 본문): ① TierLeaderboard 버튼 disabled 식에서 `|| !vMasked` 를 지우면 P1-3 가 빨개진다
//   ② PrivacyPolicy 제9조에 옛 문장 '회사는 회원의 휴대전화번호를 매장에 제공하지 않습니다.' 를 되살리면 P1-2 가 빨개진다
//   ③ legalDeploy TERMS_NEXT.noticeIso 만 채우고 LEGAL_VERSION 을 그대로 두면 P2-2 가 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LEGAL_VERSION } from '../../lib/legalVersion';
import { TERMS_NEXT, OWNER_TERMS_VERSION, LEGAL_DEPLOY_ISO, TERMS_SUPPLEMENT_NOTICE_ISO, TERMS_SUPPLEMENT_EFFECTIVE_ISO, PRIVACY_V3_NOTICE_ISO, PRIVACY_V3_EFFECTIVE_ISO, OWNER_TERMS_EFFECTIVE_DATE } from '../../lib/legalDeploy';
import { LOCATION_TERMS_EFFECTIVE } from '../../lib/locationTerms';
import { ARTICLE_10_2, CHANGES } from '../../lib/termsNextDraft';

const ROOT = path.join(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');

describe('P1-2 매장 제공 고지 = 실제 동작(find_user_by_phone · search_registered_players)', () => {
  const pp = read('src/pages/legal/PrivacyPolicy.tsx');
  const art9 = pp.slice(pp.indexOf('title="개인정보의 제3자 제공"'), pp.indexOf('title="개인정보 자동 수집 장치'));
  it('제9조가 손님 명단(가린 번호·방문 횟수·장부 권한 직원)과 번호 전체 조회·거부 방법을 말한다', () => {
    expect(art9.length).toBeGreaterThan(1500);
    for (const k of ['장부 권한을 준 직원', '가운데를 가린 휴대전화번호', '방문 횟수', '휴대전화번호 전체를 직접 입력하면', '매장 전화번호 조회 허용', '딜러 구인 글에 지원하며', '동의를 거부할 권리와 불이익']) {
      expect(art9, k).toContain(k);
    }
    expect(art9, '옛 문장(번호를 매장에 제공하지 않는다)이 되살아났다').not.toContain('회사는 회원의 휴대전화번호를 매장에 제공하지 않습니다.');
  });
  it('예약 고지가 손님 명단·가린 번호를 사실대로 말하고 옛 문장이 없다', () => {
    const sd = read('src/components/features/ScheduleDetailModal.tsx');
    expect(sd).toContain('data-testid="reserve-customer-list"');
    expect(sd).not.toContain('<li>· 휴대전화번호는 매장에 전달되지 않습니다</li>');
  });
  it('거부 토글 — RPC 이름은 auth.ts 한 곳, 서버 칸이 없으면(undefined) 토글을 그리지 않는다', () => {
    const auth = read('src/api/auth.ts');
    expect(auth).toContain("export const PHONE_LOOKUP_RPC = 'set_my_phone_lookup';");
    expect(auth).toContain('supabase.rpc(PHONE_LOOKUP_RPC, { p_allow: allow })');
    expect(auth).toContain("'allow_venue_phone_lookup' in row ? row.allow_venue_phone_lookup !== false : undefined");
    const pm = read('src/components/features/ProfileModal.tsx');
    expect(pm).toContain('if (!user || user.allowVenuePhoneLookup === undefined) return null;');
    expect(pm).toContain('<PhoneLookupSetting />');
  });
});

describe('P1-3 순위 인증 — 별도 동의 + 번호 가림 필수 확인', () => {
  const tl = read('src/components/features/TierLeaderboard.tsx');
  it('두 체크가 모두 켜져야 인증 요청이 열리고, 제출에 함께 실린다', () => {
    expect(tl).toMatch(/disabled=\{vBusy \|\| !vForm\.event\.trim\(\) \|\| !vForm\.amount \|\| !vProof \|\| !vIdCard \|\| !vConsent \|\| !vMasked\}/);
    expect(tl).toContain('idConsent: vConsent, maskedConfirmed: vMasked');
    expect(tl).toContain('data-testid="rank-id-consent-agree"');
    expect(tl).toContain('data-testid="rank-id-masked"');
  });
  it('API 는 동의 없이 접수하지 않는다(업로드 전에 멈춘다)', async () => {
    const { submitRankVerification } = await import('../../api/rankverify');
    const f = new File(['x'], 'a.png');
    await expect(submitRankVerification({ nickname: 'n', eventName: 'e', amountWon: 1, proof: f, idCard: f, idConsent: true, maskedConfirmed: false }))
      .rejects.toThrow('번호 가림 확인');
    await expect(submitRankVerification({ nickname: 'n', eventName: 'e', amountWon: 1, proof: f, idCard: f, idConsent: false, maskedConfirmed: true }))
      .rejects.toThrow('신분증 사진 처리 동의');
  });
  it('처리방침 제2조⑪에 목적·항목·보유기간·거부권 · 탈퇴 삭제 목록에 입상 인증', () => {
    const pp = read('src/pages/legal/PrivacyPolicy.tsx');
    const b = pp.slice(pp.indexOf('data-testid="privacy-rank-verify"'), pp.indexOf('</div>', pp.indexOf('data-testid="privacy-rank-verify"')));
    for (const k of ['처리 목적:', '처리 항목:', '신분증 사진', '보유기간:', '30일 안에 심사되지 않은', '동의를 거부할 권리:']) expect(b, k).toContain(k);
    expect(pp).toContain('대회 입상 인증 신청과 증빙·신분증 사진(사진 파일은 탈퇴 후 10분 안에 저장소에서 삭제)');
  });
  it('P2-8 §28 — 회원 화면에 상금을 점수로 바꾸는 문구가 없다', () => {
    for (const gone of ['100만당', '금액이 보여야']) expect(tl, gone).not.toContain(gone);
  });
});

describe('P1-5 매장 운영자 이용약관(처리위탁)', () => {
  it('문서가 공개 정적본으로 찍히고, 업주 가입은 그 동의 없이 제출되지 않는다', () => {
    expect(read('scripts/legal-ssr-entry.tsx')).toContain("export { default as ownerTerms } from '../src/pages/legal/OwnerTerms';");
    expect(read('scripts/gen-legal.mjs')).toContain("slug: 'owner-terms', export: 'ownerTerms'");
    expect(read('public/legal/owner-terms.html')).toContain('개인정보 처리의 역할');
    const am = read('src/components/features/AuthModal.tsx');
    expect(am).toMatch(/disabled=\{loading \|\| !allRequired \|\| !ownerOk \|\|/);
    expect(am).toContain('rememberSignupOwnerTerms(mail.value);');
  });
  it('App 의 가입 동의 이어 적기 키 = lib/ownerTerms PENDING_KEY · 기존 업주는 내 매장에서 게이트', () => {
    const key = read('src/lib/ownerTerms.ts').match(/const PENDING_KEY = '([^']+)'/)?.[1];
    expect(key).toBeTruthy();
    const app = read('src/App.tsx');
    expect(app).toContain(`localStorage.getItem('${key}')`);
    expect(app).toMatch(/user\?\.role === 'venue_owner' && user\.approved && activeTab === 'my-store' && \(\s*<Suspense fallback=\{null\}><OwnerTermsGate/);
    expect(OWNER_TERMS_VERSION).toBe(1);
  });
  it('마이그레이션 — 동의 RPC 는 로그인 회원만 · 내부 함수 회수 · search_path 고정 · s2 큐 게이트', () => {
    const m = read('supabase/migrations/20261006n_legal2_owner_terms_rank_consent.sql');
    expect(m).toContain('revoke all on function public.record_my_owner_terms_consent(integer, text) from public, anon;');
    expect(m).toContain('grant execute on function public.record_my_owner_terms_consent(integer, text) to authenticated, service_role;');
    for (const f of ['_owner_terms_purge_on_withdraw()', '_rv_require_id_consent()', '_expire_rank_verification_idcards()']) {
      expect(m).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    }
    expect((m.match(/set search_path = public, pg_temp/g) ?? []).length).toBe(5);
    expect(m).toContain("to_regclass('public.storage_purge_queue') is null");
    expect(m.split('\n')[0]).toBe("select set_config('lock_timeout', '3s', true);");
  });
});

describe('P2-2 약관 제3판 — 공지 예정(초안)만, 시행 전환 금지', () => {
  it('공지일·시행일이 정해지기 전에는 회원 약관 판이 2 그대로다', () => {
    if (TERMS_NEXT.noticeIso === null || TERMS_NEXT.effectiveIso === null) {
      expect(TERMS_NEXT.noticeIso).toBeNull();
      expect(TERMS_NEXT.effectiveIso).toBeNull();
      expect(LEGAL_VERSION, '제3판 날짜 없이 판을 올렸다').toBe(2);
    } else {
      const days = (Date.parse(TERMS_NEXT.effectiveIso) - Date.parse(TERMS_NEXT.noticeIso)) / 86_400_000;
      expect(days, '불리한 변경(회수·소멸)은 30일 이상 공지').toBeGreaterThanOrEqual(30);
    }
  });
  it('초안이 회수·소멸·반환·7일 공지를 담고, 아직 화면 약관에 들어가지 않았다', () => {
    expect(ARTICLE_10_2).toHaveLength(6);
    expect(ARTICLE_10_2.join(' ')).toMatch(/회수할 수 있습니다[\s\S]*소멸하며[\s\S]*7일 전에 공지/);
    expect(CHANGES.join(' ')).toContain('30일 전에 공지');
    expect(read('src/pages/legal/TermsOfService.tsx')).not.toContain('termsNextDraft');
  });
});

describe('P2-3·P2-4·P2-6·P2-9 약관 정정·보완', () => {
  const t = read('src/pages/legal/TermsOfService.tsx');
  it('권리침해 신고·임시조치(30일)·통지 절차가 약관에 있다(정보통신망법 §44의2⑤)', () => {
    for (const k of ['제44조의2', '30일 이내의 기간 동안', '요청한 사람과 게시물 작성자에게 알리며', '제44조의3']) expect(t, k).toContain(k);
  });
  it('유료서비스 정의가 환불 정책(광고·노출 + 매장 운영 도구 이용료)과 같다', () => {
    expect(t).toContain('노출 강화·광고 상품과 매장 운영 도구 이용료');
    expect(read('src/pages/legal/RefundPolicy.tsx')).toContain('매장 운영 도구 이용료');
  });
  it('19세 문구가 실제 절차(가입 시 본인 확인 · 본인인증 거절)대로다', () => {
    expect(t).toContain('본인인증에서 만 19세 미만으로 확인되면 회사는 본인인증을 거절');
    const pp = read('src/pages/legal/PrivacyPolicy.tsx');
    expect(pp).not.toContain('회사는 연령 확인 결과 만 19세 미만임이 밝혀진 경우');
    expect(read('supabase/functions/verify-identity/logic.ts')).toMatch(/if \(age === null \|\| age < 19\) return json\(/);
  });
});

describe('오너 결정 2026-10-06 — 모든 시행일 = 정식 오픈일(LEGAL_DEPLOY_ISO) 한 곳', () => {
  it('처리방침 제3판·약관 보완·매장 운영자 약관·위치 약관 제3판 = 공지 = 시행 = 정식 오픈일', () => {
    for (const iso of [TERMS_SUPPLEMENT_NOTICE_ISO, TERMS_SUPPLEMENT_EFFECTIVE_ISO, PRIVACY_V3_NOTICE_ISO, PRIVACY_V3_EFFECTIVE_ISO, LOCATION_TERMS_EFFECTIVE]) {
      expect(iso).toBe(LEGAL_DEPLOY_ISO);
    }
    const [y, mo, d] = LEGAL_DEPLOY_ISO.split('-').map(Number);
    expect(OWNER_TERMS_EFFECTIVE_DATE).toBe(`${y}년 ${mo}월 ${d}일`);
    // 서버 거부 시작 시각(20261006o)도 같은 날
    expect(read('supabase/migrations/20261006o_geo_required_from_open_day.sql')).toContain(`select timestamptz '${LEGAL_DEPLOY_ISO} 00:00:00+09'`);
  });
  it('날짜 문자열이 다른 소스에 박히지 않았고, 사전 공지 간격(7일·30일) 문구가 이번 개정 안내에 없다', () => {
    // locationTerms.ts 의 공지일(2026-10-05)은 이미 지난 사실이라 문자열로 남는다 — 시행일만 LEGAL_DEPLOY_ISO 를 쓰는지 본다.
    expect(read('src/lib/locationTerms.ts')).toContain('export const LOCATION_TERMS_EFFECTIVE = LEGAL_DEPLOY_ISO;');
    for (const p of ['src/lib/legalVersion.ts', 'src/pages/legal/OwnerTerms.tsx', 'src/pages/legal/TermsOfService.tsx', 'src/lib/legalHistory.ts', 'src/lib/ownerTerms.ts']) {
      expect(read(p), p).not.toMatch(/'2026-1[01]-\d\d'|2026년 1[01]월 \d+일/);
    }
    const t = read('src/pages/legal/TermsOfService.tsx');
    const box = t.slice(t.indexOf('data-testid="terms-supplement-notice"'), t.indexOf('</div>', t.indexOf('data-testid="terms-supplement-notice"')));
    expect(box).toContain('정식 오픈과 함께 시행');
    expect(box).not.toMatch(/7일|30일/);
    const pp = read('src/pages/legal/PrivacyPolicy.tsx');
    const rn = pp.slice(pp.indexOf('data-testid="revision-notice"'), pp.indexOf('</div>', pp.indexOf('data-testid="revision-notice"')));
    expect(rn).toContain('정식 오픈과 함께 시행');
    expect(rn).not.toContain('30일 전에 공지');
  });
  it('P2-5 제2판 보존본 배너에 지난 날짜(10-06 공지·11-05 시행)가 없다', () => {
    // 본문(게시 당시 원문)은 그대로 두고 머리 배너만 본다 — 본문 첫 조항 앞까지.
    const full = read('public/legal/archive/2026-10-06/privacy.html');
    const a = full.slice(0, full.indexOf('제1조 (개인정보의 처리 목적)'));
    expect(a.length).toBeGreaterThan(1000);
    expect(a).not.toMatch(/2026-11-05|11월 5일|10월 6일 제3판/);
    expect(a).toContain('제3판 시행(정식 오픈) 전까지');
  });
});

describe('리드 결정 ② — 만 19세 미만 확인 시 이용 제한 + 관리자 알림(서버 분기)', () => {
  it('restrict_underage_account 는 service_role 전용 · 엣지가 부른다', () => {
    const m = read('supabase/migrations/20261006n_legal2_owner_terms_rank_consent.sql');
    expect(m).toContain('revoke all on function public.restrict_underage_account(uuid) from public, anon, authenticated;');
    expect(m).toContain('grant execute on function public.restrict_underage_account(uuid) to service_role;');
    expect(m).toMatch(/set status = 'suspended', suspended_until = null, sanction_reason = c_reason/);
    expect(read('supabase/functions/verify-identity/index.ts')).toContain("admin.rpc('restrict_underage_account', { p_uid: userId })");
    expect(read('supabase/functions/verify-identity/logic.ts')).toMatch(/if \(age !== null && age < 19\) \{[\s\S]{0,200}deps\.restrictUnderage\?\.\(uid\)/);
  });
});

describe('pr188-193-review P2-3·P2-4 — 기능 화면 고지 · 출석·순위 기록 귀속', () => {
  it('출석·QR·출석 요청·참가 신청·이용권 화면에 매장 제공 한 줄 고지(처리방침 제9조②)', () => {
    const where: [string, string][] = [
      ['src/components/features/VenuePage.tsx', '<VenueShareNote kind="checkin" />'],
      ['src/components/features/MyVoucherSheet.tsx', '<VenueShareNote kind="qr"'],
      ['src/components/features/MyVoucherSheet.tsx', '<VenueShareNote kind="voucher"'],
      ['src/App.tsx', '<VenueShareNote kind="request" />'],
      ['src/App.tsx', '<VenueShareNote kind="buyin"'],
      ['src/components/features/ScheduleDetailModal.tsx', '<VenueShareNote kind="buyin"'],
    ];
    for (const [p, tag] of where) expect(read(p), `${p}: ${tag}`).toContain(tag);
  });
  it('처리방침 제3조 매장 기록에서 출석 기록이 빠지고, 업주 약관이 회사의 출석·순위 이용을 명시한다', () => {
    const pp = read('src/pages/legal/PrivacyPolicy.tsx');
    expect(pp).not.toContain('매장 기록: 제2조⑦의 정보와 출석 기록');
    expect(pp).toContain('매장이 등록한 대회 순위 기록(닉네임·등수·대회)');
    const ot = read('src/pages/legal/OwnerTerms.tsx');
    expect(ot).toContain('회사도 개인정보처리방침 제2조⑥의 목적');
    expect(ot).toContain('회사가 전국 입상 경력 순위 산정에 이용');
  });
  it('P3-1 서버는 현재 판만 기록 · P3-7 게이트 조회는 본인 행만', () => {
    const m = read('supabase/migrations/20261006n_legal2_owner_terms_rank_consent.sql');
    expect(m).toMatch(/c_current constant integer := 1;[\s\S]{0,300}if p_version is distinct from c_current then raise/);
    expect(read('src/lib/ownerTerms.ts')).toContain(".eq('user_id', uid)");
  });
});
