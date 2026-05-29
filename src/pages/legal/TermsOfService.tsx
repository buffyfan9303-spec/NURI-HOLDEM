// src/pages/legal/TermsOfService.tsx
// 서비스 이용약관 — 추후 실 약관 텍스트로 교체 가능

const EFFECTIVE_DATE = '2026년 1월 1일';

function Article({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="text-sm font-bold text-gold-300 mb-2">제{n}조 ({title})</h3>
      <div className="space-y-1.5 text-xs text-ink-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function Items({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-none space-y-1 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0 text-ink-muted">{i + 1}.</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function SubItems({ items }: { items: React.ReactNode[] }) {
  const CIRCLES = ['①', '②', '③', '④', '⑤'];
  return (
    <ol className="list-none space-y-1 pl-4 mt-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0 text-ink-muted">{CIRCLES[i]}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export default function TermsOfService() {
  return (
    <div className="px-4 pb-6">
      {/* 헤더 */}
      <div className="py-4 border-b border-border-subtle mb-4">
        <p className="text-2xs text-ink-muted">시행일: {EFFECTIVE_DATE}</p>
        <p className="text-2xs text-ink-muted mt-0.5">
          본 약관은 NURI HOLDEM 서비스 이용에 관한 기본적인 사항을 규정합니다.
        </p>
      </div>

      <Article n={1} title="목적">
        <Para>
          본 약관은 NURI HOLDEM(이하 "회사")이 제공하는 웹사이트 및 관련 서비스(이하 "서비스")의
          이용과 관련하여 회사와 이용자의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을
          목적으로 합니다.
        </Para>
      </Article>

      <Article n={2} title="용어의 정의">
        <Items items={[
          '"서비스"란 회사가 제공하는 전국 홀덤 토너먼트 정보 제공, 커뮤니티, 중고 장터 등 관련 제반 서비스를 의미합니다.',
          '"이용자"란 본 약관에 따라 회사가 제공하는 서비스를 받는 회원 및 비회원을 말합니다.',
          '"회원"이란 일반 유저 및 매장 업주로서 회사에 개인정보를 제공하여 회원등록을 한 자를 말합니다.',
        ]} />
      </Article>

      <Article n={3} title="서비스의 제공 및 변경">
        <Items items={[
          '회사는 홀덤 매장 및 토너먼트 정보 제공, 이용자 간 커뮤니티 게시판, 중고 물품 거래 중개 게시판 서비스를 제공합니다.',
          '회사는 "전자상거래 등에서의 소비자보호에 관한 법률"에 따른 통신판매중개자이며, 중고 장터 내 통신판매의 당사자가 아닙니다. 따라서 회원 간 발생한 거래에 대한 책임은 거래 당사자에게 있습니다.',
        ]} />
      </Article>

      <Article n={4} title="사행성 행위 및 불법 거래 금지">
        <Items items={[
          '회사는 건전한 마인드 스포츠 문화를 지향하며, 서비스 내에서 어떠한 형태의 사행성 조장 및 불법 행위도 허용하지 않습니다.',
          <>
            회원은 다음 각 호의 행위를 하여서는 안 되며, 적발 시 사전 통보 없이 계정 영구 정지 및 관련 법령에 따른 형사 고발 조치가 취해질 수 있습니다.
            <SubItems items={[
              '게임머니, 칩, 시트권 등의 불법 현금화(환전) 및 이를 암시하는 게시글 작성',
              '불법 사설 도박장 홍보 및 대리 게임(대리 참여) 알선',
              '기타 "게임산업진흥에 관한 법률" 등 관련 법령에 위배되는 행위',
            ]} />
          </>,
        ]} />
      </Article>

      <Article n={5} title="회원의 의무 및 게시물 관리">
        <Items items={[
          '회원은 관계법령, 본 약관의 규정, 이용안내 및 서비스와 관련하여 공지한 주의사항을 준수하여야 합니다.',
          '회원이 작성한 게시물(포스터, 텍스트, 이미지 등)로 인해 발생하는 모든 저작권 침해 및 법적 책임은 해당 회원 본인에게 있습니다.',
          '회사는 회원의 게시물이 제4조를 위반하거나, 타인의 권리를 침해한다고 판단되는 경우 사전 통지 없이 삭제 또는 숨김 처리할 수 있습니다.',
        ]} />
      </Article>

      <Article n={6} title="계약해지 및 이용제한">
        <Items items={[
          '회원은 언제든지 관리자 메뉴 또는 고객센터를 통해 서비스 탈퇴를 요청할 수 있습니다.',
          '회사가 회원 자격을 제한 및 정지시킨 후, 동일한 행위가 2회 이상 반복되거나 사행성 조장 행위가 적발된 경우 회사는 회원 자격을 상실시킬 수 있습니다.',
        ]} />
      </Article>

      <Article n={7} title="면책조항">
        <Items items={[
          '회사는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.',
          '회사는 회원이 서비스에 게재한 정보, 자료, 사실의 신뢰도, 정확성 등 내용에 관해서는 책임을 지지 않습니다.',
        ]} />
      </Article>

      <p className="text-2xs text-ink-muted text-center pt-2 border-t border-border-subtle">
        본 약관은 {EFFECTIVE_DATE}부터 시행됩니다.
      </p>
    </div>
  );
}
