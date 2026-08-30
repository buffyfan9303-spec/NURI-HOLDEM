// src/pages/legal/LegalNotice.tsx
// 불법 환전·사행성 행위 금지 서약 / 사행성 배제 및 건전 이용 공지
//
// 이 문서의 목적은 '회사가 도박·사행행위의 주체가 아니다'를 **구성요건 단위로** 부정해 두는 것이다.
// 뭉뚱그린 "우리는 도박과 무관합니다" 한 줄은 다툼이 생겼을 때 아무 일도 하지 못한다.
//   형법 §246① 도박 = 재물을 걸고 우연에 의하여 득실을 결정 (단, 일시오락 정도에 불과한 경우 예외)
//   형법 §247   도박장소 등 개설 = 영리의 목적 + 도박을 하는 장소나 공간의 개설 (5년 이하 징역 또는 3천만원 이하 벌금)
//   사행행위규제법 §2 사행행위 = 여러 사람으로부터 재물등을 모아 + 우연적 방법으로 득실 결정 + 재산상 이익·손실
//   게임산업법 §32①7 결과물(점수·경품·게임머니 등)의 환전·환전 알선·재매입을 業으로 하는 행위
//                   벌칙 §44①2 = 5년 이하 징역 또는 5천만원 이하 벌금 + 몰수·추징
//   게임산업법 §32①11 승인하지 않은 방법으로 점수·성과를 대신 획득해 주는 용역의 알선·제공 業(대리게임)
// → 각 요건을 문장 하나씩 부정한 것이 아래 '회사의 법적 지위' 절이다. 문장을 지우면 그 요건 부정이 사라진다.
//
// ⚠ 2026-08-30 정정 2건 (조문을 실제로 확인한 결과 기존 인용이 틀렸다)
//   · 대리게임 근거를 '게임산업법 §28'로 적어 두었으나 §28 은 '게임물 관련사업자의 준수사항'이다.
//     대리게임 금지의 실제 근거는 §32①11(2018 신설). 표와 목록 모두 정정.
//   · '국민체육진흥법 §2(마인드 스포츠 정의)'로 적어 두었으나 같은 조는 "체육"을 신체 활동으로 정의할
//     뿐 '마인드 스포츠'를 정의하지 않는다. 존재하지 않는 정의를 인용하면 그 자체가 허위 고지 위험이다.
//     → 조문은 '체육의 정의'로 바로잡고, 마인드 스포츠는 '통칭'임을 명시하는 표현으로 바꿨다.

import Icon, { type IconName } from '../../components/atoms/Icon';

// 시행일·개정 이력은 src/lib/legalVersion.ts 단일 소스에서 온다 — 문서마다 날짜를 박으면 어긋난다.
import { LEGAL_EFFECTIVE_DATE, LEGAL_NOTICE_DATE, LEGAL_PREV_EFFECTIVE_DATE } from '../../lib/legalVersion';
import { PendingRevisionNotice, RevisionHistory } from './RevisionBlocks';

