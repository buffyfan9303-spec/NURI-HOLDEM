// src/components/features/IdentityVerificationButton.tsx
// PortOne V2 휴대폰 실명인증 창 호출 → 식별자만 서버로 전달(verify-identity). CI는 서버에서만 처리.
import { useState } from 'react';
import PortOne from '@portone/browser-sdk/v2';
import { verifyIdentity } from '../../api/identity';
import { useToast } from '../atoms/Toast';
import { identityEnabled, useIdentityEnabled } from '../../lib/identityFlag';

const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string | undefined;
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY as string | undefined;

/**
 * 본인인증 UI 를 띄워도 되는가 — PortOne 환경변수 + 킬스위치(2026-08-29) 양쪽.
 *
 * 왜 한 상수에 합쳤나: 이 상수는 앱 전체에서 '본인인증 진입 UI 를 그릴까?' 라는 **한 가지 질문**에만
 * 쓰인다(App.tsx 상단 유도 배너 등). 킬스위치가 꺼졌는데 배너만 살아 있으면 누르는 순간 갈 곳이
 * 없는 화면으로 떨어지므로, 조건을 나눠 두면 반드시 한쪽이 새는 구조가 된다.
 * ⚠ 모듈 상수라 값이 임포트 시점에 굳는다(이름의 _AT_LOAD 가 그 사실을 드러낸다).
 *   기본값(꺼짐)에서는 곧바로 false 라 지금 문제가 없지만, 기능을 켠 직후
 *   **그 세션에서 처음 방문한 사용자**는 새로고침 한 번 전까지 배너가 안 보일 수 있다.
 *   구독형이 필요한 자리(이 컴포넌트 자신)는 아래 useIdentityEnabled 로 실시간 반영한다.
 *   (스냅샷을 지역 상수로 뽑는 이유: export 초기화식에 함수 호출이 들어가면
 *    react-refresh/only-export-components 의 상수-export 예외에서 빠져 린트가 막는다.)
 */
const IDENTITY_ON_AT_LOAD = identityEnabled();
export const PORTONE_CONFIGURED = !!(STORE_ID && CHANNEL_KEY && IDENTITY_ON_AT_LOAD);

export default function IdentityVerificationButton({ onVerified, label = '휴대폰 본인인증', className }: {
  onVerified?: (name: string | null) => void;
  label?: string;
  className?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const idOn = useIdentityEnabled();

  // 킬스위치 OFF — 인증 창을 아예 열지 않는다(서버 verify-identity 는 그대로 살아 있어 켜면 즉시 복구).
  if (!idOn) return null;

  const run = async () => {
    if (!STORE_ID || !CHANNEL_KEY) { toast.show('본인인증이 아직 설정되지 않았습니다. 잠시 후 다시 시도해 주세요.', 'error'); return; }
    setBusy(true);
    try {
      const identityVerificationId = `identity-verification-${crypto.randomUUID()}`;
      const res = await PortOne.requestIdentityVerification({ storeId: STORE_ID, identityVerificationId, channelKey: CHANNEL_KEY });
      if (!res) { setBusy(false); return; }
      // code가 있으면 실패/취소
      if (res.code !== undefined) { toast.show(res.message || '본인인증이 취소되었습니다.', 'error'); setBusy(false); return; }
      // 서버 교차검증(PortOne REST + CI 중복검사 + 저장)
      const { name } = await verifyIdentity(res.identityVerificationId);
      toast.show(`${name ? name + '님 ' : ''}본인인증이 완료되었습니다.`, 'success');
      onVerified?.(name);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '본인인증에 실패했습니다.', 'error');
    }
    setBusy(false);
  };

  return (
    <button type="button" onClick={run} disabled={busy} className={className ?? 'btn-primary w-full text-sm disabled:opacity-50'}>
      {busy ? '인증 진행 중…' : label}
    </button>
  );
}
