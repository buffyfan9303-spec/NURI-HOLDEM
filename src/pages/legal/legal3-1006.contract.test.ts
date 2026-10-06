// 이용약관 제3판(활동 포인트) 시행 계약 — Documents/누리홀덤_영상분석_0930/legal-full-1006/review.md P2-2
//   + 2026-10-06 오너 결정("목요일 기준 — 시행은 모든 약관상 목요일부터": 정식 오픈일 = 배포일에 공지·시행, 그날부터 재동의).
// 실행: npx vitest run src/pages/legal/legal3-1006.contract.test.ts
// 음성 대조(실행 기록은 PR 본문):
//   ① legalConsentStage 를 옛 식(`kstToday(now) >= LEGAL_EFFECTIVE_ISO ? 'required' : 'notice'`)으로 되돌리면 '시행 전날' 이 빨개진다
//      — 판별 시행일 없이 한 날짜로 비교하면 판을 올리는 순간(시행 전에도) 전원이 차단된다. 시행일 기준 구조를 잠근다.
//   ② TermsOfService 제16조③ 의 단서를 지우면 '동의 간주' 가 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { LEGAL_VERSION, LEGAL_EFFECTIVE_ISO, legalConsentStage, legalRequiredSinceIso } from '../../lib/legalVersion';
import { LEGAL_DEPLOY_ISO, TERMS_V3_NOTICE_ISO, TERMS_V3_EFFECTIVE_ISO, TERMS_V2_ARCHIVE_URL } from '../../lib/legalDeploy';

