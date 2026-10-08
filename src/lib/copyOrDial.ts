// 전화번호 칩 '탭 = 복사 우선, 복사 불가면 전화 걸기' (UP-14, 2026-10-08).
//
// 왜: 예전 onClick 은 `await clipboard.writeText()` **뒤에** e.preventDefault() 를 불렀다.
//   await 뒤는 이미 클릭 이벤트 디스패치가 끝난 시점이라 preventDefault 가 아무 효과가 없고,
//   tel: 이 언제나 실행됐다(복사도 같이 됨). 기본 동작은 **동기적으로** 막아야 한다.
//   → 클립보드 API 가 있으면 즉시 막고 복사를 시도한다. 복사가 거부되면(인앱 브라우저 등) 그때 tel: 로 보낸다.
//   클립보드 API 자체가 없으면(비-보안 컨텍스트) 막지 않아 tel: 기본 동작이 그대로 실행된다.

export interface CopyOrDialDeps {
  clipboard?: { writeText(text: string): Promise<void> } | null;
  dial: (href: string) => void;
}

export function copyOrDial(
  e: { preventDefault(): void },
  text: string,
  href: string,
  onCopied: () => void,
  deps: CopyOrDialDeps,
): Promise<void> | void {
  const cb = deps.clipboard;
  if (!cb || typeof cb.writeText !== 'function') return; // 기본 동작(tel:) 그대로
  e.preventDefault();
  return cb.writeText(text).then(onCopied, () => deps.dial(href));
}

/** 브라우저 기본 의존성 — 컴포넌트에서 쓴다. */
export function browserCopyDeps(): CopyOrDialDeps {
  return {
    clipboard: typeof navigator !== 'undefined' ? navigator.clipboard ?? null : null,
    dial: (href) => { window.location.href = href; },
  };
}
