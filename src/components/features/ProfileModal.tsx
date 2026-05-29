// src/components/features/ProfileModal.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import Modal from '../atoms/Modal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { IS_MOCK } from '../../lib/supabase';
import { resizeImage } from '../../lib/storage';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

type Tab = 'profile' | 'security';

const ROLE_LABELS: Record<string, string> = {
  user:        '일반 회원',
  venue_owner: '매장 업주',
  admin:       '관리자',
};

const COLOR_PALETTE = [
  '#FFD100', '#0EA5E9', '#22C55E', '#A855F7',
  '#EF4444', '#F97316', '#14B8A6', '#E879F9',
  '#64748B', '#EC4899',
];

// base64 변환 (mock 모드 avatar 영구 저장용)
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

export default function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { user, updateProfile, changePassword } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('profile');

  // ── 기본 정보 상태 ─────────────────────────────────────────────────────
  const [name,          setName]         = useState('');
  const [selectedColor, setColor]        = useState('#FFD100');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarFile,    setAvatarFile]   = useState<File | null>(null);
  const [saving,        setSaving]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 보안 상태 ──────────────────────────────────────────────────────────
  const [currentPw,    setCurrentPw]   = useState('');
  const [newPw,        setNewPw]       = useState('');
  const [confirmPw,    setConfirmPw]   = useState('');
  const [showCurrent,  setShowCurrent] = useState(false);
  const [showNew,      setShowNew]     = useState(false);
  const [showConfirm,  setShowConfirm] = useState(false);
  const [changingPw,   setChangingPw]  = useState(false);

  // 모달 열릴 때마다 폼 초기화
  useEffect(() => {
    if (!open || !user) return;
    setTab('profile');
    setName(user.name);
    setColor(user.avatarColor ?? '#FFD100');
    setAvatarPreview(user.avatarUrl ?? '');
    setAvatarFile(null);
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setShowCurrent(false); setShowNew(false); setShowConfirm(false);
  }, [open, user]);

  // ── 비밀번호 변경 (useCallback은 반드시 early return 전에 선언해야 함) ──────
  const handlePasswordChange = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!IS_MOCK && !currentPw) return toast.show('현재 비밀번호를 입력해 주세요', 'error');
    if (newPw.length < 8)       return toast.show('새 비밀번호는 8자 이상이어야 합니다', 'error');
    if (newPw !== confirmPw)    return toast.show('새 비밀번호가 일치하지 않습니다', 'error');
    setChangingPw(true);
    try {
      await changePassword(currentPw, newPw);
      toast.show('비밀번호가 변경되었습니다', 'success');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '비밀번호 변경 실패', 'error');
    } finally {
      setChangingPw(false);
    }
  }, [currentPw, newPw, confirmPw, changePassword, toast]);

  if (!user) return null;

  // ── 아바타 선택 ────────────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.show('이미지는 5MB 이하여야 합니다', 'error');
      return;
    }
    setAvatarFile(file);
    const blob = await resizeImage(file, 256, 256, 0.9);
    setAvatarPreview(URL.createObjectURL(blob));
  };

  const removeAvatar = () => { setAvatarFile(null); setAvatarPreview(''); };

  // ── 프로필 저장 ────────────────────────────────────────────────────────
  const handleProfileSave = async () => {
    if (!name.trim()) return toast.show('닉네임을 입력해 주세요', 'error');
    if (name.trim().length < 2) return toast.show('닉네임은 2자 이상이어야 합니다', 'error');
    setSaving(true);
    try {
      let avatarUrl = avatarPreview || undefined;

      if (avatarFile) {
        const blob = await resizeImage(avatarFile, 256, 256, 0.9);
        if (IS_MOCK) {
          // Mock: base64로 localStorage에 영구 저장
          avatarUrl = await blobToBase64(blob);
        } else {
          const { uploadAvatar } = await import('../../lib/storage');
          avatarUrl = await uploadAvatar(user.id, avatarFile);
        }
      }

      await updateProfile({
        name:        name.trim(),
        avatarColor: selectedColor,
        avatarUrl:   avatarFile ? avatarUrl : (avatarPreview || undefined),
      });

      toast.show('프로필이 저장되었습니다', 'success');
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="프로필 관리" maxWidth="sm" variant="sheet">
      {/* ── 탭 바 ─────────────────────────────────────────────────── */}
      <div className="flex border-b border-border-subtle">
        {(['profile', 'security'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={[
              'flex-1 py-3 text-sm font-medium border-b-2 -mb-px transition-colors focus:outline-none',
              tab === t
                ? 'border-gold-300 text-gold-300'
                : 'border-transparent text-ink-muted hover:text-ink-secondary',
            ].join(' ')}
          >
            {t === 'profile' ? '기본 정보' : '보안'}
          </button>
        ))}
      </div>

      {/* ── 기본 정보 탭 ──────────────────────────────────────────── */}
      {tab === 'profile' && (
        <div className="p-4 space-y-5">

          {/* 아바타 */}
          <div className="flex flex-col items-center gap-3 pt-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative w-24 h-24 rounded-full overflow-hidden group
                           ring-4 ring-border-default hover:ring-gold-300 transition-all"
                aria-label="프로필 사진 변경"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="프로필" className="w-full h-full object-cover" />
                ) : (
                  <span
                    className="w-full h-full flex items-center justify-center text-4xl font-bold text-white"
                    style={{ background: selectedColor }}
                  >
                    {(name || user.name)[0]?.toUpperCase()}
                  </span>
                )}
                {/* 호버 오버레이 */}
                <span className="absolute inset-0 bg-black/50 flex items-center justify-center
                                 opacity-0 group-hover:opacity-100 transition-opacity">
                  <CameraIcon />
                </span>
              </button>

              {/* 제거 버튼 */}
              {avatarPreview && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full
                             bg-danger text-white text-xs flex items-center justify-center
                             hover:bg-danger-dark transition-colors focus:outline-none"
                  aria-label="사진 제거"
                >
                  ✕
                </button>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <p className="text-2xs text-ink-muted">클릭하여 사진 변경 · JPG / PNG / WEBP · 최대 5MB</p>

            {/* 배경색 팔레트 (사진 없을 때) */}
            {!avatarPreview && (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="text-2xs text-ink-muted">배경색</span>
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`색상 ${c}`}
                    className={[
                      'w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none border-2',
                      selectedColor === c ? 'border-white scale-110' : 'border-transparent',
                    ].join(' ')}
                    style={{ background: c }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 닉네임 */}
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">
              닉네임 <span className="text-danger ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="닉네임 입력 (2~20자)"
              className="input"
            />
            <p className="mt-1 text-right text-2xs text-ink-muted">{name.length} / 20</p>
          </div>

          {/* 이메일 (읽기 전용) */}
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">이메일</label>
            <div className="input cursor-default select-all text-ink-muted bg-surface-mid">
              {user.email}
            </div>
            <p className="mt-1 text-2xs text-ink-muted">이메일은 변경할 수 없습니다</p>
          </div>

          {/* 계정 정보 요약 */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-card bg-surface-high border border-border-subtle text-xs">
            <span className={[
              'px-2 py-0.5 rounded-badge font-bold text-2xs',
              user.role === 'admin'
                ? 'bg-purple-500/20 text-purple-300'
                : user.role === 'venue_owner'
                  ? 'bg-gold-300/20 text-gold-300'
                  : 'bg-surface-float text-ink-secondary',
            ].join(' ')}>
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
            {user.role === 'venue_owner' && (
              <span className={user.approved ? 'text-emerald-400' : 'text-amber-400'}>
                {user.approved ? '✓ 승인됨' : '⏳ 승인 대기'}
              </span>
            )}
            {user.joinedAt && (
              <span className="ml-auto text-ink-muted">
                {new Date(user.joinedAt).toLocaleDateString('ko-KR')} 가입
              </span>
            )}
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              취소
            </button>
            <button
              type="button"
              onClick={handleProfileSave}
              disabled={saving}
              className="btn-primary flex-1 disabled:opacity-60"
            >
              {saving ? '저장 중…' : '저장하기'}
            </button>
          </div>
        </div>
      )}

      {/* ── 보안 탭 ───────────────────────────────────────────────── */}
      {tab === 'security' && (
        <form onSubmit={handlePasswordChange} className="p-4 space-y-4">

          <div className="flex items-start gap-2 p-3 rounded-card bg-surface-high border border-border-subtle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9AA3B2"
              strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5" aria-hidden>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-xs text-ink-muted leading-relaxed">
              {IS_MOCK
                ? '데모 모드에서는 비밀번호 변경이 시뮬레이션됩니다.'
                : '비밀번호는 8자 이상, 영문·숫자 조합을 권장합니다. 주기적으로 변경해 보안을 강화하세요.'}
            </p>
          </div>

          {/* 현재 비밀번호 (실서버 전용) */}
          {!IS_MOCK && (
            <PwField
              label="현재 비밀번호"
              value={currentPw}
              onChange={setCurrentPw}
              show={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
              placeholder="현재 비밀번호 입력"
              autoComplete="current-password"
            />
          )}

          {/* 새 비밀번호 */}
          <PwField
            label="새 비밀번호"
            value={newPw}
            onChange={setNewPw}
            show={showNew}
            onToggle={() => setShowNew((v) => !v)}
            placeholder="8자 이상 입력"
            autoComplete="new-password"
          />

          {/* 비밀번호 강도 */}
          {newPw.length > 0 && <PasswordStrength password={newPw} />}

          {/* 새 비밀번호 확인 */}
          <PwField
            label="새 비밀번호 확인"
            value={confirmPw}
            onChange={setConfirmPw}
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
            placeholder="새 비밀번호 재입력"
            autoComplete="new-password"
            hint={
              confirmPw.length > 0
                ? newPw === confirmPw
                  ? { ok: true,  text: '비밀번호가 일치합니다' }
                  : { ok: false, text: '비밀번호가 일치하지 않습니다' }
                : null
            }
          />

          <button
            type="submit"
            disabled={changingPw || !newPw || newPw !== confirmPw || newPw.length < 8}
            className="btn-primary w-full disabled:opacity-60"
          >
            {changingPw ? '변경 중…' : '비밀번호 변경'}
          </button>
        </form>
      )}
    </Modal>
  );
}

// ── 비밀번호 입력 필드 ────────────────────────────────────────────────────────

interface PwFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder: string;
  autoComplete?: string;
  hint?: { ok: boolean; text: string } | null;
}

function PwField({ label, value, onChange, show, onToggle, placeholder, autoComplete, hint }: PwFieldProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-secondary mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="input pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-secondary transition-colors focus:outline-none"
          aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {hint && (
        <p className={['mt-1 text-2xs', hint.ok ? 'text-emerald-400' : 'text-danger'].join(' ')}>
          {hint.ok ? '✓ ' : '✗ '}{hint.text}
        </p>
      )}
    </div>
  );
}

