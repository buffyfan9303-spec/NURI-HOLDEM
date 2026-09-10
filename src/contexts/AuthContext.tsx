// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { User, ProfilePatch } from '../api/auth';
import {
  signIn, signOut as apiSignOut, getMyProfile,
  updateMyProfile, changeMyPassword, claimDailyLoginPoint,
} from '../api/auth';
import { supabase, IS_MOCK } from '../lib/supabase';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  isOwner: boolean;
  isApprovedOwner: boolean;
  loading: boolean;
  /** 이메일/비밀번호 로그인 (Supabase Auth).
   *  keepSignedIn: 자동 로그인(로그인 상태 유지) — true=브라우저를 닫아도 유지 / false=탭을 닫으면 해제.
   *  생략하면 이 브라우저의 직전 선택을 그대로 따른다(lib/supabase 의 KEEP_KEY). */
  login: (email: string, password: string, keepSignedIn?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  /** 프로필(이름·아바타·색상) 수정 */
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  /** 비밀번호 변경 */
  changePassword: (currentPw: string, newPw: string) => Promise<void>;
  /** 서버에서 내 프로필 다시 불러오기 (승인 상태 변경 반영 등) */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// 내용이 같은 프로필이면 **이전 참조를 그대로** 유지한다.
// 왜: 부팅 중 프로필은 두 경로(초기 조회 + onAuthStateChange)로 들어오고, 거기에
//   일일 접속 점수 적립 결과까지 더해져 같은 사람의 user 객체가 3~4번 새로 만들어졌다.
//   그때마다 `[user]` 의존 이펙트(차단목록·구성원 초대·팔로우·평점)가 전부 재발화하고
//   useAuth 소비자 전체가 다시 렌더된다(콜드 부팅 실측: REST 중복 요청 14건).
//   값이 같으면 화면에 들어가는 것도 같으므로 참조를 유지해도 **렌더 결과는 동일**하다.
function sameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}
const keepIfSame = (prev: User | null, next: User | null): User | null => (sameUser(prev, next) ? prev : next);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 프로필을 세팅하고, 하루 1회 접속 활동 점수(+1)를 적립해 점수를 반영한다.
  // 제재 상태면 **왜 못 들어가는지**를 문장으로 돌려준다(2026-09-07). 아니면 null.
  // 예전엔 조용히 signOut 만 해서, 회원은 '로그인되었습니다' 토스트를 본 뒤 그냥 로그아웃됐다 —
  // 비밀번호가 틀린 줄 알고 재시도만 반복하게 되고, 문의도 못 한다.
  const sanctionMessage = (p: User): string | null => {
    if (p.status === 'withdrawn') return '탈퇴한 계정입니다. 재가입은 고객센터로 문의해 주세요.';
    if (p.status === 'banned') return '이용이 영구 제한된 계정입니다. 고객센터로 문의해 주세요.';
    if (p.status === 'suspended') {
      const until = p.suspendedUntil ? new Date(p.suspendedUntil) : null;
      return until && !Number.isNaN(until.getTime())
        ? `이용이 일시 정지된 계정입니다. ${until.toLocaleDateString()}까지 로그인할 수 없어요. 문의는 고객센터로 부탁드립니다.`
        : '이용이 정지된 계정입니다. 고객센터로 문의해 주세요.';
    }
    return null;
  };

  const applyProfileWithDailyPoint = useCallback((profile: User | null): string | null => {
    // 탈퇴·영구정지·임시정지 계정은 로그인 차단 — 세션을 즉시 종료하고 진입 거부.
    // (서버도 제재 계정의 글·후기·매물 작성을 트리거로 막지만, 클라에서도 즉시 로그아웃해 오해 없게 한다.)
    const sanction = profile ? sanctionMessage(profile) : null;
    if (sanction) {
      apiSignOut().catch(() => {});
      setUser(null);
      return sanction;   // 로그인 경로가 이 문장을 그대로 사용자에게 보여준다
    }
    setUser((prev) => keepIfSame(prev, profile));
    if (!profile) return null;
    claimDailyLoginPoint()
      .then((pts) => {
        if (typeof pts === 'number') {
          setUser((prev) => (prev && prev.id === profile.id ? keepIfSame(prev, { ...prev, activityPoints: pts }) : prev));
        }
      })
      .catch(() => {});
    return null; // 제재 없음 — 로그인 경로가 그대로 진행한다
  }, []);

  // ── 초기화: 세션 복원 + 변경 구독 ────────────────────────────────────────────
  useEffect(() => {
    if (IS_MOCK) { setLoading(false); return; }

    // 부팅 프로필 조회 - 실패하면 한 번만 다시 시도한다(2026-09-11).
    //   왜: 세션은 저장소에 있는데 첫 요청이 깨지면 화면만 비로그인이 되고, 사용자는 그걸
    //   '자동 로그인이 안 됐다' 로 읽는다. 두 번째도 실패하면 조용히 비로그인으로 둔다 -
    //   여기서 user 를 null 로 덮지는 않는다(getMyProfile 이 이제 실패를 던지므로 catch 로 온다).
    const bootProfile = (retry: boolean) => {
      getMyProfile()
        .then((profile) => { applyProfileWithDailyPoint(profile); setLoading(false); })
        .catch(() => {
          if (retry) { window.setTimeout(() => bootProfile(false), 1200); return; }
          setLoading(false);
        });
    };
    bootProfile(true);

    // ⚠️ onAuthStateChange 콜백 내부에서 supabase를 await하면 GoTrue 락 데드락 →
    //    로그인이 "로그인 중..."에서 무한 대기. 콜백은 동기로만 두고
    //    프로필 조회는 setTimeout(0)로 분리 실행해 락을 먼저 해제한다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (session?.user) {
        setTimeout(() => {
          getMyProfile().then((p) => applyProfileWithDailyPoint(p)).catch(() => {});
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [applyProfileWithDailyPoint]);

  // ── 로그인 / 로그아웃 ────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string, keepSignedIn?: boolean) => {
    const u = await signIn(email, password, keepSignedIn);
    // 제재 계정이면 여기서 던진다 — AuthModal 의 catch 가 사유를 그대로 보여주고 성공 토스트도 뜨지 않는다.
    const sanction = applyProfileWithDailyPoint(u);
    if (sanction) {
      // name 으로 표식을 남긴다 — AuthModal 의 catch 가 자격증명 오류로 뭉개지 않고 이 문장을 그대로 보여준다.
      const e = new Error(sanction); e.name = 'SanctionError'; throw e;
    }
  }, [applyProfileWithDailyPoint]);

  const logout = useCallback(async () => {
    await apiSignOut();
    setUser(null);
  }, []);

  // ── 프로필 수정 / 비밀번호 변경 ──────────────────────────────────────────────
  const updateProfile = useCallback(async (patch: ProfilePatch) => {
    const updated = await updateMyProfile(patch);
    setUser((prev) => keepIfSame(prev, updated));
  }, []);

  const changePassword = useCallback(async (currentPw: string, newPw: string) => {
    await changeMyPassword(currentPw, newPw);
  }, []);

  const refreshProfile = useCallback(async () => {
    const next = await getMyProfile();
    setUser((prev) => keepIfSame(prev, next));
  }, []);

  // 매 렌더 새 객체를 만들면 useAuth 소비자 전체가 같이 렌더된다(값은 그대로인데도).
  // 이 제공자는 앱 최상단이라 범위가 사실상 전체다 — 입력이 바될 때만 새 값을 낸다.
  const value: AuthContextValue = useMemo(() => ({
    user,
    isAdmin:         user?.role === 'admin',
    isOwner:         user?.role === 'venue_owner',
    isApprovedOwner: user?.role === 'venue_owner' && user.approved === true,
    loading,
    login,
    logout,
    updateProfile,
    changePassword,
    refreshProfile,
  }), [user, loading, login, logout, updateProfile, changePassword, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider+훅 동거(컨텍스트 표준 패턴)
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
