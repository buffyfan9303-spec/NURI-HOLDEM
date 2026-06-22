// src/components/features/ProfileModal.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Modal from '../atoms/Modal';
import UnderlineTabs from '../atoms/UnderlineTabs';
import { useToast } from '../atoms/Toast';
// (프로필 카드 이미지 저장 기능 제거 — 2026-06-15 사장님 요청)
import { useAuth } from '../../contexts/AuthContext';
import { useBlocks } from '../../contexts/BlockContext';
import { IS_MOCK } from '../../lib/supabase';
import { resizeImage } from '../../lib/storage';
import { requestPasswordChangeCode, changeMyPasswordWithCode, setMyNickname, withdrawMyAccount, verifyMyPassword } from '../../api/auth';
import { pushSupported, isPushSubscribed, enablePush, disablePush } from '../../api/push';
import AvatarCropper from './AvatarCropper';
import ActivityBadges from '../atoms/ActivityBadges';
import IdentityVerificationButton from './IdentityVerificationButton';
import { getMyVisitStats } from '../../api/reservations';
import type { LegalDoc } from './LegalDocsModal';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  onOpenLegal?: (d: LegalDoc) => void;
  onOpenSupport?: () => void;
}

type Tab = 'profile' | 'security';

const ROLE_LABELS: Record<string, string> = {
  user:        '일반 회원',
  venue_owner: '매장 업주',
  venue_staff: '가게 직원',
  admin:       '운영자',
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

export default function ProfileModal({ open, onClose, onOpenLegal, onOpenSupport }: ProfileModalProps) {
  const { user, updateProfile, refreshProfile } = useAuth();
  const toast = useToast();
  const [visitStats, setVisitStats] = useState({ visits: 0, upcoming: 0, total: 0 });
  useEffect(() => { if (open) getMyVisitStats().then(setVisitStats).catch(() => {}); }, [open]);

  const [tab, setTab] = useState<Tab>('profile');

  // ── 기본 정보 상태 ─────────────────────────────────────────────────────
  const [name,          setName]         = useState('');
  const [recvId,        setRecvId]       = useState(''); // 받는 아이디(닉네임) 최초 설정용
  const [recvBusy,      setRecvBusy]     = useState(false);
  const [selectedColor, setColor]        = useState('#FFD100');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarFile,    setAvatarFile]   = useState<File | null>(null);
  const [saving,        setSaving]       = useState(false);
  const [cropFile,      setCropFile]     = useState<File | null>(null); // 크롭 편집 대상
  const fileRef = useRef<HTMLInputElement>(null);

  // ── 보안 상태 (비밀번호 변경 = 이메일 인증 OTP) ──────────────────────────
  const [newPw,        setNewPw]       = useState('');
  const [confirmPw,    setConfirmPw]   = useState('');
  const [showNew,      setShowNew]     = useState(false);
  const [showConfirm,  setShowConfirm] = useState(false);
  const [code,         setCode]        = useState('');     // 이메일로 받은 6자리 OTP
  const [codeSent,     setCodeSent]    = useState(false);  // 코드 발송 단계 여부
  const [sendingCode,  setSendingCode] = useState(false);
  const [changingPw,   setChangingPw]  = useState(false);

  // 모달이 "열리는 순간"에만 폼 초기화 (이후 user 객체가 새로 들어와도 입력 유지)
  //  — 탭 복귀/토큰 갱신 시 onAuthStateChange가 setUser를 호출해도
  //    진행 중이던 비밀번호 변경 OTP 단계가 리셋되지 않도록 함.
  const initRef = useRef(false);
  useEffect(() => {
    if (!open) { initRef.current = false; return; }
    if (initRef.current || !user) return;
    initRef.current = true;

    setName(user.name);
    setColor(user.avatarColor ?? '#FFD100');
    setAvatarPreview(user.avatarUrl ?? '');
    setAvatarFile(null);
    setNewPw(''); setConfirmPw(''); setCode('');
    setShowNew(false); setShowConfirm(false);
    setSendingCode(false);

    // 진행 중이던 비밀번호 변경 OTP 복원
    //  (메일 앱을 다녀오며 모바일에서 페이지가 리로드돼도 코드 입력 화면으로 복귀)
    const pending = sessionStorage.getItem('nh_pw_otp');
    const fresh = pending && Date.now() - Number(pending) < 5 * 60 * 1000;
    if (fresh) {
      setTab('security');
      setCodeSent(true);
    } else {
      sessionStorage.removeItem('nh_pw_otp');
      setTab('profile');
      setCodeSent(false);
    }
  }, [open, user]);

  // ── 비밀번호 변경 = 이메일 인증 OTP (useCallback은 early return 전에 선언) ──
  // 1) 새 비밀번호 입력 후 가입 이메일로 인증코드 발송
  const handleSendCode = useCallback(async () => {
    if (newPw.length < 8)    return toast.show('새 비밀번호는 8자 이상이어야 합니다', 'error');
    if (newPw !== confirmPw) return toast.show('새 비밀번호가 일치하지 않습니다', 'error');
    setSendingCode(true);
    try {
      await requestPasswordChangeCode();
      setCodeSent(true);
      sessionStorage.setItem('nh_pw_otp', String(Date.now()));
      toast.show('이메일로 인증코드를 보냈습니다. 받은 편지함을 확인해 주세요.', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '인증코드 발송 실패', 'error');
    } finally {
      setSendingCode(false);
    }
  }, [newPw, confirmPw, toast]);

  // 2) 이메일 코드 + 새 비밀번호로 변경 확정
  const handleConfirmChange = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!IS_MOCK && code.trim().length < 6) return toast.show('이메일로 받은 인증번호를 입력해 주세요', 'error');
    setChangingPw(true);
    try {
      await changeMyPasswordWithCode(newPw, code.trim());
      toast.show('비밀번호가 변경되었습니다', 'success');
      sessionStorage.removeItem('nh_pw_otp');
      setNewPw(''); setConfirmPw(''); setCode(''); setCodeSent(false);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '비밀번호 변경 실패', 'error');
    } finally {
      setChangingPw(false);
    }
  }, [newPw, code, toast]);

  // 받는 아이디(닉네임) 최초 설정 — 설정 후 잠김(변경은 운영자)
  const saveRecvId = useCallback(async () => {
    const v = recvId.trim();
    if (v.length < 2) { toast.show('아이디(닉네임)는 2자 이상이어야 합니다', 'error'); return; }
    setRecvBusy(true);
    try {
      await setMyNickname(v);
      toast.show('받는 아이디(닉네임)를 설정했습니다', 'success');
      await refreshProfile().catch(() => {});
      setRecvId('');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '설정 실패', 'error');
    } finally { setRecvBusy(false); }
  }, [recvId, toast, refreshProfile]);

  if (!user) return null;

  // ── 닉네임(name) 30일 변경 제한 (관리자 제외) ────────────────────────────
  const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
  const lastNameChange = user.nameChangedAt ? new Date(user.nameChangedAt).getTime() : 0;
  const nextNameChange = lastNameChange + COOLDOWN_MS;
  const nicknameLocked = user.role !== 'admin' && lastNameChange > 0 && Date.now() < nextNameChange;
  const nextNameDateStr = new Date(nextNameChange).toLocaleDateString('ko-KR');

  // ── 아바타 선택 → 크롭 편집기 ──────────────────────────────────────────
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택도 다시 트리거되도록
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.show('이미지는 5MB 이하여야 합니다', 'error');
      return;
    }
    setCropFile(file);
  };

  // 크롭 적용 → 정사각 blob을 아바타로 설정
  const handleCropApply = (blob: Blob) => {
    const f = new File([blob], 'avatar.webp', { type: 'image/webp' });
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(blob));
    setCropFile(null);
  };

  const removeAvatar = () => { setAvatarFile(null); setAvatarPreview(''); };

  // ── 프로필 저장 ────────────────────────────────────────────────────────
  const handleProfileSave = async () => {
    if (!name.trim()) return toast.show('닉네임을 입력해 주세요', 'error');
    if (name.trim().length < 2) return toast.show('닉네임은 2자 이상이어야 합니다', 'error');
    if (nicknameLocked && name.trim() !== user.name) {
      return toast.show(`닉네임은 ${nextNameDateStr} 이후에 변경할 수 있습니다`, 'error');
    }
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
    <Modal open={open} onClose={() => { sessionStorage.removeItem('nh_pw_otp'); onClose(); }} title="프로필 관리" maxWidth="sm" variant="sheet">
      {/* ── 탭 바 (골드 밑줄 스프링 슬라이드) ─────────────────────────── */}
      <UnderlineTabs
        items={[{ key: 'profile', label: '기본 정보' }, { key: 'security', label: '보안' }]}
        value={tab} onChange={setTab} />

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

          {/* 내 활동 · 뱃지 진열장 */}
          <ActivityBadges points={user?.activityPoints ?? 0} visits={visitStats.visits} upcoming={visitStats.upcoming} />


          {/* 본인인증 (1인 1계정) */}
          {user?.verified ? (
            <div className="flex items-center gap-2 rounded-card border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2.5">
              <span className="text-base" aria-hidden>✅</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-300">본인인증 완료</p>
                <p className="text-2xs text-ink-muted">{user.realName ? `실명 ${user.realName} · ` : ''}1인 1계정 인증됨</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 rounded-card border border-gold-400/30 bg-gold-300/[0.06] p-3">
              <p className="text-sm font-semibold text-gold-300">휴대폰 본인인증</p>
              <p className="text-2xs text-ink-muted leading-relaxed">안전한 거래와 1인 1계정을 위해 휴대폰 실명인증이 필요합니다. 매장이용권 등 일부 기능에 사용됩니다.</p>
              <IdentityVerificationButton onVerified={() => { refreshProfile().catch(() => {}); }} />
            </div>
          )}

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
              disabled={nicknameLocked}
              className="input disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <div className="mt-1 flex items-start justify-between gap-2">
              <p className={['text-2xs leading-relaxed', nicknameLocked ? 'text-amber-400' : 'text-ink-muted'].join(' ')}>
                {nicknameLocked
                  ? `30일에 한 번만 변경 가능 · 다음 변경 가능일 ${nextNameDateStr}`
                  : '닉네임은 변경 후 30일간 다시 바꿀 수 없습니다'}
              </p>
              <p className="text-2xs text-ink-muted shrink-0">{name.length} / 20</p>
            </div>
          </div>

          {/* 받는 아이디(닉네임) — 매장이용권 수령용. 최초 1회 설정, 변경은 운영자 */}
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">받는 아이디 <span className="text-2xs font-normal text-ink-muted">(매장이용권 수령용)</span></label>
            {user.nickname ? (
              <>
                <div className="flex items-center justify-between gap-2 rounded-input border border-border-default bg-surface-high/60 px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-ink-primary">{user.nickname}</span>
                  <span className="shrink-0 text-2xs text-ink-muted">🔒 설정 완료</span>
                </div>
                <p className="mt-1 text-2xs leading-relaxed text-amber-400">초기 설정이 완료되었습니다. <b>변경은 운영자에게 문의</b>하세요.</p>
              </>
            ) : (
              <>
                <div className="flex gap-1.5">
                  <input type="text" value={recvId} onChange={(e) => setRecvId(e.target.value)} maxLength={20} placeholder="받을 아이디 (2~20자, 중복 불가)" className="input min-w-0 flex-1" />
                  <button type="button" onClick={saveRecvId} disabled={recvBusy} className="btn-primary shrink-0 px-4 text-sm disabled:opacity-60">{recvBusy ? '설정 중…' : '설정'}</button>
                </div>
                <p className="mt-1 text-2xs leading-relaxed text-ink-muted">매장이용권을 받을 때 쓰는 고유 아이디입니다. <b className="text-amber-400">최초 1회만 설정</b>되며, 이후 변경은 운영자를 통해서만 가능합니다.</p>
              </>
            )}
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
                {user.approved ? '승인됨' : '승인 대기'}
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

          {/* 고객센터 1:1 문의 */}
          {onOpenSupport && (
            <button type="button" onClick={() => { onClose(); onOpenSupport(); }}
              className="flex w-full items-center gap-2 rounded-card border border-border-default bg-surface-high px-3 py-2.5 text-left transition-colors hover:border-gold-400/40">
              <span aria-hidden>💬</span>
              <span className="flex-1 text-sm font-semibold text-ink-primary">고객센터 1:1 문의</span>
              <span className="text-2xs text-ink-muted">문의·답변 확인 →</span>
            </button>
          )}

          {/* 약관 및 정책 */}
          {onOpenLegal && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle pt-3 text-2xs text-ink-muted">
              <button type="button" onClick={() => onOpenLegal('terms')} className="transition-colors hover:text-gold-300">이용약관</button>
              <span className="text-border-strong">·</span>
              <button type="button" onClick={() => onOpenLegal('privacy')} className="transition-colors hover:text-gold-300">개인정보처리방침</button>
              <span className="text-border-strong">·</span>
              <button type="button" onClick={() => onOpenLegal('refund')} className="transition-colors hover:text-gold-300">취소·환불 정책</button>
              <span className="text-border-strong">·</span>
              <button type="button" onClick={() => onOpenLegal('location')} className="transition-colors hover:text-gold-300">위치기반서비스 이용약관</button>
            </div>
          )}
        </div>
      )}

      {/* ── 보안 탭 ───────────────────────────────────────────────── */}
      {tab === 'security' && (
        <>
        <form onSubmit={handleConfirmChange} className="p-4 space-y-4">

          <div className="flex items-start gap-2 p-3 rounded-card bg-surface-high border border-border-subtle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9AA3B2"
              strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5" aria-hidden>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className="text-xs text-ink-muted leading-relaxed">
              {IS_MOCK
                ? '데모 모드에서는 비밀번호 변경이 시뮬레이션됩니다.'
                : '보안을 위해 새 비밀번호 설정 후, 가입 이메일로 받은 이메일 인증번호를 입력해야 변경됩니다.'}
            </p>
          </div>

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

          {!codeSent ? (
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode || !newPw || newPw !== confirmPw || newPw.length < 8}
              className="btn-primary w-full disabled:opacity-60"
            >
              {sendingCode ? '인증코드 발송 중…' : '이메일로 인증코드 받기'}
            </button>
          ) : (
            <div className="space-y-3">
              {!newPw && (
                <p className="text-2xs text-amber-400 leading-relaxed bg-amber-500/10 border border-amber-500/30 rounded-input px-3 py-2">
                  메일 확인 후 돌아오셨네요. 위에 새 비밀번호를 다시 입력한 뒤, 메일로 받은 인증번호로 변경을 완료하세요.
                </p>
              )}
              <div>
                <label className="block text-xs font-medium text-ink-secondary mb-1.5">이메일 인증코드</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                  placeholder="이메일로 받은 인증번호"
                  maxLength={8}
                  className="input text-center font-bold tracking-[0.3em]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode}
                  className="mt-1 text-2xs text-ink-muted hover:text-gold-300 transition-colors disabled:opacity-50"
                >
                  코드 재전송
                </button>
              </div>
              <button
                type="submit"
                disabled={changingPw || (!IS_MOCK && code.length < 6)}
                className="btn-primary w-full disabled:opacity-60"
              >
                {changingPw ? '변경 중…' : '비밀번호 변경'}
              </button>
            </div>
          )}
        </form>
        <PushNotificationSetting />
        <BlockListSection />
        <WithdrawAccountSection />
        </>
      )}

      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onApply={handleCropApply}
        />
      )}
    </Modal>
  );
}

