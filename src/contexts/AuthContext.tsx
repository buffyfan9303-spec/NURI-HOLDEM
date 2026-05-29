// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User, ProfilePatch } from '../api/auth';
import {
  signIn, signOut as apiSignOut, getMyProfile,
  updateMyProfile, changeMyPassword,
} from '../api/auth';
import { supabase, IS_MOCK } from '../lib/supabase';
import { MOCK_USERS } from '../mock/data';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  isOwner: boolean;
  isApprovedOwner: boolean;
  loading: boolean;
  /** 실서버: 이메일/비밀번호 로그인 */
  login: (email: string, password: string) => Promise<void>;
  /** Mock 개발 전용: 이메일만으로 즉시 로그인 */
  loginDemo: (email: string) => boolean;
  logout: () => Promise<void>;
  /** 프로필(이름·아바타·색상) 수정 */
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  /** 비밀번호 변경 */
  changePassword: (currentPw: string, newPw: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const MOCK_STORAGE_KEY = 'holdem.demo.user.id';
const MOCK_PROFILE_KEY = 'holdem.demo.profile'; // { [userId]: ProfilePatch }

// ── 로컬 mock 프로필 헬퍼 ────────────────────────────────────────────────────
function loadMockProfile(userId: string): ProfilePatch {
  try {
    const all = JSON.parse(localStorage.getItem(MOCK_PROFILE_KEY) ?? '{}');
    return (all[userId] ?? {}) as ProfilePatch;
  } catch { return {}; }
}
function saveMockProfile(userId: string, patch: ProfilePatch): void {
  try {
    const all = JSON.parse(localStorage.getItem(MOCK_PROFILE_KEY) ?? '{}');
    all[userId] = { ...(all[userId] ?? {}), ...patch };
    localStorage.setItem(MOCK_PROFILE_KEY, JSON.stringify(all));
  } catch { /* localStorage 가득 찬 경우 무시 */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ── 초기화 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (IS_MOCK) {
      const id = localStorage.getItem(MOCK_STORAGE_KEY);
      if (id) {
        const base = MOCK_USERS.find((u) => u.id === id) ?? null;
        if (base) {
          const saved = loadMockProfile(id);
          setUser({ ...base, ...saved });
        }
      }
      setLoading(false);
      return;
    }

    // Supabase 모드: 세션 복원
    getMyProfile().then((profile) => {
      setUser(profile);
      setLoading(false);
    });

    // 세션 변경 구독 (탭 간 동기화, 만료 처리)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const profile = await getMyProfile();
        setUser(profile);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Mock: user id → localStorage 동기화
  useEffect(() => {
    if (!IS_MOCK) return;
    if (user) localStorage.setItem(MOCK_STORAGE_KEY, user.id);
    else      localStorage.removeItem(MOCK_STORAGE_KEY);
  }, [user]);

  // ── 로그인 ────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const u = await signIn(email, password);
    setUser(u);
  }, []);

  // ── Mock 전용 ─────────────────────────────────────────────────────────────
  const loginDemo = useCallback((email: string): boolean => {
    const found = MOCK_USERS.find((u) => u.email === email);
    if (!found) return false;
    const saved = loadMockProfile(found.id);
    setUser({ ...found, ...saved });
    return true;
  }, []);

  // ── 로그아웃 ──────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await apiSignOut();
    setUser(null);
  }, []);

  // ── 프로필 수정 ───────────────────────────────────────────────────────────
  const updateProfile = useCallback(async (patch: ProfilePatch) => {
    if (IS_MOCK) {
      setUser((prev) => {
        if (!prev) return null;
        saveMockProfile(prev.id, patch);
        return { ...prev, ...patch };
      });
      return;
    }
    const updated = await updateMyProfile(patch);
    setUser(updated);
  }, []);

  // ── 비밀번호 변경 ─────────────────────────────────────────────────────────
  const changePassword = useCallback(async (currentPw: string, newPw: string) => {
    await changeMyPassword(currentPw, newPw);
  }, []);

  const value: AuthContextValue = {
    user,
    isAdmin:         user?.role === 'admin',
    isOwner:         user?.role === 'venue_owner',
    isApprovedOwner: user?.role === 'venue_owner' && user.approved === true,
    loading,
    login,
    loginDemo,
    logout,
    updateProfile,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
