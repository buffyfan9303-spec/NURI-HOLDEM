// [DS] LEGAL-3 — 약관 버전·시행일 단일 소스 잠금.
//
// 왜 필요한가
//   ① 시행일이 문서마다 따로 박혀 있던 것이 이번 개정의 발단이다(6곳이 '2026년 6월 15일'로 굳어
//      있었다). 다시 흩어지면 "가입 화면에서 동의한 시행일 ≠ 공개 문서의 시행일" = 허위 고지다.
//   ② 재동의 게이트의 3-state 판정(ok/notice/required)이 어긋나면 '아직 효력 없는 약관을 강제'하거나
//      '동의 없이 이용'하게 된다. 둘 다 법적 사고라 날짜 경계를 직접 잠근다.
//   ③ 클라이언트 LEGAL_VERSION 과 DB current_legal_version() 이 어긋나면 재동의 게이트가
//      영원히 닫히지 않는다(동의해도 낮은 버전이 기록돼 다시 뜬다). 두 숫자를 맞대어 본다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LEGAL_VERSION, LEGAL_EFFECTIVE_ISO, LEGAL_EFFECTIVE_DATE, LEGAL_NOTICE_ISO,
  LEGAL_PREV_EFFECTIVE_DATE, legalConsentStage, kstToday,
} from './legalVersion';
import { LEGAL_HISTORY } from './legalHistory';