// ── 푸시 알림 설정 ─────────────────────────────────────────────────────────────

function PushNotificationSetting() {
  const toast = useToast();
  const [supported] = useState(() => pushSupported());
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { isPushSubscribed().then(setOn).catch(() => {}); }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) { await disablePush(); setOn(false); toast.show('푸시 알림을 껐습니다', 'info'); }
      else { await enablePush(); setOn(true); toast.show('푸시 알림을 켰습니다', 'info'); }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '처리에 실패했습니다', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="px-4 pb-5 -mt-1">
      <h3 className="text-xs font-semibold text-ink-secondary mb-2">알림</h3>
      <div className="flex items-center gap-3 p-3 rounded-card bg-surface-high border border-border-subtle">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-primary">푸시 알림</p>
          <p className="text-2xs text-ink-muted mt-0.5 leading-relaxed">
            {supported
              ? '댓글·승인·팔로우 매장 새 포스터를 브라우저 알림으로 받습니다'
              : '이 브라우저는 푸시 알림을 지원하지 않습니다'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={!supported || busy}
          aria-pressed={on}
          aria-label="푸시 알림 토글"
          className={[
            'relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40',
            on ? 'bg-gold-300' : 'bg-surface-float',
          ].join(' ')}
        >
          <motion.span
            initial={false}
            animate={{ x: on ? 20 : 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 32 }}
            className={[
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white',
          ].join(' ')} />
        </button>
      </div>
    </div>
  );
}

