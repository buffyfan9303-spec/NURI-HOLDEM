// src/pages/legal/MarketingConsent.tsx
// 마케팅 정보 수신 동의 [선택] — 정보통신망법 §50(영리목적 광고성 정보 전송 제한) 반영.
// AuthModal 의 '[선택] 마케팅 정보 수신에 동의합니다' 체크박스가 가리키는 문서이며,
// 동일 텍스트가 scripts/gen-legal.mjs 로 /legal/marketing.html 에 정적 발행된다(두 벌 금지).

// 시행일·개정 이력은 src/lib/legalVersion.ts 단일 소스에서 온다 — 문서마다 날짜를 박으면 어긋난다.
import { LEGAL_EFFECTIVE_DATE, LEGAL_NOTICE_DATE } from '../../lib/legalVersion';
import { PendingRevisionNotice, RevisionHistory } from './RevisionBlocks';

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

function SubItems({ items }: { items: string[] }) {
  return (
    <ul className="mt-1 ml-4 space-y-0.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-1.5 text-ink-muted">
          <span className="shrink-0">–</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function MarketingConsent() {
  return (
    <div className="px-4 pb-6">
      {/* 헤더 */}
      <div className="py-4 border-b border-border-subtle mb-4">
        {/* 이 문서는 제정판이라 '직전판'이 없다 — 다른 3문서와 달리 직전 시행일을 적지 않는다. */}
        <p className="text-2xs text-ink-muted">시행일: {LEGAL_EFFECTIVE_DATE} · 공지일: {LEGAL_NOTICE_DATE}</p>
        <p className="text-2xs text-ink-muted mt-0.5">
          본 동의는 <strong className="text-ink-primary">선택 사항</strong>입니다. 동의하지 않아도 NURI HOLDEM 회원가입과
          모든 서비스 이용에 어떠한 제한도 없습니다.
        </p>
      </div>

      <PendingRevisionNotice />

      <Article n={1} title="동의의 성격">
        <Items items={[
          '본 동의는 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 제50조에 따른 영리목적 광고성 정보 전송에 대한 선택 동의입니다.',
          '동의를 거부하실 수 있으며, 거부하시더라도 회원가입·대회 정보 조회·커뮤니티·장터·학습 도구 등 서비스 이용에 불이익이 없습니다.',
          '동의하지 않으셔도 예약 확정, 순위 확정, 제재 안내, 약관 변경 고지 등 서비스 이용에 필수적인 안내(거래·의무 고지)는 계속 발송됩니다.',
        ]} />
      </Article>

      <Article n={2} title="수신하게 되는 정보">
        <p>동의 시 다음과 같은 광고성 정보를 받아보시게 됩니다.</p>
        <SubItems items={[
          '신규 대회·이벤트 안내 및 참가 접수 시작 알림',
          '팔로우한 홀덤펍의 주간 대회 일정 요약(주간 소식 이메일)',
          '서비스 신규 기능·개편 소식, 이용 팁, 설문·체험단 참여 기회 안내',
          '제휴 매장의 할인·프로모션 및 매장 이용권 혜택 안내',
        ]} />
        <p className="text-ink-muted">
          ※ 본 서비스는 상금·매장 이용권을 대회 주최 매장이 제공하는 정보로서만 안내하며,
          어떠한 형태의 도박·사행 행위도 안내·중개하지 않습니다.
        </p>
      </Article>

      <Article n={3} title="발송 수단 · 전송 채널">
        <Items items={[
          '브라우저·앱 푸시 알림 — 알림 권한을 허용하고 알림을 켠 경우에 한합니다.',
          '이메일 — 회원가입 시 등록한 이메일 주소로 발송합니다(발송 대행: Plus Five Five, Inc.(Resend)).',
          '서비스 내 알림함 — 앱 안에서만 표시되며 외부로 발송되지 않습니다.',
        ]} />
        <p className="text-ink-muted">
          ※ SMS·MMS 등 문자 메시지로는 광고성 정보를 발송하지 않습니다.
        </p>
      </Article>

      <Article n={4} title="이용하는 개인정보 항목 및 보유 기간">
        <Items items={[
          <>
            본 동의에 따라 이용하는 항목은 다음과 같습니다.
            <SubItems items={[
              '이메일 주소, 닉네임 — 이메일 발송 및 수신자 식별',
              '푸시 구독 정보(브라우저가 발급한 구독 엔드포인트·키) — 푸시 알림 발송',
              '팔로우한 매장 목록, 알림 수신 설정 — 관심사에 맞는 소식 구성',
            ]} />
          </>,
          '보유 기간: 수신 동의 철회 시 또는 회원 탈퇴 시까지 보유하며, 그때 지체 없이 발송 대상에서 제외합니다.',
        ]} />
      </Article>

      <Article n={5} title="수신 동의 철회 방법">
        <p>동의는 언제든지 아무런 불이익 없이 철회하실 수 있습니다.</p>
        <Items items={[
          '이메일: 수신한 메일 하단의 수신거부(구독 해지) 링크를 누르시면 즉시 발송 대상에서 제외됩니다.',
          '푸시 알림: 서비스 내 알림 설정에서 알림을 끄거나, 브라우저·기기의 알림 권한을 차단하시면 발송이 중단됩니다.',
          <>
            일괄 철회: 고객센터 이메일(<span className="text-accent-300">buffyfan9303@gmail.com</span>)로
            철회 의사를 보내주시면 본인 확인 후 지체 없이 처리하고 결과를 회신합니다.
          </>,
        ]} />
        <p className="text-ink-muted">
          ※ 철회 처리 시점에 이미 발송이 시작된 건은 도달할 수 있으며, 이후 발송분부터 제외됩니다.
        </p>
      </Article>

      <Article n={6} title="야간 시간대 전송 제한">
        <p>
          회사는 「정보통신망법」 제50조제3항에 따라 <strong className="text-ink-primary">오후 9시부터 다음 날 오전 8시까지</strong>는
          광고성 정보를 전송하지 않습니다. 야간 수신을 원하시는 경우에도 별도 동의를 받기 전까지는 발송하지 않습니다.
        </p>
      </Article>

      <Article n={7} title="수신 동의 여부의 정기 확인">
        <p>
          회사는 「정보통신망법」 제50조제8항에 따라 수신 동의를 받은 날부터 2년마다 회원의 수신 동의 여부를 확인합니다.
          확인에 응하지 않으시더라도 기존 동의는 그대로 유지되며, 언제든지 제5조의 방법으로 철회하실 수 있습니다.
        </p>
      </Article>

      {/* 정보통신망법 §50④ — 광고성 정보에는 전송자의 명칭·연락처와 수신 거부·철회 방법을 명시해야 하고,
          같은 법 시행령이 정하는 바에 따라 제목이 시작되는 부분에 '(광고)'를 표시해야 한다.
          이 조항이 있으면 '광고'와 '거래 고지'의 경계가 문서상 분명해져 필수 알림 쪽이 오히려 넓어진다. */}
      <Article n={8} title="광고성 정보의 표시">
        <Items items={[
          '회사는 광고성 정보를 전송할 때 제목이 시작되는 부분에 (광고)를 표시하고, 본문에 전송자의 명칭과 연락처를 밝힙니다.',
          '회사는 광고성 정보의 본문에 수신 거부 또는 수신 동의 철회의 의사를 표시할 수 있는 방법을 함께 안내합니다(「정보통신망법」 제50조제4항).',
          '회사는 수신 거부·철회를 회피하거나 방해하는 조치를 하지 않으며, 수신자를 기술적으로 식별하기 위한 조치를 광고성 정보에 포함하지 않습니다.',
          '서비스 이용에 필수적인 안내(예약 확정, 순위 확정, 제재 안내, 약관 변경 고지 등)는 광고성 정보가 아니므로 (광고) 표시 없이 발송되며, 본 동의의 철회 대상이 아닙니다.',
        ]} />
      </Article>

      <Article n={9} title="처리 결과의 통지 및 동의 기록의 보관">
        <Items items={[
          '회사는 회원이 수신 동의, 수신 거부 또는 수신 동의 철회의 의사를 표시한 경우 그 처리 결과를 회원에게 알려 드립니다(「정보통신망법」 제50조제7항).',
          '회사는 동의 및 철회의 일시와 그 방법에 관한 기록을 보관하며, 회원이 요청하는 경우 자신의 동의 상태를 확인할 수 있도록 합니다.',
          '해당 기록은 동의 사실의 증명 목적으로만 이용하며, 회원 탈퇴 시 관계 법령에 따른 보존 기간이 지난 후 지체 없이 파기합니다.',
        ]} />
      </Article>

      <Article n={10} title="문의">
        <p>
          광고성 정보 수신과 관련한 문의·정정·삭제 요청은 개인정보 보호책임자
          김윤혜(대표) / <span className="text-accent-300">buffyfan9303@gmail.com</span> 으로 접수해 주시기 바랍니다.
          개인정보의 처리 전반에 관한 사항은 개인정보처리방침을 따릅니다.
        </p>
      </Article>

      <RevisionHistory doc="marketing" />

      <p className="text-2xs text-ink-muted text-center pt-2 border-t border-border-subtle">
        본 동의 안내는 {LEGAL_EFFECTIVE_DATE}부터 적용됩니다.
      </p>
    </div>
  );
}