const ROOT = path.join(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');

const at = (iso: string) => new Date(`${iso}T12:00:00+09:00`);

describe('약관 버전·시행일 (LEGAL-3)', () => {
  it('불리한 변경은 공지일로부터 30일 이상 뒤에 시행한다', () => {
    const days = (Date.parse(`${LEGAL_EFFECTIVE_ISO}T00:00:00Z`) - Date.parse(`${LEGAL_NOTICE_ISO}T00:00:00Z`))
      / 86_400_000;
    expect(days, '약관 제16조2항·처리방침 제14조2항이 요구하는 30일 사전 고지').toBeGreaterThanOrEqual(30);
  });

  it('한글 표기 시행일과 ISO 시행일이 같은 날을 가리킨다', () => {
    const [, y, m, d] = LEGAL_EFFECTIVE_DATE.match(/(\d{4})년 (\d{1,2})월 (\d{1,2})일/)!;
    expect(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`).toBe(LEGAL_EFFECTIVE_ISO);
  });

  it('재동의 3-state. 시행일 경계에서 notice → required 로 바뀐다', () => {
    // 구판(또는 미상) 동의자
    expect(legalConsentStage(null, at('2026-08-30'))).toBe('notice');
    expect(legalConsentStage(1,    at('2026-09-28'))).toBe('notice');
    expect(legalConsentStage(1,    at(LEGAL_EFFECTIVE_ISO))).toBe('required'); // 시행일 당일부터 차단
    expect(legalConsentStage(0,    at('2026-12-31'))).toBe('required');
    // 현재 판 동의자는 어느 시점에도 게이트가 뜨지 않는다
    expect(legalConsentStage(LEGAL_VERSION,     at('2026-08-30'))).toBe('ok');
    expect(legalConsentStage(LEGAL_VERSION,     at('2027-01-01'))).toBe('ok');
    expect(legalConsentStage(LEGAL_VERSION + 1, at('2027-01-01'))).toBe('ok');
  });

  it('시행일 판정은 기기 시간대와 무관하다(KST 고정)', () => {
    // KST 로 시행일 00:30 = UTC 로는 전날 15:30. 기기가 UTC 여도 '시행일'로 판정돼야 한다.
    const justAfterMidnightKst = new Date(`${LEGAL_EFFECTIVE_ISO}T00:30:00+09:00`);
    expect(kstToday(justAfterMidnightKst)).toBe(LEGAL_EFFECTIVE_ISO);
    expect(legalConsentStage(1, justAfterMidnightKst)).toBe('required');
    // KST 로 전날 23:30 은 아직 시행 전이다.
    const justBefore = new Date(`${LEGAL_EFFECTIVE_ISO}T00:00:00+09:00`.replace(/T.*/, 'T00:00:00+09:00'));
    expect(legalConsentStage(1, new Date(justBefore.getTime() - 30 * 60_000))).toBe('notice');
  });

  it('개정 이력이 4문서 모두에 있고 최신 항목이 현재 버전이다', () => {
    for (const [doc, rows] of Object.entries(LEGAL_HISTORY)) {
      expect(rows.length, `${doc}: 이력이 비어 있다`).toBeGreaterThan(0);
      expect(rows[0].version, `${doc}: 최신 이력이 현재 버전이 아니다`).toBe(LEGAL_VERSION);
      expect(rows[0].effective).toBe(LEGAL_EFFECTIVE_DATE);
      for (const r of rows) expect(r.changes.length, `${doc} 제${r.version}판: 변경 내용이 비었다`).toBeGreaterThan(0);
      // 버전은 내림차순(최신이 위) — 화면이 그대로 그린다.
      for (let i = 1; i < rows.length; i++) expect(rows[i - 1].version).toBeGreaterThan(rows[i].version);
    }
  });

  it('DB의 current_legal_version() 과 LEGAL_VERSION 이 같다', () => {
    // 어긋나면 재동의 게이트가 닫히지 않는다(동의해도 낮은 버전이 기록돼 다시 뜬다).
    const sql = read('supabase/migrations/20260830m_legal_consent_versioning.sql');
    const m = sql.match(/create or replace function public\.current_legal_version[\s\S]*?\$fn\$\s*select\s+(\d+)\s*\$fn\$/);
    expect(m, 'current_legal_version() 정의를 찾지 못했다').toBeTruthy();
    expect(Number(m![1])).toBe(LEGAL_VERSION);
  });

  it('시행일 문자열이 어떤 화면 소스에도 다시 박히지 않았다(단일 소스)', () => {
    const sources = [
      'src/pages/legal/TermsOfService.tsx',
      'src/pages/legal/PrivacyPolicy.tsx',
      'src/pages/legal/LegalNotice.tsx',
      'src/pages/legal/MarketingConsent.tsx',
      'src/pages/legal/RevisionBlocks.tsx',
      'src/lib/legalHistory.ts',
      'src/components/features/LegalDocsModal.tsx',
      'src/components/features/BusinessFooter.tsx',
      'src/components/features/ConsentGateModal.tsx',
    ];
    for (const p of sources) {
      const src = read(p);
      expect(src, `${p}: 시행일이 상수가 아니라 문자열로 박혔다`).not.toContain(LEGAL_EFFECTIVE_DATE);
      expect(src, `${p}: 직전 시행일이 문자열로 박혔다`).not.toContain(LEGAL_PREV_EFFECTIVE_DATE);
      expect(src, `${p}: legalVersion 단일 소스를 참조하지 않는다`).toMatch(/legalVersion|RevisionBlocks/);
    }
  });

  it('선택 동의를 필수로 묶지 않는다 (개인정보보호법 §22⑤)', () => {
    const gate = read('src/components/features/ConsentGateModal.tsx');
    const m = gate.match(/const allRequired = ([^;]+);/);
    expect(m, 'allRequired 정의를 찾지 못했다').toBeTruthy();
    expect(m![1], '선택 동의(마케팅)가 필수 조건에 들어갔다. 위법').not.toMatch(/marketing/i);
    expect(m![1], '선택 동의(랭킹 공개)가 필수 조건에 들어갔다. 위법').not.toMatch(/pubRank/i);
    // 서버도 같은 규칙이어야 한다 — 마케팅 false 를 거절하면 클라만 지켜도 소용없다.
    const sql = read('supabase/migrations/20260830m_legal_consent_versioning.sql');
    const guard = sql.match(/if p_terms is not true[^;]*;/);
    expect(guard, 'RPC 필수 항목 가드를 찾지 못했다').toBeTruthy();
    expect(guard![0]).not.toContain('p_marketing');
  });
});
