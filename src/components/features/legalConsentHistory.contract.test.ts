// 개인정보 열람권(개인정보보호법 §35) — 내 약관 동의 이력 화면 (오너 결정 2026-09-19).
//
// 배경: api/auth.ts 의 getMyLegalConsents 가 만들어져 있었는데 호출부가 0 이었다(감사에서 발견).
// 오너: "내 정보 > 보안에 붙여라." 지킬 것 세 가지 —
//   ① 없는 필드를 추측해 채우지 않는다(API 가 주는 것만).
//   ② 법 문구를 새로 짓지 않는다(항목 이름은 가입·재동의 화면이 이미 쓰는 표기를 재사용).
//   ③ 조회 실패와 '이력 없음' 을 가른다 — 실패를 빈 목록으로 위장하지 않는다.
// 음성 대조(2026-09-19 실행): `.catch((e: unknown) => { if (alive) setErr(e); })` 를
//   `.catch(() => setItems([]))` 로 바꾸면(실패를 빈 배열로 위장) ③이 빨개진다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PM = strip(readFileSync(join(__dirname, 'ProfileModal.tsx'), 'utf-8'));

describe('개인정보 열람권 — 약관 동의 이력', () => {
  it('🔴 보안 탭에 붙어 있고 getMyLegalConsents 를 부른다', () => {
    expect(PM).toMatch(/import \{ requestPasswordChangeCode[\s\S]{0,400}?getMyLegalConsents, type LegalConsentRecord/);
    expect(PM).toMatch(/tab === 'security' && \([\s\S]{0,2000}?<LegalConsentHistory \/>/);
    expect(PM).toMatch(/getMyLegalConsents\(20\)/);
  });

  it('🔴 조회 실패와 "이력 없음" 을 가른다 — 실패를 빈 목록으로 위장하지 않는다', () => {
    // err 는 catch 에서만 세팅되고 items 는 성공 경로에서만 세팅된다 — 실패가 items=[] 를 만들지 않는다.
    expect(PM, "catch 가 items 를 건드리면 실패가 '이력 없음'으로 위장된다").not.toMatch(/catch\([^)]*\)\s*=>\s*(\{[^}]*setItems\(\[\]\)|setItems\(\[\]\))/);
    expect(PM).toMatch(/\.catch\(\(e: unknown\) => \{ if \(alive\) setErr\(e\); \}\)/);
    // 실패·로딩·빈이력·목록 네 갈래가 코드에 실제로 있다(LoadErrorCard 가 실패 전용).
    expect(PM).toMatch(/err != null \? \(\s*<LoadErrorCard error=\{err\} what="약관 동의 이력"/);
    expect(PM).toMatch(/items!\.length === 0 \? \(/);
  });

  it('🔴 화면에 새 법 문구를 짓지 않는다 — 가입·재동의 화면이 이미 쓰는 표기를 재사용', () => {
    // CONSENT_CAT_LABEL 값이 AuthModal.tsx LEGAL_TITLES · ConsentGateModal.tsx 가 쓰는 표기와 같은지
    // (문자 그대로 대조 — 다른 문구를 새로 썼다면 여기서 어긋난다).
    for (const label of ['서비스 이용약관', '개인정보처리방침', '사행성 배제 및 건전 이용 공지', '마케팅 정보 수신 동의']) {
      expect(PM, `'${label}' 라벨이 없다 — 가입 화면과 다른 문구를 새로 지었을 수 있다`).toContain(label);
    }
    // API 가 주지 않는 필드를 추측해 만든 흔적(예: 임의 legalVersion 계산)이 없다 — r.legalVersion·r.agreedAt·r.source 를 그대로만 쓴다.
    expect(PM).toMatch(/약관 버전 \{r\.legalVersion\}/);
    expect(PM).toMatch(/new Date\(r\.agreedAt\)\.toLocaleString\('ko-KR'\)/);
  });
});
