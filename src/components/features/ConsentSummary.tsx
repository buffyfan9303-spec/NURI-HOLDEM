// src/components/features/ConsentSummary.tsx — 가입 동의 요약(접지 않음). 이메일 가입(AuthModal)·소셜 첫 동의(ConsentGateModal) 공용.
// 개보법 §15②·§22① — '보기'(처리방침 전문)와 별개로 각 동의의 목적·항목·보유 기간·거부 효과를 보인다
//   (2026-10-06 법령 점검 P2-7). 처리방침 제2조⑤와 같은 내용이다 — 한쪽을 고치면 같이 고친다.
export default function ConsentSummary() {
  return (
    <div data-testid="signup-consent-summary" className="mt-1 space-y-1 rounded-input border border-border-subtle bg-surface-high px-2.5 py-2 text-2xs leading-relaxed text-ink-muted">
      <p><b className="text-ink-secondary">[필수] 개인정보 수집·이용</b> — 목적: 회원 식별·서비스 제공·부정 이용 방지 / 항목: 이메일, 비밀번호(소셜 가입은 제외), 닉네임, 만 19세 이상 여부 / 보유: 탈퇴 시 파기(남는 기록은 처리방침 제3조) / 동의하지 않으면 가입할 수 없습니다</p>
      <p><b className="text-ink-secondary">[선택] 랭킹 프로필 공개</b> — 목적: 순위표에 자주 가는 매장 표시 / 항목: 자주 가는 매장 상호 / 보유: 철회·탈퇴 때까지 / 동의하지 않아도 순위·닉네임은 그대로이고 매장만 표시하지 않습니다 / 철회: 내 정보 → 설정</p>
    </div>
  );
}
