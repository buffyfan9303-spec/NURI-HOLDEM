// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User, ProfilePatch } from '../api/auth';
import {
  signIn, signOut as apiSignOut, getMyProfile,
  updateMyProfile, changeMyPassword,
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

  // ── 초기화: 세션 복원 + 변경 구독 ────────────────────────────────────────────
  useEffect(() => {
    if (IS_MOCK) { setLoading(false); return; }

    getMyProfile().then((profile) => {
      setUser(profile);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setUser(await getMyProfile());
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── 로그인 / 로그아웃 ────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const u = await signIn(email, password);
    setUser(u);
  }, []);

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
