// src/api/auth.ts
import { supabase, IS_MOCK, setKeepSignedIn, clearAuthStorage } from '../lib/supabase';
import { currentUser } from './_session';
import { makeSearchCache } from '../lib/searchCache';
import { dedupe } from '../lib/inflight';
import { LEGAL_VERSION } from '../lib/legalVersion';
import { isValidDisplayName } from '../lib/displayName';

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
  /** [선택] 마케팅 수신 동의 현재값. 재동의 화면의 프리필에 쓴다 —
   *  프리필하지 않으면 재동의 한 번에 기존 수신 동의가 조용히 철회된다(사용자는 철회한 적이 없다). */
  agreedToMarketing?: boolean;
  /** 동의한 약관 판(版). null/undefined = 제1판 이전(미상) → 재동의 대상.
   *  boolean 하나로는 '언제 것에 동의했는지'를 알 수 없어 2026-08-30 개정에서 추가했다. */
  consentedLegalVersion?: number | null;
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
  shadowbanned?: boolean;   // 섀도우밴 — 콘텐츠는 정상이나 활동 랭킹에서만 조용히 제외(운영자 전용)
  /** 랭킹 프로필 공개 동의(선택). null = 아직 물어본 적 없음(기존 회원·소셜 가입) → 기본 비공개.
   *  false(거부)와 null(미응답)을 구분해야 나중에 재요청 안내를 거부자에게 다시 띄우지 않는다. */
  publicRankingConsent?: boolean | null;
}

export interface LoginPayload { email: string; password: string; }

/** 법적 동의 항목 (개인정보보호법 §15, 게임산업법 §32) */
export interface ConsentPayload {
  agreedToTerms: boolean;        // [필수] 서비스 이용약관
  agreedToPrivacy: boolean;      // [필수] 개인정보 수집·이용
  agreedToAntiGambling: boolean; // [필수] 불법 환전·사행성 금지 서약
  agreedToMarketing: boolean;    // [선택] 마케팅 정보 수신
  /** [선택] 랭킹 프로필 공개 — 닉네임과 '자주 가는 매장'을 순위표에 표시.
   *  필수로 만들면 안 된다(가입 자체를 막는 동의 강제 = 개인정보보호법 §22⑤ 위반).
   *  생략(undefined) = 물어보지 않음 → DB 에 NULL(미응답)로 남는다. */
  publicRankingConsent?: boolean;
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
    agreedToMarketing: row.agreed_to_marketing ?? undefined,
    // ?? null — undefined 로 뭉개면 '미상'과 '컬럼 미선택'이 구분되지 않는다.
    consentedLegalVersion: row.consented_legal_version ?? null,
    joinedAt:       row.joined_at,
    lastSeenAt:     row.last_seen_at ?? undefined,
    nameChangedAt:  row.name_changed_at ?? undefined,
    activityPoints: row.activity_points ?? 0,
    badges:         row.badges ?? [],
    staffTitle:     row.staff_title ?? undefined,
    // 인증 판정: CI 해시(ci_hash, HMAC — 원문은 2026-08-27부터 저장 안 함) 보유 = 인증 완료.
    // 이 식은 서버 단일 소스 SQL 헬퍼 public.is_ci_verified(ci_hash, verified_at)의 클라이언트 미러다
    // (현재 body = `보유 여부`). 약관에 본인인증 유효기간 조항이 없어 만료(재인증)는 미적용.
    // ⚠️ 만료 정책 도입 시: 약관 신설 → is_ci_verified body 수정 → 이 줄도 동일 기준으로 동기화(두 곳이 짝). [[holdem-verification-policy]]
    verified:       !!row.ci_hash,
    verifiedAt:     row.verified_at ?? undefined,
    realName:       row.real_name ?? undefined,
    phone:          row.phone ?? undefined,
    shadowbanned:   row.shadowbanned === true,
    // ?? null 로 받는다 — undefined 로 뭉개면 '미응답'과 '컬럼 없음'이 구분되지 않는다.
    publicRankingConsent: row.public_ranking_consent ?? null,
  };
}

// ── 이메일/비밀번호 로그인 ────────────────────────────────────────────────────
/**
 * @param keepSignedIn 자동 로그인(로그인 상태 유지). true=localStorage(브라우저를 닫아도 유지) /
 *   false=sessionStorage(탭을 닫으면 해제). 생략하면 직전 선택을 그대로 따른다.
 *
 * ⚠ 저장소 결정은 **토큰이 기록되기 전에** 끝나야 한다 — 그래서 signInWithPassword 보다 먼저 쓴다.
 */
