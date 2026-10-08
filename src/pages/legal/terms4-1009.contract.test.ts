// 이용약관 제4판(제11조제4항 — 탈퇴한 회원의 게시물) 계약.
//   원천: Documents/누리홀덤_영상분석_0930/audit12/triage-user.md#UP-20 · 오너 2026-10-09 "약관 너가 처리해"(문구를 실제 처리에 맞춘다, 처리는 그대로).
//   실제 처리: supabase/migrations/20260925d_withdraw_purge_private.sql(_purge_private_records) — 게시글·댓글·장터 글 등은 내용을 남기고
//   작성자 표시만 '탈퇴회원_…' · 이미 그렇게 적힌 문서: AccountDeletion.tsx '4. 탈퇴 후에도 남는 정보' · PrivacyPolicy.tsx 제3조.
//   탈퇴 후 노출 중단을 기대할 수 없게 되므로 회원에게 불리한 변경 → 제16조② 30일 전 공지 · 제16조③ 단서 재동의(제4판 시행일부터).
// 실행: npx vitest run src/pages/legal/terms4-1009.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { LEGAL_VERSION, legalConsentStage, legalRequiredSinceIso } from '../../lib/legalVersion';
import * as deploy from '../../lib/legalDeploy';
import { LEGAL_HISTORY } from '../../lib/legalHistory';

const ROOT = path.join(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');
const kst = (iso: string, hm = '12:00') => new Date(`${iso}T${hm}:00+09:00`);
const prevDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const D = deploy as unknown as Record<string, string>;
const NOTICE = D.TERMS_V4_NOTICE_ISO;
const EFFECTIVE = D.TERMS_V4_EFFECTIVE_ISO;
const ARCHIVE = D.TERMS_V3_ARCHIVE_URL;
const OLD = '회원이 게시물을 삭제하거나 이용계약을 해지한 경우 회사는 지체 없이 해당 게시물의 노출을 중단합니다.';

describe('제4판 날짜 — 불리한 변경: 적용일 30일 전 공지(제16조제2항)', () => {
  it('공지일·시행일이 있고 30일 이상 떨어져 있다 · 한글 표기 일치 · 약관 동의 판 4', () => {
    expect(NOTICE, 'TERMS_V4_NOTICE_ISO 없음').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(EFFECTIVE, 'TERMS_V4_EFFECTIVE_ISO 없음').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(`${EFFECTIVE}T00:00:00Z`) - Date.parse(`${NOTICE}T00:00:00Z`)) / 86_400_000;
    expect(days, '제16조제2항 — 회원에게 불리한 변경은 적용일 30일 전부터 공지').toBeGreaterThanOrEqual(30);
    expect(D.TERMS_V4_EFFECTIVE_DATE).toBe(deploy.koDate(EFFECTIVE));
    expect(D.TERMS_V4_NOTICE_DATE).toBe(deploy.koDate(NOTICE));
    expect(LEGAL_VERSION).toBe(4);
    expect(LEGAL_HISTORY.terms[0].version).toBe(4);
    expect(LEGAL_HISTORY.terms[0].effective).toBe(D.TERMS_V4_EFFECTIVE_DATE);
    expect(LEGAL_HISTORY.terms[0].notice).toBe(D.TERMS_V4_NOTICE_DATE);
  });
});

describe('재동의 — 제3판 동의자는 제4판 시행일 KST 0시부터 차단(제16조제3항 단서)', () => {
  it('시행 전날 23:59 까지는 notice(차단 없음)', () => {
    expect(legalConsentStage(3, kst(prevDay(EFFECTIVE), '23:59'))).toBe('notice');
    expect(legalRequiredSinceIso(3, kst(prevDay(EFFECTIVE), '23:59'))).toBeNull();
    expect(legalConsentStage(3, kst(NOTICE))).toBe('notice');
  });
  it('시행일 00:00 부터 required · 차단 사유 시행일 = 제4판 시행일 · 제4판 동의자는 ok', () => {
    expect(legalConsentStage(3, kst(EFFECTIVE, '00:00'))).toBe('required');
    expect(legalRequiredSinceIso(3, kst(EFFECTIVE))).toBe(EFFECTIVE);
    expect(legalRequiredSinceIso(2, kst(EFFECTIVE))).toBe(EFFECTIVE);
    expect(legalConsentStage(4, kst(EFFECTIVE))).toBe('ok');
    expect(legalConsentStage(4, kst('2027-12-31'))).toBe('ok');
  });
  it('서버 current_legal_version() 4 마이그레이션이 있다(미적용 표시 · ACL 재명시)', () => {
    const m = read('supabase/migrations/20261009a_terms_v4_legal_version.sql');
    expect(m).toMatch(/\$fn\$\s*select\s+4\s*\$fn\$/);
    expect(m).toContain('revoke all on function public.current_legal_version() from public, anon;');
    expect(m).toContain('grant execute on function public.current_legal_version() to authenticated, service_role;');
  });
});

