// [DS] LEGAL-1 — 법적 텍스트 정합 스냅샷.
// 같은 사실이 여러 파일(PrivacyPolicy·LegalNotice·BusinessFooter·LegalDocsModal 위치 약관)에 흩어져 있어
// 한 곳만 고치면 '허위 고지'가 된다(틀린 것과 빠진 것 모두 리스크). 소스 텍스트 기반으로
// ① 사업자정보 동일값 ② 국외이전 표 ③ 필수 고지 문구 ④ 하단 창 = 동의한 문서(한 벌)를 고정한다.
// 2026-10-06 약관 재검토 P1-1: 하단 창(LegalDocsModal)이 따로 쓰던 약관·처리방침·환불 본문을 지웠다 — 그 세 탭은 이제
//   src/pages/legal 의 컴포넌트를 그대로 그린다. 그래서 '두 처리방침 소스' 비교는 '한 벌인가' 검사로 바뀌었다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p: string) => readFileSync(path.join(__dirname, '../../..', p), 'utf-8');

const modal = read('src/components/features/LegalDocsModal.tsx');
const privacy = read('src/pages/legal/PrivacyPolicy.tsx');
const notice = read('src/pages/legal/LegalNotice.tsx');
const footer = read('src/components/features/BusinessFooter.tsx');

describe('법적 텍스트 정합 (LEGAL-1)', () => {
  it('사업자정보가 고지 소스에서 동일값이다', () => {
    for (const src of [notice, footer]) {
      expect(src).toContain('엔에이치홀딩스');
      expect(src).toContain('525-20-02937');
      expect(src).toContain('김윤혜');
      expect(src).toContain('ace@nuriholdem.com');
    }
  });

  it('국외이전 표가 처리방침(한 벌)에 있고 플레이스홀더가 없다', () => {
    for (const src of [privacy]) {
      expect(src).toContain('국외 이전');
      for (const vendor of ['Vercel', 'Cloudflare', 'Sentry', 'Resend', 'Google LLC']) {
        expect(src, `${vendor} 국외이전 행 누락`).toContain(vendor);
      }
      // Supabase 는 서울(ap-northeast-2) 리전 확인값 — 위탁으로 표기(2026-08-26 대시보드 확인)
      expect(src).toContain('ap-northeast-2');
      expect(src).toContain('주민등록번호');
      expect(src).toContain('거부');
    }
    expect(modal).not.toContain('[클라우드/인프라 제공사]');
    expect(modal).not.toContain('[본인확인기관]');
  });

  it('책임게임·연령 고지(1336·19세)가 노출 소스에 있다', () => {
    expect(notice).toContain('1336');
    expect(notice).toContain('1488');
    // 오너 결정 2026-09-30 ⑦ — PR #68 에서 뺐던 근거 문장을 되살렸다. 다시 지우지 않는다.
    expect(notice).toContain('국민체육진흥법 제2조 (체육의 정의). 홀덤은 신체 활동이 아닌 두뇌 경기로서 마인드 스포츠로 통칭됩니다');
    expect(footer).toContain('1336');
    expect(footer).toContain('만 19세 미만');
  });

  it('사행성 배제·중개자 면책 문구가 유지된다(심사 정합 LAW-7·LAW-8)', () => {
    expect(footer).toContain('도박·환전·사행행위와도 무관');
    expect(read('src/pages/legal/RefundPolicy.tsx')).toContain('환불·환전의 대상이 아닙니다'); // 이용권 비금전
    expect(read('src/pages/legal/TermsOfService.tsx')).toContain('통신판매중개자로서 통신판매의 당사자가 아니며'); // 약관 제8조
    const market = read('src/components/features/MarketplaceTab.tsx');
    expect(market).toContain('통신판매중개자로서 거래의 당사자가 아닙니다');
    // P2-7 — 공유 링크로 바로 열리는 매물 상세도 같은 문장(상수 한 벌)을 보인다
    expect(market).toMatch(/export \{[^}]*BROKER_NOTICE[^}]*\}/);
    expect(read('src/components/features/ListingDetailModal.tsx')).toContain('{BROKER_NOTICE}');
  });

  it('🔴 P1-1 하단 창의 약관·처리방침·환불은 동의 화면·공개 주소와 같은 컴포넌트다(두 벌 금지)', () => {
    for (const [doc, comp] of [['terms', 'TermsOfService'], ['privacy', 'PrivacyPolicy'], ['refund', 'RefundPolicy']]) {
      expect(modal, `${doc}: 하단 창이 ${comp} 를 그리지 않는다`).toContain(`import ${comp} from '../../pages/legal/${comp}';`);
      expect(modal).toMatch(new RegExp(`${doc}: ${comp},`));
    }
    // 옛 손글씨 본문의 표지 — 되살아나면 다시 두 벌이다
    for (const gone of ['const TERMS = `', 'const PRIVACY = `', 'const REFUND = `', 'const REVISION_NOTE', '원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다']) {
      expect(modal, `하단 창에 옛 본문(${gone})이 되살아났다`).not.toContain(gone);
    }
    // 공개 정적본(gen-legal)도 같은 컴포넌트를 찍는다
    const entry = read('scripts/legal-ssr-entry.tsx');
    for (const comp of ['TermsOfService', 'PrivacyPolicy', 'RefundPolicy']) expect(entry).toContain(`/src/pages/legal/${comp}'`);
  });

  it('위치 약관 · 개인위치정보 비저장 문구가 유지된다(LAW-3)', () => {
    expect(modal).toContain('상시 수집·보관하지 않습니다');
    expect(modal).toContain('별도로 저장되지 않습니다');
  });
});