export async function signIn(email: string, password: string, keepSignedIn?: boolean): Promise<User> {
  if (IS_MOCK) throw new Error('Mock mode: use loginDemo');
  if (typeof keepSignedIn === 'boolean') setKeepSignedIn(keepSignedIn);

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
  // 부팅 시 프로필이 두 경로(직접 조회 + onAuthStateChange)로 적용돼 실측 ×2 로 나갔다.
  // RPC 자체가 KST 하루 1회 멱등 이라 결과는 같지만, 왕복 1회를 아끼고 경합도 없앤다.
  return dedupe('daily-login-point', async () => {
    const { data, error } = await supabase.rpc('claim_daily_login_point');
    if (error) return null;
    return typeof data === 'number' ? data : null;
  });
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

// ── 닉네임(profiles.name = 표시 이름) 중복 검사 ───────────────────────────────
// is_name_available RPC(security definer)로 대소문자·공백 무시 중복 여부 확인. 로그인 상태면 본인 행은 제외.
// 반환: true=사용 가능 / false=사용 중 또는 형식 위반(공백 정리 후 2~20자 밖).
export async function checkNameAvailable(name: string): Promise<boolean> {
  if (!isValidDisplayName(name)) return false;
  if (IS_MOCK) return true;
  const { data, error } = await supabase.rpc('is_name_available', { p_name: name.trim() });
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
// 운영자 전용: 섀도우밴 토글 — 콘텐츠·트레이닝은 그대로 두고 활동 랭킹에서만 조용히 제외.
export async function adminSetShadowban(userId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_shadowban', { p_user_id: userId, p_on: on });
  if (error) throw new Error(error.message);
}

// 매장 알림 수신 설정(본인) — true=수신 거부
export async function getMyVenueNotifyMute(): Promise<boolean> {
  const user = await currentUser();
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
      // 선택 동의 — 체크 안 하면 명시적 false(거부). 트리거가 그대로 프로필에 옮긴다.
      public_ranking_consent:  payload.publicRankingConsent === true,
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
      public_ranking_consent:  payload.publicRankingConsent === true,
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
  // 부팅 중 user 참조가 갈릴 때마다 배너가 재조회해 실측 ×4 로 나갔다 — 비행 중이면 합류(lib/inflight)
  return dedupe('staff-invites', async () => {
    const { data, error } = await supabase.rpc('get_my_staff_invites');
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => ({ id: r.id, venueId: r.venue_id, venueName: r.venue_name, createdAt: r.created_at })) as StaffInvite[];
  });
}
export async function respondStaffInvite(inviteId: string, accept: boolean): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('respond_staff_invite', { p_invite_id: inviteId, p_accept: accept });
  if (error) throw error;
}

// ── 로그아웃 ──────────────────────────────────────────────────────────────────
export async function signOut(): Promise<void> {
  if (IS_MOCK) return;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } finally {
    // 성공/실패와 무관하게 두 저장소의 인증 잔재를 걷어낸다.
    // 자동 로그인 도입으로 토큰이 들어갈 수 있는 곳이 두 곳이 됐다 — 한쪽이라도 남으면
    // 다음 부팅 때 그 세션으로 되살아나 '로그아웃했는데 다시 로그인됨' 이 된다.
    clearAuthStorage();
  }
}

// ── 현재 세션에서 프로필 조회 ─────────────────────────────────────────────────
export async function getMyProfile(): Promise<User | null> {
  if (IS_MOCK) return null;
  const user = await currentUser();
  if (!user) return null;

  // 부팅 경로가 둘(초기 조회 + onAuthStateChange)이라 profiles·venues 가 각각 ×2 로 나갔다.
  // 겹치는 동안에만 합류 — 응답이 오면 키를 버리므로 이후 refreshProfile 은 그대로 새로 조회된다.
  return dedupe('my-profile:' + user.id, async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!data) return null;
    const u = rowToUser(data);
    if (u.role === 'venue_owner') {
      const { data: v } = await supabase
        .from('venues').select('verification_status').eq('owner_id', user.id).limit(1).maybeSingle();
      u.venueVerified = (v as { verification_status?: string } | null)?.verification_status === 'verified';
    }
    return u;
  });
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
      const { data } = await supabase.functions.invoke('notify-sanction', {
        body: { userId, status, reason: reason ?? '', suspendedUntil: suspendedUntil ?? null },
      });
      // #20 200 {sent:false}(RESEND 미설정 등)는 예외가 아니라 조용히 누락됨 → 가시화
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (data && (data as any).sent === false) console.warn('[sanction] notify email NOT sent:', (data as any).error ?? 'RESEND_API_KEY 미설정 가능');
    } catch (e) {
      console.warn('[sanction] notify email failed (function may be undeployed):', e);
    }
  }
}

