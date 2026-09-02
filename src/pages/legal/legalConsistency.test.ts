// [DS] LEGAL-1 — 법적 텍스트 정합 스냅샷.
// 같은 사실이 4개 파일(LegalDocsModal·PrivacyPolicy·LegalNotice·BusinessFooter)에 흩어져 있어
// 한 곳만 고치면 '허위 고지'가 된다(틀린 것과 빠진 것 모두 리스크). 소스 텍스트 기반으로
// ① 사업자정보 3소스 동일값 ② 국외이전 표 2소스 동시 존재 ③ 필수 고지 문구를 고정한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p: string) => readFileSync(path.join(__dirname, '../../..', p), 'utf-8');

const modal = read('src/components/features/LegalDocsModal.tsx');
const privacy = read('src/pages/legal/PrivacyPolicy.tsx');
const notice = read('src/pages/legal/LegalNotice.tsx');
const footer = read('src/components/features/BusinessFooter.tsx');

describe('법적 텍스트 정합 (LEGAL-1)', () => {
  it('사업자정보가 3소스에서 동일값이다', () => {
    for (const src of [modal, notice, footer]) {
      expect(src).toContain('엔에이치홀딩스');
      expect(src).toContain('525-20-02937');
      expect(src).toContain('김윤혜');
      expect(src).toContain('buffyfan9303@gmail.com');
    }
  });

  it('국외이전 표가 두 처리방침 소스에 모두 있고 플레이스홀더가 없다', () => {
    for (const src of [modal, privacy]) {
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
    expect(footer).toContain('1336');
    expect(footer).toContain('만 19세 미만');
  });

  it('사행성 배제·중개자 면책 문구가 유지된다(심사 정합 LAW-7·LAW-8)', () => {
    expect(footer).toContain('도박·환전·사행행위와도 무관');
    expect(modal).toContain('환불·환전의 대상이 아닙니다'); // REFUND — 이용권 비금전
    expect(modal).toContain('중개 공간'); // TERMS 제8조
    const market = read('src/components/features/MarketplaceTab.tsx');
    expect(market).toContain('통신판매중개자로서 거래의 당사자가 아닙니다');
  });

  it('위치 약관 · 개인위치정보 비저장 문구가 유지된다(LAW-3)', () => {
    expect(modal).toContain('상시 수집·보관하지 않습니다');
    expect(modal).toContain('별도로 저장되지 않습니다');
  });
});
