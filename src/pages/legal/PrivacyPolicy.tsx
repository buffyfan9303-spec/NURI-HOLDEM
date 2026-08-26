// src/pages/legal/PrivacyPolicy.tsx
// 개인정보처리방침 — 추후 실 방침으로 교체 가능 (개인정보보호법 §30)

const EFFECTIVE_DATE = '2026년 6월 15일';

function Article({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="text-sm font-bold text-accent-300 mb-2">제{n}조 ({title})</h3>
      <div className="space-y-2 text-xs text-ink-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function Items({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-none space-y-1.5 pl-1">
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

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-input bg-surface-high border border-border-default text-xs text-ink-muted leading-relaxed">
      {children}
    </div>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="px-4 pb-6">
      {/* 헤더 */}
      <div className="py-4 border-b border-border-subtle mb-4">
        <p className="text-2xs text-ink-muted">시행일: {EFFECTIVE_DATE}</p>
        <p className="text-2xs text-ink-muted mt-0.5">
          NURI HOLDEM은 「개인정보 보호법」 제30조에 따라 아래와 같이 개인정보처리방침을 수립·공개합니다.
        </p>
      </div>

      <Article n={1} title="개인정보의 처리 목적">
        <p>
          회사는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의
          목적 이외의 용도로는 이용되지 않으며 이용 목적이 변경되는 경우에는 「개인정보 보호법」
          제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.
        </p>
        <Items items={[
          '회원 가입 및 관리: 회원 가입 의사 확인, 회원제 서비스 제공에 따른 본인 식별·인증, 만 19세 이상 연령 확인, 불량회원의 부정 이용 방지',
          '서비스 제공: 토너먼트 정보 제공, 커뮤니티 및 장터 게시판 이용 권한 부여, 맞춤형 알림 서비스 제공',
          '마케팅 및 광고에의 활용(동의한 경우): 이벤트 및 참여기회 제공, 접속 빈도 파악 또는 회원의 서비스 이용에 대한 통계',
        ]} />
      </Article>

      <Article n={2} title="처리하는 개인정보의 항목">
        <p>회사는 서비스 제공을 위해 다음의 개인정보 항목을 처리하고 있습니다.</p>
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-ink-primary mb-1">① 일반 회원 가입 시</p>
            <SubItems items={[
              '필수항목: 이메일 주소, 비밀번호, 닉네임, 만 19세 이상 여부 확인',
              '본인인증 시: 이름, 휴대전화번호, 생년월일, 성별, 통신사, 본인확인기관 발급 연계정보(CI)·중복가입확인정보(DI) — 주민등록번호는 수집·저장하지 않습니다',
              '선택항목: 프로필 이미지, 마케팅 수신 동의 여부',
            ]} />
          </div>
          <div>
            <p className="font-semibold text-ink-primary mb-1">② 매장 업주 회원 가입 시</p>
            <SubItems items={[
              '필수항목: 대표자명, 이메일 주소, 연락처(휴대전화번호), 매장명, 매장 주소, 사업자등록번호',
            ]} />
          </div>
          <div>
            <p className="font-semibold text-ink-primary mb-1">③ 서비스 이용 과정에서 자동 수집되는 정보</p>
            <SubItems items={[
              'IP 주소, 쿠키, 서비스 이용 기록(방문 일시, 불량 이용 기록 등)',
              'Google Analytics 쿠키(이용 통계) — 브라우저 쿠키 차단 설정으로 거부할 수 있습니다',
            ]} />
          </div>
        </div>
      </Article>

      <Article n={3} title="개인정보의 처리 및 보유 기간">
        <Items items={[
          '회사는 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터 개인정보를 수집 시에 동의받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.',
          <>
            각각의 개인정보 처리 및 보유 기간은 다음과 같습니다.
            <SubItems items={[
              '회원 가입 및 관리: 서비스 탈퇴 시까지. 단, 관계 법령 위반에 따른 수사·조사 등이 진행 중인 경우 해당 수사·조사 종료 시까지',
              '소비자의 불만 또는 분쟁처리에 관한 기록 (전자상거래법): 3년',
            ]} />
          </>,
        ]} />
      </Article>

      <Article n={4} title="개인정보의 파기 절차 및 파기 방법">
        <Items items={[
          '회사는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다.',
          '전자적 파일 형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용하며, 종이에 출력된 개인정보는 분쇄기로 분쇄하거나 소각하여 파기합니다.',
        ]} />
      </Article>

      <Article n={5} title="정보주체의 권리·의무 및 그 행사방법">
        <Items items={[
          '정보주체는 회사에 대해 언제든지 개인정보 열람, 정정, 삭제, 처리정지 요구 등의 권리를 행사할 수 있습니다.',
          '제1항에 따른 권리 행사는 회사에 대해 서면, 전자우편 등을 통하여 하실 수 있으며 회사는 이에 대해 지체 없이 조치하겠습니다.',
        ]} />
      </Article>

      <Article n={6} title="개인정보의 처리 위탁 및 국외 이전">
        <Items items={[
          '회사는 서비스 운영을 위해 Supabase, Inc.(데이터베이스·스토리지 — 데이터는 Amazon Web Services 대한민국 서울(ap-northeast-2) 리전에 보관) 및 포트원(주)·제휴 본인확인기관(휴대폰 본인인증, 국내 처리)에 개인정보 처리를 위탁하고 있습니다.',
          '회사는 「개인정보 보호법」 제28조의8에 따라 다음과 같이 개인정보를 국외로 이전(전송·처리)합니다.',
        ]} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-2xs text-left">
            <thead>
              <tr className="text-ink-muted border-b border-border-default">
                <th className="py-1.5 pr-2 font-semibold">이전받는 자</th>
                <th className="py-1.5 pr-2 font-semibold">국가</th>
                <th className="py-1.5 pr-2 font-semibold">이전 항목</th>
                <th className="py-1.5 pr-2 font-semibold">목적</th>
                <th className="py-1.5 pr-2 font-semibold">보유·이용기간</th>
                <th className="py-1.5 font-semibold">이전 방법</th>
              </tr>
            </thead>
            <tbody className="text-ink-secondary">
              {([
                ['Vercel Inc.', '미국', '접속 IP·요청 로그', '웹 호스팅·콘텐츠 전송', '위탁계약 종료 또는 벤더 로그 보존주기까지', '서비스 접속 시 네트워크 전송'],
                ['Cloudflare, Inc.', '미국·글로벌 엣지', '접속 IP·요청 정보', 'API·이미지 전송구간 프록시/캐싱(CDN)', '전송 처리 중 일시 처리', '서비스 접속 시 네트워크 경유'],
                ['Functional Software, Inc. (Sentry)', '미국', '오류 스택·브라우저 정보·IP', '오류 모니터링·품질 개선', '벤더 보존주기(약 90일) 후 자동 파기', '오류 발생 시 API 전송'],
                ['Plus Five Five, Inc. (Resend)', '미국', '이메일 주소·닉네임', '주간 소식 이메일 발송(수신 동의자 한정)', '발송 처리 후 벤더 정책에 따른 단기 보관', '발송 시 API 전송'],
                ['Google LLC (Gemini·Analytics)', '미국', '순위 인증 이미지, 핸드 분석 텍스트, 매장 주간 운영 요약, 이용 통계', 'AI 자동 판정·요약 생성, 이용 통계', '처리 즉시 완료(모델 입력 별도 저장 없음)', '해당 기능 실행 시 API 전송'],
              ] as string[][]).map((row, i) => (
                <tr key={i} className="border-b border-border-subtle align-top">
                  {row.map((cell, j) => <td key={j} className="py-1.5 pr-2">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-2xs text-ink-muted">
          정보주체는 개인정보의 국외 이전을 거부할 수 있습니다(문의: buffyfan9303@gmail.com).
          다만 거부 시 오류 자동 보고·AI 판정·이메일 소식 등 해당 기능의 이용이 제한될 수 있습니다.
        </p>
      </Article>

      <Article n={7} title="개인정보 보호책임자">
        <p>
          회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한
          정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
        </p>
        <InfoBox>
          <p><span className="text-ink-secondary">책임자 성명/직책:</span> 김윤혜 (대표)</p>
          <p><span className="text-ink-secondary">연락처(이메일):</span> buffyfan9303@gmail.com</p>
          <p className="mt-1.5 text-2xs">
            개인정보 침해 신고는 개인정보보호위원회(privacy.go.kr) 또는 한국인터넷진흥원(118)으로 문의하실 수 있습니다.
          </p>
        </InfoBox>
      </Article>

      <p className="text-2xs text-ink-muted text-center pt-2 border-t border-border-subtle">
        본 방침은 {EFFECTIVE_DATE}부터 적용됩니다.
      </p>
    </div>
  );
}