// ── 비밀번호 강도 ─────────────────────────────────────────────────────────────

const STRENGTH_LEVELS = [
  { bar: 'bg-danger',      text: 'text-red-400',     label: '매우 약함' },
  { bar: 'bg-amber-500',   text: 'text-amber-400',   label: '약함'     },
  { bar: 'bg-blue-400',    text: 'text-blue-400',    label: '보통'     },
  { bar: 'bg-emerald-400', text: 'text-emerald-400', label: '강함'     },
];

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8자 이상',      ok: password.length >= 8 },
    { label: '영문 포함',     ok: /[a-zA-Z]/.test(password) },
    { label: '숫자 포함',     ok: /\d/.test(password) },
    { label: '특수문자 포함', ok: /[!@#$%^&*\-_=+]/.test(password) },
  ];
  const score = Math.max(0, checks.filter((c) => c.ok).length - 1); // 0~3
  const level = STRENGTH_LEVELS[score];

  return (
    <div className="space-y-2">
      {/* 강도 바 */}
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={[
              'flex-1 h-1 rounded-full transition-all duration-300',
              i <= score ? level.bar : 'bg-surface-float',
            ].join(' ')}
          />
        ))}
      </div>
      {/* 조건 체크 + 등급 */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {checks.map((c) => (
            <span
              key={c.label}
              className={['text-2xs', c.ok ? 'text-emerald-400' : 'text-ink-muted'].join(' ')}
            >
              {c.ok ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
        <span className={['text-2xs font-bold shrink-0', level.text].join(' ')}>
          {level.label}
        </span>
      </div>
    </div>
  );
}

// ── 아이콘 ────────────────────────────────────────────────────────────────────

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8
               a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8
               a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4
               c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}
