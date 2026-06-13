// src/api/auth.ts
import { supabase, IS_MOCK } from '../lib/supabase';

export type UserRole   = 'user' | 'venue_owner' | 'venue_staff' | 'admin';
// 'withdrawn' = 강제 탈퇴(Stage 3). 정지(suspended)/영구정지(banned)와 구분.
export type UserStatus = 'active' | 'suspended' | 'banned' | 'pending' | 'withdrawn';

export interface User {
  id: string;
  email: string;
  name: string;
  nickname?: string;       // 표시용 닉네임 (Stage 3, unique)
  role: UserRole;
  approved?: boolean;
  venueId?: string;
  avatarColor?: string;
  avatarUrl?: string;
  status?: UserStatus;
  suspendedUntil?: string;
  sanctionReason?: string; // 관리자 제재 사유 (Stage 3)
  agreedToTerms?: boolean;  // 법적 동의 여부 — 구글 OAuth 동의 게이트 판별용
  joinedAt?: string;
  lastSeenAt?: string;      // 최근 접속 시각 (관리자 회원관리 표시용)
  nameChangedAt?: string;   // 닉네임(name) 마지막 변경 시각 — 30일 쿨다운 판별
  venueVerified?: boolean;  // 업주 본인 매장이 인증(verified)인지 — 업주 커뮤니티 게이트
  activityPoints?: number;  // 활동 점수(배드빗/굿런 받은 수)
  badges?: string[];        // 획득 뱃지
  staffTitle?: string;      // 직원 직책(매니저·딜러·플로어 등) — 권한과 분리, 업주가 지정
  verified?: boolean;       // 본인인증(CI) 완료 여부 — 1인 1계정
  verifiedAt?: string;      // 본인인증 시각
  realName?: string;        // 인증된 실명(표시명/닉네임과 분리 저장)
  phone?: string;           // 인증된 전화번호
}

export interface LoginPayload { email: string; password: string; }

/** 법적 동의 항목 (개인정보보호법 §15, 게임산업법 §32) */
export interface ConsentPayload {
  agreedToTerms: boolean;        // [필수] 서비스 이용약관
  agreedToPrivacy: boolean;      // [필수] 개인정보 수집·이용
  agreedToAntiGambling: boolean; // [필수] 불법 환전·사행성 금지 서약
  agreedToMarketing: boolean;    // [선택] 마케팅 정보 수신
}

export interface SignupUserPayload  extends LoginPayload, ConsentPayload { name: string; nickname: string; }
export interface SignupOwnerPayload extends SignupUserPayload {
  venueName: string; region: string; address: string;
  phone: string; businessNumber: string;
}

// ── DB row → User ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUser(row: any): User {
  return {
    id:             row.id,
    email:          row.email,
    name:           row.name,
    nickname:       row.nickname ?? undefined,
    role:           row.role,
    approved:       row.approved,
    venueId:        row.venue_id,
    avatarColor:    row.avatar_color,
    avatarUrl:      row.avatar_url,
    status:         row.status,
    suspendedUntil: row.suspended_until,
    sanctionReason: row.sanction_reason ?? undefined,
    agreedToTerms:  row.agreed_to_terms ?? undefined,
    joinedAt:       row.joined_at,
    lastSeenAt:     row.last_seen_at ?? undefined,
    nameChangedAt:  row.name_changed_at ?? undefined,
    activityPoints: row.activity_points ?? 0,
    badges:         row.badges ?? [],
    staffTitle:     row.staff_title ?? undefined,
    // 재인증 만료: CI가 있어도 최근 인증(3년) 이내라야 verified=true. 만료 시 재인증 유도.
    verified:       !!row.ci && (!row.verified_at || (Date.now() - new Date(row.verified_at).getTime()) < 94_672_800_000),
    verifiedAt:     row.verified_at ?? undefined,
    realName:       row.real_name ?? undefined,
    phone:          row.phone ?? undefined,
  };
}

// ── 이메일/비밀번호 로그인 ────────────────────────────────────────────────────
export async function signIn(email: string, password: string): Promise<User> {
  if (IS_MOCK) throw new Error('Mock mode: use loginDemo');

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });
  if (authError) throw authError;

  const { data: profile, error: profileError } =
    await supabase.from('profiles').select('*').eq('id', authData.user.id).single();
  if (profileError) throw profileError;

  return rowToUser(profile);
}

