// src/components/features/SanctionedAccountSheet.tsx — 정지·영구정지 계정의 '탈퇴만 가능한' 안내 시트.
//
// 2026-10-06 오너 "계정 탈퇴도 만들어"(legal.md P2-8 ②, 개인정보 보호법 §36·§37): 이용 제한 중인 회원도 앱에서 직접 탈퇴한다.
//   예전엔 로그인하자마자 세션을 끊어 '내 정보 → 보안 → 회원 탈퇴하기' 에 닿을 길이 없었다(고객센터 문의만).
//   지금은 AuthContext 가 세션만 남기고 user 는 null 로 둔다 — 그래서 다른 기능은 그대로 막히고 이 시트만 뜬다.
//   탈퇴 절차·본인 확인(비밀번호 또는 '영구 삭제' 입력)은 보안 탭과 **같은 컴포넌트**(WithdrawAccountSection)를 쓴다.
//   서버(withdraw_my_account, 20261006m)는 제재 계정 탈퇴 때 CI 변환값을 reason='banned' 로 남겨 제재 회피 재가입을 계속 막는다.
import Modal from '../atoms/Modal';
import { useAuth } from '../../contexts/AuthContext';
import { WithdrawAccountSection } from './ProfileModal';
import { PRIVACY_EFFECTIVE_DATE } from '../../lib/legalVersion';

export default function SanctionedAccountSheet() {
  const { sanctioned, endSanctioned } = useAuth();
  const close = () => { endSanctioned().catch(() => {}); };
  return (
    <Modal open={!!sanctioned} onClose={close} title="이용 제한 안내" variant="sheet" maxWidth="md">
      <div data-testid="sanctioned-sheet" className="space-y-3 p-4">
        <p className="text-sm font-semibold text-ink-primary">{sanctioned}</p>
        <p className="text-2xs leading-relaxed text-ink-muted">
          이용 제한 중에도 회원 탈퇴는 할 수 있습니다. 탈퇴하면 개인정보는 즉시 파기되고, 부정 재가입과 이용 제한 회피를 막기 위해
          기간을 정한 이용 정지 중의 탈퇴는 일반 탈퇴와 같습니다. 영구 이용 제한 중이면 본인인증 연계정보(CI)를 되돌릴 수 없게 변환한 값을 탈퇴일부터 5년 동안 따로 보관한 뒤 파기하며, 그동안 같은 본인인증으로 다시 가입할 수 없습니다(개인정보처리방침 제3조 · {PRIVACY_EFFECTIVE_DATE}부터).
        </p>
        <button type="button" onClick={close} className="btn-ghost w-full text-sm">로그아웃</button>
      </div>
      <WithdrawAccountSection />
    </Modal>
  );
}
