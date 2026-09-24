// src/pages/legal/AccountDeletion.tsx
// 계정 삭제 안내 — Google Play '계정 삭제 URL' 요건(앱을 설치하지 않아도 열 수 있는 웹 페이지)을 위한 고지 문서.
// scripts/gen-legal.mjs 가 이 컴포넌트를 SSR 로 찍어 /legal/delete-account.html 로 발행한다(JS 0줄).
//
// ⚠ 적힌 사실의 근거(2026-09-25 확인) — 바뀌면 이 문서와 개인정보처리방침 제3조를 같이 고친다.
//   · 즉시 삭제 항목: withdraw_my_account(20260924n) + 닉네임·사진 사본 동기화(20260925c §1) + 닉네임 이력 삭제 트리거(20260924k)
//   · 본인인증 변환값 6개월: 20260925c §4 _purge_withdrawn_identities
//   · 백업 약 2주: .github/workflows/backup.yml KEEP=14(매일) · storage-backup.yml KEEP=2(매주)
//   · 앱 경로: 헤더 프로필 버튼 → 내 정보(CustomerDashboardPage) → 보안 탭 → ProfileModal WithdrawAccountSection
// ⚠ §28 — '환전·현금·수익' 계열 단어를 쓰지 않는다.
// ⚠ 정적 페이지 class 치환(reclass)이 살리는 것은 box / b / mute / hl / warn / center 뿐이다.

const EMAIL = 'ace@nuriholdem.com';

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="text-sm font-bold text-accent-300 mb-2">{title}</h3>
      <div className="space-y-2 text-xs text-ink-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function List({ items }: { items: React.ReactNode[] }) {
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

export default function AccountDeletion() {
  return (
    <div className="px-4 pb-6">
      <div className="py-4 border-b border-border-subtle mb-4">
        <p className="text-2xs text-ink-muted">
          NURI HOLDEM(누리홀덤) 앱과 웹사이트(nuriholdem.com)의 회원 계정 및 개인정보를 삭제하는 방법입니다.
          앱을 설치하지 않았거나 로그인할 수 없어도 아래 2번 방법으로 요청하실 수 있습니다.
        </p>
      </div>

      <Part title="1. 앱에서 직접 삭제하기 (즉시 처리)">
        <List items={[
          'NURI HOLDEM 앱 또는 nuriholdem.com 에 로그인합니다.',
          '화면 오른쪽 위의 프로필(내 이름) 버튼을 누르고 「내 정보」를 엽니다.',
          '「보안」 탭 아래쪽의 「회원 탈퇴하기」를 누릅니다.',
          '이메일로 가입한 계정은 현재 비밀번호를, Google 등 소셜 로그인 계정은 ‘영구 삭제’를 입력한 뒤 「탈퇴하기」를 누르면 즉시 삭제됩니다.',
        ]} />
        <p className="text-ink-muted">
          매장 대표 계정은 매장을 먼저 삭제하거나 대표를 넘긴 뒤 탈퇴할 수 있습니다. 이용이 정지된 계정은 앱에서 탈퇴할 수 없으니 아래 2번으로 요청해 주세요.
        </p>
      </Part>

      <Part title="2. 로그인 없이 요청하기 (이메일)">
        <List items={[
          <>받는 곳: <a href={`mailto:${EMAIL}`} className="text-accent-300 underline">{EMAIL}</a> · 제목: 계정 삭제 요청</>,
          '본문에 가입한 이메일 주소와 닉네임을 적어 주세요. 가입한 이메일 주소로 보내 주시면 본인 확인이 빠릅니다.',
          '본인임을 확인하기 어려운 경우 추가 확인을 요청드릴 수 있습니다.',
          '본인 확인 후 지체 없이 삭제하고, 늦어도 요청을 받은 날부터 10일 이내에 처리 결과를 이메일로 알려 드립니다.',
        ]} />
      </Part>

      <Part title="3. 즉시 삭제되는 정보">
        <List items={[
          '이메일 주소, 이름(실명), 휴대전화번호, 생년월일, 성별, 통신사, 본인인증 정보와 인증 일시',
          '닉네임과 닉네임 변경 이력 — 닉네임은 “탈퇴회원_(임의 문자)” 표시로 바뀝니다',
          '프로필 사진(계정과 게시글·댓글에 표시되던 사진)',
          '로그인 연결 정보(소셜 계정 연결, 로그인 세션), 알림 수신 등록, 매장 직원 등록',
        ]} />
      </Part>

      <Part title="4. 탈퇴 후에도 남는 정보와 보관 기간">
        <List items={[
          '게시글·댓글·장터 글: 작성자 표시를 “탈퇴회원_(임의 문자)”로 바꾸고 닉네임·프로필 사진을 지운 뒤 내용은 남습니다. 내용까지 지우려면 탈퇴 전에 직접 삭제하시거나 위 이메일로 요청해 주세요.',
          '본인인증 연계정보(CI)를 되돌릴 수 없게 변환한 값: 부정 재가입과 이용 제한 회피를 막기 위해 탈퇴일부터 6개월 동안 분리 보관한 뒤 자동으로 파기합니다.',
          '쪽지, 1:1 문의, 출석·예약 기록, 알림, 활동점수 기록, NURI SPOT·기록장 기록과 AI 코칭 결과, 약관 동의 이력: 이름·연락처·이메일 등 회원을 알아볼 수 있는 정보를 지운 탈퇴 계정에 연결된 채 남습니다. 삭제를 요청하시면 지체 없이 삭제합니다.',
          '매장 기록(장부의 참가 기록, 매장이용권 발급·사용 이력, 직원 근무·급여 기록, 손님 관리 기록): 해당 매장이 관리하는 정보로, 보관 기간과 삭제는 매장이 정합니다. 회원 탈퇴만으로는 삭제되지 않으며 해당 매장에 삭제를 요청하실 수 있습니다. 매장이 매장을 영구 삭제하면 함께 파기됩니다.',
          '백업 사본: 장애 복구용 백업(데이터베이스 매일 최근 14개, 파일 매주 최근 2개)에는 약 2주 동안 남아 있다가 자동으로 삭제됩니다.',
          '앱 오류 기록은 30일 뒤 자동으로 삭제됩니다. 오류 모니터링 업체(Sentry) 등 외부 업체의 보관 기간은 개인정보처리방침 제6조를 따릅니다.',
        ]} />
      </Part>

      <Part title="5. 계정은 두고 일부만 지우기">
        <p>
          게시글·댓글·장터 글·프로필 사진은 앱에서 직접 삭제할 수 있습니다. 그 밖의 기록만 삭제하고 싶으시면 위 이메일로 요청해 주세요.
        </p>
      </Part>

      <p className="text-2xs text-ink-muted text-center pt-2 border-t border-border-subtle">
        자세한 내용은 <a href="/legal/privacy.html" className="text-accent-300 underline">개인정보처리방침</a> 제3조·제4조를 확인해 주세요.
      </p>
    </div>
  );
}
