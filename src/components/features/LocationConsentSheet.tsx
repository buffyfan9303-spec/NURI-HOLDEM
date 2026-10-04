// src/components/features/LocationConsentSheet.tsx — 출석 위치 확인 '위치정보 이용 동의'(선택) 시트.
//
// 누가 띄우나: src/lib/locationConsent.ts askLocationConsent() — 출석(checkIn)이 좌표를 보내기 전 한 번(별도 루트에 마운트).
// 왜 App 에 붙이지 않고 스스로 마운트하나: 출석 경로가 3곳(App runCheckin · MyVoucherSheet · VenuePage)이고
//   모두 checkIn() 한 함수로 모인다. 거기서 Promise 로 답을 받으려면 시트가 호출부와 독립이어야 한다.
//   Modal 은 컨텍스트 의존이 없어(토큰은 :root CSS 변수) 별도 루트에서 그대로 그려진다.
// 적는 내용은 위치정보법 제19조① 각 호(서비스 내용·보유목적·보유기간·확인자료·권리)를 짧게 — 전문은 약관 보기.
// 동의는 계속 '선택'·분리 동의다(제19조⑤). 20261004d 부터 위치 확인 출석 매장에서는 거절하면 그 매장 QR 출석이 안 되므로
//   거절의 효과와 대체 경로(직원·참가 신청)를 시트에 적는다(오너 결정 (다)-(a)(b)). 다른 기능은 막지 않는다.
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import LegalDocsModal from './LegalDocsModal';
import { BIZ_REQUIRED } from './BusinessFooter';
import { otherGateOpen } from '../../lib/locationConsent';
import { CHECKIN_ALT_PATH, CHECKIN_SCOPE, CONSENT_NATURE, LOCATION_TERMS_EFFECTIVE_KO, LOCATION_TERMS_VERSION } from '../../lib/locationTerms';

// 위치기반서비스 이용약관 제3판(제3조·제5조·제7조)과 같은 사실만 짧게. 판이 바뀌면 이 목록도 같은 커밋에서 맞춘다.
const POINTS: string[] = [
  '위치 확인 출석을 켠 매장에서 출석할 때 한 번, 휴대폰 위치(위도·경도·오차)를 받습니다',
  '매장 등록 위치에서 반경 안(300m, 오차 최대 200m 보정)인지만 판정합니다',
  '좌표는 저장하지 않고 판정 직후 파기합니다. 매장을 포함해 누구에게도 제공하지 않습니다',
  '이용 사실(일시·방법·취득 경로)만 기록해 6개월 보관 후 파기합니다',
  `동의하지 않아도 다른 이용에는 제한이 없습니다. 다만 ${LOCATION_TERMS_EFFECTIVE_KO}부터 위치 확인 출석 매장에서는 동의하지 않으면 ${CHECKIN_SCOPE}이 되지 않으며, ${CHECKIN_ALT_PATH}`,
  '내 정보 › 보안에서 언제든 철회하고 이용 내역을 볼 수 있습니다',
];

/** required — 시행일 뒤 위치 확인 출석 매장(서버가 동의 없이는 거부한다). '동의하지 않음'은 출석으로 이어지지 않으므로 그렇게 말한다. */
export default function LocationConsentSheetView({ onChoose, required = false }: { onChoose: (v: boolean | null) => void; required?: boolean }) {
  const [open, setOpen] = useState(true);
  const [terms, setTerms] = useState(false);
  // 다른 게이트가 있는 동안은 이 시트를 내려 둔다 — 순서가 어느 쪽이든(로그인이 먼저든 나중이든) 두 시트가 한 프레임에 같이 보이지 않는다.
  const [blocked, setBlocked] = useState(() => otherGateOpen());
  useEffect(() => {
    const sync = () => setBlocked(otherGateOpen());
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    sync();
    return () => mo.disconnect();
  }, []);
  const choose = (v: boolean | null) => { setOpen(false); onChoose(v); };
  return (
    <>
      {/* 약관 창(z-60)이 이 게이트 시트(z-65) 아래 깔리지 않게, 약관을 여는 동안은 시트를 잠시 내린다 */}
      <Modal open={open && !terms && !blocked} onClose={() => choose(null)} variant="sheet" maxWidth="sm" title="출석 위치 확인 동의(선택)" layer="gate">
        <div data-testid="location-consent-sheet" className="space-y-4 px-4 pb-5 pt-1">
          <div className="flex items-center gap-3 pt-1">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-300/12 text-accent-300"><Icon name="map-pin" size={22} /></div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink-primary">매장 안에 있는지 위치로 확인해 출석을 처리하시겠습니까?</p>
              <p data-testid="location-consent-nature" className="mt-0.5 text-2xs text-ink-muted">{CONSENT_NATURE}</p>
            </div>
          </div>
          {required && (
            <p data-testid="location-consent-required" className="rounded-input border border-accent-300/30 bg-accent-300/8 px-3 py-2 text-xs leading-relaxed text-ink-primary">
              이 매장은 위치 확인 출석 매장입니다. 동의하지 않으면 {CHECKIN_SCOPE.replace('그 매장', '이 매장')}이 되지 않습니다. {CHECKIN_ALT_PATH}.
            </p>
          )}
          <ul className="space-y-1.5">
            {POINTS.map((t) => (
              <li key={t} className="flex gap-2 text-xs leading-relaxed text-ink-secondary">
                <Icon name="check" size={14} className="mt-0.5 shrink-0 text-accent-300" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <button type="button" data-testid="location-consent-terms" onClick={() => setTerms(true)}
            className="min-h-[44px] text-xs font-semibold text-accent-300 underline underline-offset-2">{`위치기반서비스 이용약관(제${LOCATION_TERMS_VERSION}판) 전문 보기`}</button>
          <div className="space-y-2">
            <button type="button" data-testid="location-consent-agree" onClick={() => choose(true)} className="btn-primary min-h-[44px] w-full py-3 text-sm">동의하고 출석</button>
            <button type="button" data-testid="location-consent-decline" onClick={() => choose(false)} className="btn-ghost min-h-[44px] w-full py-2.5 text-xs">{required ? '동의하지 않음' : '동의하지 않고 출석'}</button>
          </div>
          <p className="border-t border-border-subtle pt-2 text-center text-[10px] leading-relaxed text-ink-muted/80">
            {BIZ_REQUIRED.map(([k, v]) => `${k} ${v}`).join(' · ')}
          </p>
        </div>
      </Modal>
      {terms && <LegalDocsModal open onClose={() => setTerms(false)} initial="location" />}
    </>
  );
}
