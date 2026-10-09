// src/components/features/LegalDocsModal.tsx
// 하단 푸터의 '약관 및 정책' 창 — 이용약관 / 개인정보처리방침 / 위치기반서비스 이용약관 / 취소·환불 정책.
//
// 🔴 2026-10-06 약관 전수 재검토 P1-1(review.md): 예전엔 이 파일에 이용약관(11조)·처리방침·환불 정책 본문을 **손으로 따로** 써 두어,
//   가입 때 동의한 16조 약관·처리방침(src/pages/legal/*.tsx)과 다른 문서를 푸터(법정 '초기 화면' 링크)가 보여 주고 있었다
//   (조문 번호·매장 제공 여부·환불 대상까지 달랐다). 이제 세 탭은 **동의 화면·공개 주소(/legal/*.html)와 같은 컴포넌트**를 그린다 —
//   텍스트 원본은 src/pages/legal/ 하나뿐이다. 이 파일에 약관·처리방침·환불 문장을 다시 쓰지 마라(legalConsistency.test 가 잠근다).
//   위치기반서비스 이용약관만 원본이 여기(LOCATION)에 있고, 공개 주소 /legal/location.html 은 그 문자열을 그대로 찍는다(2026-10-08).
// 시행일은 src/lib/legalVersion.ts · src/lib/locationTerms.ts 가 단일 소스다 — 이 파일에 날짜를 박지 않는다.
import { useState } from 'react';
import Modal from '../atoms/Modal';
import { LEGAL_PREV_EFFECTIVE_DATE } from '../../lib/legalVersion';
import UnderlineTabs from '../atoms/UnderlineTabs';
import { goSubTab } from '../../lib/subTabTransition';
import {
  LOCATION_TERMS_VERSION, LOCATION_TERMS_EFFECTIVE, LOCATION_TERMS_NOTICE, LOCATION_TERMS_PREV_EFFECTIVE,
  LOCATION_TERMS_PREV_ARCHIVE_URL, LOCATION_OFFICER, CHECKIN_ALT_PATH, CHECKIN_SCOPE, CONSENT_NATURE,
  LOCATION_TERMS_EFFECTIVE_KO, isGeoRequiredNow,
} from '../../lib/locationTerms';
import { LBS_REPORT_LABEL, LBS_REPORT_VALUE, LBS_REPORT_ADDED } from '../../lib/lbsReport';
import TermsOfService from '../../pages/legal/TermsOfService';
import PrivacyPolicy from '../../pages/legal/PrivacyPolicy';
import RefundPolicy from '../../pages/legal/RefundPolicy';

export type LegalDoc = 'terms' | 'privacy' | 'location' | 'refund';

// ── 사업자 정보(사업자등록증 기준) — 위치기반서비스 이용약관 제2조(위치정보법 제19조①1호)가 쓴다 ──────────
const BIZ = {
  service: 'NURI HOLDEM',
  company: '엔에이치홀딩스',
  ceo: '김윤혜',
  addr: '경기도 남양주시 다산중앙로82번안길 166-46, 207-본244호(다산동, 파인듀파크빌딩)',
  phone: '070-8098-1727',
  email: 'ace@nuriholdem.com',
  /** 위치정보관리책임자(위치정보법 시행령 제20조제1항제1호) — 값은 lib/locationTerms.ts LOCATION_OFFICER 한 곳(처리방침과 같은 값). */
  locationOfficer: LOCATION_OFFICER.name,
  locationOfficerContact: LOCATION_OFFICER.contact,
  locationOfficerPhone: LOCATION_OFFICER.phone,
};

