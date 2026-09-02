// src/lib/legalHistory.ts — 문서별 개정 이력(무엇이 언제 바뀌었는지).
//
// 왜 legalVersion.ts 에서 분리했나: 이력 문자열은 약관 화면(지연 로드되는 AuthModal 청크)에서만 쓰는데,
// 같은 모듈에 두면 ConsentGateModal·api/auth 가 참조하는 legalVersion 이 공통 청크로 끌려 올라가면서
// 이력 본문까지 **첫 화면 임계 경로**에 실린다(실측 +3.0KB gz). 버전·시행일(작다)과 이력(크다)을 분리한다.
import { LEGAL_EFFECTIVE_DATE, LEGAL_NOTICE_DATE, LEGAL_PREV_EFFECTIVE_DATE } from './legalVersion';
export type LegalDocKey = 'terms' | 'privacy' | 'anti-gambling' | 'marketing';

export interface LegalRevision {
  version: number;
  /** 시행일(표기용) */
  effective: string;
  /** 공지일(표기용). 제정판은 시행일과 같다. */
  notice: string;
  /** 무엇이 바뀌었는지 — 조문 단위로 적는다. "문구 수정" 같은 뭉뚱그린 표현은 이력의 값을 없앤다. */
  changes: string[];
}

/** 문서별 개정 이력 — 최신이 위. 각 문서의 '부칙' 절이 이 데이터를 그대로 렌더한다. */
export const LEGAL_HISTORY: Record<LegalDocKey, LegalRevision[]> = {
  terms: [
    {
      version: 2, effective: LEGAL_EFFECTIVE_DATE, notice: LEGAL_NOTICE_DATE,
      changes: [
        '제8조부터 제16조까지를 신설했습니다. 회사의 지위(정보 제공 플랫폼 및 통신판매중개자)와 책임 주체의 분리, 도박·사행행위와의 단절 확인, 활동점수·매장 이용권의 비금전성, 게시물의 권리와 서비스 내 이용허락, 알림의 수신과 광고성 정보의 구분, 연락처의 이용 목적과 매장 제공, 손해배상 및 책임의 제한, 위반에 대한 제재 및 회사의 손해배상청구, 약관의 효력·변경과 분쟁 해결에 관한 내용입니다.',
        '제1조부터 제7조까지는 취지와 조문 번호를 그대로 두고 문언만 보강했습니다.',
        '제14조(손해배상 및 책임의 제한)와 제15조(위반에 대한 제재 및 회사의 손해배상청구)는 회원에게 불리한 변경에 해당하므로 적용일 30일 전에 공지했습니다.',
        '약관 전문을 공개 주소(/legal/terms.html)에서도 열람할 수 있도록 게시했습니다.',
      ],
    },
    { version: 1, effective: LEGAL_PREV_EFFECTIVE_DATE, notice: LEGAL_PREV_EFFECTIVE_DATE, changes: ['제정(제1조~제7조).'] },
  ],
  privacy: [
    {
      version: 2, effective: LEGAL_EFFECTIVE_DATE, notice: LEGAL_NOTICE_DATE,
      changes: [
        '제8조부터 제14조까지를 신설했습니다. 동의의 구분과 동의를 거부할 권리, 개인정보의 제3자 제공, 자동 수집 장치의 설치·운영 및 거부, 안전성 확보 조치, 만 19세 미만 이용 제한, 권익침해에 대한 구제방법, 처리방침의 변경에 관한 내용입니다.',
        '제6조(처리 위탁 및 국외 이전)에 국외 이전 대상 5개사(Vercel·Cloudflare·Sentry·Resend·Google)의 이전 항목·목적·보유기간·거부 방법을 표로 명시했습니다.',
        '제9조(개인정보의 제3자 제공)의 제공 항목을 실제 제공 내용에 맞추어 정정했습니다. 매장에 전달되는 항목에 이름(실명. 본인확인을 마친 회원에 한합니다), 회원이 입력한 예약명, 대회 당일의 매장 체크인 여부를 추가하고, 실제로는 제공되지 않는 연락처를 항목에서 삭제하는 한편 휴대전화번호를 매장에 제공하지 않는다는 점을 명시했습니다. 아울러 제공받은 매장의 목적 외 이용·재제공 금지(같은 법 제19조)와 예약 취소 시 매장 명단에서의 즉시 삭제를 함께 적었습니다.',
        '근거 조문을 정정했습니다. 2023년 3월 14일 개정(2023년 9월 15일 시행)으로 삭제된 구 제39조의3 등 특례 규정 인용을 제15조·제17조·제22조·제29조로 바로잡았습니다.',
        '본인확인 시 주민등록번호를 수집·저장하지 않고 연계정보(CI)·중복가입확인정보(DI)만 처리한다는 점을 명시했습니다.',
      ],
    },
    { version: 1, effective: LEGAL_PREV_EFFECTIVE_DATE, notice: LEGAL_PREV_EFFECTIVE_DATE, changes: ['제정(제1조~제7조).'] },
  ],
  'anti-gambling': [
    {
      version: 2, effective: LEGAL_EFFECTIVE_DATE, notice: LEGAL_NOTICE_DATE,
      changes: [
        '회사의 법적 지위를 구성요건 단위로 서술한 절과 활동점수·매장 이용권의 비금전성 절을 신설했습니다.',
        '근거 조문 2건을 정정했습니다. 대리게임 금지의 근거를 「게임산업진흥에 관한 법률」 제28조에서 제32조제1항제11호로 바로잡고, 「국민체육진흥법」 제2조는 마인드 스포츠를 정의하지 않으므로 해당 인용을 삭제했습니다.',
        '위반 행위 제재 기준과 신고·상담 창구(1336·1488)를 표로 정리했습니다.',
      ],
    },
    { version: 1, effective: LEGAL_PREV_EFFECTIVE_DATE, notice: LEGAL_PREV_EFFECTIVE_DATE, changes: ['제정.'] },
  ],
  marketing: [
    {
      version: 2, effective: LEGAL_EFFECTIVE_DATE, notice: LEGAL_NOTICE_DATE,
      changes: [
        '제정. 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 제50조에 따라 광고성 정보의 수신 항목·발송 수단·보유 기간·철회 방법·야간 전송 제한을 별도 문서로 분리해 안내합니다.',
        '본 동의는 선택 항목이며, 동의하지 않아도 회원가입과 서비스 이용에 어떠한 제한도 없습니다(「개인정보 보호법」 제22조제5항).',
      ],
    },
  ],
};