// ── 일일 접속 활동 점수(+1) ───────────────────────────────────────────────────
// claim_daily_login_point RPC(security definer)가 KST 기준 하루 1회만 +1 적립.
// 반환: 적립 후(또는 이미 적립된) 활동 점수 총합. 비로그인/실패 시 null.
export async function claimDailyLoginPoint(): Promise<number | null> {
  if (IS_MOCK) return null;
  const { data, error } = await supabase.rpc('claim_daily_login_point');
  if (error) return null;
  return typeof data === 'number' ? data : null;
}

// ── 닉네임 중복 검사 ──────────────────────────────────────────────────────────
// is_nickname_available RPC(security definer)로 대소문자·공백 무시 중복 여부 확인.
// 반환: true=사용 가능 / false=사용 중 또는 형식 위반(2자 미만 등).
export async function checkNicknameAvailable(nickname: string): Promise<boolean> {
  const trimmed = nickname.trim();
  if (trimmed.length < 2) return false;
  if (IS_MOCK) return true;
  const { data, error } = await supabase.rpc('is_nickname_available', { p_nickname: trimmed });
  if (error) throw error;
  return data === true;
}

// 본인 닉네임(받는 아이디) 최초 설정 — 설정 후 잠김(변경은 운영자). 중복 시 에러.
export async function setMyNickname(nickname: string): Promise<void> {
  const { error } = await supabase.rpc('set_my_nickname', { p_nickname: nickname.trim() });
  if (error) throw new Error(error.message);
}
// 운영자 전용: 회원 닉네임 변경(잠금 무시).
export async function adminSetNickname(userId: string, nickname: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_nickname', { p_user_id: userId, p_nickname: nickname.trim() });
  if (error) throw new Error(error.message);
}

// 매장 알림 수신 설정(본인) — true=수신 거부
export async function getMyVenueNotifyMute(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('profiles').select('mute_venue_notify').eq('id', user.id).single();
  return data?.mute_venue_notify === true;
}
export async function setMyVenueNotifyMute(mute: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_my_venue_notify', { p_mute: mute });
  if (error) throw new Error(error.message);
}

// ── 일반 회원가입 ─────────────────────────────────────────────────────────────
// 프로필/동의 이력은 DB 트리거(handle_new_user)가 user_metadata로부터 자동 생성.
export async function signUpUser(payload: SignupUserPayload): Promise<void> {
  if (IS_MOCK) throw new Error('Mock mode');
  if (!payload.agreedToTerms)        throw new Error('서비스 이용약관에 동의해 주세요.');
  if (!payload.agreedToPrivacy)      throw new Error('개인정보 수집·이용에 동의해 주세요.');
  if (!payload.agreedToAntiGambling) throw new Error('불법 환전·사행성 금지 서약에 동의해 주세요.');

  const { error } = await supabase.auth.signUp({
    email:    payload.email,
    password: payload.password,
    options: { data: {
      name: payload.name,
      nickname: payload.nickname,
      role: 'user',
      agreed_to_terms:         payload.agreedToTerms,
      agreed_to_privacy:       payload.agreedToPrivacy,
      agreed_to_anti_gambling: payload.agreedToAntiGambling,
      agreed_to_marketing:     payload.agreedToMarketing,
    } },
  });
  if (error) throw error;
}

// ── 업주 가입 신청 ─────────────────────────────────────────────────────────────
// 매장(venues) 레코드도 트리거가 metadata로부터 자동 생성(approved=false, 승인 대기).
export async function signUpOwner(payload: SignupOwnerPayload): Promise<void> {
  if (IS_MOCK) throw new Error('Mock mode');
  if (!payload.agreedToTerms)        throw new Error('서비스 이용약관에 동의해 주세요.');
  if (!payload.agreedToPrivacy)      throw new Error('개인정보 수집·이용에 동의해 주세요.');
  if (!payload.agreedToAntiGambling) throw new Error('불법 환전·사행성 금지 서약에 동의해 주세요.');

  const { error } = await supabase.auth.signUp({
    email:    payload.email,
    password: payload.password,
    options: { data: {
      name: payload.name,
      nickname: payload.nickname,
      role: 'venue_owner',
      agreed_to_terms:         payload.agreedToTerms,
      agreed_to_privacy:       payload.agreedToPrivacy,
      agreed_to_anti_gambling: payload.agreedToAntiGambling,
      agreed_to_marketing:     payload.agreedToMarketing,
      venue_name:      payload.venueName,
      region:          payload.region,
      address:         payload.address,
      phone:           payload.phone,
      business_number: payload.businessNumber,
    } },
  });
  if (error) throw error;
}

