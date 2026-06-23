// src/components/features/BusinessFooter.tsx
// 전 화면 하단 상시 노출 푸터 — 사업자 정보(전자상거래법 표시의무) + 약관/정책 링크 + 사행성 배제 고지.
import type { LegalDoc } from './LegalDocsModal';

// 사업자등록증(525-20-02937) 기준 — LegalDocsModal/LegalNotice 와 동일 값 유지.
const BIZ_ROWS: [string, string][] = [
  ['상호', '엔에이치홀딩스'],
  ['대표', '김윤혜'],
  ['사업자등록번호', '525-20-02937'],
  ['소재지', '경기도 남양주시 진건읍 사릉로372번길 25, 201동 1403호'],
  ['고객센터', 'buffyfan9303@gmail.com'],
];

export default function BusinessFooter({ onOpenLegal, onOpenSupport }: { onOpenLegal?: (d: LegalDoc) => void; onOpenSupport?: () => void }) {
  return (
    <footer className="mt-6 border-t border-border-subtle px-page-x pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8">
      <div className="mx-auto w-full max-w-5xl space-y-3">
        {/* 약관·정책 링크 */}
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs">
          <button type="button" onClick={() => onOpenLegal?.('terms')} className="font-semibold text-ink-secondary hover:text-accent-300">이용약관</button>
          <span className="text-border-strong" aria-hidden>·</span>
          <button type="button" onClick={() => onOpenLegal?.('privacy')} className="font-semibold text-ink-secondary hover:text-accent-300">개인정보처리방침</button>
          <span className="text-border-strong" aria-hidden>·</span>
          <button type="button" onClick={() => onOpenLegal?.('refund')} className="font-semibold text-ink-secondary hover:text-accent-300">취소·환불 정책</button>
          <span className="text-border-strong" aria-hidden>·</span>
          <button type="button" onClick={() => onOpenLegal?.('location')} className="font-semibold text-ink-secondary hover:text-accent-300">위치기반서비스 이용약관</button>
          {onOpenSupport && <>
            <span className="text-border-strong" aria-hidden>·</span>
            <button type="button" onClick={onOpenSupport} className="font-semibold text-accent-300/90 hover:text-accent-300">고객센터 문의</button>
          </>}
        </nav>

        {/* 사업자 정보 */}
        <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-relaxed text-ink-muted">
          {BIZ_ROWS.map(([k, v]) => (
            <div key={k} className="flex items-center gap-1">
              <dt className="text-ink-muted/70">{k}</dt>
              <dd className="text-ink-secondary">{v}</dd>
            </div>
          ))}
        </dl>

        {/* 사행성 배제 고지 */}
        <p className="text-[10px] leading-relaxed text-ink-muted/80">
          NURI HOLDEM은 「국민체육진흥법」상 마인드 스포츠인 홀덤의 합법적 토너먼트 정보 제공 플랫폼이며, 어떠한 형태의 도박·환전·사행행위와도 무관합니다.
          <br />© {`2026`} 엔에이치홀딩스. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
