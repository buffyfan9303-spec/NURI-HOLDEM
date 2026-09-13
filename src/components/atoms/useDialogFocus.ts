import { useEffect } from 'react';

/**
 * 대화상자(다이얼로그) 공용 focus 계약 — Modal.tsx 의 sheet/center/page 변형이 쓰던 로직을
 * 그대로 뽑아낸 것이다(U06, 2026-09-12). VenuePage·GroupPage 처럼 Modal 을 쓰지 않는
 * 풀스크린 오버레이도 **같은 계약**을 쓰게 하려고 공유 훅으로 옮겼다 — 새로 만들지 않는다.
 *
 * 계약(불변):
 *  ① 열릴 때 콘텐츠 안 첫 포커스 가능 요소(없으면 컨테이너 자체)로 포커스 이동
 *  ② Tab/Shift+Tab 은 콘텐츠 안에서만 순환(트랩)
 *  ③ Tab 이 아닌 경로로 포커스가 밖으로 새면(배경 클릭·프로그램 focus() 등) 즉시 되잡는다 —
 *     '탭 순서'가 아니라 '실제로 포커스가 어디 있는가'를 본다.
 *  ④ 열린 다이얼로그가 여러 겹이면 **맨 위 하나만** 포커스를 되잡는다(부모가 자식 포커스를 뺏지 않음).
 *  ⑤ 닫히면 열기 직전 포커스였던 요소로 되돌린다(키보드·스크린리더 사용자가 자기 위치를 잃지 않게).
 */

/** 지금 열려 있는 다이얼로그의 콘텐츠 요소 스택 — 마지막이 맨 위. Modal·VenuePage·GroupPage 가 공유한다. */
const openDialogs: HTMLElement[] = [];

/**
 * @param active 이 다이얼로그가 열려 있고(포커스를 잡아야 하고) 콘텐츠가 이미 마운트돼 있는가.
 *   Modal 처럼 열림 커밋과 콘텐츠 마운트 커밋이 한 프레임 차이 나는 경우, 두 조건을 미리 합쳐서 넘긴다.
 * @param contentRef 트랩 대상 컨테이너(다이얼로그 루트 또는 그 안쪽 스크롤 영역).
 */
export function useDialogFocus(active: boolean, contentRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const el = contentRef.current;
    if (!el) return;

    // 열기 직전에 포커스가 있던 곳을 기억한다. 닫을 때 여기로 돌려보내지 않으면
    // 포커스가 문서 맨 앞(BODY)으로 튀어, 방금 누른 카드로 못 돌아간다.
    const opener = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(
      el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),
    ).filter((n) => n.offsetParent !== null);

    // 열린 다이얼로그 스택 — 포커스를 되잡는 것은 맨 위 하나뿐이다.
    // 부모 위에 자식(글쓰기 시트·약관 시트 등)이 뜨면 자식 DOM 은 부모 el 밖이라,
    // 부모가 "밖으로 샜다"고 보고 자식의 첫 포커스·Tab·Space 를 매번 빼앗아 가면 안 된다.
    openDialogs.push(el);
    const isTop = () => openDialogs[openDialogs.length - 1] === el;
    const t = window.setTimeout(() => { if (isTop()) (focusables()[0] ?? el).focus(); }, 50);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', onKey);

    // ⚠ Tab 키만 막는 건 반쪽짜리다. 포커스는 Tab 말고도 새는 길이 많다 —
    //   배경 요소 클릭, ESC 가 흘려보내는 BODY 복귀, 스크린리더 가상 커서 이동,
    //   모달 밖 요소가 자기 자신에게 focus() 를 거는 경우 등.
    //   그래서 '탭 순서'가 아니라 '실제로 포커스가 어디에 들어왔는가'를 보고 되잡는다.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (!target || el.contains(target)) return;
      if (!isTop()) return; // 위에 다른 다이얼로그가 열려 있으면 그쪽 포커스다 — 뺏지 않는다
      (focusables()[0] ?? el).focus();
    };
    document.addEventListener('focusin', onFocusIn);

    // ⚠ focusin 만으로는 반쪽이다 — **포커스가 BODY 로 떨어지는 경로는 focusin 을 만들지 않는다.**
    //   BODY 는 기본적으로 포커스 대상이 아니라서, 포커스가 그리로 흘러내릴 때 아무 이벤트도 안 온다.
    //   그런 경로: 포커스된 요소가 DOM 에서 제거됨 · 위에 떠 있던 다이얼로그가 닫히며 BODY 로 복원 ·
    //   ESC 가 흘려보내는 BODY 복귀.
    //   2026-09-12 실측: 딥링크(`/?v=<id>`)로 매장 페이지를 열면 그 위에 공지 모달이 떴다 닫히면서
    //   포커스가 BODY 로 떨어졌고, focusin 이 안 와서 되잡지 못했다 — 계약 ③ 이 지켜지지 않았다.
    const onFocusOut = () => {
      // focusout 시점의 activeElement 는 아직 옛 값이라 다음 틱에 본다.
      window.setTimeout(() => {
        if (!isTop() || !document.contains(el)) return;
        const a = document.activeElement;
        if (a && a !== document.body && a !== document.documentElement) return;
        (focusables()[0] ?? el).focus();
      }, 0);
    };
    document.addEventListener('focusout', onFocusOut);

    return () => {
      window.clearTimeout(t);
      el.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      const i = openDialogs.lastIndexOf(el);
      if (i >= 0) openDialogs.splice(i, 1);

      // 되돌리는 순간의 focusin 이 위 가드에 걸리지 않도록 **리스너 해제 뒤에** 실행한다.
      const usable = opener
        && opener !== document.body
        && opener !== document.documentElement
        && document.contains(opener);
      if (usable) {
        try { (opener as HTMLElement).focus({ preventScroll: true }); return; } catch { /* 포커스 불가 */ }
      }

      // ⚠ 열기 직전 포커스가 **BODY 였던 경우**(딥링크·공유 링크로 바로 열린 화면)에는
      //   돌려보낼 곳이 없다. `body.focus()` 는 아무 일도 하지 않아 포커스가 허공에 남고,
      //   키보드 사용자는 Tab 을 눌러 문서 맨 앞부터 다시 훑어야 한다.
      //   그래서 **뒤에 남는 화면의 첫 조작 요소**로 보낸다 — 자기 위치를 잃지 않게.
      const next = Array.from(document.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )).find((n) => n.offsetParent !== null && !el.contains(n));
      try { next?.focus({ preventScroll: true }); } catch { /* 포커스 불가 요소 무시 */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/** Modal.tsx 등이 스택 상태를 직접 참조해야 할 때(현재는 없음 — 필요해지면 여기로). */
export function isTopDialog(el: HTMLElement | null): boolean {
  if (!el) return false;
  return openDialogs[openDialogs.length - 1] === el;
}

// 테스트 훅 — vitest 에서 모듈 간 스택 격리를 확인할 때만 쓴다.
export const __internal = { openDialogs };