// ── 매장 구성원(직원) — 업주 초대 + 수락 모델 ────────────────────────────────
export interface StaffInvite { id: string; venueId: string; venueName: string; createdAt: string; }
export interface VenueInvite { id: string; userId: string; email: string; nickname?: string; name: string; createdAt: string; }

// 업주/운영자: 매장 구성원(수락 완료) 목록. venueId 생략 시 본인 소유 매장(업주), 지정 시 해당 매장(운영자).
export async function getMyVenueStaff(venueId?: string): Promise<User[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('get_my_venue_staff', { p_venue_id: venueId ?? null });
  if (error) throw error;
  return (data ?? []).map(rowToUser);
}
// 업주/운영자: 이메일로 구성원 초대(매장 기준 권한 체크)
export async function inviteStaffByEmail(email: string, venueId?: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('invite_staff_by_email', { p_email: email.trim(), p_venue_id: venueId ?? null });
  if (error) throw error;
}
// 업주/운영자: 매장 대기중 초대 목록
export async function getMyVenueInvites(venueId?: string): Promise<VenueInvite[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('get_my_venue_invites', { p_venue_id: venueId ?? null });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, userId: r.user_id, email: r.email, nickname: r.nickname ?? undefined, name: r.name, createdAt: r.created_at }));
}
// 업주: 대기중 초대 취소 / 구성원 제거
export async function cancelStaffInvite(inviteId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('cancel_staff_invite', { p_invite_id: inviteId });
  if (error) throw error;
}
export async function removeStaff(staffId: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('manage_staff', { p_staff_id: staffId, p_action: 'remove' });
  if (error) throw error;
}
// 업주: 직원 직책(라벨) 지정 — 권한과 별개
export async function setStaffTitle(staffId: string, title: string): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_staff_title', { p_staff_id: staffId, p_title: title });
  if (error) throw error;
}

// 초대받은 회원: 내 대기중 초대 / 수락·거절
export async function getMyStaffInvites(): Promise<StaffInvite[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase.rpc('get_my_staff_invites');
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ id: r.id, venueId: r.venue_id, venueName: r.venue_name, createdAt: r.created_at }));
}
export async function respondStaffInvite(inviteId: string, accept: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('respond_staff_invite', { p_invite_id: inviteId, p_accept: accept });
  if (error) throw error;
}

// ── 로그아웃 ──────────────────────────────────────────────────────────────────
export async function signOut(): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ── 현재 세션에서 프로필 조회 ─────────────────────────────────────────────────
export async function getMyProfile(): Promise<User | null> {
  if (IS_MOCK) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!data) return null;
  const u = rowToUser(data);
  if (u.role === 'venue_owner') {
    const { data: v } = await supabase
      .from('venues').select('verification_status').eq('owner_id', user.id).limit(1).maybeSingle();
    u.venueVerified = (v as { verification_status?: string } | null)?.verification_status === 'verified';
  }
  return u;
}

