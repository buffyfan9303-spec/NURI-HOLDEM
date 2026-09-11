// src/components/features/IdentityVerificationButton.tsx
// PortOne V2 휴대폰 실명인증 창 호출 → 식별자만 서버로 전달(verify-identity). CI는 서버에서만 처리.
import { useEffect, useState } from 'react';
import PortOne from '@portone/browser-sdk/v2';
import { verifyIdentity } from '../../api/identity';
import { supabase, IS_MOCK } from '../../lib/supabase';
import { useToast } from '../atoms/Toast';
import { useIdentityEnabled } from '../../lib/identityFlag';

const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string | undefined;
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY as string | undefined;

// ── 모바일 리다이렉트 복귀(AUTH-09) ──────────────────────────────────────────────
// 채널(다날 등)이 모바일에서 전면 리다이렉트로 동작하면 아래 requestIdentityVerification 의 프로미스는 페이지 이탈로
// 사라지고, redirectUrl 로 ?identityVerificationId=…&transactionType=IDENTITY_VERIFICATION(실패 시 &code=…&message=…)이
// 붙어 돌아온다. 그 값을 읽어 **기존 서버 검증 경로(verifyIdentity)** 에 합류시킨다 — 안 하면 인증 결과가 유실된다
// (유저는 다시 눌러야 하고 PortOne 쪽엔 VERIFIED 건이 남는다).
//  · 모듈 평가 시점에 **동기적으로** 소비한다. 이 모듈은 App.tsx 가 PORTONE_CONFIGURED 때문에 부팅 때 임포트하므로
//    버튼(프로필>보안)이 아직 안 열려 있어도 여기서 잡힌다. 그리고 실패 복귀의 `code` 파라미터는 Supabase PKCE 의
//    `?code=` 와 이름이 같다 — GoTrue 가 URL 을 읽기 전(잠금 획득 await 뒤)에 지워야 로그인 콜백으로 오인되지 않는다.
//  · 파라미터는 읽자마자 지운다(1회 소비). 새로고침·뒤로가기로 같은 인증 ID 가 두 번 검증되면 서버(20260904a 일회성)가
//    두 번째를 거절해 실패 토스트가 뜬다.
//  · 결과는 모듈에 잠시 들고 있다가 버튼이 마운트될 때 한 번 토스트로 보여준다(아래 useEffect).
const IDV_RETURN_PARAMS = ['identityVerificationId', 'identityVerificationTxId', 'transactionType', 'code', 'message', 'pgCode', 'pgMessage'];
let idvReturn: Promise<{ name: string | null }> | null = null;

function consumeIdentityReturn(): void {
  if (typeof window === 'undefined' || IS_MOCK) return;
  const url = new URL(window.location.href);
  const id = url.searchParams.get('identityVerificationId');
  if (!id) return;
  const code = url.searchParams.get('code');
  const message = url.searchParams.get('message');
  IDV_RETURN_PARAMS.forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  idvReturn = code !== null
    ? Promise.reject(new Error(message || '본인인증이 취소되었습니다.'))
    : verifyIdentity(id).then(async (r) => {
        // 프로필은 부팅 때 이미 읽혔을 수 있다(인증 완료가 그보다 늦다). refreshSession 이 내는 TOKEN_REFRESHED 를
        // AuthContext 가 받아 프로필을 다시 읽는다 — 상단 '본인인증 필요' 배너가 저절로 내려간다.
        await supabase.auth.refreshSession().catch(() => {});
        return r;
      });
  idvReturn.catch(() => {}); // 아무도 안 받아도 unhandled rejection 이 되지 않게 — 표시는 버튼이 마운트될 때 한다
}
consumeIdentityReturn();

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
export const PORTONE_CONFIGURED = !!(STORE_ID && CHANNEL_KEY);

export default function IdentityVerificationButton({ onVerified, label = '휴대폰 본인인증', className }: {
  onVerified?: (name: string | null) => void;
  label?: string;
  className?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const idOn = useIdentityEnabled();

  // 결과를 화면에 알린다 — 창 방식(프로미스)과 리다이렉트 복귀(모듈 보관분)가 같은 문장을 쓴다.
  const settle = (p: Promise<{ name: string | null }>) => p.then(
    ({ name }) => { toast.show(`${name ? name + '님 ' : ''}본인인증이 완료되었습니다.`, 'success'); onVerified?.(name); },
    (e: unknown) => { toast.show(e instanceof Error ? e.message : '본인인증에 실패했습니다.', 'error'); },
  ).finally(() => setBusy(false));

  // 리다이렉트 복귀분 — 한 번만 꺼내 보여준다(탭을 오갈 때마다 같은 토스트가 반복되지 않게).
  useEffect(() => {
    const p = idvReturn;
    if (!p) return;
    idvReturn = null;
    void settle(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 킬스위치 OFF — 인증 창을 아예 열지 않는다(서버 verify-identity 는 그대로 살아 있어 켜면 즉시 복구).
  if (!idOn) return null;

  const run = async () => {
    if (!STORE_ID || !CHANNEL_KEY) { toast.show('본인인증이 아직 설정되지 않았습니다. 잠시 후 다시 시도해 주세요.', 'error'); return; }
    setBusy(true);
    try {
      const identityVerificationId = `identity-verification-${crypto.randomUUID()}`;
      const res = await PortOne.requestIdentityVerification({
        storeId: STORE_ID, identityVerificationId, channelKey: CHANNEL_KEY,
        // 리다이렉트 채널의 복귀 주소 — 쿼리는 비워 둔다(복귀 파라미터가 기존 쿼리와 섞이지 않게). 위 consumeIdentityReturn 이 받는다.
        redirectUrl: window.location.origin + window.location.pathname,
      });
      if (!res) { setBusy(false); return; }
      // code가 있으면 실패/취소
      if (res.code !== undefined) { toast.show(res.message || '본인인증이 취소되었습니다.', 'error'); setBusy(false); return; }
      // 서버 교차검증(PortOne REST + CI 중복검사 + 저장)
      await settle(verifyIdentity(res.identityVerificationId));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '본인인증에 실패했습니다.', 'error');
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={run} disabled={busy} className={className ?? 'btn-primary w-full text-sm disabled:opacity-50'}>
      {busy ? '인증 진행 중…' : label}
    </button>
  );
}