describe('제11조제4항 본문 — 실제 처리와 같다', () => {
  const t = read('src/pages/legal/TermsOfService.tsx');
  const art = t.slice(t.indexOf('<Article n={11}'), t.indexOf('<Article n={12}'));
  it('탈퇴 시 노출 중단이라는 옛 문구가 없다', () => {
    expect(art).not.toContain(OLD);
    expect(art).not.toMatch(/이용계약을 해지한 경우 회사는 지체 없이 해당 게시물의 노출을 중단/);
  });
  it('직접 삭제 = 노출 중단 · 탈퇴 = 내용 남고 작성자 표시만 바뀜 · 탈퇴 전 삭제·고객센터 요청 · 권리침해 삭제 요청 경로 유지', () => {
    for (const k of [
      '회원이 게시물을 삭제한 경우 회사는 지체 없이 해당 게시물의 노출을 중단합니다.',
      '게시글·댓글·장터 글 등 게시물의 내용은 서비스에 남고',
      '작성자 표시는 “탈퇴회원_(임의 문자)”로 바뀌며 닉네임과 프로필 사진은 지워집니다',
      '탈퇴 전에 직접 삭제하거나 고객센터에 삭제를 요청할 수 있습니다',
      '제5조제7항부터 제10항까지',
      '법령에 따라 보존하여야 하는 기록은 그러하지 아니합니다',
    ]) expect(art, k).toContain(k);
    // 항 수는 그대로(5개) — 제11조제5항(구상) 번호가 밀리지 않는다.
    const items = art.slice(art.indexOf('<Items items={['));
    expect((items.match(/^\s+'.+',\r?$/gm) ?? []).length).toBe(5);
  });
  it('개인정보처리방침·계정 삭제 안내와 같은 사실(작성자 표시 문자열)', () => {
    expect(read('src/pages/legal/PrivacyPolicy.tsx')).toContain('작성자 표시를 “탈퇴회원_(임의 문자)”로 바꾸고 닉네임·프로필 사진을 지운 뒤 내용은 남깁니다');
    expect(read('src/pages/legal/AccountDeletion.tsx')).toContain('작성자 표시를 “탈퇴회원_(임의 문자)”로 바꾸고 닉네임·프로필 사진을 지운 뒤 내용은 남습니다');
  });
  it('상단 개정 안내 — 시행일·공지일·불리한 변경·시행 전 제3판 적용·재동의·계속 이용 ≠ 동의·탈퇴 가능·제3판 원문 링크', () => {
    const a = t.indexOf('data-testid="terms-v4-notice"');
    expect(a).toBeGreaterThan(0);
    const box = t.slice(a, t.indexOf('</div>', a));
    for (const k of ['{TERMS_V4_EFFECTIVE_DATE}부터 시행합니다', '{TERMS_V4_NOTICE_DATE}', '회원에게 불리한 변경', '시행일 전까지는 제3판이 적용됩니다',
      '동의를 다시 여쭈며', '동의하지 않은 채 이용을 계속하신 것만으로 동의한 것으로 보지 않습니다', '「내 정보 → 보안 → 회원 탈퇴하기」',
      'href={TERMS_V3_ARCHIVE_URL}']) expect(box, k).toContain(k);
    // 날짜는 legalDeploy 상수만 — 문자열로 박지 않는다.
    expect(t).not.toMatch(/2026년 1[01]월 \d+일|'2026-1[01]-\d\d'/);
  });
});

describe('제3판 원문 보존본 · 공개 문서 · 푸터', () => {
  it('보존본이 있고 noindex · 제3판 원문 배너 · 옛 제11조제4항 그대로 · 사업자 정보 · 1336 · sitemap 미포함', () => {
    expect(ARCHIVE, 'TERMS_V3_ARCHIVE_URL 없음').toMatch(/^\/legal\/archive\/\d{4}-\d{2}-\d{2}\/terms\.html$/);
    const p = path.join(ROOT, 'public' + ARCHIVE);
    expect(existsSync(p), `${ARCHIVE} 가 없다`).toBe(true);
    const h = readFileSync(p, 'utf-8');
    expect(h).toContain('noindex');
    expect(h).toContain('제3판 원문');
    expect(h).toContain('제10조의2');
    expect(h).toContain(OLD);
    expect(h).toContain('525-20-02937');
    expect(h).toContain('1336');
    expect(read('public/sitemap.xml')).not.toContain('legal/archive');
  });
  it('공개 약관(/legal/terms.html)이 제4판 본문 · 보존본 링크를 싣고 옛 문구가 없다', () => {
    const h = read('public/legal/terms.html');
    expect(h).toContain('작성자 표시는 “탈퇴회원_(임의 문자)”로 바뀌며');
    expect(h).toContain(ARCHIVE);
    expect(h).not.toContain(OLD);
  });
  it('푸터 개정 안내가 제4판 시행일을 말한다(비로그인 방문자에게도 보이는 서비스 내 공지)', () => {
    const f = read('src/components/features/BusinessFooter.tsx');
    const a = f.indexOf('data-testid="footer-revision-notice"');
    const line = f.slice(a, f.indexOf('</p>', a));
    expect(line).toContain('이용약관 제4판');
    expect(line).toContain('{TERMS_V4_EFFECTIVE_DATE}');
  });
});