// ── 관리자: 전체 회원 목록 ────────────────────────────────────────────────────
export async function listAllUsers(): Promise<User[]> {
  if (IS_MOCK) {
    const { MOCK_USERS } = await import('../mock/data');
    return MOCK_USERS;
  }
  const { data, error } = await supabase.from('profiles').select('*').order('joined_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToUser);
}

// ── 관리자: 회원 상태 변경 (+ 사유 기록 + 제재 시 자동 이메일) ────────────────
export async function updateUserStatus(
  userId: string,
  status: UserStatus,
  suspendedUntil?: string,
  reason?: string,
): Promise<void> {
  if (IS_MOCK) return;

  const { error } = await supabase.from('profiles').update({
    status,
    suspended_until: suspendedUntil ?? null,
    sanction_reason: reason ?? null,
  }).eq('id', userId);
  if (error) throw error;

  // 제재(정지/영구정지/강제탈퇴) 시 사유 포함 공지 메일 자동 발송.
  // Edge Function(notify-sanction) 미배포 시에도 상태 변경은 성공하도록 실패는 무시.
  if (status === 'suspended' || status === 'banned' || status === 'withdrawn') {
    try {
      await supabase.functions.invoke('notify-sanction', {
        body: { userId, status, reason: reason ?? '', suspendedUntil: suspendedUntil ?? null },
      });
    } catch (e) {
      console.warn('[sanction] notify email failed (function may be undeployed):', e);
    }
  }
}

// ── 관리자: 업주 승인 ─────────────────────────────────────────────────────────
export async function approveOwner(userId: string, approve: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('profiles').update({ approved: approve }).eq('id', userId);
  if (error) throw error;
  // 연결된 venue도 함께 승인
  if (approve) {
    await supabase.from('venues').update({ approved: true }).eq('owner_id', userId);
  }
}

// ── 내 프로필 수정 ────────────────────────────────────────────────────────────
export interface ProfilePatch {
  name?: string;
  avatarUrl?: string;
  avatarColor?: string;
}

export async function updateMyProfile(patch: ProfilePatch): Promise<User> {
  if (IS_MOCK) throw new Error('Mock mode: handled in AuthContext');

  const dbPatch: Record<string, unknown> = {};
  if (patch.name        !== undefined) dbPatch.name         = patch.name;
  if (patch.avatarUrl   !== undefined) dbPatch.avatar_url   = patch.avatarUrl;
  if (patch.avatarColor !== undefined) dbPatch.avatar_color = patch.avatarColor;

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error('로그인이 필요합니다');

  const { data, error } = await supabase
    .from('profiles')
    .update(dbPatch)
    .eq('id', authUser.id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToUser(data);
}

// ── 비밀번호 변경 ─────────────────────────────────────────────────────────────
export async function changeMyPassword(
  _currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (IS_MOCK) {
    // Mock 모드: 0.8초 지연 후 성공 시뮬레이션
    await new Promise((res) => setTimeout(res, 800));
    return;
  }
  // Supabase Auth는 이미 로그인된 세션에서 새 비밀번호만 필요
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ── 비밀번호 변경 (이메일 인증 OTP) ───────────────────────────────────────────
// 1) 로그인한 본인 이메일로 재인증 OTP(6자리) 발송
export async function requestPasswordChangeCode(): Promise<void> {
  if (IS_MOCK) { await new Promise((r) => setTimeout(r, 600)); return; }
  const { error } = await supabase.auth.reauthenticate();
  if (error) throw error;
}

// 2) 이메일로 받은 OTP(nonce)와 함께 비밀번호 변경
export async function changeMyPasswordWithCode(newPassword: string, code: string): Promise<void> {
  if (IS_MOCK) { await new Promise((r) => setTimeout(r, 800)); return; }
  const { error } = await supabase.auth.updateUser({ password: newPassword, nonce: code });
  if (error) throw error;
}

// ── 비밀번호 찾기 (비로그인, 이메일 OTP) ─────────────────────────────────────
// 1) 가입 이메일로 재설정 인증번호(OTP) 발송
export async function requestPasswordReset(email: string): Promise<void> {
  if (IS_MOCK) { await new Promise((r) => setTimeout(r, 600)); return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) throw error;
}

// 2) 이메일로 받은 6자리 OTP 검증 → 복구 세션 수립
export async function verifyPasswordResetOtp(email: string, token: string): Promise<void> {
  if (IS_MOCK) { await new Promise((r) => setTimeout(r, 600)); return; }
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'recovery' });
  if (error) throw error;
}

// 3) 복구 세션에서 새 비밀번호 설정
export async function setNewPassword(newPassword: string): Promise<void> {
  if (IS_MOCK) { await new Promise((r) => setTimeout(r, 600)); return; }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ── 구글 OAuth 로그인 ─────────────────────────────────────────────────────────
export async function signInWithGoogle(): Promise<void> {
  if (IS_MOCK) throw new Error('데모 모드에서는 구글 로그인을 사용할 수 없습니다');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

// ── 동의 갱신 (구글 가입자 등 동의 미이행 사용자용 게이트) ────────────────────
export async function updateMyConsent(consent: ConsentPayload): Promise<void> {
  if (IS_MOCK) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { error } = await supabase.from('profiles').update({
    agreed_to_terms:         consent.agreedToTerms,
    agreed_to_privacy:       consent.agreedToPrivacy,
    agreed_to_anti_gambling: consent.agreedToAntiGambling,
    agreed_to_marketing:     consent.agreedToMarketing,
    terms_agreed_at:         consent.agreedToTerms ? new Date().toISOString() : null,
  }).eq('id', user.id);
  if (error) throw error;
}

/** 순위 입력 자동완성 — 닉네임/실명 부분 일치(업주·운영자만 실명 반환, RPC 내부 게이트) */
export async function searchMembersForRanking(q: string): Promise<{ nickname: string; realName: string }[]> {
  const t = q.trim();
  if (!t) return [];
  const { data, error } = await supabase.rpc('search_members_for_ranking', { p_q: t });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ nickname: r.nickname ?? '', realName: r.real_name ?? '' }));
}
