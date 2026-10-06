// src/pages/legal/OwnerTerms.tsx
// 매장 운영자 이용약관(개인정보 처리위탁 포함) — 2026-10-06 약관 전수 재검토 P1-5 신설.
//
// 왜 필요한가: 처리방침 제2조⑦·제3조⑦은 "매장이 입력한 손님·직원 정보(장부·손님 관리·직원 근무·급여 등)는 매장이
//   개인정보처리자이고 회사는 매장의 위탁을 받아 보관한다"고 말한다. 「개인정보 보호법」 제26조①은 그 위탁을
//   **문서**(목적 외 처리 금지·안전조치·재위탁 제한·관리감독·손해배상 등)로 하라고 정하는데, 그 문서가 없었다.
//   문서가 없으면 '매장 = 처리자' 구조 자체가 흔들려 회사가 처리자로 평가될 수 있다(review.md P1-5 [불확실]).
// 동의: 매장 운영자 가입 화면(AuthModal) · 기존 업주는 내 매장을 열 때 OwnerTermsGate. 판은 lib/ownerTerms.ts.
// 공개 주소: /legal/owner-terms.html (scripts/gen-legal.mjs 가 이 컴포넌트를 그대로 찍는다 — 텍스트 원본은 여기 하나).
// ⚠ 법률 검토 전 초안을 리드·오너가 확정하는 문서다(오너 몫 O-5). 바꾸면 OWNER_TERMS_VERSION 을 올리고 부칙에 적는다.
// ⚠ 매장 이용권 단위(1T=1만원) 등 이용권 문구는 유권해석 회신 뒤 정한다(오너 결정 (B)) — 여기에는 발행 원칙만 적는다.
import { OWNER_TERMS_EFFECTIVE_DATE, OWNER_TERMS_VERSION } from '../../lib/legalDeploy';