// 공개 정적 페이지(/legal/location.html — src/pages/legal/LocationTerms.tsx)가 이 문자열을 그대로 그린다(텍스트 원본 1개).
export const LOCATION = `제1조(목적)
이 약관은 ${BIZ.service}(이하 "회사")가 제공하는 위치기반서비스와 관련하여 회사와 개인위치정보주체(이하 "이용자")의 권리·의무 및 책임사항, 그 밖에 필요한 사항을 규정합니다.

제2조(사업자 정보)
상호 ${BIZ.company} · 대표 ${BIZ.ceo} · 주소 ${BIZ.addr} · 전화 ${BIZ.phone} · 이메일 ${BIZ.email}
${LBS_REPORT_LABEL}: ${LBS_REPORT_VALUE}

제3조(서비스 내용)
1. 장소 정보: 매장(홀덤펍)·대회 일정의 등록 위치(지역·주소)와 길찾기 연결을 제공합니다. 이 위치는 매장 운영자가 등록한 사업장 위치이며 이용자의 개인위치정보가 아닙니다.
2. 가까운 순 정렬: 이용자가 목록에서 '가까운 순'을 고르면 단말의 위치 권한으로 현재 위치를 받아 이용자의 단말 안에서만 매장까지의 거리를 계산해 정렬합니다. 이 위치는 회사 서버로 전송되지 않으며 별도로 저장되지 않습니다.
3. 출석 위치 확인(${CONSENT_NATURE}): 매장이 '위치 확인 출석'을 켠 경우에 한하여, 이용자가 별도로 동의하면 그 매장에서 출석할 때(QR 스캔·매장 페이지 출석 버튼·앱 카메라) 한 번 단말의 현재 위치(위도·경도·측위 오차)를 회사 서버로 전송하여 해당 매장의 등록 위치에서 반경 300미터(측위 오차는 최대 200미터까지 보정) 안에 있는지만 판정하고, 그 결과를 출석 처리에만 사용합니다. 측위 오차가 1킬로미터를 넘으면 판정하지 않습니다. 매장이 이 기능을 켜지 않았으면 위치를 받지 않습니다. 회사는 이 기능을 처음 시작할 때 서비스 내 공지로 알립니다.
4. 회사는 이용자의 실시간 개인위치정보를 상시 수집·보관하지 않습니다. 위치를 추적하거나 이동 경로를 수집하지 않으며, 위치정보를 광고에 이용하지 않습니다.
5. 위치 확인 출석을 켠 매장에서는 ${LOCATION_TERMS_EFFECTIVE}부터 이용자가 제3항의 동의를 하지 않거나 단말에서 현재 위치를 확인할 수 없으면 ${CHECKIN_SCOPE}이 처리되지 않습니다. 이 경우에도 ${CHECKIN_ALT_PATH}. 업주가 승인한 출석은 이용자가 직접 한 출석과 같은 혜택(활동 점수·연속 출석·방문 기록·이벤트 참여)을 받습니다. 동의하지 않았다는 이유로 그 밖의 서비스 이용을 제한하지 않습니다.

제4조(개인위치정보의 보유목적 및 보유기간)
1. 보유목적: 제3조제3항의 출석 반경 판정.
2. 보유기간: 회사는 전송받은 좌표를 저장하지 않으며 판정이 끝나는 즉시 파기합니다(「위치정보의 보호 및 이용 등에 관한 법률」 제23조).

제5조(위치정보 이용·제공사실 확인자료의 보유근거 및 보유기간)
1. 보유근거: 「위치정보의 보호 및 이용 등에 관한 법률」 제16조제2항, 「위치정보의 관리적·기술적 보호조치 기준」 제6조.
2. 기록 항목(같은 법 제2조제5호): 이용·제공 일시, 이용·제공 방법(서버에서 매장 반경 판정 후 좌표 즉시 파기 — 이용 목적인 출석 위치 확인을 함께 나타냅니다), 취득 경로(단말 위치), 제공받는 자(없음)와 이용자의 확인자료 열람 사실. 좌표 등 위치정보 자체와 방문 매장은 기록하지 않습니다. 위치를 받지 않은 출석(동의하지 않았거나 위치를 확인하지 못한 경우)은 위치를 이용하지 않았으므로 기록하지 않습니다.
3. 보유기간: 기록일부터 6개월이 지나면 자동으로 파기합니다. 다만 이용자가 동의를 철회하거나 회원을 탈퇴하면 지체 없이 파기합니다(같은 법 제24조제4항).

제6조(개인위치정보의 제3자 제공)
1. 회사는 이용자의 개인위치정보를 제3자에게 제공하지 않습니다. 매장에도 좌표·거리를 제공하지 않으며, 매장에는 출석 여부만 표시됩니다.
2. 앞으로 제공이 필요해지면 제공받는 자와 제공목적을 미리 알리고 별도의 동의를 받으며, 제공할 때마다 제공받는 자·제공일시·제공목적을 이용자에게 즉시 통보합니다(같은 법 제19조제2항·제3항).

제7조(동의와 이용자의 권리 및 행사방법)
1. 출석 위치 확인에 대한 동의는 ${CONSENT_NATURE}이며, 다른 동의와 따로 받습니다. 동의하지 않아도 서비스 이용에 제한이 없습니다. 다만 위치 확인 출석을 켠 매장에서는 ${LOCATION_TERMS_EFFECTIVE}부터 동의하지 않으면 ${CHECKIN_SCOPE}이 처리되지 않으며, ${CHECKIN_ALT_PATH}(제3조제5항).
2. 이용자는 언제든지 동의의 전부 또는 일부를 철회하거나 개인위치정보의 수집·이용의 일시적인 중지를 요구할 수 있습니다(같은 법 제24조제1항·제2항).
3. 이용자는 본인의 위치정보 이용·제공사실 확인자료의 열람 또는 고지를 요구할 수 있고, 오류가 있으면 정정을 요구할 수 있습니다. 회사는 정당한 사유 없이 거절하지 않습니다(같은 법 제24조제3항).
4. 행사방법: 서비스의 '내 정보 › 보안 › 위치정보 이용 동의'에서 동의·철회와 이용 내역 확인을 바로 할 수 있으며, 이메일(${BIZ.email})로도 요청할 수 있습니다. 이메일 요청은 지체 없이 처리합니다.
5. 이용자는 단말기 설정에서 위치 권한을 언제든지 허용·차단할 수 있습니다.

제8조(만 14세 미만 아동의 보호)
본 서비스는 만 19세 미만의 이용이 제한되므로 회사는 만 14세 미만 아동의 개인위치정보를 수집·이용·제공하지 않습니다.

제9조(위치정보관리책임자)
회사는 위치정보를 보호하고 관련 불만을 처리하기 위하여 아래와 같이 위치정보관리책임자를 지정합니다.
- 위치정보관리책임자: ${BIZ.locationOfficer}
- 연락처: ${BIZ.locationOfficerContact} · 전화 ${BIZ.locationOfficerPhone}

제10조(손해배상)
이용자는 회사가 「위치정보의 보호 및 이용 등에 관한 법률」 제15조부터 제26조까지의 규정을 위반하여 손해를 입은 경우 손해배상을 청구할 수 있으며, 회사는 고의 또는 과실이 없음을 입증하지 못하면 책임을 면하지 못합니다(같은 법 제27조). 매장이 등록한 위치 정보의 오류, 천재지변 등 회사의 고의·과실이 없는 사유로 인한 손해는 그러하지 아니합니다.

제11조(분쟁의 조정)
위치정보와 관련한 분쟁에 대하여 당사자 간 협의가 이루어지지 않거나 협의할 수 없는 경우, 회사는 방송미디어통신위원회에 재정을 신청할 수 있고, 회사와 이용자는 「개인정보 보호법」 제40조에 따른 개인정보분쟁조정위원회에 조정을 신청할 수 있습니다(같은 법 제28조).

부칙 및 개정 이력
1. 제1판은 ${LEGAL_PREV_EFFECTIVE_DATE}부터 시행되었습니다.
2. 제2판은 ${LOCATION_TERMS_PREV_EFFECTIVE}부터 시행되었으며, 제${LOCATION_TERMS_VERSION}판 시행일 전까지 적용됩니다. 제2판 원문: https://nuriholdem.com${LOCATION_TERMS_PREV_ARCHIVE_URL}
   - 제2판 개정 이유: 실제로 제공하거나 제공을 준비 중인 위치 기능(가까운 순 정렬, 출석 위치 확인)을 약관에 빠짐없이 적고, 같은 법 제19조제1항이 정한 사항(보유목적·보유기간, 확인자료의 보유근거·보유기간, 권리와 행사방법, 사업자 연락처)을 명시하기 위함이었습니다(같은 법 제12조제1항).
   - 제2판 개정 내용: 제2조(사업자 정보)·제4조·제5조·제6조·제8조·제9조를 신설하고, 제3조에 가까운 순 정렬과 출석 위치 확인을 추가했으며, 제7조에 동의 철회·일시 중지·열람의 행사방법을 적고, 제11조의 분쟁조정 기관을 개정 법률에 따라 방송미디어통신위원회로 바로잡았습니다.
   - 2026-09-30: 제9조의 위치정보관리책임자를 지정했습니다(김윤혜, 대표). 이용자에게 불리한 내용이 없어 지정한 날부터 바로 적용했습니다.
   - ${LBS_REPORT_ADDED}: 제2조의 사업자 정보에 위치기반서비스사업 신고 ${LBS_REPORT_VALUE}를 추가했습니다. 이미 수리된 신고 사실을 적은 것으로 이용자에게 불리한 내용이 없어 적은 날부터 바로 적용했습니다.
3. 제${LOCATION_TERMS_VERSION}판은 ${LOCATION_TERMS_NOTICE}에 공지하여 ${LOCATION_TERMS_EFFECTIVE}부터 시행합니다.
4. 제${LOCATION_TERMS_VERSION}판 개정 이유: 매장 출석 QR은 주소만 알면 매장 밖에서도 열 수 있어, 매장이 원하면 실제로 매장 안에 있는 이용자만 QR로 출석하도록 하기 위함입니다(같은 법 제12조제1항에 따른 변경 이유 공개).
5. 제${LOCATION_TERMS_VERSION}판 개정 내용: 제3조제3항의 출석 위치 확인을 매장이 '위치 확인 출석'을 켠 경우로 한정하고, 제3조제5항을 신설하여 그 매장에서 동의하지 않거나 위치를 확인할 수 없으면 그 매장의 출석(QR 스캔·매장 페이지 출석 버튼·앱 카메라)이 처리되지 않는다는 점과, 매장에서 출석 요청을 보내 업주 승인으로 같은 혜택의 출석을 하는 대체 경로를 적었습니다. 제5조제2항의 기록 항목을 같은 법 제2조제5호의 용어(이용·제공 일시·방법, 취득 경로, 제공받는 자)로 바로잡고, 제7조제1항에 동의하지 않을 때의 효과를 적었으며, 제9조에 위치정보관리책임자의 연락처(전자우편·사업자 대표 전화)를 따로 적었습니다.
6. 제${LOCATION_TERMS_VERSION}판은 ${LOCATION_TERMS_EFFECTIVE} 정식 오픈과 함께 시행합니다. 이미 제2판에 동의한 이용자에게는 위치 확인 출석 매장에서 다음 출석 때 제${LOCATION_TERMS_VERSION}판 동의를 다시 여쭙니다. 출석 위치 확인은 이 약관을 알린 뒤 이용자의 별도 동의를 받아서만 이용합니다.

시행일: ${LOCATION_TERMS_EFFECTIVE}`;

