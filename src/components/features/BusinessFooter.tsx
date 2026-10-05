// src/components/features/BusinessFooter.tsx
// 전 화면 하단 상시 노출 푸터 — 사업자 정보(전자상거래법 표시의무) + 약관/정책 링크 + 사행성 배제 고지.
import { createContext, memo, useContext } from 'react';
import { onSummaryClick } from '../atoms/Fold';
import type { LegalDoc } from './LegalDocsModal';
// 약관 시행일은 src/lib/legalVersion.ts 단일 소스 — 푸터에 날짜를 박으면 개정 때 여기만 남는다.
import { LEGAL_EFFECTIVE_DATE, LEGAL_NOTICE_DATE, LEGAL_PREV_EFFECTIVE_DATE, LEGAL_PREV_ARCHIVE_URL } from '../../lib/legalVersion';

type FooterActions = { onOpenLegal?: (d: LegalDoc) => void; onOpenSupport?: () => void };
// 🔴 전면 오버레이(매장·그룹·내 정보·이벤트·Modal page 변형) 안에도 **이 푸터를 그대로** 렌더한다(2026-09-29 최종 점검 D1).
//   그 판들은 `fixed inset-0` 불투명이라 App 의 문서 끝 푸터를 완전히 덮어, 끝까지 스크롤해도 사업자 정보·19세·1336 이 없었다.
//   문구를 두 벌 만들지 않으려고 컴포넌트를 재사용하고, 약관·문의 열기 콜백은 App 이 한 번 공급한다(props 가 이긴다).
// eslint-disable-next-line react-refresh/only-export-components -- 푸터 콜백 공급용 컨텍스트, 컴포넌트와 한 몸이라 HMR 무해
export const FooterActionsContext = createContext<FooterActions>({});

// 사업자등록증(525-20-02937) 기준 — LegalDocsModal/LegalNotice 와 동일 값 유지.
// PG(포트원/다날) 입점 심사 요건(2026-08-28 거절 사유 반영): 상호·사업자번호·대표자명·
// 사업장 주소·전화번호 5항목은 푸터에 '상시 노출'이어야 한다(연결화면 방식 불인정).
// 🔴 2026-10-03 법령 원문 대조(law.go.kr): 전자상거래법 §10①1~4·6호 + 같은 법 시행령 §11의4(호스팅 제공자 상호)는
//   시행규칙 §7①에 따라 '초기 화면에 표시'해야 하고 연결 화면은 5호(이용약관)만 허용된다 → 전자우편(고객센터)·호스팅 제공자도
//   펼침이 아니라 상시 노출이다(예전엔 '추가 정보' 안에 접혀 있었다). 접는 것은 법정 표시사항이 아닌 링크·개정 안내뿐이다.
// eslint-disable-next-line react-refresh/only-export-components -- 사업자 정보 단일 소스(VerifyGateSheet 재사용), 순수 상수라 HMR 무해
export const BIZ_REQUIRED: [string, string][] = [
  ['상호', '엔에이치홀딩스'],
  ['사업자등록번호', '525-20-02937'],
  ['대표자', '김윤혜'],
  // 2026-09-29 주소 이전(오너). 옛 주소의 '201동 1403호' 는 NBSP 로 묶었었다(360·390 에서 호수만 혼자 떨어짐, 2026-09-16 실측).
  ['사업장 주소', '경기도 남양주시 다산중앙로82번안길 166-46, 207-본244호'],
  ['전화번호', '070-8098-1727'],
];
// 연령·도박문제 상담 고지 [연령, 상담 라벨, 번호] — 아래 푸터와 관전 클락(ClockDisplay) 한 줄이 같은 상수를 쓴다(문구 두 벌 금지).
//   한 줄 컴포넌트는 관전 클락(지연 청크) 쪽에 둔다 — 첫 화면 번들 예산이 여유 0% 다.
// eslint-disable-next-line react-refresh/only-export-components -- 법정 문구 단일 소스, 순수 상수라 HMR 무해
export const AGE_HELPLINE = ['만 19세 미만은 이용할 수 없습니다', '도박문제 상담', '1336(24시간·무료)'] as const;

