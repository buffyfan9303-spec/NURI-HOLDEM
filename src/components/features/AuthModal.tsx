// src/components/features/AuthModal.tsx
import { useState, useEffect, useRef } from 'react';
import Modal from '../atoms/Modal';
import { useBackClose } from '../../lib/backstack';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import {
  signUpUser, signUpOwner, checkNicknameAvailable,
  requestPasswordReset, verifyPasswordResetOtp, setNewPassword,
} from '../../api/auth';
import TermsOfService   from '../../pages/legal/TermsOfService';
import PrivacyPolicy    from '../../pages/legal/PrivacyPolicy';
import LegalNotice      from '../../pages/legal/LegalNotice';

type Mode     = 'login' | 'signup-user' | 'signup-owner' | 'forgot';
type LegalDoc = 'terms' | 'privacy' | 'anti-gambling';

const LEGAL_TITLES: Record<LegalDoc, string> = {
  'terms':          '서비스 이용약관',
  'privacy':        '개인정보처리방침',
  'anti-gambling':  '사행성 배제 및 건전 이용 공지',
};

const MODE_LABEL: Record<Mode, string> = {
  'login':        '로그인',
  'signup-user':  '일반 회원가입',
  'signup-owner': '매장 업주 회원가입',
  'forgot':       '비밀번호 찾기',
};

// ── 동의 상태 훅 ──────────────────────────────────────────────────────────────

type ConsentKey = 'age19' | 'terms' | 'privacy' | 'antiGambling' | 'marketing';
type ConsentState = Record<ConsentKey, boolean>;

const CONSENT_INIT: ConsentState = {
  age19: false, terms: false, privacy: false, antiGambling: false, marketing: false,
};

function useConsent() {
  const [c, setC] = useState<ConsentState>(CONSENT_INIT);

  const allRequired = c.age19 && c.terms && c.privacy && c.antiGambling;
  const allChecked  = allRequired && c.marketing;

  const set = (k: ConsentKey, v: boolean) =>
    setC((prev) => ({ ...prev, [k]: v }));

  const toggleAll = (v: boolean) =>
    setC({ age19: v, terms: v, privacy: v, antiGambling: v, marketing: v });

  return { c, allRequired, allChecked, set, toggleAll };
}

// ── 약관 시트 오버레이 (z-[60] > 모달 z-50) ──────────────────────────────────

