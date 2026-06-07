// src/components/features/IdentityVerificationButton.tsx
// PortOne V2 휴대폰 실명인증 창 호출 → 식별자만 서버로 전달(verify-identity). CI는 서버에서만 처리.
import { useState } from 'react';
import PortOne from '@portone/browser-sdk/v2';
import { verifyIdentity } from '../../api/identity';
import { useToast } from '../atoms/Toast';

const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string | undefined;
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY as string | undefined;

/** PortOne 환경변수가 설정됐는지 — 미설정 시 인증 UI를 숨기거나 안내. */
export const PORTONE_CONFIGURED = !!(STORE_ID && CHANNEL_KEY);

export default function IdentityVerificationButton({ onVerified, label = '휴대폰 본인인증', className }: {
  onVerified?: (name: string | null) => void;
  label?: string;
  className?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

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
