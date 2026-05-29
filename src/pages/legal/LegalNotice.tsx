// src/pages/legal/LegalNotice.tsx
// 사행성 배제 및 건전 이용 공지 — 게임산업진흥에 관한 법률 §32 반영

const EFFECTIVE_DATE = '2026년 1월 1일';

function Section({ icon, title, children }: {
  icon: string; title: string; children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-gold-300 mb-2">
        <span aria-hidden>{icon}</span>{title}
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
    { act: '대리 게임·대리 참여 알선', sanction: '계정 정지 + 경고', law: '게임산업법 §28' },
    { act: '허위 토너먼트 정보 등록', sanction: '포스터 삭제 + 업주 자격 박탈', law: '전자상거래법 §21' },
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
        <p className="text-2xs text-ink-muted">시행일: {EFFECTIVE_DATE}</p>
        <p className="text-2xs text-ink-muted mt-0.5">
          NURI HOLDEM은 건전한 마인드 스포츠 문화 조성을 위해 다음과 같이 공지합니다.
        </p>
      </div>

      {/* 서비스 성격 명시 */}
      <div className="mb-5 p-3 rounded-input bg-gold-300/10 border border-gold-400/30">
        <p className="text-xs text-gold-300 font-semibold mb-1">📋 NURI HOLDEM 서비스 성격</p>
        <p className="text-xs text-ink-secondary leading-relaxed">
          본 서비스는 <strong className="text-ink-primary">전국 홀덤 토너먼트 일정 정보 제공 플랫폼</strong>입니다.
          홀덤 포커는 「국민체육진흥법」상 마인드 스포츠로, 등록된 홀덤 펍에서의 합법적 토너먼트
          정보만을 다룹니다. 본 서비스는 어떠한 형태의 도박·사행 행위와도 무관합니다.
        </p>
      </div>

      <Section icon="🚫" title="금지 행위 (위반 시 즉시 제재)">
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
        ]} />
      </Section>

      <Section icon="⚖️" title="위반 행위 제재 기준">
        <p>위반 행위 적발 시 아래 기준에 따라 제재가 적용됩니다.</p>
        <PenaltyTable />
        <p className="text-ink-muted mt-2">
          ※ 제재 조치는 위반 경중 및 반복 여부에 따라 중복 적용될 수 있습니다.
        </p>
      </Section>

      <Section icon="📞" title="신고 및 문의">
        <p>
          불법 환전 시도, 사행 행위 의심 게시물, 피해 사례 등을 발견하신 경우
          아래 채널을 통해 즉시 신고해 주세요. 신고자의 신원은 철저히 보호됩니다.
        </p>
        <div className="p-3 rounded-input bg-surface-high border border-border-default space-y-1.5">
          <p><span className="text-ink-primary font-medium">운영팀 이메일:</span>{' '}
            <span className="text-gold-300">buffyfan9303@gmail.com</span></p>
          <p><span className="text-ink-primary font-medium">게임물관리위원회 신고:</span>{' '}
            <span className="text-ink-muted">1488 (평일 09:00–18:00)</span></p>
          <p><span className="text-ink-primary font-medium">경찰청 사이버범죄신고시스템:</span>{' '}
            <span className="text-ink-muted">ecrm.police.go.kr</span></p>
        </div>
      </Section>

      <Section icon="📌" title="관련 법령 근거">
        <ul className="space-y-1 text-ink-muted">
          {[
            '게임산업진흥에 관한 법률 제28조, 제32조, 제44조',
            '형법 제247조 (도박개장죄)',
            '국민체육진흥법 제2조 (마인드 스포츠 정의)',
            '전자상거래 등에서의 소비자보호에 관한 법률 제21조',
          ].map((law, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-border-strong">·</span>
              <span>{law}</span>
            </li>
          ))}
        </ul>
      </Section>

      <p className="text-2xs text-ink-muted text-center pt-2 border-t border-border-subtle">
        본 공지는 {EFFECTIVE_DATE}부터 적용됩니다.
      </p>
    </div>
  );
}
