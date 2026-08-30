// src/components/features/BusinessFooter.tsx
// 전 화면 하단 상시 노출 푸터 — 사업자 정보(전자상거래법 표시의무) + 약관/정책 링크 + 사행성 배제 고지.
import type { LegalDoc } from './LegalDocsModal';
// 약관 시행일은 src/lib/legalVersion.ts 단일 소스 — 푸터에 날짜를 박으면 개정 때 여기만 남는다.
import { LEGAL_EFFECTIVE_DATE, LEGAL_NOTICE_DATE, LEGAL_PREV_EFFECTIVE_DATE } from '../../lib/legalVersion';

// 사업자등록증(525-20-02937) 기준 — LegalDocsModal/LegalNotice 와 동일 값 유지.
// PG(포트원/다날) 입점 심사 요건(2026-08-28 거절 사유 반영): 상호·사업자번호·대표자명·
// 사업장 주소·전화번호 5항목은 푸터에 '상시 노출'이어야 한다(연결화면 방식 불인정).
// 부가 정보(고객센터·호스팅)만 펼침 유지.
// eslint-disable-next-line react-refresh/only-export-components -- 사업자 정보 단일 소스(VerifyGateSheet 재사용), 순수 상수라 HMR 무해
export const BIZ_REQUIRED: [string, string][] = [
  ['상호', '엔에이치홀딩스'],
  ['사업자등록번호', '525-20-02937'],
  ['대표자', '김윤혜'],
  ['사업장 주소', '경기도 남양주시 진건읍 사릉로372번길 25, 201동 1403호'],
  ['전화번호', '010-7508-7689'],
];
const BIZ_EXTRA: [string, string][] = [
  ['고객센터', 'buffyfan9303@gmail.com'],
  // 전자상거래법 §10 표시사항 — 호스팅 서비스 제공자
  ['호스팅 제공자', 'Vercel Inc.'],
];

export default function BusinessFooter({ onOpenLegal, onOpenSupport }: { onOpenLegal?: (d: LegalDoc) => void; onOpenSupport?: () => void }) {
  return (
    <footer className="mt-6 border-t border-border-subtle px-page-x pt-5 pb-[calc(var(--tabbar-safe)+0.5rem)] lg:pb-8">
      <div className="mx-auto w-full max-w-5xl space-y-3">
        {/* 약관·정책 링크 */}
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs">
          {/* 업주 완전 사용설명서(공개 정적 페이지) — 회원가입부터 정산까지 전 기능 안내 */}
          {/* PG 심사 요건: '어떤 서비스를 운영하는지' 확인 가능한 소개 페이지(정적 URL) */}
          <a href="/about.html" target="_blank" rel="noopener" className="inline-flex items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">서비스 소개</a>
          <span className="text-border-strong" aria-hidden>·</span>
          <a href="/guide/manual.html" target="_blank" rel="noopener" className="inline-flex items-center py-1.5 -my-1.5 font-semibold text-accent-300/90 hover:text-accent-300">사용설명서</a>
          <span className="text-border-strong" aria-hidden>·</span>
          <button type="button" onClick={() => onOpenLegal?.('terms')} className="inline-flex items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">이용약관</button>
          <span className="text-border-strong" aria-hidden>·</span>
          <button type="button" onClick={() => onOpenLegal?.('privacy')} className="inline-flex items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">개인정보처리방침</button>
          <span className="text-border-strong" aria-hidden>·</span>
          <button type="button" onClick={() => onOpenLegal?.('refund')} className="inline-flex items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">취소·환불 정책</button>
          <span className="text-border-strong" aria-hidden>·</span>
          <button type="button" onClick={() => onOpenLegal?.('location')} className="inline-flex items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">위치기반서비스 이용약관</button>
          {onOpenSupport && <>
            <span className="text-border-strong" aria-hidden>·</span>
            <button type="button" onClick={onOpenSupport} className="inline-flex items-center py-1.5 -my-1.5 font-semibold text-accent-300/90 hover:text-accent-300">고객센터 문의</button>
          </>}
        </nav>

        {/* 사업자 정보 — PG 심사 필수 5항목은 상시 노출, 부가 항목만 펼침 */}
        <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs leading-relaxed text-ink-muted">
          {BIZ_REQUIRED.map(([k, v]) => (
            <div key={k} className="flex items-center gap-1">
              <dt className="text-ink-muted/70">{k}</dt>
              <dd className="text-ink-secondary">{v}</dd>
            </div>
          ))}
        </dl>
        <details className="group/biz text-2xs leading-relaxed text-ink-muted">
          <summary className="inline-flex cursor-pointer list-none items-center gap-0.5 text-ink-muted underline decoration-border-default underline-offset-2">
            추가 정보<span aria-hidden className="transition-transform group-open/biz:rotate-180">▾</span>
          </summary>
          <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {BIZ_EXTRA.map(([k, v]) => (
              <div key={k} className="flex items-center gap-1">
                <dt className="text-ink-muted/70">{k}</dt>
                <dd className="text-ink-secondary">{v}</dd>
              </div>
            ))}
          </dl>
        </details>

        {/* 사행성 배제 고지 */}
        <p className="text-2xs leading-relaxed text-ink-muted/80">
          NURI HOLDEM은 「국민체육진흥법」상 마인드 스포츠인 홀덤의 합법적 토너먼트 정보 제공 플랫폼이며, 어떠한 형태의 도박·환전·사행행위와도 무관합니다.
          <br />만 19세 미만은 이용할 수 없습니다 · 도박문제 상담 1336(24시간·무료)
          {/* 약관 개정 사전 고지 — 비로그인 방문자에게도 보여야 '서비스 내 공지'가 성립한다. */}
          <br />약관·개인정보처리방침 개정 안내: {LEGAL_NOTICE_DATE} 공지 · {LEGAL_EFFECTIVE_DATE} 시행 (시행 전까지는 {LEGAL_PREV_EFFECTIVE_DATE} 시행판 적용)
          <br />© {`2026`} 엔에이치홀딩스. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