function LegalSheet({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }) {
  useBackClose(!!doc, onClose);
  if (!doc) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={LEGAL_TITLES[doc]}
    >
      {/* 배경 dim */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      />

      {/* 시트 본문 */}
      <div className={[
        'relative w-full max-w-lg bg-surface-mid shadow-dialog animate-slide-up',
        'rounded-t-dialog sm:rounded-dialog',
        'flex flex-col',
      ].join(' ')}
        style={{ maxHeight: '88vh' }}
      >
        {/* 그립 핸들 (모바일) */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border-strong" aria-hidden />
        </div>

        {/* 헤더 */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
          <h2 className="text-base font-semibold text-ink-primary">{LEGAL_TITLES[doc]}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
            </svg>
          </button>
        </header>

        {/* 스크롤 콘텐츠 */}
        <div className="flex-1 overflow-y-auto">
          {doc === 'terms'         && <TermsOfService />}
          {doc === 'privacy'       && <PrivacyPolicy />}
          {doc === 'anti-gambling' && <LegalNotice />}
        </div>

        {/* 하단 닫기 버튼 */}
        <div className="shrink-0 px-4 py-3 border-t border-border-subtle">
          <button type="button" onClick={onClose} className="btn-primary w-full">
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 동의 체크박스 섹션 ────────────────────────────────────────────────────────

interface ConsentSectionProps {
  c: ConsentState;
  allRequired: boolean;
  allChecked: boolean;
  set: (k: ConsentKey, v: boolean) => void;
  toggleAll: (v: boolean) => void;
  onView: (doc: LegalDoc) => void;
}

function ConsentSection({ c, allChecked, set, toggleAll, onView }: ConsentSectionProps) {
  const CheckRow = ({
    checked, onChange, required, label, doc,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    required?: boolean;
    label: string;
    doc?: LegalDoc;
  }) => (
    <div className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-gold-300 shrink-0"
      />
      <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
        <label
          onClick={() => onChange(!checked)}
          className="text-xs text-ink-secondary cursor-pointer leading-relaxed select-none"
        >
          {required && (
            <span className="text-danger mr-1 font-bold">[필수]</span>
          )}
          {!required && (
            <span className="text-ink-muted mr-1">[선택]</span>
          )}
          {label}
        </label>
        {doc && (
          <button
            type="button"
            onClick={() => onView(doc)}
            className="shrink-0 text-2xs text-gold-300 hover:text-gold-200 underline decoration-dotted underline-offset-2 transition-colors"
          >
            보기
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-2 pt-1 border-t border-border-subtle">
      {/* 전체 동의 */}
      <div className={[
        'flex items-center gap-2 p-2.5 rounded-input border transition-colors cursor-pointer',
        allChecked
          ? 'bg-gold-300/10 border-gold-400/40'
          : 'bg-surface-high border-border-default',
      ].join(' ')}
        onClick={() => toggleAll(!allChecked)}
      >
        <input
          type="checkbox"
          checked={allChecked}
          onChange={(e) => toggleAll(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="accent-gold-300 shrink-0"
        />
        <span className={[
          'text-xs font-semibold select-none',
          allChecked ? 'text-gold-300' : 'text-ink-primary',
        ].join(' ')}>
          전체 동의 (필수 + 선택 포함)
        </span>
      </div>

      {/* 구분선 */}
      <div className="pl-1 space-y-2">
        <CheckRow
          checked={c.age19} onChange={(v) => set('age19', v)}
          required label="본인은 만 19세 이상 성인입니다. (청소년보호법)"
        />
        <CheckRow
          checked={c.terms} onChange={(v) => set('terms', v)}
          required label="서비스 이용약관에 동의합니다." doc="terms"
        />
        <CheckRow
          checked={c.privacy} onChange={(v) => set('privacy', v)}
          required label="개인정보 수집·이용에 동의합니다. (개인정보보호법 §15)" doc="privacy"
        />
        <CheckRow
          checked={c.antiGambling} onChange={(v) => set('antiGambling', v)}
          required label="불법 환전·사행성 행위 금지 서약에 동의합니다. (게임산업법)" doc="anti-gambling"
        />
        <CheckRow
          checked={c.marketing} onChange={(v) => set('marketing', v)}
          label="마케팅 정보 수신에 동의합니다. (이벤트·할인·푸시알림)"
        />
      </div>
    </div>
  );
}

// ── 메인 모달 ─────────────────────────────────────────────────────────────────

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}

export default function AuthModal({ open, onClose, initialMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <Modal open={open} onClose={onClose} title={MODE_LABEL[mode]} maxWidth="md">
      {/* 탭 */}
      <div className="grid grid-cols-3 border-b border-border-subtle">
        {(['login', 'signup-user', 'signup-owner'] as Mode[]).map((m) => (
          <button
            key={m} type="button" onClick={() => setMode(m)}
            className={[
              'py-3 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px',
              mode === m
                ? 'border-gold-300 text-gold-300'
                : 'border-transparent text-ink-muted hover:text-ink-secondary',
            ].join(' ')}
          >
            {m === 'login' ? '로그인' : m === 'signup-user' ? '일반 가입' : '업주 가입'}
          </button>
        ))}
      </div>

      <div className="p-4">
        {mode === 'login'        && <LoginForm onClose={onClose} onForgot={() => setMode('forgot')} />}
        {mode === 'signup-user'  && <SignupUserForm  onDone={() => setMode('login')} />}
        {mode === 'signup-owner' && <SignupOwnerForm onDone={() => setMode('login')} />}
        {mode === 'forgot'       && <ForgotPasswordForm onBack={() => setMode('login')} />}
      </div>
    </Modal>
  );
}

// ── 로그인 폼 ─────────────────────────────────────────────────────────────────

function LoginForm({ onClose, onForgot }: { onClose: () => void; onForgot: () => void }) {
  const { login } = useAuth();
  const toast = useToast();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.show('로그인되었습니다', 'success');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setError(
        /confirm|verified|not confirmed/i.test(msg)
          ? '이메일 인증이 필요합니다. 받은 편지함의 인증 메일을 확인해 주세요.'
          : '이메일 또는 비밀번호를 확인해 주세요.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="이메일" type="email" required autoComplete="email"
        value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <Field label="비밀번호" type="password" required autoComplete="current-password"
        value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

      <div className="text-right -mt-1">
        <button type="button" onClick={onForgot} className="text-2xs text-ink-muted hover:text-gold-300 transition-colors">
          비밀번호를 잊으셨나요?
        </button>
      </div>

      {error && <p className="text-xs text-danger animate-fade-in" role="alert">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
        {loading ? '로그인 중…' : '로그인'}
      </button>
    </form>
  );
}

// ── 비밀번호 찾기 (비로그인, 이메일 OTP) ──────────────────────────────────────
function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const [step,      setStep]      = useState<'email' | 'reset'>('email');
  const [email,     setEmail]     = useState('');
  const [code,      setCode]      = useState('');
  const [newPw,     setNewPw]     = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading,   setLoading]   = useState(false);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.show('이메일을 입력해 주세요', 'error');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setStep('reset');
      toast.show('인증번호를 이메일로 보냈습니다. 받은 편지함을 확인해 주세요.', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '발송에 실패했습니다', 'error');
    } finally { setLoading(false); }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 6) return toast.show('인증번호를 입력해 주세요', 'error');
    if (newPw.length < 8)       return toast.show('새 비밀번호는 8자 이상이어야 합니다', 'error');
    if (newPw !== confirmPw)    return toast.show('새 비밀번호가 일치하지 않습니다', 'error');
    setLoading(true);
    try {
      await verifyPasswordResetOtp(email, code);
      await setNewPassword(newPw);
      toast.show('비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해 주세요.', 'success');
      onBack();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '재설정 실패 — 인증번호를 확인해 주세요', 'error');
    } finally { setLoading(false); }
  };

  if (step === 'email') {
    return (
      <form onSubmit={sendCode} className="space-y-3">
        <p className="text-xs text-ink-secondary leading-relaxed">가입하신 이메일로 인증번호를 보내드립니다.</p>
        <Field label="이메일" type="email" required autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
          {loading ? '발송 중…' : '인증번호 받기'}
        </button>
        <button type="button" onClick={onBack} className="w-full text-2xs text-ink-muted hover:text-gold-300 transition-colors">
          로그인으로 돌아가기
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={reset} className="space-y-3">
      <p className="text-xs text-ink-secondary leading-relaxed">
        <b className="text-ink-primary">{email}</b> 로 보낸 인증번호와 새 비밀번호를 입력해 주세요.
      </p>
      <div>
        <label className="block text-xs font-medium text-ink-secondary mb-1.5">인증번호</label>
        <input
          type="text" inputMode="numeric" value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
          placeholder="이메일로 받은 인증번호" maxLength={8}
          className="input text-center font-bold tracking-[0.3em]" autoFocus
        />
      </div>
      <Field label="새 비밀번호" type="password" required autoComplete="new-password"
        value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="8자 이상" />
      <Field label="새 비밀번호 확인" type="password" required autoComplete="new-password"
        value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="새 비밀번호 재입력" />
      <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
        {loading ? '재설정 중…' : '비밀번호 재설정'}
      </button>
      <div className="flex justify-between text-2xs">
        <button type="button" onClick={() => setStep('email')} className="text-ink-muted hover:text-gold-300 transition-colors">코드 재전송</button>
        <button type="button" onClick={onBack} className="text-ink-muted hover:text-gold-300 transition-colors">로그인으로</button>
      </div>
    </form>
  );
}

// ── 일반 회원가입 ─────────────────────────────────────────────────────────────

function SignupUserForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [name,     setName]     = useState('');
  const nick = useNicknameCheck();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const { c, allRequired, allChecked, set, toggleAll } = useConsent();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 모든 항목 필수 — 하나라도 비면 가입 불가
    if (!name.trim())      return toast.show('이름을 입력해 주세요.', 'error');
    if (nick.status !== 'available') return toast.show('사용 가능한 닉네임을 입력해 주세요.', 'error');
    if (!email.trim())     return toast.show('이메일을 입력해 주세요.', 'error');
    if (password.length < 8) return toast.show('비밀번호는 8자 이상이어야 합니다.', 'error');
    if (!confirm.trim())   return toast.show('비밀번호 확인을 입력해 주세요.', 'error');
    if (password !== confirm) return toast.show('비밀번호가 일치하지 않습니다.', 'error');
    if (!c.age19)          return toast.show('만 19세 이상만 가입할 수 있습니다.', 'error');
    if (!c.terms)          return toast.show('서비스 이용약관에 동의해 주세요.', 'error');
    if (!c.privacy)        return toast.show('개인정보 수집·이용에 동의해 주세요.', 'error');
    if (!c.antiGambling)   return toast.show('불법 환전·사행성 금지 서약에 동의해 주세요.', 'error');

    setLoading(true);
    try {
      await signUpUser({
        email, password, name, nickname: nick.value.trim(),
        agreedToTerms:        c.terms,
        agreedToPrivacy:      c.privacy,
        agreedToAntiGambling: c.antiGambling,
        agreedToMarketing:    c.marketing,
      });
      toast.show('가입 완료! 이메일 인증 메일을 확인한 뒤 로그인해 주세요.', 'success');
      onDone();
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : '가입 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-3">
        <Field label="이름"           type="text"     placeholder="홍길동"          required value={name}     onChange={(e) => setName(e.target.value)} />
        <NicknameField value={nick.value} status={nick.status} onChange={nick.setValue} />
        <Field label="이메일"         type="email"    placeholder="you@example.com" required value={email}    onChange={(e) => setEmail(e.target.value)} />
        <Field label="비밀번호"       type="password" placeholder="8자 이상"        required value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
        <Field label="비밀번호 확인"  type="password" placeholder="••••••••"        required value={confirm}  onChange={(e) => setConfirm(e.target.value)} />

        <p className="rounded-input border border-border-subtle bg-surface-high px-2.5 py-2 text-2xs leading-relaxed text-ink-muted">
          🔒 가입 후 첫 로그인 시 <b className="text-ink-secondary">휴대폰 본인인증</b>이 필요합니다 (1인 1계정·안전거래).
        </p>

        <ConsentSection
          c={c} allRequired={allRequired} allChecked={allChecked}
          set={set} toggleAll={toggleAll}
          onView={setLegalDoc}
        />

        <button
          type="submit"
          disabled={
            loading || !allRequired || nick.status !== 'available'
            || !name.trim() || !email.trim() || password.length < 8 || password !== confirm
          }
          className="btn-primary w-full mt-2 disabled:opacity-60"
        >
          {loading ? '처리 중…' : '가입하기'}
        </button>
      </form>

      <LegalSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </>
  );
}

// ── 매장 업주 가입 ─────────────────────────────────────────────────────────────

function SignupOwnerForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [loading,   setLoading]   = useState(false);
  const [name,      setName]      = useState('');
  const nick = useNicknameCheck();
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [venueName, setVenueName] = useState('');
  const [region,    setRegion]    = useState('');
  const [address,   setAddress]   = useState('');
  const [phone,     setPhone]     = useState('');
  const [bizNum,    setBizNum]    = useState('');
  const [legalDoc,  setLegalDoc]  = useState<LegalDoc | null>(null);
  const { c, allRequired, allChecked, set, toggleAll } = useConsent();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!c.age19)        return toast.show('만 19세 이상만 가입할 수 있습니다.', 'error');
    if (!c.terms)        return toast.show('서비스 이용약관에 동의해 주세요.', 'error');
    if (!c.privacy)      return toast.show('개인정보 수집·이용에 동의해 주세요.', 'error');
    if (!c.antiGambling) return toast.show('불법 환전·사행성 금지 서약에 동의해 주세요.', 'error');
    if (nick.status !== 'available') return toast.show('사용 가능한 닉네임을 입력해 주세요.', 'error');

    setLoading(true);
    try {
      await signUpOwner({
        name, email, password, nickname: nick.value.trim(),
        agreedToTerms:        c.terms,
        agreedToPrivacy:      c.privacy,
        agreedToAntiGambling: c.antiGambling,
        agreedToMarketing:    c.marketing,
        venueName, region, address, phone, businessNumber: bizNum,
      });
      toast.show('업주 가입 신청 완료. 이메일 인증 후 로그인하면 운영자 승인을 거쳐 포스터 업로드가 활성화됩니다.', 'success');
      onDone();
    } catch (err: unknown) {
      toast.show(err instanceof Error ? err.message : '가입 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-3">
        {/* 안내 배너 */}
        <div className="flex items-start gap-2 p-3 rounded-input bg-gold-300/10 border border-gold-400/30">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#FFD100" strokeWidth="1.5" className="shrink-0 mt-0.5" aria-hidden>
            <circle cx="8" cy="8" r="6.5"/><line x1="8" y1="5" x2="8" y2="9"/><circle cx="8" cy="11.5" r="0.5" fill="#FFD100"/>
          </svg>
          <p className="text-xs text-gold-300 leading-relaxed">
            매장 업주는 <strong>운영자 승인</strong> 후 포스터 업로드 권한이 활성화됩니다.<br/>
            승인 처리는 영업일 기준 1~2일 소요됩니다.
          </p>
        </div>

        <section>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-secondary mb-2">계정 정보</p>
          <div className="space-y-3">
            <Field label="대표자명"  type="text"     placeholder="홍길동"          required value={name}     onChange={(e) => setName(e.target.value)} />
            <NicknameField value={nick.value} status={nick.status} onChange={nick.setValue} />
            <Field label="이메일"    type="email"    placeholder="you@example.com"  required value={email}    onChange={(e) => setEmail(e.target.value)} />
            <Field label="비밀번호"  type="password" placeholder="8자 이상"         required value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
          </div>
        </section>

        <section className="pt-2 border-t border-border-subtle">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-secondary mb-2 mt-2">매장 정보</p>
          <div className="space-y-3">
            <Field label="매장명"        type="text" placeholder="OO 홀덤펍"           required value={venueName} onChange={(e) => setVenueName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="지역"   type="text" placeholder="강남"          required value={region} onChange={(e) => setRegion(e.target.value)} />
              <Field label="연락처" type="tel"  placeholder="010-0000-0000" required value={phone}  onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Field label="상세 주소"      type="text" placeholder="서울시 강남구 …" required value={address} onChange={(e) => setAddress(e.target.value)} />
            <Field label="사업자등록번호" type="text" placeholder="000-00-00000"       required value={bizNum}  onChange={(e) => setBizNum(e.target.value)} />
            <p className="rounded-input border border-border-subtle bg-surface-high px-2.5 py-2 text-2xs leading-relaxed text-ink-muted">
              🔒 가입·승인 후 첫 로그인 시 <b className="text-ink-secondary">대표자 휴대폰 본인인증</b>이 필요합니다 (1인 1계정).
            </p>
          </div>
        </section>

        <ConsentSection
          c={c} allRequired={allRequired} allChecked={allChecked}
          set={set} toggleAll={toggleAll}
          onView={setLegalDoc}
        />

        <button
          type="submit"
          disabled={loading || !allRequired || nick.status !== 'available'}
          className="btn-primary w-full mt-3 disabled:opacity-60"
        >
          {loading ? '처리 중…' : '업주 가입 신청'}
        </button>
      </form>

      <LegalSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </>
  );
}

// ── 닉네임 필드 (실시간 중복검사) ─────────────────────────────────────────────

type NickStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const NICK_RE = /^[가-힣a-zA-Z0-9_-]{2,16}$/;

/**
 * 닉네임 입력 + 디바운스(350ms) 중복검사 훅.
 * 동기 상태(idle/invalid/checking)는 onChange 시점에 즉시 결정하고,
 * effect 는 'checking' 일 때만 디바운스된 비동기 RPC 를 수행한다.
 * (effect 내 동기 setState 회피 — 권장 패턴)
 * status === 'available' 일 때만 가입 허용(상위 폼에서 disabled 처리).
 */
function useNicknameCheck() {
  const [value, setValueRaw] = useState('');
  const [status, setStatus]  = useState<NickStatus>('idle');
  const reqIdRef = useRef(0);

  const setValue = (raw: string) => {
    setValueRaw(raw);
    const v = raw.trim();
    if (v.length === 0)      setStatus('idle');
    else if (!NICK_RE.test(v)) setStatus('invalid');
    else                     setStatus('checking'); // effect 가 RPC 수행
  };

  // 'checking' 상태일 때만 디바운스 RPC 실행
  useEffect(() => {
    if (status !== 'checking') return;
    const v = value.trim();
    const myReq = ++reqIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const ok = await checkNicknameAvailable(v);
        if (myReq === reqIdRef.current) setStatus(ok ? 'available' : 'taken');
      } catch {
        if (myReq === reqIdRef.current) setStatus('idle'); // 검사 실패 시 서버 유니크가 최종 방어
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [status, value]);

  return { value, setValue, status };
}

function NicknameField({
  value, status, onChange,
}: { value: string; status: NickStatus; onChange: (v: string) => void }) {
  const hint: Record<NickStatus, { text: string; cls: string } | null> = {
    idle:      null,
    checking:  { text: '확인 중…',              cls: 'text-ink-muted' },
    available: { text: '✓ 사용 가능한 닉네임입니다', cls: 'text-emerald-400' },
    taken:     { text: '✗ 이미 사용 중인 닉네임입니다', cls: 'text-danger' },
    invalid:   { text: '2~16자 한글·영문·숫자·_- 만 가능', cls: 'text-amber-400' },
  };
  const h = hint[status];
  return (
    <div>
      <label className="block text-xs font-medium text-ink-secondary mb-1">
        닉네임 <span className="text-danger">*</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="2~16자 (한글/영문/숫자)"
        maxLength={16}
        required
        className={[
          'input',
          status === 'taken' || status === 'invalid' ? 'border-danger/50' :
          status === 'available' ? 'border-emerald-500/50' : '',
        ].join(' ')}
      />
      {h && <p className={`mt-1 text-2xs ${h.cls}`} aria-live="polite">{h.text}</p>}
    </div>
  );
}

// ── 폼 필드 헬퍼 ──────────────────────────────────────────────────────────────

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-secondary mb-1">
        {label}{rest.required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <input {...rest} className="input" />
    </div>
  );
}
