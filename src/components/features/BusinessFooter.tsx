// src/components/features/BusinessFooter.tsx
// 전 화면 하단 상시 노출 푸터 — 사업자 정보(전자상거래법 표시의무) + 약관/정책 링크 + 사행성 배제 고지.
import type { LegalDoc } from './LegalDocsModal';

// 사업자등록증(525-20-02937) 기준 — LegalDocsModal/LegalNotice 와 동일 값 유지.
// 오너 지시(2026-08-27): 기본 노출은 최소(상호·사업자번호 1줄), 나머지는 '사업자 정보' 펼침 —
// 전상법 §10 신원정보는 공정위 고시상 초기화면의 '연결화면(펼침·링크)' 제공이 허용된다(쿠팡·네이버 관행).
const BIZ_SUMMARY: [string, string][] = [
  ['상호', '엔에이치홀딩스'],
  ['사업자등록번호', '525-20-02937'],
];
const BIZ_ROWS: [string, string][] = [
  ['대표', '김윤혜'],
  ['소재지', '경기도 남양주시 진건읍 사릉로372번길 25, 201동 1403호'],
  ['유선번호', '010-7508-7689'],
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

        {/* 사업자 정보 — 요약 1줄 상시 + 상세는 펼침(연결화면 제공 방식) */}
        <details className="group/biz text-[11px] leading-relaxed text-ink-muted">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5">
            {BIZ_SUMMARY.map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="text-ink-muted/70">{k}</span>
                <span className="text-ink-secondary">{v}</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-0.5 text-ink-muted underline decoration-border-default underline-offset-2">
              사업자 정보<span aria-hidden className="transition-transform group-open/biz:rotate-180">▾</span>
            </span>
          </summary>
          <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {BIZ_ROWS.map(([k, v]) => (
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
          <br />© {`2026`} 엔에이치홀딩스. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