// 메일 하단(supabase/functions/_shared/email/brand.gen.ts)도 이 두 상수와 BIZ_REQUIRED·AGE_HELPLINE 에서 생성한다 — scripts/gen-email-templates.mjs.
// eslint-disable-next-line react-refresh/only-export-components -- 사업자 부가 정보 단일 소스(메일 생성기 재사용), 순수 상수라 HMR 무해
export const BIZ_EXTRA: [string, string][] = [
  ['고객센터', 'ace@nuriholdem.com'],
  // 전자상거래법 §10 표시사항 — 호스팅 서비스 제공자
  ['호스팅 제공자', 'Vercel Inc.'],
];

// 🔴 memo — 이 푸터는 `.tab-pane` keep-alive **바깥**에 있어 앱 전역에 딱 한 번 렌더되는데,
//   App.tsx(상태 수십 개)가 재렌더될 때마다(탭 전환·모달 개폐·라이브 갱신) 매번 조정 대상이 됐다.
//   출력이 상태와 무관한데(받는 것은 안정 콜백 둘 + 모듈 상수) 계속 다시 도는 자리다.
//   ⚠ 이게 먹으려면 `onOpenLegal`/`onOpenSupport` 가 **안정 참조**여야 한다 —
//     지금은 App.tsx:1798-1799 에서 `useCallback(..., [])` 이라 충족된다.
//     나중에 누가 저걸 인라인 화살표(`onOpenLegal={(d) => ...}`)로 바꾸면 **에러 없이 조용히 무효가 된다.**
//   같은 이유로 AppHeader·MobileTabBar 는 이미 memo 다(App.tsx:230, :617). 여기만 빠져 있었다.
//   근거: docs/render-perf-checklist.md §5(무프롭 무거운 컴포넌트 → memo).
function BusinessFooter(props: FooterActions & { overlay?: boolean }) {
  const ctx = useContext(FooterActionsContext);
  const onOpenLegal = props.onOpenLegal ?? ctx.onOpenLegal;
  const onOpenSupport = props.onOpenSupport ?? ctx.onOpenSupport;
  // 아래 여백 = max(기본 탭바 예약, --footer-reserve) — 정산바처럼 탭바보다 큰 하단 고정 바가
  // 떠 있는 화면은 그 화면이 --footer-reserve 를 실측으로 채워 이 상시 고지가 가려지지 않게 한다
  // (index.css :root 주석, NuriPosLedger.tsx 설정부 — 2026-09-27, 정산바가 이 예약보다 커서 가리던 결함).
  // overlay: 전면 오버레이 안 — 그 판들은 탭바를 덮거나(z-55 이상) 탭바를 끈다(매장·그룹, App `suppressed`).
  //   문서 끝 예약(--tabbar-safe, ~108px)을 그대로 두면 판 끝에 죽은 띠가 생긴다(GroupPage 주석: 375 실측 104.83px).
  //   판 안에 하단 고정 바가 있는 도구만 --overlay-bar 로 비운다(index.css, NURI SPOT 단계 이동 바).
  return (
    <footer data-testid="business-footer" className={['mt-6 border-t border-border-subtle px-page-x pt-5', props.overlay ? 'pb-[calc(1.5rem+var(--overlay-bar,0px))]' : 'pb-[max(calc(var(--tabbar-safe)+0.5rem),var(--footer-reserve,0px))] lg:pb-[max(2rem,var(--footer-reserve,0px))]'].join(' ')}>
      {/* 블록 사이 16px 은 모바일만(정돈 지시 범위) — sm 이상은 종전 12px. PC 문서 길이가 달라지면 내 매장 판 전환 게이트의 스크롤 조건이 흔들린다. */}
      <div className="mx-auto w-full max-w-5xl space-y-3 max-sm:space-y-4">
        {/* 약관·정책 링크 — §7 P0-C(2026-09-12 실측): 11.69px 로, 이미 t-desc(12.75px)로 올라간
            사업자 정보·법정 고지보다 1.06px 작았다. 같은 '법정 고지' 역할이라 같은 토큰으로 맞춘다.
            🔴 2026-10-05 오너 "하단 푸터가 주르륵 되어 있어 모바일 정렬 다시 해 정돈해": 모바일(sm 미만)은 **2열 격자**
            (구분점 숨김 — 칸이 곧 구분이다). 종전 flex-wrap 은 390 에서 '· 고객센터 문의' 만 다음 줄에 혼자 떨어졌다. sm 이상은 종전 한 줄 + 구분점. */}
        <nav className="grid grid-cols-2 justify-items-start gap-x-4 gap-y-2 t-desc sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1.5 [&>span]:max-sm:hidden">
          {/* PG 심사 요건: '어떤 서비스를 운영하는지' 확인 가능한 소개 페이지(정적 URL) */}
          <a href="/about.html" target="_blank" rel="noopener" className="inline-flex min-w-[44px] justify-center items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">서비스 소개</a>
          <span className="text-ink-muted" aria-hidden>·</span>
          {/* 이용약관 — 전자상거래법 시행규칙 §7① 단서: 초기 화면에서 '직접' 연결돼야 한다(공정위 전자상거래 소비자보호 지침 Ⅱ.15.다). 접지 않는다. */}
          <button type="button" onClick={() => onOpenLegal?.('terms')} className="inline-flex min-w-[44px] justify-center items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">이용약관</button>
          <span className="text-ink-muted" aria-hidden>·</span>
          {/* 개인정보처리방침 — 개인정보보호법 §30② · 시행령 §31②: 홈페이지에 '지속적으로 게재'. 접지 않는다. */}
          <button type="button" onClick={() => onOpenLegal?.('privacy')} className="inline-flex min-w-[44px] justify-center items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">개인정보처리방침</button>
          <span className="text-ink-muted" aria-hidden>·</span>
          <button type="button" onClick={() => onOpenLegal?.('refund')} className="inline-flex min-w-[44px] justify-center items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">취소·환불 정책</button>
          {onOpenSupport && <>
            <span className="text-ink-muted" aria-hidden>·</span>
            <button type="button" onClick={onOpenSupport} className="inline-flex min-w-[44px] justify-center items-center py-1.5 -my-1.5 font-semibold text-accent-300/90 hover:text-accent-300">고객센터 문의</button>
          </>}
        </nav>

        {/* 사업자 정보 — PG 심사 필수 5항목 + 전자우편·호스팅 제공자(전자상거래법 §10①3·6호, 시행규칙 §7① 초기 화면) 상시 노출 */}
        {/* ⚠ §7 P1-1(2026-09-12 실측): 여기가 앱에서 **가장 작고 가장 빽빽한 블록**이었다
            (11.69px / 행간 18.99 — 권장 하한 12px 미달). 그런데 사업자 정보·1336 고지는
            **법정 상시 노출** 대상이다. 새 규격을 만들지 않고 기존 역할 토큰 `t-desc`(12.75 / 19.13)로 올린다.
            위계는 유지된다 — 본문 14.88 > 설명 12.75. */}
        {/* ⚠ §7 P0-C(2026-09-12 실측): dt 를 `text-ink-muted/70` 로 반투명 처리했더니 지면(surface-base)과
            합성된 실제 렌더 색이 라이트 2.81:1·다크 3.09:1 로 AA(4.5) 미달이었다 — 순백이 아니라 실제 지면
            기준으로 재서 드러났다. 위계(라벨 < 값)는 불투명 토큰만으로도 이미 성립한다
            (`ink-muted` rgb(92,107,138) ≠ `ink-secondary` rgb(74,88,120), 라이트 기준) — 그래서 투명도를
            걷어내고 불투명 `text-ink-muted` 그대로 둔다(재측정: 라이트 4.99:1·다크 5.28:1, AA 통과).
            `whitespace-nowrap` 은 320px 에서 "사업장 주소" 라벨이 "사업장 / 주소" 로 줄바꿈되던 것 — 값(dd)은
            그대로 여러 줄로 흘러도 되지만 라벨 자체가 쪼개지면 안 된다. */}
        {/* 2026-10-05 모바일은 **라벨 : 값 2열**(grid max-content | 1fr — 라벨 칸 폭이 가장 긴 라벨에 맞춰 값이 한 세로줄에 선다).
            div 는 모바일에서 display:contents 라 dt·dd 가 곧 격자 칸이다(dl > div 묶음 구조·e2e 판정은 그대로). sm 이상은 종전 한 줄 흐름. */}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 t-desc text-ink-muted sm:flex sm:flex-wrap sm:gap-x-3 sm:gap-y-0.5">
          {[...BIZ_REQUIRED, ...BIZ_EXTRA].map(([k, v]) => (
            <div key={k} className="contents sm:flex sm:items-start sm:gap-1">
              <dt className="shrink-0 whitespace-nowrap">{k}</dt>
              {/* 하이픈이 든 덩어리(166-46, · 207-본244호 · 전화번호)는 하이픈에서 줄바꿈되지 않게 묶는다 —
                  2026-09-29 실측: 320px 에서 '166-' / '46', 390px 에서 '207-' / '본244호' 로 끊겼다. 글자는 바꾸지 않는다. */}
              <dd className="text-ink-secondary">
                {v.split(/(\s+)/).map((t, i) => (t.includes('-') ? <span key={i} className="whitespace-nowrap">{t}</span> : t))}
              </dd>
            </div>
          ))}
        </dl>
        {/* 더보기 — 법정 '초기 화면 표시' 대상이 아닌 링크·개정 안내만 접는다(오너 2026-10-03 "필요 없는 건 접기").
            · 위치기반서비스 약관: 위치정보법 §18① 은 '이용약관 명시 + 동의'를 요구할 뿐 초기 화면 표시를 요구하지 않는다(동의는 가입·출석 동의 시트).
            · 약관 개정 안내: 공정위 전자상거래 소비자보호 지침 Ⅲ.4.가 — '초기화면 또는 초기화면과의 연결화면' 공지 허용.
            · 계정 삭제 안내: Google Play 요건은 '로그인 없이 열리는 URL'(정적 페이지)이지 푸터 상시 노출이 아니다.
            네이티브 details/summary — 키보드(Enter·Space)·스크린리더(펼침 상태)가 기본으로 된다. 펼침 상태는 기억하지 않는다(매번 접힌 채 시작). */}
        <details data-testid="footer-more" className="group/biz t-desc text-ink-muted">
          {/* ⚠ 히트영역 — 실측 19.1px 로 이 저장소가 쓰는 WCAG 2.5.8 AA(24px) 에도 못 미쳤다(2026-09-16).
              py-1.5 -my-1.5 로 **레이아웃은 그대로** 두고 세로 타깃만 31.9px 로 넓힌다(위 링크들과 같은 관용구). */}
          <summary onClick={onSummaryClick} className="inline-flex cursor-pointer list-none items-center gap-0.5 py-1.5 -my-1.5 text-ink-muted underline decoration-border-default underline-offset-2">
            더보기<span aria-hidden className="transition-transform group-open/biz:rotate-180">▾</span>
          </summary>
          <div className="mt-2.5 grid grid-cols-2 justify-items-start gap-x-4 gap-y-2 sm:mt-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1.5 [&>span]:max-sm:hidden">
            <a href="/guide/manual.html" target="_blank" rel="noopener" className="inline-flex min-w-[44px] justify-center items-center py-1.5 -my-1.5 font-semibold text-accent-300/90 hover:text-accent-300">사용설명서</a>
            <span aria-hidden>·</span>
            <button type="button" onClick={() => onOpenLegal?.('location')} className="inline-flex min-w-[44px] justify-center items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">위치기반서비스 이용약관</button>
            <span aria-hidden>·</span>
            {/* 계정 삭제 안내(공개 정적 페이지) — Google Play '계정 삭제 URL' 요건: 앱 설치·로그인 없이 열려야 한다(2026-09-25). */}
            <a href="/legal/delete-account.html" target="_blank" rel="noopener" data-testid="footer-delete-account" className="inline-flex min-w-[44px] justify-center items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">계정 삭제 안내</a>
            <span aria-hidden>·</span>
            <a href="/legal/licenses.html" target="_blank" rel="noopener" className="inline-flex min-w-[44px] justify-center items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">오픈소스 라이선스</a>
          </div>
          {/* 약관 개정 사전 고지 — 비로그인 방문자에게도 보여야 '서비스 내 공지'가 성립한다(연결화면 허용, 위 지침).
              ⚠ 날짜가 내부 공백에서 끊겨 '2026년 9월' / '29일' 로 갈라졌다(412 실측). 상수는 그대로 — textContent 불변이라 legalVersion 검사에 영향 없다. */}
          <p data-testid="footer-revision-notice" className="mt-2">약관·개인정보처리방침 개정 안내: <span className="whitespace-nowrap">{LEGAL_NOTICE_DATE}</span> 공지 · <span className="whitespace-nowrap">{LEGAL_EFFECTIVE_DATE}</span> 시행 (직전판 시행일 <span className="whitespace-nowrap">{LEGAL_PREV_EFFECTIVE_DATE}</span> · <a href={LEGAL_PREV_ARCHIVE_URL} target="_blank" rel="noopener" data-testid="footer-prev-edition" className="inline-flex min-w-[44px] justify-center items-center py-1.5 -my-1.5 font-semibold text-ink-secondary hover:text-accent-300">이전판 보기</a>)</p>
        </details>

        {/* 사행성 배제 고지 — §7 P0-C: `/80` 반투명이 라이트 3.37:1·다크 3.72:1 로 AA 미달이었다.
            위 dt 와 같은 이유로 투명도를 걷어내고 불투명 `text-ink-muted` 로 (재측정: 라이트 4.99:1·다크 5.28:1). */}
        {/* 2026-10-05 법정 고지(사행성 배제 · 만 19세 · 1336 · ©)를 모바일에서 **한 덩어리**(옅은 면 상자)로 — 앞 블록들과 구분된다(sm 이상은 종전 문단).
            상자 면은 surface-low 라 글자 대비는 지면 기준보다 오히려 높다. 문구·순서·상시 노출 그대로. */}
        <p className="t-desc text-ink-muted max-sm:rounded-input max-sm:border max-sm:border-border-strong/25 max-sm:bg-surface-low max-sm:px-3 max-sm:py-2.5">
          NURI HOLDEM은 마인드 스포츠로 불리는 홀덤의 합법적 토너먼트 정보 제공 플랫폼이며, 어떠한 형태의 도박·환전·사행행위와도 무관합니다.
          {/* ⚠ 두 번 부딪혀 가운데를 찾은 자리다.
              2026-09-16: '1336(24시간·무료)' 만 마지막 줄에 혼자 떨어져 nowrap 을 문장 전체에 걸었다.
              2026-09-18 실측: 그 nowrap 이 **345.84px 짜리 안 끊기는 토큰**이 돼 390·200% 에서
                안폭 322 를 23.84px 넘쳤다 — 문서 폭은 안 늘어 오른쪽 끝에 ')' 가 닿은 채 도달이 안 된다.
              → 문장은 끊기게 두고 **전화번호+괄호만** 묶는다. 둘을 동시에 푸는 유일한 지점이다
                (마지막 줄에 번호만 남는 것도 막고, 전체 넘침도 막는다). 법정 고지라 도달이 우선이다. */}
          {/* 2026-10-05: 두 고지를 각각 안 끊기는 묶음으로 — 접히면 '·' 뒤에서만 접힌다(종전 390 에서 '도박문제 / 상담 1336' 으로 갈라졌다). 굵기로 한 줄 위계를 준다. */}
          {/* block: 두 줄로 접혀도 고지 칸 전체가 하나의 상자다 — 인라인이면 두 줄 사이 행간 틈이 '고지 위 다른 것' 으로 잡혔다(e2e legal-overlay 360 의 elementFromPoint).
              앞뒤 <br/> 대신 block 이 줄을 나눈다(© 는 이어서 p 의 직속 글자 노드로 남는다 — 마지막 줄 판정이 그 노드를 잰다). */}
          <span className="block font-semibold text-ink-secondary max-sm:my-1"><span className="whitespace-nowrap">{AGE_HELPLINE[0]}</span> · <span className="whitespace-nowrap">{AGE_HELPLINE[1]} {AGE_HELPLINE[2]}</span></span>
          © {`2026`} 엔에이치홀딩스. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default memo(BusinessFooter);
