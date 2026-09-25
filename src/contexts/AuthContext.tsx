// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, startTransition } from 'react';
import type { ReactNode } from 'react';
import type { User, ProfilePatch } from '../api/auth';
import {
  signIn, signOut as apiSignOut, getMyProfile,
  updateMyProfile, changeMyPassword, claimDailyLoginPoint,
} from '../api/auth';
import { supabase, IS_MOCK } from '../lib/supabase';
import {
  type AuthGeneration, initialAuthGeneration, withOwner, withSignedOut, canApplyProfile,
} from '../lib/authGeneration';

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

  // ── A04: 인증 세대 ────────────────────────────────────────────────────────────
  // 로그아웃·계정 전환 전에 나간 조회가 나중에 도착해 **사라진 계정을 되살리는** 것을 막는다.
  // 판정 규칙은 `lib/authGeneration.ts`(순수 함수, 단위 테스트 대상)에 있다.
  const genRef = useRef<AuthGeneration>(initialAuthGeneration());
  /** 지금 세대를 복사해 둔다 — 요청을 **내기 직전**에 부른다. */
  const stamp = useCallback((): AuthGeneration => genRef.current, []);
  /** 응답이 아직 유효한가. 무효면 호출부는 아무것도 하지 않는다. */
  const fresh = useCallback(
    (captured: AuthGeneration, profileId: string | null) => canApplyProfile(captured, genRef.current, profileId),
    [],
  );

  const applyProfileWithDailyPoint = useCallback((profile: User | null, captured: AuthGeneration): string | null => {
    // ⚠ A04: 그 사이 로그아웃했거나 다른 계정이 들어왔으면 **아무것도 하지 않는다.**
    //   특히 아래 제재 분기 — 낡은 프로필의 제재 판정이 지금 로그인한 다른 사람을 쫓아내던 경로다.
    if (!fresh(captured, profile?.id ?? null)) return null;

    // 탈퇴·영구정지·임시정지 계정은 로그인 차단 — 세션을 즉시 종료하고 진입 거부.
    // (서버도 제재 계정의 글·후기·매물 작성을 트리거로 막지만, 클라에서도 즉시 로그아웃해 오해 없게 한다.)
    const sanction = profile ? sanctionMessage(profile) : null;
    if (sanction) {
      genRef.current = withSignedOut(genRef.current);   // 진행 중인 조회도 함께 끊는다
      apiSignOut().catch(() => {});
      setUser(null);
      setLoading(false);
      return sanction;   // 로그인 경로가 이 문장을 그대로 사용자에게 보여준다
    }

    // 여기서 계정이 확정된다. 부팅 첫 조회는 uid 를 모른 채 나갔으므로 이 시점에 채운다
    // (세대는 오르지 않는다 — 올리면 바로 이 응답이 버려져 자동 로그인이 화면에 안 뜬다).
    if (profile) genRef.current = withOwner(genRef.current, profile.id);

    // 🔴 startTransition (2026-09-18 실측): 로그인 성공 프레임에서 setUser 전역 재렌더 +
    //   토스트 + 헤더 클러스터 교체가 **한 배치**로 들어가 CPU 6x 에서 LoAF 161ms · rAF 공백 167ms 였다
    //   (오너: "갑자기 드득 하면서"). 트랜지션으로 감싸면 그 재렌더가 시분할돼 성공 애니메이션이 안 멈춘다.
    //   ⚠ 아래 제재(sanction) 동기 판정 흐름은 그대로 둔다.
    // 🔴 2026-09-26: 로딩 해제도 **같은 트랜지션**에서 한다. 밖(기본 레인)에서 풀면 React 가 그것을 먼저 커밋해
    //   '로딩 끝 · 사용자 없음' 커밋이 한 번 생기고, 그 커밋의 effect 가 로그인된 사람을 비로그인으로 확정했다 —
    //   로그인된 손님의 `?checkin=` 에 로그인 창, 로딩 중 누른 GTO 도구가 로그인 창으로(e2e/auth-boot-gap.spec.ts G1·G3).
    //   여기서 풀므로 **어느 경로가 계정을 확정하든**(부팅 조회·onAuthStateChange·login) 로딩이 user 와 함께 풀린다.
    startTransition(() => { setUser((prev) => keepIfSame(prev, profile)); setLoading(false); });
    if (!profile) return null;

    const pointStamp = genRef.current;
    claimDailyLoginPoint()
      .then((pts) => {
        if (typeof pts !== 'number') return;
        if (!fresh(pointStamp, profile.id)) return;     // 로그아웃·계정 전환 뒤 도착한 적립 결과
        setUser((prev) => (prev && prev.id === profile.id ? keepIfSame(prev, { ...prev, activityPoints: pts }) : prev));
      })
      .catch(() => {});
    return null; // 제재 없음 — 로그인 경로가 그대로 진행한다
  }, [fresh]);

  // ── 초기화: 세션 복원 + 변경 구독 ────────────────────────────────────────────
  useEffect(() => {
    if (IS_MOCK) { setLoading(false); return; }

    // 부팅 프로필 조회 - 실패하면 한 번만 다시 시도한다(2026-09-11).
    //   왜: 세션은 저장소에 있는데 첫 요청이 깨지면 화면만 비로그인이 되고, 사용자는 그걸
    //   '자동 로그인이 안 됐다' 로 읽는다. 두 번째도 실패하면 조용히 비로그인으로 둔다 -
    //   여기서 user 를 null 로 덮지는 않는다(getMyProfile 이 이제 실패를 던지므로 catch 로 온다).
    // ⚠ A01(2026-09-12): 이제 **세션 조회 실패**도 여기로 온다(`currentUserStrict` 가 던진다).
    //   예전엔 세션을 못 읽으면 null 이 돼 `.then` 의 성공 분기로 들어가 **재시도 없이** 비로그인이 됐다.
    //   지하 매장 LTE·앱 복귀 직후처럼 첫 요청이 잘 깨지는 환경에서 '자동 로그인이 안 됐다' 로 보이던 것.
    //   실패해도 **user 를 null 로 덮지 않는다** — 기존 상태를 유지한 채 다시 시도한다.
    let cancelled = false;
    // ⚠ A04: 재시도는 **타이머로 예약**되므로 unmount 만으로는 끊기지 않는다. id 를 들고 있다가 정리한다.
    let retryTimer: number | undefined;
    const bootProfile = (attempt: number, captured: AuthGeneration) => {
      if (cancelled) return;
      getMyProfile()
        .then((profile) => {
          if (cancelled) return;
          // 세대가 바뀌었으면(로그아웃·다른 계정 로그인) 이 응답은 버린다. 로딩도 그쪽 경로가 푼다
          //   (SIGNED_OUT 핸들러 · login/onAuthStateChange 의 applyProfileWithDailyPoint).
          if (!fresh(captured, profile?.id ?? null)) return;
          applyProfileWithDailyPoint(profile, captured);   // user 와 로딩을 한 트랜지션으로 확정한다
        })
        .catch(() => {
          if (cancelled) return;
          if (!fresh(captured, null)) { startTransition(() => setLoading(false)); return; }
          // 두 번까지 더 시도한다(1.2초·3초). 그 뒤엔 로딩만 풀고 **세션은 지우지 않는다** —
          // 토큰이 살아 있으면 다음 요청·탭 복귀·onAuthStateChange 가 회복시킨다.
          if (attempt < 2) {
            retryTimer = window.setTimeout(() => bootProfile(attempt + 1, captured), attempt === 0 ? 1200 : 3000);
            return;
          }
          startTransition(() => setLoading(false));
        });
    };
    bootProfile(0, stamp());

    // ⚠️ onAuthStateChange 콜백 내부에서 supabase를 await하면 GoTrue 락 데드락 →
    //    로그인이 "로그인 중..."에서 무한 대기. 콜백은 동기로만 두고
    //    프로필 조회는 setTimeout(0)로 분리 실행해 락을 먼저 해제한다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // ⚠ A04: 세대를 먼저 올린다. 이미 날아간 조회들이 여기서 전부 무효가 된다.
        genRef.current = withSignedOut(genRef.current);
        setUser(null);
        // 🔴 2026-09-26: 부팅 중 SIGNED_OUT(만료 세션의 갱신 거부)이면 위 부팅 조회 응답은 세대가 달라 버려진다.
        //   여기서 풀지 않으면 로딩이 **영원히** 참이라 QR·알림 링크·도구 대기 의도가 전부 멈췄다(auth-boot-gap G4).
        setLoading(false);
      } else if (session?.user) {
        // 계정이 **바뀌었을 때만** 세대가 오른다(같은 계정의 TOKEN_REFRESHED 는 무효화가 아니다).
        genRef.current = withOwner(genRef.current, session.user.id);
        const captured = genRef.current;
        setTimeout(() => {
          getMyProfile()
            .then((p) => { applyProfileWithDailyPoint(p, captured); })
            .catch(() => {});
        }, 0);
      }
    });

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      subscription.unsubscribe();
    };
  }, [applyProfileWithDailyPoint, fresh, stamp]);

  // ── 로그인 / 로그아웃 ────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string, keepSignedIn?: boolean) => {
    const u = await signIn(email, password, keepSignedIn);
    // ⚠ A04: **여기서** 계정을 확정한다. 이 로그인이 이전 계정을 밀어냈다면 세대가 올라
    //   이전 계정의 in-flight 조회가 전부 무효가 되고, 뒤따라 오는 SIGNED_IN 이벤트는
    //   같은 uid 라 세대를 다시 올리지 않는다(= 방금 한 로그인이 스스로에게 버려지지 않는다).
    if (u) genRef.current = withOwner(genRef.current, u.id);
    const captured = genRef.current;
    // 제재 계정이면 여기서 던진다 — AuthModal 의 catch 가 사유를 그대로 보여주고 성공 토스트도 뜨지 않는다.
    const sanction = applyProfileWithDailyPoint(u, captured);
    if (sanction) {
      // name 으로 표식을 남긴다 — AuthModal 의 catch 가 자격증명 오류로 뭉개지 않고 이 문장을 그대로 보여준다.
      const e = new Error(sanction); e.name = 'SanctionError'; throw e;
    }
  }, [applyProfileWithDailyPoint]);

  const logout = useCallback(async () => {
    // ⚠ A04: 세대를 **먼저** 올린다. signOut 응답을 기다리는 동안 도착하는 조회까지 끊어야
    //   '로그아웃했는데 잠깐 다시 로그인 상태' 가 한 프레임도 생기지 않는다.
    genRef.current = withSignedOut(genRef.current);
    setUser(null);
    await apiSignOut();
  }, []);

  // ── 프로필 수정 / 비밀번호 변경 ──────────────────────────────────────────────
  const updateProfile = useCallback(async (patch: ProfilePatch) => {
    const captured = stamp();
    const updated = await updateMyProfile(patch);
    if (!fresh(captured, updated?.id ?? null)) return;   // 저장 중 로그아웃·계정 전환
    setUser((prev) => keepIfSame(prev, updated));
  }, [stamp, fresh]);

  const changePassword = useCallback(async (currentPw: string, newPw: string) => {
    await changeMyPassword(currentPw, newPw);
  }, []);

  const refreshProfile = useCallback(async () => {
    const captured = stamp();
    const next = await getMyProfile();
    if (!fresh(captured, next?.id ?? null)) return;      // 조회 중 로그아웃·계정 전환
    setUser((prev) => keepIfSame(prev, next));
  }, [stamp, fresh]);

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
