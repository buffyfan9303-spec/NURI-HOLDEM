// src/api/auth.ts
import { supabase, IS_MOCK } from '../lib/supabase';

export type UserRole   = 'user' | 'venue_owner' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned' | 'pending';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  approved?: boolean;
  venueId?: string;
  avatarColor?: string;
  avatarUrl?: string;
  status?: UserStatus;
  suspendedUntil?: string;
  joinedAt?: string;
}

export interface LoginPayload { email: string; password: string; }

/** 법적 동의 항목 (개인정보보호법 §15, 게임산업법 §32) */
export interface ConsentPayload {
  agreedToTerms: boolean;        // [필수] 서비스 이용약관
  agreedToPrivacy: boolean;      // [필수] 개인정보 수집·이용
  agreedToAntiGambling: boolean; // [필수] 불법 환전·사행성 금지 서약
  agreedToMarketing: boolean;    // [선택] 마케팅 정보 수신
}

export interface SignupUserPayload  extends LoginPayload, ConsentPayload { name: string; }
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
    role:           row.role,
    approved:       row.approved,
    venueId:        row.venue_id,
    avatarColor:    row.avatar_color,
    avatarUrl:      row.avatar_url,
    status:         row.status,
    suspendedUntil: row.suspended_until,
    joinedAt:       row.joined_at,
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
  return data ? rowToUser(data) : null;
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

// ── 관리자: 회원 상태 변경 ────────────────────────────────────────────────────
export async function updateUserStatus(
  userId: string,
  status: UserStatus,
  suspendedUntil?: string,
): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.from('profiles').update({
    status,
    suspended_until: suspendedUntil ?? null,
  }).eq('id', userId);
  if (error) throw error;
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