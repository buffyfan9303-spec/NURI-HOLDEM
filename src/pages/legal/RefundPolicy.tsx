// src/pages/legal/RefundPolicy.tsx
// 취소·환불 정책 — 「전자상거래 등에서의 소비자보호에 관한 법률」 §17 청약철회 기준.
// PG(토스페이먼츠 등) 가맹 심사가 '환불 정책이 적힌 공개 URL' 을 요구해(2026-09-03) 정적 발행 대상에 넣었다:
// scripts/gen-legal.mjs → /legal/refund.html. 본문은 LegalDocsModal 의 REFUND(앱 안 모달)와 같은 사실을 담는다 —
// 금액·기간·귀책 기준을 바꿀 때는 두 곳을 같이 고친다(legalConsistency.test 가 핵심 문구를 잠근다).
//
// 시행일·개정 이력은 src/lib/legalVersion.ts 단일 소스에서 온다.
import { LEGAL_NOTICE_DATE, LEGAL_PREV_EFFECTIVE_DATE } from '../../lib/legalVersion';

const SERVICE = 'NURI HOLDEM';
const COMPANY = '엔에이치홀딩스';
const EMAIL = 'buffyfan9303@gmail.com';
const PHONE = '010-7508-7689';

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

export default function RefundPolicy() {
  return (
    <div className="px-4 pb-6">
      <div className="py-4 border-b border-border-subtle mb-4">
        <p className="text-2xs text-ink-muted">
          시행일: {LEGAL_PREV_EFFECTIVE_DATE} · {LEGAL_NOTICE_DATE} 개정에서 본 정책은 변경되지 않았습니다
        </p>
        <p className="text-2xs text-ink-muted mt-0.5">
          {SERVICE}(이하 "회사")의 유료 서비스 결제 취소 및 환불 기준입니다. 본 정책은
          「전자상거래 등에서의 소비자보호에 관한 법률」을 따릅니다.
        </p>
      </div>

      <Article n={1} title="적용 대상">
        <Items items={[
          <>본 정책은 회사가 유료로 제공하는 서비스에 적용됩니다. 유료 서비스는 <strong className="text-ink-primary">매장 업주 대상 광고·노출 상품</strong>(포스터 상단 고정·노출 강화, 커뮤니티 광고 등)과 <strong className="text-ink-primary">매장 운영 도구 이용료</strong>입니다.</>,
          <>매장이용권은 매장이 손님에게 무상으로 발행하는 비(非)금전 포인트로서 현금 가치가 없으며, 환불·환전의 대상이 아닙니다.</>,
          <>대회 참가비는 각 매장이 현장에서 직접 받으며 회사를 거치지 않습니다. 참가비의 취소·환불은 해당 매장의 안내를 따릅니다.</>,
        ]} />
      </Article>

      <Article n={2} title="청약철회(결제 취소)">
        <Items items={[
          <>이용자는 결제일로부터 7일 이내에 청약철회를 요청할 수 있습니다.</>,
          <>다만 다음의 경우에는 청약철회가 제한될 수 있습니다(전자상거래법 제17조제2항).
            <SubItems items={[
              '서비스가 이미 개시(노출·게재 등)되어 그 효력이 발생한 경우',
              '기간제 노출 상품에서 이용 기간이 일부 경과한 경우(경과분 제외 후 잔여분 환불)',
            ]} />
          </>,
        ]} />
      </Article>

      <Article n={3} title="환불 금액의 산정">
        <Items items={[
          <>서비스 개시 전: 전액 환불.</>,
          <>기간제 상품 이용 중 해지: 총 결제금액에서 이미 이용한 기간(일할 계산) 및 부대비용을 공제한 잔액을 환불합니다.</>,
          <>회사의 귀책사유(서비스 미제공·중대한 오류 등)로 인한 경우: 전액 환불 및 필요한 보상 조치.</>,
        ]} />
      </Article>

      <Article n={4} title="환불 신청 및 처리">
        <Items items={[
          <>환불은 고객센터({EMAIL})로 결제 정보와 함께 신청합니다.</>,
          <>회사는 정당한 환불 요청을 확인한 날로부터 3영업일 이내에 환불 절차를 진행합니다.</>,
          <>결제수단별로 카드 취소·계좌 환급 등 동일 수단 환불을 원칙으로 하며, 결제대행사 사정에 따라 영업일 기준 추가 기간이 소요될 수 있습니다.</>,
        ]} />
      </Article>

      <Article n={5} title="유의사항">
        <Items items={[
          <>부정한 방법으로 결제·이용한 경우 또는 약관·법령을 위반한 경우 환불이 제한될 수 있습니다.</>,
          <>본 서비스는 금전을 베팅하는 도박·환전·사행성 서비스를 제공하지 않으며, 그러한 명목의 환불 요청에는 응하지 않습니다.</>,
        ]} />
      </Article>

      <section className="mt-6 pt-4 border-t border-border-subtle text-2xs text-ink-muted space-y-0.5">
        <p>[문의] {COMPANY} 고객센터 · {EMAIL} · {PHONE}</p>
        <p>본 정책은 {SERVICE} 서비스 이용약관의 일부를 구성하며, 약관과 충돌하는 경우 이용자에게 유리한 규정을 우선 적용합니다.</p>
      </section>
    </div>
  );
}