function Article({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="text-sm font-bold text-accent-300 mb-2">제{n}조 ({title})</h3>
      <div className="space-y-1.5 text-xs text-ink-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function Items({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-none space-y-1 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0 text-ink-muted">{i + 1}.</span>
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export default function OwnerTerms() {
  return (
    <div className="px-4 pb-6">
      <div className="py-4 border-b border-border-subtle mb-4">
        <p className="text-2xs text-ink-muted">제{OWNER_TERMS_VERSION}판 시행일: {OWNER_TERMS_EFFECTIVE_DATE}</p>
        <p className="text-2xs text-ink-muted mt-0.5">
          본 약관은 NURI HOLDEM 의 매장 운영 도구를 이용하는 매장 운영자(업주·공동 운영자)에게 서비스 이용약관과 함께 적용됩니다.
        </p>
      </div>

      <Article n={1} title="목적">
        <p>
          이 약관은 엔에이치홀딩스(이하 "회사")가 NURI HOLDEM 에서 제공하는 매장 운영 도구(포스터·예약 명단·장부·클락·순위 등록·매장 이용권·직원·손님 관리·정산)의
          이용 조건과, 매장이 그 도구에 입력하는 개인정보의 처리 위탁 관계를 정합니다.
        </p>
      </Article>

      <Article n={2} title="적용">
        <Items items={[
          '이 약관은 매장 운영자 회원(매장 대표 업주와 공동 운영자, 이하 "매장")에게 적용되며, 서비스 이용약관에 정하지 않은 사항을 정합니다.',
          '이 약관과 서비스 이용약관이 서로 다르게 정한 사항은 매장 운영 도구의 이용에 관하여 이 약관을 우선 적용합니다.',
        ]} />
      </Article>

      <Article n={3} title="개인정보 처리의 역할">
        <Items items={[
          '매장이 매장 운영 도구에 입력하거나 그 도구로 만드는 손님·직원의 정보(장부의 손님 이름과 참가 기록, 매장 이용권 보유·사용 기록, 직원의 근무 일정·출퇴근 시각·급여 기준과 메모, 손님 관리의 이름·연락처·생일·메모·방문 기록 등)의 개인정보처리자는 매장입니다.',
          '회사는 매장의 위탁을 받아 그 정보를 저장·표시·백업·삭제하는 업무만 처리합니다(「개인정보 보호법」 제26조).',
          '회원이 출석·예약 등 회사의 기능을 이용하면서 회사가 수집해 매장에 제공하는 정보는 회사의 개인정보처리방침 제9조에 따릅니다.',
        ]} />
      </Article>

      <Article n={4} title="위탁 업무와 금지 사항">
        <Items items={[
          '위탁 업무의 내용: 매장 운영 도구의 제공을 위한 정보의 저장, 화면 표시, 장애 복구용 백업, 매장의 요청 또는 위탁 종료에 따른 삭제.',
          '회사는 위탁받은 정보를 매장의 운영 목적 밖으로 이용하거나 제3자에게 제공하지 않습니다. 다만 법령에 따른 수사기관 등의 적법한 요청은 예외로 합니다.',
        ]} />
      </Article>

      <Article n={5} title="안전성 확보 조치">
        <Items items={[
          '회사는 위탁받은 정보에 대하여 접근권한 관리, 행 수준 접근통제(RLS)를 통한 매장별 접근 제한, 전송 구간의 암호화, 접속기록의 보관, 백업 사본의 암호화 전송 등 개인정보처리방침 제11조의 조치를 합니다.',
          '매장은 직원에게 장부·매장 이용권·일정 열람 권한을 줄 때 필요한 사람에게만 주고, 퇴사·업무 변경 시 지체 없이 회수합니다.',
        ]} />
      </Article>

      <Article n={6} title="재위탁">
        <p>매장은 회사가 위탁 업무의 수행을 위하여 다음 업체에 처리를 다시 맡기는 것에 동의합니다. 업체가 바뀌면 회사는 개인정보처리방침 제6조를 고쳐 미리 알립니다.</p>
        <Items items={[
          'Supabase, Inc. — 데이터베이스·파일 저장(Amazon Web Services 대한민국 서울 리전)',
          'Vercel Inc.·Cloudflare, Inc. — 서비스 화면과 데이터의 전송',
          'Cloudflare, Inc.(R2)·GitHub, Inc. — 장애 복구용 백업 사본의 보관과 백업 작업 실행(약 2주 뒤 자동 삭제)',
        ]} />
      </Article>

      <Article n={7} title="관리·감독">
        <Items items={[
          '매장은 회사에 위탁 업무의 처리 현황(보관 위치, 안전성 확보 조치, 재위탁 업체 등)을 요청할 수 있고, 회사는 지체 없이 회신합니다.',
          '회사는 위탁받은 정보의 유출 등 사고를 알게 된 경우 지체 없이 매장에 알리고 피해를 줄이기 위한 조치를 합니다.',
        ]} />
      </Article>

      <Article n={8} title="매장의 의무">
        <Items items={[
          '매장은 손님·직원의 정보를 수집할 법적 근거(동의 등)를 스스로 갖추고, 회사에 처리를 맡긴다는 사실(수탁자: 엔에이치홀딩스, NURI HOLDEM)을 손님·직원이 알 수 있도록 매장 안내문 등에 공개합니다(「개인정보 보호법」 제26조제2항).',
          '매장은 회사가 개인정보처리방침 제9조에 따라 제공한 회원 정보를 그 제공 목적(예약자·참가자 확인, 좌석 배정, 장부 기록, 매장 이용권 전송, 대회 진행 안내) 밖으로 이용하거나 다른 사람에게 다시 제공하지 않습니다(같은 법 제19조).',
          '매장 이용권은 매장이 손님에게 무상으로 발행합니다. 매장은 이용권을 대가를 받고 판매하거나, 대회 순위·입상·상금에 따라 발행하거나, 금전으로 교환·재매입하지 않습니다.',
          '매장은 대회의 개최·참가비·상금·진행과 그 이행에 대하여 스스로 책임지며, 관계 법령(형법 제246조·제247조, 사행행위 등 규제 및 처벌 특례법 등)을 지킵니다.',
        ]} />
      </Article>

      <Article n={9} title="위탁의 종료와 파기">
        <Items items={[
          '매장이 매장을 영구 삭제하거나 매장 운영자 자격이 끝나면 위탁도 끝납니다.',
          '회사는 위탁이 끝나면 그 매장의 기록을 파기합니다. 삭제 전에 매장이 필요한 자료를 내려받을 수 있도록 안내하며, 백업 사본에 남은 정보는 약 2주 뒤 자동으로 삭제됩니다.',
          '매장이 관계 법령(예: 「근로기준법」 제42조의 임금 관련 서류 3년 보존)에 따라 보관해야 하는 자료는 삭제 전에 매장이 직접 내려받아 보관합니다.',
        ]} />
      </Article>

      <Article n={10} title="손해배상">
        <Items items={[
          '회사와 매장은 이 약관을 위반하여 상대방 또는 정보주체에게 손해를 입힌 경우 각자의 귀책에 따라 배상합니다.',
          '회사는 수탁자로서 위탁받은 업무와 관련하여 「개인정보 보호법」을 위반해 발생한 손해에 대하여 같은 법 제26조제7항에 따른 책임을 집니다.',
        ]} />
      </Article>

      <Article n={11} title="약관의 변경">
        <Items items={[
          '회사가 이 약관을 바꿀 때에는 적용일 7일 전부터, 매장에 불리한 변경은 적용일 30일 전부터 서비스 내에 알리고, 바뀐 약관에 다시 동의를 받습니다.',
          '매장은 바뀐 약관에 동의하지 않으면 매장 운영 도구의 이용을 그만둘 수 있습니다. 이 경우 제9조를 따릅니다.',
        ]} />
      </Article>

      <section className="mb-5">
        <h3 className="text-sm font-bold text-accent-300 mb-2">부칙</h3>
        <p className="text-xs text-ink-secondary leading-relaxed">
          제1판은 {OWNER_TERMS_EFFECTIVE_DATE}부터 시행합니다. 이 약관이 시행되기 전부터 매장 운영 도구를 이용하던 매장에는 매장 운영 도구를 처음 여는 때에 동의를 받습니다.
        </p>
      </section>
    </div>
  );
}
