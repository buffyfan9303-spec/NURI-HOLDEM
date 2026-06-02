// src/components/features/ConsentGateModal.tsx
// 구글 등 OAuth 가입자처럼 가입 시 법적 동의를 거치지 않은 사용자에게
// 앱 진입 전 1회 필수 동의를 받는 게이트. (게임산업법·개인정보보호법 대응)
//  - 닫기 불가(필수 동의) — 동의 또는 로그아웃만 가능
import { useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { updateMyConsent } from '../../api/auth';

export default function ConsentGateModal({ open }: { open: boolean }) {
  const toast = useToast();
  const { refreshProfile, logout } = useAuth();
  const [age19,     setAge19]     = useState(false);
  const [terms,     setTerms]     = useState(false);
  const [privacy,   setPrivacy]   = useState(false);
  const [anti,      setAnti]      = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [saving,    setSaving]    = useState(false);

  const allRequired = age19 && terms && privacy && anti;
  const allChecked  = allRequired && marketing;
  const toggleAll = (v: boolean) => { setAge19(v); setTerms(v); setPrivacy(v); setAnti(v); setMarketing(v); };

  const submit = async () => {
    if (!allRequired) return toast.show('필수 항목에 모두 동의해 주세요', 'error');
    setSaving(true);
    try {
      await updateMyConsent({
        agreedToTerms: terms, agreedToPrivacy: privacy,
        agreedToAntiGambling: anti, agreedToMarketing: marketing,
      });
      await refreshProfile();
      toast.show('동의가 완료되었습니다', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '저장에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { /* 필수 동의 — 닫기 불가 */ }} title="서비스 이용 동의" maxWidth="md" variant="sheet">
      <div className="p-4 space-y-4">
        <p className="text-xs text-ink-secondary leading-relaxed">
          NURI HOLDEM 이용을 위해 아래 약관에 동의해 주세요. 건전한 마인드 스포츠 문화를 위해
          불법 환전·사행성 행위는 엄격히 금지됩니다.
        </p>

        {/* 전체 동의 */}
        <label className="flex items-center gap-2 p-2.5 rounded-input bg-surface-high border border-border-default cursor-pointer">
          <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} className="accent-gold-300 w-4 h-4" />
          <span className="text-sm font-bold text-ink-primary">전체 동의 (필수 + 선택 포함)</span>
        </label>

        <div className="space-y-2 pl-1">
          <ConsentRow checked={age19}     onChange={setAge19}     required label="만 19세 이상입니다." />
          <ConsentRow checked={terms}     onChange={setTerms}     required label="서비스 이용약관에 동의합니다." />
          <ConsentRow checked={privacy}   onChange={setPrivacy}   required label="개인정보 수집·이용에 동의합니다. (개인정보보호법 §15)" />
          <ConsentRow checked={anti}      onChange={setAnti}      required label="불법 환전·사행성 행위 금지 서약에 동의합니다. (게임산업법)" />
          <ConsentRow checked={marketing} onChange={setMarketing}          label="마케팅 정보 수신에 동의합니다. (이벤트·할인·푸시알림)" />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => logout()} className="btn-ghost flex-1">로그아웃</button>
          <button type="button" onClick={submit} disabled={saving || !allRequired} className="btn-primary flex-1 disabled:opacity-60">
            {saving ? '저장 중…' : '동의하고 시작'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConsentRow({
  checked, onChange, label, required,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; required?: boolean }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-gold-300 w-4 h-4 mt-0.5 shrink-0" />
      <span className="text-xs text-ink-secondary leading-relaxed">
        {required && <span className="text-gold-300 font-bold mr-1">[필수]</span>}
        {label}
      </span>
    </label>
  );
}