// ── 차단 목록 관리 ────────────────────────────────────────────────────────────
function BlockListSection() {
  const { blocks, unblock } = useBlocks();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const doUnblock = async (id: string, name: string) => {
    setBusy(id);
    try { await unblock(id); toast.show(`'${name}' 차단을 해제했습니다`, 'info'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '해제 실패', 'error'); }
    finally { setBusy(null); }
  };

  return (
    <div className="px-4 pb-4 -mt-1">
      <h3 className="mb-2 text-xs font-semibold text-ink-secondary">차단한 사용자 {blocks.length > 0 && <span className="text-ink-muted">({blocks.length})</span>}</h3>
      {blocks.length === 0 ? (
        <p className="rounded-card border border-border-subtle bg-surface-high px-3 py-3 text-2xs text-ink-muted">차단한 사용자가 없습니다. 글·매물에서 ‘차단’을 누르면 그 사용자의 글이 보이지 않게 됩니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {blocks.map((b) => (
            <li key={b.blockedId} className="flex items-center gap-2 rounded-card border border-border-subtle bg-surface-high px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{b.name}</span>
              <button type="button" onClick={() => doUnblock(b.blockedId, b.name)} disabled={busy === b.blockedId}
                className="shrink-0 rounded-input border border-border-default px-2.5 py-1 text-2xs font-bold text-ink-secondary hover:text-gold-300 disabled:opacity-50">
                {busy === b.blockedId ? '해제 중…' : '차단 해제'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 회원 탈퇴 ─────────────────────────────────────────────────────────────────
// 개인정보(실명·전화·CI·생년월일 등)를 파기하고 계정을 폐쇄. 복구 불가.
// 본인 확인 = 현재 비밀번호 입력(재인증). 매장 대표는 서버가 거부(매장 정리 먼저).
function WithdrawAccountSection() {
  const { logout } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password) { toast.show('비밀번호를 입력하세요', 'error'); return; }
    setBusy(true);
    try {
      const ok = await verifyMyPassword(password);
      if (!ok) { toast.show('비밀번호가 일치하지 않습니다', 'error'); setBusy(false); return; }
      await withdrawMyAccount();
      toast.show('회원 탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.', 'success');
      try { await logout(); } catch { /* ignore */ }
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '탈퇴에 실패했습니다', 'error');
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pb-6 -mt-1">
      <h3 className="mb-2 text-xs font-semibold text-ink-secondary">회원 탈퇴</h3>
      {!open ? (
        <button type="button" onClick={() => { setPassword(''); setOpen(true); }}
          className="w-full rounded-card border border-danger/30 bg-danger/[0.04] px-3 py-2.5 text-left">
          <p className="text-sm font-bold text-danger">회원 탈퇴하기</p>
          <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">계정을 폐쇄하고 개인정보(실명·연락처·본인인증 정보 등)를 파기합니다. 되돌릴 수 없습니다.</p>
        </button>
      ) : (
        <div className="space-y-2.5 rounded-card border border-danger/40 bg-danger/[0.05] p-3">
          <p className="text-2xs leading-relaxed text-ink-secondary">
            탈퇴 시 <b className="text-danger">실명·전화번호·본인인증 정보·생년월일 등 개인정보가 즉시 파기</b>되고 계정이 폐쇄되며, <b className="text-ink-primary">다시 로그인할 수 없습니다.</b> 보유 중인 매장이용권 등은 함께 사라집니다.
            <br />매장 대표는 매장을 먼저 정리(삭제/양도)한 뒤 탈퇴할 수 있습니다.
          </p>
          <label className="block">
            <span className="mb-1 block text-2xs font-semibold text-ink-secondary">본인 확인 — 현재 비밀번호를 입력하세요</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" placeholder="현재 비밀번호"
              onKeyDown={(e) => { if (e.key === 'Enter' && password && !busy) submit(); }}
              className="input w-full text-sm" />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn-ghost flex-1 text-sm">취소</button>
            <button type="button" onClick={submit} disabled={busy || !password}
              className="flex-1 rounded-input bg-danger py-2 text-sm font-bold text-white disabled:opacity-40">{busy ? '처리 중…' : '탈퇴하기'}</button>
          </div>
        </div>
      )}
    </div>
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
