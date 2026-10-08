// 전화번호 칩 '탭 = 번호 복사 + 전화 걸기' (UP-14, 2026-10-08 — 검증 지적 반영).
//
// 운영 동작: 칩을 탭하면 번호가 복사되고(토스트) tel: 로 전화도 걸린다. 추가 번호·라벨 번호는
//   이 칩이 '한 번에 전화 걸기'의 유일한 경로다(PhoneActionButton 은 첫 번호만, GroupPage 는 '/' 로 이은 문자열).
//   그래서 기본 동작(tel:)은 **절대 막지 않는다** — 복사만 하고 전화를 막으면 모바일에서 기능이 사라진다.
//   (복사 전용으로 바꾸는 것은 리드/오너 결정 사항이며 기록된 결정이 없다.)
// 예전 코드의 `await writeText(); e.preventDefault()` 는 효과 없는 죽은 호출이었다 — 제거하고 의도를 명시한다.
// 복사가 거부되거나 끝나지 않아도(인앱 웹뷰) tel: 은 이미 기본 동작으로 실행되므로 추가 다이얼은 하지 않는다.

export interface CopyOrDialDeps {
  clipboard?: { writeText(text: string): Promise<void> } | null;
  /** 남겨 둔 주입점 — 현재 경로에서는 부르지 않는다(이중 다이얼 방지). */
  dial: (href: string) => void;
}

export function copyOrDial(
  _e: { preventDefault(): void },
  text: string,
  _href: string,
  onCopied: () => void,
  deps: CopyOrDialDeps,
): Promise<void> | void {
  const cb = deps.clipboard;
  if (!cb || typeof cb.writeText !== 'function') return; // 복사 불가 — tel: 기본 동작만
  // 클릭 디스패치 안에서 동기로 시작해야 사용자 활성화가 살아 있다. 실패는 조용히 무시(전화는 이미 걸림).
  return cb.writeText(text).then(onCopied, () => {});
}

/** 브라우저 기본 의존성 — 컴포넌트에서 쓴다. */
export function browserCopyDeps(): CopyOrDialDeps {
  return {
    clipboard: typeof navigator !== 'undefined' ? navigator.clipboard ?? null : null,
    dial: (href) => { window.location.href = href; },
  };
}