// ── 본인 비밀번호 확인(재인증) ────────────────────────────────────────────────
// 같은 계정으로 signInWithPassword 를 시도해 비밀번호 일치 여부만 확인한다(세션은 본인이라 유지).
// 탈퇴 등 민감 작업의 본인 확인용. true=일치.
export async function verifyMyPassword(password: string): Promise<boolean> {
  if (IS_MOCK) return true;
  // ⚠ 여기만 getUser() 를 유지한다 — 비밀번호 재확인이라 '지금 이 토큰이 진짜 살아 있는가'
  //   자체가 조작의 전제다. 나머지 전 구간은 currentUser()(=getSession) 로 왕복을 없앴다.
  const { data: me } = await supabase.auth.getUser();
  const email = me.user?.email;
  if (!email || !password) return false;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

// ── 탈퇴 직전 데이터 안내 ──────────────────────────────────────────────────────
// 탈퇴 시 함께 사라지는 내 데이터 요약(보유 이용권·작성 글 수) — 실수 방지용.
export async function getMyAccountSummary(): Promise<{ vouchers: number; posts: number }> {
  if (IS_MOCK) return { vouchers: 0, posts: 0 };
  const uid = (await currentUser())?.id;
  if (!uid) return { vouchers: 0, posts: 0 };
  const [v, p] = await Promise.all([
    supabase.from('store_vouchers').select('id', { count: 'exact', head: true }).eq('holder_user_id', uid).eq('status', 'active'),
    supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('user_id', uid),
  ]);
  return { vouchers: v.count ?? 0, posts: p.count ?? 0 };
}

// ── 회원 자가 탈퇴 ────────────────────────────────────────────────────────────
// 개인정보(실명·전화·CI·생년월일·성별·통신사·이메일) 파기 + status='withdrawn' 익명화.
// 매장 대표는 매장을 먼저 정리(킬스위치 삭제/대표 양도)해야 하며, 서버가 거부한다.
export async function withdrawMyAccount(): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('withdraw_my_account');
  if (error) throw new Error(error.message);
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

  const authUser = await currentUser();
  if (!authUser) throw new Error('로그인이 필요합니다');

  const { data, error } = await supabase
    .from('profiles')
    .update(dbPatch)
    .eq('id', authUser.id)
    .select('*')
    .single();
  // name 은 profiles_name_lower_uidx(20260903c)로 유니크 — 경합으로 사전 검사를 통과해도 여기서 막힌다.
  if (error) throw error.code === '23505' ? new Error('이미 사용 중인 닉네임입니다') : error;
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
/** @param keepSignedIn 자동 로그인 여부 — 리다이렉트 전에 정해야 PKCE 검증자·토큰이 같은 저장소로 간다. */
export async function signInWithGoogle(keepSignedIn?: boolean): Promise<void> {
  if (IS_MOCK) throw new Error('데모 모드에서는 구글 로그인을 사용할 수 없습니다');
  if (typeof keepSignedIn === 'boolean') setKeepSignedIn(keepSignedIn);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

// ── 동의 갱신 (구글 가입자 등 동의 미이행 사용자 + 약관 개정 재동의) ──────────
/**
 * 2026-08-30 개정: 직접 UPDATE 를 걷어내고 record_my_legal_consent RPC 로 옮겼다.
 *   왜: ① 동의 **시각**을 클라이언트가 쓰면 분쟁에서 증거로서 약하다(서버가 찍어야 한다).
 *       ② 동의한 **약관 판 번호**를 함께 남겨야 '언제 것에 동의했는지'가 특정된다.
 *       ③ append-only 이력(legal_consents)에 한 행이 같은 트랜잭션에서 쌓인다.
 * @param source 'gate'=재동의/최초 동의 게이트 · 'settings'=설정 화면에서 변경
 */
export async function updateMyConsent(consent: ConsentPayload, source: 'gate' | 'settings' = 'gate'): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('record_my_legal_consent', {
    p_version:   LEGAL_VERSION,
    p_terms:     consent.agreedToTerms,
    p_privacy:   consent.agreedToPrivacy,
    p_anti:      consent.agreedToAntiGambling,
    p_marketing: consent.agreedToMarketing,
    p_source:    source,
  });
  if (error) throw new Error(error.message);
  // 랭킹 공개는 선택 동의라 '물어봤을 때만' 기록한다. 이 게이트를 안 거친 호출부까지
  // false 로 덮으면 미응답(null)이 거부(false)로 굳어 나중에 다시 물어볼 수 없다.
  if (typeof consent.publicRankingConsent === 'boolean') {
    await setMyPublicRankingConsent(consent.publicRankingConsent);
  }
}

/** 내 약관 동의 이력(최신순). 정보주체의 열람권(개인정보보호법 §35)과
 *  광고성 정보 수신 동의 상태 확인(정보통신망법 §50⑦)의 근거 데이터다.
 *  RLS 가 본인 행만 내보내므로 별도 필터가 필요 없다. */
export interface LegalConsentRecord {
  id: string; legalVersion: number; agreedAt: string; source: string;
  terms: boolean; privacy: boolean; antiGambling: boolean; marketing: boolean;
}
export async function getMyLegalConsents(limit = 20): Promise<LegalConsentRecord[]> {
  if (IS_MOCK) return [];
  const { data, error } = await supabase
    .from('legal_consents').select('*').order('agreed_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, legalVersion: r.legal_version, agreedAt: r.agreed_at, source: r.source,
    terms: r.agreed_to_terms === true, privacy: r.agreed_to_privacy === true,
    antiGambling: r.agreed_to_anti_gambling === true, marketing: r.agreed_to_marketing === true,
  }));
}