/** 제3판 시행 전 배너(L5) — 현재 적용되는 판은 제2판이다. */
const LOCATION_PENDING_BANNER = `[현재 적용: 제2판 — 원문 https://nuriholdem.com${LOCATION_TERMS_PREV_ARCHIVE_URL}]
아래는 ${LOCATION_TERMS_NOTICE}에 공지한 제${LOCATION_TERMS_VERSION}판이며 ${LOCATION_TERMS_EFFECTIVE_KO}부터 시행할 예정입니다.`;

/** 탭 라벨 — 진열 순서가 하위 탭 전환 방향(forward/back) 기준이다. */
const LABELS: Record<LegalDoc, string> = {
  terms:    '이용약관',
  privacy:  '개인정보처리방침',
  location: '위치기반서비스',
  refund:   '취소·환불 정책',
};

/** P1-1 — 동의 화면·공개 주소와 **같은 컴포넌트**(텍스트 원본 1개). 위치기반만 아래 LOCATION 문자열. */
const DOC_VIEW: Record<Exclude<LegalDoc, 'location'>, () => React.JSX.Element> = {
  terms: TermsOfService,
  privacy: PrivacyPolicy,
  refund: RefundPolicy,
};

export default function LegalDocsModal({
  open, onClose, initial = 'terms',
}: { open: boolean; onClose: () => void; initial?: LegalDoc }) {
  const [tab, setTab] = useState<LegalDoc>(initial);
  // critical L5 — 제3판 시행일 전에는 맨 위에 "현재 적용: 제2판" 을 먼저 말한다(시행 전 판을 현재 판처럼 보이게 하지 않는다).
  const body = tab === 'location' && !isGeoRequiredNow() ? `${LOCATION_PENDING_BANNER}\n\n${LOCATION}` : LOCATION;
  const order = Object.keys(LABELS) as LegalDoc[];
  const View = tab === 'location' ? null : DOC_VIEW[tab];
  return (
    <Modal open={open} onClose={onClose} title="약관 및 정책" maxWidth="md" variant="sheet" dragToClose>
      <div data-legal-tabbar="">
        <UnderlineTabs
          items={order.map((k) => ({ key: k, label: LABELS[k] }))}
          value={tab} onChange={(v) => goSubTab('legal-tab', order, tab, v, () => setTab(v))} size="sm" />
      </div>
      <div data-legal-panel="" data-legal-doc={tab} className={['max-h-[65vh] overflow-y-auto', View ? '' : 'p-4'].join(' ')}>
        {View ? <View /> : <p className="whitespace-pre-wrap text-2xs leading-relaxed text-ink-secondary">{body}</p>}
      </div>
    </Modal>
  );
}
