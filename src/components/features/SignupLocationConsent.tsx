// src/components/features/SignupLocationConsent.tsx — 가입 때 받는 '위치정보 이용 동의(선택)' 한 칸(2026-09-27 오너 요청 4).
//
// 쓰는 곳: AuthModal(이메일 가입 — 일반·업주) · ConsentGateModal(구글 등 소셜 가입의 첫 동의). 두 가입 경로가 같은 칸·같은 문구다.
// 법(위치정보법 제15조① 동의 없는 수집 금지 · 제18조① 약관 명시 후 동의): 필수 동의와 **분리된 별도 체크**이고 '전체 동의'에 묶지 않는다
//   (선택 동의를 필수처럼 한 번에 받지 않는다). 체크하지 않아도 가입·이용은 그대로 된다. 약관 전문은 같은 칸에서 연다.
// 저장: 호출부가 가입(세션) 뒤 lib/locationConsent 의 rememberSignupLocationConsent/flushSignupLocationConsent 또는
//   saveLocationConsent(set_my_location_consent RPC, 현재 판 = lib/locationTerms)로 적는다. 이 칸은 체크 상태만 갖는다.
// 문구는 기존 화면과 같은 사실만 말한다 — 가까운 순은 라이브 탭 안내(live-distance-local-note), 출석 위치 확인은 출석 시트(LocationConsentSheet)와 같다.
import { lazy, Suspense, useState } from 'react';
import Icon from '../atoms/Icon';
import { CHECKIN_ALT_PATH, CONSENT_NATURE, LOCATION_TERMS_EFFECTIVE_KO } from '../../lib/locationTerms';

const LegalDocsModal = lazy(() => import('./LegalDocsModal'));

export default function SignupLocationConsent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const [terms, setTerms] = useState(false);
  return (
    <div data-testid="signup-location-consent" className="space-y-2 rounded-input border border-border-subtle bg-surface-high px-2.5 py-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-primary">
        <Icon name="map-pin" size={14} className="shrink-0 text-accent-300" />주변 매장을 찾으려면 위치정보가 필요합니다
      </p>
      <ul className="space-y-1 text-2xs leading-relaxed text-ink-muted">
        <li>· 가까운 순: 위치는 이 기기에서 거리 계산에만 쓰고 저장·전송하지 않습니다</li>
        <li>· 출석 위치 확인: 위치 확인 출석을 켠 매장에서 출석할 때 한 번 매장 반경 안인지만 판정하고, 좌표는 저장하지 않습니다</li>
        <li>· {CONSENT_NATURE}. 동의하지 않아도 가입·이용할 수 있고, {LOCATION_TERMS_EFFECTIVE_KO}부터 위치 확인 출석 매장의 QR 출석에는 동의가 필요하지만, 동의하지 않아도 {CHECKIN_ALT_PATH}. 내 정보 › 보안에서 언제든 바꿀 수 있습니다</li>
      </ul>
      <div className="flex items-start justify-between gap-2">
        {/* py-3 -my-3: 누름 높이만 46px 로 넓히고 레이아웃은 그대로(2026-09-29 D4 — 가입 동의 행과 같은 44px). 위는 설명 글, 아래는 상자 여백이라 겹칠 조작이 없다. */}
        {/* min-h-[44px]: 루트 16px(2026-10-04)에서 한 줄 행은 19.5 + 24 = 43.5 라 44 아래였다(1280 실측) — 하한을 픽셀로 박는다. */}
        <label className="flex min-h-[44px] items-start gap-2 cursor-pointer py-3 -my-3">
          <input type="checkbox" data-testid="signup-location-check" checked={checked} onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 accent-accent-300 shrink-0" />
          <span className="text-xs text-ink-secondary leading-relaxed select-none">
            <span className="text-ink-muted mr-1">[선택]</span>위치기반서비스 이용약관에 동의합니다. (위치정보법 §18)
          </span>
        </label>
        <button type="button" data-testid="signup-location-terms" onClick={() => setTerms(true)}
          className="shrink-0 py-3 -my-3 text-2xs text-accent-300 hover:text-accent-200 underline decoration-dotted underline-offset-2 transition-colors">
          전문 보기
        </button>
      </div>
      {terms && <Suspense fallback={null}><LegalDocsModal open onClose={() => setTerms(false)} initial="location" /></Suspense>}
    </div>
  );
}
