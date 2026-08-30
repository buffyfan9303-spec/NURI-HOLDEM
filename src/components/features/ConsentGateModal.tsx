// src/components/features/ConsentGateModal.tsx
// 법적 동의 게이트 — '차단해야 하는' 두 상태를 한 컴포넌트가 맡는다.
//
//   ① initial  최초 동의 미이행(구글 등 OAuth 가입자). App 이 `open` 으로 판정해 넘긴다. 닫기 불가.
//   ② required 시행일이 지났는데 구판에만 동의한 상태 → 닫기 불가(동의 또는 로그아웃).
//
// **시행일 전(legalConsentStage() === 'notice')에는 이 모달을 띄우지 않는다.**
//   이유가 둘이다.
//   · 법적으로 — 아직 효력이 없는 약관에 동의를 강요하는 모양이 된다. 불리한 변경의 사전 고지는
//     '알리는 것'이지 '받아내는 것'이 아니다. 고지는 상시 노출 푸터(BusinessFooter)와 4개 문서 상단
//     배너 + 공개 URL(/legal/*.html)로 한다 — 비로그인 방문자에게도 닿는다는 점에서 모달보다 넓다.
//   · 실측으로 — 시행 전 안내를 모달로 띄우자 Playwright 회귀 15건이 깨졌다(로그인 상태로 시작하는
//     스펙의 첫 클릭을 오버레이가 가로챈다). 사용자에게도 같은 일이 일어난다: 아직 적용되지도 않은
//     고지가 앱 진입을 가로막는다.
//   판정 자체는 src/lib/legalVersion.ts 의 legalConsentStage() 한 곳에서만 한다(테스트가 잠근다).
//
// ⚠ 선택 동의(마케팅·랭킹 공개)는 어떤 상태에서도 필수로 묶지 않는다 — 「개인정보 보호법」 §22⑤.
//   allRequired 에 선택 항목이 들어가는 순간 위법이고, 그렇게 받은 동의는 무효다.
// ⚠ 재동의 화면의 마케팅 체크박스는 **현재 값으로 프리필**한다. 기본 false 로 두면 재동의 한 번에
//   기존 수신 동의가 조용히 철회된다 — 사용자는 철회한 적이 없는데 결과만 바뀐다.
import { useEffect, useMemo, useState } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { updateMyConsent } from '../../api/auth';
import { LEGAL_EFFECTIVE_DATE, legalConsentStage } from '../../lib/legalVersion';

type GateMode = 'initial' | 'required';

/** 공개 약관 4종 — 개정 내용은 각 문서 끝의 '부칙 — 개정 이력'에 있다. */
const DOC_LINKS: [string, string][] = [
  ['서비스 이용약관', '/legal/terms.html'],
  ['개인정보 수집·이용 동의', '/legal/privacy.html'],
  ['불법 환전·사행성 행위 금지 서약', '/legal/anti-gambling.html'],
  ['마케팅 정보 수신 동의(선택)', '/legal/marketing.html'],
];