function Section({ icon, title, children }: {
  icon: IconName; title: string; children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-accent-300 mb-2">
        <Icon name={icon} size={15} className="shrink-0" />{title}
      </h3>
      <div className="space-y-2 text-xs text-ink-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function BanList({ items }: { items: { label: string; detail: string }[] }) {
  return (
    <ul className="space-y-2 mt-1">
      {items.map(({ label, detail }, i) => (
        <li key={i} className="flex gap-3 p-2.5 rounded-input bg-danger/[0.06] border border-danger/20">
          <span className="shrink-0 text-danger mt-0.5">✕</span>
          <span>
            <span className="font-semibold text-danger-light">{label}</span>
            <br />
            <span className="text-ink-muted">{detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function PenaltyTable() {
  const rows = [
    { act: '불법 환전 게시글 작성', sanction: '즉시 계정 정지 + 게시글 삭제', law: '게임산업법 §32·§44' },
    { act: '사설 도박장 홍보', sanction: '영구 계정 정지 + 형사 고발', law: '형법 §247' },
    { act: '대리 게임·대리 참여 알선', sanction: '계정 정지 + 경고', law: '게임산업법 §32①11' },
    { act: '허위 토너먼트 정보 등록', sanction: '포스터 삭제 + 업주 자격 박탈', law: '전자상거래법 §21' },
    { act: '재물을 걸고 우연으로 득실을 정하는 행위 및 참가자 모집', sanction: '영구 계정 정지 + 형사 고발', law: '형법 §246' },
    { act: '활동점수·매장 이용권의 매매·양도 시도', sanction: '표시값 회수 + 계정 정지', law: '게임산업법 §32①7' },
  ];
  return (
    <div className="overflow-x-auto rounded-input border border-border-default mt-2">
      <table className="w-full text-2xs">
        <thead>
          <tr className="bg-surface-high border-b border-border-default">
            <th className="px-3 py-2 text-left text-ink-secondary font-semibold">위반 행위</th>
            <th className="px-3 py-2 text-left text-ink-secondary font-semibold">제재 조치</th>
            <th className="px-3 py-2 text-left text-ink-secondary font-semibold">근거 법령</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ act, sanction, law }, i) => (
            <tr key={i} className="border-b border-border-subtle last:border-b-0">
              <td className="px-3 py-2 text-ink-secondary">{act}</td>
              <td className="px-3 py-2 text-danger-light">{sanction}</td>
              <td className="px-3 py-2 text-ink-muted">{law}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LegalNotice() {
  return (
    <div className="px-4 pb-6">
      {/* 헤더 */}
      <div className="py-4 border-b border-border-subtle mb-4">
        <p className="text-2xs text-ink-muted">시행일: {LEGAL_EFFECTIVE_DATE} · 개정 공지일: {LEGAL_NOTICE_DATE} · 직전판 시행일: {LEGAL_PREV_EFFECTIVE_DATE}</p>
        <p className="text-2xs text-ink-muted mt-0.5">
          NURI HOLDEM은 건전한 마인드 스포츠 문화 조성을 위해 다음과 같이 공지합니다.
        </p>
      </div>

      <PendingRevisionNotice />

      {/* 서비스 성격 명시 */}
      <div className="mb-5 p-3 rounded-input bg-accent-300/10 border border-accent-400/30">
        <p className="flex items-center gap-1.5 text-xs text-accent-300 font-semibold mb-1"><Icon name="clipboard" size={14} className="shrink-0" />NURI HOLDEM 서비스 성격</p>
        <p className="text-xs text-ink-secondary leading-relaxed">
          본 서비스는 <strong className="text-ink-primary">전국 홀덤 토너먼트 일정 정보 제공 플랫폼</strong>입니다.
          홀덤 포커는 신체 활동이 아닌 두뇌 경기로서 흔히 마인드 스포츠로 불리며, 본 서비스는
          등록된 홀덤 펍에서의 합법적 토너먼트 정보만을 다룹니다. 회사는 대회의 주최자·운영자가 아니라
          매장이 등록한 정보를 전달하는 정보 제공자이며, 본 서비스는 어떠한 형태의 도박·사행 행위와도 무관합니다.
        </p>
      </div>

      {/* 오너 지시 #2 — '원천적 책임 분리'의 실체. 각 항이 형법·사행행위규제법의 구성요건을 하나씩
          부정한다. 뭉뚱그린 선언이 아니라 요건별 부정이어야 다툼에서 쓸 수 있다.
          ⚠ 이 문장들은 실제 운영이 그와 같을 때만 유효하다. 회사가 참가비를 직접 수취하거나
            상금을 지급하는 구조로 바뀌면 4·5번은 즉시 사실과 달라지고 그 자체가 허위 고지가 된다. */}
      <Section icon="briefcase" title="회사의 법적 지위 — 책임 주체의 분리">
        <ul className="space-y-2">
          {[
            ['회사는 도박을 하는 장소나 공간을 개설하지 않습니다.', '「형법」 제247조는 영리를 목적으로 도박을 하는 장소나 공간을 개설한 사람을 처벌합니다. 회사는 온·오프라인을 불문하고 그러한 장소·공간을 개설하거나 제공하지 않으며, 그러한 장소를 홍보·알선하지 않습니다.'],
            ['회사는 재물을 걸고 우연으로 득실을 정하는 행위를 제공하지 않습니다.', '「형법」 제246조의 도박은 재물 또는 재산상의 이익을 걸고 우연에 의하여 득실을 결정하는 것을 말합니다. 본 서비스에는 베팅 기능이 없으며, 회사는 그러한 행위를 제공·중개·주선하지 않습니다.'],
            ['회사는 사행행위영업을 영위하지 않습니다.', '「사행행위 등 규제 및 처벌 특례법」 제2조의 사행행위는 여러 사람으로부터 재물이나 재산상의 이익을 모아 우연적 방법으로 득실을 결정하여 재산상의 이익이나 손실을 주는 행위입니다. 회사는 이용자로부터 재물을 모으지 않으며 그 득실을 결정하지 않습니다.'],
            ['회사는 참가비를 수취하지 않고 상금을 지급하지 않습니다.', '대회의 참가비 수취와 상금 지급은 각 매장이 자신의 책임과 계산으로 수행합니다. 회사는 그 금전의 흐름에 관여하지 않으며, 이용자에게 배당·수당·환급을 지급하지 않습니다.'],
            ['매장과 이용자 사이의 법률관계에 회사는 당사자가 아닙니다.', '대회의 개최 여부, 일정, 참가비, 상금, 좌석 배정, 진행 방식과 그 이행은 전적으로 해당 매장이 결정하고 책임집니다. 회사는 그 이행을 보증하거나 대위하지 않습니다.'],
            ['이용자의 서비스 밖 행위에 대한 책임은 그 이용자에게 있습니다.', '이용자가 서비스 밖에서 행한 도박·사행행위 및 그로 인한 형사상·민사상 책임은 전적으로 해당 이용자와 그 행위가 이루어진 장소의 운영주체에게 있습니다.'],
          ].map(([label, detail], i) => (
            <li key={i} className="flex gap-3 p-2.5 rounded-input bg-surface-high border border-border-default">
              <span className="shrink-0 text-accent-300 mt-0.5">·</span>
              <span>
                <span className="font-semibold text-ink-primary">{label}</span>
                <br />
                <span className="text-ink-muted">{detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-ink-muted mt-2">
          ※ 본 절은 회사의 고의 또는 중대한 과실로 인한 법률상의 책임까지 배제하는 취지가 아닙니다
          (「약관의 규제에 관한 법률」 제7조제1호).
        </p>
      </Section>

      {/* 게임산업법 §32①7 의 '業' 요건을 성립시키지 않기 위한 선언. 회사가 재매입하지 않는다는 사실을
          공개 문서에 못박아 두는 것이 핵심이다. 이용권 정책이 유상 발행으로 바뀌면 이 절부터 다시 봐야 한다. */}
      <Section icon="ticket" title="활동점수·매장 이용권은 금전이 아닙니다">
        <ul className="space-y-1 text-ink-muted">
          {[
            '활동점수와 매장 이용권은 활동 기록을 표시하기 위한 비(非)금전 표시값이며, 재산적 가치나 회사·매장에 대한 채권을 발생시키지 않습니다.',
            '회사는 활동점수·매장 이용권을 매입하거나 다시 사들이지 않으며, 그 매입을 알선하지 않습니다(「게임산업진흥에 관한 법률」 제32조제1항제7호).',
            '활동점수와 매장 이용권은 대가를 받고 발행되지 않으므로 「전자금융거래법」상 선불전자지급수단에 해당하지 않으며, 환급·정산의 대상이 아닙니다.',
            '이용자 간 양도·매매·대여·담보 제공은 금지되며, 위반 시 표시값 회수 및 계정 정지 조치가 적용됩니다.',
            '대회의 참가비와 상금은 매장이 제공하는 상품 정보로서 안내될 뿐이며, 회사가 지급을 약속하는 대상이 아닙니다.',
          ].map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-border-strong">·</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon="ban" title="금지 행위 (위반 시 즉시 제재)">
        <BanList items={[
          {
            label: '불법 현금 환전 (칩·시트권·게임머니)',
            detail: '게임 내 재화(칩, 시트권 등)를 현금으로 환전하거나, 이를 암시·중개하는 모든 행위. 게시글·댓글·쪽지를 통한 환전 유도 포함.',
          },
          {
            label: '사설 도박장 홍보 및 알선',
            detail: '인·허가를 받지 않은 사설 카지노, 불법 도박 사이트, 불법 홀덤 클럽을 홍보하거나 회원을 유치하는 행위.',
          },
          {
            label: '대리 게임·대리 참여 알선',
            detail: '토너먼트 본인 참가 원칙에 반하여 타인을 대신 참여시키거나 이를 알선·중개하는 행위.',
          },
          {
            label: '허위·과장 토너먼트 정보 등록',
            detail: '실제와 다른 상금, 참가비, 일정을 기재하여 이용자를 기만하거나 금전적 피해를 유발하는 행위.',
          },
          {
            label: '베팅·판돈 모집 및 참가자 유인',
            detail: '재물 또는 재산상의 이익을 걸고 우연에 의하여 득실을 결정하는 행위, 그 판돈을 모으거나 참가자를 모집하는 행위. 게시글·댓글·쪽지·외부 링크를 통한 유인 포함.',
          },
          {
            label: '활동점수·매장 이용권의 매매·양도',
            detail: '서비스 내 표시값을 사고팔거나 타인에게 넘기는 행위 및 그 거래를 알선·중개하는 행위. 표시값은 재산적 가치가 없으며 거래의 대상이 아닙니다.',
          },
        ]} />
      </Section>

      {/* 문서 제목이 '금지 서약'인 이유가 이 절이다 — 동의 화면에서 필수 동의로 받는다.
          이용자 스스로의 준법 확인을 받아 두면 위반 시 제재·손해배상청구의 근거가 단단해진다. */}
      <Section icon="hand" title="이용자의 준법 서약">
        <p>
          본 문서에 동의하시는 것은 아래 사항을 확인하고 서약하는 것을 의미합니다.
          동의는 회원가입 시 필수 항목이며, 서약에 반하는 행위가 확인되면 위 제재 기준이 적용됩니다.
        </p>
        <ul className="space-y-1 text-ink-muted mt-1">
          {[
            '나는 만 19세 이상이며, 대한민국 법령을 준수하여 서비스를 이용합니다.',
            '나는 서비스 내외를 불문하고 불법 환전, 사설 도박장 홍보, 대리 게임 알선을 하지 않습니다.',
            '나는 활동점수·매장 이용권을 사고팔거나 타인에게 넘기지 않습니다.',
            '나는 서비스에 등록하는 정보를 사실대로 기재하며, 거짓 또는 과장된 정보로 다른 이용자를 유인하지 않습니다.',
            '나는 위 서약을 위반하여 회사에 손해가 발생한 경우 그 배상 책임이 나에게 있음을 확인합니다.',
          ].map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-border-strong">·</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon="scale" title="위반 행위 제재 기준">
        <p>위반 행위 적발 시 아래 기준에 따라 제재가 적용됩니다.</p>
        <PenaltyTable />
        <p className="text-ink-muted mt-2">
          ※ 제재 조치는 위반 경중 및 반복 여부에 따라 중복 적용될 수 있습니다.
        </p>
      </Section>

      <Section icon="shield-alert" title="건전 이용 안내">
        <ul className="space-y-1 text-ink-muted">
          {[
            '본 서비스는 만 19세 미만 청소년은 이용할 수 없습니다.',
            '본 서비스는 금전 베팅·환전이 없는 토너먼트 정보·커뮤니티 서비스입니다.',
            '도박 문제로 어려움을 겪고 있다면 한국도박문제예방치유원 헬프라인 1336(24시간·무료)에서 상담받을 수 있습니다.',
          ].map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-border-strong">·</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon="phone" title="신고 및 문의">
        <p>
          불법 환전 시도, 사행 행위 의심 게시물, 피해 사례 등을 발견하신 경우
          아래 채널을 통해 즉시 신고해 주세요. 신고자의 신원은 철저히 보호됩니다.
        </p>
        <div className="p-3 rounded-input bg-surface-high border border-border-default space-y-1.5">
          <p><span className="text-ink-primary font-medium">운영팀 이메일:</span>{' '}
            <span className="text-accent-300">buffyfan9303@gmail.com</span></p>
          <p><span className="text-ink-primary font-medium">게임물관리위원회 신고:</span>{' '}
            <span className="text-ink-muted">1488 (평일 09:00–18:00)</span></p>
          <p><span className="text-ink-primary font-medium">도박문제 상담(한국도박문제예방치유원):</span>{' '}
            <span className="text-ink-muted">1336 (24시간·무료)</span></p>
          <p><span className="text-ink-primary font-medium">경찰청 사이버범죄신고시스템:</span>{' '}
            <span className="text-ink-muted">ecrm.police.go.kr</span></p>
        </div>
      </Section>

      <Section icon="pin" title="관련 법령 근거">
        <ul className="space-y-1 text-ink-muted">
          {[
            '게임산업진흥에 관한 법률 제28조(게임물 관련사업자의 준수사항)',
            '게임산업진흥에 관한 법률 제32조제1항제7호 (결과물의 환전·환전 알선·재매입 업 금지)',
            '게임산업진흥에 관한 법률 제32조제1항제11호 (대리 게임 용역의 알선·제공 업 금지)',
            '게임산업진흥에 관한 법률 제44조 (벌칙 — 제32조제1항제7호 위반 시 5년 이하의 징역 또는 5천만원 이하의 벌금, 몰수·추징)',
            '형법 제246조 (도박) · 제247조 (도박장소 등 개설)',
            '사행행위 등 규제 및 처벌 특례법 제2조 (사행행위의 정의)',
            '국민체육진흥법 제2조 (체육의 정의) — 홀덤은 신체 활동이 아닌 두뇌 경기로서 마인드 스포츠로 통칭됩니다',
            '전자상거래 등에서의 소비자보호에 관한 법률 제20조·제20조의2 (통신판매중개자의 고지 의무와 책임) · 제21조 (금지행위)',
            '정보통신망 이용촉진 및 정보보호 등에 관한 법률 제50조 (영리목적 광고성 정보 전송 제한)',
            '개인정보 보호법 제15조·제17조·제22조·제29조 (수집·이용, 제3자 제공, 동의를 받는 방법, 안전조치 의무)',
            '약관의 규제에 관한 법률 제7조 (면책조항의 금지) — 회사의 고의·중대한 과실 책임은 배제되지 않습니다',
          ].map((law, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-border-strong">·</span>
              <span>{law}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon="building" title="사업자 정보">
        <div className="p-3 rounded-input bg-surface-high border border-border-default space-y-1">
          {[
            ['상호', '엔에이치홀딩스'],
            ['대표자', '김윤혜'],
            ['사업자등록번호', '525-20-02937'],
            ['사업장 소재지', '경기도 남양주시 진건읍 사릉로372번길 25, 201동 1403호(주공아파트)'],
            ['업태 / 종목', '정보통신업 / 컴퓨터 프로그래밍 서비스업, 포털 및 기타 인터넷 정보 매개 서비스업'],
            ['유선번호', '010-7508-7689'],
            ['고객센터', 'buffyfan9303@gmail.com'],
          ].map(([k, v], i) => (
            <p key={i} className="flex gap-2">
              <span className="w-24 shrink-0 text-ink-muted">{k}</span>
              <span className="flex-1 text-ink-secondary">{v}</span>
            </p>
          ))}
        </div>
      </Section>

      <RevisionHistory doc="anti-gambling" />

      <p className="text-2xs text-ink-muted text-center pt-2 border-t border-border-subtle">
        본 공지는 {LEGAL_EFFECTIVE_DATE}부터 적용됩니다. 시행일 전까지는 {LEGAL_PREV_EFFECTIVE_DATE}부터 시행된 직전판이 적용됩니다.
      </p>
    </div>
  );
}
