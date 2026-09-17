// src/lib/useDelayedUnmount.ts — 오버레이가 **퇴장 애니메이션을 마치고** 사라지게 한다.
//
// ── 왜 필요한가 (2026-09-18 실측) ────────────────────────────────────────────
// 오너 리포트: "로그인하면 부드럽게 화면으로 돌아가는 게 아니라 갑자기 드득 하면서
//   잠깐 떠 있다가 로그인 화면이 없어지는 것이 명확해"
//
// `Modal.tsx` 는 이미 퇴장을 갖고 있다 — `open` 이 false 가 되면 `closing` 을 켜고 200ms 뒤에
// 렌더를 멈춘다(slide-down). 그런데 App 의 오버레이들은 전부 이렇게 쓰고 있었다:
//
//     {authOpen && <AuthModal open onClose={() => setAuthOpen(false)} />}
//                          ^^^^ 항상 true
//
// `open` 이 **한 번도 false 가 되지 않고** 부모가 통째로 언마운트해 버리므로,
// Modal 의 slide-down 이 **단 한 프레임도 돌지 않는다.** 실측: 성공 → 소실이 **0ms**,
// 한 프레임에 `animation: sheet-up` → 없음. 반대 대조군(약관 시트처럼 `open` 이 실제로
// false 가 되는 곳)은 slide-down 이 정상으로 돈다(220ms, translateY 0 → 742px).
// 이 lazy 오버레이 조립법은 App.tsx 에 14곳이 같은 모양으로 있다 — 전부 퇴장이 죽어 있었다.
//
// ── 쓰는 법 ─────────────────────────────────────────────────────────────────
//     const authMounted = useDelayedUnmount(authOpen);
//     {authMounted && <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />}
//                              ^^^^^^^^^^^^^^^ 진짜 상태를 넘겨야 퇴장이 돈다
//
// ⚠ `open` 에 리터럴 `true` 를 넘기면 이 훅을 써도 소용없다. 반드시 상태를 그대로 넘겨라.
// ⚠ 기본 220ms 는 `Modal.tsx` 의 200ms 타이머 + 여유 20ms 다. Modal 쪽을 바꾸면 여기도 같이 바꿔라
//   (둘이 어긋나면 화면에서 사라진 뒤에도 DOM 이 남거나, 반대로 애니메이션이 중간에 잘린다).
import { useEffect, useRef, useState } from 'react';

/**
 * `open` 이 true 가 되면 즉시 true, false 가 되면 `ms` 뒤에 false.
 * 닫히는 도중 다시 열리면 예약된 언마운트를 취소한다(빠른 토글에서 화면이 사라지지 않게).
 */
export function useDelayedUnmount(open: boolean, ms = 220): boolean {
  const [mounted, setMounted] = useState(open);
  const timer = useRef(0);

  useEffect(() => {
    if (open) {
      if (timer.current) { window.clearTimeout(timer.current); timer.current = 0; }
      setMounted(true);
      return;
    }
    if (!mounted) return;                       // 이미 내려가 있으면 타이머를 새로 걸지 않는다
    timer.current = window.setTimeout(() => { timer.current = 0; setMounted(false); }, ms);
    return () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = 0; } };
  }, [open, ms, mounted]);

  // 언마운트 시 남은 타이머 정리 — setState 경고(사라진 컴포넌트에 상태 갱신)를 막는다
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return mounted;
}