export default function ConsentGateModal({ open }: { open: boolean }) {
  const toast = useToast();
  const { user, refreshProfile, logout } = useAuth();

  // ── 어떤 상태인가 ─────────────────────────────────────────────────────────
  // App.tsx 는 '최초 동의 미이행'만 판정해 open 으로 넘긴다(그 파일은 다른 웨이브가 잡고 있어
  // 손대지 않는다). 재동의 판정은 여기서 프로필을 직접 읽어 한다.
  const stage = user ? legalConsentStage(user.consentedLegalVersion) : 'ok';

  const mode: GateMode | null = useMemo(() => {
    if (open) return 'initial';
    if (!user) return null;
    if (user.agreedToTerms === false) return null;   // 최초 동의 대상 — App 이 open 을 준다
    // 'notice'(시행일 전)는 모달로 띄우지 않는다 — 위 주석 참고. 고지는 푸터·문서 배너가 한다.
    if (stage !== 'required') return null;
    // 운영자(admin)는 차단하지 않는다. 라이브 서비스에서 운영자가 잠기면 사고 대응 자체가 막힌다.
    if (user.role === 'admin') return null;
    return 'required';
  }, [open, user, stage]);

  // ── 체크박스 상태 ─────────────────────────────────────────────────────────
  const reconsent = mode === 'required';
  const [age19,     setAge19]     = useState(false);
  const [terms,     setTerms]     = useState(false);
  const [privacy,   setPrivacy]   = useState(false);
  const [anti,      setAnti]      = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [pubRank,   setPubRank]   = useState(false);
  const [pubRankTouched, setPubRankTouched] = useState(false);
  const [saving,    setSaving]    = useState(false);

  // 재동의 진입 시 선택 항목을 현재 값으로 되살린다(철회 사고 방지). 필수 항목은 반드시 다시 체크하게 둔다 —
  // 미리 체크해 두면 '읽고 동의했다'가 아니라 '기본값을 그대로 눌렀다'가 되어 동의로서 약해진다.
  useEffect(() => {
    if (!reconsent || !user) return;
    setMarketing(user.agreedToMarketing === true);
    setPubRank(user.publicRankingConsent === true);
    setPubRankTouched(false);
  }, [reconsent, user]);

  // 선택 항목(marketing·pubRank)은 allRequired 에 넣지 않는다 — 넣으면 동의 강제가 된다.
  const allRequired = age19 && terms && privacy && anti;
  const allChecked  = allRequired && marketing && pubRank;
  const toggleAll = (v: boolean) => {
    setAge19(v); setTerms(v); setPrivacy(v); setAnti(v);
    setMarketing(v); setPubRank(v); setPubRankTouched(true);
  };

  // 두 상태 모두 필수 동의 게이트다 — 닫기·ESC·배경 클릭으로 빠져나갈 수 없다.
  const noClose = () => { /* 필수 동의 — 닫기 불가 */ };

  const submit = async () => {
    if (!allRequired) return toast.show('필수 항목에 모두 동의해 주세요', 'error');
    setSaving(true);
    try {
      // 랭킹 공개(선택)는 '물어봤을 때만' 보낸다. 미응답(null)을 손대지 않은 채 false 로 덮으면
      // '거부'로 굳어 나중에 다시 물어볼 수 없다.
      const sendPubRank = !reconsent || pubRankTouched || user?.publicRankingConsent != null;
      const wasMarketing = user?.agreedToMarketing === true;
      await updateMyConsent({
        agreedToTerms: terms, agreedToPrivacy: privacy,
        agreedToAntiGambling: anti, agreedToMarketing: marketing,
        publicRankingConsent: sendPubRank ? pubRank : undefined,
      });
      await refreshProfile();
      // 「정보통신망법」 §50⑦ — 수신 동의·철회의 처리 결과를 이용자에게 알려야 한다.
      if (reconsent && wasMarketing && !marketing) toast.show('마케팅 정보 수신 동의가 철회되었습니다', 'success');
      else toast.show('동의가 완료되었습니다', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '저장에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'initial' ? '서비스 이용 동의' : '개정 약관 동의';

  return (
    <Modal open={mode !== null} onClose={noClose} title={title} maxWidth="md" variant="sheet">
      <div className="p-4 space-y-4">
        {mode === 'initial' ? (
          <p className="text-xs text-ink-secondary leading-relaxed">
            NURI HOLDEM 이용을 위해 아래 약관에 동의해 주세요. 건전한 마인드 스포츠 문화를 위해
            불법 환전·사행성 행위는 엄격히 금지됩니다.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink-secondary leading-relaxed">
              개정 약관이 {LEGAL_EFFECTIVE_DATE}부터 시행되었습니다. 계속 이용하시려면 개정된 내용에 동의해 주세요.
            </p>
            <p className="text-2xs text-ink-muted leading-relaxed">
              무엇이 바뀌었는지는 각 문서 끝의 「부칙 — 개정 이력」에서 확인하실 수 있습니다.
              개정 내용에 동의하지 않으시는 경우 이용계약을 해지하실 수 있습니다.
            </p>
          </div>
        )}

        {/* 공개 약관 원문 — 로그인 여부와 무관하게 열리는 정적 페이지 */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs">
          {DOC_LINKS.map(([label, href]) => (
            <a key={href} href={href} target="_blank" rel="noopener"
               className="inline-flex items-center py-1 -my-1 font-semibold text-accent-300 underline decoration-border-default underline-offset-2">
              {label}
            </a>
          ))}
        </div>

        {/* 전체 동의 */}
        <label className="flex items-center gap-2 p-2.5 rounded-input bg-surface-high border border-border-default cursor-pointer">
          <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} className="accent-accent-300 w-4 h-4" />
          <span className="text-sm font-bold text-ink-primary">전체 동의 (필수 + 선택 포함)</span>
        </label>

        <div className="space-y-2 pl-1">
          <ConsentRow checked={age19}     onChange={setAge19}     required label="만 19세 이상입니다." />
          <ConsentRow checked={terms}     onChange={setTerms}     required label="서비스 이용약관에 동의합니다." />
          <ConsentRow checked={privacy}   onChange={setPrivacy}   required label="개인정보 수집·이용에 동의합니다. (개인정보보호법 §15)" />
          <ConsentRow checked={anti}      onChange={setAnti}      required label="불법 환전·사행성 행위 금지 서약에 동의합니다. (게임산업법)" />
          <ConsentRow checked={marketing} onChange={setMarketing}          label="마케팅 정보 수신에 동의합니다. (이벤트·할인·푸시알림)" />
          {/* 오너 #12 — 순위표의 '자주 가는 매장' 표기 동의(선택). 미동의여도 순위·닉네임은 그대로. */}
          <ConsentRow checked={pubRank}   onChange={(v) => { setPubRank(v); setPubRankTouched(true); }}
                      label="랭킹 프로필 공개에 동의합니다. (순위표에 닉네임·자주 가는 매장 표시 · 미동의 시 매장은 표시하지 않습니다)" />
        </div>

        <p className="text-2xs text-ink-muted leading-relaxed">
          [선택] 항목은 동의하지 않으셔도 회원가입과 서비스 이용에 어떠한 제한도 없습니다.
        </p>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => logout()} className="btn-ghost flex-1">로그아웃</button>
          <button type="button" onClick={submit} disabled={saving || !allRequired} className="btn-primary flex-1 disabled:opacity-60">
            {saving ? '저장 중…' : mode === 'initial' ? '동의하고 시작' : '동의하고 계속'}
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
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent-300 w-4 h-4 mt-0.5 shrink-0" />
      <span className="text-xs text-ink-secondary leading-relaxed">
        {required
          ? <span className="text-accent-300 font-bold mr-1">[필수]</span>
          : <span className="text-ink-muted font-bold mr-1">[선택]</span>}
        {label}
      </span>
    </label>
  );
}
