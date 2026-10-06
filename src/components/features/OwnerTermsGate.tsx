// src/components/features/OwnerTermsGate.tsx — 매장 운영자 이용약관(개인정보 처리위탁 포함) 동의 게이트(2026-10-06 약관 재검토 P1-5).
//
// 언제 뜨나: 승인된 업주·공동 운영자(role venue_owner · approved)가 **내 매장**을 열었는데 현재 판(OWNER_TERMS_VERSION)에
//   동의한 기록이 서버(owner_terms_consents)에 없을 때. 기존 업주는 다음 접속 때 여기서 한 번 동의한다.
// 모양: 회원 재동의 게이트(ConsentGateModal)와 같다 — 닫기·ESC·드래그로 빠져나갈 수 없고(dismissible={false}),
//   동의하지 않으면 매장 운영 도구만 못 쓰고 다른 화면으로 나간다(회원 서비스 이용은 그대로 — 이 약관은 도구 이용 조건이다).
// 조회 실패(마이그레이션 적용 전 표 없음·네트워크)는 막지 않는다 — 기록할 곳이 없는데 막으면 매장 운영이 멈춘다(다음 열림 때 다시 묻는다).
import { useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { getMyOwnerTermsVersion, recordMyOwnerTermsConsent, OWNER_TERMS_VERSION } from '../../lib/ownerTerms';
import { msgOf } from '../../lib/dbError';
import OwnerTerms from '../../pages/legal/OwnerTerms';

export default function OwnerTermsGate({ onLeave }: { onLeave: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const uid = user?.id ?? null;
  // null = 아직 모름(그리지 않는다) · true = 물어야 한다 · false = 동의함/판정 불가
  const [need, setNeed] = useState<{ uid: string; v: boolean } | null>(null);
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    getMyOwnerTermsVersion()
      .then((v) => { if (alive) setNeed({ uid, v: v < OWNER_TERMS_VERSION }); })
      .catch(() => { if (alive) setNeed({ uid, v: false }); });
    return () => { alive = false; };
  }, [uid]);

  // 계정이 바뀌면 이전 계정의 판정을 쓰지 않는다(늦은 응답 가드).
  const open = !!uid && need?.uid === uid && need.v;

  const submit = async () => {
    if (!agree || saving) return;
    setSaving(true);
    try {
      await recordMyOwnerTermsConsent('gate');
      setNeed(uid ? { uid, v: false } : null);
      toast.show('매장 운영자 이용약관에 동의했습니다', 'success');
    } catch (e) {
      toast.show(msgOf(e, '저장에 실패했습니다'), 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={() => { /* 필수 동의 — 닫기 불가 */ }} dismissible={false} title="매장 운영자 이용약관 동의" maxWidth="md" variant="sheet">
      <div data-testid="owner-terms-gate" className="p-4 space-y-3">
        <p className="text-xs text-ink-secondary leading-relaxed">
          매장 운영 도구(장부·손님 관리·직원·이용권 등)에 입력하는 손님·직원 정보의 처리를 회사에 맡기는 조건을 정한 약관입니다.
          동의하셔야 내 매장 화면을 계속 쓸 수 있습니다. 동의하지 않으셔도 다른 서비스 이용에는 제한이 없습니다.
        </p>
        <div className="max-h-[40vh] overflow-y-auto rounded-input border border-border-default bg-surface-high">
          <OwnerTerms />
        </div>
        <a href="/legal/owner-terms.html" target="_blank" rel="noopener"
          className="inline-flex items-center py-1 -my-1 text-2xs font-semibold text-accent-300 underline underline-offset-2">새 창에서 전문 보기</a>
        <label className="flex min-h-[44px] cursor-pointer items-start gap-2 py-2">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
            data-testid="owner-terms-agree" className="accent-accent-300 w-4 h-4 mt-0.5 shrink-0" />
          <span className="text-xs text-ink-secondary leading-relaxed">
            <span className="text-accent-300 font-bold mr-1">[필수]</span>매장 운영자 이용약관(개인정보 처리위탁 포함)에 동의합니다.
          </span>
        </label>
        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border-subtle bg-surface-mid px-4 py-3">
          <button type="button" onClick={onLeave} className="btn-ghost flex-1">다른 화면으로</button>
          <button type="button" onClick={submit} disabled={!agree || saving} className="btn-primary flex-1 disabled:opacity-60">
            {saving ? '저장 중…' : '동의하고 계속'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
