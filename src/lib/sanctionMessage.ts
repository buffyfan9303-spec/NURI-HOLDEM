// 제재 계정으로 로그인했을 때 보여 줄 문장 — AuthContext(로그인 안내·SanctionedAccountSheet)와 단위 테스트가 같은 함수를 쓴다.
//
// critical-211 P2-2(2026-10-07): 제재 **사유**를 앱 안에서도 알린다. 제재 통지는 notify-sanction 메일 하나뿐이라
//   이메일이 없는 카카오 회원은 사유를 받을 길이 없었다(약관: "조치 후 지체 없이 그 사유와 기간을 통지").
//   사유는 본인 profiles.sanction_reason — 관리자가 정지·영구정지 때 적는 값이고(auth.ts updateUserStatus · 20261002a admin_decide_report),
//   profiles 행은 RLS(profiles_select)가 본인·관리자에게만 연다. getMyProfile 이 이미 읽어 User.sanctionReason 에 싣는다 — 새 RPC 가 필요 없다.
//   이메일 회원도 같은 문장을 본다(메일 + 앱 안 두 경로).
import type { User } from '../api/auth';

export function sanctionMessage(p: Pick<User, 'status' | 'suspendedUntil' | 'sanctionReason'>): string | null {
  if (p.status === 'withdrawn') return '탈퇴한 계정입니다. 재가입은 고객센터로 문의해 주세요.';
  const reason = (p.sanctionReason ?? '').trim().replace(/[.。]+$/, '');
  const why = reason ? ` 사유: ${reason}.` : '';
  if (p.status === 'banned') return `이용이 영구 제한된 계정입니다.${why} 고객센터로 문의해 주세요.`;
  if (p.status === 'suspended') {
    const until = p.suspendedUntil ? new Date(p.suspendedUntil) : null;
    return until && !Number.isNaN(until.getTime())
      ? `이용이 일시 정지된 계정입니다. ${until.toLocaleDateString()}까지 로그인할 수 없습니다.${why} 문의는 고객센터로 부탁드립니다.`
      : `이용이 정지된 계정입니다.${why} 고객센터로 문의해 주세요.`;
  }
  return null;
}