// ── 랭킹 프로필 공개 동의(선택) — 가입 후 언제든 켜고 끌 수 있는 경로 ─────────
/** on=true 동의 / false 철회·거부 / null 미응답으로 되돌리기.
 *  동의 시각은 서버(set_my_public_ranking_consent)가 찍는다 — 분쟁 시 증거라 클라가 쓰지 않는다. */
export async function setMyPublicRankingConsent(on: boolean | null): Promise<void> {
  if (IS_MOCK) return;
  const { error } = await supabase.rpc('set_my_public_ranking_consent', { p_on: on });
  if (error) throw new Error(error.message);
}

async function rawSearchMembersForRanking(q: string): Promise<{ nickname: string; realName: string; verified: boolean }[]> {
  const t = q.trim();
  if (!t) return [];
  const { data, error } = await supabase.rpc('search_members_for_ranking', { p_q: t });
  if (error) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({ nickname: r.nickname ?? '', realName: r.real_name ?? '', verified: r.verified === true }));
}
/** 순위 입력 자동완성 — 닉네임/실명 부분 일치(업주·운영자만 실명 반환, RPC 내부 게이트). verified=본인인증 보유 여부(미인증 선안내용).
 *  이용권 검색과 동일하게 동일 q 중복 호출을 in-flight+20s LRU 로 흡수(키=trim+소문자, ILIKE라 대소문자·공백 무관). */
export const searchMembersForRanking = makeSearchCache(rawSearchMembersForRanking, (s) => s.trim().toLowerCase());

/** 카카오 로그인 — Supabase OAuth(kakao). 리다이렉트 후 detectSessionInUrl 이 세션을 잡고
 *  onAuthStateChange → 프로필 로드로 이어진다. 신규 유저 프로필은 handle_new_user 트리거가 생성. */
export async function loginWithKakao(keepSignedIn?: boolean): Promise<void> {
  if (IS_MOCK) throw new Error('환경 설정 후 이용할 수 있습니다');
  if (typeof keepSignedIn === 'boolean') setKeepSignedIn(keepSignedIn);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: window.location.origin },
  });
  if (error) {
    throw new Error(/provider is not enabled|unsupported provider/i.test(error.message)
      ? '카카오 로그인 준비 중입니다. 잠시 후 다시 시도해 주세요'
      : error.message);
  }
}
