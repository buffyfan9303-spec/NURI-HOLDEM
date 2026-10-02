// src/pages/legal/RevisionBlocks.tsx
// 약관 4문서가 공유하는 '개정 안내' 박스와 '부칙 — 개정 이력' 절.
//
// 왜 공용 컴포넌트인가: 개정 이력은 4문서에 똑같은 형식으로 들어가야 하고, 문서마다 손으로 적으면
// 다음 개정에서 어긋난다(시행일이 6곳에서 어긋나 있던 것이 정확히 그 사고였다).
// 텍스트의 실체는 src/lib/legalVersion.ts 한 곳이고, 여기는 그것을 그리기만 한다.
//
// ⚠ 이 마크업은 scripts/gen-legal.mjs 가 SSR 로 찍어 /legal/*.html 에도 그대로 나간다.
//   정적 페이지의 class 치환(reclass)이 살려 두는 것은 box / b / mute / hl / warn / center 뿐이다.
//   그래서 상자는 `rounded-input` + `bg-`(→ box), 강조는 `font-bold`(→ b), 보조문은 `text-ink-muted`(→ mute)로만 쓴다.
// ⚠ §28 — 이 파일의 문구에는 '환전·현금·수익' 계열 단어를 쓰지 않는다.
//   마케팅 문서(선택 동의) 본문에 그 단어가 들어가면 legalStaticConsistency 게이트가 막는다.
import { LEGAL_EFFECTIVE_DATE, LEGAL_NOTICE_DATE, LEGAL_PREV_EFFECTIVE_DATE, LEGAL_PREV_ARCHIVE_URL } from '../../lib/legalVersion';
import { LEGAL_HISTORY, type LegalDocKey } from '../../lib/legalHistory';

/** 문서 상단 — 이 문서가 언제부터 시행 중인 판인지, 언제 공지했는지, 직전판은 언제까지 적용됐는지 밝힌다.
 *  2026-10-03: 시행일이 지나 '시행 예정' 문구를 현재형으로 바꿨다. 이력(공지일·시행일·직전판 시행일)은 그대로 남긴다.
 *  `firstEdition` — 직전판이 없는 제정 문서(마케팅 수신 동의)는 직전판 문장을 빼야 오인 소지가 없다. */
export function RevisionNotice({ firstEdition = false }: { firstEdition?: boolean }) {
  return (
    <div data-testid="revision-notice" className="mb-5 p-3 rounded-input bg-surface-high border border-border-default space-y-1">
      <p className="text-xs font-bold text-ink-primary">
        {firstEdition
          ? `개정 안내 — 본 문서는 ${LEGAL_EFFECTIVE_DATE}부터 시행 중입니다.`
          : `개정 안내 — 본 문서는 ${LEGAL_EFFECTIVE_DATE}부터 시행 중인 개정판입니다.`}
      </p>
      <p className="text-2xs text-ink-muted leading-relaxed">
        개정 공지일 {LEGAL_NOTICE_DATE} · 시행일 {LEGAL_EFFECTIVE_DATE}
        {firstEdition ? '' : ` · 직전판(${LEGAL_PREV_EFFECTIVE_DATE} 시행)은 시행일 전까지 적용되었습니다`}
        {firstEdition ? null : <> (<a href={LEGAL_PREV_ARCHIVE_URL} target="_blank" rel="noopener" data-testid="prev-edition-link">이전판 보기</a>)</>}.
        이번 개정에는 회원에게 불리한 변경이 포함된 문서가 있어, 4개 문서 전부를 적용일 30일 전에 공지하였습니다. 변경된 내용은 문서 끝의
        「부칙 — 개정 이력」에서 확인하실 수 있으며, 개정 내용에 동의하지 않으시는 회원은 「내 정보 → 보안 → 회원 탈퇴하기」에서
        언제든지 이용계약을 해지하실 수 있습니다.
      </p>
    </div>
  );
}

/** 문서 하단 — 무엇이 언제 바뀌었는지. 분쟁 시 "그때 어떤 내용이었나"의 1차 자료가 된다. */
export function RevisionHistory({ doc }: { doc: LegalDocKey }) {
  const rows = LEGAL_HISTORY[doc];
  return (
    <section className="mb-5">
      <h3 className="text-sm font-bold text-accent-300 mb-2">부칙 · 개정 이력</h3>
      <div className="space-y-3 text-xs text-ink-secondary leading-relaxed">
        {rows.map((r) => (
          <div key={r.version} className="p-3 rounded-input bg-surface-high border border-border-default space-y-1">
            <p className="text-xs font-bold text-ink-primary">
              제{r.version}판 · 시행일 {r.effective}
              {r.notice !== r.effective ? ` · 공지일 ${r.notice}` : ''}
            </p>
            <ol className="list-none space-y-1 pl-1">
              {r.changes.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 text-ink-muted">{i + 1}.</span>
                  <span className="flex-1">{c}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
