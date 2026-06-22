// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
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
  /** 이메일/비밀번호 로그인 (Supabase Auth) */
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 프로필(이름·아바타·색상) 수정 */
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  /** 비밀번호 변경 */
  changePassword: (currentPw: string, newPw: string) => Promise<void>;
  /** 서버에서 내 프로필 다시 불러오기 (승인 상태 변경 반영 등) */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 프로필을 세팅하고, 하루 1회 접속 활동 점수(+1)를 적립해 점수를 반영한다.
  const applyProfileWithDailyPoint = useCallback((profile: User | null) => {
    // 탈퇴·영구정지 계정은 로그인 차단 — 세션을 즉시 종료하고 진입 거부.
    if (profile && (profile.status === 'withdrawn' || profile.status === 'banned')) {
      apiSignOut().catch(() => {});
      setUser(null);
      return;
    }
    setUser(profile);
    if (!profile) return;
    claimDailyLoginPoint()
      .then((pts) => {
        if (typeof pts === 'number') {
          setUser((prev) => (prev && prev.id === profile.id ? { ...prev, activityPoints: pts } : prev));
        }
      })
      .catch(() => {});
  }, []);

  // ── 초기화: 세션 복원 + 변경 구독 ────────────────────────────────────────────
  useEffect(() => {
    if (IS_MOCK) { setLoading(false); return; }

    getMyProfile().then((profile) => {
      applyProfileWithDailyPoint(profile);
      setLoading(false);
    });

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
  const login = useCallback(async (email: string, password: string) => {
    const u = await signIn(email, password);
    applyProfileWithDailyPoint(u);
  }, [applyProfileWithDailyPoint]);

  const logout = useCallback(async () => {
    await apiSignOut();
    setUser(null);
  }, []);

  // ── 프로필 수정 / 비밀번호 변경 ──────────────────────────────────────────────
  const updateProfile = useCallback(async (patch: ProfilePatch) => {
    const updated = await updateMyProfile(patch);
    setUser(updated);
  }, []);

  const changePassword = useCallback(async (currentPw: string, newPw: string) => {
    await changeMyPassword(currentPw, newPw);
  }, []);

  const refreshProfile = useCallback(async () => {
    setUser(await getMyProfile());
  }, []);

  const value: AuthContextValue = {
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