const ROOT = path.join(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');
const kst = (iso: string, hm = '12:00') => new Date(`${iso}T${hm}:00+09:00`);
const prevDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

describe('제3판 날짜 — 배포일(정식 오픈일) 한 곳', () => {
  it('공지일 ≤ 시행일 · 둘 다 배포일 · 약관 동의 판 3', () => {
    expect(TERMS_V3_NOTICE_ISO <= TERMS_V3_EFFECTIVE_ISO).toBe(true);
    expect(TERMS_V3_EFFECTIVE_ISO).toBe(LEGAL_DEPLOY_ISO);
    expect(LEGAL_VERSION).toBe(3);
  });
});

describe('재동의 — 제3판 시행일 KST 0시부터 제2판 동의자 차단(명시 동의)', () => {
  it('시행 전날 23:59 까지 제2판 동의자는 notice(차단 없음)', () => {
    expect(legalConsentStage(2, kst(prevDay(TERMS_V3_EFFECTIVE_ISO), '23:59'))).toBe('notice');
    expect(legalRequiredSinceIso(2, kst(prevDay(TERMS_V3_EFFECTIVE_ISO), '23:59'))).toBeNull();
  });
  it('시행일 00:00 부터 required · 차단 사유 시행일은 제3판 시행일', () => {
    expect(legalConsentStage(2, kst(TERMS_V3_EFFECTIVE_ISO, '00:00'))).toBe('required');
    expect(legalRequiredSinceIso(2, kst(TERMS_V3_EFFECTIVE_ISO))).toBe(TERMS_V3_EFFECTIVE_ISO);
  });
  it('제1판·미상 동의자는 시행 전날에도 차단(제2판 시행 2026-09-29 이후) · 제3판 동의자는 언제나 ok', () => {
    expect(legalConsentStage(1, kst(prevDay(TERMS_V3_EFFECTIVE_ISO)))).toBe('required');
    expect(legalConsentStage(null, kst(prevDay(TERMS_V3_EFFECTIVE_ISO)))).toBe('required');
    expect(legalRequiredSinceIso(1, kst(prevDay(TERMS_V3_EFFECTIVE_ISO)))).toBe(LEGAL_EFFECTIVE_ISO);
    expect(legalRequiredSinceIso(1, kst(TERMS_V3_EFFECTIVE_ISO))).toBe(TERMS_V3_EFFECTIVE_ISO);
    expect(legalConsentStage(3, kst(TERMS_V3_EFFECTIVE_ISO))).toBe('ok');
    expect(legalConsentStage(3, kst('2027-12-31'))).toBe('ok');
  });
  it('게이트 문구는 상수가 아니라 차단 사유의 시행일을 보여 준다', () => {
    const g = read('src/components/features/ConsentGateModal.tsx');
    expect(g).toContain('legalRequiredSinceIso(user.consentedLegalVersion)');
    expect(g).toContain('개정 약관이 {sinceIso ? koDate(sinceIso) : \'\'}부터 시행되었습니다.');
  });
});

describe('약관 본문 — 제10조의2 · 정의 · 동의 간주', () => {
  const t = read('src/pages/legal/TermsOfService.tsx');
  const art = t.slice(t.indexOf('<Article n="10조의2" title="활동 포인트">'), t.indexOf('<Article n={11}'));
  it('제10조의2가 실제 동작(적립·사용·반환·유효기간 없음·회수·탈퇴 소멸·변경 공지)을 8개 항으로 적는다', () => {
    expect(art.length).toBeGreaterThan(500);
    const items = art.slice(art.indexOf('<Items items={['));
    expect((items.match(/^\s+'.+',\r?$/gm) ?? []).length).toBe(8);
    for (const k of ['매장 출석, 게시글·댓글 작성, 미션', 'AI 스팟 코칭', '등급은 줄지 않습니다', '금전이나 매장 이용권으로 바꿀 수 없고',
      '자동으로 돌려드립니다', '유효기간이 없어', '함께 회수할 수 있습니다', '소멸하며, 다시 가입하더라도 되살릴 수 없습니다', '바꾸기 7일 전에 서비스 내에 공지']) {
      expect(art, k).toContain(k);
    }
  });
  it('§28 — 새 조항에 환금성 단어가 없다', () => {
    const body = art.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(body).not.toMatch(/환전|현금|수익/);
  });
  it('제2조제6호가 화면 용어(활동 포인트)와 같다', () => {
    expect(t).toContain('"활동점수"(서비스 화면의 "활동 포인트")란');
  });
  it('🔴 동의 간주 — 불리한 변경에는 적용하지 않고 적용일부터 동의를 다시 받는다(제16조③ 단서)', () => {
    expect(t).toContain('다만 회원에게 불리한 변경에는 이 동의 간주를 적용하지 않으며, 회사는 적용일부터 서비스 화면에서 변경된 약관에 대한 동의를 다시 받습니다.');
  });
  it('상단 개정 안내 — 정식 오픈과 함께 시행 · 재동의 · 계속 이용 ≠ 동의 · 탈퇴 가능 · 이전판 링크', () => {
    const a = t.indexOf('data-testid="terms-v3-notice"');
    const box = t.slice(a, t.indexOf('</div>', a));
    for (const k of ['{TERMS_V3_EFFECTIVE_DATE} 정식 오픈과 함께 시행합니다', '동의를 다시 여쭈며', '동의하지 않은 채 이용을 계속하신 것만으로 동의한 것으로 보지 않습니다',
      '「내 정보 → 보안 → 회원 탈퇴하기」', 'href={TERMS_V2_ARCHIVE_URL}', 'href={LEGAL_PREV_ARCHIVE_URL}']) {
      expect(box, k).toContain(k);
    }
    // 4문서 공통 RevisionNotice 는 '제2판이 시행 중' 이라고 말한다 — 제3판이 시행 중인 이 문서에는 없어야 한다.
    expect(t).not.toContain('<RevisionNotice');
  });
});

describe('제2판 원문 보존본 · 공개 문서', () => {
  it('보존본이 배포일 폴더에 있고 noindex · 제3판 조항 없음 · 사업자 정보 · 1336 · sitemap 미포함', () => {
    const p = path.join(ROOT, 'public' + TERMS_V2_ARCHIVE_URL);
    expect(existsSync(p), `${TERMS_V2_ARCHIVE_URL} 가 없다 — 배포일을 옮겼으면 폴더도 같은 커밋에서 옮긴다`).toBe(true);
    const h = readFileSync(p, 'utf-8');
    expect(h).toContain('noindex');
    expect(h).toContain('제2판 원문');
    expect(h).not.toContain('제10조의2');
    expect(h).toContain('525-20-02937');
    expect(h).toContain('1336');
    expect(read('public/sitemap.xml')).not.toContain('legal/archive');
  });
  it('공개 약관(/legal/terms.html)이 제3판 본문과 보존본 링크를 싣는다', () => {
    const h = read('public/legal/terms.html');
    expect(h).toContain('제10조의2');
    expect(h).toContain(TERMS_V2_ARCHIVE_URL);
  });
});
